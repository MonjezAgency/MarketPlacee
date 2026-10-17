import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { casesForItem, supplierLineValue } from './stock-ledger';
import { isRealImage } from './catalog-rules';
import { ReportRangeError, resolveRange, type ResolvedRange } from './report-range';
import { LEGACY_CONFIRMED, AWAITING_SUPPLIER_STATUSES, attentionCounts, awaitingSupplier, inventoryHealth, saleRecognizedAt, salesSummary, type SaleLine } from './supplier-metrics';

/**
 * Supplier Overview (GET /supplier-catalog/overview). Read-only aggregation of
 * the supplier's own records; definitions live in supplier-metrics.ts and
 * report-range.ts and are repeated in the page's "How is this calculated?".
 *
 * Financial figures the platform does NOT record for suppliers are returned as
 * `tracked: false` (never estimated from order values):
 *  • Amount received / payouts — no settlement or payout record exists
 *    (EscrowTransaction is never released, FinancialAuditLog PAYOUT_SENT is
 *    never written, Order.supplierId is never set). See ORDER_PAYMENT_REFUND_GAPS §4, §16.
 *  • Outstanding settlements — same dependency.
 *  • Refunds / deductions — no refund or deduction record (§6; REFUND_ISSUED is never written).
 *  • Net earnings — supplier prices are already net (the Atlantis margin is
 *    added on top of them for buyers); with no recorded deductions there is no
 *    second figure to show, so it isn't shown separately from gross sales.
 */
const img = (images: unknown) => (Array.isArray(images) ? images.find((x) => isRealImage(x) && /^https?:/i.test(String(x))) ?? null : null) as string | null;

@Injectable()
export class SupplierOverviewService {
    constructor(private readonly prisma: PrismaService) {}

    private range(q: { range?: string; from?: string; to?: string; tz?: string }, now: Date): ResolvedRange {
        try {
            return resolveRange(q, now);
        } catch (e) {
            if (e instanceof ReportRangeError) throw new BadRequestException({ code: e.code, message: e.message });
            throw e;
        }
    }

