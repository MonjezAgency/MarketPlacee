'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Bookmark, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Download, Eye, Image as ImageIcon, Search, SlidersHorizontal, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/lib/auth';
import { computeCardPrice, getAdminMarkups, DEFAULT_MARKUPS, type Markups } from '@/lib/card-pricing';
import { DEPARTMENTS, getDepartment, matchesDepartment } from '@/lib/departments';
import { Dropdown } from '@/components/ui/Dropdown';
import { Trans } from '@/components/i18n/Trans';
import { cn } from '@/lib/utils';

/**
 * A buyer target = an approved catalog product that buyers are actively
 * watching (saved to their watchlist), from GET /products/targets.
 * Counts are real aggregates; nothing is synthesised client-side.
 * Laid out like the catalog listing (same header, sidebar, toolbar and grid),
 * so Targets reads as one more marketplace tab.
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
const PAGE_SIZES = [24, 48] as const;

async function loadTargets(): Promise<LoadState> {
    try {
        const r = await apiFetch('/products/targets?limit=60');
        if (!r.ok) return { status: 'unavailable' };
        const j = await r.json();
        return { status: 'ready', items: Array.isArray(j) ? j : [] };
    } catch {
        return { status: 'unavailable' };
    }
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = React.useState(defaultOpen);
    return (
        <section className="py-4 border-t border-line first:border-t-0 first:pt-0 last:pb-0">
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center justify-between text-start">
                <h3 className="font-sans text-[14px] font-semibold text-ink">{title}</h3>
                <ChevronDown size={16} className={cn('text-ink-4 transition-transform', open && 'rotate-180')} />
            </button>
            {open && <div className="mt-3">{children}</div>}
        </section>
    );
}

function TargetCard({ t: target, markups, signedIn, isSupplier, watched, onWatch, busy }: {
    t: BuyerTarget; markups: Markups; signedIn: boolean; isSupplier: boolean; watched: boolean; busy: boolean; onWatch: () => void;
}) {
    const { t } = useLanguage();
    const tt = (k: string, v?: Record<string, string | number>) => t('targetsPage', k, v);
    const p = target.product;
    const img = p.images?.[0];
    // Prices are only sent to signed-in accounts (same rule as the catalog).
    const hasPrice = typeof p.price === 'number' && p.price > 0;
    const price = hasPrice ? computeCardPrice(p as any, markups, false) : null;
    return (
        <article className="group relative flex flex-col h-full rounded-[20px] p-2.5 -m-2.5 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-1 hover:bg-surface hover:shadow-[0_20px_44px_-14px_rgba(14,124,116,0.28),0_0_0_1px_rgba(46,196,182,0.18)] focus-within:bg-surface motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <div className="relative">
                <Link href={`/products/${p.id}`} className="relative block aspect-square rounded-2xl bg-media border border-line overflow-hidden">
                    {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt={p.name} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                            className="absolute inset-0 m-auto w-auto h-auto max-w-[82%] max-h-[82%] object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
                    ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-ink-4"><ImageIcon size={40} strokeWidth={1.25} /></span>
                    )}
                </Link>
                <span className="absolute top-3 start-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-soft text-teal text-[11px] font-semibold pointer-events-none">
                    <Eye size={11} /> {tt('watching', { count: target.buyersWatching })}
                </span>
                {signedIn && (
                    <button type="button" onClick={onWatch} disabled={busy} aria-pressed={watched}
                        aria-label={watched ? tt('unwatchAria', { name: p.name }) : tt('watchAria', { name: p.name })} title={watched ? tt('unwatch') : tt('watch')}
                        className={cn('absolute top-2.5 end-2.5 w-8 h-8 rounded-lg flex items-center justify-center bg-surface/90 ring-1 ring-line transition-colors disabled:opacity-50', watched ? 'text-[#E5484D]' : 'text-ink-3 hover:text-ink')}>
                        <Bookmark size={16} fill={watched ? 'currentColor' : 'none'} />
                    </button>
                )}
            </div>
            <div className="flex flex-col flex-1 pt-3.5 px-0.5">
                {p.brand && <p className="text-[13px] font-bold text-ink truncate"><bdi>{p.brand}</bdi></p>}
                <Link href={`/products/${p.id}`}>
                    <h3 className="font-sans text-[15px] font-medium leading-snug line-clamp-2 min-h-[2.6em] text-ink-2 hover:text-teal transition-colors"><bdi>{p.name}</bdi></h3>
                </Link>
                <p className="mt-1 text-[13px] text-ink-3 tabular-nums tracking-wide min-h-[1.5em]">{p.ean ? <bdi dir="ltr">{p.ean}</bdi> : null}</p>
                <div className="mt-auto pt-3 flex items-center justify-between gap-2 text-[13px]">
                    <span className="text-ink-3">
                        {price !== null ? <Trans text={tt('fromPrice', { price: formatPrice(price) })} tags={{ b: (c) => <span className="font-bold text-ink tabular-nums">{c}</span> }} /> : isSupplier ? tt('supplierNoPrice') : tt('signInForPrice')}
                    </span>
                    <span className="text-ink-3 tabular-nums">{tt('offers', { count: target.approvedOffers })}</span>
                </div>
                <Link href={`/contact?product=${encodeURIComponent(p.id)}`} className="mt-3 inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold transition-colors">
                    {tt('offerToSupply')} <ArrowRight size={14} className="rtl:rotate-180" />
                </Link>
            </div>
        </article>
    );
}

export default function TargetsClient() {
    const { t, fmt } = useLanguage();
    const tt = (k: string, v?: Record<string, string | number>) => t('targetsPage', k, v);
    const { user } = useAuth();
    const signedIn = !!user;
    // Supplier accounts get demand data only; the API sends them no buyer prices.
    const isSupplier = String((user as any)?.role || '').toUpperCase() === 'SUPPLIER';
    const [state, setState] = React.useState<LoadState>({ status: 'loading' });
    const [markups, setMarkups] = React.useState<Markups>(DEFAULT_MARKUPS);
    useCurrency(); // re-render prices when the display currency changes
    const [dept, setDept] = React.useState<string | null>(null);
    const [query, setQuery] = React.useState('');
    const [brands, setBrands] = React.useState<string[]>([]);
    const [brandQuery, setBrandQuery] = React.useState('');
    const [watchOnly, setWatchOnly] = React.useState(false);
    const [watched, setWatched] = React.useState<Set<string>>(new Set());
    const [watchBusy, setWatchBusy] = React.useState<string | null>(null);
    const [size, setSize] = React.useState<number>(24);
    const [page, setPage] = React.useState(1);
    const [showFilters, setShowFilters] = React.useState(false);

    React.useEffect(() => { loadTargets().then(setState); getAdminMarkups().then(setMarkups); }, [signedIn]);
    // The signed-in account's own watchlist (the same list Targets is counted from).
    React.useEffect(() => {
        if (!signedIn) { setWatched(new Set()); return; }
        apiFetch('/wishlist', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then((rows: any[]) => setWatched(new Set((rows || []).map((r) => r.id)))).catch(() => {});
    }, [signedIn]);
    React.useEffect(() => { setPage(1); }, [dept, query, brands, watchOnly, size]);

    const toggleWatch = async (id: string) => {
        const on = watched.has(id);
        setWatchBusy(id);
        try {
            const r = await apiFetch(`/wishlist/${encodeURIComponent(id)}`, { method: on ? 'DELETE' : 'POST' });
            if (r.ok) { const n = new Set(watched); if (on) n.delete(id); else n.add(id); setWatched(n); }
        } finally { setWatchBusy(null); }
    };

    const targets = state.status === 'ready' ? state.items : state.status === 'unavailable' ? [] : null;
    const department = getDepartment(dept);
    const base = (targets || []).filter((x) =>
        (!department || matchesDepartment(x.product.category, department)) &&
        (!query.trim() || `${x.product.name} ${x.product.brand ?? ''} ${x.product.ean ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())) &&
        (!watchOnly || watched.has(x.product.id)));
    const brandCounts = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const x of base) if (x.product.brand) m.set(x.product.brand, (m.get(x.product.brand) || 0) + 1);
        return m;
    }, [base]);
    const brandOptions = Array.from(new Set([...brands, ...Array.from(brandCounts.keys())])).sort((a, b) => a.localeCompare(b)).filter((b) => !brandQuery.trim() || b.toLowerCase().includes(brandQuery.trim().toLowerCase()));
    const visible = base.filter((x) => !brands.length || (x.product.brand && brands.includes(x.product.brand)));
    const pages = Math.max(1, Math.ceil(visible.length / size));
    const shown = visible.slice((page - 1) * size, page * size);
    const filtersOn = !!department || !!query.trim() || brands.length > 0 || watchOnly;
    const reset = () => { setDept(null); setQuery(''); setBrands([]); setWatchOnly(false); };

    const download = () => {
        const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const header = [tt('csvProduct'), tt('csvBrand'), tt('csvEan'), tt('csvCategory'), tt('csvWatching'), tt('csvOffers'), tt('csvLink')];
        const rows = visible.map((x) => [x.product.name, x.product.brand, x.product.ean, x.product.category, x.buyersWatching, x.approvedOffers, `${location.origin}/products/${x.product.id}`].map(esc).join(','));
        const blob = new Blob(['﻿' + [header.map(esc).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `atlantis-targets-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

    const sidebar = (
        <div>
            <div className="pb-4">
                <label htmlFor="targets-search" className="sr-only">{tt('searchLabel')}</label>
                <div className="flex items-center h-9 rounded-lg bg-surface ring-1 ring-line hover:ring-line-strong focus-within:ring-2 focus-within:ring-[#2EC4B6] transition-shadow">
                    <Search size={15} className="ms-3 text-ink-4 shrink-0" />
                    <input id="targets-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt('searchPlaceholder')}
                        className="flex-1 min-w-0 h-full px-2 bg-transparent outline-none text-[13px] text-ink placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden" />
                    {query && <button type="button" onClick={() => setQuery('')} aria-label={tt('clearSearch')} className="me-2 w-7 h-7 rounded-lg flex items-center justify-center text-ink-4 hover:text-ink"><X size={14} /></button>}
                </div>
            </div>
            <div className="rounded-2xl bg-surface ring-1 ring-line px-3.5 py-4">
                {signedIn && (
                    <Section title={tt('watchlist')}>
                        <label className="flex items-center gap-3 px-1.5 cursor-pointer">
                            <button type="button" role="switch" aria-checked={watchOnly} onClick={() => setWatchOnly(!watchOnly)}
                                className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', watchOnly ? 'bg-teal' : 'bg-surface-3 ring-1 ring-line')}>
                                <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[inset-inline-start]', watchOnly ? 'start-[18px]' : 'start-0.5')} />
                            </button>
                            <span className="text-[14px] text-ink-2">{tt('watchlistOnly')}</span>
                        </label>
                    </Section>
                )}
                <Section title={tt('department')}>
                    <ul className="flex flex-col gap-0.5">
                        {[{ slug: null as string | null }, ...DEPARTMENTS.map((d) => ({ slug: d.slug as string | null }))].map((d) => (
                            <li key={d.slug ?? 'all'}>
                                <button type="button" onClick={() => setDept(d.slug)} aria-pressed={dept === d.slug}
                                    className={cn('w-full px-2 py-1.5 rounded-lg text-[13.5px] text-start', dept === d.slug ? 'bg-teal-soft text-teal font-semibold' : 'text-ink-2 hover:bg-surface-2')}>
                                    {d.slug ? (t('departments', d.slug) || getDepartment(d.slug)?.label) : tt('allDepartments')}
                                </button>
                            </li>
                        ))}
                    </ul>
                </Section>
                <Section title={tt('brand')}>
                    <div className="flex items-center h-9 rounded-lg ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6] mb-2">
                        <Search size={14} className="ms-2.5 text-ink-4" />
                        <input value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} placeholder={tt('findBrand')} aria-label={tt('findBrand')} className="flex-1 min-w-0 h-full px-2 bg-transparent outline-none text-[13px]" />
                    </div>
                    <div className="max-h-64 overflow-y-auto pe-1 space-y-0.5">
                        {brandOptions.map((b) => (
                            <label key={b} className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer">
                                <input type="checkbox" checked={brands.includes(b)} onChange={() => setBrands(brands.includes(b) ? brands.filter((x) => x !== b) : [...brands, b])} className="w-4 h-4 rounded accent-[#0B1F3A]" />
                                <span className={cn('flex-1 text-[14px]', brands.includes(b) ? 'text-ink font-semibold' : 'text-ink-2')}><bdi>{b}</bdi></span>
                                <span className="text-[12px] text-ink-4 tabular-nums">{fmt.number(brandCounts.get(b) || 0)}</span>
                            </label>
                        ))}
                        {brandOptions.length === 0 && <p className="text-[13px] text-ink-4 px-1.5">{tt('noBrand')}</p>}
                    </div>
                </Section>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-surface pb-20 text-start" data-no-translate>
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="pt-4 pb-1">
                    <nav aria-label={tt('breadcrumbAria')} className="flex items-center gap-1.5 text-[13px] text-ink-3">
                        <Link href="/" className="hover:text-heading">{tt('home')}</Link>
                        <ChevronRight size={13} className="rtl:rotate-180" />
                        <span className="text-ink font-medium">{tt('title')}</span>
                    </nav>
                    <h1 className="font-sans mt-1.5 text-[20px] sm:text-[22px] font-bold tracking-tight text-heading">{tt('title')}</h1>
                    <p className="mt-0.5 text-[13.5px] text-ink-3 max-w-2xl">{tt('lead')}</p>
                </div>

                <div className="flex gap-7 xl:gap-8 pt-3">
                    <aside className="hidden lg:block w-[240px] shrink-0">
                        <div className="sticky top-[108px] max-h-[calc(100vh-124px)] overflow-y-auto scrollbar-hide pb-6">{sidebar}</div>
                    </aside>

                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3 min-h-9">
                            <p className="text-[13px] text-ink-3 me-auto" aria-live="polite">
                                {targets === null ? tt('loading') : <><span className="font-semibold text-ink-2">{tt('asking')}</span> · <span className="tabular-nums">{tt('productsCount', { count: visible.length })}</span></>}
                            </p>
                            <button type="button" onClick={() => setShowFilters(true)} className="lg:hidden inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md ring-1 ring-line text-[12.5px] font-semibold text-ink">
                                <SlidersHorizontal size={15} /> {tt('filters')}
                            </button>
                            {signedIn && (
                                <button type="button" onClick={download} disabled={!visible.length} className="hidden sm:inline-flex items-center gap-2 h-8 px-2 rounded-md text-[12.5px] font-medium text-ink-2 hover:text-ink disabled:opacity-40">
                                    <Download size={15} /> {tt('download')}
                                </button>
                            )}
                            <Dropdown label={tt('show')} suffix={tt('perPage')} value={String(size)} options={PAGE_SIZES.map((n) => ({ value: String(n), label: fmt.number(n) }))} onChange={(v) => setSize(Number(v))} className="hidden sm:inline-flex" />
                        </div>

                        {filtersOn && (
                            <div className="flex flex-wrap items-center gap-2 pb-5">
                                {department && <button type="button" onClick={() => setDept(null)} className="inline-flex items-center gap-1.5 h-8 ps-3 pe-2 rounded-full bg-teal-soft text-teal text-[13px] font-medium">{t('departments', department.slug) || department.label} <X size={13} /></button>}
                                {brands.map((b) => <button key={b} type="button" onClick={() => setBrands(brands.filter((x) => x !== b))} className="inline-flex items-center gap-1.5 h-8 ps-3 pe-2 rounded-full bg-teal-soft text-teal text-[13px] font-medium"><bdi>{b}</bdi> <X size={13} /></button>)}
                                {watchOnly && <button type="button" onClick={() => setWatchOnly(false)} className="inline-flex items-center gap-1.5 h-8 ps-3 pe-2 rounded-full bg-teal-soft text-teal text-[13px] font-medium">{tt('watchlistOnly')} <X size={13} /></button>}
                                <button type="button" onClick={reset} className="inline-flex items-center h-8 px-2 text-[13px] font-semibold text-ink-3 hover:text-ink">{tt('clearAll')}</button>
                            </div>
                        )}

                        {targets === null ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="animate-pulse">
                                        <div className="aspect-square rounded-2xl bg-surface-3" />
                                        <div className="h-3 w-24 bg-surface-3 rounded mt-4" />
                                        <div className="h-4 w-full bg-surface-3 rounded mt-2.5" />
                                    </div>
                                ))}
                            </div>
                        ) : shown.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                                {shown.map((x) => <TargetCard key={x.product.id} t={x} markups={markups} signedIn={signedIn} isSupplier={isSupplier} watched={watched.has(x.product.id)} busy={watchBusy === x.product.id} onWatch={() => toggleWatch(x.product.id)} />)}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 px-6 text-center rounded-2xl ring-1 ring-line">
                                <span className="w-14 h-14 rounded-2xl bg-teal-soft flex items-center justify-center mb-5"><ClipboardList size={26} className="text-teal" /></span>
                                <h2 className="font-sans text-[18px] font-bold text-ink">{filtersOn ? tt('emptyFiltered') : tt('emptyTitle')}</h2>
                                <p className="text-[14px] text-ink-3 max-w-md mt-1.5 mb-6">{state.status === 'unavailable' ? tt('emptyUnavailable') : tt('emptyBody')}</p>
                                <div className="flex flex-wrap justify-center gap-3">
                                    {filtersOn && <button type="button" onClick={reset} className="inline-flex items-center h-10 px-5 rounded-xl ring-1 ring-line text-[13px] font-semibold text-ink">{tt('resetFilters')}</button>}
                                    <Link href="/contact" className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-cta text-cta-fg text-[13px] font-semibold">{tt('tellUs')} <ArrowRight size={14} className="rtl:rotate-180" /></Link>
                                    <Link href="/requests" className="inline-flex items-center h-10 px-5 rounded-xl ring-1 ring-line text-[13px] font-semibold text-ink">{tt('postRequest')}</Link>
                                </div>
                            </div>
                        )}

                        {visible.length > 0 && (
                            <nav aria-label={tt('paginationAria')} className="mt-8 pt-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3">
                                <p className="text-[13px] text-ink-3 tabular-nums">{tt('showing', { from: fmt.number((page - 1) * size + 1), to: fmt.number(Math.min(visible.length, page * size)), count: visible.length })}</p>
                                {pages > 1 && (
                                    <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-[12.5px] font-semibold text-ink hover:bg-surface-3 disabled:opacity-35"><ChevronLeft size={16} className="rtl:rotate-180" /> {tt('prev')}</button>
                                        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                                            <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}
                                                className={cn('min-w-8 h-8 px-2 rounded-lg text-[12.5px] font-semibold tabular-nums', n === page ? 'bg-cta text-cta-fg' : 'text-ink-2 hover:bg-surface-3')}>{fmt.number(n)}</button>
                                        ))}
                                        <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-[12.5px] font-semibold text-ink hover:bg-surface-3 disabled:opacity-35">{tt('next')} <ChevronRight size={16} className="rtl:rotate-180" /></button>
                                    </div>
                                )}
                            </nav>
                        )}

                        <p className="mt-6 text-[12.5px] text-ink-4 max-w-3xl">{tt('howNote')}</p>
                    </div>
                </div>
            </div>

            {showFilters && (
                <div className="fixed inset-0 z-[120] lg:hidden" role="dialog" aria-modal="true" aria-label={tt('filters')}>
                    <button className="absolute inset-0 bg-cta/30" aria-label={tt('closeFilters')} onClick={() => setShowFilters(false)} />
                    <div className="absolute inset-y-0 end-0 w-[88%] max-w-sm bg-surface shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between px-5 h-14 border-b border-line">
                            <h2 className="font-sans text-[16px] font-bold text-ink">{tt('filters')}</h2>
                            <button onClick={() => setShowFilters(false)} aria-label={tt('closeFilters')} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-surface-3"><X size={18} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5">{sidebar}</div>
                        <div className="p-4 border-t border-line flex gap-3">
                            <button onClick={reset} className="flex-1 h-11 rounded-xl ring-1 ring-line text-[14px] font-semibold">{tt('resetFilters')}</button>
                            <button onClick={() => setShowFilters(false)} className="flex-1 h-11 rounded-xl bg-cta text-cta-fg text-[14px] font-semibold">{tt('showResults', { count: visible.length })}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
