/**
 * CSV / spreadsheet contact import (pure): column mapping, validation and
 * duplicate detection by normalised email. Nothing here grants consent.
 */
import { isValidEmail, normalizeEmail } from './marketing-consent';

export interface ImportMapping { email: number; name?: number | null; company?: number | null; region?: number | null }
export type RowOutcome = 'NEW' | 'UPDATE' | 'DUPLICATE_IN_FILE' | 'INVALID_EMAIL' | 'MISSING_EMAIL';
export interface PlannedRow {
    line: number;            // 1-based line in the file (header = 1)
    email: string;
    name: string | null; company: string | null; region: string | null;
    outcome: RowOutcome;
    /** The address is on the suppression list (unsubscribed / bounced / blocked): stays suppressed. */
    suppressed: boolean;
    /** Matches a marketplace account by normalised email. */
    account: boolean;
}

const HEADER_HINTS: Record<keyof ImportMapping, RegExp> = {
    email: /e-?mail|البريد|الايميل|courriel|correo|posta/i,
    name: /^(full ?)?name$|contact|الاسم|nom|nome|nombre/i,
    company: /company|business|organi[sz]ation|الشركة|société|empresa|azienda|firma/i,
    region: /region|country|المنطقة|البلد|pays|país|paese|ţară|tara/i,
};

export function suggestMapping(headers: string[]): ImportMapping | { email: null; name: number | null; company: number | null; region: number | null } {
    const find = (k: keyof ImportMapping) => { const i = headers.findIndex((h) => HEADER_HINTS[k].test(String(h || '').trim())); return i >= 0 ? i : null; };
    const email = find('email');
    const name = find('name'), company = find('company'), region = find('region');
    return { email: email as any, name: name === email ? null : name, company, region };
}

const cell = (row: unknown[], i: number | null | undefined, max: number) => {
    if (i === null || i === undefined || i < 0) return null;
    const v = String(row?.[i] ?? '').trim().slice(0, max);
    return v || null;
};

export function planImport(input: { rows: unknown[][]; mapping: ImportMapping; existing: Set<string>; suppressed: Set<string>; accounts: Set<string> }): PlannedRow[] {
    const seen = new Set<string>();
    return input.rows.map((row, i) => {
        const raw = cell(row, input.mapping.email, 320);
        const email = normalizeEmail(raw);
        const base = { line: i + 2, email, name: cell(row, input.mapping.name, 120), company: cell(row, input.mapping.company, 160), region: cell(row, input.mapping.region, 80) };
        const flags = { suppressed: input.suppressed.has(email), account: input.accounts.has(email) };
        if (!email) return { ...base, ...flags, outcome: 'MISSING_EMAIL' as const };
        if (!isValidEmail(email)) return { ...base, ...flags, outcome: 'INVALID_EMAIL' as const };
        if (seen.has(email)) return { ...base, ...flags, outcome: 'DUPLICATE_IN_FILE' as const };
        seen.add(email);
        return { ...base, ...flags, outcome: input.existing.has(email) ? 'UPDATE' as const : 'NEW' as const };
    });
}

export function summarize(plan: PlannedRow[]) {
    const s = { total: plan.length, NEW: 0, UPDATE: 0, DUPLICATE_IN_FILE: 0, INVALID_EMAIL: 0, MISSING_EMAIL: 0, suppressed: 0, accounts: 0 };
    for (const r of plan) { s[r.outcome]++; if (r.suppressed && (r.outcome === 'NEW' || r.outcome === 'UPDATE')) s.suppressed++; if (r.account && (r.outcome === 'NEW' || r.outcome === 'UPDATE')) s.accounts++; }
    return s;
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF), used when XLSX isn't needed. */
export function csvEscape(v: unknown): string {
    const t = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formulas in exported cells.
    const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
