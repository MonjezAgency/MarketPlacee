import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { OrdersService, ORDER_TRANSITIONS } from './orders.service';
import { isRealImage } from '../products/catalog-rules';
import type { OpenOrderFacts } from '../admin/admin-overview';
import {
    CSV_HEADER, EXPORT_MAX_ROWS, OrderListQueryError, attentionQueues, buildOrderWhere, buildTimeline, cleanVariants, moneySummary,
    nextAction, orderByFor, orderRef, ordersPerKey, parseOrderListQuery, redactNet, statusCounts, statusOptions, supplierIdsOf, toCsv,
    type OrderListQuery,
} from './admin-orders';

/**
 * Admin order management: list with counts and facets, CSV export, and the
 * full order detail. Read-only — every action on the page goes through the
 * existing order endpoints (approve, reject, amend, status, shipping, …).
 * Definitions in admin-orders.ts.
 */
const OPEN_STATUSES = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'];
const firstImage = (images: unknown) => (Array.isArray(images) ? (images.find((x) => isRealImage(x) && /^https?:/i.test(String(x))) as string | undefined) ?? null : null);
const who = (u: { name?: string | null; companyName?: string | null } | null | undefined) => u?.companyName || u?.name || null;

@Injectable()
export class AdminOrdersService {
    constructor(private readonly prisma: PrismaService, private readonly orders: OrdersService) {}

    private parse(raw: Record<string, unknown>, maxLimit?: number): OrderListQuery {
        try { return parseOrderListQuery(raw, { maxLimit }); } catch (e) {
            if (e instanceof OrderListQueryError) throw new BadRequestException({ code: e.code, message: e.message });
            throw e;
        }
    }

    /** Open orders as workflow facts (suppliers = product owners ∪ suppliers asked to confirm). */
    private async openFacts(now: Date) {
        const open = await this.prisma.order.findMany({
            where: { status: { in: OPEN_STATUSES as any } },
            select: { id: true, status: true, reviewStatus: true, termsVersion: true, buyerAcceptedVersion: true, confirmations: { select: { supplierId: true, termsVersion: true, status: true, deadline: true, decidedAt: true } }, items: { select: { product: { select: { supplierId: true } } } } },
        });
        const facts: OpenOrderFacts[] = open.map((o: any) => ({
            id: o.id, status: o.status, reviewStatus: o.reviewStatus, termsVersion: o.termsVersion, buyerAcceptedVersion: o.buyerAcceptedVersion,
            supplierIds: supplierIdsOf(o), confirmations: o.confirmations,
        }));
        return attentionQueues(facts, now);
    }

