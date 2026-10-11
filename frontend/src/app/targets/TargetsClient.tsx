'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, ShieldCheck, Send, Target as TargetIcon, Search, Eye, Image as ImageIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { useCurrency } from '@/contexts/CurrencyContext';
import { computeCardPrice, getAdminMarkups, DEFAULT_MARKUPS, type Markups } from '@/lib/card-pricing';
import { DEPARTMENTS, getDepartment, matchesDepartment } from '@/lib/departments';
import { cn } from '@/lib/utils';

/**
 * A buyer target = an approved catalog product that buyers are actively
 * watching (saved to their watchlist), from GET /products/targets.
 * Counts are real aggregates; nothing is synthesised client-side.
 */
export interface BuyerTarget {
    product: {
        id: string; name: string; brand?: string | null; ean?: string | null; category?: string | null;
        images?: string[]; price: number; basePrice?: number | null;
        unitsPerCase?: number | null; casesPerPallet?: number | null; unitsPerPallet?: number | null; palletsPerShipment?: number | null;
    };
    buyersWatching: number;
    approvedOffers: number;
}

type LoadState = { status: 'loading' } | { status: 'ready'; items: BuyerTarget[] } | { status: 'unavailable' };

async function loadTargets(): Promise<LoadState> {
    try {
        const r = await apiFetch('/products/targets?limit=48');
        if (r.status === 404) return { status: 'unavailable' }; // endpoint not deployed yet
        if (!r.ok) return { status: 'unavailable' };
        const j = await r.json();
        return { status: 'ready', items: Array.isArray(j) ? j : [] };
    } catch {
        return { status: 'unavailable' };
    }
}

function TargetCard({ t, markups }: { t: BuyerTarget; markups: Markups }) {
    const p = t.product;
    const img = p.images?.[0];
    const price = computeCardPrice(p as any, markups, false);
    return (
        <article className="group relative flex flex-col h-full rounded-[20px] p-2.5 -m-2.5 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-1 hover:bg-surface hover:shadow-[0_20px_44px_-14px_rgba(14,124,116,0.28),0_0_0_1px_rgba(46,196,182,0.18)] focus-within:bg-surface">
            <Link href={`/products/${p.id}`} className="relative block aspect-square rounded-2xl bg-media border border-line overflow-hidden">
                {img ? (
                    <img src={img} alt={p.name} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                        className="absolute inset-0 m-auto w-auto h-auto max-w-[82%] max-h-[82%] object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03]" />
                ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-ink-4"><ImageIcon size={40} strokeWidth={1.25} /></span>
                )}
                <span className="absolute top-3 start-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-soft text-teal text-[11px] font-semibold">
                    <Eye size={11} /> {t.buyersWatching} {t.buyersWatching === 1 ? 'buyer' : 'buyers'} watching
                </span>
            </Link>
            <div className="flex flex-col flex-1 pt-3.5 px-0.5">
                {p.brand && <p className="text-[13px] font-bold text-ink truncate">{p.brand}</p>}
                <Link href={`/products/${p.id}`}>
                    <h3 className="font-sans text-[15px] font-medium leading-snug line-clamp-2 min-h-[2.6em] text-ink-2 hover:text-teal transition-colors">{p.name}</h3>
                </Link>
                {p.ean && <p className="mt-1 text-[13px] text-ink-3 tabular-nums tracking-wide">{p.ean}</p>}
                <div className="mt-auto pt-3 flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-ink-3">
                        From <span className="font-bold text-ink tabular-nums">{formatPrice(price)}</span> / case
                    </span>
                    <span className="text-ink-3 tabular-nums">{t.approvedOffers} {t.approvedOffers === 1 ? 'offer' : 'offers'}</span>
                </div>
                <Link href={`/contact?product=${encodeURIComponent(p.id)}`} className="mt-3 inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold transition-colors">
                    Offer to supply <ArrowRight size={14} />
                </Link>
            </div>
        </article>
    );
}

