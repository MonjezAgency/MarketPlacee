import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { casesForItem } from './stock-ledger';
import { missingForPublish } from './catalog-rules';

/**
 * Supplier Business Overview — every figure comes from order lines of the
 * supplier's own products. Definitions (also shown in the UI):
 *
 *  • Sales     = Σ (line price × quantity) of the supplier's lines on CONFIRMED
 *                orders (PAID, PROCESSING, SHIPPED, DELIVERED) placed in the
 *                period. Buyer prices, EUR. Pending (unconfirmed) and
 *                cancelled orders are excluded.
 *  • Orders    = distinct orders placed in the period containing the
 *                supplier's products, excluding cancelled ones.
 *  • Cases sold = cases on those confirmed lines (pallet lines × cases/pallet…).
 *  • Best-selling = most cases sold in the period, ties broken by sales value.
 *  • Dates are UTC days. The comparison period is the same length, immediately before.
 * Mixed pallets / trucks combining several products are not attributed per product.
 */
export const CONFIRMED = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const DAY = 86_400_000;

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

@Injectable()
export class SupplierOverviewService {
    constructor(private readonly prisma: PrismaService) {}

    private async lines(supplierId: string, from: Date, to: Date) {
        return this.prisma.orderItem.findMany({
            where: { product: { supplierId }, order: { createdAt: { gte: from, lt: to } } },
            select: {
                orderId: true, productId: true, quantity: true, price: true, stockCases: true, selectedTier: true, mixComposition: true, mixedLoadId: true,
                productNameSnapshot: true,
                order: { select: { status: true, createdAt: true } },
                product: { select: { name: true, images: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true } },
            },
        });
    }

    private summarise(rows: any[]) {
        const confirmed = rows.filter((r) => CONFIRMED.includes(r.order.status));
        const sales = confirmed.reduce((s, r) => s + r.price * r.quantity, 0);
        const cases = confirmed.reduce((s, r) => s + casesForItem(r), 0);
        const orders = new Set(rows.filter((r) => r.order.status !== 'CANCELLED').map((r) => r.orderId)).size;
        const confirmedOrders = new Set(confirmed.map((r) => r.orderId)).size;
        return { sales: Math.round(sales * 100) / 100, cases, orders, confirmedOrders };
    }

