import { buildBrandCanon } from './brand-canon';

/**
 * The brand catalog: one canonical display name per brand, built from the
 * brands products already carry. There is deliberately no Brand table —
 * Product.brand stays the stored display name (backward compatible with every
 * reader: PDP, filters, search, exports), and this module decides what counts
 * as "the same brand" and which spelling is canonical.
 *
 * Same brand  = same match key (case, accents, extra spaces, apostrophes and
 *               punctuation ignored): "PRIME", " prime " → "Prime";
 *               "Kellogg's", "Kelloggs", "KELLOGG’S" → one brand.
 *               These are normalised automatically on save.
 * Similar     = a close spelling (same letters without spaces, or a small
 *               edit distance): "Primee", "Coca Cola" vs "CocaCola". Only ever
 *               SUGGESTED ("Did you mean Prime?"), never applied.
 * New brand   = no match. Allowed only when the supplier explicitly confirms
 *               it (editor: `newBrand: true`; import: the review lists it and
 *               the supplier confirms the import).
 */

const APOSTROPHES = /['’‘`´ʼ]/g;
/** Match key: lower case, no accents, no apostrophes, other punctuation → space, single spaces. */
export function brandMatchKey(b: string | null | undefined): string {
    return String(b ?? '')
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(APOSTROPHES, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}
/** Key without spaces, for "similar" checks only ("coca cola" ~ "cocacola"). */
export const brandCompactKey = (b: string | null | undefined) => brandMatchKey(b).replace(/ /g, '');
/** What we store for a new brand: the supplier's spelling, trimmed and with single spaces. */
export const tidyBrand = (b: string | null | undefined) => String(b ?? '').trim().replace(/\s+/g, ' ');

export function levenshtein(a: string, b: string, max = Infinity): number {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            rowMin = Math.min(rowMin, cur[j]);
        }
        if (rowMin > max) return max + 1;
        prev = cur;
    }
    return prev[b.length];
}

export interface BrandEntry { name: string; key: string; compact: string; count: number; variants: string[] }
export interface BrandCatalog { entries: BrandEntry[]; byKey: Map<string, BrandEntry> }

/** Group brand spellings (with product counts) into one entry per brand. */
export function buildBrandCatalog(groups: { brand: string | null; count: number }[]): BrandCatalog {
    const canon = buildBrandCanon(groups, brandMatchKey);
    const counts = new Map<string, number>();
    for (const g of groups) { const k = brandMatchKey(g.brand); if (k) counts.set(k, (counts.get(k) ?? 0) + g.count); }
    const entries: BrandEntry[] = [];
    const byKey = new Map<string, BrandEntry>();
    canon.display.forEach((name, key) => {
        const variants = Array.from(new Set((canon.variants.get(key) ?? []).map(tidyBrand))).filter((v) => v !== name);
        const e: BrandEntry = { name, key, compact: key.replace(/ /g, ''), count: counts.get(key) ?? 0, variants };
        entries.push(e);
        byKey.set(key, e);
    });
    entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { entries, byKey };
}

/** Close spellings of `input` that are NOT the same brand. Suggestions only. */
export function similarBrands(cat: BrandCatalog, input: string, limit = 3): BrandEntry[] {
    const key = brandMatchKey(input), compact = key.replace(/ /g, '');
    if (compact.length < 3) return [];
    const max = compact.length <= 5 ? 1 : 2;
    return cat.entries
        .filter((e) => e.key !== key)
        .map((e) => ({ e, d: e.compact === compact ? 0 : levenshtein(e.compact, compact, max) }))
        .filter((x) => x.d <= max)
        .sort((a, b) => a.d - b.d || b.e.count - a.e.count)
        .slice(0, limit)
        .map((x) => x.e);
}

export interface BrandSearchResult {
    brands: { name: string; count: number; variants: string[] }[];
    /** The canonical name when the query is exactly a known brand (after normalisation). */
    exact: string | null;
    /** Close spellings, only when nothing matched exactly. Never auto-selected. */
    similar: { name: string; count: number }[];
}

/** Prefix first, then a word starting with the query, then "contains"; ties by usage. */
export function searchBrands(cat: BrandCatalog, q: string, limit = 20): BrandSearchResult {
    const key = brandMatchKey(q), compact = key.replace(/ /g, '');
    const pick = (e: BrandEntry) => ({ name: e.name, count: e.count, variants: e.variants.slice(0, 5) });
    if (!key) return { brands: cat.entries.slice(0, limit).map(pick), exact: null, similar: [] };
    const scored: { e: BrandEntry; s: number }[] = [];
    for (const e of cat.entries) {
        let s = -1;
        if (e.key.startsWith(key) || e.compact.startsWith(compact)) s = 0;
        else if (e.key.split(' ').some((w) => w.startsWith(key)) || e.key.includes(` ${key}`)) s = 1;
        else if (e.compact.includes(compact)) s = 2;
        if (s >= 0) scored.push({ e, s });
    }
    scored.sort((a, b) => a.s - b.s || b.e.count - a.e.count || a.e.name.localeCompare(b.e.name));
    const exact = cat.byKey.get(key)?.name ?? null;
    const brands = scored.slice(0, limit).map((x) => pick(x.e));
    const shown = new Set(brands.map((b) => b.name));
    const similar = exact ? [] : similarBrands(cat, q, 3).filter((e) => !shown.has(e.name)).map((e) => ({ name: e.name, count: e.count }));
    return { brands, exact, similar };
}

export type BrandResolution =
    | { kind: 'empty' }
    | { kind: 'known'; name: string; changed: boolean }
    | { kind: 'new'; name: string; similar: string[] };

/** What a submitted brand becomes: the canonical name, or a new brand (with suggestions). */
export function resolveBrand(cat: BrandCatalog, input: string | null | undefined): BrandResolution {
    const typed = tidyBrand(input);
    if (!brandMatchKey(typed)) return { kind: 'empty' };
    const hit = cat.byKey.get(brandMatchKey(typed));
    if (hit) return { kind: 'known', name: hit.name, changed: hit.name !== typed };
    return { kind: 'new', name: typed, similar: similarBrands(cat, typed).map((e) => e.name) };
}
