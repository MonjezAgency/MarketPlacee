'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Truck, Warehouse, Ban, Check, Info, ArrowRight, Search } from 'lucide-react';
import { Badge, Button, Card, ErrorState, Field, Notice, PageHeader, Skeleton, Thumb, inputCls, selectCls } from '@/components/supplier/ui';
import { supplierApi, type SupplierProduct } from '@/lib/supplier-api';
import { listDestinations } from '@/lib/wholesale';
import {
    getSupplierFulfillment, previewSupplierFulfillment, saveSupplierFulfillment, setProductFulfillment,
    type FulfillmentMethod, type FulfillmentOption, type HubOption, type MethodInfo, type SupplierPreview, type SupplierSettings,
} from '@/lib/fulfillment';
import { cn } from '@/lib/utils';

const ICON: Record<FulfillmentMethod, React.ElementType> = { ATLANTIS_COLLECTION: Truck, SUPPLIER_TO_HUB: Warehouse, SUPPLIER_DIRECT: Ban };
const money = (n: number | null | undefined, currency = 'EUR') =>
    n == null ? '—' : new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
const TIERS = [{ v: 'carton', l: 'Cases' }, { v: 'pallet', l: 'Pallets' }, { v: 'truck', l: 'Trucks' }];

/**
 * Supplier shipping & fulfilment: how goods leave the supplier, who is
 * responsible at each step, and what each method adds. The supplier's net
 * price never changes with the method — logistics charges sit on top.
 * Every figure comes from the server's shared calculation.
 */