    /** The supplier's lines on eligible orders recognised in [from, to). */
    private async saleLines(supplierId: string, from: Date, to: Date): Promise<SaleLine[]> {
        const lineSelect = {
            orderId: true, productId: true, quantity: true, supplierUnitPrice: true, stockCases: true, selectedTier: true, mixComposition: true, mixedLoadId: true, productNameSnapshot: true,
            product: { select: { name: true, images: true, basePrice: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true } },
        };
        const [workflow, legacy] = await Promise.all([
            this.prisma.orderItem.findMany({
                where: { product: { supplierId }, order: { reviewStatus: 'APPROVED', status: { not: 'CANCELLED' as any }, reviewedAt: { gte: from, lt: to } } },
                select: { ...lineSelect, order: { select: { status: true, reviewStatus: true, reviewedAt: true, createdAt: true } } },
            }),
            this.prisma.orderItem.findMany({
                where: { product: { supplierId }, order: { reviewStatus: 'LEGACY', status: { in: [...LEGACY_CONFIRMED] as any }, createdAt: { lt: to } } },
                select: {
                    ...lineSelect,
                    order: { select: { status: true, reviewStatus: true, reviewedAt: true, createdAt: true, history: { where: { newStatus: { in: [...LEGACY_CONFIRMED] as any } }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } } } },
                },
            }),
        ]);
        const out: SaleLine[] = [];
        for (const r of [...workflow, ...legacy] as any[]) {
            if (!r.productId) continue;
            const at = saleRecognizedAt({ ...r.order, firstConfirmedAt: r.order.history?.[0]?.createdAt ?? null });
            if (!at || at < from || at >= to) continue;
            const v = supplierLineValue(r);
            out.push({ orderId: r.orderId, productId: r.productId, name: r.product?.name || r.productNameSnapshot || '', image: img(r.product?.images), value: v.total, estimated: v.estimated, cases: casesForItem({ ...r, order: { status: r.order.status } }), recognizedAt: at });
        }
        return out;
    }

    /** Orders waiting for this supplier's decision right now. */
    async awaitingCount(supplierId: string, now = new Date()): Promise<number> {
        const orders = await this.prisma.order.findMany({
            where: { status: { in: [...AWAITING_SUPPLIER_STATUSES] as any }, items: { some: { product: { supplierId } } } },
            select: { status: true, reviewStatus: true, termsVersion: true, confirmations: { where: { supplierId }, select: { termsVersion: true, status: true, deadline: true } } },
        });
        return orders.filter((o: any) => awaitingSupplier(o, now)).length;
    }

    /** Light counts for the navigation badges. */
    async attention(supplierId: string) {
        const [byStatus, ordersAwaiting] = await Promise.all([
            this.prisma.product.groupBy({ by: ['status'], where: { supplierId, status: { in: ['DRAFT', 'REJECTED', 'NEEDS_CHANGES'] as any } }, _count: { _all: true } }),
            this.awaitingCount(supplierId),
        ]);
        const counts: Record<string, number> = {};
        for (const g of byStatus as any[]) counts[g.status] = g._count._all;
        return { products: attentionCounts(counts), ordersAwaiting, asOf: new Date().toISOString() };
    }

    async overview(supplierId: string, q: { range?: string; from?: string; to?: string; tz?: string } = {}, now = new Date()) {
        const range = this.range(q, now);
        const { start, end } = range;

        const [lines, awaiting, products, recentCount, recentRaw, stockCount, stockRaw] = await Promise.all([
            this.saleLines(supplierId, range.previous.start, end),
            this.awaitingCount(supplierId, now),
            this.prisma.product.findMany({
                where: { supplierId },
                select: { id: true, status: true, name: true, brand: true, category: true, ean: true, origin: true, exwLocation: true, weight: true, basePrice: true, price: true, stock: true, unit: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true, moq: true, moqUnit: true, images: true },
            }),
            this.prisma.order.count({ where: { createdAt: { gte: start, lt: end }, items: { some: { product: { supplierId } } } } }),
            this.prisma.order.findMany({
                where: { createdAt: { gte: start, lt: end }, items: { some: { product: { supplierId } } } }, orderBy: { createdAt: 'desc' }, take: 6,
                select: { id: true, status: true, reviewStatus: true, createdAt: true, items: { where: { product: { supplierId } }, select: { quantity: true, supplierUnitPrice: true, selectedTier: true, stockCases: true, mixComposition: true, mixedLoadId: true, product: { select: { basePrice: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true } } } } },
            }),
            this.prisma.productChangeLog.count({ where: { field: 'stock', createdAt: { gte: start, lt: end }, product: { supplierId } } }),
            this.prisma.productChangeLog.findMany({
                where: { field: 'stock', createdAt: { gte: start, lt: end }, product: { supplierId } }, orderBy: { createdAt: 'desc' }, take: 5,
                select: { id: true, oldValue: true, newValue: true, createdAt: true, product: { select: { id: true, name: true } } },
            }),
        ]);

        const sales = salesSummary(lines, range);
        const health = inventoryHealth(products);
        const iso = (d: Date) => d.toISOString();

        return {
            generatedAt: iso(now),
            range: {
                preset: range.preset, timeZone: range.timeZone, from: range.fromDay, to: range.toDay, days: range.days,
                start: iso(start), end: iso(end), granularity: range.granularity,
                previous: { from: range.previous.fromDay, to: range.previous.toDay, start: iso(range.previous.start), end: iso(range.previous.end) },
            },
            currency: 'EUR',
            financial: {
                grossSales: { value: sales.current.sales, previous: sales.previous.sales, change: sales.change.sales, orders: sales.current.orders, previousOrders: sales.previous.orders, cases: sales.current.cases, estimated: sales.current.estimated },
                netEarnings: { tracked: false },
                received: { tracked: false },
                outstanding: { tracked: false },
                refunds: { tracked: false },
            },
            orders: {
                awaitingConfirmation: awaiting,
                recent: {
                    count: recentCount,
                    items: recentRaw.map((o: any) => ({
                        id: o.id, status: o.status, reviewStatus: o.reviewStatus, createdAt: o.createdAt, lines: o.items.length,
                        cases: o.items.reduce((s: number, i: any) => s + casesForItem({ ...i, order: { status: o.status } }), 0),
                        value: Math.round(o.items.reduce((s: number, i: any) => s + supplierLineValue(i).total, 0) * 100) / 100,
                    })),
                },
                series: sales.series,
                top: sales.top,
            },
            inventory: {
                ...health,
                stockChanges: {
                    count: stockCount,
                    items: stockRaw.map((c: any) => ({ id: c.id, productId: c.product?.id, name: c.product?.name, from: c.oldValue, to: c.newValue, at: c.createdAt })),
                },
            },
        };
    }
}
