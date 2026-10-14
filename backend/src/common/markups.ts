import type { Markups } from './price-privacy';

/**
 * Current tier markups from AppConfig (same keys and defaults as the rest of
 * the platform), cached for a minute. Server-side use only — never sent to
 * non-staff clients (see price-privacy.ts).
 */
let cache: { at: number; m: Markups } | null = null;
export async function readMarkups(prisma: any): Promise<Markups> {
    if (cache && Date.now() - cache.at < 60_000) return cache.m;
    const keys = ['MARKUP_PERCENTAGE_PIECE', 'MARKUP_PERCENTAGE', 'MARKUP_PERCENTAGE_PALLET', 'MARKUP_PERCENTAGE_CONTAINER', 'MARKUP_PERCENTAGE_MIX'];
    const rows = await prisma.appConfig.findMany({ where: { key: { in: keys } } }).catch(() => [] as any[]);
    const val = (k: string) => { const r = rows.find((x: any) => x.key === k); const n = r ? parseFloat(r.value) : NaN; return Number.isFinite(n) && n >= 1 ? n : null; };
    const m = {
        piece: val('MARKUP_PERCENTAGE_PIECE') ?? val('MARKUP_PERCENTAGE') ?? 1.1,
        pallet: val('MARKUP_PERCENTAGE_PALLET') ?? 1.05,
        container: val('MARKUP_PERCENTAGE_CONTAINER') ?? 1.02,
        mix: val('MARKUP_PERCENTAGE_MIX') ?? 1.15,
    };
    cache = { at: Date.now(), m };
    return m;
}

/** Buyer-facing listed price for one case at the case tier (EUR), or null without a supplier price. */
export function buyerCasePrice(p: { basePrice?: number | null }, m: Markups): number | null {
    return typeof p.basePrice === 'number' && p.basePrice > 0 ? Math.round(p.basePrice * m.piece * 100) / 100 : null;
}

/** Cases needed to meet a product's minimum order (0 when no MOQ). */
export function minOrderCases(p: { moq?: number | null; moqUnit?: string | null; unitsPerCase?: number | null; casesPerPallet?: number | null; palletsPerShipment?: number | null }): number {
    const u = String(p.moqUnit || 'PIECE').toUpperCase(), n = Number(p.moq) || 0;
    if (!n) return 0;
    if (u === 'CASE') return n;
    if (u === 'PALLET') return n * (Number(p.casesPerPallet) || 0);
    if (u === 'TRUCK') return n * (Number(p.casesPerPallet) || 0) * (Number(p.palletsPerShipment) || 0);
    const upc = Number(p.unitsPerCase) || 0;
    return upc ? Math.ceil(n / upc) : 0;
}

/** Drop the cached markups (call after an admin changes them). */
export function invalidateMarkups() { cache = null; }

/**
 * After a markup change, record the new listed price of every live product
 * so price history shows the change on the day it happened. Inserts only
 * where the price actually moved.
 */
export async function recordAllListedPrices(prisma: any): Promise<number> {
    invalidateMarkups();
    const m = await readMarkups(prisma);
    const products = await prisma.product.findMany({ where: { status: 'APPROVED', basePrice: { gt: 0 } }, select: { id: true, basePrice: true } });
    let n = 0;
    for (const p of products) {
        const price = buyerCasePrice(p, m);
        if (price === null) continue;
        const last = await prisma.priceObservation.findFirst({ where: { productId: p.id }, orderBy: { observedAt: 'desc' }, select: { casePrice: true } });
        if (last && Math.abs(last.casePrice - price) < 0.005) continue;
        await prisma.priceObservation.create({ data: { productId: p.id, casePrice: price, source: 'PRICE_CHANGE' } });
        n++;
    }
    return n;
}
