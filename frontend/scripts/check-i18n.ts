/**
 * Translation validation — runs before every build (npm run build → check:i18n).
 *
 * Fails when:
 *  - the locale configuration is inconsistent (codes, RTL/LTR mapping, Intl tags);
 *  - a dictionary misses a key, has an extra key, or has an empty value;
 *  - a value is an untranslated copy of the English text (unless it is a
 *    brand/technical token or explicitly allowed below with a reason);
 *  - a value looks like a raw key ("searchPlaceholder");
 *  - {placeholders}, <tags> or plural forms differ from English / the
 *    language's plural rules;
 *  - an Arabic value contains no Arabic script;
 *  - a file inside the localized scope renders hard-coded English.
 */
import * as fs from 'fs';
import * as path from 'path';
import { LOCALES, LOCALE_META, type Locale } from '../src/locales/config';
import { parsePlural, variablesOf } from '../src/locales/format';

type Dict = Record<string, unknown>;
const errors: string[] = [];
const warn: string[] = [];

function flatten(obj: Dict, prefix = ''): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Dict, p));
        else out[p] = v;
    }
    return out;
}

/** Values that are legitimately the same in every language. */
const TOKENS = new Set(['atlantis', 'monjez', 'ean', 'exw', 'sku', 'moq', 'b2b', 'fmcg', 'stripe', 'ok', 'pdf', 'csv', 'url', 'id', 'gps', 'https', 'eur', 'usd', 'kyc', 'api', 'iban', 'swift', 'bic', 'logo', 'email', 'e-mail', 'atlan', 'tis', 'vat', 'tva', 'iva', 'cta', 'seo', 'faq']);
function isTokenOnly(v: string) {
    const words = v.replace(/\{[^}]*\}/g, ' ').replace(/<\/?\w+>/g, ' ').toLowerCase().match(/[a-zà-ÿăâîșțşţ]+/gi) || [];
    return words.every((w) => TOKENS.has(w.toLowerCase()));
}

/**
 * Identical-to-English values that are correct in that language, with the reason.
 * Keep this short: anything here is reviewed text, not a fallback.
 */
const IDENTICAL_EVERYWHERE: Record<string, string> = {
    'auth.authApps': 'names of authenticator apps (products)',
    'ads.cocaColaTitle': 'brand name',
};
const IDENTICAL_OK: Partial<Record<Locale, Record<string, string>>> = {
    fr: { 'orders.cartons': '"carton(s)" is the French word (glossary)', 'orders.lineCarton': '"carton(s)" is the French word (glossary)' },
    ro: { 'categories.unisex': 'standard Romanian word', 'userMenu.moderator': 'the Romanian word for the role' },
    it: {},
    es: { 'categories.unisex': 'standard Spanish word', 'cart.subtotal': 'standard Spanish checkout term' },
    pt: { 'cart.subtotal': 'standard Portuguese checkout term' },
};
const identicalOk = (code: Locale, k: string) => !!IDENTICAL_EVERYWHERE[k] || !!IDENTICAL_OK[code]?.[k];

function tagsOf(v: string) { return (v.match(/<(\w+)>/g) || []).sort().join(','); }

