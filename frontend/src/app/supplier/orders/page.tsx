'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ShoppingCart, Check, X, Search, FileUp, FileText, Trash2, AlertCircle, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Notice, ORDER_STATUS, PageHeader, Skeleton, Stat, Thumb, inputCls, useConfirm } from '@/components/supplier/ui';
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import type { SupplierWorkflow } from '@/lib/order-workflow';

const S = 'supplierOps';
/** Tabs; labels are dictionary keys. */
const VIEWS = [
    { id: 'action', label: 'ordViewAction', match: (o: any) => o.needsAction },
    { id: 'progress', label: 'ordViewProgress', match: (o: any) => o.status === 'PROCESSING' },
    { id: 'shipped', label: 'ordViewShipped', match: (o: any) => o.status === 'SHIPPED' },
    { id: 'delivered', label: 'ordViewDelivered', match: (o: any) => o.status === 'DELIVERED' },
    { id: 'cancelled', label: 'ordViewCancelled', match: (o: any) => o.status === 'CANCELLED' },
    { id: 'all', label: 'ordViewAll', match: () => true },
] as const;
/** Order tier → plural dictionary key for "{count} cases / pallets / trucks". */
const TIER_QTY: Record<string, string> = { carton: 'qtyCases', case: 'qtyCases', pallet: 'qtyPallets', truck: 'qtyTrucks' };
/** Order id shown to the supplier, isolated so it keeps its direction inside RTL text. */
const ref = (id: string) => `\u2066#${id.slice(-8).toUpperCase()}\u2069`;
/** Timeline status → dictionary key. */
const ORDER_STATUS_LABEL: Record<string, string> = { PENDING: 'tlPENDING', PAID: 'tlPAID', PROCESSING: 'tlPROCESSING', SHIPPED: 'tlSHIPPED', DELIVERED: 'tlDELIVERED', CANCELLED: 'tlCANCELLED' };
/** Status badge (same tones as the shared StatusBadge) → dictionary key. */
const BADGE_LABEL: Record<string, string> = { PENDING: 'badgePENDING', PAID: 'badgePAID', PROCESSING: 'badgePROCESSING', SHIPPED: 'badgeSHIPPED', DELIVERED: 'badgeDELIVERED', CANCELLED: 'badgeCANCELLED' };
/** The server's workflow label, mirrored by key from the same fields (display only). */
function workflowLabelKey(wf: SupplierWorkflow): string | null {
    const mine = wf.myConfirmation?.status;
    if (mine === 'ACCEPTED' && wf.reviewStatus === 'PENDING_REVIEW') return 'wfAcceptedAwaiting';
    if (mine === 'PENDING' && wf.reviewStatus === 'PENDING_REVIEW') return 'wfNeeded';
    if (mine === 'EXPIRED') return 'wfExpired';
    if (mine === 'REJECTED') return 'wfYouRejected';
    if (wf.reviewStatus === 'APPROVED') return 'wfApproved';
    if (wf.reviewStatus === 'REJECTED') return 'wfRejected';
    return null;
}
/** Method key → dictionary key for the fulfilment method label / handover. */
const METHOD_LABEL: Record<string, string> = { ATLANTIS_COLLECTION: 'methodCollectionLabel', SUPPLIER_TO_HUB: 'methodHubLabel', SUPPLIER_DIRECT: 'methodDirectLabel' };
const METHOD_HANDOVER: Record<string, string> = { ATLANTIS_COLLECTION: 'methodCollectionHandover', SUPPLIER_TO_HUB: 'methodHubHandover', SUPPLIER_DIRECT: 'methodDirectHandover' };

/** Locale-aware money / numbers / dates for this page (values unchanged, only displayed). */
function useFormat() {
    const { fmt } = useLanguage();
    return React.useMemo(() => ({
        eur: (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })),
        int: (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n)),
        shortDate: (d: string | Date) => fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric' }),
        dateTime: (d: string | Date) => fmt.date(d, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    }), [fmt]);
}

/** Orders — orders containing this supplier's products, with confirm / decline. */
export default function SupplierOrdersPage() {
    return <React.Suspense fallback={null}><SupplierOrders /></React.Suspense>;
}

