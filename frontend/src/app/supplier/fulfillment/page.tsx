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
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

const S = 'supplierOps';
const ICON: Record<FulfillmentMethod, React.ElementType> = { ATLANTIS_COLLECTION: Truck, SUPPLIER_TO_HUB: Warehouse, SUPPLIER_DIRECT: Ban };
/** Option value (sent to the API) → label key; qty = plural key for "{count} pallets". */
const TIERS = [{ v: 'carton', l: 'ffTierCases', qty: 'qtyCases' }, { v: 'pallet', l: 'ffTierPallets', qty: 'qtyPallets' }, { v: 'truck', l: 'ffTierTrucks', qty: 'qtyTrucks' }];

/**
 * The method texts come from the server in English (METHOD_INFO in
 * backend/src/fulfillment/fulfillment-calc.ts). They are shown from the
 * dictionary by method key; anything the dictionary doesn't know (a new
 * step, a changed list) falls back to the server's English text.
 */
const METHOD_KEY: Record<string, { prefix: string; steps: number }> = {
    ATLANTIS_COLLECTION: { prefix: 'methodCollection', steps: 3 },
    SUPPLIER_TO_HUB: { prefix: 'methodHub', steps: 3 },
    SUPPLIER_DIRECT: { prefix: 'methodDirect', steps: 2 },
};
const WHO_KEY: Record<string, string> = { Supplier: 'whoSupplier', Atlantis: 'whoAtlantis', Carrier: 'whoCarrier', Buyer: 'whoBuyer' };
/** Charge key prefix (server) → label key. */
const CHARGE_LABEL: Record<string, string> = { ATLANTIS_COLLECTION: 'chargeCollection', SUPPLIER_TO_HUB: 'chargeHubFreight', HUB_TO_BUYER: 'chargeHubToBuyer' };
/** Fixed server reasons (fulfillment-calc.ts priceOption) → key; reasons that embed names or routes stay as server text. */
const REASON_KEY: Record<string, string> = {
    'Direct shipment by suppliers isn’t offered on Atlantis yet.': 'reasonDirectNotOffered',
    'Choose a delivery country to see delivery charges.': 'reasonChooseCountry',
    'Enter a quantity.': 'reasonEnterQuantity',
    'The EXW location doesn’t name a country Atlantis recognises — freight is quoted after the order.': 'reasonExwCountry',
    'Atlantis has no verified hub accepting deliveries yet.': 'reasonNoVerifiedHub',
    'Choose the Atlantis hub you deliver to in your fulfilment settings.': 'reasonChooseHub',
    'Add what you charge to bring one pallet to the hub.': 'reasonAddHubFreight',
    'Pallet spaces can’t be worked out for this load (set cases per pallet).': 'reasonPalletSpaces',
};
const PRODUCT_STATUS_KEY: Record<string, string> = { DRAFT: 'psDRAFT', PENDING: 'psPENDING', NEEDS_CHANGES: 'psNEEDS_CHANGES', REJECTED: 'psREJECTED' };

/** Dictionary-backed method texts and locale formatting for this page. */
function useFF() {
    const { t, fmt, meta } = useLanguage();
    return React.useMemo(() => {
        let regions: Intl.DisplayNames | null = null;
        try { regions = new Intl.DisplayNames([meta.intl], { type: 'region' }); } catch { regions = null; }
        const k = (m: string) => METHOD_KEY[m];
        return {
            money: (n: number | null | undefined, currency = 'EUR') => (n == null ? '—' : fmt.number(n, { style: 'currency', currency, maximumFractionDigits: 2 })),
            country: (code: string | null | undefined, fallback?: string | null) => { if (!code) return fallback || ''; try { return regions?.of(code.toUpperCase()) || fallback || code; } catch { return fallback || code; } },
            label: (m: { key?: string; method?: string; label: string }) => { const x = k(m.key || m.method || ''); return x ? t(S, `${x.prefix}Label`) : m.label; },
            summary: (m: MethodInfo): React.ReactNode => (k(m.key) ? t(S, `${k(m.key).prefix}Summary`) : <span lang="en">{m.summary}</span>),
            handover: (m: { key?: string; method?: string; handover: string }): React.ReactNode => { const x = k(m.key || m.method || ''); return x ? t(S, `${x.prefix}Handover`) : <span lang="en">{m.handover}</span>; },
            /** Steps from the dictionary when the server sends the list we know; else the server's text. */
            steps: (m: MethodInfo): { who: React.ReactNode; what: React.ReactNode }[] => {
                const x = k(m.key);
                const known = !!x && m.steps.length === x.steps && m.steps.every((s) => WHO_KEY[s.who]);
                return m.steps.map((s, i) => known
                    ? { who: t(S, WHO_KEY[s.who]), what: t(S, `${x!.prefix}Step${i + 1}`) }
                    : {
                        who: WHO_KEY[s.who] ? t(S, WHO_KEY[s.who]) : <span lang="en">{s.who}</span>,
                        what: <span lang="en">{s.what}</span>,
                    });
            },
            reason: (r: string): React.ReactNode => (REASON_KEY[r] ? t(S, REASON_KEY[r]) : <span lang="en">{r}</span>),
            chargeLabel: (c: { key: string; label: string }) => { const key = CHARGE_LABEL[String(c.key || '').split(':')[0]]; return key ? t(S, key) : c.label; },
        };
    }, [t, fmt, meta.intl]);
}

