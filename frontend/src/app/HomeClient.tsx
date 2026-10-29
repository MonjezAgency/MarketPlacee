'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    ChevronRight,
    ChevronLeft,
    ArrowRight,
    ArrowUpRight,
    ShieldCheck,
    Truck,
    CircleDollarSign,
    Headphones,
    Package,
    Layers,
    Boxes,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

// =====================================================================
// Ali FMCG homepage — FMCG wholesale first.
// Tokens: Navy #0B1F3A · Teal #2EC4B6 (text-safe teal #0E7C74)
//         Ink #0F172A · Muted #475569/#64748B · Hairline #E6E8EC
//         Canvas white with #F7F8FA bands.
// =====================================================================

const unsplash = (id: string, w: number) =>
    `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=75&w=${w}`;

// Hero copy rotates through three stories; imagery rotates independently
// through ten professional FMCG-wholesale photographs (Unsplash licence),
// cross-fading slowly with a gentle drift.
// Dictionary keys (landing section) — text is resolved with t() at render time.
const HERO_SLIDES = [
    { title: 'hero1Title', accent: 'hero1Accent', desc: 'hero1Desc' },
    { title: 'hero2Title', accent: 'hero2Accent', desc: 'hero2Desc' },
    { title: 'hero3Title', accent: 'hero3Accent', desc: 'hero3Desc' },
];

const HERO_IMAGES = [
    '1586528116311-ad8dd3c8310d', // distribution warehouse
    '1665359045452-bfa257a2a6bf', // beverage cans on shelf
    '1578916171728-46686eac8d58', // grocery aisle
    '1689942010216-dc412bb1e7a9', // pallet racking
    '1621939514649-280e2ee25f60', // confectionery case
    '1494412519320-aa613dfb7738', // container port
    '1688217170693-e821c6e18d72', // snacks wall
    '1645736315000-6f788915923b', // forklift in warehouse
    '1661781224922-a45d5ccc1639', // chilled drinks
    '1601584115197-04ecc0da31d7', // long-haul truck
].map((id) => unsplash(id, 2000));

const HERO_HIGHLIGHTS = [
    { icon: ShieldCheck, title: 'highlightSoldShipped' },
    { icon: Layers, title: 'highlightTiers' },
    { icon: CircleDollarSign, title: 'highlightConfirmed' },
    { icon: Truck, title: 'highlightDelivery' },
];

// FMCG departments (title/sub are landing dictionary keys) — slugs match lib/departments.ts (catalog ?dept=…).
const TOP_CATEGORIES = [
    { title: 'catBeverages', sub: 'catBeveragesSub', dept: 'beverages', image: unsplash('1661781224922-a45d5ccc1639', 900) },
    { title: 'catConfectionery', sub: 'catConfectionerySub', dept: 'confectionery', image: unsplash('1621939514649-280e2ee25f60', 900) },
    { title: 'catSnacks', sub: 'catSnacksSub', dept: 'snacks', image: unsplash('1688217170693-e821c6e18d72', 900) },
    { title: 'catFood', sub: 'catFoodSub', dept: 'food', image: unsplash('1534723452862-4c874018d66d', 900) },
    { title: 'catPersonalCare', sub: 'catPersonalCareSub', dept: 'personal-care', image: unsplash('1749137315928-bc96451fa4c0', 900) },
    { title: 'catHousehold', sub: 'catHouseholdSub', dept: 'household', image: unsplash('1626379481874-3dc5678fa8ca', 900) },
];

