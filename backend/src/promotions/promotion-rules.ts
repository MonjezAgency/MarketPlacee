/**
 * Special offers (Promotion) — the rules, as pure functions so every caller
 * (product responses, cart quote, order creation, mixed loads, the supplier
 * and admin tools) applies exactly the same ones, and they can be unit-tested.
 *
 * Price basis
 *  • A promotion is a percentage off the SUPPLIER NET price (Product.basePrice,
 *    and variant prices in a mixed load). The buyer price is still derived
 *    from that net through the normal tier markup, so the buyer price drops by
 *    the same percentage and the Atlantis markup ratio is untouched. The
 *    supplier funds the discount: the order line's supplierUnitPrice is the
 *    discounted net.
 *  • Suppliers only ever see net prices (original → promotional); buyers only
 *    buyer prices; Atlantis staff see both. The percentage itself is the same
 *    on both sides, so nothing about the margin can be derived from it.
 *  • The percentage applies to the price at the moment of the quote/order.
 *    If the supplier changes the product price while a promotion runs, the
 *    promotion follows the new price (basePriceAtCreation is kept only so the
 *    tools can show "price at creation vs now").
 *  • One discount per line, never stacked: when an approved wholesale offer
 *    (Offer.discountPercent) and a special offer both apply to a single
 *    product line, the deeper of the two is used. Both are applied once, to
 *    the undiscounted price.
 *  • Range 0 < percent ≤ 90 with at most 2 decimals — the same ceiling the
 *    existing wholesale-offer discount has (orders/pricing.ts offerFactor).
 *
 * Lifecycle (derived from time on every request, nothing to schedule):
 *  • CANCELLED  — cancelled by the supplier or Atlantis (the only stored state).
 *  • SCHEDULED  — now < startsAt.
 *  • ACTIVE     — startsAt ≤ now < endsAt and the product is approved.
 *  • ON_HOLD    — inside the window but the product isn't approved (not applied).
 *  • EXPIRED    — now ≥ endsAt.
 * Times are UTC instants; the tools show them in UTC (REPORT_TIME_ZONE).
 */

export const PROMO_MIN_PERCENT = 0;       // exclusive
export const PROMO_MAX_PERCENT = 90;      // inclusive
export const PROMO_MAX_DAYS = 366;
export const PROMO_NAME_MAX = 80;

export type PromotionState = 'SCHEDULED' | 'ACTIVE' | 'ON_HOLD' | 'EXPIRED' | 'CANCELLED';
export const FILTER_STATES = ['SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED'] as const;

export interface PromotionWindow { startsAt: Date | string; endsAt: Date | string; status?: string | null }

export class PromotionError extends Error {
    constructor(public code: string, message: string, public status: 400 | 403 | 404 | 409 = 400, public detail?: Record<string, unknown>) {
        super(message);
    }
}

const ms = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** Time-derived state. `productApproved` = the product is live on Atlantis. */
export function promotionState(p: PromotionWindow, now: Date = new Date(), productApproved = true): PromotionState {
    if (String(p.status || '').toUpperCase() === 'CANCELLED') return 'CANCELLED';
    const t = now.getTime();
    if (t < ms(p.startsAt)) return 'SCHEDULED';
    if (t >= ms(p.endsAt)) return 'EXPIRED';
    return productApproved ? 'ACTIVE' : 'ON_HOLD';
}

/** Whether the promotion changes prices right now. */
export const appliesNow = (p: PromotionWindow, now: Date = new Date(), productApproved = true) => promotionState(p, now, productApproved) === 'ACTIVE';

/** Half-open windows [start, end) overlap. */
export function windowsOverlap(a: { startsAt: Date | string; endsAt: Date | string }, b: { startsAt: Date | string; endsAt: Date | string }): boolean {
    return ms(a.startsAt) < ms(b.endsAt) && ms(b.startsAt) < ms(a.endsAt);
}

/** Validated percentage (0 < p ≤ 90, ≤ 2 decimals). Throws PromotionError. */
export function validatePercent(raw: unknown): number {
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw.replace(',', '.')) : raw;
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new PromotionError('PERCENT_INVALID', 'Enter the discount as a number, for example 15.');
    if (n <= PROMO_MIN_PERCENT) throw new PromotionError('PERCENT_TOO_LOW', 'The discount must be more than 0%.');
    if (n > PROMO_MAX_PERCENT) throw new PromotionError('PERCENT_TOO_HIGH', `The discount can be at most ${PROMO_MAX_PERCENT}%.`);
    if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) throw new PromotionError('PERCENT_PRECISION', 'Use at most 2 decimals for the discount.');
    return Math.round(n * 100) / 100;
}

