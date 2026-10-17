import { bucketIndex, within, type ResolvedRange } from './report-range';
import { isRealImage, missingForPublish } from './catalog-rules';
import { minOrderCases } from '../common/markups';

/**
 * Supplier Overview metrics — the rules, without the database (tested in
 * __tests__/supplier-overview.spec.ts). Read-only aggregation of existing
 * records; nothing here changes an order, a payment or a product.
 *
 * GROSS SALES (what the supplier may see: their own net value, never the
 * buyer price or the Atlantis margin)
 *   = Σ OrderItem.supplierUnitPrice × OrderItem.quantity over the supplier's
 *     own lines (OrderItem.product.supplierId) on ELIGIBLE orders whose sale
 *     was RECOGNISED in the period. Lines placed before supplierUnitPrice was
 *     recorded are estimated from the product's current net price and flagged.
 *
 * ELIGIBLE + RECOGNISED (saleRecognizedAt):
 *   • Workflow orders (reviewStatus ≠ LEGACY): reviewStatus = APPROVED and
 *     status ≠ CANCELLED. Atlantis can only approve after every supplier
 *     accepted (order-workflow.ts approvalBlocker), so approval implies the
 *     supplier's acceptance. Recognised at Order.reviewedAt — the approval
 *     time, written once by approveOrder.
 *     Requests awaiting a supplier or Atlantis, rejected requests, and orders
 *     moved to PROCESSING without approval (the Stripe webhook path, TX-03)
 *     are not sales.
 *   • Legacy orders (placed before the workflow): status PAID, PROCESSING,
 *     SHIPPED or DELIVERED — confirmed by Atlantis with the status controls.
 *     Recognised at the first OrderStatusHistory row that moved the order into
 *     one of those statuses; Order.createdAt when no such row exists.
 *   An order cancelled later stops counting, also in past periods.
 */
export const LEGACY_CONFIRMED = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] as const;
/** Order statuses in which a supplier can still be asked to confirm (orders.service AWAITING_SUPPLIER). */
export const AWAITING_SUPPLIER_STATUSES = ['PENDING', 'PAID'] as const;

export interface OrderFacts {
    status: string;
    reviewStatus?: string | null;
    reviewedAt?: Date | string | null;
    createdAt: Date | string;
    /** Legacy only: first history row into a confirmed status. */
    firstConfirmedAt?: Date | string | null;
}

export function saleRecognizedAt(o: OrderFacts): Date | null {
    const review = o.reviewStatus || 'LEGACY';
    if (review === 'LEGACY') {
        if (!(LEGACY_CONFIRMED as readonly string[]).includes(o.status)) return null;
        return new Date(o.firstConfirmedAt || o.createdAt);
    }
    if (review !== 'APPROVED' || o.status === 'CANCELLED' || !o.reviewedAt) return null;
    return new Date(o.reviewedAt);
}

export interface SaleLine {
    orderId: string;
    productId: string;
    name: string;
    image: string | null;
    /** Supplier net value of the line (EUR). */
    value: number;
    estimated: boolean;
    cases: number;
    recognizedAt: Date;
}

export interface PeriodTotals { sales: number; orders: number; cases: number; estimated: boolean }

const r2 = (n: number) => Math.round(n * 100) / 100;

function totals(lines: SaleLine[]): PeriodTotals {
    return {
        sales: r2(lines.reduce((s, l) => s + l.value, 0)),
        orders: new Set(lines.map((l) => l.orderId)).size,
        cases: lines.reduce((s, l) => s + l.cases, 0),
        estimated: lines.some((l) => l.estimated),
    };
}

/** Relative change, or null when there is nothing to compare with (previous ≤ 0). */
export function pctChange(current: number, previous: number): number | null {
    if (!(previous > 0)) return null;
    return Math.round(((current - previous) / previous) * 10_000) / 10_000;
}

/**
 * Totals for the period and the previous one, the sales series (same lines,
 * bucketed by recognition time) and the top 5 products — ranked by supplier
 * net sales value in the period, ties broken by cases, then name.
 */
