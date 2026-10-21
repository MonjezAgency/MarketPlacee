import { BadRequestException, ConflictException } from '@nestjs/common';
import { CouponRefusal } from './coupon-rules';

/** What priceCart hands to order creation when a coupon applied. */
export interface AppliedCoupon {
    id: string;
    code: string;
    discount: number;
    usageLimit: number | null;
    perCustomerLimit: number | null;
}

/**
 * Records one redemption inside the order's transaction (call it after the order row exists).
 *
 * 1. Conditional increment of usedCount: only while the coupon is still active, inside its window and below
 *    its usage limit. Postgres re-checks the WHERE on the latest row version after waiting for the row lock,
 *    so two concurrent orders can never take the last use — the loser matches 0 rows and its order rolls back.
 * 2. That UPDATE holds the coupon row lock until commit, so concurrent orders with the same code are serialised
 *    here; the per-buyer count that follows therefore sees every committed redemption.
 * 3. One CouponRedemption row per order (orderId unique) — the coupon is applied once.
 */
export async function recordRedemption(tx: any, c: AppliedCoupon, orderId: string, customerId: string, now = new Date()) {
    const where: any = { id: c.id, isActive: true, expirationDate: { gte: now }, OR: [{ startsAt: null }, { startsAt: { lte: now } }] };
    if (c.usageLimit != null) where.usedCount = { lt: c.usageLimit };
    const res = await tx.coupon.updateMany({ where, data: { usedCount: { increment: 1 } } });
    if (!res || res.count === 0) {
        throw new ConflictException({ code: 'INVALID_COUPON', reason: 'EXHAUSTED', message: 'This promo code was just used up or switched off. Remove it to place the order at the full price.' });
    }
    if (c.perCustomerLimit != null) {
        const used = await tx.couponRedemption.count({ where: { couponId: c.id, customerId } });
        if (used >= c.perCustomerLimit) {
            throw new BadRequestException({ code: 'INVALID_COUPON', reason: 'CUSTOMER_LIMIT', message: c.perCustomerLimit === 1 ? 'You have already used this promo code.' : `You have already used this promo code ${c.perCustomerLimit} times, the most allowed per account.` });
        }
    }
    await tx.couponRedemption.create({ data: { couponId: c.id, orderId, customerId, discount: c.discount } });
}

/** CouponRefusal → the 400 the quote and order endpoints return (code kept as INVALID_COUPON for existing clients). */
export function refusalToHttp(e: CouponRefusal): never {
    throw new BadRequestException({ code: 'INVALID_COUPON', reason: e.reason, message: e.message, ...e.detail });
}