export default function SupplierFulfillmentPage() {
    const [data, setData] = React.useState<{ settings: SupplierSettings; methods: MethodInfo[]; hubs: HubOption[] } | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState<{ defaultMethod: FulfillmentMethod; hubId: string; freight: string }>({ defaultMethod: 'ATLANTIS_COLLECTION', hubId: '', freight: '' });
    const [saving, setSaving] = React.useState(false);

    const load = React.useCallback(() => {
        setError(null);
        getSupplierFulfillment().then((d) => {
            setData(d);
            setDraft({ defaultMethod: d.settings.defaultMethod, hubId: d.settings.hubId || '', freight: d.settings.hubFreightPerPallet != null ? String(d.settings.hubFreightPerPallet) : '' });
        }).catch((e) => setError(e.message));
    }, []);
    React.useEffect(() => { load(); }, [load]);

    const saved = data?.settings;
    const dirty = !!saved && (draft.defaultMethod !== saved.defaultMethod || (draft.hubId || null) !== (saved.hubId || null) || (draft.freight === '' ? null : Number(draft.freight)) !== saved.hubFreightPerPallet);
    const draftSettings: Partial<SupplierSettings> = { defaultMethod: draft.defaultMethod, hubId: draft.hubId || null, hubFreightPerPallet: draft.freight === '' ? null : Number(draft.freight) };

    const save = async () => {
        setSaving(true);
        try {
            await saveSupplierFulfillment({ defaultMethod: draft.defaultMethod, hubId: draft.hubId || null, hubFreightPerPallet: draft.freight === '' ? null : Number(draft.freight) });
            toast.success('Fulfilment defaults saved');
            load();
        } catch (e: any) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    return (
        <div>
            <PageHeader title="Shipping & Fulfilment" description="Choose how your goods leave you and see what each method adds — before buyers see it. Your net price stays the same whichever method is used." />

            {error && <ErrorState message={error} onRetry={load} />}
            {!data && !error && <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>}

            {data && (
                <div className="space-y-4">
                    <Card title="Default method" description="Used for all your products unless a product has its own setting below."
                        actions={<Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>Save defaults</Button>}>
                        <div className="grid gap-3 lg:grid-cols-3" role="radiogroup" aria-label="Default fulfilment method">
                            {data.methods.map((m) => {
                                const Icon = ICON[m.key];
                                const off = m.key === 'SUPPLIER_DIRECT' || (m.key === 'SUPPLIER_TO_HUB' && data.hubs.length === 0);
                                const on = draft.defaultMethod === m.key;
                                return (
                                    <button key={m.key} type="button" role="radio" aria-checked={on} disabled={off}
                                        onClick={() => setDraft((d) => ({ ...d, defaultMethod: m.key }))}
                                        className={cn('flex flex-col justify-start text-start rounded-xl p-4 ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                            on ? 'ring-2 ring-teal bg-teal-soft/40' : 'ring-line hover:ring-line-strong', off && 'opacity-60 cursor-not-allowed hover:ring-line')}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="inline-flex items-center gap-2 font-semibold text-heading text-[14px]"><Icon size={16} className="text-teal" /> {m.label}</span>
                                            {on ? <Badge tone="brand"><Check size={12} /> Selected</Badge> : off ? <Badge tone="neutral">{m.key === 'SUPPLIER_DIRECT' ? 'Not offered' : 'No hub yet'}</Badge> : null}
                                        </div>
                                        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{m.summary}</p>
                                        {m.steps.length > 0 && (
                                            <ol className="mt-2 space-y-1 text-[12.5px] text-ink-3 list-decimal ps-4">
                                                {m.steps.map((s, i) => <li key={i}><span className="font-medium text-ink-2">{s.who}:</span> {s.what}</li>)}
                                            </ol>
                                        )}
                                        <p className="mt-2 text-[12.5px] text-ink-2"><span className="font-medium">Responsibility passes:</span> {m.handover}</p>
                                    </button>
                                );
                            })}
                        </div>

                        {draft.defaultMethod === 'SUPPLIER_TO_HUB' && (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <Field label="Atlantis hub you deliver to" htmlFor="ff-hub" required>
                                    <select id="ff-hub" className={selectCls} value={draft.hubId} onChange={(e) => setDraft((d) => ({ ...d, hubId: e.target.value }))}>
                                        <option value="">Choose a hub…</option>
                                        {data.hubs.map((h) => <option key={h.id} value={h.id}>{h.name} — {h.city}, {h.countryName}</option>)}
                                    </select>
                                </Field>
                                <Field label="Your freight to the hub, per pallet (EUR)" htmlFor="ff-freight" required hint="Added on top of your net price and paid to you. Leave out anything already inside your net price.">
                                    <input id="ff-freight" type="number" min={0} step={0.01} inputMode="decimal" className={inputCls} value={draft.freight} onChange={(e) => setDraft((d) => ({ ...d, freight: e.target.value }))} />
                                </Field>
                            </div>
                        )}

                        {data.hubs.length === 0 && (
                            <p className="mt-4 flex gap-2 text-[13px] text-ink-3"><Info size={15} className="shrink-0 mt-0.5" /> Atlantis has no verified hub yet, so delivering to a hub isn’t available. Atlantis collection from your EXW location is used. <Link href="/warehouses" className="text-teal font-medium hover:underline">About hubs</Link></p>
                        )}
                        {dirty && <p className="mt-3 text-[12.5px] text-[#B45309]">You have unsaved changes. The comparison below already uses them.</p>}
                    </Card>

                    <ComparePanel draft={draftSettings} methods={data.methods} />

                    <Card title="How the price is put together">
                        <ul className="space-y-2 text-[13.5px] text-ink-2">
                            <li className="flex gap-2"><Check size={15} className="text-teal shrink-0 mt-0.5" /> <span><strong className="text-ink">Your net price</strong> is what you receive for the goods. It is the same for every method — Atlantis never lowers it to fit a shipping cost.</span></li>
                            <li className="flex gap-2"><Check size={15} className="text-teal shrink-0 mt-0.5" /> <span><strong className="text-ink">Freight you declare</strong> (hub delivery) is passed through to you on top of your net price — it is never counted twice.</span></li>
                            <li className="flex gap-2"><Check size={15} className="text-teal shrink-0 mt-0.5" /> <span><strong className="text-ink">Atlantis logistics charges</strong> come from rates Atlantis has configured for that route. Where none exists, the buyer sees “quoted after the order” — no price is guessed.</span></li>
                            <li className="flex gap-2"><Check size={15} className="text-teal shrink-0 mt-0.5" /> <span>The buyer’s price also includes the Atlantis margin, which isn’t shown here. VAT is added on the invoice.</span></li>
                            <li className="flex gap-2"><Check size={15} className="text-teal shrink-0 mt-0.5" /> <span>If an order’s quantities, prices or method change after you accept, you’re asked to confirm the new terms. <Link href="/protected-payments" className="text-teal font-medium hover:underline">How confirmation works</Link></span></li>
                        </ul>
                    </Card>
                </div>
            )}
        </div>
    );
}

function ComparePanel({ draft, methods }: { draft: Partial<SupplierSettings>; methods: MethodInfo[] }) {
    const [q, setQ] = React.useState('');
    const [products, setProducts] = React.useState<SupplierProduct[] | null>(null);
    const [productId, setProductId] = React.useState('');
    const [tier, setTier] = React.useState('pallet');
    const [quantity, setQuantity] = React.useState('1');
    const [destinations, setDestinations] = React.useState<{ code: string; name: string }[]>([]);
    const [dest, setDest] = React.useState('');
    const [preview, setPreview] = React.useState<SupplierPreview | null>(null);
    const [err, setErr] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [savingOverride, setSavingOverride] = React.useState(false);

    React.useEffect(() => { listDestinations().then((d) => setDestinations(d.countries.filter((c) => c.supported))).catch(() => setDestinations([])); }, []);
    React.useEffect(() => {
        const t = setTimeout(() => {
            supplierApi.products({ q: q.trim() || undefined, limit: 20 })
                .then((p) => { setProducts(p.data); if (!productId && p.data[0]) setProductId(p.data[0].id); })
                .catch(() => setProducts([]));
        }, 250);
        return () => clearTimeout(t);
    }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

    const draftKey = JSON.stringify(draft);
    const run = React.useCallback(() => {
        if (!productId) return;
        setLoading(true); setErr(null);
        previewSupplierFulfillment({ productId, tier, quantity: Math.max(1, Number(quantity) || 1), destination: dest || undefined, draft })
            .then(setPreview).catch((e) => setErr(e.message)).finally(() => setLoading(false));
    }, [productId, tier, quantity, dest, draftKey]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { const t = setTimeout(run, 200); return () => clearTimeout(t); }, [run]);

    const override = async (method: FulfillmentMethod | null) => {
        if (!preview) return;
        setSavingOverride(true);
        try { await setProductFulfillment(preview.product.id, method); toast.success(method ? 'This product now uses its own method' : 'This product now uses your default'); run(); }
        catch (e: any) { toast.error(e.message); }
        finally { setSavingOverride(false); }
    };

    const selected = products?.find((p) => p.id === productId);
    const currency = preview?.net?.currency || 'EUR';

    return (
        <Card title="Compare methods for a product" description="A live preview from the same calculation used for buyers’ quotes, carts and orders.">
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_0.7fr_1fr]">
                <Field label="Product" htmlFor="cmp-product">
                    <div className="space-y-2">
                        <label className="relative block">
                            <span className="sr-only">Search your products</span>
                            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or barcode" className={cn(inputCls, 'ps-8')} />
                        </label>
                        <select id="cmp-product" className={selectCls} value={productId} onChange={(e) => setProductId(e.target.value)}>
                            {!products?.length && <option value="">{products ? 'No products found' : 'Loading…'}</option>}
                            {products?.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status !== 'APPROVED' ? ` (${p.status.toLowerCase().replace('_', ' ')})` : ''}</option>)}
                        </select>
                    </div>
                </Field>
                <Field label="Order size" htmlFor="cmp-tier">
                    <select id="cmp-tier" className={selectCls} value={tier} onChange={(e) => setTier(e.target.value)}>{TIERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
                </Field>
                <Field label="Quantity" htmlFor="cmp-qty">
                    <input id="cmp-qty" type="number" min={1} max={1000} step={1} className={inputCls} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </Field>
                <Field label="Buyer’s country" htmlFor="cmp-dest">
                    <select id="cmp-dest" className={selectCls} value={dest} onChange={(e) => setDest(e.target.value)}>
                        <option value="">Choose a country…</option>
                        {destinations.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                </Field>
            </div>

            {err && <div className="mt-4"><Notice tone="danger">{err}</Notice></div>}
            {!productId && products && products.length === 0 && <p className="mt-4 text-[13.5px] text-ink-3">Add a product (a draft is enough) to compare methods for it before you publish.</p>}

            {preview && (
                <div className={cn('mt-5 space-y-4 transition-opacity', loading && 'opacity-60')}>
                    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2/60 p-3.5">
                        {selected && <Thumb src={selected.images?.[0]} size={44} />}
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-heading truncate">{preview.product.name}</p>
                            <p className="text-[12.5px] text-ink-3">
                                Dispatch from {preview.product.dispatchCountryName || <span className="text-[#B45309]">unknown — add a country to the EXW location</span>}
                                {preview.product.casesPerPallet ? ` · ${preview.product.casesPerPallet} cases/pallet` : ' · cases per pallet missing'}
                            </p>
                        </div>
                        <div className="text-end">
                            <p className="text-[12px] text-ink-3">Your net price{preview.net ? ` (${preview.quantity} × ${TIERS.find((t) => t.v === preview.tier)?.l.toLowerCase().replace(/s$/, '')})` : ''}</p>
                            <p className="text-[18px] font-semibold text-heading tabular-nums">{preview.net ? money(preview.net.total, currency) : '—'}</p>
                            {preview.net && <p className="text-[12px] text-ink-3 tabular-nums">{money(preview.net.perCase, currency)} per case · same for every method</p>}
                        </div>
                    </div>
                    {!preview.net && <Notice tone="warning">Your net price can’t be shown for this size — the product is missing a price or packaging data (cases per pallet / pallets per truck).</Notice>}

                    <div className="grid gap-3 lg:grid-cols-3">
                        {preview.options.map((o) => <OptionColumn key={o.method} o={o} active={preview.activeMethod === o.method} net={preview.net?.total ?? null} currency={currency} />)}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[13px]">
                        <span className="text-ink-2">This product uses:</span>
                        <select aria-label="Method for this product" className={cn(selectCls, 'w-auto min-w-[230px]')} disabled={savingOverride}
                            value={preview.product.fulfillmentMethod || ''} onChange={(e) => override((e.target.value || null) as FulfillmentMethod | null)}>
                            <option value="">Your default ({methods.find((m) => m.key === (draft.defaultMethod || 'ATLANTIS_COLLECTION'))?.label})</option>
                            {methods.filter((m) => m.key !== 'SUPPLIER_DIRECT').map((m) => <option key={m.key} value={m.key}>{m.label} (this product only)</option>)}
                        </select>
                        <Link href={`/supplier/products/${preview.product.id}/edit`} className="inline-flex items-center gap-1 text-teal font-medium hover:underline">Edit product <ArrowRight size={13} /></Link>
                    </div>
                </div>
            )}
        </Card>
    );
}

function OptionColumn({ o, active, net, currency }: { o: FulfillmentOption; active: boolean; net: number | null; currency: string }) {
    const toSupplier = o.charges.filter((c) => c.paidTo !== 'Atlantis').reduce((s, c) => s + c.amount, 0);
    return (
        <div className={cn('rounded-xl ring-1 p-4 flex flex-col', active ? 'ring-2 ring-teal' : 'ring-line')}>
            <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-heading text-[14px]">{o.label}</p>
                {active ? <Badge tone="brand">In use</Badge> : o.status === 'unavailable' ? <Badge tone="neutral">Unavailable</Badge> : null}
            </div>
            {o.status === 'priced' ? (
                <>
                    <ul className="mt-3 space-y-1.5 text-[13px]">
                        <li className="flex justify-between gap-2"><span className="text-ink-2">Your net price</span><span className="tabular-nums">{money(net, currency)}</span></li>
                        {o.charges.map((c, i) => (
                            <li key={i} className="flex justify-between gap-2">
                                <span className="text-ink-2 min-w-0">{c.label}<span className="block text-[12px] text-ink-3">{c.basis} · {c.paidTo === 'Atlantis' ? 'paid by the buyer to Atlantis' : 'paid to you'}</span></span>
                                <span className="tabular-nums shrink-0">{money(c.amount)}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-3 border-t border-line pt-2 text-[13px] space-y-1">
                        <p className="flex justify-between"><span className="text-ink-2">Logistics added</span><span className="font-semibold tabular-nums">{money(o.total)}</span></p>
                        {toSupplier > 0 && net != null && currency === 'EUR' && <p className="flex justify-between"><span className="text-ink-2">You receive</span><span className="font-semibold tabular-nums">{money(net + toSupplier)}</span></p>}
                        {o.transitDays && <p className="text-[12px] text-ink-3">Transit {o.transitDays.min}–{o.transitDays.max} days</p>}
                    </div>
                </>
            ) : (
                <div className="mt-3 text-[13px] space-y-1.5">
                    <p className="text-ink-2">{o.status === 'unavailable' ? 'Not available for this order.' : 'Quoted by Atlantis after the order — no rate is configured yet.'}</p>
                    {o.reasons.map((r, i) => <p key={i} className="flex gap-1.5 text-ink-3 text-[12.5px]"><Info size={13} className="shrink-0 mt-0.5" /> {r}</p>)}
                    {net != null && o.status === 'quote_required' && <p className="text-ink-2">Your net price stays {money(net, currency)}.</p>}
                </div>
            )}
            <p className="mt-auto pt-3 text-[12px] text-ink-3"><span className="font-medium text-ink-2">Responsibility:</span> {o.handover}</p>
        </div>
    );
}
