import { bucketIndex, within, type ResolvedRange } from '../products/report-range';
import { pctChange, saleRecognizedAt, type OrderFacts } from '../products/supplier-metrics';
import { confirmationState, buyerMustAccept, type Confirmation } from '../orders/order-workflow';

/**
 * Founder Overview — the rules, without the database (tested in
 * __tests__/admin-overview.spec.ts). Read-only aggregation of existing
 * records; nothing here changes an order, a payment or a product.
 *
 * DEFINITIONS (every figure the page shows is one of these)
 *
 *  Order value (period) — Σ Order.totalAmount of ELIGIBLE orders RECOGNISED
 *    in the period. totalAmount is the goods total at buyer prices (EUR), as
 *    approved; freight that is "quoted after the order" is not in it.
 *    Eligible + recognised = supplier-metrics.ts saleRecognizedAt: workflow
 *    orders approved by Atlantis and not cancelled (at reviewedAt); legacy
 *    orders confirmed with the status controls (at the first confirmed
 *    history row). Requests still waiting, rejected requests and cancelled
 *    orders are never sales.
 *  Supplier net (period) — Σ OrderItem.supplierUnitPrice × quantity over the
 *    same lines, counted only where the supplier price was recorded.
 *  Atlantis revenue (period) — the business model is a markup on the supplier
 *    net price, so Atlantis's revenue on a line is (buyer price − supplier net)
 *    × quantity. Summed over lines that have a recorded supplier price; the
 *    number of lines without one is returned so the page can say the figure is
 *    partial. `margin` (whole-period) is set only when every line is covered.
 *  Net profit — NOT calculable: no expense, cost, fee, freight-cost or payout
 *    records exist in the data model. Returned as unavailable, never as 0.
 *  Products sold (period) — cases (order lines converted to cases with the
 *    ordered tier's pack sizes, stock-ledger.ts) and distinct products on
 *    eligible orders recognised in the period.
 *  Average order value — Order value ÷ eligible orders; null when 0 orders.
 *  Payments received (period) — Stripe-confirmed card payments: escrow records
 *    (EscrowTransaction) with status CAPTURED or RELEASED, dated by capturedAt.
 *    The current code never writes Order.paymentStatus = PAID or paidAt, so
 *    orders marked PAID are reported separately as `markedPaid` (count, amount,
 *    undated) — they are not treated as received money.
 *  Approved, not yet paid (now) — eligible orders whose paymentStatus ≠ PAID.
 *  Refunds (period) — FinancialAuditLog REFUND_ISSUED rows in the period (the
 *    only dated refund record). Orders marked REFUNDED are a current count.
 *  Cancelled (period) — orders whose CANCELLED history row falls in the
 *    period (orders cancelled without a history row are counted as undated).
 *  Orders requiring action (now) — see orderAttention.
 */

export interface SaleLineFacts {
    productId: string | null;
    name: string;
    image: string | null;
    quantity: number;
    /** Buyer price for one ordered unit (EUR). */
    price: number;
    /** Supplier net price for one ordered unit, when recorded. */
    supplierUnitPrice: number | null;
    supplierId: string | null;
    supplierName: string | null;
    /** Cases this line represents (stock-ledger casesForItem); 0 when unknown. */
    cases?: number;
}