// Brand marks: vector (SVG) where an official vector exists, otherwise the
// trimmed local raster from public/Logos. w/h = intrinsic size (viewBox for
// SVG). Rasters are never shown larger than their pixels allow on a 2x
// screen (incl. hover zoom), so nothing is upscaled or pixelated.
type Brand = { name: string; src: string; w: number; h: number; vector?: boolean };
const BRANDS: Brand[] = [
    { name: 'Coca-Cola', src: '/brands/coca-cola.svg', w: 615, h: 193, vector: true },
    { name: 'Nescafé', src: '/brands/nescafe.webp', w: 296, h: 88 },
    { name: 'Ferrero Rocher', src: '/brands/ferrero-rocher.webp', w: 318, h: 141 },
    { name: 'Nivea', src: '/brands/nivea.svg', w: 50, h: 50, vector: true },
    { name: 'Red Bull', src: '/brands/red-bull.webp', w: 224, h: 160 },
    { name: 'Nutella', src: '/brands/nutella.svg', w: 338, h: 88, vector: true },
    { name: 'Persil', src: '/brands/persil.webp', w: 172, h: 63 },
    { name: 'Pepsi', src: '/brands/pepsi.svg', w: 212, h: 212, vector: true },
    { name: 'Lavazza', src: '/brands/lavazza.webp', w: 213, h: 90 },
    { name: 'Snickers', src: '/brands/snickers.svg', w: 1207, h: 306, vector: true },
    { name: 'Dove', src: '/brands/dove.webp', w: 161, h: 115 },
    { name: 'Kinder', src: '/brands/kinder.webp', w: 191, h: 60 },
    { name: 'Domestos', src: '/brands/domestos.webp', w: 181, h: 160 },
    { name: "M&M's", src: '/brands/mms.svg', w: 100, h: 42, vector: true },
    { name: 'Oreo', src: '/brands/oreo.webp', w: 308, h: 119 },
    { name: 'Sprite', src: '/brands/sprite.webp', w: 191, h: 160 },
    { name: 'Jacobs', src: '/brands/jacobs.webp', w: 272, h: 128 },
    { name: 'Comfort', src: '/brands/comfort.webp', w: 201, h: 98 },
    { name: 'Twix', src: '/brands/twix.webp', w: 208, h: 150 },
    { name: 'Starbucks', src: '/brands/starbucks.webp', w: 132, h: 118 },
    { name: 'Tchibo', src: '/brands/tchibo.webp', w: 160, h: 160 },
    { name: 'Dr Pepper', src: '/brands/dr-pepper.webp', w: 269, h: 160 },
    { name: 'Cif', src: '/brands/cif.webp', w: 100, h: 100 },
    { name: "Wall's", src: '/brands/walls.webp', w: 126, h: 108 },
    { name: 'Wonka', src: '/brands/wonka.webp', w: 281, h: 160 },
];

const HOVER_ZOOM = 1.12;

/** Equal optical area; rasters capped at native/(2x DPR × hover zoom). */
function logoBox(b: Brand) {
    const ratio = b.w / b.h;
    const area = 2600; // px² at 1x
    let height = Math.sqrt(area / ratio);
    let width = height * ratio;
    if (height > 50) { height = 50; width = height * ratio; }
    if (width > 136) { width = 136; height = width / ratio; }
    if (!b.vector) {
        const maxH = b.h / (2 * HOVER_ZOOM);
        if (height > maxH) { height = maxH; width = height * ratio; }
    }
    return { width: Math.round(width), height: Math.round(height) };
}

const WHY_ATLANTIS = [
    { title: 'whyBuiltTitle', sub: 'whyBuiltSub', icon: Boxes },
    { title: 'whyPricingTitle', sub: 'whyPricingSub', icon: CircleDollarSign },
    { title: 'whyLogisticsTitle', sub: 'whyLogisticsSub', icon: Truck },
    { title: 'whySupportTitle', sub: 'whySupportSub', icon: Headphones },
    { title: 'whySecureTitle', sub: 'whySecureSub', icon: ShieldCheck },
];

/** Shared section header for consistent rhythm across the page. */
function SectionHeader({ eyebrow, title, link }: { eyebrow?: string; title: string; link?: { href: string; label: string } }) {
    return (
        <div className="flex items-end justify-between gap-4 mb-6 sm:mb-8">
            <div>
                {eyebrow && <p className="text-[12px] font-semibold uppercase tracking-[0.14em] rtl:tracking-normal text-teal mb-2">{eyebrow}</p>}
                <h2 className="font-sans text-[24px] sm:text-[28px] font-bold tracking-tight rtl:tracking-normal text-heading leading-tight">{title}</h2>
            </div>
            {link && (
                <Link href={link.href} className="hidden sm:inline-flex items-center gap-1.5 text-[14px] font-semibold text-heading hover:text-teal transition-colors whitespace-nowrap no-underline">
                    {link.label} <ArrowRight size={15} className="rtl:rotate-180" />
                </Link>
            )}
        </div>
    );
}

