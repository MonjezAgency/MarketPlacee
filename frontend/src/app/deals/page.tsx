'use client';

import * as React from 'react';
import Link from 'next/link';
import { TrendingDown, Ticket, Clock, Copy, Check, ArrowRight, Image as ImageIcon, Tag } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { useCurrency } from '@/contexts/CurrencyContext';

/**
 * Deals = only real, verifiable savings:
 *   1. Active coupon codes created by Ali FMCG admins (/coupons).
 *   2. Genuine price drops — products whose current price is below their
 *      recorded previous price (/products/price-ticker, delta < 0).
 * Nothing else is labelled a "deal"; if neither exists we say so.
 */
interface PriceDrop { id: string; name: string; ean: string | null; brand: string | null; image: string | null; price: number; previousPrice: number; delta: number; changedAt: string }
interface Coupon { id: string; code: string; discountPercent: number; expirationDate?: string; isActive: boolean }

function DropCard({ d }: { d: PriceDrop }) {
    const pct = Math.round((1 - d.price / d.previousPrice) * 100);
    return (
        <Link href={`/products/${d.id}`} className="group flex flex-col h-full rounded-[20px] p-2.5 -m-2.5 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-1 hover:bg-surface hover:shadow-[0_20px_44px_-14px_rgba(14,124,116,0.28),0_0_0_1px_rgba(46,196,182,0.18)]">
            <div className="relative aspect-square rounded-2xl bg-media border border-line overflow-hidden">
                {d.image ? (
                    <img src={d.image} alt={d.name} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                        className="absolute inset-0 m-auto w-auto h-auto max-w-[82%] max-h-[82%] object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03]" />
                ) : <span className="absolute inset-0 flex items-center justify-center text-ink-4"><ImageIcon size={40} strokeWidth={1.25} /></span>}
                {pct > 0 && (
                    <span className="absolute top-3 start-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ECFDF5] dark:bg-emerald-500/15 text-[#047857] text-[11px] font-bold">
                        <TrendingDown size={12} /> {pct}% lower
                    </span>
                )}
            </div>
            <div className="pt-3.5 px-0.5 flex flex-col flex-1">
                {d.brand && <p className="text-[13px] font-bold text-ink truncate">{d.brand}</p>}
                <h3 className="font-sans text-[15px] font-medium leading-snug line-clamp-2 min-h-[2.6em] text-ink-2 group-hover:text-teal transition-colors">{d.name}</h3>
                {d.ean && <p className="mt-1 text-[13px] text-ink-3 tabular-nums">{d.ean}</p>}
                <div className="mt-auto pt-3 flex items-baseline gap-2">
                    <span className="text-[19px] font-bold text-ink tabular-nums">{formatPrice(d.price)}</span>
                    <span className="text-[13px] text-ink-4 line-through tabular-nums">{formatPrice(d.previousPrice)}</span>
                </div>
                <p className="text-[12px] text-ink-3">Price reduced {new Date(d.changedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
            </div>
        </Link>
    );
}

export default function DealsPage() {
    useCurrency(); // re-render on currency change
    const [drops, setDrops] = React.useState<PriceDrop[] | null>(null);
    const [coupons, setCoupons] = React.useState<Coupon[]>([]);
    const [copied, setCopied] = React.useState<string | null>(null);

    React.useEffect(() => {
        Promise.allSettled([
            apiFetch('/products/price-ticker?limit=48').then((r) => (r.ok ? r.json() : [])),
            apiFetch('/coupons').then((r) => (r.ok ? r.json() : [])),
        ]).then(([t, c]) => {
            const list: PriceDrop[] = t.status === 'fulfilled' && Array.isArray(t.value) ? t.value : [];
            // Only true reductions with a valid previous price.
            setDrops(list.filter((d) => d.previousPrice > 0 && d.price > 0 && d.price < d.previousPrice));
            const now = Date.now();
            setCoupons((c.status === 'fulfilled' && Array.isArray(c.value) ? c.value : [])
                .filter((x: Coupon) => x.isActive && x.discountPercent > 0 && (!x.expirationDate || new Date(x.expirationDate).getTime() > now)));
        });
    }, []);

    const copy = async (code: string) => {
        try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 1600); } catch { /* clipboard blocked */ }
    };

    const loading = drops === null;
    const empty = !loading && drops!.length === 0 && coupons.length === 0;

    return (
        <main className="min-h-screen bg-surface text-start">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-20">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">Deals</p>
                <h1 className="font-sans mt-2 text-[30px] sm:text-[38px] font-bold tracking-tight text-heading">Price drops &amp; promo codes</h1>
                <p className="mt-2 text-[15px] text-ink-2 max-w-2xl">Only real savings: products whose price has actually been reduced, and active Ali FMCG promo codes.</p>

                {coupons.length > 0 && (
                    <section className="mt-10">
                        <h2 className="font-sans text-[18px] font-bold text-ink flex items-center gap-2"><Ticket size={18} className="text-teal" /> Promo codes</h2>
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {coupons.map((c) => (
                                <div key={c.id} className="flex items-center justify-between gap-4 rounded-2xl ring-1 ring-line bg-surface-2 p-5">
                                    <div>
                                        <p className="text-[22px] font-bold text-heading tabular-nums">{c.discountPercent}% off</p>
                                        {c.expirationDate && <p className="mt-0.5 text-[12px] text-ink-3 flex items-center gap-1"><Clock size={12} /> Until {new Date(c.expirationDate).toLocaleDateString()}</p>}
                                    </div>
                                    <button type="button" onClick={() => copy(c.code)} className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl bg-surface ring-1 ring-dashed ring-[#2EC4B6] font-mono text-[14px] font-semibold text-teal" aria-label={`Copy code ${c.code}`}>
                                        {c.code} {copied === c.code ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section className="mt-12">
                    <div className="flex items-end justify-between gap-4 mb-6">
                        <h2 className="font-sans text-[18px] font-bold text-ink flex items-center gap-2"><TrendingDown size={18} className="text-teal" /> Recent price drops</h2>
                        <Link href="/categories" className="hidden sm:inline-flex items-center gap-1.5 text-[14px] font-semibold text-heading hover:text-teal">Browse catalog <ArrowRight size={15} /></Link>
                    </div>
                    {loading ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
                            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse"><div className="aspect-square rounded-2xl bg-surface-3" /><div className="h-4 bg-surface-3 rounded mt-4" /></div>)}
                        </div>
                    ) : drops!.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
                            {drops!.map((d) => <DropCard key={d.id} d={d} />)}
                        </div>
                    ) : (
                        <p className="text-[14px] text-ink-3">No recent price drops.</p>
                    )}
                </section>

                {empty && (
                    <div className="mt-10 rounded-3xl ring-1 ring-line px-6 py-14 text-center">
                        <span className="mx-auto w-14 h-14 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Tag size={26} /></span>
                        <h2 className="font-sans mt-5 text-[20px] font-bold text-ink">No active deals right now</h2>
                        <p className="mt-2 text-[15px] text-ink-2 max-w-md mx-auto">Price drops and promo codes appear here as soon as they go live. Subscribe below to hear about them first.</p>
                        <Link href="/categories" className="mt-6 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-cta text-cta-fg text-[14px] font-semibold">Browse catalog <ArrowRight size={15} /></Link>
                    </div>
                )}
            </div>
        </main>
    );
}