    async overview(supplierId: string, fromIn?: string, toIn?: string) {
        const now = new Date();
        const to = toIn ? new Date(utcDay(new Date(toIn)).getTime() + DAY) : new Date(utcDay(now).getTime() + DAY); // exclusive
        const from = fromIn ? utcDay(new Date(fromIn)) : new Date(to.getTime() - 30 * DAY);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new BadRequestException('Invalid date range.');
        if (to.getTime() - from.getTime() > 731 * DAY) throw new BadRequestException('Choose a range of two years or less.');
        const span = to.getTime() - from.getTime();
        const prevFrom = new Date(from.getTime() - span);

        const [cur, prev] = await Promise.all([this.lines(supplierId, from, to), this.lines(supplierId, prevFrom, from)]);
        const totals = this.summarise(cur);
        const previous = this.summarise(prev);

        // Revenue series, zero-filled: days up to ~3 months, months beyond.
        const monthly = span > 92 * DAY;
        const key = (d: Date) => (monthly ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10));
        const series: { date: string; sales: number; orders: number }[] = [];
        const idx = new Map<string, number>();
        for (let d = new Date(from); d < to; d = monthly ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) : new Date(d.getTime() + DAY)) {
            const k = key(d);
            if (!idx.has(k)) { idx.set(k, series.length); series.push({ date: k, sales: 0, orders: 0 }); }
        }
        const seen = new Set<string>();
        for (const r of cur) {
            if (!CONFIRMED.includes(r.order.status)) continue;
            const i = idx.get(key(new Date(r.order.createdAt)));
            if (i === undefined) continue;
            series[i].sales = Math.round((series[i].sales + r.price * r.quantity) * 100) / 100;
            const ok = `${i}:${r.orderId}`;
            if (!seen.has(ok)) { seen.add(ok); series[i].orders++; }
        }

        // Top 5 by cases sold.
        const byProduct = new Map<string, { productId: string; name: string; image: string | null; cases: number; sales: number; orders: Set<string> }>();
        for (const r of cur) {
            if (!CONFIRMED.includes(r.order.status) || !r.productId) continue;
            const e = byProduct.get(r.productId) || { productId: r.productId, name: r.product?.name || r.productNameSnapshot || 'Product', image: r.product?.images?.find((x: string) => /^https?:/.test(x)) || null, cases: 0, sales: 0, orders: new Set<string>() };
            e.cases += casesForItem(r); e.sales += r.price * r.quantity; e.orders.add(r.orderId);
            byProduct.set(r.productId, e);
        }
        const top = [...byProduct.values()].sort((a, b) => b.cases - a.cases || b.sales - a.sales).slice(0, 5)
            .map((e) => ({ productId: e.productId, name: e.name, image: e.image, cases: e.cases, sales: Math.round(e.sales * 100) / 100, orders: e.orders.size }));

        // Catalog state + things that need the supplier (not date-bound).
        const [byStatus, awaiting, live] = await Promise.all([
            this.prisma.product.groupBy({ by: ['status'], where: { supplierId }, _count: { _all: true } }),
            this.prisma.order.count({ where: { status: { in: ['PENDING', 'PAID'] as any }, items: { some: { product: { supplierId } } } } }),
            this.prisma.product.findMany({ where: { supplierId, status: 'APPROVED' }, select: { id: true, name: true, brand: true, category: true, ean: true, origin: true, exwLocation: true, weight: true, basePrice: true, price: true, stock: true, unitsPerCase: true, moq: true, moqUnit: true, images: true } }),
        ]);
        const count = (s: string) => (byStatus as any[]).find((g) => g.status === s)?._count._all ?? 0;
        const outOfStock = live.filter((p) => (p.stock ?? 0) <= 0).length;
        const liveIncomplete = live.filter((p) => missingForPublish(p).length > 0).length;
        const attention = [
            awaiting && { id: 'orders', tone: 'warning', count: awaiting, label: `${awaiting} order${awaiting === 1 ? '' : 's'} waiting for your confirmation`, href: '/supplier/orders?view=action' },
            count('NEEDS_CHANGES') && { id: 'changes', tone: 'warning', count: count('NEEDS_CHANGES'), label: `${count('NEEDS_CHANGES')} product${count('NEEDS_CHANGES') === 1 ? '' : 's'} need changes requested by Atlantis`, href: '/supplier/products?status=NEEDS_CHANGES' },
            count('DRAFT') && { id: 'drafts', tone: 'neutral', count: count('DRAFT'), label: `${count('DRAFT')} draft${count('DRAFT') === 1 ? '' : 's'} not yet submitted`, href: '/supplier/products?status=DRAFT' },
            outOfStock && { id: 'stock', tone: 'danger', count: outOfStock, label: `${outOfStock} live product${outOfStock === 1 ? ' is' : 's are'} out of stock`, href: '/supplier/products?stock=out' },
            liveIncomplete && { id: 'incomplete', tone: 'warning', count: liveIncomplete, label: `${liveIncomplete} live product${liveIncomplete === 1 ? ' is' : 's are'} missing required details`, href: '/supplier/products?status=APPROVED' },
            count('REJECTED') && { id: 'rejected', tone: 'danger', count: count('REJECTED'), label: `${count('REJECTED')} rejected listing${count('REJECTED') === 1 ? '' : 's'}`, href: '/supplier/products?status=REJECTED' },
        ].filter(Boolean);

        return {
            range: { from: from.toISOString(), to: new Date(to.getTime() - 1).toISOString(), granularity: monthly ? 'month' : 'day', timezone: 'UTC' },
            totals, previous,
            products: { active: count('APPROVED'), pending: count('PENDING'), drafts: count('DRAFT'), needsChanges: count('NEEDS_CHANGES'), rejected: count('REJECTED'), outOfStock },
            awaitingConfirmation: awaiting,
            series, top, attention,
        };
    }
}
