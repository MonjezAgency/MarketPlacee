'use client';

import * as React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
    SlidersHorizontal, X, ChevronRight, ChevronLeft, ChevronDown, Search, Download, PackageSearch, ArrowRight,
    RotateCcw,
} from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown';
import ProductCard from '@/components/product/ProductCard';
import SponsoredProductCard from '@/components/ads/SponsoredProductCard';
import SponsoredBrandBanner from '@/components/ads/SponsoredBrandBanner';
import { CATEGORIES_LIST } from '@/lib/products';
import { fetchProductPage, apiFetch } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { convertToBase, convertFromBase, formatPrice } from '@/lib/currency';
import { DEPARTMENTS, getDepartment, matchesDepartment } from '@/lib/departments';
import { getAdminMarkups, computeCardPrice } from '@/lib/card-pricing';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [20, 40, 60] as const;
/** Whether the backend pages department/multi-brand filters itself (null = unknown). */
let serverCaps: boolean | null = null;
// Relevance ranks search matches server-side (exact EAN, name, brand); with no
// search term it is the default catalog order (newest first).
const SORTS = [
    { id: 'relevance', label: 'sortRelevance', api: 'relevance' },
    { id: 'newest', label: 'sortNewest', api: 'newest' },
    { id: 'price-low', label: 'sortPriceLow', api: 'price_asc' },
    { id: 'price-high', label: 'sortPriceHigh', api: 'price_desc' },
    { id: 'name', label: 'sortName', api: 'name_asc' },
] as const;
type SortId = (typeof SORTS)[number]['id'];

/** "New offers" date windows (server-side, UTC day/week/month boundaries). */
const LISTED = [
    { id: '', label: 'listedAll', chip: '', empty: '' },
    { id: 'today', label: 'listedToday', chip: 'chipToday', empty: 'emptyToday' },
    { id: 'week', label: 'listedWeek', chip: 'chipWeek', empty: 'emptyWeek' },
    { id: 'month', label: 'listedMonth', chip: 'chipMonth', empty: 'emptyMonth' },
] as const;
type ListedId = (typeof LISTED)[number]['id'];

/** All listing state lives in the URL (shareable, back-button friendly). */
function useListingParams() {
    const sp = useSearchParams();
    const list = (k: string) => (sp.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
    const raw = sp.get('sort');
    const sort = (SORTS.some((s) => s.id === raw) ? raw : 'relevance') as SortId;
    const size = Number(sp.get('size'));
    return {
        q: sp.get('q') || '',
        dept: sp.get('dept') || '',
        categories: list('category'),
        brands: list('brand'),
        origins: list('origin'),
        listed: (LISTED.some((l) => l.id === sp.get('listed')) ? sp.get('listed') : '') as ListedId,
        min: sp.get('min') || '',
        max: sp.get('max') || '',
        sort,
        size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
        page: Math.max(1, parseInt(sp.get('page') || '1', 10) || 1),
    };
}
/** Query-string keys the listing reads/writes. */
type UrlKey = 'q' | 'dept' | 'category' | 'brand' | 'origin' | 'listed' | 'min' | 'max' | 'sort' | 'size' | 'page';

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

function pageList(current: number, total: number): (number | '…')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out: (number | '…')[] = [1];
    const from = Math.max(2, current - 1), to = Math.min(total - 1, current + 1);
    if (from > 2) out.push('…');
    for (let i = from; i <= to; i++) out.push(i);
    if (to < total - 1) out.push('…');
    out.push(total);
    return out;
}

/** Min/max inputs + dual-handle slider, kept in sync. Bounds come from the
 *  catalog's real price range (converted to the display currency). */
