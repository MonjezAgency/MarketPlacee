import { randomInt } from 'crypto';

/**
 * Coupon rules — the one place that decides whether a promo code applies to a cart and how much it takes off.
 * Used by OrdersService.priceCart (quote + order creation) and by the admin/validate endpoints.
 *
 * How a coupon combines with other discounts ("one discount per line"):
 *   Wholesale offers and special offers already discount individual lines (the deeper of the two, never both).
 *   A coupon never touches a line price. It is one order-level discount, computed on the eligible lines' totals
 *   AFTER those line discounts, applied once per order, and it never exceeds the eligible amount (so the goods
 *   total can't go below zero). One coupon per order. The discount is funded by the Ali FMCG margin: supplier
 *   net prices (supplierUnitPrice) are not changed by a coupon.
 *
 * Eligibility:
 *   ALL       every priced line.
 *   CATEGORY  lines whose product's category is one of coupon.categories.
 *   PRODUCTS  lines whose productId is in coupon.productIds ("Products / SKUs": in this catalogue a SKU is a
 *             product — variants have no ids of their own and are priced per product line).
 *   legacy    (scope null) a coupon created "for an offer" (placementId set): that placement's product only —
 *             never a silent fallback to the whole cart. A scope-less row without a placement can't be created
 *             by the admin (placement used to be required); it is read as ALL, which is what such a code did.
 *   Server-saved mixed loads (one line made of several products) are eligible only for ALL coupons.
 *
 * Money is EUR, rounded to cents: percentage = round(eligible × % / 100, 2); fixed = min(amount, eligible).
 */

export type CouponType = 'PERCENT' | 'FIXED';
export type CouponScope = 'ALL' | 'CATEGORY' | 'PRODUCTS';
export type CouponStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'DISABLED' | 'EXHAUSTED';

export interface CouponRecord {
    id?: string;
    code: string;
    discountPercent: number;
    expirationDate: Date | string | null;
    isActive: boolean;
    discountType?: string | null;
    amountOff?: number | null;
    startsAt?: Date | string | null;
    minOrderAmount?: number | null;
    usageLimit?: number | null;
    perCustomerLimit?: number | null;
    usedCount?: number | null;
    scope?: string | null;
    categories?: string[] | null;
    productIds?: string[] | null;
    description?: string | null;
    placementId?: string | null;
    placement?: { productId?: string | null } | null;
}

/** Codes are case-insensitive: stored and compared upper-case, spaces removed. */
export const normalizeCode = (raw: unknown) => String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** No 0/O, 1/I/L, so a code read aloud or from paper can't be mistyped. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Two groups of four from a CSPRNG, e.g. "K7QM-4XWD" (31^8 ≈ 8.5 × 10^11 combinations). */
export function generateCode(): string {
    const pick = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    return `${pick()}-${pick()}`;
}
/** Custom codes: 4–24 characters, letters, digits and dashes. */
export const CUSTOM_CODE = /^[A-Z0-9](?:[A-Z0-9-]{2,22})[A-Z0-9]$/;

export const typeOf = (c: CouponRecord): CouponType => (c.discountType === 'FIXED' ? 'FIXED' : 'PERCENT');
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/** Effective scope, including how legacy coupons are read. */
export function scopeOf(c: CouponRecord): { scope: CouponScope | 'LEGACY'; categories: string[]; productIds: string[] } {
    if (c.scope === 'ALL') return { scope: 'ALL', categories: [], productIds: [] };
    if (c.scope === 'CATEGORY') return { scope: 'CATEGORY', categories: (c.categories ?? []).filter(Boolean), productIds: [] };
    if (c.scope === 'PRODUCTS') return { scope: 'PRODUCTS', categories: [], productIds: (c.productIds ?? []).filter(Boolean) };
    // Legacy rows (scope null): created against an offer placement → that product only.
    if (c.placementId) return { scope: 'LEGACY', categories: [], productIds: c.placement?.productId ? [c.placement.productId] : [] };
    return { scope: 'ALL', categories: [], productIds: [] };
}

