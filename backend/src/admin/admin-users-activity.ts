import { saleRecognizedAt } from '../products/supplier-metrics';

/**
 * Admin → Users → one account: the rules behind the tabs and the money
 * summary (GET /admin/users/:id and its paginated sub-lists), without the
 * database. Read-only; nothing here changes an order, an offer or a product.
 *
 * MONEY DEFINITIONS (the only figures the account page shows)
 *
 *  Counted orders — orders that count as sales (supplier-metrics.ts
 *    saleRecognizedAt): workflow orders approved by Atlantis and not
 *    cancelled, and legacy orders confirmed with the status controls.
 *    Requests still waiting, rejected requests and cancelled orders are never counted.
 *  Gross order value (buyer prices)
 *    Buyer:    Σ Order.totalAmount of the counted orders (goods at buyer
 *              prices, EUR; freight quoted after the order is not in it).
 *    Supplier: Σ OrderItem.price × quantity over THIS supplier's lines on the
 *              counted orders (buyer prices, EUR).
 *  Supplier net value (suppliers only, OWNER/ADMIN only)
 *    Σ OrderItem.supplierUnitPrice × quantity over this supplier's lines,
 *    counted only where the supplier price was recorded; `linesWithoutNet`
 *    says how many lines lack one (the figure is then partial).
 *  Atlantis margin (OWNER/ADMIN only)
 *    Σ (OrderItem.price − supplierUnitPrice) × quantity over the same lines
 *    with a recorded supplier price. Partial under the same rule.
 *  Money received is NOT shown: the only payment records are Stripe escrow
 *  records, and Order.paymentStatus is not a payment record.
 */

export const TAB_LIMIT = 14;
export const TAB_MAX_LIMIT = 50;
/** Staff who may see supplier net prices and the Atlantis margin. */
export const NET_ROLES = ['OWNER', 'ADMIN'] as const;
export const canSeeNet = (role: unknown) => (NET_ROLES as readonly string[]).includes(String(role ?? ''));

export interface TabPage { page: number; limit: number; skip: number }

/** ?page / ?limit for the account tabs: 14 per page by default, at most 50. */
export function parseTabPage(raw: Record<string, unknown> = {}, def = TAB_LIMIT): TabPage {
    const page = Math.floor(Number(raw.page));
    const limit = Math.floor(Number(raw.limit));
    const p = Number.isFinite(page) && page > 0 ? Math.min(page, 100000) : 1;
    const l = Number.isFinite(limit) && limit > 0 ? Math.min(limit, TAB_MAX_LIMIT) : def;
    return { page: p, limit: l, skip: (p - 1) * l };
}

export function pageResult<T>(data: T[], total: number, p: TabPage) {
    return { data, total, page: p.page, limit: p.limit, pages: Math.max(1, Math.ceil(total / p.limit)) };
}

const PRODUCT_STATUSES = ['APPROVED', 'PENDING', 'NEEDS_CHANGES', 'DRAFT', 'REJECTED'];
/** Optional ?status filter for the products tab; unknown values are ignored. */
export function productStatusFilter(raw: unknown): string | null {
    const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    return PRODUCT_STATUSES.includes(s) ? s : null;
}

export interface MoneyOrder {
    status: string; reviewStatus?: string | null; reviewedAt?: Date | string | null; createdAt: Date | string;
    totalAmount: number;
    lines: { quantity: number; price: number; supplierUnitPrice: number | null; supplierId: string | null }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Orders that count as sales (the date does not matter here: all-time totals). */
export function countsAsSale(o: MoneyOrder): boolean {
    return saleRecognizedAt({ status: o.status, reviewStatus: o.reviewStatus, reviewedAt: o.reviewedAt, createdAt: o.createdAt }) !== null;
}

export interface AccountMoney {
    currency: 'EUR';
    countedOrders: number;
    grossValue: number;
    /** Null when hidden (buyers, or a viewer without net access) or when no line has a recorded supplier price. */
    supplierNet: number | null;
    margin: number | null;
    linesCounted: number;
    linesWithoutNet: number;
    netVisible: boolean;
}

/**
 * The money summary for one account. `supplierId` set → supplier view (only
 * that supplier's lines); null → buyer view (whole orders).
 */
export function accountMoney(orders: MoneyOrder[], opts: { supplierId: string | null; netVisible: boolean }): AccountMoney {
    let counted = 0, gross = 0, net = 0, margin = 0, lines = 0, withNet = 0, withoutNet = 0;
    for (const o of orders) {
        if (!countsAsSale(o)) continue;
        const mine = opts.supplierId ? o.lines.filter((l) => l.supplierId === opts.supplierId) : o.lines;
        if (opts.supplierId && !mine.length) continue;
        counted++;
        gross += opts.supplierId
            ? mine.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.quantity) || 0), 0)
            : Number(o.totalAmount) || 0;
        for (const l of mine) {
            lines++;
            if (l.supplierUnitPrice == null || !Number.isFinite(Number(l.supplierUnitPrice))) { withoutNet++; continue; }
            withNet++;
            net += Number(l.supplierUnitPrice) * l.quantity;
            margin += ((Number(l.price) || 0) - Number(l.supplierUnitPrice)) * l.quantity;
        }
    }
    const show = opts.netVisible && withNet > 0;
    return {
        currency: 'EUR',
        countedOrders: counted,
        grossValue: r2(gross),
        supplierNet: show && opts.supplierId ? r2(net) : null,
        margin: show ? r2(margin) : null,
        linesCounted: lines,
        linesWithoutNet: opts.netVisible ? withoutNet : 0,
        netVisible: opts.netVisible,
    };
}

/** Product row for the supplier's products tab. The net price only for staff with net access. */
export function toProductRow(p: { id: string; name: string; ean: string | null; brand: string | null; status: string; images: string[] | null; stock: number; unit: string | null; basePrice: number | null; updatedAt: Date }, netVisible: boolean) {
    return {
        id: p.id, name: p.name, ean: p.ean || null, brand: p.brand || null, status: p.status,
        image: p.images?.[0] ?? null, stock: Number(p.stock) || 0, unit: p.unit || null, updatedAt: p.updatedAt,
        netPrice: netVisible && typeof p.basePrice === 'number' ? p.basePrice : null,
    };
}

/** Offer row. pricePerUnit is the supplier's own price, so it follows the net rule. */
export function toOfferRow(o: { id: string; status: string; unit: string; quantity: number; pricePerUnit: number; validUntil: Date | null; createdAt: Date; productNameSnap: string | null; product: { id: string; name: string } | null }, netVisible: boolean) {
    return {
        id: o.id, status: o.status, unit: o.unit, quantity: o.quantity, validUntil: o.validUntil, createdAt: o.createdAt,
        product: o.product ? { id: o.product.id, name: o.productNameSnap || o.product.name } : null,
        pricePerUnit: netVisible ? o.pricePerUnit : null,
    };
}