/**
 * Supplier shipping & fulfilment: how goods leave the supplier, who is
 * responsible at each step, and what each method adds. The supplier's net
 * price never changes with the method — logistics charges sit on top.
 * Every figure comes from the server's shared calculation.
 */
export default function SupplierFulfillmentPage() {
    const { t } = useLanguage();
    const ff = useFF();
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
            toast.success(t(S, 'ffToastSaved'));
            load();
        } catch (e: any) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    return (
        <div data-no-translate>
            <PageHeader title={t(S, 'ffTitle')} description={t(S, 'ffDescription')} />

            {error && <ErrorState message={error} onRetry={load} />}
            {!data && !error && <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>}

            {data && (
                <div className="space-y-4">
                    <Card title={t(S, 'ffDefaultTitle')} description={t(S, 'ffDefaultDescription')}
                        actions={<Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>{t(S, 'ffSaveDefaults')}</Button>}>
                        <div className="grid gap-3 lg:grid-cols-3" role="radiogroup" aria-label={t(S, 'ffDefaultGroupLabel')}>
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
                                            <span className="inline-flex items-center gap-2 font-semibold text-heading text-[14px]"><Icon size={16} className="text-teal" /> {ff.label(m)}</span>
                                            {on ? <Badge tone="brand"><Check size={12} /> {t(S, 'ffSelected')}</Badge> : off ? <Badge tone="neutral">{m.key === 'SUPPLIER_DIRECT' ? t(S, 'ffNotOffered') : t(S, 'ffNoHub')}</Badge> : null}
                                        </div>
                                        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{ff.summary(m)}</p>
                                        {m.steps.length > 0 && (
                                            <ol className="mt-2 space-y-1 text-[12.5px] text-ink-3 list-decimal ps-4">
                                                {ff.steps(m).map((s, i) => <li key={i}><span className="font-medium text-ink-2">{s.who}:</span> {s.what}</li>)}
                                            </ol>
                                        )}
                                        <p className="mt-2 text-[12.5px] text-ink-2"><span className="font-medium">{t(S, 'ffResponsibilityPasses')}</span> {ff.handover(m)}</p>
                                    </button>
                                );
                            })}
                        </div>

                        {draft.defaultMethod === 'SUPPLIER_TO_HUB' && (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <Field label={t(S, 'ffHubLabel')} htmlFor="ff-hub" required>
                                    <select id="ff-hub" className={selectCls} value={draft.hubId} onChange={(e) => setDraft((d) => ({ ...d, hubId: e.target.value }))}>
                                        <option value="">{t(S, 'ffChooseHub')}</option>
                                        {data.hubs.map((h) => <option key={h.id} value={h.id}>{h.name} — {h.city}, {ff.country(h.country, h.countryName)}</option>)}
                                    </select>
                                </Field>
                                <Field label={t(S, 'ffFreightLabel')} htmlFor="ff-freight" required hint={t(S, 'ffFreightHint')}>
                                    <input id="ff-freight" type="number" min={0} step={0.01} inputMode="decimal" className={inputCls} value={draft.freight} onChange={(e) => setDraft((d) => ({ ...d, freight: e.target.value }))} />
                                </Field>
                            </div>
                        )}

                        {data.hubs.length === 0 && (
                            <p className="mt-4 flex gap-2 text-[13px] text-ink-3"><Info size={15} className="shrink-0 mt-0.5" /> <span><Trans text={t(S, 'ffNoHubInfo')} tags={{ link: (c) => <Link href="/warehouses" className="text-teal font-medium hover:underline">{c}</Link> }} /></span></p>
                        )}
                        {dirty && <p className="mt-3 text-[12.5px] text-[#B45309]">{t(S, 'ffUnsaved')}</p>}
                    </Card>

                    <ComparePanel draft={draftSettings} methods={data.methods} />

                    <Card title={t(S, 'ffPriceTitle')}>
                        <ul className="space-y-2 text-[13.5px] text-ink-2">
                            {['ffPriceNet', 'ffPriceFreight', 'ffPriceLogistics', 'ffPriceMargin', 'ffPriceChange'].map((key) => (
                                <li key={key} className="flex gap-2"><Check size={15} className="text-teal shrink-0 mt-0.5" /> <span><Trans text={t(S, key)} tags={{
                                    b: (c) => <strong className="text-ink">{c}</strong>,
                                    link: (c) => <Link href="/protected-payments" className="text-teal font-medium hover:underline">{c}</Link>,
                                }} /></span></li>
                            ))}
                        </ul>
                    </Card>
                </div>
            )}
        </div>
    );
}