    private async userNames(ids: string[]) {
        if (!ids.length) return new Map<string, { id: string; name: string | null }>();
        const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, companyName: true } });
        return new Map(users.map((u) => [u.id, { id: u.id, name: who(u) }]));
    }

    private rowSelect = {
        id: true, createdAt: true, updatedAt: true, status: true, reviewStatus: true, paymentStatus: true, totalAmount: true, shippingCost: true,
        termsVersion: true, buyerAcceptedVersion: true,
        customer: { select: { id: true, name: true, companyName: true, email: true } },
        confirmations: { select: { supplierId: true, termsVersion: true, status: true, deadline: true, decidedAt: true } },
        items: { select: { product: { select: { supplierId: true } } } },
    } as const;

    private async toRows(orders: any[], now: Date) {
        const facts = orders.map((o) => ({ o, supplierIds: supplierIdsOf(o) }));
        const names = await this.userNames([...new Set(facts.flatMap((f) => f.supplierIds))]);
        return facts.map(({ o, supplierIds }) => ({
            id: o.id, ref: orderRef(o.id), createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(),
            status: o.status, reviewStatus: o.reviewStatus, paymentStatus: o.paymentStatus,
            total: o.totalAmount, shippingCost: o.shippingCost ?? null, lines: o.items.length,
            buyer: o.customer ? { id: o.customer.id, name: o.customer.name, companyName: o.customer.companyName, email: o.customer.email } : null,
            suppliers: supplierIds.map((id) => names.get(id) || { id, name: null }),
            nextAction: nextAction({ id: o.id, status: o.status, reviewStatus: o.reviewStatus, termsVersion: o.termsVersion, buyerAcceptedVersion: o.buyerAcceptedVersion, supplierIds, confirmations: o.confirmations }, now),
        }));
    }

    private async facets() {
        const [items, confs, buyers, payments] = await Promise.all([
            this.prisma.orderItem.findMany({ select: { orderId: true, product: { select: { supplierId: true } } } }),
            this.prisma.orderSupplierConfirmation.findMany({ distinct: ['orderId', 'supplierId'], select: { orderId: true, supplierId: true } }),
            this.prisma.order.groupBy({ by: ['customerId'], _count: { _all: true } }),
            this.prisma.order.groupBy({ by: ['paymentStatus'], _count: { _all: true } }),
        ]);
        const supplierCounts = ordersPerKey([...items.map((i) => ({ orderId: i.orderId, key: i.product?.supplierId })), ...confs.map((c) => ({ orderId: c.orderId, key: c.supplierId }))]);
        const names = await this.userNames([...new Set([...supplierCounts.keys(), ...buyers.map((b) => b.customerId)])]);
        const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
        return {
            suppliers: [...supplierCounts.entries()].map(([id, count]) => ({ id, name: names.get(id)?.name || id.slice(0, 8), count })).sort(byName),
            buyers: (buyers as any[]).map((b) => ({ id: b.customerId, name: names.get(b.customerId)?.name || b.customerId.slice(0, 8), count: b._count._all })).sort(byName),
            paymentStatuses: (payments as any[]).map((p) => ({ value: p.paymentStatus, count: p._count._all })).sort((a, b) => a.value.localeCompare(b.value)),
        };
    }

    async list(raw: Record<string, unknown>, now = new Date()) {
        const q = this.parse(raw);
        const [queues, groups, facets] = await Promise.all([
            this.openFacts(now),
            this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
            this.facets(),
        ]);
        const where = buildOrderWhere(q, q.attention ? queues.ids[q.attention] : null);
        const [total, orders] = await Promise.all([
            this.prisma.order.count({ where }),
            this.prisma.order.findMany({ where, orderBy: orderByFor(q.sort), skip: (q.page - 1) * q.limit, take: q.limit, select: this.rowSelect }),
        ]);
        const counts = statusCounts((groups as any[]).map((g) => ({ status: g.status, count: g._count._all })));
        return {
            asOf: now.toISOString(),
            data: await this.toRows(orders, now),
            total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)),
            counts: { ...counts, attention: queues.counts },
            facets,
        };
    }

    /** The filtered list as CSV (same filters and order as the list, every page, up to EXPORT_MAX_ROWS). */
    async exportCsv(raw: Record<string, unknown>, now = new Date()) {
        const q = this.parse(raw);
        const queues = q.attention ? await this.openFacts(now) : null;
        const where = buildOrderWhere(q, queues && q.attention ? queues.ids[q.attention] : null);
        const total = await this.prisma.order.count({ where });
        const orders = await this.prisma.order.findMany({ where, orderBy: orderByFor(q.sort), take: EXPORT_MAX_ROWS, select: this.rowSelect });
        const rows = await this.toRows(orders, now);
        const csv = toCsv([CSV_HEADER, ...rows.map((r) => [
            r.ref, r.id, r.createdAt, r.status, r.reviewStatus, r.paymentStatus, r.buyer?.companyName ?? '', r.buyer?.name ?? '', r.buyer?.email ?? '',
            r.suppliers.map((s) => s.name || s.id).join('; '), r.lines, r.total.toFixed(2), r.shippingCost == null ? '' : Number(r.shippingCost).toFixed(2), r.nextAction ?? '',
        ])]);
        return { csv, rows: rows.length, total, truncated: total > rows.length };
    }

    /** Everything recorded about one order. Supplier net prices only when `netVisible` (admin / owner). */
    async detail(id: string, opts: { netVisible: boolean }, now = new Date()) {
        const o: any = await this.prisma.order.findUnique({
            where: { id },
            include: {
                customer: { select: { id: true, name: true, companyName: true, email: true, emailVerified: true, phone: true, country: true, status: true, kycStatus: true, createdAt: true } },
                items: {
                    orderBy: { id: 'asc' },
                    include: { product: { select: { id: true, name: true, images: true, brand: true, ean: true, unit: true, supplierId: true, supplier: { select: { id: true, name: true, companyName: true } } } } },
                },
                history: { orderBy: { createdAt: 'asc' } },
                confirmations: { orderBy: [{ termsVersion: 'asc' }, { requestedAt: 'asc' }] },
                inspections: { orderBy: { createdAt: 'desc' } },
                invoices: { orderBy: { createdAt: 'asc' } },
                shipment: { include: { updates: { orderBy: { createdAt: 'asc' } } } },
                disputes: { orderBy: { createdAt: 'asc' }, select: { id: true, reason: true, status: true, createdAt: true, resolvedAt: true, resolution: true } },
                escrow: true,
            },
        });
        if (!o) throw new NotFoundException('Order not found');

        // Mixed loads: the load (kind, supplier) and the products in each recorded composition.
        const loadIds = [...new Set(o.items.map((i: any) => i.mixedLoadId).filter(Boolean))] as string[];
        const loads = loadIds.length ? await this.prisma.mixedLoad.findMany({ where: { id: { in: loadIds } }, select: { id: true, kind: true, supplierId: true } }) : [];
        const loadById = new Map(loads.map((l) => [l.id, l]));
        const compIds = [...new Set(o.items.flatMap((i: any) => (Array.isArray(i.mixComposition) ? i.mixComposition.map((c: any) => c?.productId).filter(Boolean) : [])))] as string[];
        const compProducts = compIds.length ? await this.prisma.product.findMany({ where: { id: { in: compIds } }, select: { id: true, name: true, ean: true, images: true, brand: true } }) : [];
        const compById = new Map(compProducts.map((p) => [p.id, p]));

        const supplierIds = supplierIdsOf({ items: o.items.map((i: any) => ({ product: i.product, mixedLoadSupplierId: i.mixedLoadId ? loadById.get(i.mixedLoadId)?.supplierId ?? null : null })), confirmations: o.confirmations });
        const actorIds = [...new Set([...o.history.map((h: any) => h.changedById), o.reviewedById].filter(Boolean))] as string[];
        const [supplierUsers, actors] = await Promise.all([
            supplierIds.length ? this.prisma.user.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, companyName: true, email: true, emailVerified: true, phone: true, country: true, status: true, kycStatus: true, role: true } }) : Promise.resolve([] as any[]),
            this.userNames(actorIds),
        ]);
        const supplierName = new Map(supplierUsers.map((u: any) => [u.id, who(u) || 'Supplier']));
        const terms: any = o.termsSnapshot || o.submittedTerms || null;

        const lines = o.items.map((i: any) => {
            const load = i.mixedLoadId ? loadById.get(i.mixedLoadId) : null;
            const supId = i.product?.supplierId ?? load?.supplierId ?? null;
            const comp = Array.isArray(i.mixComposition) ? i.mixComposition.map((c: any) => {
                const p = c?.productId ? compById.get(c.productId) : null;
                return {
                    productId: c?.productId ?? null, name: c?.name ?? p?.name ?? null, signature: typeof c?.signature === 'string' ? c.signature : null,
                    variant: c?.variant ?? null, quantity: Number.isFinite(Number(c?.quantity)) ? Number(c.quantity) : null, unit: c?.unit ?? null,
                    cases: Number.isFinite(Number(c?.cases)) ? Number(c.cases) : null, unitPrice: Number.isFinite(Number(c?.unitPrice)) ? Number(c.unitPrice) : null,
                    lineSubtotal: Number.isFinite(Number(c?.lineSubtotal)) ? Number(c.lineSubtotal) : null, discountPercent: c?.discountPercent ?? null,
                    ean: p?.ean ?? null, image: firstImage(p?.images),
                };
            }) : null;
            return {
                id: i.id, kind: i.mixedLoadId ? 'mixed' : 'product',
                productId: i.productId ?? null, productExists: !!i.product,
                name: i.productNameSnapshot || i.product?.name || null,
                image: firstImage(i.product?.images), ean: i.product?.ean ?? null, brand: i.product?.brand ?? null, productUnit: i.product?.unit ?? null,
                tier: i.selectedTier ?? null, quantity: i.quantity, unitPrice: i.price, lineTotal: Math.round(i.price * i.quantity * 100) / 100,
                supplierUnitPrice: i.supplierUnitPrice ?? null,
                supplierLineTotal: i.supplierUnitPrice == null ? null : Math.round(i.supplierUnitPrice * i.quantity * 100) / 100,
                promotionPercent: i.promotionPercent ?? null, stockCases: i.stockCases ?? null,
                selectedVariants: cleanVariants(i.selectedVariants), mixComposition: comp && comp.length ? comp : null,
                mixedLoad: load ? { id: load.id, kind: load.kind } : null,
                supplier: supId ? { id: supId, name: supplierName.get(supId) ?? null } : null,
            };
        });

        const money = moneySummary({ totalAmount: o.totalAmount, shippingCost: o.shippingCost, coupon: terms?.coupon ?? o.submittedTerms?.coupon ?? null, freightStatus: terms?.freight?.status ?? null }, o.items.map((i: any) => ({ quantity: i.quantity, price: i.price, supplierUnitPrice: i.supplierUnitPrice ?? null })));
        const facts = { id: o.id, status: o.status, reviewStatus: o.reviewStatus, termsVersion: o.termsVersion, buyerAcceptedVersion: o.buyerAcceptedVersion, supplierIds, confirmations: o.confirmations };
        const supplierLabel = (sid: string) => supplierName.get(sid) || 'Supplier';

        const detail = {
            netVisible: true,
            id: o.id, ref: orderRef(o.id), createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(),
            status: o.status, reviewStatus: o.reviewStatus, reviewedAt: o.reviewedAt?.toISOString() ?? null, reviewNote: o.reviewNote ?? null,
            reviewedBy: o.reviewedById ? actors.get(o.reviewedById)?.name ?? null : null,
            termsVersion: o.termsVersion, buyerAcceptedVersion: o.buyerAcceptedVersion ?? null, buyerAcceptedAt: o.buyerAcceptedAt?.toISOString() ?? null,
            nextAction: nextAction(facts, now),
            statusOptions: statusOptions(o, ORDER_TRANSITIONS as any),
            payment: {
                status: o.paymentStatus, paidAt: o.paidAt?.toISOString() ?? null, cardPaymentStarted: !!o.paymentIntentId,
                card: o.escrow ? { status: o.escrow.status, amount: o.escrow.amount, currency: o.escrow.currency, platformFee: o.escrow.platformFee, supplierAmount: o.escrow.supplierAmount, createdAt: o.escrow.createdAt.toISOString(), capturedAt: o.escrow.capturedAt?.toISOString() ?? null, releasedAt: o.escrow.releasedAt?.toISOString() ?? null } : null,
            },
            money,
            lines,
            buyer: o.customer ? { ...o.customer, createdAt: o.customer.createdAt.toISOString() } : null,
            suppliers: supplierIds.map((sid) => {
                const u: any = supplierUsers.find((x: any) => x.id === sid);
                const mine = lines.filter((l: any) => l.supplier?.id === sid);
                return u ? { id: u.id, name: u.name, companyName: u.companyName, email: u.email, emailVerified: u.emailVerified, phone: u.phone, country: u.country, status: u.status, kycStatus: u.kycStatus, role: u.role, lines: mine.length } : { id: sid, name: null, companyName: null, email: null, emailVerified: false, phone: null, country: null, status: null, kycStatus: null, role: null, lines: mine.length };
            }),
            logistics: {
                shippingAddress: o.shippingAddress ?? null, destinationCountry: o.destinationCountry ?? null,
                shippingCompany: o.shippingCompany ?? null, customerShippingCompany: o.customerShippingCompany ?? null, shippingCost: o.shippingCost ?? null,
                fulfillment: o.fulfillment ?? null,
                shipment: o.shipment ? { trackingNumber: o.shipment.trackingNumber, carrier: o.shipment.carrier, status: o.shipment.status, expectedDelivery: o.shipment.expectedDelivery?.toISOString() ?? null, createdAt: o.shipment.createdAt.toISOString(), updates: o.shipment.updates.map((u: any) => ({ status: u.status, description: u.description, location: u.location, createdAt: u.createdAt.toISOString() })) } : null,
            },
            documents: {
                invoices: o.invoices.map((inv: any) => ({ id: inv.id, invoiceNumber: inv.invoiceNumber, status: inv.status, amount: inv.amount, tax: inv.tax, totalAmount: inv.totalAmount, currency: inv.currency, dueDate: inv.dueDate?.toISOString() ?? null, paidAt: inv.paidAt?.toISOString() ?? null, createdAt: inv.createdAt.toISOString(), pdfUrl: /^https:\/\//.test(inv.pdfUrl || '') ? inv.pdfUrl : null })),
                supplierInvoiceUrl: /^https:\/\//.test(o.supplierInvoiceUrl || '') ? o.supplierInvoiceUrl : null,
            },
            disputes: o.disputes.map((d: any) => ({ ...d, createdAt: d.createdAt.toISOString(), resolvedAt: d.resolvedAt?.toISOString() ?? null })),
            timeline: buildTimeline({
                createdAt: o.createdAt,
                history: o.history.map((h: any) => ({ createdAt: h.createdAt, previousStatus: h.previousStatus, newStatus: h.newStatus, reason: h.reason, actor: actors.get(h.changedById)?.name ?? null })),
                confirmations: o.confirmations.map((c: any) => ({ supplier: supplierLabel(c.supplierId), termsVersion: c.termsVersion, status: c.status, requestedAt: c.requestedAt, decidedAt: c.decidedAt, note: c.note })),
                review: { status: o.reviewStatus, at: o.reviewedAt, note: o.reviewNote, actor: o.reviewedById ? actors.get(o.reviewedById)?.name ?? null : null },
                buyerAccepted: { at: o.buyerAcceptedAt, version: o.buyerAcceptedVersion },
                inspections: o.inspections.map((i: any) => ({ status: i.status, inspectedAt: i.inspectedAt, createdAt: i.createdAt, inspectorName: i.inspectorName })),
                shipment: o.shipment ? { createdAt: o.shipment.createdAt, carrier: o.shipment.carrier, trackingNumber: o.shipment.trackingNumber, updates: o.shipment.updates } : null,
                paidAt: o.paidAt, card: o.escrow ? { capturedAt: o.escrow.capturedAt, releasedAt: o.escrow.releasedAt } : null,
                invoices: o.invoices, disputes: o.disputes,
            }),
            workflow: o.reviewStatus && o.reviewStatus !== 'LEGACY' ? await this.orders.workflowForAdmin(id) : null,
            inspections: o.inspections.map((i: any) => this.orders.inspectionView(i, o.items)),
        };
        return opts.netVisible ? detail : redactNet(detail);
    }
}
