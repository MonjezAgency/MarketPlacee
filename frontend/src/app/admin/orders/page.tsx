'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ClipboardList, Download, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, Card, EmptyState, ErrorState, Notice, PageHeader, Skeleton, StatusBadge, inputCls, selectCls } from '@/components/supplier/ui';
import { FilterPopover } from '@/components/admin/orders/FilterPopover';
import { NextActionCell, PAYMENT_KEY, PaymentBadge } from '@/components/admin/OrderBadges';
import {
    EXPORT_MAX_ROWS, ORDER_SORTS, ORDER_STATUSES, adminOrdersApi,
    type AdminOrderPage, type AdminOrderRow, type OrderListParams,
} from '@/lib/admin-orders-api';

/**
 * Admin → Order management (/admin/orders). Every count, filter and page comes
 * from GET /orders/admin/list (backend/src/orders/admin-orders.ts): the six real
 * order statuses, the "requiring action" queue of the Founder Overview, and
 * filters applied on the server. Nothing on this page is estimated.
 */
const QUEUES = [
    { id: 'requires_action', key: 'qRequiresAction' }, { id: 'ready', key: 'qReady' }, { id: 'decision', key: 'qDecision' },
    { id: 'legacy', key: 'qLegacy' }, { id: 'waiting_suppliers', key: 'qWaitingSuppliers' }, { id: 'waiting_buyer', key: 'qWaitingBuyer' },
];
const STATUS_CARD_KEY: Record<string, string> = { PENDING: 'cardPending', PAID: 'cardPaid', PROCESSING: 'cardProcessing', SHIPPED: 'cardShipped', DELIVERED: 'cardDelivered', CANCELLED: 'cardCancelled' };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A chosen calendar day → the instant its local day starts (`next` = the following day). */
function localDayStart(day: string, next = false): string | undefined {
    if (!DAY_RE.test(day)) return undefined;
    const [y, m, d] = day.split('-').map(Number);
    const at = new Date(y, m - 1, d + (next ? 1 : 0), 0, 0, 0, 0);
    return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

export default function AdminOrdersPage() {
    return <React.Suspense fallback={null}><OrdersList /></React.Suspense>;
}

function OrdersList() {
    const router = useRouter();
    const params = useSearchParams();
    const { t, fmt } = useLanguage();
    const tl = React.useCallback((k: string, v?: Record<string, string | number>) => t('adminOrders', k, v), [t]);
    const eur = (n: number | null | undefined) => (n == null ? '—' : fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const int = (n: number | null | undefined) => (n == null ? '—' : fmt.number(n));

    const [q, setQ] = React.useState(params.get('q') || '');
    const [debouncedQ, setDebouncedQ] = React.useState(q);
    const [status, setStatus] = React.useState(params.get('status') || '');
    const [paymentStatus, setPaymentStatus] = React.useState(params.get('paymentStatus') || '');
    const [supplier, setSupplier] = React.useState(params.get('supplier') || '');
    const [buyer, setBuyer] = React.useState(params.get('buyer') || '');
    const [fromDay, setFromDay] = React.useState(params.get('from') || '');
    const [toDay, setToDay] = React.useState(params.get('to') || '');
    const [attention, setAttention] = React.useState(params.get('attention') || '');
    const [sort, setSort] = React.useState((ORDER_SORTS as readonly string[]).includes(params.get('sort') || '') ? (params.get('sort') as string) : 'newest');
    const [page, setPage] = React.useState(Number(params.get('page')) || 1);
    const [data, setData] = React.useState<AdminOrderPage | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [exporting, setExporting] = React.useState(false);

    const rangeInvalid = DAY_RE.test(fromDay) && DAY_RE.test(toDay) && fromDay > toDay;
    const query: OrderListParams = React.useMemo(() => ({
        q: debouncedQ, status, paymentStatus, supplier, buyer, attention, sort,
        from: localDayStart(fromDay), to: localDayStart(toDay, true), page, limit: 25,
    }), [debouncedQ, status, paymentStatus, supplier, buyer, attention, sort, fromDay, toDay, page]);

    React.useEffect(() => { const h = setTimeout(() => setDebouncedQ(q.trim()), 300); return () => clearTimeout(h); }, [q]);
    React.useEffect(() => { setPage(1); }, [debouncedQ, status, paymentStatus, supplier, buyer, attention, sort, fromDay, toDay]);
    React.useEffect(() => {
        const u = new URLSearchParams();
        const keep: [string, string][] = [['q', debouncedQ], ['status', status], ['paymentStatus', paymentStatus], ['supplier', supplier], ['buyer', buyer], ['from', fromDay], ['to', toDay], ['attention', attention]];
        for (const [k, v] of keep) if (v) u.set(k, v);
        if (sort !== 'newest') u.set('sort', sort);
        if (page > 1) u.set('page', String(page));
        router.replace(u.toString() ? `/admin/orders?${u}` : '/admin/orders', { scroll: false });
    }, [debouncedQ, status, paymentStatus, supplier, buyer, fromDay, toDay, attention, sort, page, router]);

    const load = React.useCallback(() => {
        if (rangeInvalid) return;
        setLoading(true); setError(null);
        adminOrdersApi.list(query).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }, [query, rangeInvalid]);
    React.useEffect(() => { load(); }, [load]);

    const filtersActive = !!(debouncedQ || status || paymentStatus || supplier || buyer || fromDay || toDay || attention);
    const clearFilters = () => { setQ(''); setStatus(''); setPaymentStatus(''); setSupplier(''); setBuyer(''); setFromDay(''); setToDay(''); setAttention(''); };

    const exportCsv = async () => {
        setExporting(true);
        try {
            await adminOrdersApi.exportCsv(query);
            const n = data?.total ?? 0;
            if (n > EXPORT_MAX_ROWS) toast(tl('exportCapped', { max: int(EXPORT_MAX_ROWS), total: int(n) }));
            else toast.success(tl('exportDone', { count: n }));
        } catch (e: any) { toast.error(e.message || tl('exportFailed')); } finally { setExporting(false); }
    };

    const c = data?.counts;
    const att = c?.attention;
    const rows = data?.data ?? [];

    // Filters behind the "Filters" button (search, payment and sort sit in the toolbar; status on the cards).
    const moreCount = [attention, supplier, buyer].filter(Boolean).length + (fromDay || toDay ? 1 : 0);
    const dayLabel = (d: string) => (DAY_RE.test(d) ? fmt.date(`${d}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' }) : d);
    const queueKey = QUEUES.find((x) => x.id === attention)?.key;
    const chips: { id: string; name: string; value: string; clear: () => void }[] = [];
    if (debouncedQ) chips.push({ id: 'q', name: tl('search'), value: debouncedQ, clear: () => setQ('') });
    if (status) chips.push({ id: 'status', name: tl('filterStatus'), value: STATUS_CARD_KEY[status] ? tl(STATUS_CARD_KEY[status]) : status, clear: () => setStatus('') });
    if (attention) chips.push({ id: 'attention', name: tl('filterQueue'), value: queueKey ? tl(queueKey) : attention, clear: () => setAttention('') });
    if (paymentStatus) chips.push({ id: 'pay', name: tl('filterPayment'), value: PAYMENT_KEY[paymentStatus] ? tl(PAYMENT_KEY[paymentStatus]) : paymentStatus, clear: () => setPaymentStatus('') });
    if (supplier) chips.push({ id: 'supplier', name: tl('filterSupplier'), value: data?.facets.suppliers.find((s) => s.id === supplier)?.name || tl('unnamedSupplier'), clear: () => setSupplier('') });
    if (buyer) chips.push({ id: 'buyer', name: tl('filterBuyer'), value: data?.facets.buyers.find((b) => b.id === buyer)?.name || tl('unknownBuyer'), clear: () => setBuyer('') });
    if (fromDay || toDay) chips.push({
        id: 'dates', name: tl('dateCreated'),
        value: fromDay && toDay ? tl('dateBetween', { from: dayLabel(fromDay), to: dayLabel(toDay) }) : fromDay ? tl('dateSince', { from: dayLabel(fromDay) }) : tl('dateUntil', { to: dayLabel(toDay) }),
        clear: () => { setFromDay(''); setToDay(''); },
    });

    /** Whole-row navigation; clicks on links, buttons and form controls inside the row keep their own behaviour. */
    const openRow = (e: React.MouseEvent<HTMLTableRowElement>, id: string) => {
        const target = e.target as HTMLElement;
        if (target.closest('a,button,input,select,textarea,label,[data-row-stop]')) return;
        if (typeof window !== 'undefined' && window.getSelection()?.toString()) return; // selecting text, not opening
        const href = `/admin/orders/${id}`;
        if (e.metaKey || e.ctrlKey || e.button === 1) { window.open(href, '_blank', 'noopener'); return; }
        router.push(href);
    };
    const toggleSort = (field: 'created' | 'total') => {
        if (field === 'created') setSort((s) => (s === 'newest' ? 'oldest' : 'newest'));
        else setSort((s) => (s === 'total_desc' ? 'total_asc' : 'total_desc'));
    };
    const sortIcon = (field: 'created' | 'total') => {
        const on = field === 'created' ? ['newest', 'oldest'].includes(sort) : ['total_desc', 'total_asc'].includes(sort);
        if (!on) return null;
        const down = sort === 'newest' || sort === 'total_desc';
        return down ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />;
    };
    const ariaSort = (field: 'created' | 'total'): 'ascending' | 'descending' | 'none' => {
        if (field === 'created') return sort === 'newest' ? 'descending' : sort === 'oldest' ? 'ascending' : 'none';
        return sort === 'total_desc' ? 'descending' : sort === 'total_asc' ? 'ascending' : 'none';
    };

    return (
        <div data-no-translate className="text-start -mt-2">
            <PageHeader title={tl('title')} description={tl('subtitle')}
                actions={<Button icon={<Download size={15} />} loading={exporting} disabled={!data || data.total === 0 || rangeInvalid} onClick={exportCsv}
                    title={filtersActive ? tl('exportFilteredHint', { count: data?.total ?? 0 }) : tl('exportAllHint')}>{tl('exportCsv')}</Button>} />

            {/* Summary — current counts over all orders, from the server. Each card is the status filter. */}
            <section aria-label={tl('summaryAria')} className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2 mb-2">
                <SummaryCard label={tl('cardAll')} value={c ? int(c.total) : null} active={!status && !attention} onClick={() => { setStatus(''); setAttention(''); }} />
                {ORDER_STATUSES.map((s) => (
                    <SummaryCard key={s} label={tl(STATUS_CARD_KEY[s])} value={c ? int(c.byStatus[s]) : null} active={status === s} onClick={() => { setAttention(''); setStatus((x) => (x === s ? '' : s)); }} />
                ))}
                <SummaryCard tone="warning" label={tl('cardRequiresAction')} value={att ? int(att.requiresAction) : null} active={attention === 'requires_action'}
                    hint={att ? tl('requiresActionHint', { ready: att.readyForApproval, decision: att.needsDecision, legacy: att.legacyPending }) : undefined}
                    onClick={() => { setStatus(''); setAttention((x) => (x === 'requires_action' ? '' : 'requires_action')); }} />
            </section>
            <p className="mb-4 text-[12.5px] text-ink-3">{data ? tl('countsNote', { time: fmt.date(data.asOf, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : ' '}</p>

            <Card bodyClassName="p-0">
                <div className="flex flex-col gap-2 px-3 py-2.5 sm:px-4 border-b border-line">
                    <div role="toolbar" aria-label={tl('toolbarAria')} className="flex flex-wrap items-center gap-2">
                        <label className="relative flex-1 min-w-[220px]">
                            <span className="sr-only">{tl('search')}</span>
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tl('searchPh')} className={cn(inputCls, 'h-9 ps-9 text-[13.5px]')} />
                        </label>
                        <select aria-label={tl('filterPayment')} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className={cn(selectCls, 'h-9 w-auto min-w-[170px] text-[13.5px]')}>
                            <option value="">{tl('allPayments')}</option>
                            {(data?.facets.paymentStatuses ?? []).map((p) => <option key={p.value} value={p.value}>{PAYMENT_KEY[p.value] ? tl(PAYMENT_KEY[p.value]) : p.value} ({int(p.count)})</option>)}
                            {paymentStatus && !(data?.facets.paymentStatuses ?? []).some((p) => p.value === paymentStatus) && <option value={paymentStatus}>{PAYMENT_KEY[paymentStatus] ? tl(PAYMENT_KEY[paymentStatus]) : paymentStatus}</option>}
                        </select>
                        <select aria-label={tl('sort')} value={sort} onChange={(e) => setSort(e.target.value)} className={cn(selectCls, 'h-9 w-auto min-w-[160px] text-[13.5px]')}>
                            {ORDER_SORTS.map((o) => <option key={o} value={o}>{tl(`sort_${o}`)}</option>)}
                        </select>
                        <FilterPopover label={tl('filtersButton')} count={moreCount} title={tl('filtersTitle')} doneLabel={tl('filtersDone')} clearLabel={tl('clearMoreFilters')}
                            onClear={moreCount ? () => { setSupplier(''); setBuyer(''); setAttention(''); setFromDay(''); setToDay(''); } : undefined}
                            icon={<SlidersHorizontal size={15} aria-hidden />}>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1 text-[12.5px] font-medium text-ink-2">
                                    {tl('filterQueue')}
                                    <select data-autofocus value={attention} onChange={(e) => { setAttention(e.target.value); if (e.target.value) setStatus(''); }} className={cn(selectCls, 'h-9 text-[13.5px] font-normal')}>
                                        <option value="">{tl('allQueues')}</option>
                                        {QUEUES.map((x) => <option key={x.id} value={x.id}>{tl(x.key)}{att ? ` (${int(queueCount(x.id, att))})` : ''}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1 text-[12.5px] font-medium text-ink-2">
                                    {tl('filterSupplier')}
                                    <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={cn(selectCls, 'h-9 text-[13.5px] font-normal')}>
                                        <option value="">{tl('allSuppliers')}</option>
                                        {(data?.facets.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} ({int(s.count)})</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1 text-[12.5px] font-medium text-ink-2 sm:col-span-2">
                                    {tl('filterBuyer')}
                                    <select value={buyer} onChange={(e) => setBuyer(e.target.value)} className={cn(selectCls, 'h-9 text-[13.5px] font-normal')}>
                                        <option value="">{tl('allBuyers')}</option>
                                        {(data?.facets.buyers ?? []).map((b) => <option key={b.id} value={b.id}>{b.name} ({int(b.count)})</option>)}
                                    </select>
                                </label>
                                <fieldset className="sm:col-span-2">
                                    <legend className="text-[12.5px] font-medium text-ink-2">{tl('dateCreated')}</legend>
                                    <div className="mt-1 grid grid-cols-2 gap-2">
                                        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
                                            {tl('dateFrom')}
                                            <input type="date" value={fromDay} max={toDay || undefined} onChange={(e) => setFromDay(e.target.value)} className={cn(inputCls, 'h-9 text-[13.5px]')} />
                                        </label>
                                        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
                                            {tl('dateTo')}
                                            <input type="date" value={toDay} min={fromDay || undefined} onChange={(e) => setToDay(e.target.value)} className={cn(inputCls, 'h-9 text-[13.5px]')} aria-invalid={rangeInvalid || undefined} />
                                        </label>
                                    </div>
                                    <p className="mt-1 text-[12px] text-ink-3">{tl('dateHint')}</p>
                                    {rangeInvalid && <p className="mt-1 text-[12.5px] text-red-700">{tl('rangeInvalid')}</p>}
                                </fieldset>
                            </div>
                        </FilterPopover>
                    </div>
                    {chips.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5" aria-label={tl('activeFilters')} role="group">
                            {chips.map((chip) => (
                                <span key={chip.id} className="inline-flex items-center gap-1 h-7 ps-2.5 pe-1 rounded-full bg-teal-soft text-[12.5px] text-ink ring-1 ring-inset ring-teal/20 max-w-full">
                                    <span className="truncate"><span className="text-ink-3">{chip.name}:</span> {chip.value}</span>
                                    <button type="button" onClick={chip.clear} aria-label={tl('removeFilter', { name: chip.name, value: chip.value })}
                                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-ink-3 hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                                        <X size={12} aria-hidden />
                                    </button>
                                </span>
                            ))}
                            <button type="button" onClick={clearFilters} className="h-7 px-2 rounded-md text-[12.5px] font-medium text-teal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">{tl('clearAll')}</button>
                        </div>
                    )}
                    {rangeInvalid && <p role="alert" className="text-[12.5px] text-red-700">{tl('rangeInvalid')}</p>}
                </div>

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}

                {loading && !data ? (
                    <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : rows.length === 0 && !error ? (
                    data?.counts.total ? (
                        <EmptyState icon={<Search size={20} />} title={tl('noMatchTitle')} action={<Button onClick={clearFilters}>{tl('clearFilters')}</Button>}>{tl('noMatchBody')}</EmptyState>
                    ) : (
                        <EmptyState icon={<ClipboardList size={20} />} title={tl('emptyTitle')}>{tl('emptyBody')}</EmptyState>
                    )
                ) : (
                    <>
                        <div className="hidden lg:block overflow-x-auto">
                            <table className={cn('w-full min-w-[1040px] text-[13.5px]', loading && 'opacity-60')}>
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                        <th className="text-start font-medium ps-4 pe-2 py-2">{tl('colOrder')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tl('colBuyer')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tl('colSuppliers')}</th>
                                        <th className="text-end font-medium px-2 py-2" aria-sort={ariaSort('total')}>
                                            <button type="button" onClick={() => toggleSort('total')} className="inline-flex items-center gap-1 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded">{tl('colTotal')}{sortIcon('total')}</button>
                                        </th>
                                        <th className="text-start font-medium px-2 py-2">{tl('colStatus')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tl('colPayment')}</th>
                                        <th className="text-start font-medium px-2 py-2" aria-sort={ariaSort('created')}>
                                            <button type="button" onClick={() => toggleSort('created')} className="inline-flex items-center gap-1 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded">{tl('colCreated')}{sortIcon('created')}</button>
                                        </th>
                                        <th className="text-start font-medium px-2 pe-4 py-2">{tl('colNext')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((o) => (
                                        <tr key={o.id} onClick={(e) => openRow(e, o.id)} onAuxClick={(e) => { if (e.button === 1) openRow(e, o.id); }}
                                            className="group border-b border-line last:border-0 align-top cursor-pointer transition-colors hover:bg-surface-2 focus-within:bg-surface-2">
                                            <td className="ps-4 pe-2 py-2.5 whitespace-nowrap">
                                                <Link href={`/admin/orders/${o.id}`} onClick={(e) => e.stopPropagation()} aria-label={tl('openOrderAria', { ref: o.ref })}
                                                    className="font-medium text-ink group-hover:text-teal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded">
                                                    <bdi dir="ltr" className="font-mono text-[13px]">#{o.ref}</bdi>
                                                </Link>
                                                <span className="block text-[12px] text-ink-3">{tl('linesCount', { count: o.lines })}</span>
                                            </td>
                                            <td className="px-2 py-2.5 max-w-[220px]"><BuyerCell o={o} /></td>
                                            <td className="px-2 py-2.5 max-w-[220px]"><SupplierCell o={o} tl={tl} /></td>
                                            <td className="px-2 py-2.5 text-end tabular-nums whitespace-nowrap font-medium text-ink">{eur(o.total)}</td>
                                            <td className="px-2 py-2.5"><StatusBadge kind="order" status={o.status} /></td>
                                            <td className="px-2 py-2.5"><PaymentBadge value={o.paymentStatus} tl={tl} /></td>
                                            <td className="px-2 py-2.5 text-[12.5px] text-ink-2 whitespace-nowrap tabular-nums">{fmt.date(o.createdAt)}<span className="block text-ink-4">{fmt.date(o.createdAt, { hour: '2-digit', minute: '2-digit' })}</span></td>
                                            <td className="px-2 pe-4 py-2.5"><NextActionCell action={o.nextAction} tl={tl} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <ul className="lg:hidden divide-y divide-line">
                            {rows.map((o) => (
                                <li key={o.id}>
                                    <Link href={`/admin/orders/${o.id}`} className="block p-3 hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal">
                                        <span className="flex items-center justify-between gap-2">
                                            <bdi dir="ltr" className="font-mono text-[13px] font-medium text-ink">#{o.ref}</bdi>
                                            <span className="tabular-nums font-medium text-ink">{eur(o.total)}</span>
                                        </span>
                                        <span className="mt-0.5 block text-[13px] text-ink-2 truncate">{o.buyer?.companyName || o.buyer?.name || tl('unknownBuyer')}</span>
                                        <span className="block text-[12px] text-ink-3 truncate">{o.suppliers.map((s) => s.name || tl('unnamedSupplier')).join(', ') || tl('noSupplier')} · {fmt.date(o.createdAt)}</span>
                                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                            <StatusBadge kind="order" status={o.status} />
                                            <PaymentBadge value={o.paymentStatus} tl={tl} />
                                            <NextActionCell action={o.nextAction} tl={tl} />
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {data && data.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line text-[13px] text-ink-3">
                        <span aria-live="polite">{tl('rangeOf', { from: int((data.page - 1) * data.limit + 1), to: int(Math.min(data.page * data.limit, data.total)), total: int(data.total) })}</span>
                        <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} className="rtl:rotate-180" />} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>{tl('previous')}</Button>
                            <span className="px-2 tabular-nums">{tl('pageOf', { page: int(data.page), pages: int(data.pages) })}</span>
                            <Button size="sm" variant="ghost" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>{tl('next')} <ChevronRight size={15} className="rtl:rotate-180" /></Button>
                        </div>
                    </div>
                )}
            </Card>

            <div className="mt-4"><Notice tone="info">{tl('returnsNote')}</Notice></div>
        </div>
    );
}

function queueCount(id: string, a: NonNullable<AdminOrderPage['counts']['attention']>) {
    switch (id) {
        case 'requires_action': return a.requiresAction;
        case 'ready': return a.readyForApproval;
        case 'decision': return a.needsDecision;
        case 'legacy': return a.legacyPending;
        case 'waiting_suppliers': return a.waitingSuppliers;
        case 'waiting_buyer': return a.waitingBuyer;
        default: return 0;
    }
}

function SummaryCard({ label, value, hint, active, onClick, tone }: { label: string; value: string | null; hint?: string; active: boolean; onClick: () => void; tone?: 'warning' }) {
    return (
        <button type="button" aria-pressed={active} onClick={onClick}
            className={cn('relative text-start rounded-xl ring-1 px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                active ? 'ring-2 ring-heading bg-teal-soft' : tone === 'warning' ? 'ring-amber-200 bg-amber-50/50 hover:ring-amber-300' : 'bg-surface ring-line hover:ring-line-strong hover:bg-surface-2')}>
            <span className={cn('flex items-center gap-1 pe-4 text-[12px] font-medium', tone === 'warning' ? 'text-amber-800' : active ? 'text-ink' : 'text-ink-3')}>
                {tone === 'warning' && <AlertTriangle size={12} aria-hidden />}{label}
            </span>
            {active && <Check size={14} className="absolute top-2.5 end-2.5 text-heading" aria-hidden />}
            {value === null ? <Skeleton className="mt-1 h-6 w-12" /> : <span className="mt-0.5 block text-[20px] leading-7 font-semibold text-heading tabular-nums">{value}</span>}
            {hint && <span className="block text-[11.5px] leading-4 text-ink-3">{hint}</span>}
        </button>
    );
}

function BuyerCell({ o }: { o: AdminOrderRow }) {
    const { t } = useLanguage();
    if (!o.buyer) return <span className="text-ink-4">{t('adminOrders', 'unknownBuyer')}</span>;
    const main = o.buyer.companyName || o.buyer.name;
    return (
        <span className="block min-w-0">
            <span className="block truncate text-ink">{main}</span>
            {o.buyer.companyName && o.buyer.name && <span className="block truncate text-[12px] text-ink-3">{o.buyer.name}</span>}
        </span>
    );
}

function SupplierCell({ o, tl }: { o: AdminOrderRow; tl: (k: string, v?: Record<string, string | number>) => string }) {
    if (!o.suppliers.length) return <span className="text-ink-4">{tl('noSupplier')}</span>;
    const names = o.suppliers.map((s) => s.name || tl('unnamedSupplier'));
    return (
        <span className="block min-w-0" title={names.join(', ')}>
            <span className="block truncate text-ink-2">{names[0]}</span>
            {names.length > 1 && <span className="block text-[12px] text-ink-3">{tl('moreSuppliers', { count: names.length - 1 })}</span>}
        </span>
    );
}
