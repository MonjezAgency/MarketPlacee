import { COUNTRY_NAMES } from '../shipping/delivery-policy';

/**
 * Country of origin — where the product was made. Not the EXW location, not a
 * warehouse, not the delivery destination (those are separate fields).
 *
 * Product.origin keeps storing a plain string, as before, but always the
 * canonical English country name from the ISO 3166-1 list Atlantis already
 * ships (shipping/delivery-policy.ts COUNTRY_NAMES, the same list as the
 * storefront's country picker, frontend/src/lib/countries.ts). The name, not
 * the code, because the product page, the origin filter and older listings
 * all read `origin` as a display name; the UI localises it via the ISO code.
 *
 * Accepted input: the English name, the ISO alpha-2 code in capitals ("PL"),
 * common aliases ("UK", "Holland", "Türkiye", "UAE") and the country's name
 * in the main European languages and Arabic ("Deutschland", "Polska",
 * "Allemagne", "مصر"), with or without "Made in". Anything else is never
 * guessed: "Bucharest, Romania" only SUGGESTS Romania (the country part), a
 * city alone is unknown, and "Congo" / "Korea" / "EU" are ambiguous.
 */

const fold = (s: string) => String(s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’‘`´ʼ]/g, '').replace(/[.‏‎]/g, '').replace(/\s+/g, ' ').trim();

const NAMES: Record<string, string> = Object.fromEntries(Object.entries(COUNTRY_NAMES).map(([c, n]) => [c, n.trim()]));

/** Hand-kept aliases (folded). Official short forms, old/new names, common abbreviations. */
const ALIASES: Record<string, string> = {
    uk: 'GB', 'u k': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
    'united kingdom of great britain and northern ireland': 'GB',
    usa: 'US', 'u s a': 'US', 'u s': 'US', 'united states of america': 'US', america: 'US',
    uae: 'AE', 'u a e': 'AE', emirates: 'AE', ksa: 'SA', saudi: 'SA', 'kingdom of saudi arabia': 'SA',
    holland: 'NL', 'the netherlands': 'NL', nederland: 'NL',
    czechia: 'CZ', turkiye: 'TR', 'republic of turkiye': 'TR',
    'north macedonia': 'MK', eswatini: 'SZ', 'cote divoire': 'CI', 'timor leste': 'TL', 'cabo verde': 'CV',
    'vatican city': 'VA', 'holy see': 'VA', 'russian federation': 'RU', 'republic of korea': 'KR', 'korea republic': 'KR',
    'dprk': 'KP', 'viet nam': 'VN', 'lao pdr': 'LA', 'burma': 'MM', 'palestine': 'PS', macau: 'MO', 'hong kong sar': 'HK',
    'republic of moldova': 'MD', 'republic of ireland': 'IE', eire: 'IE', 'brasil': 'BR',
};
/** Names that are not one country. Rejected with a clear reason instead of guessed. */
const AMBIGUOUS: Record<string, string[]> = {
    congo: ['CD', 'CG'], korea: ['KR', 'KP'], 'virgin islands': ['VG', 'US'],
    eu: [], 'e u': [], europe: [], 'european union': [], 'made in eu': [], 'made in the eu': [], asia: [], africa: [], 'middle east': [], gcc: [], benelux: [], scandinavia: [], 'various': [], 'mixed': [], 'multiple': [],
};

/** Country names in other languages, from the runtime's ICU data. Collisions are dropped. */
const LOCAL_LANGS = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ro', 'nl', 'pl', 'ar', 'tr', 'hu', 'cs', 'sk', 'el', 'bg', 'hr', 'sl', 'sv', 'da', 'fi', 'no'];
const BY_NAME = (() => {
    const m = new Map<string, string>();
    const clash = new Set<string>();
    const add = (name: string, code: string) => {
        const k = fold(name);
        if (!k || k.length < 3) return;
        const had = m.get(k);
        if (had && had !== code) clash.add(k); else m.set(k, code);
    };
    try {
        for (const lang of LOCAL_LANGS) {
            const dn = new (Intl as any).DisplayNames([lang], { type: 'region' });
            for (const c of Object.keys(NAMES)) { const n = dn.of(c); if (n && n !== c) add(n, c); }
        }
    } catch { /* no ICU region names: the English names and aliases still work */ }
    clash.forEach((k) => m.delete(k));
    // The English list and the hand-kept aliases always win over a translated name.
    for (const [c, n] of Object.entries(NAMES)) m.set(fold(n), c);
    for (const [k, c] of Object.entries(ALIASES)) m.set(k, c);
    for (const k of Object.keys(AMBIGUOUS)) m.delete(k); // e.g. Spanish "Congo" must not decide between the two Congos
    return m;
})();

export const countryNameOf = (code: string) => NAMES[code] ?? null;
export const isCanonicalOrigin = (v: string | null | undefined) => !!v && Object.values(NAMES).includes(String(v));

export type OriginResolution =
    | { kind: 'empty' }
    | { kind: 'country'; code: string; name: string; changed: boolean }
    /** The value isn't a country, but one part of it is ("Bucharest, Romania"). Never applied automatically. */
    | { kind: 'suggest'; code: string; name: string }
    | { kind: 'ambiguous'; options: { code: string; name: string }[] }
    | { kind: 'unknown' };

function exact(raw: string): string | null {
    const t = raw.trim();
    if (/^[A-Z]{2}$/.test(t) && NAMES[t]) return t;                 // ISO code, written in capitals only ("no" is not Norway)
    const k = fold(t).replace(/^(made in|produced in|product of|country of origin:?|origin:?)\s+/, '').replace(/^the /, '');
    return BY_NAME.get(k) ?? null;
}

/** "PL", "Poland", "Polska", "Made in Poland" → Poland. Never guesses. */
export function resolveOrigin(input: string | null | undefined): OriginResolution {
    const raw = String(input ?? '').trim();
    if (!raw) return { kind: 'empty' };
    const hit = exact(raw);
    if (hit) return { kind: 'country', code: hit, name: NAMES[hit], changed: NAMES[hit] !== raw };
    const k = fold(raw).replace(/^(made in|produced in|product of)\s+/, '').replace(/^the /, '');
    if (k in AMBIGUOUS) return { kind: 'ambiguous', options: AMBIGUOUS[k].map((c) => ({ code: c, name: NAMES[c] })) };
    // "Bucharest, Romania", "Romania - Bucharest", "Ploiești (RO)": look for a country among the parts.
    const parts = raw.split(/[,;/|()\[\]]|\s[-–—]\s/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
        const codes = Array.from(new Set(parts.map(exact).filter((c): c is string => !!c)));
        if (codes.length === 1) return { kind: 'suggest', code: codes[0], name: NAMES[codes[0]] };
        if (codes.length > 1) return { kind: 'ambiguous', options: codes.map((c) => ({ code: c, name: NAMES[c] })) };
    }
    return { kind: 'unknown' };
}

/** One plain-English sentence for a value that can't be saved as the country of origin. */
export function originProblem(input: string, r: OriginResolution): string | null {
    const v = String(input).trim().slice(0, 60);
    if (r.kind === 'suggest') return `“${v}” isn’t a country. Did you mean ${r.name}? Choose the country where the product was made.`;
    if (r.kind === 'ambiguous') return r.options.length
        ? `“${v}” could mean ${r.options.map((o) => o.name).join(' or ')}. Choose the country where the product was made.`
        : `“${v}” isn’t a single country. Choose the country where the product was made.`;
    if (r.kind === 'unknown') return `“${v}” isn’t a country we recognise. Choose the country where the product was made from the list.`;
    return null;
}
