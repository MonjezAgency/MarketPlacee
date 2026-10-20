'use client';

import * as React from 'react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import { Button, ErrorState, Field, Notice, Skeleton, inputCls, selectCls, useConfirm } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { FormFooter, SaveStatus, SectionHead, readError, useTs } from './shared';

type Status = { tone: 'success' | 'danger'; text: string } | null;
type Markup = { piece: number; pallet: number; container: number; platformFee: number; shippingMarkup: number };

/** Multiplier (1.10) ⇄ percent ("10") without float noise. */
const toPct = (m: number) => String(Math.round((m - 1) * 1000) / 10);
const toMult = (p: string) => 1 + Number(p) / 100;
const validPct = (p: string, max: number) => p.trim() !== '' && Number.isFinite(Number(p)) && Number(p) >= 0 && Number(p) <= max;

/**
 * Buyer markups per tier, the platform fee and the legacy shipping markup
 * (GET/POST /admin/config/markup). Saving reprices every listed product for
 * buyers; orders already placed keep the prices they were placed at.
 */
export function PricingSection({ onDirty }: { onDirty: (d: boolean) => void }) {
    const ts = useTs();
    const { fmt } = useLanguage();
    const confirm = useConfirm();
    const [saved, setSaved] = React.useState<Markup | null>(null);
    const [f, setF] = React.useState({ piece: '', pallet: '', container: '', platformFee: '', shippingMarkup: '' });
    const [error, setError] = React.useState<string | null>(null);
    const [touched, setTouched] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [status, setStatus] = React.useState<Status>(null);

    const fill = (m: Markup) => setF({ piece: toPct(m.piece), pallet: toPct(m.pallet), container: toPct(m.container), platformFee: String(m.platformFee), shippingMarkup: toPct(m.shippingMarkup) });
    const load = React.useCallback(() => {
        setError(null);
        apiFetch('/admin/config/markup', { cache: 'no-store' })
            .then(async (r) => { if (!r.ok) throw new Error(await readError(r, ts('loadFailed'))); return r.json(); })
            .then((d) => { const m = d?.markup as Markup; setSaved(m); fill(m); })
            .catch((e) => setError(e.message));
    }, [ts]);
    React.useEffect(() => { load(); }, [load]);

    const dirty = !!saved && (f.piece !== toPct(saved.piece) || f.pallet !== toPct(saved.pallet) || f.container !== toPct(saved.container) || f.platformFee !== String(saved.platformFee) || f.shippingMarkup !== toPct(saved.shippingMarkup));
    React.useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

    const err = (k: keyof typeof f, max: number) => (touched && !validPct(f[k], max) ? ts('pctInvalid', { max }) : null);
    const eur = (n: number) => fmt.number(n, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        setTouched(true);
        const ok = validPct(f.piece, 500) && validPct(f.pallet, 500) && validPct(f.container, 500) && validPct(f.platformFee, 100) && validPct(f.shippingMarkup, 500);
        if (!ok) return;
        const tierChanged = !!saved && (f.piece !== toPct(saved.piece) || f.pallet !== toPct(saved.pallet) || f.container !== toPct(saved.container));
        if (tierChanged && !(await confirm({ title: ts('markupConfirmTitle'), body: ts('markupConfirmBody'), confirm: ts('markupConfirmCta') }))) return;
        setSaving(true); setStatus(null);
        try {
            const body = { piece: toMult(f.piece), pallet: toMult(f.pallet), container: toMult(f.container), platformFee: Number(f.platformFee), shippingMarkup: toMult(f.shippingMarkup) };
            const res = await apiFetch('/admin/config/markup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(await readError(res, ts('saveFailed')));
            setSaved(body); setTouched(false);
            setStatus({ tone: 'success', text: ts('markupSaved') });
        } catch (er: any) {
            setStatus({ tone: 'danger', text: er?.message || ts('saveFailed') });
        } finally { setSaving(false); }
    };

    const pctInput = (k: keyof typeof f, id: string, max: number) => (
        <div className="relative">
            <input id={id} type="number" inputMode="decimal" min={0} max={max} step={0.1} className={cn(inputCls, 'pe-8 tabular-nums')} value={f[k]} aria-invalid={!!err(k, max) || undefined}
                onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
            <span aria-hidden className="absolute end-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">%</span>
        </div>
    );
    const example = (k: 'piece' | 'pallet' | 'container') => validPct(f[k], 500) ? ts('tierExample', { net: eur(10), buyer: eur(10 * toMult(f[k])) }) : undefined;

    return (
        <form onSubmit={save} noValidate aria-labelledby="sec-pricing">
            <SectionHead id="sec-pricing" title={ts('pricingTitle')} lead={ts('pricingLead')} />
            {error && <ErrorState message={error} onRetry={load} />}
            {!saved && !error && <div className="space-y-3" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
            {saved && (
                <>
                    <fieldset>
                        <legend className="text-[14px] font-semibold text-heading">{ts('tiersLegend')}</legend>
                        <p className="mt-0.5 text-[13px] text-ink-3">{ts('tiersHelp')}</p>
                        <div className="mt-3 grid gap-4 sm:grid-cols-3">
                            <Field label={ts('tierCase')} htmlFor="mk-case" required error={err('piece', 500)} hint={example('piece')}>{pctInput('piece', 'mk-case', 500)}</Field>
                            <Field label={ts('tierPallet')} htmlFor="mk-pallet" required error={err('pallet', 500)} hint={example('pallet')}>{pctInput('pallet', 'mk-pallet', 500)}</Field>
                            <Field label={ts('tierTruck')} htmlFor="mk-truck" required error={err('container', 500)} hint={example('container')}>{pctInput('container', 'mk-truck', 500)}</Field>
                        </div>
                    </fieldset>
                    <fieldset className="mt-6">
                        <legend className="text-[14px] font-semibold text-heading">{ts('feesLegend')}</legend>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <Field label={ts('platformFee')} htmlFor="mk-fee" required error={err('platformFee', 100)} hint={ts('platformFeeHint')}>{pctInput('platformFee', 'mk-fee', 100)}</Field>
                            <Field label={ts('shippingMarkup')} htmlFor="mk-ship" required error={err('shippingMarkup', 500)} hint={ts('shippingMarkupHint')}>{pctInput('shippingMarkup', 'mk-ship', 500)}</Field>
                        </div>
                    </fieldset>
                    <div className="mt-5"><Notice tone="warning">{ts('pricingImpact')}</Notice></div>
                    <SaveStatus state={status} />
                    <FormFooter dirty={dirty}>
                        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { fill(saved); setTouched(false); setStatus(null); }}>{ts('discard')}</Button>
                        <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>{ts('savePricing')}</Button>
                    </FormFooter>
                </>
            )}
        </form>
    );
}

const UNITS = ['truck', 'pallet', 'carton'] as const;

/**
 * Display defaults for the storefront: the default currency for visitors who
 * haven't picked one (POST /admin/config/currency) and the unit tier a product
 * page opens on (POST /admin/config/default-unit). Display only — stored
 * prices, orders and invoices don't change.
 */
export function DisplaySection({ onDirty }: { onDirty: (d: boolean) => void }) {
    const ts = useTs();
    const [saved, setSaved] = React.useState<{ currency: string; unit: string } | null>(null);
    const [f, setF] = React.useState({ currency: '', unit: 'truck' });
    const [error, setError] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);
    const [status, setStatus] = React.useState<Status>(null);

    const load = React.useCallback(() => {
        setError(null);
        const get = (p: string) => apiFetch(p, { cache: 'no-store' }).then(async (r) => { if (!r.ok) throw new Error(await readError(r, ts('loadFailed'))); return r.json(); });
        Promise.all([get('/config/currency'), get('/admin/config/default-unit')])
            .then(([c, u]) => { const v = { currency: c?.currency ? String(c.currency).toUpperCase() : '', unit: UNITS.includes(u?.unit) ? u.unit : 'truck' }; setSaved(v); setF(v); })
            .catch((e) => setError(e.message));
    }, [ts]);
    React.useEffect(() => { load(); }, [load]);

    const dirty = !!saved && (f.currency !== saved.currency || f.unit !== saved.unit);
    React.useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving || !saved) return;
        setSaving(true); setStatus(null);
        try {
            const post = (p: string, body: unknown) => apiFetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                .then(async (r) => { if (!r.ok) throw new Error(await readError(r, ts('saveFailed'))); });
            if (f.currency !== saved.currency) await post('/admin/config/currency', { currency: f.currency || null });
            if (f.unit !== saved.unit) await post('/admin/config/default-unit', { unit: f.unit });
            setSaved({ ...f });
            setStatus({ tone: 'success', text: ts('displaySaved') });
        } catch (er: any) {
            setStatus({ tone: 'danger', text: er?.message || ts('saveFailed') });
            load();
        } finally { setSaving(false); }
    };

    return (
        <form onSubmit={save} noValidate aria-labelledby="sec-display">
            <SectionHead id="sec-display" title={ts('displayTitle')} lead={ts('displayLead')} />
            {error && <ErrorState message={error} onRetry={load} />}
            {!saved && !error && <div className="space-y-3" aria-busy="true"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
            {saved && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={ts('currencyLabel')} htmlFor="ds-currency" hint={ts('currencyHint')}>
                            <select id="ds-currency" className={selectCls} value={f.currency} onChange={(e) => setF((x) => ({ ...x, currency: e.target.value }))}>
                                <option value="">{ts('currencyNone')}</option>
                                {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.symbol}</option>)}
                            </select>
                        </Field>
                    </div>
                    <fieldset className="mt-6">
                        <legend className="text-[13px] font-medium text-ink-2">{ts('unitLabel')}</legend>
                        <p className="mt-0.5 text-[12.5px] text-ink-3">{ts('unitHint')}</p>
                        <div className="mt-2 inline-flex flex-wrap gap-2" role="radiogroup" aria-label={ts('unitLabel')}>
                            {UNITS.map((u) => (
                                <label key={u} className={cn('inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 ring-inset text-[13.5px] cursor-pointer', f.unit === u ? 'ring-teal bg-teal-soft text-teal font-medium' : 'ring-line-strong text-ink-2 hover:bg-surface-2')}>
                                    <input type="radio" name="ds-unit" value={u} checked={f.unit === u} onChange={() => setF((x) => ({ ...x, unit: u }))} className="w-4 h-4 accent-[#0E7C74]" />
                                    {ts(`unit_${u}`)}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <SaveStatus state={status} />
                    <FormFooter dirty={dirty}>
                        <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setF(saved); setStatus(null); }}>{ts('discard')}</Button>
                        <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>{ts('saveDisplay')}</Button>
                    </FormFooter>
                </>
            )}
        </form>
    );
}
