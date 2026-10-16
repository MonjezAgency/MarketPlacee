'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, ShieldCheck, Warehouse, Route } from 'lucide-react';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Notice, PageHeader, Skeleton, inputCls, selectCls } from '@/components/supplier/ui';
import { COUNTRIES } from '@/lib/countries';
import { HUB_SERVICE_LABEL, eur, getFulfillmentAdmin, saveHub, saveRate, type AdminHub, type AdminRate } from '@/lib/fulfillment';
import { cn } from '@/lib/utils';

const COUNTRY_OPTIONS = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
const countryName = (iso: string) => COUNTRIES.find((c) => c.iso === iso)?.name || iso;
const METHOD_LABEL: Record<AdminRate['method'], string> = { ATLANTIS_COLLECTION: 'Collection: supplier → buyer', HUB_TO_BUYER: 'Hub → buyer' };
const UNIT_LABEL: Record<AdminRate['unit'], string> = { CASE: 'per case', PALLET: 'per pallet', TRUCK: 'per truck' };

/**
 * Hubs & freight rates — the only inputs the fulfilment calculation prices
 * from. A hub is public only when verified; a route without a rate is shown
 * to buyers as "quoted after the order". Nothing here is ever estimated.
 */
export default function AdminFulfillmentPage() {
    const [data, setData] = React.useState<{ hubs: AdminHub[]; rates: AdminRate[]; services: string[] } | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [hubEdit, setHubEdit] = React.useState<Partial<AdminHub> | null>(null);
    const [rateEdit, setRateEdit] = React.useState<Partial<AdminRate> | null>(null);
    const load = React.useCallback(() => { setError(null); getFulfillmentAdmin().then(setData).catch((e) => setError(e.message)); }, []);
    React.useEffect(() => { load(); }, [load]);

    return (
        <div className="max-w-6xl">
            <PageHeader title="Hubs & Freight Rates" description="What the delivery calculation uses for quotes, carts, checkout and orders. Routes without a rate are shown to buyers as “quoted after the order” — nothing is estimated." />
            {error && <ErrorState message={error} onRetry={load} />}
            {!data && !error && <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-60" /></div>}
            {data && (
                <div className="space-y-4">
                    <Card title="Atlantis hubs" description="Only verified, active hubs appear on the public Warehouses page and can be chosen by suppliers."
                        actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setHubEdit({ services: [], active: true, verified: false })}>Add hub</Button>}>
                        {data.hubs.length === 0 ? (
                            <EmptyState icon={<Warehouse size={20} />} title="No hubs yet">Add a hub only for a real location Atlantis operates or has contracted. Mark it verified once its address and services are confirmed.</EmptyState>
                        ) : (
                            <ul className="divide-y divide-line">
                                {data.hubs.map((h) => (
                                    <li key={h.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-heading flex flex-wrap items-center gap-2">{h.name}
                                                {h.verified ? <Badge tone="success"><ShieldCheck size={12} /> Verified</Badge> : <Badge tone="warning">Not verified — hidden</Badge>}
                                                {!h.active && <Badge tone="neutral">Inactive</Badge>}
                                            </p>
                                            <p className="text-[13px] text-ink-3">{h.city}, {countryName(h.country)}{h.address ? ` · ${h.address}` : ''} · {h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}</p>
                                            {h.services.length > 0 && <p className="text-[12.5px] text-ink-2 mt-0.5">{h.services.map((s) => HUB_SERVICE_LABEL[s] || s).join(' · ')}</p>}
                                        </div>
                                        <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => setHubEdit(h)}>Edit</Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card title="Freight rates" description="One active rate per route and unit. A truck rate is used for full trucks; otherwise pallets (and case orders by the pallet spaces they fill)."
                        actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setRateEdit({ method: 'ATLANTIS_COLLECTION', unit: 'PALLET', active: true })}>Add rate</Button>}>
                        {data.rates.length === 0 ? (
                            <EmptyState icon={<Route size={20} />} title="No rates configured">Until a rate exists for a route, buyers see delivery as “quoted after the order” and Atlantis sets the charge per order.</EmptyState>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13.5px]">
                                    <thead><tr className="text-ink-3 text-[12.5px] border-b border-line">
                                        <th className="text-start font-medium py-2 pe-3">Leg</th><th className="text-start font-medium py-2 pe-3">Route</th><th className="text-end font-medium py-2 pe-3">Rate</th><th className="text-start font-medium py-2 pe-3">Transit</th><th className="py-2" />
                                    </tr></thead>
                                    <tbody>
                                        {data.rates.map((r) => (
                                            <tr key={r.id} className={cn('border-b border-line last:border-0', !r.active && 'opacity-60')}>
                                                <td className="py-2.5 pe-3">{METHOD_LABEL[r.method]}{r.hubId ? <span className="block text-[12px] text-ink-3">{data.hubs.find((h) => h.id === r.hubId)?.name || 'Hub'}</span> : null}</td>
                                                <td className="py-2.5 pe-3">{countryName(r.originCountry)} → {countryName(r.destinationCountry)}</td>
                                                <td className="py-2.5 pe-3 text-end tabular-nums">{eur(r.amountEur)} <span className="text-ink-3">{UNIT_LABEL[r.unit]}</span></td>
                                                <td className="py-2.5 pe-3 text-ink-2">{r.minTransitDays != null && r.maxTransitDays != null ? `${r.minTransitDays}–${r.maxTransitDays} days` : '—'}{!r.active && ' · inactive'}</td>
                                                <td className="py-2.5 text-end"><Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setRateEdit(r)}>Edit</Button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                    <Notice tone="info">Changing a rate affects new quotes and orders only. Orders already placed keep the delivery calculated when they were submitted; a charge changed on an order creates a new terms version the buyer accepts.</Notice>
                </div>
            )}
            {hubEdit && data && <HubDialog hub={hubEdit} services={data.services} onClose={() => setHubEdit(null)} onSaved={() => { setHubEdit(null); load(); }} />}
            {rateEdit && data && <RateDialog rate={rateEdit} hubs={data.hubs} onClose={() => setRateEdit(null)} onSaved={() => { setRateEdit(null); load(); }} />}
        </div>
    );
}

function HubDialog({ hub, services, onClose, onSaved }: { hub: Partial<AdminHub>; services: string[]; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = React.useState({
        name: hub.name || '', city: hub.city || '', country: hub.country || '', address: hub.address || '',
        latitude: hub.latitude != null ? String(hub.latitude) : '', longitude: hub.longitude != null ? String(hub.longitude) : '',
        services: hub.services || [], active: hub.active !== false, verified: !!hub.verified, notes: hub.notes || '',
    });
    const [busy, setBusy] = React.useState(false);
    const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
    const submit = async () => {
        setBusy(true);
        try { await saveHub({ ...f, latitude: Number(f.latitude), longitude: Number(f.longitude) }, hub.id); toast.success('Hub saved'); onSaved(); }
        catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    return (
        <Dialog open onClose={onClose} title={hub.id ? 'Edit hub' : 'Add hub'} size="md"
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save hub</Button></>}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="hub-name" required><input id="hub-name" className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
                <Field label="City" htmlFor="hub-city" required><input id="hub-city" className={inputCls} value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
                <Field label="Country" htmlFor="hub-country" required>
                    <select id="hub-country" className={selectCls} value={f.country} onChange={(e) => set('country', e.target.value)}>
                        <option value="">Choose…</option>{COUNTRY_OPTIONS.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                    </select>
                </Field>
                <Field label="Address" htmlFor="hub-address" optional><input id="hub-address" className={inputCls} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
                <Field label="Latitude" htmlFor="hub-lat" required hint="Europe only (34 to 72)"><input id="hub-lat" type="number" step="0.0001" className={inputCls} value={f.latitude} onChange={(e) => set('latitude', e.target.value)} /></Field>
                <Field label="Longitude" htmlFor="hub-lng" required hint="−25 to 45"><input id="hub-lng" type="number" step="0.0001" className={inputCls} value={f.longitude} onChange={(e) => set('longitude', e.target.value)} /></Field>
            </div>
            <fieldset className="mt-4">
                <legend className="text-[13px] font-medium text-ink-2">Services actually offered at this hub</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                    {services.map((s) => (
                        <label key={s} className={cn('inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 text-[13px] cursor-pointer', f.services.includes(s) ? 'ring-teal bg-teal-soft/40' : 'ring-line')}>
                            <input type="checkbox" checked={f.services.includes(s)} onChange={() => set('services', f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s])} /> {HUB_SERVICE_LABEL[s] || s}
                        </label>
                    ))}
                </div>
            </fieldset>
            <Field label="Internal notes" htmlFor="hub-notes" optional className="mt-4"><textarea id="hub-notes" rows={2} className={cn(inputCls, 'h-auto py-2')} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
            <div className="mt-4 space-y-2 text-[13.5px]">
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active</label>
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={f.verified} onChange={(e) => set('verified', e.target.checked)} />
                    <span><strong>Verified.</strong> I confirm this is a real Atlantis hub and its address and services were checked. Verified hubs are shown publicly and offered to suppliers; your name and the date are recorded.</span>
                </label>
            </div>
        </Dialog>
    );
}

function RateDialog({ rate, hubs, onClose, onSaved }: { rate: Partial<AdminRate>; hubs: AdminHub[]; onClose: () => void; onSaved: () => void }) {
    const [f, setF] = React.useState({
        method: rate.method || 'ATLANTIS_COLLECTION', originCountry: rate.originCountry || '', destinationCountry: rate.destinationCountry || '', hubId: rate.hubId || '',
        unit: rate.unit || 'PALLET', amountEur: rate.amountEur != null ? String(rate.amountEur) : '',
        minTransitDays: rate.minTransitDays != null ? String(rate.minTransitDays) : '', maxTransitDays: rate.maxTransitDays != null ? String(rate.maxTransitDays) : '',
        active: rate.active !== false, note: rate.note || '',
    });
    const [busy, setBusy] = React.useState(false);
    const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
    const hubOnly = f.method === 'HUB_TO_BUYER';
    const submit = async () => {
        setBusy(true);
        try {
            const hub = hubs.find((h) => h.id === f.hubId);
            await saveRate({
                ...f, hubId: f.hubId || null, originCountry: hubOnly && hub ? hub.country : f.originCountry,
                minTransitDays: f.minTransitDays === '' ? null : Number(f.minTransitDays), maxTransitDays: f.maxTransitDays === '' ? null : Number(f.maxTransitDays),
            }, rate.id);
            toast.success('Rate saved'); onSaved();
        } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    return (
        <Dialog open onClose={onClose} title={rate.id ? 'Edit rate' : 'Add rate'} size="md"
            footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save rate</Button></>}>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Leg" htmlFor="rate-method" required>
                    <select id="rate-method" className={selectCls} value={f.method} onChange={(e) => set('method', e.target.value)}>
                        <option value="ATLANTIS_COLLECTION">Collection: supplier → buyer</option>
                        <option value="HUB_TO_BUYER">Hub → buyer</option>
                    </select>
                </Field>
                {hubOnly ? (
                    <Field label="Hub" htmlFor="rate-hub" required>
                        <select id="rate-hub" className={selectCls} value={f.hubId} onChange={(e) => set('hubId', e.target.value)}>
                            <option value="">Choose…</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.name} — {h.city}</option>)}
                        </select>
                    </Field>
                ) : (
                    <Field label="From (supplier country)" htmlFor="rate-origin" required>
                        <select id="rate-origin" className={selectCls} value={f.originCountry} onChange={(e) => set('originCountry', e.target.value)}>
                            <option value="">Choose…</option>{COUNTRY_OPTIONS.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                        </select>
                    </Field>
                )}
                <Field label="To (buyer country)" htmlFor="rate-dest" required>
                    <select id="rate-dest" className={selectCls} value={f.destinationCountry} onChange={(e) => set('destinationCountry', e.target.value)}>
                        <option value="">Choose…</option>{COUNTRY_OPTIONS.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
                    </select>
                </Field>
                <Field label="Unit" htmlFor="rate-unit" required>
                    <select id="rate-unit" className={selectCls} value={f.unit} onChange={(e) => set('unit', e.target.value)}>
                        <option value="PALLET">Per pallet</option><option value="TRUCK">Per full truck</option><option value="CASE">Per case</option>
                    </select>
                </Field>
                <Field label="Rate (EUR, excl. VAT)" htmlFor="rate-amount" required><input id="rate-amount" type="number" min={0} step={0.01} className={inputCls} value={f.amountEur} onChange={(e) => set('amountEur', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Transit min (days)" htmlFor="rate-min" optional><input id="rate-min" type="number" min={0} step={1} className={inputCls} value={f.minTransitDays} onChange={(e) => set('minTransitDays', e.target.value)} /></Field>
                    <Field label="Max" htmlFor="rate-max" optional><input id="rate-max" type="number" min={0} step={1} className={inputCls} value={f.maxTransitDays} onChange={(e) => set('maxTransitDays', e.target.value)} /></Field>
                </div>
            </div>
            <Field label="Source / note" htmlFor="rate-note" optional hint="e.g. carrier contract or quote reference — shown to staff as the rate’s source." className="mt-3"><input id="rate-note" className={inputCls} value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
            <label className="mt-3 flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active</label>
        </Dialog>
    );
}
