import { COUNTRIES } from '@/lib/countries';

/**
 * Country-of-origin search for the product editor. The stored value is the
 * English name from COUNTRIES (the same list and rules as the server,
 * backend/src/products/country-canon.ts); the label is localised with
 * Intl.DisplayNames. Search matches the label, the English name, the ISO code,
 * common aliases and the country's name in the other interface languages.
 */

export const foldText = (s: string) => String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’‘`´ʼ.]/g, '').replace(/\s+/g, ' ').trim();

const ALIASES: Record<string, string> = {
    uk: 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
    usa: 'US', 'united states of america': 'US', america: 'US', uae: 'AE', emirates: 'AE', ksa: 'SA', saudi: 'SA',
    holland: 'NL', 'the netherlands': 'NL', nederland: 'NL', czechia: 'CZ', turkiye: 'TR', 'north macedonia': 'MK',
    eswatini: 'SZ', 'cote divoire': 'CI', 'timor leste': 'TL', 'cabo verde': 'CV', 'vatican city': 'VA', 'holy see': 'VA',
    'russian federation': 'RU', 'viet nam': 'VN', burma: 'MM', palestine: 'PS', macau: 'MO', eire: 'IE', brasil: 'BR',
};
/** Names that aren't one country: never resolved to one. */
const AMBIGUOUS = new Set(['congo', 'korea', 'virgin islands', 'eu', 'europe', 'european union', 'asia', 'africa', 'middle east', 'gcc']);
const OTHER_LANGS = ['en', 'ar', 'fr', 'ro', 'it', 'es', 'pt', 'de', 'pl', 'nl', 'tr', 'hu', 'cs', 'el', 'bg'];

export interface CountryOption { iso: string; name: string; label: string; flag: string; keys: string[] }

let extraNames: Map<string, Set<string>> | null = null;
/** Every country's name in the other languages (folded), built once. */
function namesIn(): Map<string, Set<string>> {
    if (extraNames) return extraNames;
    const m = new Map<string, Set<string>>();
    for (const c of COUNTRIES) m.set(c.iso, new Set([foldText(c.name)]));
    for (const lang of OTHER_LANGS) {
        try {
            const dn = new Intl.DisplayNames([lang], { type: 'region' });
            for (const c of COUNTRIES) { const n = dn.of(c.iso); if (n && n !== c.iso) m.get(c.iso)!.add(foldText(n)); }
        } catch { /* older browsers: English names and aliases only */ }
    }
    for (const [alias, iso] of Object.entries(ALIASES)) m.get(iso)?.add(alias);
    for (const set of Array.from(m.values())) for (const a of Array.from(AMBIGUOUS)) set.delete(a);
    extraNames = m;
    return m;
}

/** All countries, labelled and sorted in the interface language. */
export function countryOptions(intl: string): CountryOption[] {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([intl], { type: 'region' }); } catch { dn = null; }
    const extra = namesIn();
    const list = COUNTRIES.map((c) => {
        const label = (dn && dn.of(c.iso)) || c.name;
        return { iso: c.iso, name: c.name.trim(), label, flag: c.flag, keys: Array.from(new Set([foldText(label), ...Array.from(extra.get(c.iso) ?? [])])) };
    });
    const coll = new Intl.Collator(intl);
    return list.sort((a, b) => coll.compare(a.label, b.label));
}

/** Countries matching `q`: name starts with it, then a word starts with it, then contains it. */
export function searchCountries(options: CountryOption[], q: string, limit = 50): CountryOption[] {
    const k = foldText(q).replace(/^(made in|product of) /, '');
    if (!k) return options;
    const scored: { o: CountryOption; s: number }[] = [];
    for (const o of options) {
        // The name shown in the interface language ranks above names in other languages.
        const label = o.keys[0], words = (x: string) => x.split(/[\s-]/).some((w) => w.startsWith(k));
        let s = -1;
        if (k.length === 2 && o.iso.toLowerCase() === k) s = 0;
        else if (label.startsWith(k)) s = 1;
        else if (o.keys.some((x) => x.startsWith(k))) s = 2;
        else if (words(label)) s = 3;
        else if (o.keys.some(words)) s = 4;
        else if (k.length >= 3 && o.keys.some((x) => x.includes(k))) s = 5;
        if (s >= 0) scored.push({ o, s });
    }
    return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.o);
}

/** The one country `raw` names exactly (code in capitals, name in any language, alias), else null. */
export function exactCountry(options: CountryOption[], raw: string): CountryOption | null {
    const t = String(raw ?? '').trim();
    if (/^[A-Z]{2}$/.test(t)) { const byCode = options.find((o) => o.iso === t); if (byCode) return byCode; } // "UK" falls through to the aliases
    const k = foldText(t).replace(/^(made in|product of) /, '');
    if (!k || AMBIGUOUS.has(k)) return null;
    const hits = options.filter((o) => o.keys.includes(k));
    // A clash between languages: the English name decides, otherwise nothing is chosen.
    return hits.length === 1 ? hits[0] : hits.find((o) => foldText(o.name) === k) ?? null;
}

/** "Bucharest, Romania" → Romania (only when exactly one part is a country). A suggestion, never applied by itself. */
export function suggestCountry(options: CountryOption[], raw: string): CountryOption | null {
    const parts = String(raw ?? '').split(/[,;/|()[\]]|\s[-–—]\s/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const found = new Map<string, CountryOption>();
    for (const p of parts) { const c = exactCountry(options, p); if (c) found.set(c.iso, c); }
    return found.size === 1 ? Array.from(found.values())[0] : null;
}

export const isCanonicalCountry = (name: string) => COUNTRIES.some((c) => c.name.trim() === name);
