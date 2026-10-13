'use client';

import * as React from 'react';
import Link from 'next/link';
import { Package, Search, AlertTriangle, Truck, Check, ChevronRight, Loader2, PackageCheck } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { apiFetch } from '@/lib/api';
import { fetchMyOrders, orderStatus, orderRef, supplierCount, TONE_CLASS, type BuyerOrder } from '@/lib/buyer-orders';
import { cn } from '@/lib/utils';

const FILTERS = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'open', label: 'In progress', match: (o: BuyerOrder) => ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'].includes(o.status) },
    { id: 'delivered', label: 'Delivered', match: (o: BuyerOrder) => o.status === 'DELIVERED' },
    { id: 'cancelled', label: 'Cancelled', match: (o: BuyerOrder) => o.status === 'CANCELLED' },
] as const;

const STEPS = ['Placed', 'Confirmed', 'Shipped', 'Delivered'] as const;
/** Index of the last completed step, from the status the server records. */
const stepOf = (o: BuyerOrder) => ({ PENDING: 0, PAID: 1, PROCESSING: 1, SHIPPED: 2, DELIVERED: 3 } as Record<string, number>)[o.status] ?? 0;

function Stepper({ o }: { o: BuyerOrder }) {
    const at = stepOf(o);
    return (
        <ol className="flex items-center" aria-label="Order progress">
            {STEPS.map((label, i) => {
                const done = i <= at;
                return (
                    <li key={label} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
                        <span className="flex flex-col items-center gap-1 min-w-[56px]">
                            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold', done ? 'bg-[#0E7C74] text-white' : 'ring-1 ring-line-strong text-ink-4')}>
                                {done ? <Check size={13} strokeWidth={2.5} /> : i + 1}
                            </span>
                            <span className={cn('text-[11.5px]', done ? 'text-ink font-medium' : 'text-ink-4')}>{label}</span>
                        </span>
                        {i < STEPS.length - 1 && <span aria-hidden className={cn('flex-1 h-[2px] -mt-5 rounded-full', i < at ? 'bg-[#0E7C74]' : 'bg-line')} />}
                    </li>
                );
            })}
        </ol>
    );
}

function OrderCard({ o, onChanged }: { o: BuyerOrder; onChanged: () => void }) {
    const st = orderStatus(o);
    const n = supplierCount(o);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState('');
    const lines = o.items.map((i) => ({ id: i.id, name: i.product?.name || i.productNameSnapshot || (i.mixedLoadId ? 'Mixed load' : 'Product no longer listed'), image: i.product?.images?.[0] || null, qty: i.quantity }));

    const confirmReceipt = async () => {
        if (!confirm('Confirm you received this order in good condition? This closes the order.')) return;
        setBusy(true); setErr('');
        try {
            const r = await apiFetch(`/orders/${o.id}/confirm-delivery`, { method: 'POST' });
            if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.message || 'Could not confirm receipt.');
            onChanged();
        } catch (e: any) { setErr(e?.message || 'Could not confirm receipt.'); }
        finally { setBusy(false); }
    };

    return (
        <article className="rounded-2xl ring-1 ring-line bg-surface overflow-clip">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-3.5 border-b border-line">
                <h3 className="text-[15px] font-semibold text-heading tabular-nums">Order {orderRef(o.id)}</h3>
                <span className={cn('text-[12px] font-semibold px-2.5 py-1 rounded-full', TONE_CLASS[st.tone])}>{st.label}</span>
                <span className="text-[12.5px] text-ink-3">{new Date(o.createdAt).toLocaleDateString()}{n > 1 ? ` · ${n} suppliers` : ''}</span>
                <span className="ms-auto text-[15px] font-semibold text-heading tabular-nums">{formatPrice(o.totalAmount)}</span>
            </header>

            <div className="px-4 sm:px-5 py-4 space-y-5">
                <ul className="space-y-2">
                    {lines.slice(0, 3).map((l) => (
                        <li key={l.id} className="flex items-center gap-3">
                            <span className="relative w-10 h-10 shrink-0 rounded-full bg-media ring-1 ring-line overflow-clip">
                                {l.image
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={l.image} alt="" className="absolute inset-0 m-auto max-w-[78%] max-h-[78%] object-contain mix-blend-multiply" />
                                    : <span className="absolute inset-0 flex items-center justify-center text-ink-4"><Package size={15} /></span>}
                            </span>
                            <span className="min-w-0 flex-1 text-[13.5px] text-ink truncate">{l.name}</span>
                            <span className="text-[12.5px] text-ink-3 tabular-nums">× {l.qty}</span>
                        </li>
                    ))}
                    {lines.length > 3 && <li className="text-[12.5px] text-ink-3 ps-[52px]">+ {lines.length - 3} more</li>}
                </ul>

                {o.status === 'CANCELLED' ? (
                    <p className="text-[13.5px] text-ink-3">This order was cancelled.</p>
                ) : (
                    <div className="pt-4 border-t border-line">
                        <Stepper o={o} />
                        <p className="mt-2 text-[12.5px] text-ink-3 flex items-center gap-1.5">
                            {o.status === 'SHIPPED' && <Truck size={13} className="shrink-0" />}{st.note}
                        </p>
                    </div>
                )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-t border-line bg-surface-2/40">
                {err && <p role="alert" className="w-full text-[12.5px] text-[#B91C1C]">{err}</p>}
                <Link href={`/dashboard/customer/orders/${o.id}`} className="h-9 px-3.5 inline-flex items-center gap-1 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:bg-surface">
                    Track & details <ChevronRight size={14} />
                </Link>
                {o.status === 'SHIPPED' && (
                    <button type="button" onClick={confirmReceipt} disabled={busy} className="ms-auto h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold disabled:opacity-60">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={15} />} Confirm receipt
                    </button>
                )}
                {o.status === 'DELIVERED' && <span className="ms-auto text-[12.5px] text-ink-3 inline-flex items-center gap-1.5"><Check size={14} className="text-teal" /> Received — order closed</span>}
            </footer>
        </article>
    );
}