/** Parses an ISO instant. A value without a zone is read as UTC (the tools work in UTC). */
export function parseInstant(raw: unknown, field: 'startsAt' | 'endsAt'): Date {
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    const s = typeof raw === 'string' ? raw.trim() : '';
    const withZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s}Z` : s;
    const d = s ? new Date(withZone) : new Date(NaN);
    if (Number.isNaN(d.getTime())) throw new PromotionError(field === 'startsAt' ? 'START_INVALID' : 'END_INVALID', field === 'startsAt' ? 'Enter a valid start date and time.' : 'Enter a valid end date and time.');
    return d;
}

/**
 * Validated window. A start in the past means "start now" (it is moved to
 * `now`); the end must be after the start and in the future; at most
 * PROMO_MAX_DAYS long.
 */
export function validateWindow(startRaw: unknown, endRaw: unknown, now: Date = new Date()): { startsAt: Date; endsAt: Date } {
    let startsAt = parseInstant(startRaw, 'startsAt');
    const endsAt = parseInstant(endRaw, 'endsAt');
    if (startsAt.getTime() < now.getTime()) startsAt = new Date(now.getTime());
    if (endsAt.getTime() <= now.getTime()) throw new PromotionError('END_IN_PAST', 'The end date and time must be in the future.');
    if (endsAt.getTime() <= startsAt.getTime()) throw new PromotionError('END_BEFORE_START', 'The end must be after the start.');
    if (endsAt.getTime() - startsAt.getTime() > PROMO_MAX_DAYS * 864e5) throw new PromotionError('TOO_LONG', `A special offer can run for at most ${PROMO_MAX_DAYS} days.`);
    return { startsAt, endsAt };
}

export function cleanName(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (s.length > PROMO_NAME_MAX) throw new PromotionError('NAME_TOO_LONG', `Keep the campaign name under ${PROMO_NAME_MAX} characters.`);
    return s;
}

/** A product can carry a special offer only when it is live and has a valid supplier net price. */
export function productEligibility(p: { status?: string | null; basePrice?: number | null } | null | undefined): { ok: true } | { ok: false; code: string; message: string } {
    if (!p) return { ok: false, code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' };
    const price = p.basePrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return { ok: false, code: 'PRICE_MISSING', message: 'This product has no valid net price yet. Set its price per case first.' };
    if (String(p.status || '').toUpperCase() !== 'APPROVED') return { ok: false, code: 'PRODUCT_NOT_LIVE', message: 'Only live (approved) products can have a special offer.' };
    return { ok: true };
}

/** 1 − p/100 for a valid percentage, else 1. */
export function promoFactor(pct: unknown): number {
    const n = typeof pct === 'number' && Number.isFinite(pct) && pct > PROMO_MIN_PERCENT && pct <= PROMO_MAX_PERCENT ? pct : 0;
    return 1 - n / 100;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Promotional price of `price` (net or buyer), rounded once to the cent. */
export const promoPrice = (price: number, pct: number) => round2(price * promoFactor(pct));

/** The one discount a line gets: the deeper of an approved wholesale offer and a special offer, never both. */
export function bestDiscount(offerPercent: number, promotionPercent: number): { percent: number; source: 'OFFER' | 'PROMOTION' | null } {
    const o = Number(offerPercent) > 0 ? Number(offerPercent) : 0, p = Number(promotionPercent) > 0 ? Number(promotionPercent) : 0;
    if (!o && !p) return { percent: 0, source: null };
    return p >= o ? { percent: p, source: 'PROMOTION' } : { percent: o, source: 'OFFER' };
}

/** Which fields may change in each state (see PromotionsService.update). */
export function editableFields(state: PromotionState): ('discountPercent' | 'startsAt' | 'endsAt' | 'name')[] {
    if (state === 'SCHEDULED') return ['discountPercent', 'startsAt', 'endsAt', 'name'];
    // Running: the price buyers already see stays as it is — only when it ends and the label.
    if (state === 'ACTIVE' || state === 'ON_HOLD') return ['endsAt', 'name'];
    return [];
}