function ComparePanel({ draft, methods }: { draft: Partial<SupplierSettings>; methods: MethodInfo[] }) {
    const { t } = useLanguage();
    const ff = useFF();
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
        try { await setProductFulfillment(preview.product.id, method); toast.success(method ? t(S, 'ffToastOwnMethod') : t(S, 'ffToastDefault')); run(); }
        catch (e: any) { toast.error(e.message); }
        finally { setSavingOverride(false); }
    };

    const selected = products?.find((p) => p.id === productId);
    const currency = preview?.net?.currency || 'EUR';

    return (
        <Card title={t(S, 'ffCompareTitle')} description={t(S, 'ffCompareDescription')}>
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_0.7fr_1fr]">
                <Field label={t(S, 'ffProduct')} htmlFor="cmp-product">
                    <div className="space-y-2">
                        <label className="relative block">
                            <span className="sr-only">{t(S, 'ffSearchProducts')}</span>
                            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(S, 'ffSearchPlaceholder')} className={cn(inputCls, 'ps-8')} />
                        </label>
                        <select id="cmp-product" className={selectCls} value={productId} onChange={(e) => setProductId(e.target.value)}>
                            {!products?.length && <option value="">{products ? t(S, 'ffNoProducts') : t(S, 'ffLoading')}</option>}
                            {products?.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status !== 'APPROVED' ? ` (${PRODUCT_STATUS_KEY[p.status] ? t(S, PRODUCT_STATUS_KEY[p.status]) : p.status.toLowerCase().replace('_', ' ')})` : ''}</option>)}
                        </select>
                    </div>
                </Field>
                <Field label={t(S, 'ffOrderSize')} htmlFor="cmp-tier">
                    <select id="cmp-tier" className={selectCls} value={tier} onChange={(e) => setTier(e.target.value)}>{TIERS.map((x) => <option key={x.v} value={x.v}>{t(S, x.l)}</option>)}</select>
                </Field>
                <Field label={t(S, 'ffQuantity')} htmlFor="cmp-qty">
                    <input id="cmp-qty" type="number" min={1} max={1000} step={1} className={inputCls} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </Field>
                <Field label={t(S, 'ffBuyerCountry')} htmlFor="cmp-dest">
                    <select id="cmp-dest" className={selectCls} value={dest} onChange={(e) => setDest(e.target.value)}>
                        <option value="">{t(S, 'ffChooseCountry')}</option>
                        {destinations.map((c) => <option key={c.code} value={c.code}>{ff.country(c.code, c.name)}</option>)}
                    </select>
                </Field>
            </div>

            {err && <div className="mt-4"><Notice tone="danger">{err}</Notice></div>}
            {!productId && products && products.length === 0 && <p className="mt-4 text-[13.5px] text-ink-3">{t(S, 'ffAddProductHint')}</p>}

            {preview && (
                <div className={cn('mt-5 space-y-4 transition-opacity', loading && 'opacity-60')}>
                    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2/60 p-3.5">
                        {selected && <Thumb src={selected.images?.[0]} size={44} />}
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-heading truncate">{preview.product.name}</p>
                            <p className="text-[12.5px] text-ink-3">
                                {preview.product.dispatchCountryName
                                    ? t(S, 'ffDispatchFrom', { country: ff.country(preview.product.dispatchCountry, preview.product.dispatchCountryName) })
                                    : <Trans text={t(S, 'ffDispatchUnknown')} tags={{ warn: (c) => <span className="text-[#B45309]">{c}</span> }} />}
                                {' · '}{preview.product.casesPerPallet ? t(S, 'ffCasesPerPallet', { count: preview.product.casesPerPallet }) : t(S, 'ffCasesPerPalletMissing')}
                            </p>
                        </div>
                        <div className="text-end">
                            <p className="text-[12px] text-ink-3">{preview.net ? t(S, 'ffYourNetPriceFor', { qty: t(S, TIERS.find((x) => x.v === preview.tier)?.qty || 'qtyCases', { count: preview.quantity }) }) : t(S, 'ffYourNetPrice')}</p>
                            <p className="text-[18px] font-semibold text-heading tabular-nums">{preview.net ? ff.money(preview.net.total, currency) : '—'}</p>
                            {preview.net && <p className="text-[12px] text-ink-3 tabular-nums">{t(S, 'ffPerCaseSame', { price: ff.money(preview.net.perCase, currency) })}</p>}
                        </div>
                    </div>
                    {!preview.net && <Notice tone="warning">{t(S, 'ffNoNetNotice')}</Notice>}

                    <div className="grid gap-3 lg:grid-cols-3">
                        {preview.options.map((o) => <OptionColumn key={o.method} o={o} active={preview.activeMethod === o.method} net={preview.net?.total ?? null} currency={currency} />)}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[13px]">
                        <span className="text-ink-2">{t(S, 'ffThisProductUses')}</span>
                        <select aria-label={t(S, 'ffMethodForProduct')} className={cn(selectCls, 'w-auto min-w-[230px]')} disabled={savingOverride}
                            value={preview.product.fulfillmentMethod || ''} onChange={(e) => override((e.target.value || null) as FulfillmentMethod | null)}>
                            <option value="">{t(S, 'ffYourDefault', { method: (() => { const m = methods.find((x) => x.key === (draft.defaultMethod || 'ATLANTIS_COLLECTION')); return m ? ff.label(m) : ''; })() })}</option>
                            {methods.filter((m) => m.key !== 'SUPPLIER_DIRECT').map((m) => <option key={m.key} value={m.key}>{t(S, 'ffThisProductOnly', { method: ff.label(m) })}</option>)}
                        </select>
                        <Link href={`/supplier/products/${preview.product.id}/edit`} className="inline-flex items-center gap-1 text-teal font-medium hover:underline">{t(S, 'ffEditProduct')} <ArrowRight size={13} className="rtl:rotate-180" /></Link>
                    </div>
                </div>
            )}
        </Card>
    );
}