/** Orders & tracking — a card per order with its products, progress and actions. */
export default function OrdersPage() {
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
        || o.items.some((i) => (i.product?.name || i.productNameSnapshot || '').toLowerCase().includes(term))));

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-label="Filter orders" className="flex flex-wrap gap-1.5">
                    {FILTERS.map((x) => (
                        <button key={x.id} type="button" role="radio" aria-checked={filter === x.id} onClick={() => setFilter(x.id)}
                            className={cn('h-8 px-3 rounded-full text-[12.5px] font-semibold ring-1 transition-colors',
                                filter === x.id ? 'bg-heading text-surface ring-heading' : 'ring-line text-ink-2 hover:ring-line-strong')}>
                            {x.label}{orders ? ` (${orders.filter(x.match).length})` : ''}
                        </button>
                    ))}
                </div>
                <label className="ms-auto flex items-center gap-2 h-9 w-full sm:w-[260px] px-3 rounded-lg ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6]">
                    <Search size={15} className="text-ink-4" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order # or product" className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] text-ink placeholder:text-ink-4" />
                </label>
            </div>

            {error && <p role="alert" className="mt-4 flex items-center gap-2 text-[13.5px] text-[#B91C1C]"><AlertTriangle size={15} /> We couldn’t load your orders. Refresh to try again.</p>}

            <div className="mt-4 space-y-4">
                {orders === null ? (
                    Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[190px] rounded-2xl bg-surface-2 animate-pulse" aria-busy="true" />)
                ) : shown.length === 0 ? (
                    <div className="rounded-2xl ring-1 ring-line px-5 py-10 text-center">
                        <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Package size={22} /></span>
                        <p className="mt-3 text-[15px] font-semibold text-ink">{orders.length ? 'No orders match' : 'No orders yet'}</p>
                        <p className="mt-1 text-[13.5px] text-ink-3">{orders.length ? 'Try another filter or search.' : 'When you place an order it will appear here with its progress.'}</p>
                        {!orders.length && <Link href="/categories" className="mt-4 inline-flex h-10 items-center px-4 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">Browse catalog</Link>}
                    </div>
                ) : shown.map((o) => <OrderCard key={o.id} o={o} onChanged={load} />)}
            </div>
        </div>
    );
}