async function main() {
    // ── Locale configuration ─────────────────────────────────────────
    if (new Set(LOCALES).size !== LOCALES.length) errors.push('config: duplicate locale codes');
    for (const code of LOCALES) {
        const m = LOCALE_META[code];
        if (!m || m.code !== code) { errors.push(`config: LOCALE_META.${code} missing or mismatched`); continue; }
        const expected = code === 'ar' ? 'rtl' : 'ltr';
        if (m.dir !== expected) errors.push(`config: ${code} must be ${expected}, is ${m.dir}`);
        try { Intl.getCanonicalLocales(m.intl); new Intl.PluralRules(m.intl); } catch { errors.push(`config: ${code} has an invalid Intl tag "${m.intl}"`); }
        if (!m.name.trim()) errors.push(`config: ${code} has no display name`);
    }

    // ── Dictionaries ─────────────────────────────────────────────────
    const dicts: Partial<Record<Locale, Record<string, unknown>>> = {};
    for (const code of LOCALES) {
        const file = path.join(__dirname, '../src/locales', `${code}.ts`);
        if (!fs.existsSync(file)) { errors.push(`${code}: dictionary file src/locales/${code}.ts is missing`); continue; }
        const mod = await import(file);
        const dict = mod[code];
        if (!dict || typeof dict !== 'object') { errors.push(`${code}: src/locales/${code}.ts must export const ${code}`); continue; }
        dicts[code] = flatten(dict);
    }
    const en = dicts.en;
    if (!en || Object.keys(en).length < 100) { console.error('❌ en.ts failed to load or is suspiciously small'); process.exit(1); }
    const enKeys = Object.keys(en);

    for (const k of enKeys) {
        const v = en[k];
        if (typeof v !== 'string' || !v.trim()) errors.push(`en: ${k} is empty`);
    }

    const counts: string[] = [];
    for (const code of LOCALES) {
        if (code === 'en' || !dicts[code]) continue;
        const d = dicts[code]!;
        const intl = LOCALE_META[code].intl;
        const required = new Set(new Intl.PluralRules(intl).resolvedOptions().pluralCategories);
        // CLDR's "many" for fr/es/it/pt only covers compact millions ("1 million de …"); `other` is correct there.
        if (['fr', 'es', 'it', 'pt'].includes(code)) required.delete('many');
        let missing = 0, empty = 0, untranslated = 0;
        for (const k of enKeys) {
            const ev = en[k] as string;
            if (!(k in d)) { errors.push(`${code}: missing ${k}`); missing++; continue; }
            const v = d[k];
            if (typeof v !== 'string' || !v.trim()) { errors.push(`${code}: empty ${k}`); empty++; continue; }
            const last = k.split('.').pop()!;
            if (/^[a-z]+[A-Z]\w*$/.test(v.trim()) && v.trim() === last) errors.push(`${code}: ${k} looks like a raw key ("${v}")`);
            if (v.trim() === ev.trim() && !isTokenOnly(v) && !identicalOk(code, k)) { errors.push(`${code}: ${k} is identical to English ("${v.slice(0, 60)}")`); untranslated++; }
            const ve = variablesOf(ev).sort().join(','), vl = variablesOf(v).sort().join(',');
            if (ve !== vl) errors.push(`${code}: ${k} placeholders {${vl}} differ from English {${ve}}`);
            if (tagsOf(ev) !== tagsOf(v)) errors.push(`${code}: ${k} tags [${tagsOf(v)}] differ from English [${tagsOf(ev)}]`);
            const ep = parsePlural(ev), lp = parsePlural(v);
            if (ep.length !== lp.length) errors.push(`${code}: ${k} must keep ${ep.length} plural argument(s)`);
            for (const p of lp) {
                for (const cat of Array.from(required)) if (!(cat in p.branches)) errors.push(`${code}: ${k} plural is missing the "${cat}" form`);
                if (!('other' in p.branches)) errors.push(`${code}: ${k} plural needs an "other" form`);
            }
            if (code === 'ar' && /[A-Za-z]{3,}/.test(ev.replace(/\{[^}]*\}|<\/?\w+>/g, '')) && !/[؀-ۿ]/.test(v)  && !isTokenOnly(v) && !identicalOk(code, k)) errors.push(`ar: ${k} has no Arabic text ("${v.slice(0, 60)}")`);
        }
        for (const k of Object.keys(d)) if (!(k in en)) errors.push(`${code}: ${k} is not in en.ts`);
        counts.push(`${code}: ${enKeys.length - missing} of ${enKeys.length} keys, ${missing} missing, ${empty} empty, ${untranslated} untranslated`);
    }

    // English plural messages must cover English's own categories.
    for (const k of enKeys) for (const p of parsePlural(en[k] as string)) for (const cat of ['one', 'other']) if (!(cat in p.branches)) errors.push(`en: ${k} plural is missing "${cat}"`);

    // ── Hard-coded strings in the localized scope ────────────────────
    const SCOPE = [
        'src/components/layout/Navbar.tsx',
        'src/components/layout/Footer.tsx',
        'src/components/ui/ThemeSwitch.tsx',
        'src/components/ui/NotificationBell.tsx',
        'src/components/account/ProfileReminderBanner.tsx',
        'src/components/newsletter/NewsletterSignup.tsx',
        'src/app/dashboard/customer/layout.tsx',
        'src/app/dashboard/customer/orders/page.tsx',
        'src/app/returns/ReturnsClient.tsx',
    ];
    const ALLOWED_TEXT = /^(ATLAN|TIS\.|·|—|–|\/|\+|×|#|Info@atlantisfmcg\.com|\d+\/\d+)$/;
    for (const rel of SCOPE) {
        const file = path.join(__dirname, '..', rel);
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            if (/i18n-ignore/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
            // JSX text: >Some words<
            for (const m of Array.from(line.matchAll(/>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g))) {
                const txt = m[1].trim();
                if (!txt || ALLOWED_TEXT.test(txt) || /=>|&&|\|\||\?\s|:\s/.test(txt)) continue;
                errors.push(`${rel}:${i + 1} hard-coded text "${txt.slice(0, 50)}"`);
            }
            // Literal user-facing attributes and dialogs
            for (const m of Array.from(line.matchAll(/\b(placeholder|aria-label|title|alt|label)="([^"]*[A-Za-z]{2,}[^"]*)"/g))) errors.push(`${rel}:${i + 1} hard-coded ${m[1]}="${m[2].slice(0, 50)}"`);
            for (const m of Array.from(line.matchAll(/\b(confirm|alert)\(\s*['"`]([^'"`]*[A-Za-z]{2,})/g))) errors.push(`${rel}:${i + 1} hard-coded ${m[1]}("${m[2].slice(0, 50)}")`);
        });
    }

    // ── Report ───────────────────────────────────────────────────────
    console.log(`i18n: ${LOCALES.length} languages (${LOCALES.join(', ')}), ${enKeys.length} keys in en.ts`);
    counts.forEach((c) => console.log('  ' + c));
    warn.forEach((w) => console.warn('⚠️  ' + w));
    if (errors.length) {
        console.error(`\n❌ ${errors.length} translation problem(s):`);
        errors.slice(0, 2000).forEach((e) => console.error('   - ' + e));
        if (errors.length > 2000) console.error(`   … and ${errors.length - 2000} more`);
        console.error('\n🛑 Build blocked: fix the translations above.\n');
        process.exit(1);
    }
    console.log('✅ i18n check passed: every language complete, no untranslated or malformed values, no hard-coded text in the localized scope.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