export interface EligibleOrder {
    id: string;
    totalAmount: number;
    recognizedAt: Date;
    paymentStatus: string;
    lines: SaleLineFacts[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Orders that count as sales, with when they were recognised. */
export function eligibleOrders<T extends OrderFacts & { id: string; totalAmount: number; paymentStatus: string; lines: SaleLineFacts[] }>(orders: T[]): EligibleOrder[] {
    const out: EligibleOrder[] = [];
    for (const o of orders) {
        const at = saleRecognizedAt(o);
        if (!at) continue;
        out.push({ id: o.id, totalAmount: Number(o.totalAmount) || 0, recognizedAt: at, paymentStatus: o.paymentStatus, lines: o.lines });
    }
    return out;
}

export interface PeriodCommercial {
    orderValue: number;
    orders: number;
    aov: number | null;
    supplierNet: number;
    /** Lines in the period with / without a recorded supplier price. */
    linesWithNet: number;
    linesWithoutNet: number;
    /** Order value − supplier net; null unless every line has a supplier price. */
    margin: number | null;
    /** Atlantis revenue (buyer price − supplier net) on the lines that have a supplier price. */
    revenueRecorded: number;
    casesSold: number;
    productsSold: number;
    lines: number;
}

function periodTotals(orders: EligibleOrder[]): PeriodCommercial {
    let value = 0, net = 0, withNet = 0, withoutNet = 0, revenue = 0, cases = 0, lines = 0;
    const products = new Set<string>();
    for (const o of orders) {
        value += o.totalAmount;
        for (const l of o.lines) {
            lines++;
            cases += Number(l.cases) || 0;
            if (l.productId) products.add(l.productId);
            if (l.supplierUnitPrice == null) { withoutNet++; continue; }
            withNet++;
            net += l.supplierUnitPrice * l.quantity;
            revenue += ((Number(l.price) || 0) - l.supplierUnitPrice) * l.quantity;
        }
    }
    const n = orders.length;
    return {
        orderValue: r2(value), orders: n, aov: n > 0 ? r2(value / n) : null,
        supplierNet: r2(net), linesWithNet: withNet, linesWithoutNet: withoutNet,
        margin: n > 0 && withoutNet === 0 && withNet > 0 ? r2(value - net) : null,
        revenueRecorded: r2(revenue), casesSold: cases, productsSold: products.size, lines,
    };
}

export function commercialSummary(all: EligibleOrder[], range: Pick<ResolvedRange, 'start' | 'end' | 'buckets' | 'previous'>) {
    const cur = all.filter((o) => within(o.recognizedAt, range.start, range.end));
    const prev = all.filter((o) => within(o.recognizedAt, range.previous.start, range.previous.end));
    const current = periodTotals(cur), previous = periodTotals(prev);

    const series = range.buckets.map((b) => ({ key: b.key, start: b.start.toISOString(), end: b.end.toISOString(), partial: b.partial, orderValue: 0, orders: 0 }));
    for (const o of cur) {
        const i = bucketIndex(range, o.recognizedAt);
        if (i < 0) continue;
        series[i].orderValue += o.totalAmount;
        series[i].orders += 1;
    }
    series.forEach((s) => { s.orderValue = r2(s.orderValue); });

    const products = new Map<string, { productId: string; name: string; image: string | null; orderValue: number; units: number; orders: Set<string> }>();
    const suppliers = new Map<string, { supplierId: string; name: string; orderValue: number; supplierNet: number; netComplete: boolean; orders: Set<string>; lines: number }>();
    for (const o of cur) {
        for (const l of o.lines) {
            const lineValue = (Number(l.price) || 0) * l.quantity;
            if (l.productId) {
                const p = products.get(l.productId) || { productId: l.productId, name: l.name, image: l.image, orderValue: 0, units: 0, orders: new Set<string>() };
                p.orderValue += lineValue; p.units += Number(l.cases) || 0; p.orders.add(o.id);
                products.set(l.productId, p);
            }
            if (l.supplierId) {
                const s = suppliers.get(l.supplierId) || { supplierId: l.supplierId, name: l.supplierName || '', orderValue: 0, supplierNet: 0, netComplete: true, orders: new Set<string>(), lines: 0 };
                s.orderValue += lineValue; s.lines++; s.orders.add(o.id);
                if (l.supplierUnitPrice == null) s.netComplete = false; else s.supplierNet += l.supplierUnitPrice * l.quantity;
                suppliers.set(l.supplierId, s);
            }
        }
    }
    const topProducts = [...products.values()]
        .map((p) => ({ productId: p.productId, name: p.name, image: p.image, orderValue: r2(p.orderValue), units: p.units, orders: p.orders.size }))
        .sort((a, b) => b.orderValue - a.orderValue || b.units - a.units || a.name.localeCompare(b.name)).slice(0, 5);
    const topSuppliers = [...suppliers.values()]
        .map((s) => ({ supplierId: s.supplierId, name: s.name, orderValue: r2(s.orderValue), supplierNet: s.netComplete ? r2(s.supplierNet) : null, orders: s.orders.size, lines: s.lines }))
        .sort((a, b) => b.orderValue - a.orderValue || b.orders - a.orders || a.name.localeCompare(b.name)).slice(0, 5);

    return {
        current, previous,
        change: {
            orderValue: pctChange(current.orderValue, previous.orderValue), orders: pctChange(current.orders, previous.orders),
            aov: current.aov != null && previous.aov != null ? pctChange(current.aov, previous.aov) : null,
            casesSold: pctChange(current.casesSold, previous.casesSold),
            // Revenue compares only when both periods are fully covered by supplier prices.
            revenue: current.linesWithoutNet === 0 && previous.linesWithoutNet === 0 && previous.linesWithNet > 0 ? pctChange(current.revenueRecorded, previous.revenueRecorded) : null,
        },
        series, topProducts, topSuppliers,
    };
}

export interface PaymentFacts { amount: number; currency: string | null; capturedAt: Date | string | null }

/**
 * Payments received: Stripe-confirmed escrow records, dated by capturedAt. Only
 * EUR amounts are summed (the marketplace currency); records in another
 * currency, or without a capture date, are counted separately and never added.
 */
export function paymentsSummary(rows: PaymentFacts[], range: Pick<ResolvedRange, 'start' | 'end' | 'previous'>) {
    const eur = rows.filter((r) => String(r.currency || '').toUpperCase() === 'EUR' && r.capturedAt);
    const pick = (from: Date, to: Date) => eur.filter((r) => within(new Date(r.capturedAt!), from, to));
    const sum = (xs: PaymentFacts[]) => r2(xs.reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const cur = pick(range.start, range.end), prev = pick(range.previous.start, range.previous.end);
    return {
        current: { amount: sum(cur), payments: cur.length },
        previous: { amount: sum(prev), payments: prev.length },
        change: prev.length ? pctChange(sum(cur), sum(prev)) : null,
        excluded: rows.length - eur.length,
        recordsEver: rows.length,
    };
}

/** Events with a date (refund rows, cancellation history rows) counted per period. */
export function datedEventsSummary(rows: { at: Date | string; amount?: number | null }[], range: Pick<ResolvedRange, 'start' | 'end' | 'previous'>) {
    const pick = (from: Date, to: Date) => rows.filter((r) => within(new Date(r.at), from, to));
    const cur = pick(range.start, range.end), prev = pick(range.previous.start, range.previous.end);
    const amount = (xs: typeof rows) => r2(xs.reduce((s, r) => s + (Number(r.amount) || 0), 0));
    return { current: { count: cur.length, amount: amount(cur) }, previous: { count: prev.length, amount: amount(prev) }, change: pctChange(cur.length, prev.length) };
}

export interface OpenOrderFacts {
    id: string;
    status: string;
    reviewStatus: string | null;
    termsVersion: number;
    buyerAcceptedVersion?: number | null;
    supplierIds: string[];
    confirmations: Confirmation[];
}

/**
 * What the open orders are waiting for right now — the same confirmation rules
 * as the order workflow (order-workflow.ts), so this agrees with /admin/orders.
 *
 *  readyForApproval — every supplier accepted; Atlantis has to approve.
 *  needsDecision    — a supplier rejected or let the deadline pass; Atlantis has
 *                     to amend or reject the order.
 *  waitingSuppliers — suppliers still have time to answer (no admin action yet).
 *  legacyPending    — placed before the workflow; managed with the status controls.
 *  waitingBuyer     — approved with changed terms; the buyer has to accept.
 *  requiresAction   = readyForApproval + needsDecision + legacyPending.
 */
export function orderAttention(orders: OpenOrderFacts[], now: Date = new Date()) {
    const out = { readyForApproval: 0, needsDecision: 0, waitingSuppliers: 0, legacyPending: 0, waitingBuyer: 0, requiresAction: 0 };
    for (const o of orders) {
        if (o.status === 'CANCELLED') continue;
        const review = o.reviewStatus || 'LEGACY';
        if (review === 'APPROVED') { if (buyerMustAccept({ reviewStatus: review, termsVersion: o.termsVersion, buyerAcceptedVersion: o.buyerAcceptedVersion })) out.waitingBuyer++; continue; }
        if (!['PENDING', 'PAID'].includes(o.status)) continue;
        if (review === 'LEGACY') { out.legacyPending++; continue; }
        if (review !== 'PENDING_REVIEW') continue;
        const state = confirmationState(o.confirmations, o.termsVersion, o.supplierIds, now);
        if (state.anyRejected || state.anyExpired) out.needsDecision++;
        else if (state.allAccepted) out.readyForApproval++;
        else out.waitingSuppliers++;
    }
    out.requiresAction = out.readyForApproval + out.needsDecision + out.legacyPending;
    return out;
}

/** Each product counted once per tile; tiles may overlap. Rejected listings are closed and only counted as rejected. */
export function catalogHealth(products: { status: string; missing: number; hasImage: boolean }[]) {
    const open = products.filter((p) => p.status !== 'REJECTED');
    return {
        total: products.length,
        byStatus: products.reduce<Record<string, number>>((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {}),
        missingInfo: open.filter((p) => p.missing > 0).length,
        missingImages: open.filter((p) => !p.hasImage).length,
        liveIncomplete: products.filter((p) => p.status === 'APPROVED' && p.missing > 0).length,
    };
}
