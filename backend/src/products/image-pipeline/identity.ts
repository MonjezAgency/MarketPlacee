import type { Gtin } from './gtin';
import type { CleanName } from './name';
import type { Identity, IdentityRecord } from './types';

const compact = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const overlaps = (a: string, b: string) => { const x = compact(a), y = compact(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };

/** The barcode's first record that names a brand wins over nothing; a supplier's word stands first. */
function mostSaid(values: (string | null)[]): string {
    const count = new Map<string, { value: string; n: number }>();
    for (const v of values) {
        if (!v) continue;
        const k = compact(v);
        const e = count.get(k);
        if (e) e.n++; else count.set(k, { value: v, n: 1 });
    }
    return [...count.values()].sort((a, b) => b.n - a.n)[0]?.value ?? '';
}

/** What this barcode is, from the supplier's row and every source. The barcode is the truth; disagreements are recorded, never resolved quietly. */
export function buildIdentity(gtin: Gtin, name: CleanName, records: IdentityRecord[]): Identity {
    const brand = name.brand || mostSaid(records.map((r) => r.brand));
    const conflicts: string[] = [];
    for (const r of records) if (r.brand && brand && !overlaps(r.brand, brand)) conflicts.push(`brand: ${r.source} says "${r.brand}", row says "${brand}"`);
    const size = name.size || mostSaid(records.map((r) => r.quantity));
    const fromRecords = !name.clean ? mostSaid(records.map((r) => r.name)) : '';
    const matched = records[0]?.code;
    const matchedBy: Identity['matchedBy'] = !records.length ? 'none' : !gtin.caseCode ? 'ean' : records.some((r) => r.code === gtin.caseCode) ? 'case' : matched ? 'inner' : 'none';
    return {
        ean: gtin.canonical, brand, name: name.clean || fromRecords, english: name.english || fromRecords, variant: name.variant, size,
        packLanguage: gtin.gs1?.language || 'en', ...(gtin.gs1 ? { gs1: gtin.gs1 } : {}),
        references: [...new Set(records.flatMap((r) => r.imageUrls))].slice(0, 3), conflicts, matchedBy,
        records: records.map(({ source, code, name: n, brand: b, quantity }) => ({ source, code, name: n, brand: b, quantity })),
    };
}

/** At most two searches: the barcode in quotes, then the brand, name and size. */
export function searchQueries(identity: Identity): { query: string; language: string }[] {
    const list = [{ query: `"${identity.ean}"`, language: 'en' }];
    const has = (text: string, part: string) => compact(text).includes(compact(part));
    let words = identity.name;
    if (identity.brand && !has(words, identity.brand)) words = `${identity.brand} ${words}`.trim();
    if (identity.size && !has(words, identity.size)) words = `${words} ${identity.size}`.trim();
    if (words) list.push({ query: words, language: identity.packLanguage });
    return list;
}
