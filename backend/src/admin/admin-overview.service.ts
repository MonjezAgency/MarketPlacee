import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ReportRangeError, resolveRange, type ResolvedRange } from '../products/report-range';
import { LEGACY_CONFIRMED } from '../products/supplier-metrics';
import { isRealImage, missingForPublish } from '../products/catalog-rules';
import { STAFF_ROLES, scopeWhere } from '../products/catalog-scope';
import { ProductReviewService } from '../products/product-review.service';
import { catalogHealth, commercialSummary, datedEventsSummary, eligibleOrders, mergeActivity, orderAttention, paymentsSummary, statusBreakdown, type ActivityItem, type OpenOrderFacts } from './admin-overview';
import { casesForItem } from '../products/stock-ledger';
import { within } from '../products/report-range';

/**
 * Founder Overview (GET /dashboard/admin/overview). Read-only; definitions in
 * admin-overview.ts. Current counts ("now") and period figures are returned in
 * separate blocks and never mixed.
 */
const COMPLETENESS_SELECT = { id: true, status: true, supplierId: true, stock: true, name: true, brand: true, category: true, ean: true, origin: true, exwLocation: true, weight: true, basePrice: true, price: true, unit: true, unitsPerCase: true, casesPerPallet: true, moq: true, moqUnit: true, images: true } as const;
const img = (images: unknown) => (Array.isArray(images) ? images.find((x) => isRealImage(x) && /^https?:/i.test(String(x))) ?? null : null) as string | null;

@Injectable()
export class AdminOverviewService {
    constructor(private readonly prisma: PrismaService, private readonly review: ProductReviewService) {}

    private range(q: { range?: string; from?: string; to?: string; tz?: string }, now: Date): ResolvedRange {
        try { return resolveRange(q, now); } catch (e) {
            if (e instanceof ReportRangeError) throw new BadRequestException({ code: e.code, message: e.message });
            throw e;
        }
    }

