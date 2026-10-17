/**
 * The single place that answers "which special offer applies to these
 * products right now". Used by product responses, the cart quote, order
 * creation and mixed loads, always with the current server time, so a
 * cancelled or ended promotion stops applying on the very next request
 * (nothing is cached).
 *
 * `db` is the Prisma client or an interactive-transaction client. Callers
 * that run without the Promotion table (old test doubles) get no promotions.
 */
import { PROMO_MAX_PERCENT } from './promotion-rules';

/** What buyers may see about a running special offer (no campaign name, no supplier data). */
export interface PublicPromotion { id: string; discountPercent: number; startsAt: string; endsAt: string }

/** Running promotions per product (startsAt ≤ now < endsAt, not cancelled). Product approval is the caller's check. */
export async function activePromotions(db: any, productIds: string[], now: Date = new Date()): Promise<Map<string, PublicPromotion>> {
    const out = new Map<string, PublicPromotion>();
    const ids = [...new Set((productIds || []).filter(Boolean))];
    if (!ids.length || !db?.promotion?.findMany) return out;
    const rows = await db.promotion.findMany({
        where: { productId: { in: ids }, status: { not: 'CANCELLED' }, startsAt: { lte: now }, endsAt: { gt: now } },
        select: { id: true, productId: true, discountPercent: true, startsAt: true, endsAt: true },
        orderBy: { discountPercent: 'desc' },
    }).catch(() => [] as any[]);
    for (const r of rows || []) {
        const pct = Number(r.discountPercent);
        // Overlaps are refused on write; if old data ever had two, the deeper one wins (rows are sorted).
        if (out.has(r.productId) || !(pct > 0 && pct <= PROMO_MAX_PERCENT)) continue;
        // The time check is repeated here so a test double / stale row can never widen the window.
        if (new Date(r.startsAt).getTime() > now.getTime() || new Date(r.endsAt).getTime() <= now.getTime()) continue;
        out.set(r.productId, { id: r.id, discountPercent: pct, startsAt: new Date(r.startsAt).toISOString(), endsAt: new Date(r.endsAt).toISOString() });
    }
    return out;
}

/**
 * Promotions that were running and have ended (expired or cancelled while
 * running) in the last `days`, for products with none running now — so the
 * cart can say the normal price applies again.
 */
export async function recentlyEndedPromotions(db: any, productIds: string[], now: Date = new Date(), days = 14): Promise<Map<string, { discountPercent: number; endedAt: string }>> {
    const out = new Map<string, { discountPercent: number; endedAt: string }>();
    const ids = [...new Set((productIds || []).filter(Boolean))];
    if (!ids.length || !db?.promotion?.findMany) return out;
    const since = new Date(now.getTime() - days * 864e5);
    const rows = await db.promotion.findMany({
        where: { productId: { in: ids }, startsAt: { lte: now }, OR: [{ status: { not: 'CANCELLED' }, endsAt: { gt: since, lte: now } }, { status: 'CANCELLED', cancelledAt: { gt: since, lte: now } }] },
        select: { productId: true, discountPercent: true, startsAt: true, endsAt: true, status: true, cancelledAt: true },
    }).catch(() => [] as any[]);
    for (const r of rows || []) {
        const ended = r.status === 'CANCELLED' ? r.cancelledAt : r.endsAt;
        if (!ended) continue;
        const endedAt = new Date(Math.min(new Date(ended).getTime(), new Date(r.endsAt).getTime()));
        // A promotion cancelled before it started never changed a price.
        if (endedAt.getTime() <= new Date(r.startsAt).getTime()) continue;
        const prev = out.get(r.productId);
        if (!prev || new Date(prev.endedAt).getTime() < endedAt.getTime()) out.set(r.productId, { discountPercent: Number(r.discountPercent), endedAt: endedAt.toISOString() });
    }
    return out;
}

/**
 * Adds `promotion` (PublicPromotion) to each approved product that has one
 * running now. Mutates and returns the list. Prices themselves are left as
 * they are: clients apply the percentage the same way the server does.
 */
export async function attachPromotions<T extends { id: string; status?: any }>(db: any, products: T[], now: Date = new Date()): Promise<T[]> {
    const list = (products || []).filter(Boolean);
    if (!list.length) return products;
    const map = await activePromotions(db, list.filter((p) => String(p.status ?? 'APPROVED').toUpperCase() === 'APPROVED').map((p) => p.id), now);
    for (const p of list) {
        const promo = map.get(p.id);
        if (promo) (p as any).promotion = promo;
    }
    return products;
}
