'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    ArrowRight,
    ShieldCheck,
    Truck,
    CircleDollarSign,
    Headphones,
    Monitor,
    Factory,
    Box,
    Home as HomeIcon,
    Stethoscope,
    Shirt,
    Car,
    TrendingUp,
    Package,
    LayoutList,
    Store,
    ShoppingCart,
    User,
    FileText,
    Zap,
    Wrench,
    Sparkles,
} from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import PriceTicker from '@/components/ui/PriceTicker';
import { apiFetch } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';
import { useLanguage } from '@/contexts/LanguageContext';

// =====================================================================
// SPEC TOKENS (mirrors screenshot)
// Primary Teal: #14B8A6  | Navy Dark: #0B1F3A | Bg: #F8FAFC
// Border: #E5E7EB        | Muted: #64748B    | Heading: #0F172A
// =====================================================================

const TOP_FEATURES = [
    'Verified Global Suppliers',
    'Competitive Wholesale Prices',
    'Bulk Order Discounts',
    'Global Shipping Solutions',
    'Dedicated B2B Support',
];

const HERO_HIGHLIGHTS = [
    { icon: ShieldCheck, title: 'Verified Suppliers', sub: '100% vetted' },
    { icon: CircleDollarSign, title: 'Bulk Pricing', sub: 'Lower costs' },
    { icon: Truck, title: 'Global Shipping', sub: 'Fast & reliable' },
    { icon: ShieldCheck, title: 'Secure Payments', sub: 'Safe transactions' },
];

const QUOTE_STEPS = [
    { icon: FileText, title: 'Fill Requirements', sub: 'Add products & quantities' },
    { icon: Headphones, title: 'Get Quotes', sub: 'Receive best offers' },
    { icon: ShoppingCart, title: 'Compare & Order', sub: 'Choose and place order' },
];

const BUSINESS_CATEGORIES = [
    { name: 'Electronics & Accessories', icon: Monitor, count: '12,450+ products', slug: 'electronics-accessories' },
    { name: 'Industrial & Machinery', icon: Factory, count: '8,750+ products', slug: 'industrial-machinery' },
    { name: 'Packaging & Materials', icon: Box, count: '6,320+ products', slug: 'packaging-materials' },
    { name: 'Office & Stationery', icon: FileText, count: '4,890+ products', slug: 'office-stationery' },
    { name: 'Home & Kitchen Supplies', icon: HomeIcon, count: '7,230+ products', slug: 'home-kitchen' },
    { name: 'Health & Personal Care', icon: Stethoscope, count: '5,410+ products', slug: 'health-personal-care' },
    { name: 'Fashion & Textiles', icon: Shirt, count: '9,870+ products', slug: 'fashion-textiles' },
    { name: 'Automotive & Parts', icon: Car, count: '6,150+ products', slug: 'automotive-parts' },
];

const BRANDS = [
    { name: 'Siemens', logo: 'https://logo.clearbit.com/siemens.com' },
    { name: 'Bosch', logo: 'https://logo.clearbit.com/bosch.com' },
    { name: 'Philips', logo: 'https://logo.clearbit.com/philips.com' },
    { name: 'DHL', logo: 'https://logo.clearbit.com/dhl.com' },
    { name: 'Unilever', logo: 'https://logo.clearbit.com/unilever.com' },
    { name: 'P&G', logo: 'https://logo.clearbit.com/pg.com' },
    { name: 'Nestle', logo: 'https://logo.clearbit.com/nestle.com' },
    { name: 'Caterpillar', logo: 'https://logo.clearbit.com/cat.com' },
    { name: 'Schneider', logo: 'https://logo.clearbit.com/se.com' },
    { name: '3M', logo: 'https://logo.clearbit.com/3m.com' },
];

const TOP_BUSINESS_CATEGORIES = [
    {
        title: 'Electronics & Accessories',
        count: '12,450+ products',
        image: 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?auto=format&fit=crop&q=80&w=900',
    },
    {
        title: 'Industrial & Machinery',
        count: '8,750+ products',
        image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=900',
    },
    {
        title: 'Packaging & Materials',
        count: '6,320+ products',
        image: 'https://images.unsplash.com/photo-1589939705384-5185138a047a?auto=format&fit=crop&q=80&w=900',
    },
    {
        title: 'Office & Janitorial Supplies',
        count: '4,890+ products',
        image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=900',
    },
    {
        title: 'Home & Kitchen Supplies',
        count: '7,230+ products',
        image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&q=80&w=900',
    },
];