    /**
     * Orders placed in the period by current status, the latest orders, and recent activity from
     * real records only (orders, disputes, registrations, product review events). Nothing is synthesised.
     */
    private async feed(start: Date, end: Date) {
        const [groups, recentOrders, orders, disputes, accounts, reviews] = await Promise.all([
            this.prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
            this.prisma.order.findMany({
                orderBy: { createdAt: 'desc' }, take: 6,
                select: { id: true, createdAt: true, status: true, reviewStatus: true, totalAmount: true, paymentStatus: true, customer: { select: { name: true, companyName: true } }, _count: { select: { items: true } } },
            }),
            this.prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, createdAt: true, totalAmount: true, customer: { select: { name: true, companyName: true } } } }),
            this.prisma.dispute.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, createdAt: true, reason: true, orderId: true } }),
            this.prisma.user.findMany({ where: { role: { in: ['SUPPLIER', 'CUSTOMER'] as any } }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, createdAt: true, role: true, name: true, companyName: true, status: true } }),
            this.prisma.productReviewEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { createdAt: true, action: true, actorRole: true, product: { select: { id: true, name: true } } } }),
        ]);
        const who = (u: { name?: string | null; companyName?: string | null } | null) => u?.companyName || u?.name || '';
        const activity = mergeActivity([
            orders.map((o): ActivityItem => ({ kind: 'ORDER_PLACED', at: o.createdAt.toISOString(), href: `/admin/orders/${o.id}`, subject: o.id.slice(0, 8).toUpperCase(), detail: who(o.customer) })),
            disputes.map((d): ActivityItem => ({ kind: 'DISPUTE_OPENED', at: d.createdAt.toISOString(), href: '/admin/disputes', subject: d.orderId.slice(0, 8).toUpperCase(), detail: d.reason })),
            accounts.map((u): ActivityItem => ({ kind: 'ACCOUNT_REGISTERED', at: u.createdAt.toISOString(), href: `/admin/users/${u.id}`, subject: who(u), detail: u.role })),
            reviews.filter((r) => r.product).map((r): ActivityItem => ({ kind: 'PRODUCT_REVIEW', at: r.createdAt.toISOString(), href: `/admin/products/${r.product!.id}`, subject: r.product!.name, detail: r.action })),
        ]);
        return {
            ordersByStatus: statusBreakdown((groups as any[]).map((g) => ({ status: g.status, count: g._count._all }))),
            recentOrders: recentOrders.map((o) => ({ id: o.id, ref: o.id.slice(0, 8).toUpperCase(), createdAt: o.createdAt.toISOString(), status: o.status, reviewStatus: o.reviewStatus, paymentStatus: o.paymentStatus, total: o.totalAmount, lines: o._count.items, buyer: who(o.customer) })),
            activity,
        };
    }

    async overview(q: { range?: string; from?: string; to?: string; tz?: string } = {}, now = new Date()) {
        const range = this.range(q, now);
        const { start, end } = range;
        const since = range.previous.start;

        const staff = (await this.prisma.user.findMany({ where: { role: { in: [...STAFF_ROLES] as any } }, select: { id: true } })).map((u) => u.id);
        const catalogWhere = scopeWhere('catalog', staff), submissionsWhere = scopeWhere('submissions', staff);

        const [users, products, orderCounts, openOrders, saleOrders, escrows, refundRows, cancelRows, cancelledTotal, cancelledWithRow, disputesOpen, offersPending, kycPending, paymentFailed, refundedOrders, decisions, submissionsCur, submissionsPrev, newSuppliersCur, newSuppliersPrev, submittingSuppliers, placedCur, placedPrev, markedPaid] = await Promise.all([
            this.prisma.user.groupBy({ by: ['role', 'status'], _count: { _all: true } }),
            this.prisma.product.findMany({ select: COMPLETENESS_SELECT }),
            Promise.all([this.prisma.order.count(), this.prisma.order.count({ where: { status: { in: ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'] as any } } })]),
            this.prisma.order.findMany({
                where: { status: { in: ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'] as any } },
                select: { id: true, status: true, reviewStatus: true, termsVersion: true, buyerAcceptedVersion: true, confirmations: { select: { supplierId: true, termsVersion: true, status: true, deadline: true, decidedAt: true } }, items: { select: { product: { select: { supplierId: true } } } } },
            }),
            this.prisma.order.findMany({
                where: { OR: [{ reviewStatus: 'APPROVED', status: { not: 'CANCELLED' as any } }, { reviewStatus: 'LEGACY', status: { in: [...LEGACY_CONFIRMED] as any } }] },
                select: {
                    id: true, status: true, reviewStatus: true, reviewedAt: true, createdAt: true, totalAmount: true, paymentStatus: true, customerId: true,
                    history: { where: { newStatus: { in: [...LEGACY_CONFIRMED] as any } }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
                    items: { select: { productId: true, productNameSnapshot: true, quantity: true, price: true, supplierUnitPrice: true, stockCases: true, selectedTier: true, mixComposition: true, mixedLoadId: true, product: { select: { name: true, images: true, supplierId: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true, supplier: { select: { name: true, companyName: true } } } } } },
                },
            }),
            this.prisma.escrowTransaction.findMany({ where: { status: { in: ['CAPTURED', 'RELEASED'] as any } }, select: { amount: true, currency: true, capturedAt: true } }),
            this.prisma.financialAuditLog.findMany({ where: { eventType: 'REFUND_ISSUED', status: 'OK', createdAt: { gte: since, lt: end } }, select: { createdAt: true, amount: true } }),
            this.prisma.orderStatusHistory.findMany({ where: { newStatus: 'CANCELLED' as any, createdAt: { gte: since, lt: end } }, select: { createdAt: true, orderId: true } }),
            this.prisma.order.count({ where: { status: 'CANCELLED' as any } }),
            this.prisma.order.count({ where: { status: 'CANCELLED' as any, history: { some: { newStatus: 'CANCELLED' as any } } } }),
            this.prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] as any } } }),
            this.prisma.offer.count({ where: { status: 'PENDING' } }),
            this.prisma.kYCDocument.count({ where: { status: 'PENDING' as any } }),
            this.prisma.order.count({ where: { paymentStatus: 'FAILED' } }),
            this.prisma.order.count({ where: { paymentStatus: 'REFUNDED' } }),
            this.review.decisionCounts(start, end),
            this.prisma.product.count({ where: { ...submissionsWhere, createdAt: { gte: start, lt: end } } }),
            this.prisma.product.count({ where: { ...submissionsWhere, createdAt: { gte: range.previous.start, lt: range.previous.end } } }),
            this.prisma.user.count({ where: { role: 'SUPPLIER', createdAt: { gte: start, lt: end } } }),
            this.prisma.user.count({ where: { role: 'SUPPLIER', createdAt: { gte: range.previous.start, lt: range.previous.end } } }),
            this.prisma.product.groupBy({ by: ['supplierId'], where: { ...submissionsWhere, createdAt: { gte: start, lt: end } } }),
            this.prisma.order.count({ where: { createdAt: { gte: start, lt: end } } }),
            this.prisma.order.count({ where: { createdAt: { gte: range.previous.start, lt: range.previous.end } } }),
            this.prisma.order.aggregate({ where: { paymentStatus: 'PAID' }, _count: { _all: true }, _sum: { totalAmount: true } }),
        ]);

        // ── People ─────────────────────────────────────────────────────────
        const count = (role: string, status?: string) => (users as any[]).filter((u) => u.role === role && (!status || u.status === status)).reduce((s, u) => s + u._count._all, 0);
        const staffSet = new Set(staff);
        const liveSuppliers = new Set(products.filter((p) => p.status === 'APPROVED' && !staffSet.has(p.supplierId)).map((p) => p.supplierId));
        const people = {
            suppliers: { total: count('SUPPLIER'), active: count('SUPPLIER', 'ACTIVE'), pendingApproval: count('SUPPLIER', 'PENDING_APPROVAL'), blocked: count('SUPPLIER', 'BLOCKED') + count('SUPPLIER', 'REJECTED'), withLiveProducts: liveSuppliers.size },
            buyers: { total: count('CUSTOMER'), active: count('CUSTOMER', 'ACTIVE'), pendingApproval: count('CUSTOMER', 'PENDING_APPROVAL') },
        };

        // ── Products (each product in exactly one scope) ────────────────────
        const facts = products.map((p) => ({ status: p.status as string, missing: missingForPublish(p).length, hasImage: Array.isArray(p.images) && p.images.some(isRealImage), catalog: staffSet.has(p.supplierId) }));
        const catalog = { all: catalogHealth(facts), catalog: catalogHealth(facts.filter((f) => f.catalog)), submissions: catalogHealth(facts.filter((f) => !f.catalog)) };

        // ── Orders now ─────────────────────────────────────────────────────
        const open: OpenOrderFacts[] = openOrders.map((o: any) => ({
            id: o.id, status: o.status, reviewStatus: o.reviewStatus, termsVersion: o.termsVersion, buyerAcceptedVersion: o.buyerAcceptedVersion,
            supplierIds: [...new Set(o.items.map((i: any) => i.product?.supplierId).filter(Boolean))] as string[],
            confirmations: o.confirmations,
        }));
        const attention = orderAttention(open, now);

        // ── Commercial (period) ─────────────────────────────────────────────
        const eligible = eligibleOrders(saleOrders.map((o: any) => ({
            id: o.id, status: o.status, reviewStatus: o.reviewStatus, reviewedAt: o.reviewedAt, createdAt: o.createdAt, firstConfirmedAt: o.history?.[0]?.createdAt ?? null,
            totalAmount: o.totalAmount, paymentStatus: o.paymentStatus,
            lines: o.items.map((i: any) => ({ productId: i.productId, name: i.product?.name || i.productNameSnapshot || '', image: img(i.product?.images), quantity: i.quantity, price: i.price, supplierUnitPrice: i.supplierUnitPrice, supplierId: i.product?.supplierId ?? null, supplierName: i.product?.supplier?.companyName || i.product?.supplier?.name || null, cases: casesForItem({ ...i, order: { status: o.status } }) })),
        })));
        const commercial = commercialSummary(eligible, range);
        const payments = paymentsSummary(escrows, range);
        const customerOf = new Map(saleOrders.map((o: any) => [o.id, o.customerId]));
        const buyersOrdering = new Set(eligible.filter((o) => within(o.recognizedAt, start, end)).map((o) => customerOf.get(o.id)).filter(Boolean)).size;
        const allTimeProducts = new Set(eligible.flatMap((o) => o.lines.map((l) => l.productId).filter(Boolean))).size;
        const allTimeCases = eligible.reduce((s, o) => s + o.lines.reduce((t, l) => t + (Number(l.cases) || 0), 0), 0);
        const activeProducts = products.filter((p) => p.status === 'APPROVED' && (Number(p.stock) || 0) > 0).length;
        const outstanding = eligible.filter((o) => o.paymentStatus !== 'PAID');
        const refunds = datedEventsSummary(refundRows.map((r) => ({ at: r.createdAt, amount: r.amount })), range);
        const cancellations = datedEventsSummary(cancelRows.map((r) => ({ at: r.createdAt })), range);

        return {
            asOf: now.toISOString(),
            range: { preset: range.preset, from: range.fromDay, to: range.toDay, days: range.days, timeZone: range.timeZone, granularity: range.granularity, previous: { from: range.previous.fromDay, to: range.previous.toDay } },
            snapshot: {
                people: { ...people, buyers: { ...people.buyers, orderingInPeriod: buyersOrdering } },
                products: {
                    active: activeProducts,
                    live: catalog.all.byStatus.APPROVED || 0,
                    total: catalog.all.total, byStatus: catalog.all.byStatus,
                    catalog: { total: catalog.catalog.total, byStatus: catalog.catalog.byStatus, missingInfo: catalog.catalog.missingInfo, missingImages: catalog.catalog.missingImages, liveIncomplete: catalog.catalog.liveIncomplete },
                    submissions: { total: catalog.submissions.total, byStatus: catalog.submissions.byStatus, missingInfo: catalog.submissions.missingInfo, missingImages: catalog.submissions.missingImages, liveIncomplete: catalog.submissions.liveIncomplete },
                    missingInfo: catalog.all.missingInfo, missingImages: catalog.all.missingImages,
                },
                sold: { products: allTimeProducts, cases: allTimeCases },
                orders: { total: orderCounts[0], open: orderCounts[1], placedInPeriod: placedCur, placedPrevious: placedPrev, cancelled: cancelledTotal, cancelledUndated: cancelledTotal - cancelledWithRow, ...attention },
                disputesOpen, offersPending, kycPending, paymentFailed, refundedOrders,
                outstanding: { orders: outstanding.length, amount: Math.round(outstanding.reduce((s, o) => s + o.totalAmount, 0) * 100) / 100 },
            },
            commercial: {
                currency: 'EUR', ...commercial, payments, refunds, cancellations,
                markedPaid: { orders: markedPaid._count._all, amount: Math.round((markedPaid._sum.totalAmount || 0) * 100) / 100 },
                netProfit: { available: false, missing: ['expenses', 'paymentFees', 'freightCosts', 'payouts'] },
            },
            ...(await this.feed(start, end)),
            insights: {
                submissions: { current: submissionsCur, previous: submissionsPrev, suppliers: submittingSuppliers.length },
                newSuppliers: { current: newSuppliersCur, previous: newSuppliersPrev },
                decisions,
            },
        };
    }
}
