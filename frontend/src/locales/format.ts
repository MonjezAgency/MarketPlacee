/**
 * Message formatting for the dictionaries — a small, dependency-free subset
 * of ICU MessageFormat:
 *
 *   "Placed {date}"                                    → simple variables
 *   "{count, plural, one {# pallet} other {# pallets}}" → plural forms chosen
 *                                                         with Intl.PluralRules
 *
 * `#` inside a plural branch is the count formatted for the locale. Plural
 * categories a locale doesn't list fall back to `other`.
 */
export type Vars = Record<string, string | number | null | undefined>;

/** Split "a {x} b {n, plural, one {..} other {..}} c" into top-level parts. */
function topLevel(msg: string): { text: string; arg: boolean }[] {
    const out: { text: string; arg: boolean }[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < msg.length; i++) {
        const c = msg[i];
        if (c === '{') { if (depth === 0) { if (i > start) out.push({ text: msg.slice(start, i), arg: false }); start = i + 1; } depth++; }
        else if (c === '}') { depth--; if (depth === 0) { out.push({ text: msg.slice(start, i), arg: true }); start = i + 1; } }
    }
    if (start < msg.length) out.push({ text: msg.slice(start), arg: false });
    return out;
}

/** "one {# pallet} other {# pallets}" → { one: '# pallet', other: '# pallets' } */
export function pluralBranches(body: string): Record<string, string> {
    const branches: Record<string, string> = {};
    let i = 0;
    while (i < body.length) {
        while (i < body.length && /\s/.test(body[i])) i++;
        let sel = '';
        while (i < body.length && body[i] !== '{' && !/\s/.test(body[i])) sel += body[i++];
        while (i < body.length && /\s/.test(body[i])) i++;
        if (body[i] !== '{') break;
        let depth = 0, j = i;
        for (; j < body.length; j++) { if (body[j] === '{') depth++; else if (body[j] === '}') { depth--; if (depth === 0) break; } }
        branches[sel] = body.slice(i + 1, j);
        i = j + 1;
    }
    return branches;
}

/** The plural argument of a message, if any: { name, branches }. */
export function parsePlural(msg: string): { name: string; branches: Record<string, string> }[] {
    return topLevel(msg).filter((p) => p.arg && /^\s*\w+\s*,\s*plural\s*,/.test(p.text)).map((p) => {
        const [, name, rest] = p.text.match(/^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/)!;
        return { name, branches: pluralBranches(rest) };
    });
}

/** Names of the simple {variables} a message uses (plural arguments included). */
export function variablesOf(msg: string): string[] {
    const names = new Set<string>();
    for (const p of topLevel(msg)) {
        if (!p.arg) continue;
        const m = p.text.match(/^\s*(\w+)\s*(,|$)/);
        if (m) names.add(m[1]);
        if (/,\s*plural\s*,/.test(p.text)) for (const b of Object.values(pluralBranches(p.text.replace(/^\s*\w+\s*,\s*plural\s*,/, '')))) variablesOf(b).forEach((n) => names.add(n));
    }
    return Array.from(names);
}

export function formatMessage(msg: string, vars: Vars | undefined, intl: string): string {
    if (!vars || !msg.includes('{')) return msg;
    return topLevel(msg).map((p) => {
        if (!p.arg) return p.text;
        const plural = p.text.match(/^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/);
        if (plural) {
            const n = Number(vars[plural[1]] ?? 0);
            const branches = pluralBranches(plural[2]);
            const exact = branches[`=${n}`];
            let cat = 'other';
            try { cat = new Intl.PluralRules(intl).select(n); } catch { /* keep other */ }
            const body = exact ?? branches[cat] ?? branches.other ?? '';
            let num = String(n);
            try { num = new Intl.NumberFormat(intl).format(n); } catch { /* keep raw */ }
            return formatMessage(body.replace(/#/g, num), vars, intl);
        }
        const v = vars[p.text.trim()];
        return v == null ? '' : String(v);
    }).join('');
}