const WHY_ATLANTIS = [
    { title: 'B2B Wholesale Focus', sub: 'Built specifically for business buyers and bulk purchasing.', icon: Package },
    { title: 'Competitive Pricing', sub: 'Lower wholesale prices with volume-based discounts.', icon: CircleDollarSign },
    { title: 'Reliable Global Shipping', sub: 'Fast and secure delivery to your business anywhere.', icon: Truck },
    { title: 'Dedicated Account Support', sub: 'Personal account managers and 24/7 business support.', icon: Headphones },
    { title: 'Secure & Flexible Payments', sub: 'Multiple payment options with trade assurance.', icon: ShieldCheck },
];

// Hero rotating slides
const HERO_SLIDES = [
    {
        title: 'Your B2B Partner for',
        accent: 'Global Wholesale',
        desc: 'Source quality products in bulk from verified suppliers worldwide. Better prices, reliable shipping, and business growth—together.',
        image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=1400',
    },
    {
        title: 'Direct Sourcing',
        accent: 'No Middlemen',
        desc: 'Skip the markups. Connect with manufacturers directly and unlock bulk-tier pricing for your business.',
        image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&q=80&w=1400',
    },
    {
        title: 'Seamless Logistics',
        accent: 'Worldwide Delivery',
        desc: 'Expert handling from factory to your warehouse. Live tracking, customs clearance, and on-time delivery guaranteed.',
        image: 'https://images.unsplash.com/photo-1494412519320-aa613dfb7738?auto=format&fit=crop&q=80&w=1400',
    },
];