function SupplierOrders() {
    const { t } = useLanguage();
    const f = useFormat();
    const params = useSearchParams();
    const [orders, setOrders] = React.useState<any[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [view, setView] = React.useState<string>(params.get('view') || 'action');
    const [q, setQ] = React.useState(params.get('q') || '');
    const [fromDate, setFromDate] = React.useState('');
    const [toDate, setToDate] = React.useState('');
    const [decline, setDecline] = React.useState<any | null>(null);

    const load = React.useCallback(() => {
        setError(null);
        supplierApi.orders().then((d) => setOrders(Array.isArray(d) ? d : [])).catch((e) => setError(e.message));
    }, []);
    React.useEffect(() => { load(); }, [load]);
    // Default to "All" when nothing needs action.
    React.useEffect(() => { if (orders && view === 'action' && !params.get('view') && !orders.some((o) => o.needsAction)) setView('all'); }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

    const v = VIEWS.find((x) => x.id === view) ?? VIEWS[5];
    const term = q.trim().toLowerCase().replace('#', '');
    const inRange = (o: any) => (!fromDate || o.createdAt.slice(0, 10) >= fromDate) && (!toDate || o.createdAt.slice(0, 10) <= toDate);
    const shown = (orders ?? []).filter((o) => v.match(o) && inRange(o) && (!term || o.id.toLowerCase().includes(term) || o.items.some((i: any) => `${i.name} ${i.ean || ''}`.toLowerCase().includes(term))));
    const count = (id: string) => (orders ?? []).filter(VIEWS.find((x) => x.id === id)!.match).length;
    const open = (orders ?? []).filter((o) => ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'].includes(o.status));

    return (
        <div data-no-translate>
            <PageHeader title={t(S, 'ordTitle')} description={t(S, 'ordDescription')} />

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
                <Stat label={t(S, 'ordStatAwaiting')} value={orders ? f.int(count('action')) : '—'} tone="warning" icon={<AlertCircle size={17} />} loading={!orders && !error} />
                <Stat label={t(S, 'ordViewProgress')} value={orders ? f.int(count('progress')) : '—'} tone="brand" icon={<ShoppingCart size={17} />} loading={!orders && !error} />
                <Stat label={t(S, 'ordViewShipped')} value={orders ? f.int(count('shipped')) : '—'} tone="info" icon={<ShoppingCart size={17} />} loading={!orders && !error} />
                <Stat label={t(S, 'ordStatOpenValue')} value={orders ? f.eur(open.reduce((s, o) => s + (o.supplierSubtotal || 0), 0)) : '—'} icon={<ShoppingCart size={17} />} loading={!orders && !error} hint={t(S, 'ordStatOpenValueHint')} />
            </div>

            <Card bodyClassName="p-0">
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-line">
                    <div role="tablist" aria-label={t(S, 'ordTabsLabel')} className="flex gap-1 overflow-x-auto">
                        {VIEWS.map((x) => (
                            <button key={x.id} role="tab" aria-selected={view === x.id} onClick={() => setView(x.id)}
                                className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal', view === x.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                                {t(S, x.label)}{orders && <span className={cn('ms-1.5 tabular-nums', view === x.id ? 'text-white/70' : 'text-ink-4')}>{f.int(count(x.id))}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="relative flex-1 min-w-[220px] sm:max-w-[320px]">
                            <span className="sr-only">{t(S, 'ordSearchLabel')}</span>
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(S, 'ordSearchPlaceholder')} className={cn(inputCls, 'ps-9')} />
                        </label>
                        <label className="sr-only" htmlFor="ord-from">{t(S, 'ordPlacedFrom')}</label>
                        <input id="ord-from" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className={cn(inputCls, 'w-[150px]')} />
                        <span className="text-[13px] text-ink-3">{t(S, 'ordDateTo')}</span>
                        <label className="sr-only" htmlFor="ord-to">{t(S, 'ordPlacedUntil')}</label>
                        <input id="ord-to" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className={cn(inputCls, 'w-[150px]')} />
                        {(fromDate || toDate) && <Button size="sm" variant="ghost" onClick={() => { setFromDate(''); setToDate(''); }}>{t(S, 'ordClearDates')}</Button>}
                    </div>
                </div>

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}
                {!orders && !error ? <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
                    : orders && shown.length === 0 ? (
                        <EmptyState icon={<ShoppingCart size={20} />} title={orders.length ? t(S, 'ordEmptyViewTitle') : t(S, 'ordEmptyTitle')}>
                            {orders.length ? t(S, 'ordEmptyViewBody') : t(S, 'ordEmptyBody')}
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-line">
                            {shown.map((o) => <OrderRow key={o.id} o={o} onChanged={load} onDecline={() => setDecline(o)} />)}
                        </ul>
                    )}
            </Card>

            <DeclineDialog order={decline} onClose={() => setDecline(null)} onDone={() => { setDecline(null); load(); }} />
        </div>
    );
}

function OrderRow({ o, onChanged, onDecline }: { o: any; onChanged: () => void; onDecline: () => void }) {
    const { t } = useLanguage();
    const f = useFormat();
    const confirm = useConfirm();
    const [busy, setBusy] = React.useState(false);
    const [expanded, setExpanded] = React.useState(o.needsAction);

    const wf = o.workflow as SupplierWorkflow | null;
    /** "3 cases" / "2 pallets" / "1 truck" for an order line. */
    const qty = (n: number, tier: string | null | undefined) => t(S, TIER_QTY[tier || ''] || 'qtyCases', { count: n });
    const methodLabel = (m: { method: string; label: string }) => (METHOD_LABEL[m.method] ? t(S, METHOD_LABEL[m.method]) : m.label);
    const wfKey = wf?.label ? workflowLabelKey(wf) : null;
    const accept = async () => {
        const ok = wf ? await confirm({
            title: t(S, 'ordAcceptTermsTitle', { ref: ref(o.id) }),
            body: <>
                <p>{wf.terms?.fulfillment ? t(S, 'ordAcceptTermsBodyMethod', { method: methodLabel(wf.terms.fulfillment) }) : t(S, 'ordAcceptTermsBody')}</p>
                <ul className="mt-2 list-disc ps-5 text-[13px]">{(wf.terms?.lines || []).map((l, n) => <li key={n}>{l.unitNet != null ? t(S, 'ordTermsLinePrice', { qty: qty(l.quantity, l.tier), name: l.name, price: f.eur(l.unitNet) }) : t(S, 'ordTermsLine', { qty: qty(l.quantity, l.tier), name: l.name })}</li>)}</ul>
                {wf.terms && <p className="mt-2 text-[13px] font-semibold text-ink">{t(S, 'ordNetTotal', { amount: f.eur(wf.terms.netTotal) })}</p>}
                <p className="mt-2 text-ink-3 text-[13px]">{t(S, 'ordAcceptTermsNote')}</p>
            </>,
            confirm: t(S, 'ordAcceptTermsButton', { version: wf.termsVersion }),
        }) : await confirm({
            title: t(S, 'ordConfirmTitle', { ref: ref(o.id) }),
            body: <>
                <p>{t(S, 'ordConfirmBody')}</p>
                <ul className="mt-2 list-disc ps-5 text-[13px]">{o.items.map((i: any) => <li key={i.id}>{i.cases ? t(S, 'ordLineWithCases', { qty: qty(i.quantity, i.selectedTier), name: i.name, cases: t(S, 'qtyCases', { count: i.cases }) }) : t(S, 'ordTermsLine', { qty: qty(i.quantity, i.selectedTier), name: i.name })}</li>)}</ul>
                <p className="mt-2 text-ink-3 text-[13px]">{t(S, 'ordConfirmNote')}</p>
            </>,
            confirm: t(S, 'ordConfirmButton'),
        });
        if (!ok) return;
        setBusy(true);
        try { await supplierApi.acceptOrder(o.id); toast.success(wf ? t(S, 'ordToastTermsAccepted', { ref: ref(o.id) }) : t(S, 'ordToastConfirmed', { ref: ref(o.id) })); onChanged(); }
        catch (e: any) { toast.error(e.message); onChanged(); }
        finally { setBusy(false); }
    };
    const badge = ORDER_STATUS[o.status];

    return (
        <li className="p-4">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <button type="button" onClick={() => setExpanded((x: boolean) => !x)} aria-expanded={expanded} className="flex items-start gap-3 min-w-0 flex-1 text-start group">
                    <ChevronDown size={16} className={cn('mt-1 text-ink-3 transition-transform shrink-0', expanded && 'rotate-180')} />
                    <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-heading tabular-nums group-hover:underline">{t(S, 'ordOrderRef', { ref: ref(o.id) })}</span>
                            <Badge tone={badge?.tone ?? 'neutral'} dot>{BADGE_LABEL[o.status] ? t(S, BADGE_LABEL[o.status]) : o.status}</Badge>
                            {o.sharedOrder && <Badge tone="neutral">{t(S, 'ordSharedBadge')}</Badge>}
                            {wf?.label && <Badge tone={wf.myConfirmation?.status === 'PENDING' ? 'warning' : wf.myConfirmation?.status === 'REJECTED' || wf.myConfirmation?.status === 'EXPIRED' ? 'danger' : 'neutral'}>{wfKey ? t(S, wfKey) : <span lang="en">{wf.label}</span>}</Badge>}
                        </span>
                        <span className="block mt-0.5 text-[12.5px] text-ink-3">{t(S, 'ordRowMeta', {
                            date: f.shortDate(o.createdAt),
                            buyer: o.buyer?.name || t(S, 'ordBuyerFallback'),
                            lines: t(S, 'ordLinesCount', { count: o.items.length }),
                            cases: t(S, 'qtyCases', { count: o.items.reduce((s: number, i: any) => s + (i.cases || 0), 0) }),
                        })}</span>
                    </span>
                </button>
                <div className="text-end">
                    <p className="font-semibold text-heading tabular-nums">{f.eur(o.supplierSubtotal)}</p>
                    <p className="text-[12px] text-ink-3">{o.valueEstimated ? t(S, 'ordValueEstimated') : t(S, 'ordValueYourPrice')}</p>
                </div>
                {o.needsAction && (
                    <div className="flex flex-col items-stretch sm:items-end gap-1 w-full sm:w-auto">
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={<X size={14} />} onClick={onDecline} disabled={busy}>{wf ? t(S, 'ordReject') : t(S, 'ordDecline')}</Button>
                            <Button variant="primary" icon={<Check size={14} />} loading={busy} onClick={accept}>{wf ? t(S, 'ordAcceptTerms') : t(S, 'ordConfirm')}</Button>
                        </div>
                        {wf?.myConfirmation?.deadline && <p className="text-[12px] text-ink-3">{t(S, 'ordAnswerBy', { date: f.dateTime(wf.myConfirmation.deadline) })}</p>}
                    </div>
                )}
            </div>

            {expanded && (
                <div className="mt-3 ms-7 space-y-3">
                    <div className="overflow-x-auto rounded-lg ring-1 ring-line">
                        <table className="w-full text-[13px]">
                            <thead><tr className="bg-surface-2/60 text-[12px] text-ink-3">
                                <th className="text-start font-medium px-3 py-2">{t(S, 'ordColProduct')}</th>
                                <th className="text-end font-medium px-3 py-2">{t(S, 'ordColOrdered')}</th>
                                <th className="text-end font-medium px-3 py-2">{t(S, 'ordColCases')}</th>
                                <th className="text-end font-medium px-3 py-2 hidden sm:table-cell">{t(S, 'ordColUnitPrice')}</th>
                                <th className="text-end font-medium px-3 py-2">{t(S, 'ordColLineTotal')}</th>
                            </tr></thead>
                            <tbody>
                                {o.items.map((i: any) => (
                                    <tr key={i.id} className="border-t border-line align-top">
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <Thumb src={i.image} size={34} />
                                                <span className="min-w-0">
                                                    <span className="block truncate max-w-[34ch] text-ink">{i.name}</span>
                                                    <span className="block text-[12px] text-ink-3 font-mono"><bdi dir="ltr">{i.ean || ''}</bdi>{i.unitsPerCase ? <span className="font-sans"> · {t(S, 'ordPcsPerCase', { count: i.unitsPerCase })}</span> : null}</span>
                                                    {i.selectedVariants && typeof i.selectedVariants === 'object' && Object.keys(i.selectedVariants).length > 0 && <span className="block text-[12px] text-ink-3">{Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>}
                                                    {Array.isArray(i.mixComposition) && i.mixComposition.length > 0 && <span className="block text-[12px] text-ink-3">{t(S, 'ordMix', { items: i.mixComposition.map((m: any) => `${m.quantity}× ${m.signature || m.name || m.variant || ''}`).join(', ') })}</span>}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-end tabular-nums whitespace-nowrap">{qty(i.quantity, i.selectedTier)}</td>
                                        <td className="px-3 py-2 text-end tabular-nums">{i.cases ? f.int(i.cases) : '—'}</td>
                                        <td className="px-3 py-2 text-end tabular-nums hidden sm:table-cell">{f.eur(i.price)}</td>
                                        <td className="px-3 py-2 text-end tabular-nums">{f.eur(i.price * i.quantity)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {Array.isArray(o.timeline) && o.timeline.length > 0 && (
                        <ol className="relative ms-1 border-s border-line ps-4 space-y-2" aria-label={t(S, 'ordTimelineLabel')}>
                            {o.timeline.map((h: any, i: number) => (
                                <li key={i} className="relative text-[12.5px]">
                                    <span aria-hidden className={cn('absolute -start-[21px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-surface', i === o.timeline.length - 1 ? 'bg-teal' : 'bg-line-strong')} />
                                    <span className="font-medium text-ink">{ORDER_STATUS_LABEL[h.status] ? t(S, ORDER_STATUS_LABEL[h.status]) : h.status}</span>
                                    <span className="text-ink-3"> · {f.dateTime(h.at)}</span>
                                    {h.note && <span className="block text-ink-3">{h.note}</span>}
                                </li>
                            ))}
                        </ol>
                    )}
                    {o.valueEstimated && <p className="text-[12px] text-ink-3">{t(S, 'ordValueEstimatedNote')}</p>}
                    {wf?.terms?.fulfillment && (
                        <div className="rounded-lg bg-surface-2/60 p-3 text-[12.5px]">
                            <p className="font-medium text-ink">{methodLabel(wf.terms.fulfillment)}{wf.terms.fulfillment.status !== 'priced' ? <span className="font-normal text-ink-3"> · {t(S, 'ordFreightQuoted')}</span> : null}</p>
                            <p className="text-ink-3 mt-0.5">{METHOD_HANDOVER[wf.terms.fulfillment.method] ? t(S, METHOD_HANDOVER[wf.terms.fulfillment.method]) : <span lang="en">{wf.terms.fulfillment.handover}</span>}</p>
                            {wf.terms.fulfillment.supplierCharges.map((c, n) => (
                                <p key={n} className="text-ink-2 mt-0.5">
                                    <Trans text={t(S, 'ordSupplierCharge', { label: c.label === 'Your freight to the hub' ? t(S, 'chargeHubFreight') : c.label, amount: f.eur(c.amount) })}
                                        tags={{ basis: () => <span lang="en" dir="ltr">{c.basis}</span>, amount: (x) => <span className="tabular-nums">{x}</span> }} />
                                </p>
                            ))}
                        </div>
                    )}
                    {wf?.myConfirmation?.status === 'EXPIRED' && <Notice tone="warning">{t(S, 'ordExpiredNotice')}</Notice>}
                    {o.status === 'PROCESSING' && <p className="text-[12.5px] text-ink-3">{t(S, 'ordNextProcessing')}</p>}
                    {['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(o.status) && <InvoiceAttachment orderId={o.id} initial={o.supplierInvoiceUrl} />}
                </div>
            )}
        </li>
    );
}

function DeclineDialog({ order, onClose, onDone }: { order: any | null; onClose: () => void; onDone: () => void }) {
    const { t } = useLanguage();
    const [reason, setReason] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    React.useEffect(() => { setReason(''); setErr(null); }, [order]);
    if (!order) return null;
    const submit = async () => {
        if (reason.trim().length < 5) { setErr(t(S, 'ordReasonTooShort')); return; }
        setBusy(true); setErr(null);
        try { await supplierApi.declineOrder(order.id, reason.trim()); toast.success(order.workflow && order.sharedOrder ? t(S, 'ordToastRejectionSent', { ref: ref(order.id) }) : t(S, 'ordToastDeclined', { ref: ref(order.id) })); onDone(); }
        catch (e: any) { setErr(e.message); }
        finally { setBusy(false); }
    };
    return (
        <Dialog open={!!order} onClose={onClose} title={order.workflow ? t(S, 'ordRejectTermsTitle', { ref: ref(order.id) }) : t(S, 'ordDeclineTitle', { ref: ref(order.id) })} size="sm"
            footer={order.canDecline ? <><Button variant="secondary" onClick={onClose}>{t(S, 'ordKeepOrder')}</Button><Button variant="danger" loading={busy} onClick={submit}>{t(S, 'ordDeclineOrder')}</Button></> : <Button variant="primary" onClick={onClose}>{t(S, 'ordOk')}</Button>}>
            {order.canDecline ? (
                <div className="space-y-3">
                    <p className="text-[13.5px] text-ink-2">{order.workflow && order.sharedOrder ? t(S, 'ordDeclineSharedBody') : t(S, 'ordDeclineBody')}</p>
                    <label htmlFor="decline-reason" className="block text-[13px] font-medium text-ink-2">{t(S, 'ordReasonLabel')} <span className="text-red-600">*</span></label>
                    <textarea id="decline-reason" data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={cn(inputCls, 'h-auto py-2')} placeholder={t(S, 'ordReasonPlaceholder')} />
                    {err && <p role="alert" className="text-[12.5px] text-red-700">{err}</p>}
                </div>
            ) : (
                <Notice tone="warning">{t(S, 'ordCantDeclineNotice')}</Notice>
            )}
        </Dialog>
    );
}

function InvoiceAttachment({ orderId, initial }: { orderId: string; initial?: string | null }) {
    const { t } = useLanguage();
    const [url, setUrl] = React.useState<string | null>(initial ?? null);
    const [busy, setBusy] = React.useState(false);
    const confirm = useConfirm();
    const input = React.useRef<HTMLInputElement>(null);
    const pick = async (file: File) => {
        if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) return toast.error(t(S, 'invTypeError'));
        if (file.size > 10 * 1024 * 1024) return toast.error(t(S, 'invSizeError'));
        setBusy(true);
        try {
            const fd = new FormData(); fd.append('file', file);
            const res = await apiFetch(`/orders/${orderId}/supplier-invoice`, { method: 'POST', body: fd });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d?.message || t(S, 'invUploadFailed'));
            setUrl(d?.url || null); toast.success(t(S, 'invAttached'));
        } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    const remove = async () => {
        if (!(await confirm({ title: t(S, 'invRemoveTitle'), confirm: t(S, 'invRemove'), tone: 'danger' }))) return;
        const res = await apiFetch(`/orders/${orderId}/supplier-invoice`, { method: 'DELETE' });
        res.ok ? (setUrl(null), toast.success(t(S, 'invRemoved'))) : toast.error(t(S, 'invRemoveFailed'));
    };
    return (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-2 font-medium">{t(S, 'invLabel')}</span>
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal hover:underline"><FileText size={14} /> {t(S, 'invView')}</a> : <span className="text-ink-3">{t(S, 'invNone')}</span>}
            <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
            <Button size="sm" variant="secondary" icon={<FileUp size={13} />} loading={busy} onClick={() => input.current?.click()}>{url ? t(S, 'invReplace') : t(S, 'invAttach')}</Button>
            {url && <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={remove}>{t(S, 'invRemove')}</Button>}
        </div>
    );
}
