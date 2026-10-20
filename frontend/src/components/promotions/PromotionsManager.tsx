'use client';

/**
 * Special offers management (backend: Promotion) for suppliers (own products,
 * net prices only) and Atlantis admins (any product, net and buyer prices).
 * Every rule is enforced by the server; this page previews prices with the
 * same formula and always shows the values the server returns after saving.
 * Times are entered and shown in UTC.
 */
import * as React from 'react';
import { Plus, Search, Tag, Eye, Pencil, XCircle, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import {
    Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Notice, PageHeader, Skeleton, Thumb,
    errorMessage, eur, inputCls, type Tone,
} from '@/components/supplier/ui';
import { useUtcTime } from './PromotionPrice';

type Mode = 'supplier' | 'admin';
type State = 'SCHEDULED' | 'ACTIVE' | 'ON_HOLD' | 'EXPIRED' | 'CANCELLED';
type Who = { kind: 'YOU' | 'ATLANTIS' | 'SUPPLIER'; id?: string; name?: string | null; email?: string | null } | null;

interface ProductRef { id: string; name: string; brand: string | null; ean: string | null; image: string | null; status: string; supplier?: { id: string; name: string | null } }
interface PromotionRow {
    id: string; name: string | null; discountPercent: number; startsAt: string; endsAt: string; state: State; editable: string[]; productLive: boolean;
    cancelledAt: string | null; cancelReason: string | null; createdAt: string; createdBy: Who; cancelledBy: Who;
    product: ProductRef;
    net: { current: number | null; promotional: number | null; atCreation: number | null; changedSinceCreation: boolean };
    buyer?: { current: number; promotional: number; percentOff: number | null; perNet: number };
    history: { at: string; action: 'CREATE' | 'UPDATE' | 'CANCEL'; reason: string | null; by: Who }[];
}
interface ListResponse { data: PromotionRow[]; total: number; page: number; totalPages: number; counts: Record<string, number> }
interface EligibleProduct extends ProductRef {
    eligible: boolean; reason: string | null; net: { current: number | null }; buyer?: { current: number; perNet: number };
    promotions: { id: string; discountPercent: number; startsAt: string; endsAt: string; state: State }[];
}

const S = 'promotions';
const TABS = ['ALL', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED'] as const;
const TAB_KEY: Record<(typeof TABS)[number], string> = { ALL: 'tabAll', SCHEDULED: 'tabScheduled', ACTIVE: 'tabActive', EXPIRED: 'tabExpired', CANCELLED: 'tabCancelled' };
const STATE_META: Record<State, { key: string; tone: Tone }> = {
    SCHEDULED: { key: 'stateScheduled', tone: 'info' },
    ACTIVE: { key: 'stateActive', tone: 'success' },
    ON_HOLD: { key: 'stateOnHold', tone: 'warning' },
    EXPIRED: { key: 'stateExpired', tone: 'neutral' },
    CANCELLED: { key: 'stateCancelled', tone: 'danger' },
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** ISO instant → value for <input type="datetime-local"> in UTC. */
const toInput = (iso: string) => new Date(iso).toISOString().slice(0, 16);
/** <input type="datetime-local"> value, read as UTC → ISO instant. */
const fromInput = (v: string) => (v ? `${v}:00Z` : '');

/**
 * `embedded`: rendered inside a page that already has the h1 (admin Offers →
 * Special offers tab), so the title becomes a toolbar line with the same action.
 */
export default function PromotionsManager({ mode, embedded = false }: { mode: Mode; embedded?: boolean }) {
    const { t, fmt } = useLanguage();
    const tr = React.useCallback((k: string, v?: Record<string, string | number>) => t(S, k, v), [t]);
    const utc = useUtcTime();
    const base = mode === 'admin' ? '/admin/promotions' : '/supplier-catalog/promotions';

    const [tab, setTab] = React.useState<(typeof TABS)[number]>('ALL');
    const [q, setQ] = React.useState('');
    const [debounced, setDebounced] = React.useState('');
    const [page, setPage] = React.useState(1);
    const [data, setData] = React.useState<ListResponse | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);
    const [editing, setEditing] = React.useState<PromotionRow | 'new' | null>(null);
    const [viewing, setViewing] = React.useState<PromotionRow | null>(null);
    const [cancelling, setCancelling] = React.useState<PromotionRow | null>(null);

    React.useEffect(() => { const h = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(h); }, [q]);
    React.useEffect(() => { setPage(1); }, [tab, debounced]);

    const load = React.useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams({ status: tab, page: String(page) });
            if (debounced) params.set('q', debounced);
            const res = await apiFetch(`${base}?${params}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(await errorMessage(res));
            setData(await res.json());
        } catch (e: any) { setError(e?.message || null); } finally { setLoading(false); }
    }, [base, tab, page, debounced]);
    React.useEffect(() => { load(); }, [load]);

    const onSaved = (msg: string) => { setEditing(null); setCancelling(null); setNotice(msg); load(); };
    const creator = (w: Who) => !w ? '—' : w.kind === 'YOU' ? tr('creatorYou') : mode === 'admin' && w.name ? w.name : w.kind === 'SUPPLIER' ? tr('creatorSupplier') : tr('creatorAtlantis');

    const priceCell = (r: PromotionRow, which: 'current' | 'promotional') => (
        <div className="tabular-nums text-end">
            <div className={cn(which === 'promotional' && 'font-semibold text-ink')}>{mode === 'admin' && <span className="text-[11.5px] text-ink-4 me-1">{tr('netLabel')}</span>}{eur(r.net[which])}</div>
            {mode === 'admin' && r.buyer && <div className="text-[12.5px] text-ink-3"><span className="text-[11.5px] text-ink-4 me-1">{tr('buyerLabel')}</span>{eur(r.buyer[which])}</div>}
        </div>
    );

    const counts = data?.counts || {};
    return (
        <div data-no-translate className="text-start">
            {embedded ? (
                <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[13.5px] text-ink-3 max-w-[70ch]">{tr(mode === 'admin' ? 'leadAdmin' : 'leadSupplier')}</p>
                    <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')} className="shrink-0">{tr('newOffer')}</Button>
                </div>
            ) : (
                <PageHeader title={tr('title')} description={tr(mode === 'admin' ? 'leadAdmin' : 'leadSupplier')}
                    actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>{tr('newOffer')}</Button>} />
            )}

            {notice && <div className="mb-4"><Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice></div>}

            <Card bodyClassName="p-0">
                <div className="flex flex-col gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-line lg:flex-row lg:items-center lg:justify-between">
                    <div role="tablist" aria-label={tr('tabsAria')} className="flex flex-wrap gap-1.5">
                        {TABS.map((k) => (
                            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                                className={cn('h-8 px-3 rounded-lg text-[13px] font-medium ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                    tab === k ? 'bg-teal-soft text-teal ring-teal/30' : 'text-ink-2 ring-line hover:bg-surface-2')}>
                                {tr(TAB_KEY[k])}{typeof counts[k] === 'number' && <span className="ms-1.5 tabular-nums text-ink-3">{fmt.number(counts[k])}</span>}
                            </button>
                        ))}
                    </div>
                    <label className="relative block lg:w-80">
                        <span className="sr-only">{tr('searchLabel')}</span>
                        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('searchPlaceholder')} className={cn(inputCls, 'ps-9')} />
                    </label>
                </div>

                {error ? <div className="p-4 sm:p-5"><ErrorState message={error} onRetry={load} /></div>
                    : loading && !data ? (
                        <div className="p-4 sm:p-5 space-y-3" aria-busy="true" aria-label={tr('loading')}>
                            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                        </div>
                    ) : !data || data.data.length === 0 ? (
                        <EmptyState icon={<Tag size={20} />} title={tab === 'ALL' && !debounced ? tr('emptyTitle') : tr('emptyFiltered')}
                            action={tab === 'ALL' && !debounced ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>{tr('newOffer')}</Button> : undefined}>
                            {tab === 'ALL' && !debounced ? tr('emptyBody') : null}
                        </EmptyState>
                    ) : (
                        <div className={cn('overflow-x-auto', loading && 'opacity-60')}>
                            <table className="w-full min-w-[980px] text-[13.5px]">
                                <thead>
                                    <tr className="text-[12.5px] text-ink-3 font-medium border-b border-line">
                                        <th scope="col" className="py-2.5 px-4 text-start font-medium">{tr('colProduct')}</th>
                                        <th scope="col" className="py-2.5 px-3 text-end font-medium">{tr('colDiscount')}</th>
                                        <th scope="col" className="py-2.5 px-3 text-end font-medium">{tr('colOriginal')}</th>
                                        <th scope="col" className="py-2.5 px-3 text-end font-medium">{tr('colPromo')}</th>
                                        <th scope="col" className="py-2.5 px-3 text-start font-medium">{tr('colStarts')}</th>
                                        <th scope="col" className="py-2.5 px-3 text-start font-medium">{tr('colEnds')}</th>
                                        <th scope="col" className="py-2.5 px-3 text-start font-medium">{tr('colStatus')}</th>
                                        <th scope="col" className="py-2.5 px-3 text-start font-medium">{tr('colCreator')}</th>
                                        <th scope="col" className="py-2.5 px-4 text-end font-medium"><span className="sr-only">{tr('colActions')}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.data.map((r) => {
                                        const st = STATE_META[r.state];
                                        const canCancel = ['SCHEDULED', 'ACTIVE', 'ON_HOLD'].includes(r.state);
                                        return (
                                            <tr key={r.id} className="border-b border-line last:border-0 align-top">
                                                <td className="py-3 px-4">
                                                    <div className="flex items-start gap-3 min-w-0">
                                                        <Thumb src={r.product.image} alt="" size={40} />
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-ink line-clamp-2">{r.product.name}</p>
                                                            <p className="text-[12.5px] text-ink-3 truncate">{[r.product.brand, r.name].filter(Boolean).join(' · ')}{r.product.ean && <> · <bdi dir="ltr">{r.product.ean}</bdi></>}</p>
                                                            {mode === 'admin' && r.product.supplier?.name && <p className="text-[12px] text-ink-4 truncate">{tr('supplierLabel')}: {r.product.supplier.name}</p>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3 text-end tabular-nums font-semibold text-[#B91C1C]">{tr('pctOff', { pct: fmt.number(r.discountPercent, { maximumFractionDigits: 2 }) })}</td>
                                                <td className="py-3 px-3">{priceCell(r, 'current')}</td>
                                                <td className="py-3 px-3">{priceCell(r, 'promotional')}</td>
                                                <td className="py-3 px-3 whitespace-nowrap tabular-nums">{utc(r.startsAt)}</td>
                                                <td className="py-3 px-3 whitespace-nowrap tabular-nums">{utc(r.endsAt)}</td>
                                                <td className="py-3 px-3"><span title={r.state === 'ON_HOLD' ? tr('onHoldHint') : undefined}><Badge tone={st.tone} dot>{tr(st.key)}</Badge></span></td>
                                                <td className="py-3 px-3 text-ink-2">{creator(r.createdBy)}</td>
                                                <td className="py-3 px-4">
                                                    <div className="flex justify-end gap-1">
                                                        <Button size="sm" variant="ghost" icon={<Eye size={14} />} aria-label={tr('viewAria', { name: r.product.name })} onClick={() => setViewing(r)}>{tr('view')}</Button>
                                                        {r.editable.length > 0 && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} aria-label={tr('editAria', { name: r.product.name })} onClick={() => setEditing(r)}>{tr('edit')}</Button>}
                                                        {canCancel && <Button size="sm" variant="ghost" className="text-red-700" icon={<XCircle size={14} />} aria-label={tr('cancelAria', { name: r.product.name })} onClick={() => setCancelling(r)}>{tr('cancelOffer')}</Button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-line text-[12.5px] text-ink-3">
                    <span>{tr('perCaseNote')}</span>
                    {data && data.totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{tr('prev')}</Button>
                            <span className="tabular-nums">{tr('pageOf', { page: data.page, pages: data.totalPages })}</span>
                            <Button size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>{tr('next')}</Button>
                        </div>
                    )}
                </div>
            </Card>

            {editing && <PromotionForm mode={mode} base={base} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
            {viewing && <PromotionDetails mode={mode} row={viewing} creator={creator} onClose={() => setViewing(null)} />}
            {cancelling && <CancelDialog base={base} row={cancelling} onClose={() => setCancelling(null)} onDone={() => onSaved(tr('cancelled'))} />}
        </div>
    );
}

// ─── Create / edit ─────────────────────────────────────────────────────

function PromotionForm({ mode, base, row, onClose, onSaved }: { mode: Mode; base: string; row: PromotionRow | null; onClose: () => void; onSaved: (msg: string) => void }) {
    const { t, fmt } = useLanguage();
    const tr = (k: string, v?: Record<string, string | number>) => t(S, k, v);
    const editable = row ? row.editable : ['discountPercent', 'startsAt', 'endsAt', 'name'];
    const [product, setProduct] = React.useState<EligibleProduct | null>(null);
    const [percent, setPercent] = React.useState(row ? String(row.discountPercent) : '');
    const [start, setStart] = React.useState(row ? toInput(row.startsAt) : toInput(new Date(Date.now() + 3600_000).toISOString()).slice(0, 14) + '00');
    const [end, setEnd] = React.useState(row ? toInput(row.endsAt) : '');
    const [name, setName] = React.useState(row?.name ?? '');
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [serverError, setServerError] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);

    const pct = Number(String(percent).replace(',', '.'));
    const pctOk = Number.isFinite(pct) && pct > 0 && pct <= 90;
    // Live preview — same formula as the server; the saved figures come from its response.
    const net = row ? row.net.current : product?.net.current ?? null;
    const perNet = row ? row.buyer?.perNet : product?.buyer?.perNet;
    const preview = net !== null && net !== undefined && pctOk ? {
        net: [round2(net), round2(net * (1 - pct / 100))] as const,
        buyer: mode === 'admin' && perNet ? [round2(net * perNet), round2(net * perNet * (1 - pct / 100))] as const : null,
    } : null;

    const submit = async () => {
        const e: Record<string, string> = {};
        if (!row && !product) e.product = tr('errProduct');
        if (editable.includes('discountPercent') && !pctOk) e.percent = tr('errPercent');
        if (!end || (editable.includes('startsAt') && !start)) e.dates = tr('errDates');
        else if (editable.includes('startsAt') && new Date(fromInput(end)) <= new Date(fromInput(start))) e.dates = tr('errEndBeforeStart');
        setErrors(e); setServerError(null);
        if (Object.keys(e).length) return;
        const body: Record<string, unknown> = {};
        if (!row) Object.assign(body, { productId: product!.id });
        if (editable.includes('discountPercent')) body.discountPercent = pct;
        if (editable.includes('startsAt')) body.startsAt = fromInput(start);
        if (editable.includes('endsAt') && (!row || fromInput(end) !== toInput(row.endsAt) + ':00Z')) body.endsAt = fromInput(end);
        if (editable.includes('name')) body.name = name.trim() || null;
        setSaving(true);
        try {
            const res = await apiFetch(row ? `${base}/${row.id}` : base, { method: row ? 'PATCH' : 'POST', body: JSON.stringify(body) });
            if (!res.ok) { setServerError(await errorMessage(res)); return; }
            onSaved(tr(row ? 'saved' : 'created'));
        } catch (err: any) { setServerError(err?.message || null); } finally { setSaving(false); }
    };

    const locked = (f: string) => !editable.includes(f);
    return (
        <Dialog open onClose={onClose} size="lg" title={tr(row ? 'formEditTitle' : 'formNewTitle')}
            footer={<><Button onClick={onClose}>{tr('close')}</Button><Button variant="primary" loading={saving} onClick={submit}>{tr(row ? 'save' : 'create')}</Button></>}>
            <div className="space-y-4">
                {row && row.state !== 'SCHEDULED' && <Notice tone="info">{tr('lockedRunning')}</Notice>}
                {serverError && <Notice tone="danger">{serverError}</Notice>}

                {row ? (
                    <div className="flex items-center gap-3 rounded-lg ring-1 ring-line p-3">
                        <Thumb src={row.product.image} alt="" size={44} />
                        <div className="min-w-0">
                            <p className="text-[14px] font-medium text-ink">{row.product.name}</p>
                            <p className="text-[12.5px] text-ink-3">{[row.product.brand, row.product.supplier?.name].filter(Boolean).join(' · ')}{row.product.ean && <> · <bdi dir="ltr">{row.product.ean}</bdi></>}</p>
                        </div>
                    </div>
                ) : (
                    <ProductPicker mode={mode} base={base} value={product} onChange={setProduct} error={errors.product} />
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={tr('formPercent')} htmlFor="promo-pct" required hint={tr('formPercentHint')} error={errors.percent}>
                        <input id="promo-pct" inputMode="decimal" value={percent} disabled={locked('discountPercent')} aria-invalid={!!errors.percent} onChange={(e) => setPercent(e.target.value)} className={cn(inputCls, 'tabular-nums')} />
                    </Field>
                    <Field label={tr('formStart')} htmlFor="promo-start" required hint={tr('formStartHint')}>
                        <input id="promo-start" type="datetime-local" value={start} disabled={locked('startsAt')} onChange={(e) => setStart(e.target.value)} className={cn(inputCls, 'tabular-nums')} />
                    </Field>
                    <Field label={tr('formEnd')} htmlFor="promo-end" required hint={tr('formEndHint')} error={errors.dates}>
                        <input id="promo-end" type="datetime-local" value={end} disabled={locked('endsAt')} aria-invalid={!!errors.dates} onChange={(e) => setEnd(e.target.value)} className={cn(inputCls, 'tabular-nums')} />
                    </Field>
                </div>
                <Field label={tr('formName')} htmlFor="promo-name" optional hint={tr('formNameHint')}>
                    <input id="promo-name" value={name} maxLength={80} disabled={locked('name')} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </Field>

                <section aria-live="polite" className="rounded-lg bg-surface-2 ring-1 ring-line p-3.5">
                    <h3 className="text-[13.5px] font-semibold text-heading">{tr('previewTitle')}</h3>
                    {preview ? (
                        <dl className="mt-2 grid gap-2 sm:grid-cols-2 text-[13.5px]">
                            <div>
                                <dt className="text-ink-3 text-[12.5px]">{tr('previewNet')}</dt>
                                <dd className="tabular-nums"><span className="text-ink-4 line-through me-2">{eur(preview.net[0])}</span><span className="font-semibold text-ink">{eur(preview.net[1])}</span></dd>
                            </div>
                            {preview.buyer && (
                                <div>
                                    <dt className="text-ink-3 text-[12.5px]">{tr('previewBuyer')}</dt>
                                    <dd className="tabular-nums"><span className="text-ink-4 line-through me-2">{eur(preview.buyer[0])}</span><span className="font-semibold text-ink">{eur(preview.buyer[1])}</span>
                                        <span className="ms-2 text-[12px] text-[#B91C1C]">{tr('pctOff', { pct: fmt.number(Math.round((1 - preview.buyer[1] / preview.buyer[0]) * 1000) / 10, { maximumFractionDigits: 1 }) })}</span></dd>
                                </div>
                            )}
                        </dl>
                    ) : <p className="mt-1 text-[13px] text-ink-3">{tr('previewEmpty')}</p>}
                    {row?.net.atCreation != null && <p className="mt-2 text-[12.5px] text-ink-3">{tr('priceAtCreation', { price: eur(row.net.atCreation) })}</p>}
                    {row?.net.changedSinceCreation && <p className="mt-1 text-[12.5px] text-amber-800">{tr('priceChanged')}</p>}
                    <p className="mt-2 text-[12px] text-ink-4">{tr('previewNote')}</p>
                </section>
            </div>
        </Dialog>
    );
}

function ProductPicker({ mode, base, value, onChange, error }: { mode: Mode; base: string; value: EligibleProduct | null; onChange: (p: EligibleProduct | null) => void; error?: string }) {
    const { t } = useLanguage();
    const tr = (k: string, v?: Record<string, string | number>) => t(S, k, v);
    const [q, setQ] = React.useState('');
    const [items, setItems] = React.useState<EligibleProduct[] | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [failed, setFailed] = React.useState<string | null>(null);
    const [active, setActive] = React.useState(-1);
    const listId = 'promo-product-list';

    React.useEffect(() => {
        if (value) return;
        let alive = true;
        const h = setTimeout(async () => {
            setBusy(true); setFailed(null);
            try {
                const res = await apiFetch(`${base}/products?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(await errorMessage(res));
                const body = await res.json();
                if (alive) { setItems(body.data || []); setActive(-1); }
            } catch (e: any) { if (alive) setFailed(e?.message || ''); } finally { if (alive) setBusy(false); }
        }, 250);
        return () => { alive = false; clearTimeout(h); };
    }, [q, base, value]);

    if (value) {
        return (
            <Field label={tr('formProduct')} required>
                <div className="flex items-center gap-3 rounded-lg ring-1 ring-line p-3">
                    <Thumb src={value.image} alt="" size={44} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-ink">{value.name}</p>
                        <p className="text-[12.5px] text-ink-3">{[value.brand, value.supplier?.name].filter(Boolean).join(' · ')}{value.ean && <> · <bdi dir="ltr">{value.ean}</bdi></>}</p>
                        <p className="text-[12.5px] text-ink-2 tabular-nums">{mode === 'admin' && <span className="text-ink-4 me-1">{tr('netLabel')}</span>}{eur(value.net.current)}{mode === 'admin' && value.buyer && <> · <span className="text-ink-4 me-1">{tr('buyerLabel')}</span>{eur(value.buyer.current)}</>}</p>
                    </div>
                    <Button size="sm" onClick={() => onChange(null)}>{tr('productChange')}</Button>
                </div>
            </Field>
        );
    }
    const choose = (p: EligibleProduct) => { if (p.eligible) onChange(p); };
    return (
        <Field label={tr('productSearchLabel')} htmlFor="promo-product" required error={error}>
            <div className="relative">
                <input id="promo-product" role="combobox" aria-expanded={!!items?.length} aria-controls={listId} aria-autocomplete="list"
                    aria-activedescendant={active >= 0 ? `promo-opt-${active}` : undefined} aria-invalid={!!error}
                    value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('productSearchPlaceholder')} className={inputCls}
                    onKeyDown={(e) => {
                        if (!items?.length) return;
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]); }
                        else if (e.key === 'Escape') setActive(-1);
                    }} />
                {busy && <Loader2 size={15} className="absolute end-3 top-1/2 -translate-y-1/2 animate-spin text-ink-4" aria-hidden />}
            </div>
            <p className="sr-only" aria-live="polite">{busy ? tr('productSearching') : items ? tr('productResults', { count: items.length }) : ''}</p>
            {failed !== null ? <div className="mt-2"><ErrorState message={failed || undefined} /></div> : items && items.length === 0 && !busy ? (
                <p className="mt-2 text-[13px] text-ink-3">{tr('productNoMatch')}</p>
            ) : items && (
                <ul id={listId} role="listbox" className="mt-2 max-h-64 overflow-y-auto rounded-lg ring-1 ring-line divide-y divide-line">
                    {items.map((p, i) => (
                        <li key={p.id} id={`promo-opt-${i}`} role="option" aria-selected={active === i} aria-disabled={!p.eligible}
                            onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                            className={cn('flex items-center gap-3 px-3 py-2', p.eligible ? 'cursor-pointer hover:bg-surface-2' : 'opacity-60 cursor-not-allowed', active === i && 'bg-teal-soft')}>
                            <Thumb src={p.image} alt="" size={36} />
                            <div className="min-w-0 flex-1">
                                <p className="text-[13.5px] font-medium text-ink truncate">{p.name}</p>
                                <p className="text-[12px] text-ink-3 truncate">{[p.brand, p.supplier?.name].filter(Boolean).join(' · ')}{p.ean && <> · <bdi dir="ltr">{p.ean}</bdi></>}</p>
                                {p.promotions.length > 0 && <p className="text-[12px] text-amber-800">{tr('productOffers', { count: p.promotions.length })}</p>}
                            </div>
                            <div className="text-end text-[12.5px] tabular-nums shrink-0">
                                {p.eligible ? <>{eur(p.net.current)}{mode === 'admin' && p.buyer && <div className="text-ink-3">{tr('buyerLabel')} {eur(p.buyer.current)}</div>}</>
                                    : <Badge tone="warning">{tr(p.reason === 'PRICE_MISSING' ? 'productNoPrice' : 'productNotLive')}</Badge>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Field>
    );
}

// ─── Details / cancel ──────────────────────────────────────────────────

function PromotionDetails({ mode, row, creator, onClose }: { mode: Mode; row: PromotionRow; creator: (w: Who) => string; onClose: () => void }) {
    const { t, fmt } = useLanguage();
    const tr = (k: string, v?: Record<string, string | number>) => t(S, k, v);
    const utc = useUtcTime();
    const st = STATE_META[row.state];
    const histKey = { CREATE: 'histCreate', UPDATE: 'histUpdate', CANCEL: 'histCancel' } as const;
    const line = (label: string, value: React.ReactNode) => (
        <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3 py-2 border-b border-line last:border-0"><dt className="text-ink-3">{label}</dt><dd className="text-ink tabular-nums">{value}</dd></div>
    );
    return (
        <Dialog open onClose={onClose} size="md" title={tr('detailsTitle')} description={row.product.name} footer={<Button onClick={onClose}>{tr('close')}</Button>}>
            {row.state === 'ON_HOLD' && <div className="mb-3"><Notice tone="warning">{tr('onHoldHint')}</Notice></div>}
            <dl className="text-[13.5px]">
                {line(tr('colStatus'), <Badge tone={st.tone} dot>{tr(st.key)}</Badge>)}
                {line(tr('colDiscount'), tr('pctOff', { pct: fmt.number(row.discountPercent, { maximumFractionDigits: 2 }) }))}
                {line(tr('previewNet'), <><span className="text-ink-4 line-through me-2">{eur(row.net.current)}</span>{eur(row.net.promotional)}</>)}
                {mode === 'admin' && row.buyer && line(tr('previewBuyer'), <><span className="text-ink-4 line-through me-2">{eur(row.buyer.current)}</span>{eur(row.buyer.promotional)}</>)}
                {line(tr('colStarts'), utc(row.startsAt))}
                {line(tr('colEnds'), utc(row.endsAt))}
                {row.name && line(tr('formName'), row.name)}
                {line(tr('colCreator'), creator(row.createdBy))}
                {row.cancelReason && line(tr('cancelReason'), row.cancelReason)}
            </dl>
            {row.net.atCreation != null && <p className="mt-2 text-[12.5px] text-ink-3">{tr('priceAtCreation', { price: eur(row.net.atCreation) })}</p>}
            {row.net.changedSinceCreation && <p className="mt-1 text-[12.5px] text-amber-800">{tr('priceChanged')}</p>}
            <h3 className="mt-4 text-[13.5px] font-semibold text-heading">{tr('history')}</h3>
            <ol className="mt-2 space-y-1.5 text-[13px]">
                {row.history.map((h, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2 text-ink-2">
                        <span className="font-medium text-ink">{tr(histKey[h.action])}</span>
                        <span className="tabular-nums text-ink-3">{utc(h.at)}</span>
                        <span className="text-ink-3">{tr('byWho', { who: creator(h.by) })}</span>
                        {h.reason && <span className="text-ink-3">· {h.reason}</span>}
                    </li>
                ))}
            </ol>
        </Dialog>
    );
}

function CancelDialog({ base, row, onClose, onDone }: { base: string; row: PromotionRow; onClose: () => void; onDone: () => void }) {
    const { t } = useLanguage();
    const tr = (k: string) => t(S, k);
    const [reason, setReason] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const go = async () => {
        setBusy(true); setErr(null);
        try {
            const res = await apiFetch(`${base}/${row.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() || undefined }) });
            if (!res.ok) { setErr(await errorMessage(res)); return; }
            onDone();
        } catch (e: any) { setErr(e?.message || null); } finally { setBusy(false); }
    };
    return (
        <Dialog open onClose={onClose} size="sm" title={tr('cancelTitle')} description={row.product.name}
            footer={<><Button onClick={onClose}>{tr('keepOffer')}</Button><Button variant="danger" loading={busy} onClick={go}>{tr('cancelOffer')}</Button></>}>
            <p className="text-[14px] text-ink-2">{tr('cancelBody')}</p>
            {err && <div className="mt-3"><Notice tone="danger">{err}</Notice></div>}
            <Field className="mt-3" label={tr('cancelReason')} htmlFor="promo-cancel-reason" optional>
                <input id="promo-cancel-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={inputCls} />
            </Field>
        </Dialog>
    );
}