export default function HomePage() {
    const { t } = useLanguage();
    const [slide, setSlide] = React.useState(0);
    const [products, setProducts] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(true);
    const productsRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        const id = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 6000);
        return () => clearInterval(id);
    }, []);

    React.useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch('/products?limit=12&status=APPROVED&sort=popular');
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data.data || []);
                }
            } catch {
                /* noop */
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const scrollProducts = (dir: 'left' | 'right') => {
        if (!productsRef.current) return;
        const amount = productsRef.current.clientWidth * 0.85;
        productsRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-[#111827]">
            <Navbar />
            <PriceTicker />

            {/* ============================================================
                 1. TOP FEATURE STRIP
            ============================================================ */}
            <div className="bg-white border-b border-[#E5E7EB] hidden md:block">
                <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto">
                    {TOP_FEATURES.map((f) => (
                        <div key={f} className="flex items-center gap-2 whitespace-nowrap">
                            <CheckCircle2 size={14} className="text-[#14B8A6] shrink-0" />
                            <span className="text-[12px] font-medium text-[#475569]">{f}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* MAIN CONTAINER */}
            <main className="flex-1 max-w-[1440px] mx-auto w-full px-3 sm:px-4 lg:px-6 py-5 sm:py-7 space-y-7 sm:space-y-9">

                {/* ============================================================
                     2. HERO
                ============================================================ */}
                <section className="relative h-[360px] sm:h-[400px] md:h-[440px] lg:h-[460px] rounded-2xl overflow-hidden bg-[#0B1F3A]">
                    {/* Background image */}
                    <img
                        src={HERO_SLIDES[slide].image}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
                    />
                    {/* Gradient over image */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A] via-[#0B1F3A]/85 to-[#0B1F3A]/30" />

                    {/* Content */}
                    <div className="relative z-10 h-full flex flex-col justify-center px-5 sm:px-8 md:px-10 lg:px-12">
                        <div className="max-w-full sm:max-w-[480px] lg:max-w-[520px] space-y-4 sm:space-y-5">
                            <h1 className="text-white font-bold leading-[1.15] tracking-tight text-[26px] sm:text-[32px] md:text-[38px] lg:text-[42px]">
                                {HERO_SLIDES[slide].title}
                                <br />
                                <span className="text-[#14B8A6]">{HERO_SLIDES[slide].accent}</span>
                            </h1>
                            <p className="text-[#CBD5F5] text-[13px] sm:text-[14px] md:text-[15px] leading-relaxed max-w-[460px]">
                                {HERO_SLIDES[slide].desc}
                            </p>

                            {/* Inline highlights */}
                            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-5 sm:gap-x-6 gap-y-3 pt-1">
                                {HERO_HIGHLIGHTS.map((h) => (
                                    <div key={h.title} className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-[#14B8A6]/15 flex items-center justify-center text-[#14B8A6] shrink-0">
                                            <CheckCircle2 size={14} />
                                        </div>
                                        <div className="leading-tight">
                                            <div className="text-[11px] sm:text-[12px] font-semibold text-white">{h.title}</div>
                                            <div className="text-[10px] sm:text-[11px] text-[#94A3B8]">{h.sub}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-2">
                                <Link
                                    href="/categories"
                                    className="inline-flex items-center gap-2 h-[46px] sm:h-[48px] px-6 sm:px-7 bg-[#14B8A6] hover:bg-[#0EA89A] text-white rounded-xl text-[14px] sm:text-[15px] font-semibold shadow-lg shadow-[#14B8A6]/25 transition-all active:scale-95 no-underline"
                                >
                                    Start Sourcing Now <ArrowRight size={16} />
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* dots */}
                    <div className="absolute bottom-4 sm:bottom-5 left-5 sm:left-8 md:left-10 lg:left-12 z-20 flex gap-2">
                        {HERO_SLIDES.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setSlide(i)}
                                aria-label={`Slide ${i + 1}`}
                                className={`h-1.5 rounded-full transition-all ${slide === i ? 'w-8 bg-[#14B8A6]' : 'w-1.5 bg-white/30 hover:bg-white/60'}`}
                            />
                        ))}
                    </div>
                </section>

                {/* ============================================================
                     3. CUSTOM QUOTE BAR
                ============================================================ */}
                <section className="bg-white border border-[#E5E7EB] rounded-2xl px-5 sm:px-6 py-5 sm:py-5 shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-6">
                        {/* Title */}
                        <div className="lg:pr-6 lg:border-r lg:border-[#E5E7EB] lg:min-w-[230px]">
                            <h3 className="text-[15px] sm:text-[16px] font-bold text-[#0F172A]">Need a custom quote?</h3>
                            <p className="text-[12px] text-[#64748B] mt-1">
                                Tell us what you need and we'll get competitive quotes from our suppliers.
                            </p>
                        </div>

                        {/* Steps */}
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 lg:px-2">
                            {QUOTE_STEPS.map((s) => (
                                <div key={s.title} className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] flex items-center justify-center text-[#14B8A6] shrink-0">
                                        <s.icon size={18} />
                                    </div>
                                    <div className="leading-tight">
                                        <div className="text-[13px] font-semibold text-[#0F172A]">{s.title}</div>
                                        <div className="text-[11px] text-[#64748B] mt-0.5">{s.sub}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* CTA */}
                        <Link
                            href="/contact"
                            className="shrink-0 inline-flex items-center justify-center h-[44px] px-6 border border-[#14B8A6] text-[#14B8A6] hover:bg-[#14B8A6] hover:text-white rounded-xl text-[13px] font-semibold transition-all no-underline"
                        >
                            Request a Quote
                        </Link>
                    </div>
                </section>

                {/* ============================================================
                     4. BROWSE BY BUSINESS CATEGORY
                ============================================================ */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[16px] sm:text-[18px] font-bold text-[#0F172A]">Browse by Business Category</h2>
                        <Link
                            href="/categories"
                            className="text-[12px] sm:text-[13px] font-semibold text-[#14B8A6] hover:underline flex items-center gap-1 no-underline"
                        >
                            View all categories <ArrowRight size={13} />
                        </Link>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        {BUSINESS_CATEGORIES.map((c) => (
                            <Link
                                key={c.slug}
                                href={`/categories/${c.slug}`}
                                className="bg-white border border-[#E5E7EB] rounded-xl p-3 sm:p-4 flex flex-col items-center text-center gap-2 hover:border-[#14B8A6] hover:shadow-sm transition-all no-underline group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] flex items-center justify-center text-[#14B8A6] group-hover:bg-[#14B8A6] group-hover:text-white transition-colors">
                                    <c.icon size={18} />
                                </div>
                                <div className="space-y-0.5">
                                    <div className="text-[11px] sm:text-[12px] font-semibold text-[#0F172A] leading-tight line-clamp-2">{c.name}</div>
                                    <div className="text-[10px] text-[#94A3B8]">{c.count}</div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* ============================================================
                     5. TRUSTED BY LEADING GLOBAL BRANDS
                ============================================================ */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[15px] sm:text-[17px] font-bold text-[#0F172A]">Trusted by Leading Global Brands</h2>
                        <Link href="/brands" className="text-[12px] sm:text-[13px] font-semibold text-[#14B8A6] hover:underline flex items-center gap-1 no-underline">
                            View all brands <ArrowRight size={13} />
                        </Link>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-xl px-3 sm:px-4 py-4">
                        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-3 sm:gap-4">
                            {BRANDS.map((b) => (
                                <div
                                    key={b.name}
                                    className="h-[56px] sm:h-[60px] flex items-center justify-center px-2 rounded-lg hover:bg-[#F8FAFC] transition-colors"
                                >
                                    <img
                                        src={b.logo}
                                        alt={b.name}
                                        className="max-h-[28px] sm:max-h-[32px] w-auto object-contain grayscale opacity-70 hover:opacity-100 hover:grayscale-0 transition-all"
                                        onError={(e) => {
                                            const el = e.currentTarget;
                                            el.style.display = 'none';
                                            const span = document.createElement('span');
                                            span.className = 'text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider';
                                            span.textContent = b.name;
                                            el.parentElement?.appendChild(span);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ============================================================
                     6. TOP CATEGORIES FOR YOUR BUSINESS (large cards)
                ============================================================ */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[16px] sm:text-[18px] font-bold text-[#0F172A]">Top Categories for Your Business</h2>
                        <Link href="/categories" className="text-[12px] sm:text-[13px] font-semibold text-[#14B8A6] hover:underline flex items-center gap-1 no-underline">
                            View all categories <ArrowRight size={13} />
                        </Link>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                        {TOP_BUSINESS_CATEGORIES.map((c) => (
                            <Link
                                key={c.title}
                                href="/categories"
                                className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden group hover:shadow-md hover:border-[#14B8A6]/40 transition-all no-underline"
                            >
                                <div className="aspect-[4/3] overflow-hidden bg-[#F1F5F9]">
                                    <img
                                        src={c.image}
                                        alt={c.title}
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                </div>
                                <div className="p-3 sm:p-4">
                                    <div className="text-[12px] sm:text-[13px] font-bold text-[#0F172A] line-clamp-1">{c.title}</div>
                                    <div className="text-[10px] sm:text-[11px] text-[#64748B] mt-1">{c.count}</div>
                                    <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#14B8A6]">
                                        Explore <ChevronRight size={12} />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* ============================================================
                     7. WHY BUSINESSES CHOOSE ATLANTIS
                ============================================================ */}
                <section className="space-y-6">
                    <h2 className="text-center text-[16px] sm:text-[18px] font-bold text-[#0F172A]">
                        Why Businesses Choose Atlantis
                    </h2>
                    <div className="bg-white border border-[#E5E7EB] rounded-xl px-5 sm:px-6 py-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 lg:gap-4">
                            {WHY_ATLANTIS.map((w) => (
                                <div key={w.title} className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-[#14B8A6]/10 flex items-center justify-center text-[#14B8A6] shrink-0">
                                        <w.icon size={18} />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[12px] sm:text-[13px] font-bold text-[#0F172A]">{w.title}</div>
                                        <div className="text-[11px] text-[#64748B] leading-snug">{w.sub}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ============================================================
                     8. POPULAR WHOLESALE PRODUCTS (carousel)
                ============================================================ */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[16px] sm:text-[18px] font-bold text-[#0F172A]">Popular Wholesale Products</h2>
                        <Link href="/categories" className="text-[12px] sm:text-[13px] font-semibold text-[#14B8A6] hover:underline flex items-center gap-1 no-underline">
                            View all products <ArrowRight size={13} />
                        </Link>
                    </div>

                    <div className="relative">
                        {/* Side arrows (hidden on small) */}
                        <button
                            onClick={() => scrollProducts('left')}
                            aria-label="Previous"
                            className="hidden lg:flex absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center bg-white border border-[#E5E7EB] rounded-full shadow-sm hover:bg-[#F1F5F9]"
                        >
                            <ChevronLeft size={18} className="text-[#0F172A]" />
                        </button>
                        <button
                            onClick={() => scrollProducts('right')}
                            aria-label="Next"
                            className="hidden lg:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center bg-white border border-[#E5E7EB] rounded-full shadow-sm hover:bg-[#F1F5F9]"
                        >
                            <ChevronRight size={18} className="text-[#0F172A]" />
                        </button>

                        {loading ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="animate-pulse space-y-3">
                                        <div className="aspect-square bg-slate-200 rounded-xl" />
                                        <div className="h-3 bg-slate-200 rounded w-3/4" />
                                        <div className="h-3 bg-slate-200 rounded w-1/2" />
                                    </div>
                                ))}
                            </div>
                        ) : products.length === 0 ? (
                            <div className="h-[260px] border-2 border-dashed border-[#E5E7EB] rounded-xl flex flex-col items-center justify-center gap-3 bg-white">
                                <div className="w-14 h-14 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#94A3B8]">
                                    <Package size={28} />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-[14px] font-bold text-[#0F172A]">No products yet</h3>
                                    <p className="text-[12px] text-[#64748B]">We're onboarding suppliers — check back soon.</p>
                                </div>
                            </div>
                        ) : (
                            <div
                                ref={productsRef}
                                className="grid grid-flow-col auto-cols-[minmax(150px,1fr)] sm:auto-cols-[minmax(170px,1fr)] md:auto-cols-[minmax(180px,1fr)] lg:grid-flow-row lg:grid-cols-6 lg:auto-cols-auto gap-3 sm:gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory pb-2 scroll-smooth scrollbar-hide"
                            >
                                {products.slice(0, 12).map((p, i) => (
                                    <div key={p.id} className="snap-start">
                                        <ProductCard product={p} index={i} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* ============================================================
                     9. ORDER IN BULK BANNER
                ============================================================ */}
                <section className="bg-[#0B1F3A] rounded-2xl px-6 sm:px-8 lg:px-10 py-7 sm:py-8 relative overflow-hidden">
                    <div className="absolute -right-20 -top-20 w-80 h-80 bg-[#14B8A6]/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10 flex flex-col md:flex-row items-center md:justify-between gap-6">
                        <div className="flex items-center gap-4 text-center md:text-left">
                            <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center text-[#14B8A6] shrink-0 hidden sm:flex">
                                <Package size={26} />
                            </div>
                            <div>
                                <h3 className="text-white text-[18px] sm:text-[20px] font-bold">Order in Bulk. Save More.</h3>
                                <p className="text-[#CBD5F5] text-[12px] sm:text-[13px] mt-1 max-w-[520px]">
                                    Unlock volume-tier pricing, dedicated account support and fast global shipping.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Link
                                href="/auth/register?role=customer"
                                className="shrink-0 inline-flex items-center justify-center h-[44px] px-6 bg-[#14B8A6] hover:bg-[#0EA89A] text-white rounded-xl text-[13px] font-semibold transition-all shadow-lg shadow-[#14B8A6]/20 active:scale-95 no-underline"
                            >
                                Become a Buyer
                            </Link>
                            <Link
                                href="/contact"
                                className="shrink-0 inline-flex items-center justify-center h-[44px] px-6 border border-white/20 text-white hover:bg-white/5 rounded-xl text-[13px] font-semibold transition-all no-underline"
                            >
                                Contact Sales
                            </Link>
                        </div>
                    </div>
                </section>

            </main>
        </div>
    );
}
