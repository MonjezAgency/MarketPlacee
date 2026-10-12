'use client';

import * as React from 'react';
import Link from 'next/link';
import { Package, Search, ChevronRight, AlertTriangle, Truck } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { fetchMyOrders, orderStatus, orderRef, supplierCount, TONE_CLASS, type BuyerOrder } from '@/lib/buyer-orders';
import { cn } from '@/lib/utils';

const FILTERS = [
    { id: 'all', label: 'All', match: () => true },
    { id: 'open', label: 'In progress', match: (o: BuyerOrder) => ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED'].includes(o.status) },
    { id: 'delivered', label: 'Delivered', match: (o: BuyerOrder) => o.status === 'DELIVERED' },
    { id: 'cancelled', label: 'Cancelled', match: (o: BuyerOrder) => o.status === 'CANCELLED' },
] as const;

/** Orders & tracking — every order from the server, multi-supplier aware, no invented logistics. */
export default function OrdersPage() {
    const [orders, setOrders] = React.useState<BuyerOrder[] | null>(null);
    const [error, setError] = React.useState(false);
    const [filter, setFilter] = React.useState<(typeof FILTERS)[number]['id']>('all');
    const [q, setQ] = React.useState('');

    React.useEffect(() => { fetchMyOrders(100).then((r) => setOrders(r.data ?? [])).catch(() => { setOrders([]); setError(true); }); }, []);

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

            <div className="mt-4">
                {orders === null ? (
                    <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[76px] rounded-2xl bg-surface-2 animate-pulse" />)}</div>
                ) : shown.length === 0 ? (
                    <div className="rounded-2xl ring-1 ring-line px-5 py-10 text-center">
                        <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Package size={22} /></span>
                        <p className="mt-3 text-[15px] font-semibold text-ink">{orders.length ? 'No orders match' : 'No orders yet'}</p>
                        <p className="mt-1 text-[13.5px] text-ink-3">{orders.length ? 'Try another filter or search.' : 'When you place an order it will appear here with its status.'}</p>
                        {!orders.length && <Link href="/categories" className="mt-4 inline-flex h-10 items-center px-4 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold">Browse catalog</Link>}
                    </div>
                ) : (
                    <ul className="rounded-2xl ring-1 ring-line divide-y divide-line bg-surface overflow-clip">
                        {shown.map((o) => {
                            const st = orderStatus(o);
                            const n = supplierCount(o);
                            const imgs = o.items.map((i) => i.product?.images?.[0]).filter(Boolean).slice(0, 3) as string[];
                            return (
                                <li key={o.id}>
                                    <Link href={`/dashboard/customer/orders/${o.id}`} className="flex items-center gap-3 sm:gap-4 px-4 py-3.5 hover:bg-surface-2 outline-none focus-visible:bg-surface-2">
                                        <span className="hidden sm:flex -space-x-2 shrink-0">
                                            {imgs.length ? imgs.map((src, k) => (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img key={k} src={src} alt="" className="w-10 h-10 rounded-full bg-media ring-2 ring-surface object-contain p-1" />
                                            )) : <span className="w-10 h-10 rounded-full bg-media ring-2 ring-surface flex items-center justify-center text-ink-4"><Package size={16} /></span>}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                                <span className="text-[14px] font-semibold text-ink tabular-nums">{orderRef(o.id)}</span>
                                                <span className="text-[12.5px] text-ink-3">{new Date(o.createdAt).toLocaleDateString()}</span>
                                                <span className={cn('text-[11.5px] font-semibold px-2 py-0.5 rounded-full', TONE_CLASS[st.tone])}>{st.label}</span>
                                            </span>
                                            <span className="mt-0.5 block text-[12.5px] text-ink-3 truncate">
                                                {o.items.length} {o.items.length === 1 ? 'line' : 'lines'}{n > 1 ? ` · ${n} suppliers` : ''}
                                                {o.status === 'SHIPPED' && o.shipment?.trackingNumber ? <> · <Truck size={12} className="inline -mt-0.5" /> {o.shipment.trackingNumber}</> : null}
                                            </span>
                                        </span>
                                        <span className="text-[14.5px] font-semibold text-heading tabular-nums">{formatPrice(o.totalAmount)}</span>
                                        <ChevronRight size={16} className="text-ink-4 shrink-0" />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
