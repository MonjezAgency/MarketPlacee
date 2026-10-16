'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ShoppingCart, Check, X, Search, FileUp, FileText, Trash2, AlertCircle, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Notice, PageHeader, Skeleton, Stat, StatusBadge, Thumb, eur, int, inputCls, shortDate, useConfirm } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import type { SupplierWorkflow } from '@/lib/order-workflow';

const VIEWS = [
    { id: 'action', label: 'Needs your action', match: (o: any) => o.needsAction },
    { id: 'progress', label: 'Preparing', match: (o: any) => o.status === 'PROCESSING' },
    { id: 'shipped', label: 'Shipped', match: (o: any) => o.status === 'SHIPPED' },
    { id: 'delivered', label: 'Delivered', match: (o: any) => o.status === 'DELIVERED' },
    { id: 'cancelled', label: 'Cancelled', match: (o: any) => o.status === 'CANCELLED' },
    { id: 'all', label: 'All', match: () => true },
] as const;
const TIER: Record<string, string> = { carton: 'case', case: 'case', pallet: 'pallet', truck: 'truck' };
const ref = (id: string) => `#${id.slice(-8).toUpperCase()}`;
const ORDER_STATUS_LABEL: Record<string, string> = { PENDING: 'Placed — awaiting confirmation', PAID: 'Paid', PROCESSING: 'Confirmed — preparing', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };

/** Orders — orders containing this supplier's products, with confirm / decline. */
export default function SupplierOrdersPage() {
    return <React.Suspense fallback={null}><SupplierOrders /></React.Suspense>;
}

