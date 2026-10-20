'use client';

import * as React from 'react';
import { MapPin, Pencil, Plus, Route, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { COUNTRIES } from '@/lib/countries';
import { getFulfillmentAdmin, saveHub, saveRate, type AdminHub, type AdminRate } from '@/lib/fulfillment';
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, Notice, Skeleton, inputCls, selectCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { SaveStatus, SectionHead, useCountryName, useTs, type Access } from './shared';

/** Service codes the backend defines (fulfillment.service.ts HUB_SERVICES); anything else is shown as stored. */
const HUB_SERVICES = ['INSPECTION', 'CONSOLIDATION', 'STORAGE', 'CROSS_DOCK', 'COLLECTION'];
type Data = { hubs: AdminHub[]; rates: AdminRate[]; services: string[] };
type Status = { tone: 'success' | 'danger'; text: string } | null;

/** GET /fulfillment/admin — hubs, freight rates and the hub service codes, as stored. */
function useFulfillment() {
    const [data, setData] = React.useState<Data | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const load = React.useCallback(() => { setError(null); getFulfillmentAdmin().then(setData).catch((e) => setError(e.message)); }, []);
    React.useEffect(() => { load(); }, [load]);
    return { data, error, load };
}

/** Country options from the canonical list (lib/countries), labelled in the interface language. */
function useCountryOptions() {
    const countryName = useCountryName();
    const { meta } = useLanguage();
    return React.useMemo(() => COUNTRIES.map((c) => ({ iso: c.iso, name: countryName(c.iso, c.name) })).sort((a, b) => a.name.localeCompare(b.name, meta.intl)), [countryName, meta.intl]);
}

function useEur() {
    const { fmt } = useLanguage();
    return (n: number) => fmt.number(n, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Hubs ──────────────────────────────────────────────────────────────

/**
 * Atlantis hubs (POST/PATCH /fulfillment/admin/hubs, OWNER/ADMIN; LOGISTICS may read).
 * Only hubs saved here are listed; a hub is public and offered to suppliers
 * only when verified and active. There is no delete endpoint: deactivate instead.
 */
export function HubsSection({ access }: { access: Access }) {
    const ts = useTs();
    const countryName = useCountryName();
    const { data, error, load } = useFulfillment();
    const [edit, setEdit] = React.useState<Partial<AdminHub> | null>(null);
    const [status, setStatus] = React.useState<Status>(null);
    const canEdit = access === 'edit';
    const svc = (s: string) => (HUB_SERVICES.includes(s) ? ts(`svc_${s}`) : s);

    return (
        <section aria-labelledby="sec-hubs">
            <SectionHead id="sec-hubs" title={ts('hubsTitle')} lead={ts('hubsLead')}
                actions={canEdit && data ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ services: [], active: true, verified: false })}>{ts('hubAdd')}</Button> : undefined} />
            {!canEdit && <div className="mb-4"><Notice tone="info">{ts('hubsViewOnly')}</Notice></div>}
            <SaveStatus state={status} />
            {error && <ErrorState message={error} onRetry={load} />}
            {!data && !error && <div className="space-y-2" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
            {data && (data.hubs.length === 0 ? (
                <EmptyState icon={<MapPin size={20} />} title={ts('hubsEmptyTitle')}>{ts('hubsEmptyBody')}</EmptyState>
            ) : (
                <ul className="mt-2 divide-y divide-line rounded-lg ring-1 ring-line">
                    {data.hubs.map((h) => (
                        <li key={h.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[14px] font-semibold text-heading flex flex-wrap items-center gap-2">
                                    {h.name}
                                    {h.verified ? <Badge tone="success"><ShieldCheck size={12} aria-hidden />{ts('hubVerified')}</Badge> : <Badge tone="warning">{ts('hubNotVerified')}</Badge>}
                                    {!h.active && <Badge>{ts('hubInactive')}</Badge>}
                                    {h.verified && h.active && <Badge tone="brand">{ts('hubPublic')}</Badge>}
                                </p>
                                <p className="mt-0.5 text-[13px] text-ink-3">
                                    {ts('hubPlace', { city: h.city, country: countryName(h.country) })}
                                    {h.address ? <> · {h.address}</> : null}
                                    {' · '}<bdi dir="ltr" className="tabular-nums">{h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}</bdi>
                                </p>
                                <p className="mt-0.5 text-[12.5px] text-ink-2">{h.services.length ? h.services.map(svc).join(' · ') : ts('hubNoServices')}</p>
                            </div>
                            {canEdit && <Button size="sm" icon={<Pencil size={13} />} onClick={() => setEdit(h)} aria-label={ts('hubEditName', { name: h.name })}>{ts('edit')}</Button>}
                        </li>
                    ))}
                </ul>
            ))}
            {edit && data && canEdit && (
                <HubDialog hub={edit} services={data.services} svc={svc} onClose={() => setEdit(null)}
                    onSaved={(name) => { setEdit(null); setStatus({ tone: 'success', text: ts('hubSaved', { name }) }); load(); }} />
            )}
        </section>
    );
}

function HubDialog({ hub, services, svc, onClose, onSaved }: { hub: Partial<AdminHub>; services: string[]; svc: (s: string) => string; onClose: () => void; onSaved: (name: string) => void }) {
    const ts = useTs();
    const options = useCountryOptions();
    const [f, setF] = React.useState({
        name: hub.name || '', city: hub.city || '', country: hub.country || '', address: hub.address || '',
        latitude: hub.latitude != null ? String(hub.latitude) : '', longitude: hub.longitude != null ? String(hub.longitude) : '',
        services: hub.services || [], active: hub.active !== false, verified: !!hub.verified, notes: hub.notes || '',
    });
    const [touched, setTouched] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
    const num = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));
    const e = {
        name: touched && f.name.trim().length < 2 ? ts('hubNameError') : null,
        city: touched && f.city.trim().length < 2 ? ts('hubCityError') : null,
        country: touched && !f.country ? ts('hubCountryError') : null,
        latitude: touched && (!num(f.latitude) || Math.abs(Number(f.latitude)) > 90) ? ts('hubLatError') : null,
        longitude: touched && (!num(f.longitude) || Math.abs(Number(f.longitude)) > 180) ? ts('hubLngError') : null,
    };
    const submit = async () => {
        if (busy) return;
        setTouched(true);
        if (f.name.trim().length < 2 || f.city.trim().length < 2 || !f.country || !num(f.latitude) || !num(f.longitude)) return;
        setBusy(true); setErr(null);
        try {
            const saved = await saveHub({ ...f, name: f.name.trim(), city: f.city.trim(), latitude: Number(f.latitude), longitude: Number(f.longitude) }, hub.id);
            onSaved(saved?.name || f.name.trim());
        } catch (x: any) { setErr(x?.message || ts('saveFailed')); } finally { setBusy(false); }
    };
    return (
        <Dialog open onClose={() => !busy && onClose()} dismissable={!busy} title={hub.id ? ts('hubEditTitle') : ts('hubAddTitle')} description={ts('hubDialogLead')} size="md"
            footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>{ts('cancel')}</Button><Button variant="primary" loading={busy} onClick={submit}>{ts('hubSave')}</Button></>}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label={ts('hubName')} htmlFor="hub-name" required error={e.name}><input id="hub-name" className={inputCls} value={f.name} aria-invalid={!!e.name || undefined} onChange={(x) => set('name', x.target.value)} /></Field>
                <Field label={ts('hubCity')} htmlFor="hub-city" required error={e.city}><input id="hub-city" className={inputCls} value={f.city} aria-invalid={!!e.city || undefined} onChange={(x) => set('city', x.target.value)} /></Field>
                <Field label={ts('hubCountry')} htmlFor="hub-country" required error={e.country}>
                    <select id="hub-country" className={selectCls} value={f.country} aria-invalid={!!e.country || undefined} onChange={(x) => set('country', x.target.value)}>
                        <option value="">{ts('choose')}</option>{options.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                    </select>
                </Field>
                <Field label={ts('hubAddress')} htmlFor="hub-address" optional><input id="hub-address" className={inputCls} value={f.address} onChange={(x) => set('address', x.target.value)} /></Field>
                <Field label={ts('hubLat')} htmlFor="hub-lat" required error={e.latitude} hint={ts('hubLatHint')}><input id="hub-lat" type="number" step="0.0001" dir="ltr" className={inputCls} value={f.latitude} aria-invalid={!!e.latitude || undefined} onChange={(x) => set('latitude', x.target.value)} /></Field>
                <Field label={ts('hubLng')} htmlFor="hub-lng" required error={e.longitude} hint={ts('hubLngHint')}><input id="hub-lng" type="number" step="0.0001" dir="ltr" className={inputCls} value={f.longitude} aria-invalid={!!e.longitude || undefined} onChange={(x) => set('longitude', x.target.value)} /></Field>
            </div>
            <fieldset className="mt-4">
                <legend className="text-[13px] font-medium text-ink-2">{ts('hubServices')}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                    {services.map((s) => (
                        <label key={s} className={cn('inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 ring-inset text-[13px] cursor-pointer', f.services.includes(s) ? 'ring-teal bg-teal-soft' : 'ring-line-strong')}>
                            <input type="checkbox" className="w-4 h-4 accent-[#0E7C74]" checked={f.services.includes(s)} onChange={() => set('services', f.services.includes(s) ? f.services.filter((y) => y !== s) : [...f.services, s])} />{svc(s)}
                        </label>
                    ))}
                </div>
            </fieldset>
            <Field label={ts('hubNotes')} htmlFor="hub-notes" optional className="mt-4"><textarea id="hub-notes" rows={2} className={cn(inputCls, 'h-auto py-2')} value={f.notes} onChange={(x) => set('notes', x.target.value)} /></Field>
            <div className="mt-4 space-y-2 text-[13.5px] text-ink-2">
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#0E7C74]" checked={f.active} onChange={(x) => set('active', x.target.checked)} /><span>{ts('hubActive')}</span></label>
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#0E7C74]" checked={f.verified} onChange={(x) => set('verified', x.target.checked)} /><span>{ts('hubVerifyConfirm')}</span></label>
            </div>
            {err && <div className="mt-4"><Notice tone="danger">{err}</Notice></div>}
        </Dialog>
    );
}