/** Status as of `now`; precedence: disabled > expired > exhausted > scheduled > active. */
export function couponStatus(c: CouponRecord, now = new Date()): CouponStatus {
    if (!c.isActive) return 'DISABLED';
    const end = time(c.expirationDate);
    if (end !== null && now.getTime() > end) return 'EXPIRED';
    if (c.usageLimit != null && (c.usedCount ?? 0) >= c.usageLimit) return 'EXHAUSTED';
    const start = time(c.startsAt);
    if (start !== null && now.getTime() < start) return 'SCHEDULED';
    return 'ACTIVE';
}

export type RefusalCode = 'NOT_FOUND' | 'DISABLED' | 'EXPIRED' | 'NOT_STARTED' | 'EXHAUSTED' | 'CUSTOMER_LIMIT' | 'MIN_ORDER' | 'NOT_ELIGIBLE' | 'NOTHING_TO_DISCOUNT';

export class CouponRefusal extends Error {
    constructor(public reason: RefusalCode, message: string, public detail: Record<string, unknown> = {}) { super(message); }
}

const eur = (n: number) => `€${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Checks that don't depend on the cart (validity window, active flag, limits). Throws CouponRefusal. */
export function assertUsable(c: CouponRecord | null | undefined, opts: { now?: Date; customerUses?: number | null } = {}): asserts c is CouponRecord {
    const now = opts.now ?? new Date();
    if (!c) throw new CouponRefusal('NOT_FOUND', 'That promo code is not valid.');
    const status = couponStatus(c, now);
    if (status === 'DISABLED') throw new CouponRefusal('DISABLED', 'This promo code has been switched off.');
    if (status === 'EXPIRED') throw new CouponRefusal('EXPIRED', 'This promo code has expired.');
    if (status === 'EXHAUSTED') throw new CouponRefusal('EXHAUSTED', 'This promo code has reached its usage limit.');
    if (status === 'SCHEDULED') throw new CouponRefusal('NOT_STARTED', `This promo code is valid from ${new Date(c.startsAt as any).toISOString().slice(0, 16).replace('T', ' ')} UTC.`, { startsAt: new Date(c.startsAt as any).toISOString() });
    if (c.perCustomerLimit != null && opts.customerUses != null && opts.customerUses >= c.perCustomerLimit) {
        throw new CouponRefusal('CUSTOMER_LIMIT', c.perCustomerLimit === 1 ? 'You have already used this promo code.' : `You have already used this promo code ${c.perCustomerLimit} times, the most allowed per account.`);
    }
}

export interface CouponLine { productId: string | null; mixedLoadId?: string | null; lineTotal: number; error?: unknown }

export interface CouponResult {
    discount: number;
    eligibleSubtotal: number;
    eligibleLines: number;
    /** The coupon's own percentage for PERCENT coupons (also when only some lines are eligible); 0 for FIXED. */
    discountPercent: number;
    type: CouponType;
}

/**
 * Discount for a priced cart. `subtotal` is the goods subtotal after line discounts (all priced lines);
 * `categoryOf` gives a product's category. Throws CouponRefusal with a buyer-readable reason.
 */
export function applyCoupon(c: CouponRecord | null | undefined, lines: CouponLine[], subtotal: number, categoryOf: (productId: string) => string | null | undefined, opts: { now?: Date; customerUses?: number | null } = {}): CouponResult {
    assertUsable(c, opts);
    const min = c.minOrderAmount ?? null;
    if (min != null && min > 0 && subtotal + 0.005 < min) {
        throw new CouponRefusal('MIN_ORDER', `This promo code needs a goods subtotal of at least ${eur(min)} (yours is ${eur(subtotal)}).`, { minOrderAmount: min, subtotal });
    }
    const s = scopeOf(c);
    const ok = lines.filter((l) => !l.error && l.lineTotal > 0);
    const eligible = ok.filter((l) => {
        if (s.scope === 'ALL') return true;
        if (!l.productId || l.mixedLoadId) return false;
        if (s.scope === 'CATEGORY') { const cat = categoryOf(l.productId); return !!cat && s.categories.includes(cat); }
        return s.productIds.includes(l.productId);
    });
    const eligibleSubtotal = round2(eligible.reduce((sum, l) => sum + l.lineTotal, 0));
    if (!eligible.length || eligibleSubtotal <= 0) {
        if (s.scope === 'ALL') throw new CouponRefusal('NOTHING_TO_DISCOUNT', 'There is nothing in your order this promo code can discount yet.');
        const what = s.scope === 'CATEGORY' ? `products in ${s.categories.length === 1 ? `the ${s.categories[0]} category` : `these categories: ${s.categories.join(', ')}`}` : 'the specific products it was issued for';
        throw new CouponRefusal('NOT_ELIGIBLE', `This promo code applies only to ${what}, and none are in your order.`, { scope: s.scope === 'LEGACY' ? 'PRODUCTS' : s.scope });
    }
    const type = typeOf(c);
    let discount: number;
    let discountPercent = 0;
    if (type === 'FIXED') {
        discount = round2(Math.min(Math.max(0, Number(c.amountOff) || 0), eligibleSubtotal));
    } else {
        discountPercent = Math.max(0, Math.min(100, Number(c.discountPercent) || 0));
        discount = round2(Math.min(eligibleSubtotal, eligibleSubtotal * discountPercent / 100));
    }
    // Never more than the goods total.
    discount = Math.min(discount, round2(subtotal));
    if (!(discount > 0)) throw new CouponRefusal('NOTHING_TO_DISCOUNT', 'There is nothing in your order this promo code can discount yet.');
    return { discount, eligibleSubtotal, eligibleLines: eligible.length, discountPercent, type };
}

// ── Admin input ──────────────────────────────────────────────────────────

export interface CouponInput {
    code: string;
    discountType: CouponType;
    discountPercent: number;
    amountOff: number | null;
    minOrderAmount: number | null;
    usageLimit: number | null;
    perCustomerLimit: number | null;
    startsAt: Date | null;
    expirationDate: Date;
    scope: CouponScope;
    categories: string[];
    productIds: string[];
    description: string | null;
}

export type FieldErrors = Partial<Record<keyof CouponInput | 'dates', string>>;

const numOrNull = (v: unknown): number | null | typeof NaN => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
};
const dateOrNull = (v: unknown): Date | null | 'invalid' => {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? 'invalid' : d;
};
const cents = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/**
 * Validates a create-coupon body. Returns the clean input or field-level errors (English; the admin UI
 * shows its own translated messages for the same fields and only falls back to these).
 * `code` may be empty only when the caller generates one.
 */
export function parseCouponInput(body: any, now = new Date(), opts: { endMayBePast?: boolean } = {}): { input?: CouponInput; errors?: FieldErrors } {
    const b = body && typeof body === 'object' ? body : {};
    const errors: FieldErrors = {};
    const code = normalizeCode(b.code);
    if (!code) errors.code = 'Generate a code or enter one.';
    else if (!CUSTOM_CODE.test(code)) errors.code = 'Use 4–24 letters, digits or dashes (no dash at the start or end).';

    const discountType: CouponType = b.discountType === 'FIXED' ? 'FIXED' : b.discountType === 'PERCENT' || b.discountType == null ? 'PERCENT' : (errors.discountType = 'Choose percentage or fixed amount.', 'PERCENT');
    let discountPercent = 0, amountOff: number | null = null;
    if (discountType === 'PERCENT') {
        const p = numOrNull(b.discountPercent);
        if (p === null || Number.isNaN(p)) errors.discountPercent = 'Enter a percentage.';
        else if ((p as number) < 1 || (p as number) > 100) errors.discountPercent = 'The percentage must be between 1 and 100.';
        else if (!cents(p as number)) errors.discountPercent = 'Use at most two decimals.';
        else discountPercent = p as number;
    } else {
        const a = numOrNull(b.amountOff);
        if (a === null || Number.isNaN(a)) errors.amountOff = 'Enter an amount in EUR.';
        else if ((a as number) <= 0) errors.amountOff = 'The amount must be more than €0.';
        else if ((a as number) > 1_000_000) errors.amountOff = 'The amount is too large.';
        else if (!cents(a as number)) errors.amountOff = 'Use at most two decimals (cents).';
        else amountOff = a as number;
    }

    const min = numOrNull(b.minOrderAmount);
    let minOrderAmount: number | null = null;
    if (Number.isNaN(min)) errors.minOrderAmount = 'Enter an amount in EUR, or leave it empty.';
    else if (min !== null && ((min as number) < 0 || (min as number) > 100_000_000)) errors.minOrderAmount = 'Enter an amount of €0 or more.';
    else if (min !== null && !cents(min as number)) errors.minOrderAmount = 'Use at most two decimals (cents).';
    else minOrderAmount = min && (min as number) > 0 ? (min as number) : null;

    const intField = (key: 'usageLimit' | 'perCustomerLimit') => {
        const v = numOrNull(b[key]);
        if (v === null) return null;
        if (Number.isNaN(v) || !Number.isInteger(v) || (v as number) < 1 || (v as number) > 1_000_000) { errors[key] = 'Enter a whole number of 1 or more, or leave it empty for no limit.'; return null; }
        return v as number;
    };
    const usageLimit = intField('usageLimit');
    const perCustomerLimit = intField('perCustomerLimit');
    if (usageLimit != null && perCustomerLimit != null && perCustomerLimit > usageLimit) errors.perCustomerLimit = 'The per-buyer limit can’t be higher than the total limit.';

    const s = dateOrNull(b.startsAt);
    const e = dateOrNull(b.expirationDate ?? b.endsAt);
    let startsAt: Date | null = null, expirationDate: Date | null = null;
    if (s === 'invalid') errors.startsAt = 'Enter a valid start date and time.'; else startsAt = s;
    if (e === 'invalid') errors.expirationDate = 'Enter a valid end date and time.';
    else if (e === null) errors.expirationDate = 'Enter an end date and time.';
    else expirationDate = e;
    if (expirationDate && !opts.endMayBePast && expirationDate.getTime() <= now.getTime()) errors.expirationDate = 'The end must be in the future.';
    if (startsAt && expirationDate && startsAt.getTime() >= expirationDate.getTime()) errors.dates = 'The end must be after the start.';

    const scope: CouponScope = b.scope === 'CATEGORY' || b.scope === 'PRODUCTS' || b.scope === 'ALL' ? b.scope : (errors.scope = 'Choose what the code applies to.', 'ALL');
    let categories: string[] = [];
    let productIds: string[] = [];
    if (scope === 'CATEGORY') {
        const raw = Array.isArray(b.categories) ? b.categories : typeof b.category === 'string' ? [b.category] : [];
        categories = [...new Set(raw.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()))] as string[];
        if (!categories.length) errors.categories = 'Choose at least one category.';
        else if (categories.length > 50) errors.categories = 'Choose at most 50 categories.';
    }
    if (scope === 'PRODUCTS') {
        productIds = Array.isArray(b.productIds) ? [...new Set(b.productIds.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()))] as string[] : [];
        if (!productIds.length) errors.productIds = 'Choose at least one product.';
        else if (productIds.length > 500) errors.productIds = 'Choose at most 500 products.';
    }

    const description = typeof b.description === 'string' && b.description.trim() ? b.description.trim().replace(/\s+/g, ' ') : null;
    if (description && description.length > 120) errors.description = 'Keep the description to 120 characters.';

    if (Object.keys(errors).length) return { errors };
    return { input: { code, discountType, discountPercent, amountOff, minOrderAmount, usageLimit, perCustomerLimit, startsAt, expirationDate: expirationDate!, scope, categories, productIds, description } };
}
