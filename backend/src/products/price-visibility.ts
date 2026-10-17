/**
 * Wholesale prices are for signed-in accounts only. Anonymous catalog
 * responses keep every product field except commercial pricing, so the
 * storefront can't reveal it even if a client ignores the UI.
 */
const PRICE_FIELDS = ['price', 'basePrice', 'previousPrice', 'priceChangedAt', 'variantPrices', 'tieredPrices', 'activeOffer', 'promotion'] as const;

export function stripPrices<T>(p: T): T {
    if (!p || typeof p !== 'object') return p;
    const out: any = { ...(p as any) };
    for (const k of PRICE_FIELDS) delete out[k];
    out.price = null;
    out.pricesHidden = true;
    return out;
}

export const stripPriceList = <T>(list: T[]): T[] => (Array.isArray(list) ? list.map(stripPrices) : list);
