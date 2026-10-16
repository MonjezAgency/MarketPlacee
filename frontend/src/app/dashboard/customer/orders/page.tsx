'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Package, Search, AlertTriangle, Check, ChevronRight, ChevronDown, Loader2, PackageCheck, Warehouse, Boxes, Barcode, Truck, MessageSquare, ClipboardCheck, RotateCcw, Layers } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchMyOrders, statusKeys, lineLoad, orderRef, supplierCount, TONE_CLASS, type BuyerOrder, type BuyerOrderItem } from '@/lib/buyer-orders';
import { MOTION } from '@/components/ds';
import { OrderProgress, Ltr, withNode, SLOT, useMoney } from '@/components/orders/order-ui';
import { cn } from '@/lib/utils';

const FILTERS = [
    { id: 'all', label: 'filterAll', match: () => true },
    { id: 'open', label: 'filterOpen', match: (o: BuyerOrder) => ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'].includes(o.status) },
    { id: 'delivered', label: 'filterDelivered', match: (o: BuyerOrder) => o.status === 'DELIVERED' },
    { id: 'cancelled', label: 'filterCancelled', match: (o: BuyerOrder) => o.status === 'CANCELLED' },
] as const;

const INSPECTION_LABEL = { SCHEDULED: 'inspectionScheduled', PASSED: 'inspectionPassed', PASSED_WITH_FINDINGS: 'inspectionFindings', FAILED: 'inspectionFailed' } as const;
const PAYMENT_LABEL: Record<string, { key: string; tone: string }> = {
    PAID: { key: 'paymentPaid', tone: 'bg-[#ECFDF5] text-[#047857] dark:bg-emerald-500/15 dark:text-emerald-300' },
    PROCESSING: { key: 'paymentProcessing', tone: 'bg-surface-3 text-ink-2' },
    FAILED: { key: 'paymentFailed', tone: 'bg-[#FEF2F2] text-[#B91C1C] dark:bg-red-500/15 dark:text-red-300' },
    REFUNDED: { key: 'paymentRefunded', tone: 'bg-surface-3 text-ink-2' },
};
const LINES_SHOWN = 3;

/** Text that must stay left-to-right inside Arabic layouts (EANs, order refs, tracking numbers). */
/* ── One product row ──────────────────────────────────────────────────── */

function LineRow({ i }: { i: BuyerOrderItem }) {
    const { t } = useLanguage();
    const money = useMoney();
    const load = lineLoad(i);
    const mixed = !!i.mixedLoadId;
    const name = i.product?.name || i.productNameSnapshot || (mixed ? t('orders', load.kind === 'truck' ? 'mixedTruck' : 'mixedPallet') : t('orders', 'productUnavailable'));
    const image = i.product?.images?.[0] || null;
    const qtyKey = load.kind === 'truck' ? 'lineTruck' : load.kind === 'pallet' ? 'linePallet' : 'lineCarton';
    const priceKey = load.kind === 'truck' ? 'perTruck' : load.kind === 'pallet' ? 'perPallet' : 'perCarton';
    const variants = i.selectedVariants && Object.values(i.selectedVariants).filter(Boolean).join(' · ');
    return (
        <li className="flex gap-3 sm:gap-4 py-4 first:pt-0 last:pb-0">
            <span className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-xl ring-1 ring-line bg-media overflow-clip">
                {image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={image} alt="" loading="lazy" className="absolute inset-0 m-auto max-w-[82%] max-h-[82%] object-contain mix-blend-multiply" />
                    : <span className="absolute inset-0 flex items-center justify-center text-ink-4">{mixed ? <Layers size={18} /> : <Package size={18} />}</span>}
            </span>
            <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-heading leading-snug break-words">{name}</p>
                    {variants && <p className="mt-0.5 text-[12.5px] text-ink-3 break-words">{variants}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
                        {i.product?.ean && (
                            <span className="inline-flex items-center gap-1" title={t('orders', 'ean')}>
                                <Barcode size={13} className="text-ink-4" aria-hidden /><span className="sr-only">{t('orders', 'ean')} </span><Ltr>{i.product.ean}</Ltr>
                            </span>
                        )}
                        <span>{t('orders', qtyKey, { count: i.quantity })}</span>
                        {load.kind !== 'carton' && load.cartons != null && <span>{t('orders', 'cartons', { count: load.cartons })}</span>}
                        {mixed && Array.isArray(i.mixComposition) && i.mixComposition.length > 0 && <span>{t('orders', 'mixedProducts', { count: i.mixComposition.length })}</span>}
                        <span>{load.perUnit != null ? t('orders', 'perUnit', { price: money(load.perUnit) }) : t('orders', priceKey, { price: money(i.price) })}</span>
                    </p>
                </div>
                <div className="mt-1.5 sm:mt-0 sm:text-end shrink-0">
                    <p className="text-[14.5px] font-semibold text-heading tabular-nums">{money(load.lineTotal)}</p>
                    {load.units != null && <p className="text-[12.5px] text-ink-3">{t('orders', 'units', { count: load.units })}</p>}
                    {load.units == null && load.perUnit == null && i.product?.unitsPerCase ? <p className="text-[12.5px] text-ink-3">{t('orders', 'packUnits', { count: i.product.unitsPerCase })}</p> : null}
                </div>
            </div>
        </li>
    );
}

/* ── Order card ───────────────────────────────────────────────────────── */

function deliverySummary(o: BuyerOrder) {
    const d = o.delivery;
    if (!d || !d.methods.length) return o.shippingCost != null ? { method: null, hub: null, transit: null, amount: o.shippingCost, status: 'priced' as const } : null;
    const methods = Array.from(new Set(d.methods.map((m) => m.method)));
    const first = d.methods[0];
    const amount = d.status === 'priced' ? (d.freightTotal ?? null) : null;
    const transit = d.methods.length === 1 ? first.transitDays : null;
    return { method: methods.length === 1 ? first.method : null, hub: methods.length === 1 && first.method === 'SUPPLIER_TO_HUB' ? first.hub : null, transit, amount: o.shippingCost ?? amount, status: o.shippingCost != null ? 'priced' as const : d.status };
}

function OrderCard({ o, onChanged, index }: { o: BuyerOrder; onChanged: () => void; index: number }) {
    const { t, fmt } = useLanguage();
    const money = useMoney();
    const reduce = useReducedMotion();
    const st = statusKeys(o);
    const n = supplierCount(o);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState('');
    const [expanded, setExpanded] = React.useState(false);

    // Order-level load: where it ships from and how much of it there is.
    const loads = o.items.map(lineLoad);
    const pallets = loads.reduce((s, l) => s + (l.pallets ?? 0), 0);
    const trucks = loads.reduce((s, l) => s + (l.trucks ?? 0), 0);
    const cartonsKnown = loads.every((l, idx) => l.cartons != null || !!o.items[idx].mixedLoadId);
    const cartons = loads.reduce((s, l) => s + (l.cartons ?? 0), 0);
    const exw = Array.from(new Set(o.items.map((i) => i.product?.exwLocation?.trim()).filter(Boolean) as string[]));
    const del = deliverySummary(o);
    const freight = del?.status === 'priced' && del.amount != null ? del.amount : null;
    const payment = o.paymentStatus ? PAYMENT_LABEL[o.paymentStatus] : undefined;
    const lines = expanded ? o.items : o.items.slice(0, LINES_SHOWN);

    const confirmReceipt = async () => {
        if (!confirm(t('orders', 'confirmPrompt'))) return;
        setBusy(true); setErr('');
        try {
            const r = await apiFetch(`/orders/${o.id}/confirm-delivery`, { method: 'POST' });
            if (!r.ok) throw new Error('failed');
            onChanged();
        } catch { setErr(t('orders', 'confirmFailed')); }
        finally { setBusy(false); }
    };

    const methodText = del?.method === 'ATLANTIS_COLLECTION' ? t('orders', 'methodCollection')
        : del?.method === 'SUPPLIER_TO_HUB' ? (del.hub ? t('orders', 'methodHub', { hub: `${del.hub.name}, ${del.hub.city}` }) : t('orders', 'methodHubPlain'))
        : del?.method === 'SUPPLIER_DIRECT' ? t('orders', 'methodDirect') : null;

    return (
        <motion.article
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION.base * 1.6, ease: MOTION.ease, delay: reduce ? 0 : Math.min(index, 6) * 0.05 }}
            aria-labelledby={`order-${o.id}`}
            className="rounded-2xl ring-1 ring-line bg-surface overflow-clip transition-shadow duration-200 hover:shadow-card"
        >
            {/* Order id · date */}
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 sm:px-6 py-3 bg-surface-2/70 border-b border-line">
                <h3 id={`order-${o.id}`} className="font-sans text-[14px] font-semibold text-ink-2 tracking-wide">
                    {withNode(t('orders', 'order', { ref: SLOT }), <Ltr>{orderRef(o.id)}</Ltr>)}
                </h3>
                <p className="text-[13px] text-ink-3">{t('orders', 'placed', { date: fmt.date(o.createdAt) })}</p>
            </header>

            {/* Terms · load · status */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 sm:px-6 py-3 border-b border-line text-[13px] text-ink-2">
                {exw.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 min-w-0" title={t('orders', 'exwHint')}>
                        <Warehouse size={15} className="text-ink-4 shrink-0" aria-hidden />
                        <span className="underline decoration-dotted decoration-ink-4 underline-offset-4 truncate">{exw.length === 1 ? t('orders', 'exw', { place: exw[0] }) : t('orders', 'exwMultiple', { count: exw.length })}</span>
                    </span>
                )}
                {(pallets > 0 || cartons > 0 || trucks > 0) && (
                    <span className="inline-flex items-center gap-1.5">
                        <Boxes size={15} className="text-ink-4" aria-hidden />
                        {[trucks > 0 && t('orders', 'trucks', { count: trucks }), pallets > 0 && t('orders', 'pallets', { count: pallets }), cartonsKnown && cartons > 0 && t('orders', 'cartons', { count: cartons })].filter(Boolean).join(' · ')}
                    </span>
                )}
                {n > 1 && <span>{t('orders', 'suppliers', { count: n })}</span>}
                <span className="ms-auto flex flex-wrap items-center gap-1.5">
                    {payment && <span className={cn('h-7 px-2.5 inline-flex items-center rounded-full text-[12px] font-semibold', payment.tone)}>{t('orders', payment.key)}</span>}
                    <span className={cn('h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-semibold', TONE_CLASS[st.tone])}>
                        {st.tone === 'off' ? <RotateCcw size={13} aria-hidden /> : st.tone === 'done' ? <Check size={13} aria-hidden /> : st.tone === 'move' ? <Truck size={13} aria-hidden /> : <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
                        {t('orders', st.label)}
                    </span>
                </span>
            </div>

            {/* Products */}
            <div className="px-4 sm:px-6 py-4">
                <ul className="divide-y divide-line">
                    {lines.map((i) => <LineRow key={i.id} i={i} />)}
                </ul>
                {o.items.length > LINES_SHOWN && (
                    <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
                        className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-teal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] rounded">
                        {expanded ? t('orders', 'fewerLines') : t('orders', 'moreLines', { count: o.items.length - LINES_SHOWN })}
                        <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} aria-hidden />
                    </button>
                )}
            </div>

            {/* Totals and delivery */}
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 sm:px-6 py-3.5 border-t border-line">
                <div className="min-w-0 text-[13px] text-ink-3 space-y-0.5">
                    {del && (
                        <p>
                            {t('orders', 'delivery')}{' '}
                            <span className="text-ink-2">{freight != null ? <span className="tabular-nums">{money(freight)}</span> : del.status === 'unavailable' ? t('orders', 'deliveryUnavailable') : t('orders', 'deliveryQuoted')}</span>
                        </p>
                    )}
                    {(methodText || del?.transit) && (
                        <p className="inline-flex flex-wrap items-center gap-x-1.5">
                            <Truck size={13} className="text-ink-4" aria-hidden />
                            {[methodText, del?.transit && t('orders', 'transit', { min: del.transit.min, max: del.transit.max })].filter(Boolean).join(' · ')}
                        </p>
                    )}
                </div>
                {/* The order's recorded total is the goods value; delivery is a separate, server-set charge. */}
                <div className="ms-auto text-end">
                    <p className="text-[13px] text-ink-3 whitespace-nowrap">
                        {freight != null ? t('orders', 'totalWithDelivery') : t('orders', 'goodsTotal')}
                        <span className="ms-1.5 text-[16px] font-semibold text-heading tabular-nums">{money(o.totalAmount + (freight ?? 0))}</span>
                    </p>
                    <p className="text-[11.5px] text-ink-4">
                        {freight != null && <>{t('orders', 'breakdown', { goods: money(o.totalAmount), delivery: money(freight) })} · </>}{t('orders', 'exclVat')}
                    </p>
                </div>
            </div>

            {/* Where it stands */}
            <div className="px-4 sm:px-6 pt-1 pb-4">
                <OrderProgress o={o} />
                {(st.note || o.inspection) && (
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
                        {st.note && <span>{st.vars?.number ? withNode(t('orders', st.note, { ...st.vars, number: SLOT }), <Ltr>{st.vars.number}</Ltr>) : t('orders', st.note)}</span>}
                        {o.inspection && <span className="inline-flex items-center gap-1"><ClipboardCheck size={13} className="text-ink-4" aria-hidden />{t('orders', INSPECTION_LABEL[o.inspection])}</span>}
                    </p>
                )}
            </div>

            {/* Actions */}
            <footer className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-t border-line bg-surface-2/40">
                {err && <p role="alert" className="w-full text-[12.5px] text-[#B91C1C]">{err}</p>}
                <Link href={`/dashboard/customer/orders/${o.id}`} className="h-9 px-3.5 inline-flex items-center gap-1 rounded-lg ring-1 ring-line-strong bg-surface text-[13px] font-semibold text-ink hover:ring-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                    {t('orders', 'details')} <ChevronRight size={14} className="rtl:rotate-180" aria-hidden />
                </Link>
                {(o.status === 'SHIPPED' || o.status === 'DELIVERED') ? (
                    <Link href={`/dashboard/customer/orders/${o.id}#dispute`} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors">
                        <AlertTriangle size={14} aria-hidden /> {t('orders', 'reportProblem')}
                    </Link>
                ) : o.status !== 'CANCELLED' && (
                    <Link href="/dashboard/customer/support?tab=orders" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors">
                        <MessageSquare size={14} aria-hidden /> {t('orders', 'messageTeam')}
                    </Link>
                )}
                {o.workflow?.buyerMustAccept && o.status !== 'CANCELLED' && (
                    <Link href={`/dashboard/customer/orders/${o.id}`} className="ms-auto h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold">
                        {t('orders', 'reviewTerms')}
                    </Link>
                )}
                {o.status === 'SHIPPED' && (
                    <button type="button" onClick={confirmReceipt} disabled={busy} className="ms-auto h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold disabled:opacity-60">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={15} />} {t('orders', 'confirmReceipt')}
                    </button>
                )}
            </footer>
        </motion.article>
    );
}