export default function TargetsClient() {
    const [state, setState] = React.useState<LoadState>({ status: 'loading' });
    const [markups, setMarkups] = React.useState<Markups>(DEFAULT_MARKUPS);
    useCurrency(); // re-render prices when the display currency changes
    const [dept, setDept] = React.useState<string | null>(null);
    const [query, setQuery] = React.useState('');

    React.useEffect(() => { loadTargets().then(setState); getAdminMarkups().then(setMarkups); }, []);
    const targets = state.status === 'ready' ? state.items : state.status === 'unavailable' ? [] : null;

    const department = getDepartment(dept);
    const visible = (targets || []).filter((t) =>
        (!department || matchesDepartment(t.product.category, department)) &&
        (!query.trim() || `${t.product.name} ${t.product.brand ?? ''} ${t.product.ean ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())));

    return (
        <div className="min-h-screen bg-background text-start">
            {/* Header */}
            <section className="bg-surface border-b border-line">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
                    <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">
                        <TargetIcon size={14} /> Buyer targets
                    </p>
                    <h1 className="font-sans mt-3 text-[30px] sm:text-[40px] font-bold tracking-tight text-heading leading-tight max-w-2xl">
                        What FMCG buyers are looking for
                    </h1>
                    <p className="mt-3 text-[16px] text-ink-2 max-w-2xl leading-relaxed">
                        Products buyers are actively watching on Atlantis, ranked by demand. Suppliers can see what&apos;s wanted and offer to supply it.
                    </p>

                    <div className="mt-8 flex flex-col lg:flex-row lg:items-center gap-4">
                        <div className="flex items-center h-11 w-full lg:max-w-sm rounded-xl bg-surface-3 focus-within:bg-surface focus-within:ring-2 focus-within:ring-[#2EC4B6]/40 transition-all">
                            <Search size={16} className="ms-3.5 text-ink-3" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search product, brand or EAN"
                                aria-label="Search targets"
                                className="flex-1 min-w-0 h-full px-3 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-4"
                            />
                        </div>
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
                            {[{ slug: null as string | null, label: 'All' }, ...DEPARTMENTS.map((d) => ({ slug: d.slug as string | null, label: d.label }))].map((d) => (
                                <button
                                    key={d.label}
                                    onClick={() => setDept(d.slug)}
                                    className={cn(
                                        'h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors',
                                        dept === d.slug ? 'bg-cta text-cta-fg' : 'bg-surface ring-1 ring-line text-ink-2 hover:ring-ink hover:text-ink'
                                    )}
                                >
                                    {d.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Board */}
            <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
                {targets === null ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="animate-pulse">
                                <div className="aspect-square rounded-2xl bg-surface-3" />
                                <div className="h-3 w-24 bg-surface-3 rounded mt-4" />
                                <div className="h-4 w-full bg-surface-3 rounded mt-2.5" />
                            </div>
                        ))}
                    </div>
                ) : visible.length > 0 ? (
                    <>
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-sans text-[16px] font-semibold text-ink-2">What buyers are asking for</h2>
                            <span className="text-[13px] text-ink-3 tabular-nums">{visible.length} products</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-10">
                            {visible.map((t) => <TargetCard key={t.product.id} t={t} markups={markups} />)}
                        </div>
                    </>
                ) : (
                    <div className="rounded-3xl bg-surface ring-1 ring-line px-6 py-14 sm:py-16 text-center">
                        <span className="mx-auto w-14 h-14 rounded-2xl bg-teal-soft text-teal flex items-center justify-center">
                            <ClipboardList size={26} />
                        </span>
                        <h2 className="font-sans mt-5 text-[20px] font-bold text-ink">
                            No open {department ? department.label.toLowerCase() : 'buyer'} targets right now
                        </h2>
                        <p className="mt-2 text-[15px] text-ink-2 max-w-lg mx-auto leading-relaxed">
                            {state.status === 'unavailable'
                                ? 'Buyer demand data isn\u2019t available right now. Targets show the products buyers are actively watching, ranked by demand.'
                                : 'Targets show the products buyers are actively watching, ranked by demand. None match your filters yet.'}
                        </p>
                        <div className="mt-7 flex flex-wrap justify-center gap-3">
                            <Link href="/contact" className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold transition-colors">
                                Tell us what you supply <ArrowRight size={15} />
                            </Link>
                            <Link href="/requests" className="inline-flex items-center h-11 px-5 rounded-xl ring-1 ring-line bg-surface text-[14px] font-semibold text-ink hover:ring-ink transition-colors">
                                Buying? Post a request
                            </Link>
                        </div>
                    </div>
                )}

                {/* How it works */}
                <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        { icon: Eye, t: 'Buyers signal demand', d: 'Buyers save the products they want to source; Targets ranks them by how many buyers are watching.' },
                        { icon: ShieldCheck, t: 'Atlantis reviews offers', d: 'Supplier offers are checked by our team before they go live on a product.' },
                        { icon: Send, t: 'Suppliers respond', d: 'Offer stock for a target product and our desk follows up on terms and volumes.' },
                    ].map((s) => (
                        <div key={s.t}>
                            <span className="w-11 h-11 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><s.icon size={20} /></span>
                            <h3 className="font-sans mt-4 text-[16px] font-bold text-ink">{s.t}</h3>
                            <p className="mt-1.5 text-[14px] text-ink-3 leading-relaxed">{s.d}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