function OptionColumn({ o, active, net, currency }: { o: FulfillmentOption; active: boolean; net: number | null; currency: string }) {
    const { t } = useLanguage();
    const ff = useFF();
    const money = ff.money;
    const toSupplier = o.charges.filter((c) => c.paidTo !== 'Atlantis').reduce((s, c) => s + c.amount, 0);
    return (
        <div className={cn('rounded-xl ring-1 p-4 flex flex-col', active ? 'ring-2 ring-teal' : 'ring-line')}>
            <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-heading text-[14px]">{ff.label(o)}</p>
                {active ? <Badge tone="brand">{t(S, 'ffInUse')}</Badge> : o.status === 'unavailable' ? <Badge tone="neutral">{t(S, 'ffUnavailable')}</Badge> : null}
            </div>
            {o.status === 'priced' ? (
                <>
                    <ul className="mt-3 space-y-1.5 text-[13px]">
                        <li className="flex justify-between gap-2"><span className="text-ink-2">{t(S, 'ffYourNetPrice')}</span><span className="tabular-nums">{money(net, currency)}</span></li>
                        {o.charges.map((c, i) => (
                            <li key={i} className="flex justify-between gap-2">
                                <span className="text-ink-2 min-w-0">{ff.chargeLabel(c)}<span className="block text-[12px] text-ink-3"><span lang="en" dir="ltr">{c.basis}</span> · {c.paidTo === 'Atlantis' ? t(S, 'ffPaidByBuyer') : t(S, 'ffPaidToYou')}</span></span>
                                <span className="tabular-nums shrink-0">{money(c.amount)}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-3 border-t border-line pt-2 text-[13px] space-y-1">
                        <p className="flex justify-between"><span className="text-ink-2">{t(S, 'ffLogisticsAdded')}</span><span className="font-semibold tabular-nums">{money(o.total)}</span></p>
                        {toSupplier > 0 && net != null && currency === 'EUR' && <p className="flex justify-between"><span className="text-ink-2">{t(S, 'ffYouReceive')}</span><span className="font-semibold tabular-nums">{money(net + toSupplier)}</span></p>}
                        {o.transitDays && <p className="text-[12px] text-ink-3">{t(S, 'ffTransit', { min: o.transitDays.min, max: o.transitDays.max })}</p>}
                    </div>
                </>
            ) : (
                <div className="mt-3 text-[13px] space-y-1.5">
                    <p className="text-ink-2">{o.status === 'unavailable' ? t(S, 'ffNotAvailable') : t(S, 'ffQuotedAfter')}</p>
                    {o.reasons.map((r, i) => <p key={i} className="flex gap-1.5 text-ink-3 text-[12.5px]"><Info size={13} className="shrink-0 mt-0.5" /> <span>{ff.reason(r)}</span></p>)}
                    {net != null && o.status === 'quote_required' && <p className="text-ink-2">{t(S, 'ffNetStays', { amount: money(net, currency) })}</p>}
                </div>
            )}
            <p className="mt-auto pt-3 text-[12px] text-ink-3"><span className="font-medium text-ink-2">{t(S, 'ffResponsibility')}</span> {ff.handover(o)}</p>
        </div>
    );
}