export function salesSummary(lines: SaleLine[], range: Pick<ResolvedRange, 'start' | 'end' | 'buckets' | 'previous'>) {
    const cur = lines.filter((l) => within(l.recognizedAt, range.start, range.end));
    const prev = lines.filter((l) => within(l.recognizedAt, range.previous.start, range.previous.end));
    const current = totals(cur), previous = totals(prev);

    const series = range.buckets.map((b) => ({ key: b.key, start: b.start.toISOString(), end: b.end.toISOString(), partial: b.partial, sales: 0, orders: 0 }));
    const seen = series.map(() => new Set<string>());
    for (const l of cur) {
        const i = bucketIndex(range, l.recognizedAt);
        if (i < 0) continue;
        series[i].sales += l.value;
        seen[i].add(l.orderId);
    }
    series.forEach((s, i) => { s.sales = r2(s.sales); s.orders = seen[i].size; });

    const byProduct = new Map<string, { productId: string; name: string; image: string | null; sales: number; cases: number; orders: Set<string> }>();
    for (const l of cur) {
        const e = byProduct.get(l.productId) || { productId: l.productId, name: l.name, image: l.image, sales: 0, cases: 0, orders: new Set<string>() };
        e.sales += l.value; e.cases += l.cases; e.orders.add(l.orderId);
        byProduct.set(l.productId, e);
    }
    const top = [...byProduct.values()]
        .map((e) => ({ productId: e.productId, name: e.name, image: e.image, sales: r2(e.sales), cases: e.cases, orders: e.orders.size }))
        .sort((a, b) => b.sales - a.sales || b.cases - a.cases || a.name.localeCompare(b.name))
        .slice(0, 5);

    return {
        current, previous,
        change: { sales: pctChange(current.sales, previous.sales), orders: pctChange(current.orders, previous.orders) },
        series, top,
    };
}

/**
 * Whether an order is waiting for THIS supplier's decision right now — the
 * same rule as the supplier orders page (orders.service findBySupplier
 * `needsAction`), so the two counts agree.
 */
export function awaitingSupplier(
    o: { status: string; reviewStatus?: string | null; termsVersion?: number | null; confirmations?: { supplierId?: string; termsVersion: number; status: string; deadline?: Date | string | null }[] },
    now: Date = new Date(),
): boolean {
    if (!(AWAITING_SUPPLIER_STATUSES as readonly string[]).includes(o.status)) return false;
    if ((o.reviewStatus || 'LEGACY') === 'LEGACY') return true;
    if (o.reviewStatus !== 'PENDING_REVIEW') return false;
    const confs = o.confirmations || [];
    const version = confs.length ? Math.max(...confs.map((c) => c.termsVersion)) : (o.termsVersion ?? 1);
    const mine = confs.find((c) => c.termsVersion === version);
    if (!mine || mine.status !== 'PENDING') return false;
    return !(mine.deadline && new Date(mine.deadline).getTime() < now.getTime());
}

/**
 * Current catalog health. Each tile counts a product at most once; tiles
 * overlap (a draft can also miss an image). Rejected listings are closed, so
 * they are counted only in `rejected`.
 */
export function inventoryHealth(products: any[]) {
    const open = products.filter((p) => p.status !== 'REJECTED');
    const live = products.filter((p) => p.status === 'APPROVED');
    const stock = (p: any) => Number(p.stock) || 0;
    return {
        drafts: products.filter((p) => p.status === 'DRAFT').length,
        rejected: products.filter((p) => p.status === 'REJECTED').length,
        needsChanges: products.filter((p) => p.status === 'NEEDS_CHANGES').length,
        missingInfo: open.filter((p) => missingForPublish(p).length > 0).length,
        missingImages: open.filter((p) => !(Array.isArray(p.images) && p.images.some(isRealImage))).length,
        /** Live products with 0 cases (or less) in stock. */
        outOfStock: live.filter((p) => stock(p) <= 0).length,
        /** Live products with stock, but fewer cases than one minimum order. */
        belowMinOrder: live.filter((p) => { const min = minOrderCases(p); return stock(p) > 0 && min > 0 && stock(p) < min; }).length,
    };
}

/** Distinct products that need the supplier: DRAFT, REJECTED or NEEDS_CHANGES (one status each, so no double counting). */
export function attentionCounts(byStatus: Record<string, number>) {
    const drafts = byStatus.DRAFT || 0, rejected = byStatus.REJECTED || 0, needsChanges = byStatus.NEEDS_CHANGES || 0;
    return { total: drafts + rejected + needsChanges, drafts, rejected, needsChanges };
}