// ─── Freight rates ─────────────────────────────────────────────────────

/**
 * Freight rates (POST/PATCH /fulfillment/admin/rates, OWNER/ADMIN/LOGISTICS).
 * These are the configured inputs; the charge on a quote, cart or order is
 * calculated by the server from them (backend/src/fulfillment); a route with
 * no active rate is "quoted after the order". No delete endpoint exists.
 */
export function FreightSection({ access, canReadCountries }: { access: Access; canReadCountries: boolean }) {
    const ts = useTs();
    const eur = useEur();
    const countryName = useCountryName();
    const { data, error, load } = useFulfillment();
    const [edit, setEdit] = React.useState<Partial<AdminRate> | null>(null);
    const [status, setStatus] = React.useState<Status>(null);
    const [deliveryCountries, setDeliveryCountries] = React.useState<string[] | null>(null);
    const canEdit = access === 'edit';

    React.useEffect(() => {
        if (!canReadCountries) return;
        apiFetch('/admin/delivery-policy', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((p) => setDeliveryCountries(p?.countries ?? null)).catch(() => setDeliveryCountries(null));
    }, [canReadCountries]);

    const uncovered = React.useMemo(() => {
        if (!data || !deliveryCountries) return null;
        const covered = new Set(data.rates.filter((r) => r.active).map((r) => r.destinationCountry));
        return deliveryCountries.filter((c) => !covered.has(c));
    }, [data, deliveryCountries]);

    const legLabel = (m: string) => (m === 'HUB_TO_BUYER' ? ts('legHub') : ts('legCollection'));
    const unitLabel = (u: string) => ts(`per_${u}`);

    return (
        <section aria-labelledby="sec-freight">
            <SectionHead id="sec-freight" title={ts('freightTitle')} lead={ts('freightLead')}
                actions={canEdit && data ? <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({ method: 'ATLANTIS_COLLECTION', unit: 'PALLET', active: true })}>{ts('rateAdd')}</Button> : undefined} />
            <dl className="grid gap-2 sm:grid-cols-3 text-[13px]">
                {(['Configured', 'Calculated', 'Quoted'] as const).map((k) => (
                    <div key={k} className="rounded-lg bg-surface-2 ring-1 ring-line px-3 py-2.5">
                        <dt className="font-semibold text-heading">{ts(`term${k}`)}</dt>
                        <dd className="mt-0.5 text-ink-3">{ts(`term${k}Body`)}</dd>
                    </div>
                ))}
            </dl>
            <div className="mt-4"><SaveStatus state={status} /></div>
            {error && <div className="mt-4"><ErrorState message={error} onRetry={load} /></div>}
            {!data && !error && <div className="mt-4 space-y-2" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-40" /></div>}
            {data && uncovered && uncovered.length > 0 && (
                <div className="mt-4"><Notice tone="warning" title={ts('uncoveredTitle', { count: uncovered.length })}>
                    {uncovered.map((c) => countryName(c)).sort().join(', ')}
                </Notice></div>
            )}
            {data && (data.rates.length === 0 ? (
                <EmptyState icon={<Route size={20} />} title={ts('ratesEmptyTitle')}>{ts('ratesEmptyBody')}</EmptyState>
            ) : (
                <div className="mt-4 overflow-x-auto rounded-lg ring-1 ring-line">
                    <table className="w-full min-w-[720px] text-[13.5px]">
                        <caption className="sr-only">{ts('freightTitle')}</caption>
                        <thead><tr className="text-ink-3 text-[12.5px] border-b border-line bg-surface-2/60">
                            <th scope="col" className="text-start font-medium ps-4 pe-2 py-2">{ts('colLeg')}</th>
                            <th scope="col" className="text-start font-medium px-2 py-2">{ts('colRoute')}</th>
                            <th scope="col" className="text-end font-medium px-2 py-2">{ts('colRate')}</th>
                            <th scope="col" className="text-start font-medium px-2 py-2">{ts('colTransit')}</th>
                            <th scope="col" className="text-start font-medium px-2 py-2">{ts('colStatus')}</th>
                            <th scope="col" className="py-2 pe-4"><span className="sr-only">{ts('colActions')}</span></th>
                        </tr></thead>
                        <tbody>
                            {data.rates.map((r) => (
                                <tr key={r.id} className="border-b border-line last:border-0 align-top">
                                    <td className="ps-4 pe-2 py-2.5">{legLabel(r.method)}{r.hubId ? <span className="block text-[12px] text-ink-3">{data.hubs.find((h) => h.id === r.hubId)?.name || ts('hubUnknown')}</span> : null}</td>
                                    <td className="px-2 py-2.5">{ts('route', { from: countryName(r.originCountry), to: countryName(r.destinationCountry) })}</td>
                                    <td className="px-2 py-2.5 text-end tabular-nums whitespace-nowrap">{eur(r.amountEur)} <span className="text-ink-3">{unitLabel(r.unit)}</span></td>
                                    <td className="px-2 py-2.5 text-ink-2">{r.minTransitDays != null && r.maxTransitDays != null ? ts('transitDays', { min: r.minTransitDays, max: r.maxTransitDays }) : <span className="text-ink-4">{ts('notRecorded')}</span>}</td>
                                    <td className="px-2 py-2.5">{r.active ? <Badge tone="success" dot>{ts('rateActive')}</Badge> : <Badge dot>{ts('rateInactive')}</Badge>}{r.note ? <span className="block mt-1 text-[12px] text-ink-3">{r.note}</span> : null}</td>
                                    <td className="py-2.5 pe-4 text-end">{canEdit && <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEdit(r)}>{ts('edit')}</Button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            <p className="mt-3 text-[12.5px] text-ink-3">{ts('freightFootnote')}</p>
            {edit && data && canEdit && (
                <RateDialog rate={edit} hubs={data.hubs} onClose={() => setEdit(null)}
                    onSaved={() => { setEdit(null); setStatus({ tone: 'success', text: ts('rateSaved') }); load(); }} />
            )}
        </section>
    );
}

function RateDialog({ rate, hubs, onClose, onSaved }: { rate: Partial<AdminRate>; hubs: AdminHub[]; onClose: () => void; onSaved: () => void }) {
    const ts = useTs();
    const options = useCountryOptions();
    const [f, setF] = React.useState({
        method: rate.method || 'ATLANTIS_COLLECTION', originCountry: rate.originCountry || '', destinationCountry: rate.destinationCountry || '', hubId: rate.hubId || '',
        unit: rate.unit || 'PALLET', amountEur: rate.amountEur != null ? String(rate.amountEur) : '',
        minTransitDays: rate.minTransitDays != null ? String(rate.minTransitDays) : '', maxTransitDays: rate.maxTransitDays != null ? String(rate.maxTransitDays) : '',
        active: rate.active !== false, note: rate.note || '',
    });
    const [touched, setTouched] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
    const hubOnly = f.method === 'HUB_TO_BUYER';
    const int = (s: string) => s === '' || (Number.isInteger(Number(s)) && Number(s) >= 0);
    const amountOk = f.amountEur.trim() !== '' && Number.isFinite(Number(f.amountEur)) && Number(f.amountEur) >= 0 && Number(f.amountEur) <= 100000;
    const transitOk = int(f.minTransitDays) && int(f.maxTransitDays) && ((f.minTransitDays === '') === (f.maxTransitDays === '')) && (f.minTransitDays === '' || Number(f.minTransitDays) <= Number(f.maxTransitDays));
    const e = {
        hub: touched && hubOnly && !f.hubId ? ts('rateHubError') : null,
        origin: touched && !hubOnly && !f.originCountry ? ts('rateOriginError') : null,
        dest: touched && !f.destinationCountry ? ts('rateDestError') : null,
        amount: touched && !amountOk ? ts('rateAmountError') : null,
        transit: touched && !transitOk ? ts('rateTransitError') : null,
    };
    const submit = async () => {
        if (busy) return;
        setTouched(true);
        if ((hubOnly ? !f.hubId : !f.originCountry) || !f.destinationCountry || !amountOk || !transitOk) return;
        setBusy(true); setErr(null);
        try {
            const hub = hubs.find((h) => h.id === f.hubId);
            await saveRate({
                ...f, hubId: hubOnly ? f.hubId || null : f.hubId || null, originCountry: hubOnly && hub ? hub.country : f.originCountry, amountEur: Number(f.amountEur),
                minTransitDays: f.minTransitDays === '' ? null : Number(f.minTransitDays), maxTransitDays: f.maxTransitDays === '' ? null : Number(f.maxTransitDays),
            }, rate.id);
            onSaved();
        } catch (x: any) { setErr(x?.message || ts('saveFailed')); } finally { setBusy(false); }
    };
    return (
        <Dialog open onClose={() => !busy && onClose()} dismissable={!busy} title={rate.id ? ts('rateEditTitle') : ts('rateAddTitle')} description={ts('rateDialogLead')} size="md"
            footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>{ts('cancel')}</Button><Button variant="primary" loading={busy} onClick={submit}>{ts('rateSave')}</Button></>}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label={ts('colLeg')} htmlFor="rate-method" required>
                    <select id="rate-method" className={selectCls} value={f.method} onChange={(x) => set('method', x.target.value as AdminRate['method'])}>
                        <option value="ATLANTIS_COLLECTION">{ts('legCollection')}</option>
                        <option value="HUB_TO_BUYER">{ts('legHub')}</option>
                    </select>
                </Field>
                {hubOnly ? (
                    <Field label={ts('rateHub')} htmlFor="rate-hub" required error={e.hub}>
                        <select id="rate-hub" className={selectCls} value={f.hubId} aria-invalid={!!e.hub || undefined} onChange={(x) => set('hubId', x.target.value)}>
                            <option value="">{ts('choose')}</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.name} · {h.city}</option>)}
                        </select>
                    </Field>
                ) : (
                    <Field label={ts('rateOrigin')} htmlFor="rate-origin" required error={e.origin}>
                        <select id="rate-origin" className={selectCls} value={f.originCountry} aria-invalid={!!e.origin || undefined} onChange={(x) => set('originCountry', x.target.value)}>
                            <option value="">{ts('choose')}</option>{options.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                        </select>
                    </Field>
                )}
                <Field label={ts('rateDest')} htmlFor="rate-dest" required error={e.dest}>
                    <select id="rate-dest" className={selectCls} value={f.destinationCountry} aria-invalid={!!e.dest || undefined} onChange={(x) => set('destinationCountry', x.target.value)}>
                        <option value="">{ts('choose')}</option>{options.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                    </select>
                </Field>
                <Field label={ts('rateUnit')} htmlFor="rate-unit" required>
                    <select id="rate-unit" className={selectCls} value={f.unit} onChange={(x) => set('unit', x.target.value as AdminRate['unit'])}>
                        <option value="PALLET">{ts('unitPallet')}</option><option value="TRUCK">{ts('unitTruck')}</option><option value="CASE">{ts('unitCase')}</option>
                    </select>
                </Field>
                <Field label={ts('rateAmount')} htmlFor="rate-amount" required error={e.amount}><input id="rate-amount" type="number" min={0} step={0.01} dir="ltr" className={inputCls} value={f.amountEur} aria-invalid={!!e.amount || undefined} onChange={(x) => set('amountEur', x.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                    <Field label={ts('rateMin')} htmlFor="rate-min" optional><input id="rate-min" type="number" min={0} step={1} dir="ltr" className={inputCls} value={f.minTransitDays} aria-invalid={!!e.transit || undefined} onChange={(x) => set('minTransitDays', x.target.value)} /></Field>
                    <Field label={ts('rateMax')} htmlFor="rate-max" optional><input id="rate-max" type="number" min={0} step={1} dir="ltr" className={inputCls} value={f.maxTransitDays} aria-invalid={!!e.transit || undefined} onChange={(x) => set('maxTransitDays', x.target.value)} /></Field>
                </div>
            </div>
            {e.transit && <p role="alert" className="mt-1 text-[12.5px] text-red-700">{e.transit}</p>}
            <Field label={ts('rateNote')} htmlFor="rate-note" optional hint={ts('rateNoteHint')} className="mt-3"><input id="rate-note" className={inputCls} value={f.note} onChange={(x) => set('note', x.target.value)} /></Field>
            <label className="mt-3 flex items-center gap-2 text-[13.5px] text-ink-2"><input type="checkbox" className="w-4 h-4 accent-[#0E7C74]" checked={f.active} onChange={(x) => set('active', x.target.checked)} />{ts('rateActiveLabel')}</label>
            {err && <div className="mt-4"><Notice tone="danger">{err}</Notice></div>}
        </Dialog>
    );
}