/** Orders & tracking — one information-rich card per order: terms, products, totals, real progress and actions. */
export default function OrdersPage() {
    const { t } = useLanguage();
    const [orders, setOrders] = React.useState<BuyerOrder[] | null>(null);
    const [error, setError] = React.useState(false);
    const [filter, setFilter] = React.useState<(typeof FILTERS)[number]['id']>('all');
    const [q, setQ] = React.useState('');

    const load = React.useCallback(() => fetchMyOrders(100).then((r) => { setOrders(r.data ?? []); setError(false); }).catch(() => { setOrders((o) => o ?? []); setError(true); }), []);
    React.useEffect(() => { load(); }, [load]);

    const f = FILTERS.find((x) => x.id === filter)!;
    const term = q.trim().toLowerCase();
    const shown = (orders ?? []).filter((o) => f.match(o) && (!term
        || o.id.toLowerCase().includes(term.replace('#', ''))
        || o.items.some((i) => (i.product?.name || i.productNameSnapshot || '').toLowerCase().includes(term) || (i.product?.ean || '').includes(term))));

    return (
        <div data-no-translate className="text-start">
            <div className="flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-label={t('orders', 'filterAria')} className="flex flex-wrap gap-1.5">
                    {FILTERS.map((x) => (
                        <button key={x.id} type="button" role="radio" aria-checked={filter === x.id} onClick={() => setFilter(x.id)}
                            className={cn('h-8 px-3 rounded-full text-[12.5px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                filter === x.id ? 'bg-heading text-surface ring-heading' : 'ring-line text-ink-2 hover:ring-line-strong')}>
                            {t('orders', x.label)}{orders ? <span className="ms-1 tabular-nums opacity-70">{orders.filter(x.match).length}</span> : null}
                        </button>
                    ))}
                </div>
                <label className="ms-auto flex items-center gap-2 h-9 w-full sm:w-[280px] px-3 rounded-lg ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6]">
                    <Search size={15} className="text-ink-4 shrink-0" aria-hidden />
                    <span className="sr-only">{t('orders', 'searchLabel')}</span>
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('orders', 'searchPlaceholder')} className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] text-ink placeholder:text-ink-4" />
                </label>
            </div>

            {error && (
                <p role="alert" className="mt-4 flex flex-wrap items-center gap-2 text-[13.5px] text-[#B91C1C]">
                    <AlertTriangle size={15} aria-hidden /> {t('orders', 'loadError')}
                    <button type="button" onClick={() => load()} className="font-semibold underline underline-offset-2">{t('orders', 'retry')}</button>
                </p>
            )}

            <div className="mt-4 space-y-4" aria-live="polite">
                {orders === null ? (
                    <div role="status" aria-label={t('orders', 'loading')} className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[260px] rounded-2xl bg-surface-2 animate-pulse" />)}
                    </div>
                ) : shown.length === 0 ? (
                    <div className="rounded-2xl ring-1 ring-line px-5 py-12 text-center">
                        <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Package size={22} aria-hidden /></span>
                        <p className="mt-3 text-[15px] font-semibold text-ink">{orders.length ? t('orders', 'noMatchTitle') : t('orders', 'emptyTitle')}</p>
                        <p className="mt-1 text-[13.5px] text-ink-3">{orders.length ? t('orders', 'noMatchBody') : t('orders', 'emptyBody')}</p>
                        {!orders.length && <Link href="/categories" className="mt-4 inline-flex h-10 items-center px-4 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">{t('orders', 'browse')}</Link>}
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {shown.map((o, i) => <OrderCard key={o.id} o={o} index={i} onChanged={load} />)}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
