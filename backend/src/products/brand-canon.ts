/**
 * Brand names are free text on Product, so the same brand can be stored
 * with different spelling ("Prime" / "PRIME" / "Mars "). There is no Brand
 * table; instead, every spelling is grouped by a case- and space-insensitive
 * key and shown with ONE canonical display name: the spelling most products
 * already use (ties: the one that isn't all caps, then alphabetical).
 * Nothing in the database is rewritten.
 */
export const brandKey = (b: string | null | undefined) => String(b ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export interface BrandCanon { display: Map<string, string>; variants: Map<string, string[]> }

/** `key` defaults to brandKey; brand-catalog.ts passes its stricter match key (accents, apostrophes, punctuation). */
export function buildBrandCanon(groups: { brand: string | null; count: number }[], key: (b: string | null | undefined) => string = brandKey): BrandCanon {
    const byKey = new Map<string, { raw: string; count: number }[]>();
    for (const g of groups) {
        const k = key(g.brand);
        if (!k) continue;
        const list = byKey.get(k) ?? [];
        list.push({ raw: g.brand as string, count: g.count });
        byKey.set(k, list);
    }
    const display = new Map<string, string>();
    const variants = new Map<string, string[]>();
    byKey.forEach((list, k) => {
        const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
        const isCaps = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();
        const best = [...list].sort((a, b) =>
            b.count - a.count
            || Number(isCaps(tidy(a.raw))) - Number(isCaps(tidy(b.raw)))
            || tidy(a.raw).localeCompare(tidy(b.raw)))[0];
        display.set(k, tidy(best.raw));
        variants.set(k, list.map((x) => x.raw));
    });
    return { display, variants };
}

export const canonicalBrand = (canon: BrandCanon, b: string | null | undefined) =>
    b == null ? b : (canon.display.get(brandKey(b)) ?? String(b).trim());
