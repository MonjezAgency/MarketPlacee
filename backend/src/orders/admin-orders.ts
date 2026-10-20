import type { Prisma } from '@prisma/client';
import { buyerMustAccept, confirmationState, workflowBlocker, type Confirmation } from './order-workflow';
import { orderAttention, type OpenOrderFacts } from '../admin/admin-overview';

/**
 * Admin → Order management (GET /orders/admin/list, /orders/admin/export,
 * /orders/admin/:id/detail). Pure rules, tested in __tests__/admin-orders.spec.ts.
 * Read-only: nothing here changes an order, a payment or a status. Every
 * figure is a recorded field or a sum of recorded fields; what the data model
 * doesn't record is returned as null and labelled "not recorded" by the page.
 *
 * DEFINITIONS
 *  Status counts      — Order.status, the six real statuses, all orders (now).
 *  Requiring action   — the Founder Overview's orderAttention (admin-overview.ts):
 *                       ready for approval + needs a decision (a supplier rejected
 *                       or let the deadline pass) + legacy orders waiting for the
 *                       status controls. One order's bucket = nextAction() below,
 *                       which applies the same rules to a single order.
 *  Suppliers on an order — product owners on its lines, plus the suppliers asked to
 *                       confirm it (OrderSupplierConfirmation). The second source
 *                       covers mixed loads, whose line has no single product.
 *  Returned / refunded — not counted: there is no return record, nothing writes
 *                       Order.paymentStatus = REFUNDED, and EscrowTransaction
 *                       REFUNDED is also written when a card hold is voided. Payment
 *                       status filter values are the values actually stored.
 */

export const ORDER_STATUSES = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export const ORDER_SORTS = ['newest', 'oldest', 'updated', 'total_desc', 'total_asc'] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];
/** Queue filters; each is one orderAttention bucket (or their union). */
export const ATTENTION = ['requires_action', 'ready', 'decision', 'legacy', 'waiting_suppliers', 'waiting_buyer'] as const;
export type Attention = (typeof ATTENTION)[number];
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
export const EXPORT_MAX_ROWS = 10_000;

export class OrderListQueryError extends Error {
    constructor(public readonly code: string, message: string) { super(message); }
}

