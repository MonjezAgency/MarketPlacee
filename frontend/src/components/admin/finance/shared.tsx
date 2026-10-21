'use client';

import * as React from 'react';
import { Info, Loader2, Lock, Search, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmptyState, inputCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

/** Text from the adminFinance dictionary. */
export function useTf() {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminFinance', k, v), [t]);
}

/** OWNER passes every RolesGuard check; most finance writes are ADMIN-only in practice. */
export const isOwnerAdmin = (role?: string | null) => ['OWNER', 'ADMIN'].includes(String(role || '').toUpperCase());

/** Amount in the record's own currency, never converted. Unknown codes fall back to "1,234.00 XYZ". */
export function useMoney() {
    const { fmt } = useLanguage();
    return React.useCallback((n: number | null | undefined, currency: string | null | undefined) => {
        if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
        const code = String(currency || '').toUpperCase();
        if (/^[A-Z]{3}$/.test(code)) return fmt.number(Number(n), { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${fmt.number(Number(n), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`.trim();
    }, [fmt]);
}

/** Only real web documents are opened; anything else is treated as "no document". */
export const httpsUrl = (u: string | null | undefined) => (u && /^https:\/\/[^\s]+$/i.test(u) ? u : null);

export async function readError(res: Response, fallback: string) {
    // 5xx bodies can carry internal details (e.g. database errors): show the plain message instead.
    if (res.status >= 500) return fallback;
    const body = await res.json().catch(() => null);
    const m = body?.message;
    if (Array.isArray(m)) return m.join(' ');
    if (typeof m === 'string' && m) return m;
    return fallback;
}

/** A failed list load. `forbidden` = the server refused this role (403): show the permission state, not "try again". */
export class LoadError extends Error {
    constructor(message: string, readonly forbidden = false) { super(message); }
}

/** GET a JSON list for a finance tab; non-2xx becomes a LoadError (403 → forbidden). */
export async function fetchList(path: string, fallback: string): Promise<unknown[]> {
    const r = await apiFetch(path, { cache: 'no-store' });
    if (r.status === 403) throw new LoadError(fallback, true);
    if (!r.ok) throw new LoadError(await readError(r, fallback));
    const d = await r.json().catch(() => null);
    return Array.isArray(d) ? d : [];
}

/** Shown when the API answers 403: access is decided by the server, never by hiding a tab. */
export function NoAccessState() {
    const tf = useTf();
    return <div role="status"><EmptyState icon={<Lock size={20} />} title={tf('noAccessTitle')}>{tf('noAccessBody')}</EmptyState></div>;
}

/** Small accessible tooltip: hover or keyboard focus shows the text; Esc hides it. */
export function InfoTip({ label, text }: { label: string; text: string }) {
    const [open, setOpen] = React.useState(false);
    const id = React.useId();
    return (
        <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            <button type="button" aria-label={label} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
                onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} onClick={() => setOpen((o) => !o)}
                className="w-5 h-5 rounded-full inline-flex items-center justify-center text-ink-4 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                <Info size={13} aria-hidden />
            </button>
            {open && (
                <span id={id} role="tooltip" className="absolute z-30 top-6 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 w-64 rounded-lg bg-heading text-white text-[12.5px] leading-5 font-normal px-3 py-2 shadow-float">
                    {text}
                </span>
            )}
        </span>
    );
}

export interface AccountOption { id: string; name: string; email: string; companyName: string | null; country: string | null }

/**
 * Searchable account picker on GET /admin/users/list (OWNER/ADMIN): role-filtered,
 * server-side search on name, email and company, 8 results at a time.
 */
export function AccountPicker({ role, value, onChange, label, id, error }: { role: 'CUSTOMER' | 'SUPPLIER'; value: AccountOption | null; onChange: (a: AccountOption | null) => void; label: string; id: string; error?: string | null }) {
    const tf = useTf();
    const [q, setQ] = React.useState('');
    const [open, setOpen] = React.useState(false);
    const [rows, setRows] = React.useState<AccountOption[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [failed, setFailed] = React.useState<string | null>(null);
    const [hi, setHi] = React.useState(0);
    const listId = `${id}-list`;

    React.useEffect(() => {
        if (!open || value) return;
        let alive = true;
        setLoading(true); setFailed(null);
        const timer = setTimeout(() => {
            const p = new URLSearchParams({ role, limit: '8', sort: 'company' });
            if (q.trim()) p.set('q', q.trim());
            apiFetch(`/admin/users/list?${p}`, { cache: 'no-store' })
                .then(async (r) => { if (!r.ok) throw new Error(await readError(r, tf('accountsLoadFailed'))); return r.json(); })
                .then((d) => { if (alive) { setRows((d?.data || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email, companyName: u.companyName ?? null, country: u.country ?? null }))); setHi(0); } })
                .catch((e) => { if (alive) { setRows([]); setFailed(e.message); } })
                .finally(() => { if (alive) setLoading(false); });
        }, 250);
        return () => { alive = false; clearTimeout(timer); };
    }, [q, open, role, value, tf]);

    if (value) return (
        <div className="flex items-center gap-3 rounded-lg ring-1 ring-inset ring-line-strong bg-surface-2 px-3 py-2">
            <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-ink truncate">{value.companyName || value.name}</p>
                <p className="text-[12.5px] text-ink-3 truncate">{value.companyName ? `${value.name} · ` : ''}<bdi dir="ltr">{value.email}</bdi></p>
            </div>
            <button type="button" onClick={() => { onChange(null); setQ(''); setOpen(true); }} className="h-8 px-2.5 rounded-lg text-[12.5px] font-medium text-ink-2 hover:bg-surface-3 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                <X size={13} aria-hidden />{tf('change')}
            </button>
        </div>
    );

    const pick = (a: AccountOption) => { onChange(a); setOpen(false); };
    return (
        <div className="relative">
            <Search size={15} aria-hidden className="absolute start-3 top-[13px] text-ink-4" />
            <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-invalid={!!error || undefined}
                aria-activedescendant={open && rows[hi] ? `${listId}-${rows[hi].id}` : undefined} aria-label={label}
                value={q} placeholder={tf('accountSearchPh')} className={cn(inputCls, 'ps-9')} autoComplete="off"
                onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
                onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, rows.length - 1)); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                    else if (e.key === 'Enter' && open && rows[hi]) { e.preventDefault(); pick(rows[hi]); }
                    else if (e.key === 'Escape') setOpen(false);
                }} />
            {open && (
                <ul id={listId} role="listbox" aria-label={label} className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto rounded-lg bg-surface ring-1 ring-line shadow-float py-1 text-[13.5px]">
                    {loading && <li className="px-3 py-2 text-ink-3 flex items-center gap-2" role="presentation"><Loader2 size={14} className="animate-spin" aria-hidden />{tf('searching')}</li>}
                    {!loading && failed && <li className="px-3 py-2 text-red-700" role="presentation">{failed}</li>}
                    {!loading && !failed && rows.length === 0 && <li className="px-3 py-2 text-ink-3" role="presentation">{tf('noAccounts')}</li>}
                    {!loading && !failed && rows.map((a, i) => (
                        <li key={a.id} id={`${listId}-${a.id}`} role="option" aria-selected={i === hi}
                            onMouseDown={(e) => { e.preventDefault(); pick(a); }} onMouseEnter={() => setHi(i)}
                            className={cn('px-3 py-2 cursor-pointer', i === hi && 'bg-surface-2')}>
                            <p className="font-medium text-ink truncate">{a.companyName || a.name}</p>
                            <p className="text-[12.5px] text-ink-3 truncate">{a.companyName ? `${a.name} · ` : ''}<bdi dir="ltr">{a.email}</bdi></p>
                        </li>
                    ))}
                </ul>
            )}
            <span className="sr-only" aria-live="polite">{open && !loading ? tf('accountsFound', { count: rows.length }) : ''}</span>
        </div>
    );
}

/** Names for user ids (GET /admin/users/:id), fetched once per id; null while unknown or unavailable. */
export function useUserNames(ids: string[]) {
    const [names, setNames] = React.useState<Record<string, { name: string; companyName: string | null; email: string } | null>>({});
    const key = Array.from(new Set(ids)).sort().join(',');
    React.useEffect(() => {
        const todo = key ? key.split(',').filter((id) => !(id in names)).slice(0, 60) : [];
        if (!todo.length) return;
        let alive = true;
        Promise.all(todo.map((id) => apiFetch(`/admin/users/${encodeURIComponent(id)}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null)).then((d) => [id, d?.user ? { name: d.user.name, companyName: d.user.companyName ?? null, email: d.user.email } : null] as const).catch(() => [id, null] as const)))
            .then((pairs) => { if (alive) setNames((n) => ({ ...n, ...Object.fromEntries(pairs) })); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return names;
}
