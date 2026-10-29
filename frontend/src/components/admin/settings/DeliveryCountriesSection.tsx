'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, Button, ErrorState, Notice, Skeleton, inputCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { FormFooter, SaveStatus, SectionHead, readError, useCountryName, useTs } from './shared';

type Policy = { countries: string[]; configured: boolean; defaultCountries: string[]; all: { code: string; name: string }[] };
type Status = { tone: 'success' | 'danger'; text: string } | null;

/**
 * Where Ali FMCG delivers (GET/PUT /admin/delivery-policy, OWNER/ADMIN). The
 * country list and its validation are the server's (shipping/delivery-policy.ts).
 * Checkout checks a destination against it and the server re-checks when the
 * order is placed; saving only changes the stored list, never existing orders.
 */
export function DeliveryCountriesSection({ onDirty }: { onDirty: (d: boolean) => void }) {
    const ts = useTs();
    const { meta } = useLanguage();
    const countryName = useCountryName();
    const [policy, setPolicy] = React.useState<Policy | null>(null);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [q, setQ] = React.useState('');
    const [onlySelected, setOnlySelected] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [status, setStatus] = React.useState<Status>(null);

    const load = React.useCallback(() => {
        setError(null);
        apiFetch('/admin/delivery-policy', { cache: 'no-store' })
            .then(async (r) => { if (!r.ok) throw new Error(await readError(r, ts('loadFailed'))); return r.json(); })
            .then((p: Policy) => { setPolicy(p); setSelected(new Set(p.countries)); })
            .catch((e) => setError(e.message));
    }, [ts]);
    React.useEffect(() => { load(); }, [load]);

    const sameSet = (a: Iterable<string>, b: string[]) => { const x = Array.from(a).sort(); const y = [...b].sort(); return x.length === y.length && x.every((v, i) => v === y[i]); };
    const dirty = !!policy && !sameSet(selected, policy.countries);
    // Until a list is stored the default applies; saving it as-is is allowed (the notice asks for exactly that).
    const canSave = dirty || (!!policy && !policy.configured);
    React.useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

    const rows = React.useMemo(() => {
        const list = (policy?.all ?? []).map((c) => ({ code: c.code, name: countryName(c.code, c.name), en: c.name }));
        const needle = q.trim().toLowerCase();
        return list
            .filter((c) => !onlySelected || selected.has(c.code))
            .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.en.toLowerCase().includes(needle) || c.code.toLowerCase() === needle)
            .sort((a, b) => a.name.localeCompare(b.name, meta.intl));
    }, [policy, q, onlySelected, selected, countryName, meta.intl]);

    const toggle = (c: string) => setSelected((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

    const save = async () => {
        if (saving || !policy) return;
        if (selected.size === 0) { setStatus({ tone: 'danger', text: ts('countriesNoneError') }); return; }
        setSaving(true); setStatus(null);
        try {
            const res = await apiFetch('/admin/delivery-policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ countries: Array.from(selected) }) });
            if (!res.ok) throw new Error(await readError(res, ts('saveFailed')));
            const d = await res.json();
            setPolicy((p) => (p ? { ...p, countries: d.countries, configured: true } : p));
            setSelected(new Set(d.countries));
            setStatus({ tone: 'success', text: ts('countriesSaved', { count: d.countries.length }) });
        } catch (e: any) {
            setStatus({ tone: 'danger', text: e?.message || ts('saveFailed') });
        } finally { setSaving(false); }
    };

    return (
        <section aria-labelledby="sec-countries">
            <SectionHead id="sec-countries" title={ts('countriesTitle')} lead={ts('countriesLead')} />
            <Notice tone="info" title={ts('countriesScopeTitle')}>{ts('countriesScope')}</Notice>
            {error && <div className="mt-4"><ErrorState message={error} onRetry={load} /></div>}
            {!policy && !error && <div className="mt-4 space-y-3" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>}
            {policy && (
                <>
                    {!policy.configured && <div className="mt-4"><Notice tone="warning">{ts('countriesDefaultNotice')}</Notice></div>}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <label className="relative flex-1 min-w-[14rem]">
                            <span className="sr-only">{ts('countriesSearch')}</span>
                            <Search size={15} aria-hidden className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ts('countriesSearch')} className={cn(inputCls, 'ps-9')} />
                        </label>
                        <label className="inline-flex items-center gap-2 h-10 px-3 rounded-lg ring-1 ring-inset ring-line-strong text-[13px] text-ink-2 cursor-pointer">
                            <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} className="w-4 h-4 accent-[#0E7C74]" />{ts('countriesOnlySelected')}
                        </label>
                        <Button type="button" variant="ghost" onClick={() => setSelected(new Set(policy.defaultCountries))}>{ts('countriesUseDefault')}</Button>
                    </div>
                    <p className="mt-3 text-[13px] text-ink-2" aria-live="polite">{ts('countriesSelected', { count: selected.size, total: policy.all.length })}</p>
                    {rows.length === 0 ? (
                        <p className="mt-3 py-8 text-center text-[13.5px] text-ink-3">{ts('countriesNoMatch')}</p>
                    ) : (
                        <ul className="mt-2 grid gap-0.5 sm:grid-cols-2 xl:grid-cols-3 max-h-[52vh] overflow-y-auto rounded-lg ring-1 ring-line p-1.5">
                            {rows.map((c) => (
                                <li key={c.code}>
                                    <label className={cn('flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-2 text-[13.5px]', selected.has(c.code) ? 'text-heading font-medium' : 'text-ink-2')}>
                                        <input type="checkbox" checked={selected.has(c.code)} onChange={() => toggle(c.code)} className="w-4 h-4 accent-[#0E7C74]" />
                                        <span className="min-w-0 truncate">{c.name}</span>
                                        <bdi dir="ltr" className="text-ink-4 text-[12px]">{c.code}</bdi>
                                        {policy.defaultCountries.includes(c.code) && <Badge className="ms-auto">{ts('countriesDefaultBadge')}</Badge>}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="mt-3 text-[12.5px] text-ink-3">{ts('countriesFootnote')}</p>
                    <SaveStatus state={status} />
                    <FormFooter dirty={dirty}>
                        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setSelected(new Set(policy.countries)); setStatus(null); }}>{ts('discard')}</Button>
                        <Button type="button" variant="primary" loading={saving} disabled={!canSave || selected.size === 0} onClick={save}>{ts('countriesSave')}</Button>
                    </FormFooter>
                </>
            )}
        </section>
    );
}