export interface OrderListQuery {
    q: string;
    status: (typeof ORDER_STATUSES)[number] | null;
    paymentStatus: string | null;
    supplierId: string | null;
    buyerId: string | null;
    /** createdAt ≥ from (inclusive) */
    from: Date | null;
    /** createdAt < to (exclusive) */
    to: Date | null;
    attention: Attention | null;
    sort: OrderSort;
    page: number;
    limit: number;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date bound. A full ISO instant is used as sent (the page sends the start of
 * the chosen local day). A bare YYYY-MM-DD is a UTC day: `from` starts it, `to`
 * includes it (the bound becomes the next UTC midnight).
 */
export function parseBound(raw: unknown, which: 'from' | 'to'): Date | null {
    const s = str(raw);
    if (!s) return null;
    if (DAY_RE.test(s)) {
        const d = new Date(`${s}T00:00:00.000Z`);
        if (Number.isNaN(d.getTime())) throw new OrderListQueryError('INVALID_DATE', `"${which}" is not a valid date.`);
        return which === 'to' ? new Date(d.getTime() + 86_400_000) : d;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new OrderListQueryError('INVALID_DATE', `"${which}" is not a valid date.`);
    return d;
}

/** Normalises query parameters. Unknown filter values are ignored; impossible dates are refused. */
export function parseOrderListQuery(raw: Record<string, unknown> = {}, opts: { maxLimit?: number } = {}): OrderListQuery {
    const status = str(raw.status).toUpperCase();
    const sort = str(raw.sort).toLowerCase();
    const attention = str(raw.attention).toLowerCase();
    const page = Math.floor(Number(raw.page));
    const limit = Math.floor(Number(raw.limit));
    const max = opts.maxLimit ?? MAX_LIMIT;
    const from = parseBound(raw.from, 'from');
    const to = parseBound(raw.to, 'to');
    if (from && to && from.getTime() >= to.getTime()) throw new OrderListQueryError('INVALID_RANGE', 'The start date must be before the end date.');
    const pay = str(raw.paymentStatus).toUpperCase();
    const supplierId = str(raw.supplier);
    const buyerId = str(raw.buyer);
    return {
        q: str(raw.q).replace(/^#/, '').slice(0, 120),
        status: (ORDER_STATUSES as readonly string[]).includes(status) ? (status as OrderListQuery['status']) : null,
        // Stored as free text (schema comment: UNPAID | PROCESSING | PAID | FAILED | REFUNDED); any safe token is a filter.
        paymentStatus: /^[A-Z_]{2,32}$/.test(pay) ? pay : null,
        supplierId: ID_RE.test(supplierId) ? supplierId : null,
        buyerId: ID_RE.test(buyerId) ? buyerId : null,
        from, to,
        attention: (ATTENTION as readonly string[]).includes(attention) ? (attention as Attention) : null,
        sort: (ORDER_SORTS as readonly string[]).includes(sort) ? (sort as OrderSort) : 'newest',
        page: Number.isFinite(page) && page >= 1 ? page : 1,
        limit: Number.isFinite(limit) && limit >= 1 ? Math.min(limit, max) : DEFAULT_LIMIT,
    };
}

/**
 * Prisma filter for the list and the export. `attentionIds` is the set of order
 * ids in the requested queue (computed with nextAction); null = no queue filter.
 */
export function buildOrderWhere(q: OrderListQuery, attentionIds: string[] | null = null): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = [];
    if (q.status) and.push({ status: q.status as any });
    if (q.paymentStatus) and.push({ paymentStatus: q.paymentStatus });
    if (q.buyerId) and.push({ customerId: q.buyerId });
    if (q.supplierId) and.push({ OR: [{ items: { some: { product: { supplierId: q.supplierId } } } }, { confirmations: { some: { supplierId: q.supplierId } } }] });
    if (q.from || q.to) and.push({ createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } });
    if (attentionIds) and.push({ id: { in: attentionIds } });
    if (q.q) {
        const term = q.q;
        const insensitive = { contains: term, mode: 'insensitive' as const };
        and.push({
            OR: [
                // Order references ("#0A2ECA1E") are the last 8 characters of the id, upper-case; ids are stored lower-case.
                { id: { contains: term.replace(/^#/, '').toLowerCase() } },
                { customer: { is: { OR: [{ name: insensitive }, { companyName: insensitive }, { email: insensitive }] } } },
                { items: { some: { OR: [{ productNameSnapshot: insensitive }, { product: { is: { OR: [{ name: insensitive }, { ean: { contains: term } }] } } }] } } },
            ],
        });
    }
    return and.length ? { AND: and } : {};
}

export function orderByFor(sort: OrderSort): Prisma.OrderOrderByWithRelationInput[] {
    switch (sort) {
        case 'oldest': return [{ createdAt: 'asc' }, { id: 'asc' }];
        case 'updated': return [{ updatedAt: 'desc' }, { id: 'asc' }];
        case 'total_desc': return [{ totalAmount: 'desc' }, { createdAt: 'desc' }];
        case 'total_asc': return [{ totalAmount: 'asc' }, { createdAt: 'desc' }];
        default: return [{ createdAt: 'desc' }, { id: 'asc' }];
    }
}

/** The order reference buyers and suppliers see in emails, invoices and notifications: the last 8 characters of the id. */
export const orderRef = (id: string) => id.slice(-8).toUpperCase();

/** Every supplier on an order: product owners on its lines and the suppliers asked to confirm it. */
export function supplierIdsOf(o: { items: { product?: { supplierId?: string | null } | null; mixedLoadSupplierId?: string | null }[]; confirmations?: { supplierId: string }[] }): string[] {
    const ids = new Set<string>();
    for (const i of o.items) {
        if (i.product?.supplierId) ids.add(i.product.supplierId);
        if (i.mixedLoadSupplierId) ids.add(i.mixedLoadSupplierId);
    }
    for (const c of o.confirmations || []) if (c.supplierId) ids.add(c.supplierId);
    return [...ids];
}

/**
 * What an order is waiting for, from the order workflow rules.
 *  APPROVE         every supplier accepted the current terms — Atlantis approves.   (requires action)
 *  DECIDE          a supplier rejected or let the deadline pass — amend or reject.   (requires action)
 *  LEGACY_CONFIRM  placed before the workflow; confirm with the status controls.     (requires action)
 *  WAIT_SUPPLIERS  suppliers still have time to answer.
 *  WAIT_BUYER      approved with changed terms; the buyer has to accept them.
 *  SHIP            confirmed and being prepared; next step is dispatch.
 *  DELIVER         dispatched; next step is delivery.
 *  null            nothing open (delivered, cancelled, rejected).
 */
export type NextAction = 'APPROVE' | 'DECIDE' | 'LEGACY_CONFIRM' | 'WAIT_SUPPLIERS' | 'WAIT_BUYER' | 'SHIP' | 'DELIVER';
export const REQUIRES_ACTION: NextAction[] = ['APPROVE', 'DECIDE', 'LEGACY_CONFIRM'];

export function nextAction(o: OpenOrderFacts, now: Date = new Date()): NextAction | null {
    if (o.status === 'CANCELLED') return null;
    const review = o.reviewStatus || 'LEGACY';
    if (review === 'APPROVED' && buyerMustAccept({ reviewStatus: review, termsVersion: o.termsVersion, buyerAcceptedVersion: o.buyerAcceptedVersion })) return 'WAIT_BUYER';
    if (['PENDING', 'PAID'].includes(o.status)) {
        if (review === 'LEGACY') return 'LEGACY_CONFIRM';
        if (review !== 'PENDING_REVIEW') return null;
        const state = confirmationState(o.confirmations, o.termsVersion, o.supplierIds, now);
        if (state.anyRejected || state.anyExpired) return 'DECIDE';
        if (state.allAccepted) return 'APPROVE';
        return 'WAIT_SUPPLIERS';
    }
    if (review === 'REJECTED') return null;
    if (o.status === 'PROCESSING') return 'SHIP';
    if (o.status === 'SHIPPED') return 'DELIVER';
    return null;
}

const BUCKET: Record<Exclude<Attention, 'requires_action'>, NextAction> = { ready: 'APPROVE', decision: 'DECIDE', legacy: 'LEGACY_CONFIRM', waiting_suppliers: 'WAIT_SUPPLIERS', waiting_buyer: 'WAIT_BUYER' };

/** Counts (identical to orderAttention) plus the ids in each queue, for the queue filters. */
export function attentionQueues(orders: OpenOrderFacts[], now: Date = new Date()) {
    const counts = orderAttention(orders, now);
    const ids: Record<Attention, string[]> = { requires_action: [], ready: [], decision: [], legacy: [], waiting_suppliers: [], waiting_buyer: [] };
    for (const o of orders) {
        const a = nextAction(o, now);
        if (!a) continue;
        for (const [k, v] of Object.entries(BUCKET)) if (v === a) ids[k as Attention].push(o.id);
        if (REQUIRES_ACTION.includes(a)) ids.requires_action.push(o.id);
    }
    return { counts, ids };
}

/** The six statuses with their counts (missing statuses are 0). */
export function statusCounts(groups: { status: string; count: number }[]) {
    const by = new Map(groups.map((g) => [g.status, g.count]));
    const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, by.get(s) ?? 0])) as Record<(typeof ORDER_STATUSES)[number], number>;
    return { total: ORDER_STATUSES.reduce((t, s) => t + byStatus[s], 0), byStatus };
}

/** Distinct orders per supplier from (orderId, supplierId) pairs that may repeat. */
export function ordersPerKey(pairs: { orderId: string; key: string | null | undefined }[]): Map<string, number> {
    const seen = new Map<string, Set<string>>();
    for (const p of pairs) {
        if (!p.key) continue;
        const s = seen.get(p.key) || new Set<string>();
        s.add(p.orderId);
        seen.set(p.key, s);
    }
    return new Map([...seen.entries()].map(([k, s]) => [k, s.size]));
}

// ─── CSV ───────────────────────────────────────────────────────────────

/** One CSV cell: quoted when needed; a leading = + - @ (or tab/CR) is neutralised so spreadsheets don't run it as a formula. */
export function csvCell(v: unknown): string {
    if (v === null || v === undefined) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: unknown[][]): string {
    // BOM so spreadsheet apps read UTF-8 (names with accents, Arabic company names).
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const CSV_HEADER = ['Order ref', 'Order id', 'Created (UTC)', 'Status', 'Review status', 'Payment status', 'Buyer company', 'Buyer name', 'Buyer email', 'Suppliers', 'Lines', 'Goods total (EUR)', 'Delivery charge recorded (EUR)', 'Next action'];

// ─── Detail ────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface MoneyLine { quantity: number; price: number; supplierUnitPrice: number | null }

/**
 * Money on one order, from recorded fields only.
 *  linesSubtotal  Σ line price × quantity (buyer prices, EUR).
 *  coupon         the code recorded in the order terms; couponDiscount = linesSubtotal − goodsTotal, only when a code is recorded.
 *  goodsTotal     Order.totalAmount (what the order is for; freight quoted later is not in it).
 *  freight        Order.shippingCost when recorded; otherwise null with the terms' freight status.
 *  totalWithFreight goodsTotal + freight, only when freight is recorded.
 *  vat            never recorded on orders → null.
 *  supplierNet / markup (staff with net access) — over lines with a recorded supplier price; linesWithoutNet says how many lack one.
 */
export function moneySummary(o: { totalAmount: number; shippingCost: number | null; coupon: string | null; freightStatus: string | null }, lines: MoneyLine[]) {
    const linesSubtotal = r2(lines.reduce((s, l) => s + (Number(l.price) || 0) * l.quantity, 0));
    const goodsTotal = r2(Number(o.totalAmount) || 0);
    const diff = r2(linesSubtotal - goodsTotal);
    let net = 0, markup = 0, withNet = 0;
    for (const l of lines) {
        if (l.supplierUnitPrice == null) continue;
        withNet++;
        net += l.supplierUnitPrice * l.quantity;
        markup += ((Number(l.price) || 0) - l.supplierUnitPrice) * l.quantity;
    }
    const freight = o.shippingCost == null ? null : r2(o.shippingCost);
    return {
        currency: 'EUR' as const,
        linesSubtotal,
        coupon: o.coupon || null,
        couponDiscount: o.coupon && diff > 0.005 ? diff : null,
        /** Line totals and the order total disagree without a recorded coupon (e.g. an amendment); shown, never explained away. */
        unexplainedDifference: !o.coupon && Math.abs(diff) > 0.005 ? diff : null,
        goodsTotal,
        freight,
        freightStatus: freight != null ? (o.freightStatus === 'priced' ? 'priced' : 'set_by_atlantis') : (o.freightStatus === 'priced' ? 'priced' : 'quote_required'),
        totalWithFreight: freight != null ? r2(goodsTotal + freight) : null,
        vat: null,
        supplierNet: withNet ? r2(net) : null,
        markupOnRecordedLines: withNet ? r2(markup) : null,
        linesWithNet: withNet,
        linesWithoutNet: lines.length - withNet,
    };
}

/** Status changes the server would accept now (ORDER_TRANSITIONS + workflow rules), with the reason when one is blocked. */
export function statusOptions(order: { status: string; reviewStatus: string; termsVersion: number; buyerAcceptedVersion?: number | null }, transitions: Record<string, string[]>) {
    return (transitions[order.status] || []).map((to) => ({ to, blocker: workflowBlocker(order, to) }));
}

export type TimelineKind =
    | 'CREATED' | 'STATUS' | 'NOTE' | 'CONFIRMATION_REQUESTED' | 'CONFIRMATION_DECIDED' | 'REVIEWED' | 'BUYER_ACCEPTED'
    | 'INSPECTION' | 'SHIPMENT_CREATED' | 'SHIPMENT_UPDATE' | 'PAYMENT_MARKED_PAID' | 'CARD_CAPTURED' | 'CARD_RELEASED'
    | 'INVOICE_ISSUED' | 'INVOICE_PAID' | 'DISPUTE_OPENED' | 'DISPUTE_RESOLVED';
export interface TimelineEvent { kind: TimelineKind; at: string; actor?: string | null; status?: string | null; from?: string | null; note?: string | null; supplier?: string | null; version?: number | null; ref?: string | null }

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Every dated record about the order, oldest first. Records without a timestamp are left out (never dated by guess). */
export function buildTimeline(o: {
    createdAt: Date | string;
    history: { createdAt: Date | string; previousStatus: string | null; newStatus: string; reason: string | null; actor: string | null }[];
    confirmations: { supplier: string; termsVersion: number; status: string; requestedAt: Date | string | null; decidedAt: Date | string | null; note: string | null }[];
    review: { status: string; at: Date | string | null; note: string | null; actor: string | null };
    buyerAccepted: { at: Date | string | null; version: number | null };
    inspections: { status: string; inspectedAt: Date | string | null; createdAt: Date | string; inspectorName: string | null }[];
    shipment: { createdAt: Date | string; carrier: string | null; trackingNumber: string; updates: { createdAt: Date | string; status: string; description: string; location: string | null }[] } | null;
    paidAt: Date | string | null;
    card: { capturedAt: Date | string | null; releasedAt: Date | string | null } | null;
    invoices: { invoiceNumber: string; createdAt: Date | string; paidAt: Date | string | null }[];
    disputes: { reason: string; status: string; createdAt: Date | string; resolvedAt: Date | string | null }[];
}): TimelineEvent[] {
    const out: TimelineEvent[] = [];
    const push = (e: Omit<TimelineEvent, 'at'> & { at: Date | string | null | undefined }) => { const at = iso(e.at); if (at) out.push({ ...e, at } as TimelineEvent); };
    push({ kind: 'CREATED', at: o.createdAt });
    for (const h of o.history) {
        // The first history row is the creation itself ("Order created"); log rows keep the same status (prev = new).
        const isCreation = !h.previousStatus && h.newStatus === 'PENDING' && Math.abs(new Date(h.createdAt).getTime() - new Date(o.createdAt).getTime()) < 60_000;
        if (isCreation) { if (h.reason && h.reason !== 'Order created') push({ kind: 'NOTE', at: h.createdAt, note: h.reason, actor: h.actor }); continue; }
        if (h.previousStatus && h.previousStatus === h.newStatus) push({ kind: 'NOTE', at: h.createdAt, note: h.reason, actor: h.actor, status: h.newStatus });
        else push({ kind: 'STATUS', at: h.createdAt, from: h.previousStatus, status: h.newStatus, note: h.reason, actor: h.actor });
    }
    for (const c of o.confirmations) {
        push({ kind: 'CONFIRMATION_REQUESTED', at: c.requestedAt, supplier: c.supplier, version: c.termsVersion });
        if (c.decidedAt) push({ kind: 'CONFIRMATION_DECIDED', at: c.decidedAt, supplier: c.supplier, version: c.termsVersion, status: c.status, note: c.note });
    }
    if (o.review.at && ['APPROVED', 'REJECTED'].includes(o.review.status)) push({ kind: 'REVIEWED', at: o.review.at, status: o.review.status, note: o.review.note, actor: o.review.actor });
    if (o.buyerAccepted.at) push({ kind: 'BUYER_ACCEPTED', at: o.buyerAccepted.at, version: o.buyerAccepted.version });
    for (const i of o.inspections) push({ kind: 'INSPECTION', at: i.inspectedAt || i.createdAt, status: i.status, actor: i.inspectorName });
    if (o.shipment) {
        push({ kind: 'SHIPMENT_CREATED', at: o.shipment.createdAt, ref: o.shipment.trackingNumber, note: o.shipment.carrier });
        for (const u of o.shipment.updates) push({ kind: 'SHIPMENT_UPDATE', at: u.createdAt, status: u.status, note: [u.description, u.location].filter(Boolean).join(' · ') });
    }
    push({ kind: 'PAYMENT_MARKED_PAID', at: o.paidAt });
    if (o.card) { push({ kind: 'CARD_CAPTURED', at: o.card.capturedAt }); push({ kind: 'CARD_RELEASED', at: o.card.releasedAt }); }
    for (const inv of o.invoices) { push({ kind: 'INVOICE_ISSUED', at: inv.createdAt, ref: inv.invoiceNumber }); push({ kind: 'INVOICE_PAID', at: inv.paidAt, ref: inv.invoiceNumber }); }
    for (const d of o.disputes) { push({ kind: 'DISPUTE_OPENED', at: d.createdAt, note: d.reason }); if (d.resolvedAt) push({ kind: 'DISPUTE_RESOLVED', at: d.resolvedAt, status: d.status }); }
    // Stable: same instant keeps insertion order (creation before its first status row).
    return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i).map((x) => x.e);
}

/** Variant picks without internal keys (__translations etc.). */
export function cleanVariants(v: unknown): Record<string, string> | null {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (!k.startsWith('__') && val != null && typeof val !== 'object') out[k] = String(val);
    return Object.keys(out).length ? out : null;
}

// ─── Loads ─────────────────────────────────────────────────────────────
//
// What the data model records about loads (orders.service.ts createOrder):
//  MIXED_LOAD   one OrderItem per server-validated mixed pallet / truck (mixedLoadId set,
//               MixedLoad.kind PALLET | TRUCK, quantity 1, price = the load's buyer price).
//               mixComposition = one entry per product+variant in the load:
//               { productId, name, variant, quantity, unit, cases, unitPrice, lineSubtotal,
//                 discountPercent?, stockCases? } — unitPrice / lineSubtotal are BUYER prices: the
//               quote that is stored is buyer-priced (pricing.ts priceLoad applies the mix markup
//               before anything leaves the server). The supplier net of each product is not recorded.
//  VARIANT_MIX  legacy "mix this truck" composer: one OrderItem for one product (productId set,
//               no mixedLoadId), selectedTier pallet | truck, quantity 1, mixComposition
//               [{ signature, quantity, unitPrice }] with unitPrice the buyer price per case
//               (pallet mix) or per pallet (truck mix), as quoted at order time.
//  STANDARD     every other OrderItem: one product, quantity × selectedTier (case/pallet/truck).
// Nothing records how standard lines are consolidated into physical vehicles, so each
// standard line is its own entry and the page says so. "Mixed" is never inferred from an
// order having several products — only from mixedLoadId / mixComposition.

export type LoadType = 'MIXED_LOAD' | 'VARIANT_MIX' | 'STANDARD';

export interface CompositionEntry {
    productId: string | null; name: string | null; variant: string | null;
    quantity: number | null; unit: string | null; cases: number | null; stockCases: number | null;
    discountPercent: number | null;
    /** Supplier net of the entry: never recorded on mixed loads, so always null (kept for the response shape; removed by redactNet). */
    supplierUnitPrice: number | null; supplierLineTotal: number | null;
    /** Buyer price of this entry as recorded at order time (null when not recorded). */
    unitPrice: number | null; lineTotal: number | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Normalises a stored mixComposition (either shape above). Null when there is none. */
export function normaliseComposition(raw: unknown, line: { mixedLoad: boolean; tier: string | null; buyerTotal: number }): CompositionEntry[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const tier = String(line.tier || '').toLowerCase();
    // Legacy entries carry no unit: the composer filled a pallet with cases and a truck with pallets.
    const legacyUnit = tier === 'pallet' ? 'case' : tier === 'truck' ? 'pallet' : null;
    const entries = raw.map((c: any): CompositionEntry => {
        const quantity = num(c?.quantity);
        const unit = text(c?.unit) ?? (line.mixedLoad ? null : legacyUnit);
        const unitPrice = num(c?.unitPrice);
        const recordedSubtotal = num(c?.lineSubtotal);
        return {
            productId: text(c?.productId), name: text(c?.name), variant: text(c?.variant) ?? text(c?.signature),
            quantity, unit,
            cases: num(c?.cases) ?? (!line.mixedLoad && unit === 'case' ? quantity : null),
            stockCases: num(c?.stockCases), discountPercent: num(c?.discountPercent),
            supplierUnitPrice: null, supplierLineTotal: null,
            unitPrice,
            lineTotal: recordedSubtotal ?? (unitPrice != null && quantity != null ? r2(unitPrice * quantity) : null),
        };
    });
    void line.buyerTotal;
    return entries;
}

export interface LoadLine {
    id: string; tier: string | null; quantity: number; lineTotal: number;
    supplierLineTotal?: number | null;
    mixedLoadId?: string | null; mixedLoad: { id: string; kind: string } | null;
    mixComposition: CompositionEntry[] | null;
    supplier: { id: string; name: string | null } | null;
}

export interface OrderLoad {
    /** The OrderItem id this load is recorded on. */
    lineId: string;
    type: LoadType;
    /** PALLET | TRUCK for mixed loads: from MixedLoad.kind, else from the line's tier; null when neither is recorded. */
    mixedKind: 'PALLET' | 'TRUCK' | null;
    /** MIXED_LOAD only: whether the MixedLoad record still exists. */
    loadRecordFound: boolean | null;
    tier: string | null; quantity: number;
    entries: number;
    buyerTotal: number;
    /** OWNER / ADMIN only: supplier net of the load, null when any part of it is not recorded. */
    supplierNet: number | null;
}

const kindOf = (k: unknown): 'PALLET' | 'TRUCK' | null => { const s = String(k || '').toUpperCase(); return s === 'PALLET' || s === 'TRUCK' ? s : null; };

/** One entry per OrderItem, typed from what the record says (never from the number of products). */
export function buildLoads(lines: LoadLine[]): OrderLoad[] {
    return lines.map((l) => {
        const isMixedLoad = !!(l.mixedLoadId || l.mixedLoad);
        const comp = l.mixComposition && l.mixComposition.length ? l.mixComposition : null;
        const type: LoadType = isMixedLoad ? 'MIXED_LOAD' : comp ? 'VARIANT_MIX' : 'STANDARD';
        const tierKind = kindOf(l.tier === 'truck' ? 'TRUCK' : l.tier === 'pallet' ? 'PALLET' : null);
        return {
            lineId: l.id, type,
            mixedKind: type === 'STANDARD' ? null : (kindOf(l.mixedLoad?.kind) ?? tierKind),
            loadRecordFound: type === 'MIXED_LOAD' ? !!l.mixedLoad : null,
            tier: l.tier, quantity: l.quantity,
            entries: comp ? comp.length : 1,
            buyerTotal: r2(l.lineTotal),
            // Only a supplier price recorded on the order line counts; mixed-load contents carry buyer prices.
            supplierNet: l.supplierLineTotal != null ? r2(l.supplierLineTotal) : null,
        };
    });
}

/** Order-level totals over the loads; supplier net only when every load records it. */
export function loadTotals(loads: OrderLoad[]) {
    const missing = loads.filter((l) => l.supplierNet == null).length;
    return {
        loads: loads.length,
        mixedLoads: loads.filter((l) => l.type === 'MIXED_LOAD').length,
        variantMixes: loads.filter((l) => l.type === 'VARIANT_MIX').length,
        standardLines: loads.filter((l) => l.type === 'STANDARD').length,
        buyerTotal: r2(loads.reduce((s, l) => s + l.buyerTotal, 0)),
        supplierNet: loads.length && missing === 0 ? r2(loads.reduce((s, l) => s + (l.supplierNet as number), 0)) : null,
        loadsWithoutNet: missing,
    };
}

/**
 * Staff without net-price access (support, moderation, logistics) get the same
 * detail without supplier net prices or the Atlantis markup. Applied to the
 * whole response, including the workflow terms and the mixed-load contents.
 */
export function redactNet<T extends Record<string, any>>(detail: T): T {
    const stripOne = (l: any) => { const { supplierUnitPrice: _a, supplierLineTotal: _b, ...rest } = l || {}; return rest; };
    const strip = (lines: any) => (Array.isArray(lines) ? lines.map((l: any) => {
        const rest: any = stripOne(l);
        if (Array.isArray(rest.mixComposition)) rest.mixComposition = rest.mixComposition.map(stripOne);
        return rest;
    }) : lines);
    const terms = (t: any) => (t && typeof t === 'object' ? { ...t, lines: strip(t.lines) } : t);
    const out: any = { ...detail, netVisible: false, lines: strip(detail.lines) };
    if (Array.isArray(out.loads)) out.loads = out.loads.map((l: any) => ({ ...l, supplierNet: null }));
    if (out.loadTotals) out.loadTotals = { ...out.loadTotals, supplierNet: null, loadsWithoutNet: null };
    if (out.money) out.money = { ...out.money, supplierNet: null, markupOnRecordedLines: null, linesWithNet: null, linesWithoutNet: null };
    // The card record's fee / supplier split reveals the margin too.
    if (out.payment?.card) out.payment = { ...out.payment, card: { ...out.payment.card, platformFee: null, supplierAmount: null } };
    if (out.workflow) out.workflow = { ...out.workflow, terms: terms(out.workflow.terms), submittedTerms: terms(out.workflow.submittedTerms) };
    return out;
}

export type { Confirmation };