export default function HomePage() {
    const { t, dir } = useLanguage();
    const tl = (key: string, vars?: Record<string, string | number>) => t('landing', key, vars);
    const rtl = dir === 'rtl';
    const [slide, setSlide] = React.useState(0);
    const [products, setProducts] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);
    const productsRef = React.useRef<HTMLDivElement | null>(null);
    // True pagination on the Popular Wholesale Products carousel —
    // arrows fetch the next/previous PAGE of products from the API.
    const [productsPage, setProductsPage] = React.useState(1);
    const [productsTotalPages, setProductsTotalPages] = React.useState(1);
    const PRODUCTS_PER_PAGE = 12; // 2 rows × 6 columns on desktop

    // Slow, calm rotation; paused for users who prefer reduced motion.
    React.useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const id = setInterval(() => setSlide((s) => (s + 1) % HERO_IMAGES.length), 10000);
        return () => clearInterval(id);
    }, []);

    React.useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await apiFetch(`/products?limit=${PRODUCTS_PER_PAGE}&page=${productsPage}&status=APPROVED&sort=popular`);
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data.data || []);
                    if (typeof data.totalPages === 'number') setProductsTotalPages(data.totalPages);
                }
            } catch {
                /* noop */
            } finally {
                setLoading(false);
            }
        })();
    }, [productsPage]);

    const scrollProducts = (dir: 'left' | 'right') => {
        setProductsPage(p => {
            if (dir === 'right') return Math.min(p + 1, productsTotalPages);
            return Math.max(p - 1, 1);
        });
        if (productsRef.current) productsRef.current.scrollLeft = 0;
    };

    const current = HERO_SLIDES[slide % HERO_SLIDES.length];
    // Only fetch photos as they come up (current + next), then keep them.
    const [seen, setSeen] = React.useState<Set<number>>(() => new Set([0, 1]));
    React.useEffect(() => {
        setSeen((prev) => {
            const next = (slide + 1) % HERO_IMAGES.length;
            if (prev.has(slide) && prev.has(next)) return prev;
            const out = new Set(prev); out.add(slide); out.add(next); return out;
        });
    }, [slide]);

    return (
        <div data-no-translate className="bg-surface font-sans text-ink text-start">
            {/* ============================================================
                 HERO — cross-fading FMCG imagery with a slow drift
            ============================================================ */}
            <section className="relative w-full min-h-[600px] sm:min-h-0 sm:h-[560px] lg:h-[600px] overflow-hidden bg-cta isolate flex">
                {HERO_IMAGES.map((src, i) => (
                    <div
                        key={src}
                        aria-hidden
                        className={cn(
                            'absolute inset-0 transition-opacity duration-[2500ms] ease-in-out',
                            i === slide ? 'opacity-100' : 'opacity-0'
                        )}
                    >
                        {seen.has(i) && (
                            <img
                                src={src}
                                alt=""
                                loading={i === 0 ? 'eager' : 'lazy'}
                                decoding="async"
                                className="absolute inset-0 w-full h-full object-cover animate-hero-drift"
                                style={{ animationDelay: `${-i * 6}s` }}
                            />
                        )}
                    </div>
                ))}
                {/* Readability: navy wash strongest behind the copy, fading right */}
                <div className="absolute inset-0 bg-[#0B1F3A]/20" />
                <div className="absolute inset-0 bg-gradient-to-r rtl:bg-gradient-to-l from-[#0B1F3A]/95 via-[#0B1F3A]/75 to-[#0B1F3A]/10" />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0B1F3A]/50 to-transparent" />

                <div className="relative z-10 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-20 sm:py-0 flex flex-col justify-center">
                    <h1 className="sr-only">
                        {tl('srHeading')}
                    </h1>
                    <div className="max-w-[620px]">
                        <p className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-white/10 border border-white/15 text-[12px] font-semibold tracking-wide rtl:tracking-normal text-[#9BE7DF] backdrop-blur-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6]" /> {tl('heroEyebrow')}
                        </p>
                        {/* Rotating heading — h2-equivalent; the stable h1 is above. */}
                        <div
                            key={slide % HERO_SLIDES.length}
                            role="heading"
                            aria-level={2}
                            className={cn(
                                'mt-5 text-white font-bold text-[34px] sm:text-[44px] lg:text-[54px] animate-hero-copy text-start [text-wrap:balance]',
                                // Arabic: taller line-height for the script, no negative tracking (it breaks letter joining).
                                rtl ? 'leading-[1.25] tracking-normal' : 'leading-[1.06] tracking-tight'
                            )}
                        >
                            {/* Title and accent are always two designed lines. */}
                            <span className="block">{tl(current.title)}</span>
                            <span className="block text-[#2EC4B6]">{tl(current.accent)}</span>
                        </div>
                        <p key={`d-${slide % HERO_SLIDES.length}`} className="mt-5 text-[#D3DCEB] text-[15px] sm:text-[17px] leading-relaxed max-w-[540px] animate-hero-copy [animation-delay:120ms]">
                            {tl(current.desc)}
                        </p>

                        <ul className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 max-w-[520px]">
                            {HERO_HIGHLIGHTS.map((h) => (
                                <li key={h.title} className="flex items-center gap-2.5 text-[14px] font-medium text-white/90">
                                    <span className="w-7 h-7 rounded-lg bg-[#2EC4B6]/15 text-[#2EC4B6] flex items-center justify-center shrink-0">
                                        <h.icon size={15} />
                                    </span>
                                    {tl(h.title)}
                                </li>
                            ))}
                        </ul>

                        <div className="mt-9 flex flex-wrap items-center gap-3">
                            <Link
                                href="/categories"
                                className="inline-flex items-center gap-2 h-12 px-7 bg-[#2EC4B6] hover:bg-[#25AFA2] text-heading rounded-xl text-[15px] font-bold transition-colors no-underline"
                            >
                                {tl('ctaStartSourcing')} <ArrowRight size={17} className="rtl:rotate-180" />
                            </Link>
                            <Link
                                href="/requests"
                                className="inline-flex items-center gap-2 h-12 px-6 bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-xl text-[15px] font-semibold backdrop-blur-sm transition-colors no-underline"
                            >
                                {tl('ctaRequestQuote')}
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Slide indicators */}
                <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-20 flex gap-2">
                    {HERO_IMAGES.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setSlide(i)}
                            aria-label={tl('slideAria', { n: i + 1 })}
                            aria-current={slide === i}
                            className={cn('h-1.5 rounded-full transition-all duration-500', slide === i ? 'w-8 bg-[#2EC4B6]' : 'w-1.5 bg-white/40 hover:bg-white/70')}
                        />
                    ))}
                </div>
            </section>

            {/* ============================================================
                 BRANDS — borderless, true colours, equal optical weight
            ============================================================ */}
            <section aria-labelledby="brands-heading" className="py-12 sm:py-14 border-b border-line">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                    <p id="brands-heading" className="text-center text-[13px] font-semibold uppercase tracking-[0.14em] rtl:tracking-normal text-ink-3">
                        {tl('brandsLabel')}
                    </p>
                </div>
                {/* Logo marquee runs left-to-right in every language (the loop animation is LTR). */}
                <div dir="ltr" className="brand-strip relative mt-8 overflow-hidden dark:bg-media dark:rounded-2xl motion-reduce:overflow-x-auto">
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-32 bg-gradient-to-r from-surface dark:from-media to-transparent z-10" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-32 bg-gradient-to-l from-surface dark:from-media to-transparent z-10" />
                    <ul className="flex w-max items-center animate-brand-loop">
                        {[...BRANDS, ...BRANDS].map((b, i) => {
                            const box = logoBox(b);
                            return (
                                <li key={`${b.name}-${i}`} className="group/logo shrink-0 px-6 sm:px-8 flex items-center justify-center h-20" aria-hidden={i >= BRANDS.length}>
                                    <img
                                        src={b.src}
                                        alt={i < BRANDS.length ? b.name : ''}
                                        width={box.width}
                                        height={box.height}
                                        loading="lazy"
                                        decoding="async"
                                        className="object-contain mix-blend-multiply select-none transition-transform duration-300 ease-out group-hover/logo:scale-[1.12] motion-reduce:transition-none"
                                        style={{ width: box.width, height: box.height }}
                                        draggable={false}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </section>

            {/* ============================================================
                 TOP CATEGORIES — FMCG departments
            ============================================================ */}
            <section className="py-16 sm:py-20">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                    <SectionHeader
                        eyebrow={tl('categoriesEyebrow')}
                        title={tl('categoriesTitle')}
                        link={{ href: '/categories', label: tl('viewFullCatalog') }}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        {TOP_CATEGORIES.map((c) => (
                            <Link
                                key={c.dept}
                                href={`/categories?dept=${c.dept}`}
                                className="group relative block aspect-[16/10] rounded-2xl overflow-hidden bg-surface-3 no-underline outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2"
                            >
                                <img
                                    src={c.image}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/85 via-[#0B1F3A]/25 to-transparent" />
                                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex items-end justify-between gap-4">
                                    <div>
                                        <h3 className="font-sans text-[20px] sm:text-[22px] font-bold text-white leading-tight">{tl(c.title)}</h3>
                                        <p className="mt-1 text-[13px] sm:text-[14px] text-white/80">{tl(c.sub)}</p>
                                    </div>
                                    <span className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-white flex items-center justify-center shrink-0 transition-colors group-hover:bg-[#2EC4B6] group-hover:border-[#2EC4B6] group-hover:text-heading">
                                        <ArrowUpRight size={18} className="rtl:-scale-x-100" />
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                    <Link href="/categories" className="sm:hidden mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-heading no-underline">
                        {tl('viewFullCatalog')} <ArrowRight size={15} className="rtl:rotate-180" />
                    </Link>
                </div>
            </section>

            {/* ============================================================
                 POPULAR WHOLESALE PRODUCTS (paged carousel)
            ============================================================ */}
            <section className="py-16 sm:py-20 bg-[#F7F8FA]">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                    <SectionHeader
                        eyebrow={tl('productsEyebrow')}
                        title={tl('productsTitle')}
                        link={{ href: '/categories', label: tl('viewAllProducts') }}
                    />

                    <div className="relative">
                        {productsTotalPages > 1 && (
                            <div className="hidden lg:flex absolute -top-14 end-0 items-center gap-2">
                                <span className="text-[13px] text-ink-3 tabular-nums me-2">{tl('pageOf', { page: productsPage, total: productsTotalPages })}</span>
                                <button
                                    onClick={() => scrollProducts('left')}
                                    aria-label={tl('previousPage')}
                                    disabled={productsPage <= 1}
                                    className="w-10 h-10 flex items-center justify-center bg-surface border border-line rounded-full hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={18} className="rtl:rotate-180" />
                                </button>
                                <button
                                    onClick={() => scrollProducts('right')}
                                    aria-label={tl('nextPage')}
                                    disabled={productsPage >= productsTotalPages}
                                    className="w-10 h-10 flex items-center justify-center bg-surface border border-line rounded-full hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={18} className="rtl:rotate-180" />
                                </button>
                            </div>
                        )}

                        {loading ? (
                            <div role="status" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                <span className="sr-only">{tl('loadingProducts')}</span>
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="animate-pulse">
                                        <div className="aspect-square bg-surface-3 rounded-2xl" />
                                        <div className="h-3 bg-surface-3 rounded w-3/4 mt-4" />
                                        <div className="h-3 bg-surface-3 rounded w-1/2 mt-2" />
                                    </div>
                                ))}
                            </div>
                        ) : products.length === 0 ? (
                            <div className="py-16 rounded-2xl bg-surface flex flex-col items-center justify-center gap-3 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-teal-soft flex items-center justify-center text-teal">
                                    <Package size={26} />
                                </div>
                                <h3 className="font-sans text-[16px] font-bold text-ink">{tl('productsEmptyTitle')}</h3>
                                <p className="text-[14px] text-ink-3 max-w-sm">{tl('productsEmptyBody')}</p>
                                <Link href="/requests" className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-teal no-underline">
                                    {tl('ctaRequestQuote')} <ArrowRight size={14} className="rtl:rotate-180" />
                                </Link>
                            </div>
                        ) : (
                            <div
                                ref={productsRef}
                                className="grid grid-flow-col auto-cols-[minmax(160px,1fr)] sm:auto-cols-[minmax(180px,1fr)] lg:grid-flow-row lg:grid-cols-6 lg:auto-cols-auto gap-4 gap-y-8 overflow-x-auto lg:overflow-visible snap-x snap-mandatory pb-2 scroll-smooth scrollbar-hide"
                            >
                                {products.slice(0, 12).map((p, i) => (
                                    <div key={p.id} className="snap-start h-full">
                                        <ProductCard product={p} index={i} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* ============================================================
                 WHY ALI FMCG
            ============================================================ */}
            <section className="py-16 sm:py-20">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Centered: five short pillars read as one balanced row. */}
                    <div className="text-center mb-8 sm:mb-10">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] rtl:tracking-normal text-teal mb-2">{tl('whyEyebrow')}</p>
                        <h2 className="font-sans text-[24px] sm:text-[28px] font-bold tracking-tight rtl:tracking-normal text-heading leading-tight">{tl('whyTitle')}</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-10">
                        {WHY_ATLANTIS.map((w) => (
                            <div key={w.title} className="text-center max-w-[260px] mx-auto">
                                <div className="mx-auto w-11 h-11 rounded-xl bg-teal-soft flex items-center justify-center text-teal">
                                    <w.icon size={20} />
                                </div>
                                <h3 className="font-sans mt-4 text-[16px] font-bold text-ink">{tl(w.title)}</h3>
                                <p className="mt-1.5 text-[14px] text-ink-3 leading-relaxed">{tl(w.sub)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ============================================================
                 BULK CTA — light, so it doesn't stack onto the dark footer
            ============================================================ */}
            <section className="pb-16 sm:pb-20">
                <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#EAF8F6] via-[#F4FBFA] to-white dark:from-[#0F2E33] dark:via-[#0F2230] dark:to-surface px-6 sm:px-10 lg:px-14 py-10 sm:py-12">
                        <div aria-hidden className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-[#2EC4B6]/15 blur-3xl" />
                        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                            <div className="max-w-[620px]">
                                <h2 className="font-sans text-[24px] sm:text-[30px] font-bold tracking-tight rtl:tracking-normal text-heading leading-tight">
                                    {tl('bulkTitle')}
                                </h2>
                                <p className="mt-3 text-[15px] sm:text-[16px] text-ink-2 leading-relaxed">
                                    {tl('bulkBody')}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <Link
                                    href="/auth/register?role=customer"
                                    className="inline-flex items-center justify-center gap-2 h-12 px-7 bg-cta hover:bg-cta-hover text-cta-fg rounded-xl text-[15px] font-semibold transition-colors no-underline"
                                >
                                    {tl('becomeBuyer')} <ArrowRight size={16} className="rtl:rotate-180" />
                                </Link>
                                <Link
                                    href="/contact"
                                    className="inline-flex items-center justify-center h-12 px-6 bg-surface border border-[#D7DEE7] hover:border-ink text-heading rounded-xl text-[15px] font-semibold transition-colors no-underline"
                                >
                                    {tl('contactSales')}
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
