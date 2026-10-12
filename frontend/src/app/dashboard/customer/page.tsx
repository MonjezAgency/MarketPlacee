'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Package, RotateCcw, Sparkles, AlertTriangle } from 'lucide-react';
import ProductCard from '@/components/product/ProductCard';
import { ProductRail } from '@/components/product/ProductRail';
import { fetchProductPage } from '@/lib/api';
import type { Product } from '@/lib/types';
import { formatPrice } from '@/lib/currency';
import { fetchMyOrders, purchasedProducts, orderStatus, orderRef, supplierCount, TONE_CLASS, type BuyerOrder } from '@/lib/buyer-orders';
import { cn } from '@/lib/utils';

/** Overview: what you've bought (from real orders), what's new to you, and recent orders. */
export default function BuyerOverview() {
    const [orders, setOrders] = React.useState<BuyerOrder[] | null>(null);
    const [ordersErr, setOrdersErr] = React.useState(false);
    const [catalog, setCatalog] = React.useState<Product[] | null>(null);

    React.useEffect(() => {
        fetchMyOrders(100).then((r) => setOrders(r.data ?? [])).catch(() => { setOrders([]); setOrdersErr(true); });
        fetchProductPage({ limit: 40, sort: 'newest' }).then((r) => setCatalog(r.items)).catch(() => setCatalog([]));
    }, []);

    const bought = React.useMemo(() => purchasedProducts(orders ?? []), [orders]);
    const boughtIds = React.useMemo(() => new Set(bought.map((b) => b.productId)), [bought]);
    const byId = React.useMemo(() => new Map((catalog ?? []).map((p) => [p.id, p])), [catalog]);
    // "Bought before" uses the live catalog record when it is still listed, so prices are current.
    const boughtLive = bought.map((b) => byId.get(b.productId)).filter(Boolean) as Product[];
    const frequent = bought.filter((b) => b.orders >= 2);
    const discover = (catalog ?? []).filter((p) => !boughtIds.has(p.id)).slice(0, 16);
    const recent = (orders ?? []).slice(0, 4);

    return (
        <div className="space-y-10">
            {ordersErr && (
                <p role="alert" className="flex items-center gap-2 text-[13.5px] text-[#B91C1C]"><AlertTriangle size={15} /> We couldn’t load your orders. Refresh to try again.</p>
            )}

            {/* Bought before */}
            <section aria-labelledby="ov-bought">
                <div className="flex items-end justify-between gap-3 mb-3">
                    <div>
                        <h2 id="ov-bought" className="text-[17px] font-semibold text-heading flex items-center gap-2"><RotateCcw size={17} className="text-teal" /> Bought before</h2>
                        <p className="text-[13px] text-ink-3">From your past orders. Prices shown are today’s.</p>
                    </div>
                    {bought.length > 0 && <Link href="/dashboard/customer/lists" className="text-[13px] font-semibold text-teal hover:underline">Save to a list</Link>}
                </div>
                {orders === null || catalog === null ? <SkeletonRow /> : bought.length === 0 ? (
                    <Empty icon={<Package size={20} />} title="No orders yet" text="Products you order will appear here so you can buy them again in a click." action={<Link href="/categories" className="text-[13.5px] font-semibold text-teal hover:underline">Browse the catalog</Link>} />
                ) : (
                    <>
                        {frequent.length > 0 && (
                            <p className="mb-3 text-[13px] text-ink-2">
                                <span className="font-semibold text-ink">Ordered most often:</span>{' '}
                                {frequent.slice(0, 4).map((f, i) => <React.Fragment key={f.productId}>{i > 0 && ', '}<Link href={`/products/${f.productId}`} className="hover:text-teal">{f.name}</Link> <span className="text-ink-4">({f.orders} orders)</span></React.Fragment>)}
                            </p>
                        )}
                        {boughtLive.length > 0 ? (
                            <ProductRail title="" arrows={boughtLive.length > 4}>
                                {boughtLive.map((p) => <div key={p.id} className="shrink-0 w-[220px] snap-start"><ProductCard product={p} /></div>)}
                            </ProductRail>
                        ) : null}
                        {bought.length > boughtLive.length && (
                            <ul className="mt-3 flex flex-wrap gap-2">
                                {bought.filter((b) => !byId.has(b.productId)).slice(0, 12).map((b) => (
                                    <li key={b.productId}><Link href={`/products/${b.productId}`} className="inline-flex h-8 items-center px-3 rounded-full ring-1 ring-line text-[12.5px] text-ink-2 hover:ring-line-strong">{b.name}</Link></li>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </section>

            {/* New to you */}
            <section aria-labelledby="ov-new">
                <div className="mb-3">
                    <h2 id="ov-new" className="text-[17px] font-semibold text-heading flex items-center gap-2"><Sparkles size={17} className="text-teal" /> New to you</h2>
                    <p className="text-[13px] text-ink-3">Recently listed products you haven’t ordered yet.</p>
                </div>
                {catalog === null ? <SkeletonRow /> : discover.length === 0 ? (
                    <Empty icon={<Sparkles size={20} />} title="You’ve seen it all" text="Nothing new since your last order." action={<Link href="/categories?sort=newest" className="text-[13.5px] font-semibold text-teal hover:underline">See new offers</Link>} />
                ) : (
                    <ProductRail title="" arrows viewAll={{ href: '/categories?sort=newest', label: 'See all new offers' }}>
                        {discover.map((p) => <div key={p.id} className="shrink-0 w-[220px] snap-start"><ProductCard product={p} /></div>)}
                    </ProductRail>
                )}
            </section>

            {/* Recent orders */}
            <section aria-labelledby="ov-orders">
                <div className="flex items-end justify-between gap-3 mb-3">
                    <h2 id="ov-orders" className="text-[17px] font-semibold text-heading">Recent orders</h2>
                    <Link href="/dashboard/customer/orders" className="text-[13px] font-semibold text-teal hover:underline inline-flex items-center gap-1">All orders <ArrowRight size={14} /></Link>
                </div>
                {orders === null ? <SkeletonRow tall={false} /> : recent.length === 0 ? (
                    <p className="text-[13.5px] text-ink-3">No orders yet.</p>
                ) : (
                    <ul className="rounded-2xl ring-1 ring-line divide-y divide-line bg-surface">
                        {recent.map((o) => {
                            const st = orderStatus(o);
                            const n = supplierCount(o);
                            return (
                                <li key={o.id}>
                                    <Link href={`/dashboard/customer/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-surface-2">
                                        <span className="text-[14px] font-semibold text-ink tabular-nums">{orderRef(o.id)}</span>
                                        <span className="text-[13px] text-ink-3">{new Date(o.createdAt).toLocaleDateString()}</span>
                                        <span className="text-[13px] text-ink-3">{o.items.length} {o.items.length === 1 ? 'line' : 'lines'}{n > 1 ? ` · ${n} suppliers` : ''}</span>
                                        <span className={cn('ms-auto text-[12px] font-semibold px-2.5 py-1 rounded-full', TONE_CLASS[st.tone])}>{st.label}</span>
                                        <span className="w-full sm:w-auto text-[14px] font-semibold text-heading tabular-nums">{formatPrice(o.totalAmount)}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}

function Empty({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
    return (
        <div className="rounded-2xl ring-1 ring-line bg-surface-2/50 px-5 py-6 flex items-start gap-3">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-teal-soft text-teal flex items-center justify-center">{icon}</span>
            <div>
                <p className="text-[14.5px] font-semibold text-ink">{title}</p>
                <p className="text-[13.5px] text-ink-3">{text}</p>
                {action && <div className="mt-2">{action}</div>}
            </div>
        </div>
    );
}

function SkeletonRow({ tall = true }: { tall?: boolean }) {
    return (
        <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className={cn('shrink-0 w-[220px] rounded-2xl bg-surface-2 animate-pulse', tall ? 'h-[300px]' : 'h-14 w-full')} />)}
        </div>
    );
}