function SupplierOrders() {
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
        <div>
            <PageHeader title="Orders" description="Orders that include your products. Confirm what you can fulfil; Atlantis arranges transport and delivery updates. Values are at your own prices." />

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
                <Stat label="Awaiting your confirmation" value={orders ? int(count('action')) : '—'} tone="warning" icon={<AlertCircle size={17} />} loading={!orders && !error} />
                <Stat label="Preparing" value={orders ? int(count('progress')) : '—'} tone="brand" icon={<ShoppingCart size={17} />} loading={!orders && !error} />
                <Stat label="Shipped" value={orders ? int(count('shipped')) : '—'} tone="info" icon={<ShoppingCart size={17} />} loading={!orders && !error} />
                <Stat label="Open order value" value={orders ? eur(open.reduce((s, o) => s + (o.supplierSubtotal || 0), 0)) : '—'} icon={<ShoppingCart size={17} />} loading={!orders && !error} hint="your lines, your prices" />
            </div>

            <Card bodyClassName="p-0">
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-line">
                    <div role="tablist" aria-label="Order status" className="flex gap-1 overflow-x-auto">
                        {VIEWS.map((x) => (
                            <button key={x.id} role="tab" aria-selected={view === x.id} onClick={() => setView(x.id)}
                                className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal', view === x.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                                {x.label}{orders && <span className={cn('ms-1.5 tabular-nums', view === x.id ? 'text-white/70' : 'text-ink-4')}>{count(x.id)}</span>}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="relative flex-1 min-w-[220px] sm:max-w-[320px]">
                            <span className="sr-only">Search orders</span>
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order #, product or barcode" className={cn(inputCls, 'ps-9')} />
                        </label>
                        <label className="sr-only" htmlFor="ord-from">Placed from</label>
                        <input id="ord-from" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className={cn(inputCls, 'w-[150px]')} />
                        <span className="text-[13px] text-ink-3">to</span>
                        <label className="sr-only" htmlFor="ord-to">Placed until</label>
                        <input id="ord-to" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className={cn(inputCls, 'w-[150px]')} />
                        {(fromDate || toDate) && <Button size="sm" variant="ghost" onClick={() => { setFromDate(''); setToDate(''); }}>Clear dates</Button>}
                    </div>
                </div>

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}
                {!orders && !error ? <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
                    : orders && shown.length === 0 ? (
                        <EmptyState icon={<ShoppingCart size={20} />} title={orders.length ? 'No orders in this view' : 'No orders yet'}>
                            {orders.length ? 'Try another tab or search.' : 'When a buyer orders your products, the order appears here for you to confirm.'}
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
    const confirm = useConfirm();
    const [busy, setBusy] = React.useState(false);
    const [expanded, setExpanded] = React.useState(o.needsAction);

    const wf = o.workflow as SupplierWorkflow | null;
    const accept = async () => {
        const ok = wf ? await confirm({
            title: `Accept the terms for order ${ref(o.id)}?`,
            body: <>
                <p>You confirm you can supply exactly these lines at these net prices, and dispatch within the lead time on your listing{wf.terms?.fulfillment ? ` (${wf.terms.fulfillment.label.toLowerCase()})` : ''}.</p>
                <ul className="mt-2 list-disc ps-5 text-[13px]">{(wf.terms?.lines || []).map((l, n) => <li key={n}>{l.quantity} × {TIER[l.tier || ''] || 'case'} — {l.name}{l.unitNet != null ? ` at ${eur(l.unitNet)}` : ''}</li>)}</ul>
                {wf.terms && <p className="mt-2 text-[13px] font-semibold text-ink">Your net total: {eur(wf.terms.netTotal)}</p>}
                <p className="mt-2 text-ink-3 text-[13px]">This doesn’t confirm the order yet: Atlantis approves it once every supplier on it has accepted. If the terms change, you’ll be asked again.</p>
            </>,
            confirm: `Accept terms v${wf.termsVersion}`,
        }) : await confirm({
            title: `Confirm order ${ref(o.id)}?`,
            body: <>
                <p>You’re confirming you can supply these lines. The stock for them was already reserved when the buyer ordered, so nothing more is deducted.</p>
                <ul className="mt-2 list-disc ps-5 text-[13px]">{o.items.map((i: any) => <li key={i.id}>{i.quantity} × {TIER[i.selectedTier] || 'case'} — {i.name}{i.cases ? ` (${int(i.cases)} cases)` : ''}</li>)}</ul>
                <p className="mt-2 text-ink-3 text-[13px]">The buyer is notified. Shipping is arranged by Atlantis.</p>
            </>,
            confirm: 'Confirm order',
        });
        if (!ok) return;
        setBusy(true);
        try { await supplierApi.acceptOrder(o.id); toast.success(wf ? `Terms accepted — Atlantis will approve order ${ref(o.id)}` : `Order ${ref(o.id)} confirmed`); onChanged(); }
        catch (e: any) { toast.error(e.message); onChanged(); }
        finally { setBusy(false); }
    };

    return (
        <li className="p-4">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <button type="button" onClick={() => setExpanded((x: boolean) => !x)} aria-expanded={expanded} className="flex items-start gap-3 min-w-0 flex-1 text-start group">
                    <ChevronDown size={16} className={cn('mt-1 text-ink-3 transition-transform shrink-0', expanded && 'rotate-180')} />
                    <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-heading tabular-nums group-hover:underline">Order {ref(o.id)}</span>
                            <StatusBadge kind="order" status={o.status} />
                            {o.sharedOrder && <Badge tone="neutral">Includes other suppliers</Badge>}
                            {wf?.label && <Badge tone={wf.myConfirmation?.status === 'PENDING' ? 'warning' : wf.myConfirmation?.status === 'REJECTED' || wf.myConfirmation?.status === 'EXPIRED' ? 'danger' : 'neutral'}>{wf.label}</Badge>}
                        </span>
                        <span className="block mt-0.5 text-[12.5px] text-ink-3">{shortDate(o.createdAt)} · buyer {o.buyer?.name || 'Customer'} · {o.items.length} line{o.items.length === 1 ? '' : 's'} · {int(o.items.reduce((s: number, i: any) => s + (i.cases || 0), 0))} cases</span>
                    </span>
                </button>
                <div className="text-end">
                    <p className="font-semibold text-heading tabular-nums">{eur(o.supplierSubtotal)}</p>
                    <p className="text-[12px] text-ink-3">{o.valueEstimated ? 'estimated · your price' : 'your price'}</p>
                </div>
                {o.needsAction && (
                    <div className="flex flex-col items-stretch sm:items-end gap-1 w-full sm:w-auto">
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={<X size={14} />} onClick={onDecline} disabled={busy}>{wf ? 'Reject' : 'Decline'}</Button>
                            <Button variant="primary" icon={<Check size={14} />} loading={busy} onClick={accept}>{wf ? 'Accept terms' : 'Confirm'}</Button>
                        </div>
                        {wf?.myConfirmation?.deadline && <p className="text-[12px] text-ink-3">Answer by {new Date(wf.myConfirmation.deadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                    </div>
                )}
            </div>

            {expanded && (
                <div className="mt-3 ms-7 space-y-3">
                    <div className="overflow-x-auto rounded-lg ring-1 ring-line">
                        <table className="w-full text-[13px]">
                            <thead><tr className="bg-surface-2/60 text-[12px] text-ink-3">
                                <th className="text-start font-medium px-3 py-2">Product</th>
                                <th className="text-end font-medium px-3 py-2">Ordered</th>
                                <th className="text-end font-medium px-3 py-2">Cases</th>
                                <th className="text-end font-medium px-3 py-2 hidden sm:table-cell">Your unit price</th>
                                <th className="text-end font-medium px-3 py-2">Line total</th>
                            </tr></thead>
                            <tbody>
                                {o.items.map((i: any) => (
                                    <tr key={i.id} className="border-t border-line align-top">
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <Thumb src={i.image} size={34} />
                                                <span className="min-w-0">
                                                    <span className="block truncate max-w-[34ch] text-ink">{i.name}</span>
                                                    <span className="block text-[12px] text-ink-3 font-mono">{i.ean || ''}{i.unitsPerCase ? <span className="font-sans"> · {i.unitsPerCase} pcs/case</span> : null}</span>
                                                    {i.selectedVariants && typeof i.selectedVariants === 'object' && Object.keys(i.selectedVariants).length > 0 && <span className="block text-[12px] text-ink-3">{Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>}
                                                    {Array.isArray(i.mixComposition) && i.mixComposition.length > 0 && <span className="block text-[12px] text-ink-3">Mix: {i.mixComposition.map((m: any) => `${m.quantity}× ${m.signature || m.name || m.variant || ''}`).join(', ')}</span>}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-end tabular-nums whitespace-nowrap">{i.quantity} × {TIER[i.selectedTier] || 'case'}</td>
                                        <td className="px-3 py-2 text-end tabular-nums">{i.cases ? int(i.cases) : '—'}</td>
                                        <td className="px-3 py-2 text-end tabular-nums hidden sm:table-cell">{eur(i.price)}</td>
                                        <td className="px-3 py-2 text-end tabular-nums">{eur(i.price * i.quantity)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {Array.isArray(o.timeline) && o.timeline.length > 0 && (
                        <ol className="relative ms-1 border-s border-line ps-4 space-y-2" aria-label="Order timeline">
                            {o.timeline.map((h: any, i: number) => (
                                <li key={i} className="relative text-[12.5px]">
                                    <span aria-hidden className={cn('absolute -start-[21px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-surface', i === o.timeline.length - 1 ? 'bg-teal' : 'bg-line-strong')} />
                                    <span className="font-medium text-ink">{ORDER_STATUS_LABEL[h.status] || h.status}</span>
                                    <span className="text-ink-3"> · {new Date(h.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    {h.note && <span className="block text-ink-3">{h.note}</span>}
                                </li>
                            ))}
                        </ol>
                    )}
                    {o.valueEstimated && <p className="text-[12px] text-ink-3">This order was placed before your price was recorded on each line, so its value is estimated from your current price.</p>}
                    {wf?.terms?.fulfillment && (
                        <div className="rounded-lg bg-surface-2/60 p-3 text-[12.5px]">
                            <p className="font-medium text-ink">{wf.terms.fulfillment.label}{wf.terms.fulfillment.status !== 'priced' ? <span className="font-normal text-ink-3"> · freight quoted by Atlantis</span> : null}</p>
                            <p className="text-ink-3 mt-0.5">{wf.terms.fulfillment.handover}</p>
                            {wf.terms.fulfillment.supplierCharges.map((c, n) => <p key={n} className="text-ink-2 mt-0.5">{c.label} — {c.basis}: <span className="tabular-nums">{eur(c.amount)}</span> (paid to you on top of your net price)</p>)}
                        </div>
                    )}
                    {wf?.myConfirmation?.status === 'EXPIRED' && <Notice tone="warning">The time to answer passed. Atlantis can ask you again — contact support if you can still supply this order.</Notice>}
                    {o.status === 'PROCESSING' && <p className="text-[12.5px] text-ink-3">Next: Atlantis books transport and marks the order shipped. Prepare the goods at your EXW location.</p>}
                    {['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(o.status) && <InvoiceAttachment orderId={o.id} initial={o.supplierInvoiceUrl} />}
                </div>
            )}
        </li>
    );
}

function DeclineDialog({ order, onClose, onDone }: { order: any | null; onClose: () => void; onDone: () => void }) {
    const [reason, setReason] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    React.useEffect(() => { setReason(''); setErr(null); }, [order]);
    if (!order) return null;
    const submit = async () => {
        if (reason.trim().length < 5) { setErr('Give the buyer a short reason (at least 5 characters).'); return; }
        setBusy(true); setErr(null);
        try { await supplierApi.declineOrder(order.id, reason.trim()); toast.success(order.workflow && order.sharedOrder ? `Rejection sent to Atlantis for order ${ref(order.id)}.` : `Order ${ref(order.id)} declined — stock returned.`); onDone(); }
        catch (e: any) { setErr(e.message); }
        finally { setBusy(false); }
    };
    return (
        <Dialog open={!!order} onClose={onClose} title={order.workflow ? `Reject the terms for order ${ref(order.id)}?` : `Decline order ${ref(order.id)}?`} size="sm"
            footer={order.canDecline ? <><Button variant="secondary" onClick={onClose}>Keep order</Button><Button variant="danger" loading={busy} onClick={submit}>Decline order</Button></> : <Button variant="primary" onClick={onClose}>OK</Button>}>
            {order.canDecline ? (
                <div className="space-y-3">
                    <p className="text-[13.5px] text-ink-2">{order.workflow && order.sharedOrder
                        ? 'Atlantis is told what you can’t supply and decides with the buyer — the order may be changed (you’d be asked again) or cancelled.'
                        : 'The order is cancelled, the reserved cases go back to your stock, and the buyer is told why.'}</p>
                    <label htmlFor="decline-reason" className="block text-[13px] font-medium text-ink-2">Reason for the buyer <span className="text-red-600">*</span></label>
                    <textarea id="decline-reason" data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={cn(inputCls, 'h-auto py-2')} placeholder="e.g. This batch sold out; next availability in 3 weeks." />
                    {err && <p role="alert" className="text-[12.5px] text-red-700">{err}</p>}
                </div>
            ) : (
                <Notice tone="warning">This order also has other suppliers’ products, so it can’t be declined from here. Contact Atlantis support with the order number and what you can’t supply.</Notice>
            )}
        </Dialog>
    );
}

function InvoiceAttachment({ orderId, initial }: { orderId: string; initial?: string | null }) {
    const [url, setUrl] = React.useState<string | null>(initial ?? null);
    const [busy, setBusy] = React.useState(false);
    const confirm = useConfirm();
    const input = React.useRef<HTMLInputElement>(null);
    const pick = async (file: File) => {
        if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) return toast.error('Invoice must be an image or PDF.');
        if (file.size > 10 * 1024 * 1024) return toast.error('Invoice must be 10 MB or smaller.');
        setBusy(true);
        try {
            const fd = new FormData(); fd.append('file', file);
            const res = await apiFetch(`/orders/${orderId}/supplier-invoice`, { method: 'POST', body: fd });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d?.message || 'Upload failed.');
            setUrl(d?.url || null); toast.success('Invoice attached — the buyer can see it.');
        } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    const remove = async () => {
        if (!(await confirm({ title: 'Remove the invoice?', confirm: 'Remove', tone: 'danger' }))) return;
        const res = await apiFetch(`/orders/${orderId}/supplier-invoice`, { method: 'DELETE' });
        res.ok ? (setUrl(null), toast.success('Invoice removed')) : toast.error('Couldn’t remove the invoice.');
    };
    return (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-2 font-medium">Invoice:</span>
            {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal hover:underline"><FileText size={14} /> View attached file</a> : <span className="text-ink-3">none attached</span>}
            <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
            <Button size="sm" variant="secondary" icon={<FileUp size={13} />} loading={busy} onClick={() => input.current?.click()}>{url ? 'Replace' : 'Attach'}</Button>
            {url && <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={remove}>Remove</Button>}
        </div>
    );
}