function PriceFilter({ min, max, bounds, symbol, onApply }: {
    min: string; max: string; bounds: { lo: number; hi: number } | null; symbol: string;
    onApply: (min: string, max: string) => void;
}) {
    const { t } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('catalogPage', k, v);
    const [lo, setLo] = React.useState(min);
    const [hi, setHi] = React.useState(max);
    React.useEffect(() => { setLo(min); setHi(max); }, [min, max]);
    const nLo = lo === '' ? null : Number(lo), nHi = hi === '' ? null : Number(hi);
    const error = (nLo != null && isNaN(nLo)) || (nHi != null && isNaN(nHi)) ? tc('errNumber')
        : (nLo != null && nLo < 0) || (nHi != null && nHi < 0) ? tc('errNegative')
        : nLo != null && nHi != null && nLo > nHi ? tc('errOrder') : '';
    const dirty = lo !== min || hi !== max;
    const step = bounds ? Math.max(1, Math.round((bounds.hi - bounds.lo) / 200)) : 1;
    const sLo = bounds ? Math.min(Math.max(nLo ?? bounds.lo, bounds.lo), bounds.hi) : 0;
    const sHi = bounds ? Math.max(Math.min(nHi ?? bounds.hi, bounds.hi), bounds.lo) : 0;
    const pct = (v: number) => bounds && bounds.hi > bounds.lo ? ((v - bounds.lo) / (bounds.hi - bounds.lo)) * 100 : 0;
    // Slider at an end means "no limit" on that side.
    const fromSlider = (v: number, side: 'lo' | 'hi') => {
        if (!bounds) return;
        if (side === 'lo') setLo(v <= bounds.lo ? '' : String(Math.min(v, sHi)));
        else setHi(v >= bounds.hi ? '' : String(Math.max(v, sLo)));
    };
    const thumb = 'absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-[#0E7C74] [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#0E7C74] focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-4';
    return (
        <form onSubmit={(e) => { e.preventDefault(); if (!error) onApply(lo, hi); }} noValidate className="space-y-3">
            {bounds && bounds.hi > bounds.lo && (
                <div className="relative h-5 mx-1">
                    <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-1 rounded-full bg-[#E2E7EC]" />
                    <div className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-[#2EC4B6]" style={{ insetInlineStart: `${pct(sLo)}%`, insetInlineEnd: `${100 - pct(sHi)}%` }} />
                    <input type="range" min={bounds.lo} max={bounds.hi} step={step} value={sLo} onChange={(e) => fromSlider(Number(e.target.value), 'lo')} aria-label={tc('minPrice')} className={thumb} style={{ zIndex: sLo > bounds.hi - step * 2 ? 5 : 3 }} />
                    <input type="range" min={bounds.lo} max={bounds.hi} step={step} value={sHi} onChange={(e) => fromSlider(Number(e.target.value), 'hi')} aria-label={tc('maxPrice')} className={thumb} style={{ zIndex: 4 }} />
                </div>
            )}
            <div className="flex items-center gap-2">
                {([['min', lo, setLo, bounds?.lo], ['max', hi, setHi, bounds?.hi]] as const).map(([lbl, val, set, ph]) => (
                    <label key={lbl} className="flex-1 flex items-center h-9 rounded-lg ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6] bg-surface">
                        <span className="ps-2.5 text-[12px] text-ink-4">{symbol}</span>
                        <input inputMode="decimal" value={val} onChange={(e) => set(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
                            placeholder={ph != null ? String(ph) : tc(lbl)} aria-label={tc(lbl === 'min' ? 'minPrice' : 'maxPrice')} aria-invalid={!!error}
                            className="w-full min-w-0 h-full px-1.5 bg-transparent outline-none text-[13px] tabular-nums" />
                    </label>
                ))}
            </div>
            {error && <p className="text-[12px] text-[#DC2626]" role="alert">{error}</p>}
            <div className="flex gap-2">
                <button type="submit" disabled={!!error || !dirty} className="flex-1 h-8 rounded-lg bg-cta text-cta-fg text-[12.5px] font-semibold disabled:opacity-40">{tc('apply')}</button>
                {(min || max || lo || hi) && <button type="button" onClick={() => { setLo(''); setHi(''); onApply('', ''); }} className="h-8 px-3 rounded-lg text-[12.5px] font-semibold text-ink-3 hover:bg-surface-3">{tc('clear')}</button>}
            </div>
            <p className="text-[11px] text-ink-4">{tc('priceHint')}</p>
        </form>
    );
}

function CategoriesContent() {
    const { t, fmt } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('catalogPage', k, v);
    const deptLabel = (d: { slug: string; label: string }) => t('departments', d.slug) || d.label;
    const { currency, symbol } = useCurrency();
    const { user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const p = useListingParams();
    const department = getDepartment(p.dept);

    /** Merge changes into the URL. Any filter change resets to page 1. */
    const setParams = React.useCallback((patch: Partial<Record<UrlKey, string | string[] | number>>, keepPage = false) => {
        const next = new URLSearchParams(window.location.search);
        for (const [k, v] of Object.entries(patch)) {
            const val = Array.isArray(v) ? v.join(',') : String(v ?? '');
            if (!val || (k === 'page' && val === '1') || (k === 'sort' && val === 'relevance') || (k === 'size' && val === '20')) next.delete(k); else next.set(k, val);
        }
        if (!keepPage && !('page' in patch)) next.delete('page');
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [pathname, router]);

    // Search box: local text, pushed to the URL after a short pause.
    const [qInput, setQInput] = React.useState(p.q);
    React.useEffect(() => { setQInput(p.q); }, [p.q]);
    React.useEffect(() => {
        if (qInput.trim() === p.q) return;
        const id = setTimeout(() => setParams({ q: qInput.trim() }), 350);
        return () => clearTimeout(id);
    }, [qInput]); // eslint-disable-line react-hooks/exhaustive-deps


    const [brandQuery, setBrandQuery] = React.useState('');
    const [showFilters, setShowFilters] = React.useState(false);

    // ── Data ────────────────────────────────────────────────────────────
    const [items, setItems] = React.useState<Product[]>([]);
    const [total, setTotal] = React.useState(0);
    const [origins, setOrigins] = React.useState<{ value: string; count: number }[] | null>(null);
    const [brandFacets, setBrandFacets] = React.useState<{ value: string; count: number }[] | null>(null);
    const [priceRange, setPriceRange] = React.useState<{ min: number; max: number } | null>(null);
    const [openDept, setOpenDept] = React.useState<string>('');
    const [loading, setLoading] = React.useState(true);
    /** Request key whose results are currently shown — guards the page clamp. */
    const [loadedKey, setLoadedKey] = React.useState('');
    const [error, setError] = React.useState<false | 'auth' | 'network'>(false);
    const [sponsoredBrand, setSponsoredBrand] = React.useState<any>(null);
    const [sponsoredProducts, setSponsoredProducts] = React.useState<any[]>([]);
    const gridTop = React.useRef<HTMLDivElement>(null);

    const key = JSON.stringify(p) + currency;
    React.useEffect(() => {
        const ctrl = new AbortController();
        setLoading(true);
        setError(false);
        const sortApi = SORTS.find((s) => s.id === p.sort)!.api;
        let minEUR: string | undefined, maxEUR: string | undefined;
        try {
            if (p.min) minEUR = String(convertToBase(Number(p.min), currency));
            if (p.max) maxEUR = String(convertToBase(Number(p.max), currency));
        } catch { /* no rate → effective currency is EUR already */ }
        const base = { q: p.q || undefined, minPrice: minEUR, maxPrice: maxEUR, sort: sortApi, origin: p.origins.length ? p.origins.join(',') : undefined, listed: p.listed || undefined };

        // Department and multi-brand filters are paged server-side when the
        // backend supports them (facets.capabilities). Older backends ignore
        // the extra params, so we detect that once and fall back to gathering.
        const needsCaps = !!department || p.brands.length > 1;
        const serverParams = {
            ...base,
            category: p.categories[0],
            brand: p.brands.length === 1 ? p.brands[0] : undefined,
            brands: p.brands.length > 1 ? p.brands.join(',') : undefined,
            categoryAny: department ? department.include.join(',') : undefined,
            categoryNone: department?.exclude?.length ? department.exclude.join(',') : undefined,
        };
        (async () => {
            try {
                let done = false;
                if (!needsCaps || serverCaps !== false) {
                    const r = await fetchProductPage({ ...serverParams, page: p.page, limit: p.size }, ctrl.signal);
                    const ok = !needsCaps || (r.capabilities.includes('categoryAny') && r.capabilities.includes('brands'));
                    if (needsCaps) serverCaps = ok;
                    if (ok) {
                        setItems(r.items); setTotal(r.total); setOrigins(r.origins); if (r.brands) setBrandFacets(r.brands); setPriceRange(r.priceRange);
                        done = true;
                    }
                }
                if (!done) {
                    // Legacy fallback: gather (cap 1,000), filter, page locally.
                    const all: Product[] = [];
                    let originsSeen: { value: string; count: number }[] | null = null;
                    for (let page = 1; page <= 10; page++) {
                        const r = await fetchProductPage({ ...base, category: p.categories.length === 1 ? p.categories[0] : undefined, brand: p.brands.length === 1 ? p.brands[0] : undefined, page, limit: 100 }, ctrl.signal);
                        all.push(...r.items);
                        originsSeen = originsSeen ?? r.origins;
                        if (page === 1) { if (r.brands) setBrandFacets(r.brands); setPriceRange(r.priceRange); }
                        if (page >= r.totalPages) break;
                    }
                    const brandSet = new Set(p.brands.map((b) => b.toLowerCase()));
                    const filtered = all.filter((it) =>
                        (!department || matchesDepartment(it.category, department)) &&
                        (brandSet.size <= 1 || brandSet.has((it.brand || '').toLowerCase())));
                    setTotal(filtered.length);
                    setItems(filtered.slice((p.page - 1) * p.size, p.page * p.size));
                    setOrigins(originsSeen);
                }
            } catch (e: any) {
                if (e?.name !== 'AbortError') { setError(e?.status === 401 ? 'auth' : 'network'); setItems([]); setTotal(0); }
            } finally {
                if (!ctrl.signal.aborted) { setLoading(false); setLoadedKey(key); }
            }
        })();
        return () => ctrl.abort();
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sponsored placements: fetched once, not on every filter change.
    React.useEffect(() => {
        Promise.allSettled([
            apiFetch('/ads?placement=SPONSORED_BRAND').then((r) => r.json()),
            apiFetch('/ads?placement=SPONSORED_PRODUCT').then((r) => r.json()),
        ]).then(([b, pr]) => {
            if (b.status === 'fulfilled' && Array.isArray(b.value) && b.value.length) {
                setSponsoredBrand({ brandName: b.value[0].product?.brand || 'Atlantis', products: b.value.map((d: any) => d.product) });
            }
            if (pr.status === 'fulfilled' && Array.isArray(pr.value)) setSponsoredProducts(pr.value.map((d: any) => d.product).filter(Boolean));
        });
    }, []);

    const priceBounds = React.useMemo(() => {
        if (!priceRange || !(priceRange.max > 0)) return null;
        return { lo: Math.floor(convertFromBase(priceRange.min, currency)), hi: Math.ceil(convertFromBase(priceRange.max, currency)) };
    }, [priceRange, currency]);
    React.useEffect(() => { if (p.dept) setOpenDept(p.dept); }, [p.dept]);

    const totalPages = Math.max(1, Math.ceil(total / p.size));
    const from = total === 0 ? 0 : (p.page - 1) * p.size + 1;
    const to = Math.min(total, p.page * p.size);
    const goPage = (n: number) => {
        setParams({ page: n }, true);
        gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Out-of-range page (e.g. results shrank) → clamp to the last page.
    React.useEffect(() => { if (!loading && loadedKey === key && p.page > totalPages && total > 0) setParams({ page: totalPages }, true); }, [loading, loadedKey, key, p.page, totalPages, total, setParams]);

    // Real brands from the catalog when the backend provides them; the static
    // list is only a fallback for older backends. Selected brands stay listed.
    // Older backends without facets: fall back to brands present in the loaded
    // products — never a static list of brands that may have no products.
    const brandSource = brandFacets
        ? brandFacets.filter((b) => b.count > 0).map((b) => b.value)
        : Array.from(new Set(items.map((it) => it.brand).filter(Boolean) as string[])).sort();
    const brandOptions = Array.from(new Set([...p.brands, ...brandSource])).filter((b) => b.toLowerCase().includes(brandQuery.toLowerCase()));
    const brandCount = (b: string) => brandFacets?.find((x) => x.value === b)?.count;
    const toggleBrand = (b: string) => setParams({ brand: p.brands.includes(b) ? p.brands.filter((x) => x !== b) : [...p.brands, b] });

    const chips: { label: string; clear: () => void }[] = [
        ...(p.q ? [{ label: `“${p.q}”`, clear: () => setParams({ q: '' }) }] : []),
        ...(department ? [{ label: deptLabel(department), clear: () => setParams({ dept: '' }) }] : []),
        ...p.categories.map((c) => ({ label: c, clear: () => setParams({ category: p.categories.filter((x) => x !== c) }) })),
        ...p.brands.map((b) => ({ label: b, clear: () => setParams({ brand: p.brands.filter((x) => x !== b) }) })),
        ...(p.listed ? [{ label: tc(LISTED.find((l) => l.id === p.listed)!.chip), clear: () => setParams({ listed: '' }) }] : []),
        ...p.origins.map((o) => ({ label: tc('chipOrigin', { origin: o }), clear: () => setParams({ origin: p.origins.filter((x) => x !== o) }) })),
        ...(p.min || p.max ? [{ label: `${p.min ? `${symbol}${p.min}` : tc('any')} – ${p.max ? `${symbol}${p.max}` : tc('any')}`, clear: () => setParams({ min: '', max: '' }) }] : []),
    ];
    // Clears filters only — the chosen sort and page size are view settings and stay.
    const resetAll = () => setParams({ q: '', dept: '', category: [], brand: [], origin: [], listed: '', min: '', max: '' });

    // CSV export of the current view (same per-case price as the cards).
    const [exporting, setExporting] = React.useState(false);
    const downloadCatalog = async () => {
        if (!items.length) return;
        setExporting(true);
        try {
            const markups = await getAdminMarkups();
            const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const header = [tc('csvProduct'), tc('csvBrand'), tc('csvEan'), tc('csvCategory'), tc('csvOrigin'), tc('csvPrice', { currency }), tc('csvMoq'), tc('csvLink')];
            const rows = items.map((it: any) => {
                const own = !!(user?.role?.toUpperCase() === 'SUPPLIER' && it.supplierId && user?.id === it.supplierId);
                return [it.name, it.brand, it.ean, it.category, it.origin, formatPrice(computeCardPrice(it, markups, own), currency), it.minOrder, `${location.origin}/products/${it.id}`].map(esc).join(',');
            });
            const blob = new Blob(['﻿' + [header.map(esc).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `atlantis-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
        } finally { setExporting(false); }
    };

    const sidebar = (
        <div>
            {/* One search field: name, brand, category or EAN (backend q). */}
            <div className="pb-4">
                <label htmlFor="catalog-search" className="sr-only">{tc('searchProducts')}</label>
                <div className="flex items-center h-9 rounded-lg bg-surface ring-1 ring-line hover:ring-line-strong focus-within:ring-2 focus-within:ring-[#2EC4B6] transition-shadow">
                    <Search size={15} className="ms-3 text-ink-4 shrink-0" />
                    <input
                        id="catalog-search"
                        type="search"
                        value={qInput}
                        onChange={(e) => setQInput(e.target.value)}
                        placeholder={tc('searchPlaceholder')}
                        className="flex-1 min-w-0 h-full px-2 bg-transparent outline-none text-[13px] text-ink placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {qInput && (
                        <button type="button" onClick={() => setQInput('')} aria-label={tc('clearSearch')} className="me-2 w-7 h-7 rounded-lg flex items-center justify-center text-ink-4 hover:text-ink"><X size={14} /></button>
                    )}
                </div>
                <p className="mt-1 text-[11px] text-ink-4">{tc('searchHint')}</p>
            </div>

            <div className="rounded-2xl bg-surface ring-1 ring-line px-3.5 py-4">
                <Section title={tc('department')}>
                    <ul className="flex flex-col gap-0.5">
                        <li>
                            <button type="button" onClick={() => setParams({ dept: '', category: [] })} aria-pressed={!p.dept && !p.categories.length}
                                className={cn('w-full px-2 py-1.5 rounded-lg text-[13.5px] text-start', !p.dept && !p.categories.length ? 'bg-teal-soft text-teal font-semibold' : 'text-ink-2 hover:bg-surface-2')}>{tc('allDepartments')}</button>
                        </li>
                        {DEPARTMENTS.map((d) => {
                            const cats = CATEGORIES_LIST.filter((c) => matchesDepartment(c, d));
                            const expanded = openDept === d.slug;
                            const active = p.dept === d.slug;
                            return (
                                <li key={d.slug}>
                                    <div className="flex items-center">
                                        <button type="button" onClick={() => setParams({ dept: d.slug, category: [] })} aria-pressed={active && !p.categories.length}
                                            className={cn('flex-1 px-2 py-1.5 rounded-lg text-[13.5px] text-start', active && !p.categories.length ? 'bg-teal-soft text-teal font-semibold' : active ? 'text-ink font-semibold' : 'text-ink-2 hover:bg-surface-2')}>{deptLabel(d)}</button>
                                        {cats.length > 0 && (
                                            <button type="button" onClick={() => setOpenDept(expanded ? '' : d.slug)} aria-expanded={expanded} aria-label={tc(expanded ? 'collapse' : 'expand', { name: deptLabel(d) })}
                                                className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-4 hover:bg-surface-3 hover:text-ink">
                                                <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
                                            </button>
                                        )}
                                    </div>
                                    {expanded && (
                                        <ul className="ms-3 ps-2 border-s border-line my-0.5">
                                            {cats.map((c) => {
                                                const on = p.categories.includes(c);
                                                return (
                                                    <li key={c}>
                                                        <button type="button" onClick={() => setParams({ dept: d.slug, category: on ? [] : [c] })} aria-pressed={on}
                                                            className={cn('w-full px-2 py-1 rounded-md text-[13px] text-start', on ? 'text-teal font-semibold bg-teal-soft' : 'text-ink-3 hover:text-ink hover:bg-surface-2')}>{c}</button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </Section>

                {user && (
                    <Section title={tc('priceTitle', { currency })}>
                        <PriceFilter min={p.min} max={p.max} bounds={priceBounds} symbol={symbol} onApply={(min, max) => setParams({ min, max })} />
                    </Section>
                )}

                <Section title={tc('brand')}>
                    <div className="flex items-center h-9 rounded-lg ring-1 ring-line focus-within:ring-2 focus-within:ring-[#2EC4B6] mb-2">
                        <Search size={14} className="ms-2.5 text-ink-4" />
                        <input value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} placeholder={tc('findBrand')} aria-label={tc('findBrand')} className="flex-1 min-w-0 h-full px-2 bg-transparent outline-none text-[13px]" />
                    </div>
                    <div className="max-h-64 overflow-y-auto pe-1 space-y-0.5">
                        {brandOptions.map((b) => (
                            <label key={b} className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer">
                                <input type="checkbox" checked={p.brands.includes(b)} onChange={() => toggleBrand(b)} className="w-4 h-4 rounded accent-[#0B1F3A]" />
                                <span className={cn('flex-1 text-[14px]', p.brands.includes(b) ? 'text-ink font-semibold' : 'text-ink-2')}>{b}</span>
                                {brandCount(b) != null && <span className="text-[12px] text-ink-4 tabular-nums">{brandCount(b)}</span>}
                            </label>
                        ))}
                        {brandOptions.length === 0 && <p className="text-[13px] text-ink-4 px-1.5">{tc('noBrand')}</p>}
                    </div>
                </Section>

                {/* Only when the backend reports origin data (supported + present). */}
                {origins && origins.length > 0 && (
                    <Section title={tc('origin')} defaultOpen={false}>
                        <div className="max-h-56 overflow-y-auto space-y-0.5">
                            {origins.map((o) => (
                                <label key={o.value} className="flex items-center justify-between gap-2 px-1.5 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer">
                                    <span className="flex items-center gap-2.5">
                                        <input type="checkbox" checked={p.origins.some((x) => x.toLowerCase() === o.value.toLowerCase())}
                                            onChange={(e) => setParams({ origin: e.target.checked ? [...p.origins, o.value] : p.origins.filter((x) => x.toLowerCase() !== o.value.toLowerCase()) })}
                                            className="w-4 h-4 rounded accent-[#0B1F3A]" />
                                        <span className="text-[14px] text-ink-2">{o.value}</span>
                                    </span>
                                    <span className="text-[12px] text-ink-4 tabular-nums">{o.count}</span>
                                </label>
                            ))}
                        </div>
                        <p className="mt-2 text-[12px] text-ink-4">{tc('originHint')}</p>
                        {p.origins.length > 0 && <button type="button" onClick={() => setParams({ origin: [] })} className="mt-1 text-[13px] font-semibold text-teal">{tc('anyOrigin')}</button>}
                    </Section>
                )}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-surface pb-20 text-start">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="pt-4 pb-1">
                    <nav aria-label={tc('breadcrumb')} className="flex items-center gap-1.5 text-[13px] text-ink-3">
                        <Link href="/" className="hover:text-heading">{t('categories', 'home')}</Link>
                        <ChevronRight size={13} className="rtl:rotate-180" />
                        {department || p.categories.length ? (
                            <>
                                <Link href="/categories" className="hover:text-heading">{tc('catalog')}</Link><ChevronRight size={13} className="rtl:rotate-180" />
                                {department && p.categories.length === 1 ? (
                                    <><Link href={`/categories?dept=${department.slug}`} className="hover:text-heading">{deptLabel(department)}</Link><ChevronRight size={13} className="rtl:rotate-180" /><span className="text-ink font-medium">{p.categories[0]}</span></>
                                ) : <span className="text-ink font-medium">{p.categories.length === 1 ? p.categories[0] : department ? deptLabel(department) : tc('categories')}</span>}
                            </>
                        ) : <span className="text-ink font-medium">{tc('catalog')}</span>}
                    </nav>
                    <h1 className="font-sans mt-1.5 text-[20px] sm:text-[22px] font-bold tracking-tight text-heading">
                        {p.categories.length === 1 ? p.categories[0] : department ? deptLabel(department) : p.q ? tc('resultsFor', { q: p.q }) : tc('allProducts')}
                    </h1>
                </div>

                <div className="flex gap-7 xl:gap-8 pt-3">
                    <aside className="hidden lg:block w-[240px] shrink-0">
                        <div className="sticky top-[108px] max-h-[calc(100vh-124px)] overflow-y-auto scrollbar-hide pb-6">{sidebar}</div>
                    </aside>

                    <div className="flex-1 min-w-0 scroll-mt-[112px]" ref={gridTop}>
                        {/* Toolbar: count · sort · export */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3 min-h-9">
                            <p className="text-[13px] text-ink-3 me-auto" aria-live="polite">
                                {loading ? tc('loading') : error ? '' : <span className="tabular-nums">{tc('productsCount', { count: total })}</span>}
                            </p>
                            <button type="button" onClick={() => setShowFilters(true)} className="lg:hidden inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md ring-1 ring-line text-[12.5px] font-semibold text-ink">
                                <SlidersHorizontal size={15} /> {chips.length ? tc('filtersCount', { count: chips.length }) : tc('filters')}
                            </button>
                            <Dropdown inline label={tc('sortBy')} value={p.sort} options={SORTS.filter((s) => user || !s.id.startsWith('price')).map((s) => ({ value: s.id, label: tc(s.label) }))} onChange={(v) => setParams({ sort: v })} />
                            <Dropdown label={tc('show')} suffix={tc('perPageSuffix')} value={String(p.size)} options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setParams({ size: v })} className="hidden sm:inline-flex" />
                            <button type="button" onClick={downloadCatalog} disabled={loading || exporting || !items.length} className={cn(user ? 'hidden sm:inline-flex' : 'hidden', 'items-center gap-2 h-8 px-2 rounded-md text-[12.5px] font-medium text-ink-2 hover:text-ink disabled:opacity-40')}>
                                <Download size={15} /> {tc('download')}
                            </button>
                        </div>

                        {(p.sort === 'newest' || p.listed) && (
                            <div role="radiogroup" aria-label={tc('listed')} className="flex flex-wrap items-center gap-1.5 pb-3">
                                {LISTED.map((l) => (
                                    <button key={l.id || 'all'} type="button" role="radio" aria-checked={p.listed === l.id} onClick={() => setParams({ listed: l.id })}
                                        className={cn('h-8 px-3 rounded-full text-[12.5px] font-semibold ring-1 transition-colors',
                                            p.listed === l.id ? 'bg-heading text-surface ring-heading' : 'ring-line text-ink-2 hover:ring-line-strong')}>
                                        {tc(l.label)}
                                    </button>
                                ))}
                            </div>
                        )}

                        {chips.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pb-5">
                                {chips.map((c) => (
                                    <button key={c.label} type="button" onClick={c.clear} className="inline-flex items-center gap-1.5 h-8 ps-3 pe-2 rounded-full bg-teal-soft text-teal text-[13px] font-medium hover:bg-teal-soft transition-colors" aria-label={tc('removeFilter', { label: c.label })}>
                                        {c.label} <X size={13} />
                                    </button>
                                ))}
                                <button type="button" onClick={resetAll} className="inline-flex items-center gap-1 h-8 px-2 text-[13px] font-semibold text-ink-3 hover:text-ink">
                                    <RotateCcw size={13} /> {tc('clearAll')}
                                </button>
                            </div>
                        )}

                        {sponsoredBrand && p.page === 1 && !chips.length && (
                            <div className="pb-6"><SponsoredBrandBanner brandName={sponsoredBrand.brandName} products={sponsoredBrand.products} /></div>
                        )}

                        {loading ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="animate-pulse">
                                        <div className="aspect-square rounded-2xl bg-surface-3" />
                                        <div className="h-3 w-24 bg-surface-3 rounded mt-4" />
                                        <div className="h-4 w-full bg-surface-3 rounded mt-2.5" />
                                        <div className="h-10 w-full bg-surface-3 rounded-xl mt-5" />
                                    </div>
                                ))}
                            </div>
                        ) : items.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                                {p.page === 1 && !chips.length && sponsoredProducts[0] && <SponsoredProductCard product={sponsoredProducts[0]} index={0} />}
                                {items.map((it, i) => <ProductCard key={it.id} product={it} index={i} />)}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 px-6 text-center rounded-2xl ring-1 ring-line">
                                <span className="w-14 h-14 rounded-2xl bg-teal-soft flex items-center justify-center mb-5"><PackageSearch size={26} className="text-teal" /></span>
                                <h2 className="font-sans text-[18px] font-bold text-ink">
                                    {error === 'auth' ? tc('emptyAuthTitle') : error ? tc('emptyErrorTitle') : p.listed && chips.length === 1 ? tc(LISTED.find((l) => l.id === p.listed)!.empty) : department && chips.length === 1 ? tc('emptyDept', { dept: deptLabel(department) }) : tc('emptyFiltered')}
                                </h2>
                                <p className="text-[14px] text-ink-3 max-w-sm mt-1.5 mb-6">
                                    {error === 'auth' ? tc('emptyAuthBody') : error ? tc('emptyErrorBody') : tc('emptyBody')}
                                </p>
                                <div className="flex flex-wrap justify-center gap-3">
                                    {error === 'auth' && <Link href="/auth/login?redirect=/categories" className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-cta text-cta-fg text-[13px] font-semibold">{tc('signIn')} <ArrowRight size={14} className="rtl:rotate-180" /></Link>}
                                    {chips.length > 0 && <button type="button" onClick={resetAll} className="inline-flex items-center h-10 px-5 rounded-xl ring-1 ring-line text-[13px] font-semibold text-ink">{tc('resetFilters')}</button>}
                                    {error !== 'auth' && <Link href={department ? `/requests?dept=${department.slug}` : '/requests'} className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-cta text-cta-fg text-[13px] font-semibold">{tc('requestProduct')} <ArrowRight size={14} className="rtl:rotate-180" /></Link>}
                                </div>
                            </div>
                        )}

                        {!loading && total > 0 && (
                            <nav aria-label={tc('pagination')} className="mt-8 pt-4 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3">
                                <p className="text-[13px] text-ink-3 tabular-nums">
                                    {tc('showing', { from: fmt.number(from), to: fmt.number(to), count: total })}
                                </p>
                                <Dropdown label={tc('perPage')} value={String(p.size)} options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setParams({ size: v })} className="sm:hidden" />
                                {totalPages > 1 && (
                                    <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => goPage(p.page - 1)} disabled={p.page <= 1} aria-label={tc('prevPage')} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-[12.5px] font-semibold text-ink hover:bg-surface-3 disabled:opacity-35 disabled:pointer-events-none">
                                            <ChevronLeft size={16} className="rtl:rotate-180" /> {tc('prev')}
                                        </button>
                                        {pageList(p.page, totalPages).map((n, i) => n === '…' ? (
                                            <span key={`e${i}`} className="w-6 text-center text-ink-4">…</span>
                                        ) : (
                                            <button key={n} type="button" onClick={() => goPage(n)} aria-current={n === p.page ? 'page' : undefined}
                                                className={cn('min-w-8 h-8 px-2 rounded-lg text-[12.5px] font-semibold tabular-nums transition-colors', n === p.page ? 'bg-cta text-cta-fg' : 'text-ink-2 hover:bg-surface-3')}>
                                                {n}
                                            </button>
                                        ))}
                                        <button type="button" onClick={() => goPage(p.page + 1)} disabled={p.page >= totalPages} aria-label={tc('nextPage')} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg text-[12.5px] font-semibold text-ink hover:bg-surface-3 disabled:opacity-35 disabled:pointer-events-none">
                                            {tc('next')} <ChevronRight size={16} className="rtl:rotate-180" />
                                        </button>
                                    </div>
                                )}
                            </nav>
                        )}
                    </div>
                </div>
            </div>

            {showFilters && (
                <div className="fixed inset-0 z-[120] lg:hidden" role="dialog" aria-modal="true" aria-label={tc('filters')}>
                    <button className="absolute inset-0 bg-cta/30" aria-label={tc('closeFilters')} onClick={() => setShowFilters(false)} />
                    <div className="absolute inset-y-0 end-0 w-[88%] max-w-sm bg-surface shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between px-5 h-14 border-b border-line">
                            <h2 className="font-sans text-[16px] font-bold text-ink">{tc('filters')}</h2>
                            <button onClick={() => setShowFilters(false)} aria-label={tc('close')} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-surface-3"><X size={18} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5">{sidebar}</div>
                        <div className="p-4 border-t border-line flex gap-3">
                            <button onClick={resetAll} className="flex-1 h-11 rounded-xl ring-1 ring-line text-[14px] font-semibold">{tc('reset')}</button>
                            <button onClick={() => setShowFilters(false)} className="flex-1 h-11 rounded-xl bg-cta text-cta-fg text-[14px] font-semibold">{tc('showResults', { count: total })}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CategoriesPage() {
    const { t } = useLanguage();
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('categories', 'loadingProducts')}</div>}>
            <CategoriesContent />
        </Suspense>
    );
}
