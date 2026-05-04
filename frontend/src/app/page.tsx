'use client';

import * as React from 'react';
import Link from 'next/link';
import { 
    ChevronRight, 
    CheckCircle2, 
    ArrowRight, 
    ShieldCheck, 
    Truck, 
    Globe2, 
    CircleDollarSign, 
    Headphones,
    Monitor,
    Factory,
    Box,
    FileText,
    Home as HomeIcon,
    Stethoscope,
    Shirt,
    Car,
    Star,
    Layout,
    TrendingUp,
    MousePointer2,
    Eye,
    DollarSign,
    Zap,
    Users,
    Package,
    History,
    Shield,
    LayoutList,
    Store,
    ShoppingCart,
    User,
    Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import Navbar from '@/components/layout/Navbar';
import PriceTicker from '@/components/ui/PriceTicker';
import Footer from '@/components/layout/Footer';
import { Marquee } from '@/components/ui/Marquee';
import { apiFetch } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';
import { useLanguage } from '@/contexts/LanguageContext';

// SPEC COLORS:
// Primary Teal: #14B8A6
// Navy Dark: #0F172A
// Background: #F8FAFC
// Card BG: #FFFFFF
// Border: #E5E7EB
// Text Primary: #111827
// Muted Text: #6B7280

const TOP_VALUE_PROPS = [
    { title: 'Verified Global Suppliers', sub: '100% vetted', icon: ShieldCheck },
    { title: 'Competitive Wholesale Prices', sub: 'Best market rates', icon: CircleDollarSign },
    { title: 'Bulk Order Discounts', sub: 'Save more on large orders', icon: Zap },
    { title: 'Global Shipping Solutions', sub: 'Fast & reliable', icon: Truck },
    { title: 'Dedicated B2B Support', sub: "We're here to help", icon: Headphones },
];

const CATEGORIES = [
    { name: 'Beverages & Drinks', count: '0 products', icon: ShoppingCart },
    { name: 'Food & Snacks', count: '0 products', icon: Store },
    { name: 'Electronics & Accessories', count: '0 products', icon: Monitor },
    { name: 'Industrial & Machinery', count: '0 products', icon: Factory },
    { name: 'Packaging & Materials', count: '0 products', icon: Box },
    { name: 'Home & Kitchen Supplies', count: '0 products', icon: HomeIcon },
    { name: 'Health & Personal Care', count: '0 products', icon: Stethoscope },
    { name: 'Automotive & Parts', count: '0 products', icon: Car },
];

const BRANDS = [
    { name: 'Coca Cola',  logo: 'https://logo.clearbit.com/coca-colacompany.com' },
    { name: 'Red Bull',   logo: 'https://logo.clearbit.com/redbull.com' },
    { name: 'Starbucks',  logo: 'https://logo.clearbit.com/starbucks.com' },
    { name: 'Oreo',       logo: 'https://logo.clearbit.com/oreo.com' },
    { name: 'Fanta',      logo: 'https://logo.clearbit.com/fanta.com' },
    { name: 'Ferrero',    logo: 'https://logo.clearbit.com/ferrero.com' },
    { name: 'AXE',        logo: 'https://logo.clearbit.com/axe.com' },
    { name: 'Nutella',    logo: 'https://logo.clearbit.com/nutella.com' },
    { name: 'Kinder',     logo: 'https://logo.clearbit.com/kinder.com' },
    { name: 'Twix',       logo: 'https://logo.clearbit.com/twix.com' },
    { name: 'Nescafe',    logo: 'https://logo.clearbit.com/nescafe.com' },
    { name: "L'Or",       logo: 'https://logo.clearbit.com/loreal.com' },
    { name: 'Pepsi',      logo: 'https://logo.clearbit.com/pepsi.com' },
    { name: 'Nestle',     logo: 'https://logo.clearbit.com/nestle.com' },
    { name: 'Lipton',     logo: 'https://logo.clearbit.com/lipton.com' },
    { name: 'Kellogg\'s', logo: 'https://logo.clearbit.com/kelloggs.com' },
    { name: 'Heinz',      logo: 'https://logo.clearbit.com/heinz.com' },
    { name: 'Unilever',   logo: 'https://logo.clearbit.com/unilever.com' },
    { name: 'P&G',        logo: 'https://logo.clearbit.com/pg.com' },
    { name: 'Mondelez',   logo: 'https://logo.clearbit.com/mondelezinternational.com' },
];

const TOP_CAT_CARDS = [
    {
        title: 'Logistics & Transport',
        items: '0 products',
        image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&q=80&w=900',
    },
    {
        title: 'Supply Chain Technology',
        items: '0 products',
        image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=900',
    },
    {
        title: 'Industrial & Containers',
        items: '0 products',
        image: 'https://images.unsplash.com/photo-1494412519320-aa613dfb7738?auto=format&fit=crop&q=80&w=900',
    },
    {
        title: 'Warehousing & Storage',
        items: '0 products',
        image: 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&q=80&w=900',
    },
];

const WHY_US = [
    { title: 'B2B Focused', desc: 'Built specifically for business buyers', icon: Target },
    { title: 'Competitive Pricing', desc: 'Lower wholesale prices with volume-based discounts', icon: CircleDollarSign },
    { title: 'Reliable Global Shipping', desc: 'Fast and secure delivery to your business anywhere', icon: Truck },
    { title: 'Dedicated Account Support', desc: 'Personal account managers and 24/7 business support', icon: Headphones },
    { title: 'Secure & Flexible Payments', desc: 'Multiple payment options with trade assurance', icon: ShieldCheck },
];

function Target(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
        </svg>
    );
}

const FEATURED_PRODUCTS = [
    { name: 'Bluetooth Earbuds Pro', model: 'EB-2024', moq: '50 pcs', price: '$12.45', image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&q=80&w=300' },
    { name: 'Cordless Drill 20V', model: 'CD-201', moq: '20 pcs', price: '$68.90', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&q=80&w=300' },
    { name: 'Corrugated Shipping Boxes', model: 'BOX-500', moq: '1000 pcs', price: '$0.45', image: 'https://images.unsplash.com/photo-1589939705384-5185138a047a?auto=format&fit=crop&q=80&w=300' },
    { name: 'Ergonomic Office Chair', model: 'OC-500', moq: '10 pcs', price: '$45.75', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=300' },
    { name: 'Laundry Detergent 5L', model: 'LD-200', moq: '100 pcs', price: '$6.25', image: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&q=80&w=300' },
    { name: 'LED Bulb 12W', model: 'LB-100', moq: '500 pcs', price: '$1.20', image: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=300' },
];

function HeroCarousel() {
    const { t } = useLanguage();
    const slides = [
        {
            label: t('home', 'hero.globalLogistics'),
            title: t('home', 'hero.globalSourcing'),
            desc: t('home', 'hero.logisticsDesc'),
            features: [
                { icon: Package, title: t('home', 'hero.lowMoq'), sub: t('home', 'hero.startSmall') },
                { icon: Truck, title: t('home', 'hero.globalShipping'), sub: t('home', 'hero.reliableDelivery') },
                { icon: ShieldCheck, title: t('home', 'hero.verifiedSources'), sub: t('home', 'hero.factoryInspection') }
            ],
            image: "/hero/1.png"
        },
        {
            label: t('home', 'hero.premiumNetwork'),
            title: t('home', 'hero.bulkOrders'),
            desc: t('home', 'hero.savingsDesc'),
            features: [
                { icon: TrendingUp, title: t('home', 'hero.volumeDiscounts'), sub: t('home', 'hero.buyMore') },
                { icon: CircleDollarSign, title: t('home', 'hero.flexiblePayments'), sub: t('home', 'hero.tradeTerms') },
                { icon: Headphones, title: t('home', 'hero.dedicatedSupport'), sub: t('home', 'hero.accountHelp') }
            ],
            image: "/hero/2.png"
        },
        {
            label: t('home', 'hero.smartChain'),
            title: t('home', 'hero.factoriesVerified'),
            desc: t('home', 'hero.vettedDesc'),
            features: [
                { icon: ShieldCheck, title: t('home', 'hero.vettedSources'), sub: t('home', 'hero.verifiedSources') },
                { icon: CheckCircle2, title: t('home', 'hero.qualityControl'), sub: t('home', 'hero.inspectionProtocols') },
                { icon: Star, title: t('home', 'hero.premiumBrands'), sub: t('home', 'hero.topGlobalNames') }
            ],
            image: "/hero/3.png"
        },
        {
            label: t('home', 'hero.integratedWarehouse'),
            title: t('home', 'hero.fasterGrowth'),
            desc: t('home', 'hero.streamlineDesc'),
            features: [
                { icon: Zap, title: t('home', 'hero.fastTransit'), sub: t('home', 'hero.reducedTime') },
                { icon: History, title: t('home', 'hero.liveTracking'), sub: t('home', 'hero.realTimeVisibility') },
                { icon: Box, title: t('home', 'hero.safeHandling'), sub: t('home', 'hero.premiumStandards') }
            ],
            image: "/hero/4.png"
        }
    ];
    const [index, setIndex] = React.useState(0);

    React.useEffect(() => {
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % slides.length);
        }, 6000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="relative w-full h-full overflow-hidden">
            <AnimatePresence mode="wait">
                <motion.div
                    key={index}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                    className="absolute inset-0 w-full h-full flex"
                >
                    {/* LEFT CONTENT AREA */}
                    <div className="w-1/2 bg-[#0B1F3A] pl-[64px] flex flex-col justify-center relative h-full z-10">
                        {/* THE CONTENT BOX (Max 520px) */}
                        <div className="max-w-[520px] space-y-8">
                            
                            {/* 1. Label & Title */}
                            <div className="space-y-3">
                                {slides[index].label && (
                                    <p className="text-[14px] font-medium text-[#94A3B8] tracking-[0.5px] uppercase">
                                        {slides[index].label}
                                    </p>
                                )}
                                <h1 className="text-[48px] font-bold text-white leading-[56px] tracking-[-0.5px] whitespace-pre-line">
                                    {slides[index].title.split('\n')[0]}
                                    <br />
                                    <span className="text-[#2EC4B6]">
                                        {slides[index].title.split('\n')[1]}
                                    </span>
                                </h1>
                            </div>

                            {/* 2. Description */}
                            <p className="text-[16px] leading-[26px] text-[#CBD5F5] font-normal max-w-[420px]">
                                {slides[index].desc}
                            </p>

                            {/* 3. Feature List */}
                            <div className="space-y-4">
                                {slides[index].features.map((f, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-[#2EC4B6]/10 flex items-center justify-center text-[#2EC4B6] shrink-0">
                                            <f.icon size={20} />
                                        </div>
                                        <div className="flex flex-col">
                                            <h4 className="text-[15px] font-semibold text-white leading-tight">
                                                {f.title}
                                            </h4>
                                            <p className="text-[13px] font-normal text-[#94A3B8] leading-tight">
                                                {f.sub}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 4. CTA Button */}
                            <div className="pt-2">
                                <Link href="/categories" className="h-[52px] px-[28px] bg-[#2EC4B6] hover:brightness-110 text-white rounded-[14px] text-[16px] font-semibold transition-all shadow-lg hover:shadow-[#2EC4B6]/25 active:scale-95 flex items-center gap-3 no-underline">
                                    {t('home', 'hero.startSourcing')} <ChevronRight size={18} />
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT IMAGE AREA */}
                    <div className="w-1/2 relative h-full">
                        <img 
                            src={slides[index].image} 
                            alt={slides[index].title} 
                            className="h-full w-full object-cover object-center"
                        />
                        {/* THE GRADIENT OVERLAY */}
                        <div 
                            className="absolute inset-0 z-0"
                            style={{
                                background: "linear-gradient(90deg, #0B1F3A 0%, rgba(11,31,58,0.85) 45%, rgba(11,31,58,0.0) 100%)"
                            }}
                        />
                    </div>
                </motion.div>
            </AnimatePresence>
            
            {/* Slide Indicators */}
            <div className="absolute bottom-8 left-[64px] z-20 flex gap-3">
                {slides.map((_, i) => (
                    <button 
                        key={i}
                        onClick={() => setIndex(i)}
                        className={cn(
                            "h-1.5 rounded-full transition-all duration-700",
                            index === i ? "bg-[#2EC4B6] w-10" : "bg-white/20 hover:bg-white/40 w-1.5"
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

export default function HomePage() {
    const { t } = useLanguage();
    // HERO CAROUSEL DATA
    const HERO_SLIDES = [
        {
            title: t('home', 'hero.yourB2BPartner'),
            desc: t('home', 'hero.bulkDesc'),
            image: "/Images/4.png"
        },
        {
            title: t('home', 'hero.directSourcing'),
            desc: t('home', 'hero.eliminateMiddlemen'),
            image: "/Images/1.png"
        },
        {
            title: t('home', 'hero.seamlessLogistics'),
            desc: t('home', 'hero.expertHandling'),
            image: "/Images/2.png"
        },
        {
            title: t('home', 'hero.globalExpansion'),
            desc: t('home', 'hero.scaleBrand'),
            image: "/Images/3.png"
        }
    ];

    const [currentSlide, setCurrentSlide] = React.useState(0);

    React.useEffect(() => {
        const timer = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    const [products, setProducts] = React.useState<any[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = React.useState(true);

    React.useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await apiFetch('/products?limit=6&status=APPROVED&sort=popular');
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data.data || []);
                }
            } catch (err) {
                console.error('Failed to fetch products:', err);
            } finally {
                setIsLoadingProducts(false);
            }
        };
        fetchProducts();
    }, []);

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-[#111827]">
            <Navbar />
            <PriceTicker />

            {/* 1. TOP FEATURE BAR (Above Hero) */}
            <div className="bg-white border-b border-[#E5E7EB] py-3 hidden md:block">
                <div className="max-w-[1440px] mx-auto px-10 flex items-center justify-between">
                    {[
                        { icon: CheckCircle2, text: t('home', 'verifiedGlobalSuppliers') },
                        { icon: TrendingUp, text: t('home', 'competitiveWholesalePrices') },
                        { icon: Package, text: t('home', 'bulkOrderDiscounts') },
                        { icon: Truck, text: t('home', 'globalShippingSolutions') },
                        { icon: Headphones, text: t('home', 'dedicatedB2BSupport') }
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <item.icon size={16} className="text-[#2EC4B6]" />
                            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">{item.text}</span>
                        </div>
                    ))}
                </div>
            </div>

            <main className="flex-1 max-w-[1440px] mx-auto w-full px-6 py-8 space-y-12">
                
                {/* 2. PREMIUM HERO SECTION (CAROUSEL) */}
                <section className="relative h-[520px] rounded-[24px] overflow-hidden group shadow-2xl bg-[#0B1F3A]">
                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={currentSlide}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.8 }}
                            className="absolute inset-0 flex"
                        >
                            {/* Left Text Block */}
                            <div className="w-[45%] h-full flex flex-col justify-center px-16 relative z-20">
                                <motion.div
                                    initial={{ x: -20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="space-y-8"
                                >
                                    <div className="space-y-4">
                                        <h1 className="text-[52px] font-black text-white leading-[1.1] tracking-tight">
                                            {HERO_SLIDES[currentSlide].title}
                                        </h1>
                                        <p className="text-[17px] text-[#94A3B8] leading-relaxed max-w-[540px] font-medium">
                                            {HERO_SLIDES[currentSlide].desc}
                                        </p>
                                    </div>

                                    {/* Constant Feature Icons */}
                                    <div className="flex items-center gap-8 py-2">
                                        {[
                                            { icon: ShieldCheck, label: t('home', 'verifiedGlobalSuppliers'), sub: t('home', 'hero.verifiedSources') },
                                            { icon: TrendingUp, label: t('home', 'competitiveWholesalePrices'), sub: t('home', 'hero.buyMore') },
                                            { icon: Truck, label: t('home', 'globalShippingSolutions'), sub: t('home', 'hero.reliableDelivery') },
                                            { icon: Shield, label: t('home', 'paymentDesc'), sub: t('home', 'hero.tradeTerms') }
                                        ].map((item, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-[#2EC4B6] border border-white/10">
                                                    <item.icon size={18} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-bold text-white tracking-tight leading-none mb-1">{item.label}</span>
                                                    <span className="text-[10px] text-[#64748B] font-medium leading-none">{item.sub}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-4 pt-4">
                                        <Link href="/categories" className="h-[56px] px-10 bg-[#2EC4B6] hover:brightness-110 text-white rounded-[16px] text-[16px] font-bold transition-all shadow-xl shadow-[#2EC4B6]/20 active:scale-95 flex items-center gap-3 no-underline">
                                            {t('home', 'hero.startSourcing')} <ArrowRight size={20} />
                                        </Link>
                                        <Link href="/how-it-works" className="h-[56px] px-8 bg-white/5 hover:bg-white/10 text-white rounded-[16px] text-[15px] font-bold transition-all border border-white/10 backdrop-blur-sm flex items-center justify-center no-underline">
                                            {t('home', 'hero.howItWorks')}
                                        </Link>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Right Image Block */}
                            <div className="w-[55%] h-full relative overflow-hidden bg-[#0B1F3A]">
                                <motion.img 
                                    initial={{ scale: 1.1, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ duration: 1.2, ease: "easeOut" }}
                                    src={HERO_SLIDES[currentSlide].image} 
                                    alt="Hero Slide" 
                                    className="w-full h-full object-cover" 
                                />
                                <div className="absolute inset-y-0 -left-1 w-64 bg-gradient-to-r from-[#0B1F3A] via-[#0B1F3A]/80 to-transparent z-10" />
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    {/* Slider Navigation Dots */}
                    <div className="absolute bottom-8 left-16 z-30 flex gap-2">
                        {HERO_SLIDES.map((_, i) => (
                            <button 
                                key={i}
                                onClick={() => setCurrentSlide(i)}
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-500",
                                    currentSlide === i ? 'w-10 bg-[#2EC4B6]' : 'w-2 bg-white/20 hover:bg-white/40'
                                )}
                            />
                        ))}
                    </div>
                </section>

                {/* 3. QUICK ACTION BAR (Custom Quote) */}
                <section className="bg-white border border-[#E5E7EB] rounded-[24px] p-6 shadow-sm hover:shadow-xl hover:border-[#2EC4B6]/30 transition-all duration-500">
                    <div className="flex items-center">
                        {/* Title Section */}
                        <div className="space-y-1 pr-10 border-r border-[#E5E7EB] shrink-0">
                            <h3 className="text-[18px] font-black text-[#0F172A] tracking-tight">{t('home', 'customQuote')}</h3>
                            <p className="text-[12px] text-[#64748B] font-medium">{t('home', 'tailoredOffer')}</p>
                        </div>

                        {/* Steps Section (Expanded) */}
                        <div className="flex-1 flex items-center justify-start gap-12 px-10 overflow-hidden">
                            {[
                                { icon: LayoutList, title: t('home', 'fillRequirements'), desc: t('home', 'addProducts') },
                                { icon: Headphones, title: t('home', 'expertReview'), desc: t('home', 'validateSpecs') },
                                { icon: Store, title: t('home', 'receiveQuotes'), desc: t('home', 'compareOffers') }
                            ].map((step, i) => (
                                <div key={i} className="flex items-center gap-4 whitespace-nowrap group cursor-pointer">
                                    <div className="w-12 h-12 rounded-2xl bg-[#F8FAFC] flex items-center justify-center text-[#2EC4B6] border border-[#E5E7EB] group-hover:bg-[#2EC4B6] group-hover:text-white group-hover:border-[#2EC4B6] transition-all duration-300 shadow-sm">
                                        <step.icon size={22} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[13px] font-bold text-[#111827] leading-none mb-1 group-hover:text-[#2EC4B6] transition-colors">{step.title}</span>
                                        <span className="text-[11px] text-[#64748B] font-medium leading-none">{step.desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Right Button (Minimal Gap) */}
                        <div className="shrink-0">
                            <button className="h-[52px] px-10 bg-[#0B1F3A] text-white hover:bg-[#2EC4B6] rounded-[16px] text-[14px] font-black uppercase transition-all active:scale-95 shadow-lg shadow-black/10">
                                {t('home', 'requestQuote')}
                            </button>
                        </div>
                    </div>
                </section>

                {/* 4. BROWSE BY BUSINESS CATEGORY */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[18px] font-black text-[#0B1F3A] tracking-tight">{t('home', 'browseByCategory')}</h2>
                        <Link href="/categories" className="text-[13px] font-bold text-[#2EC4B6] flex items-center gap-1 hover:underline group no-underline">
                            {t('home', 'viewAllCategories')} <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-6 shadow-sm">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6">
                            {[
                                { name: 'Electronics & Accessories', icon: Monitor, count: '0 products' },
                                { name: 'Industrial & Machinery', icon: Package, count: '0 products' },
                                { name: 'Packaging & Materials', icon: ShoppingCart, count: '0 products' },
                                { name: 'Office & Stationery', icon: LayoutList, count: '0 products' },
                                { name: 'Home & Kitchen Supplies', icon: Store, count: '0 products' },
                                { name: 'Health & Personal Care', icon: Headphones, count: '0 products' },
                                { name: 'Fashion & Textiles', icon: User, count: '0 products' },
                                { name: 'Automotive & Parts', icon: Truck, count: '0 products' }
                            ].map((cat, i) => (
                                <Link 
                                    key={i} 
                                    href={`/categories/${cat.name.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-')}`} 
                                    className="flex items-center gap-3 group no-underline"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-[#F8FAFC] border border-[#E5E7EB] flex items-center justify-center text-[#2EC4B6] group-hover:bg-[#2EC4B6] group-hover:text-white transition-all shrink-0">
                                        <cat.icon size={20} strokeWidth={2} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <h4 className="text-[11px] font-black text-[#0B1F3A] leading-tight line-clamp-2 group-hover:text-[#2EC4B6] transition-colors">{cat.name}</h4>
                                        <p className="text-[10px] text-[#94A3B8] font-bold mt-0.5">{cat.count}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 5. BRAND LOGOS (Marquee) */}
                <section className="space-y-4 overflow-hidden">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[20px] font-bold">{t('home', 'trustedByBrands')}</h2>
                        <Link href="/brands" className="text-[13px] font-bold text-[#2EC4B6] flex items-center gap-1 hover:underline">
                            {t('home', 'viewAllBrands')} <ArrowRight size={14} />
                        </Link>
                    </div>
                    <div className="relative py-4">
                        <Marquee baseVelocity={-2}>
                            <div className="flex gap-6 pr-6 shrink-0 w-max">
                                {BRANDS.map((brand, i) => (
                                    <div key={`${brand.name}-${i}`} className="h-[80px] px-10 bg-white border border-[#E5E7EB] rounded-[24px] flex items-center justify-center shrink-0 grayscale hover:grayscale-0 transition-all cursor-pointer shadow-sm hover:shadow-xl hover:border-[#2EC4B6]/30 group">
                                        <img 
                                            src={brand.logo} 
                                            alt={brand.name} 
                                            className="h-10 w-auto object-contain opacity-50 group-hover:opacity-100 transition-opacity" 
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-[14px] font-black text-slate-300 uppercase tracking-widest">${brand.name}</span>`;
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </Marquee>
                        
                        {/* Gradient Fades */}
                        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#F8FAFC] via-[#F8FAFC]/50 to-transparent z-10 pointer-events-none" />
                        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#F8FAFC] via-[#F8FAFC]/50 to-transparent z-10 pointer-events-none" />
                    </div>
                </section>

                {/* 6. TOP CATEGORIES (Large Cards) */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[20px] font-bold text-[#111827]">{t('home', 'topCategoriesTitle')}</h2>
                        <Link href="/categories" className="text-[13px] font-bold text-[#2EC4B6] flex items-center gap-1 hover:underline">
                            {t('home', 'viewAllCategories')} <ArrowRight size={14} />
                        </Link>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {TOP_CAT_CARDS.map((cat, i) => (
                            <Link key={i} href="/categories" className="bg-white border border-[#E5E7EB] rounded-[16px] overflow-hidden group hover:shadow-xl transition-all">
                                <div className="h-[180px] overflow-hidden bg-gradient-to-br from-[#F8FAFC] to-[#E5E7EB] flex items-center justify-center">
                                    <img
                                        src={cat.image}
                                        alt={cat.title}
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                        onError={(e) => {
                                            const t = e.target as HTMLImageElement;
                                            t.style.display = 'none';
                                            const parent = t.parentElement;
                                            if (parent && !parent.querySelector('.fallback-icon')) {
                                                const div = document.createElement('div');
                                                div.className = 'fallback-icon flex items-center justify-center w-full h-full text-[#94A3B8]';
                                                div.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
                                                parent.appendChild(div);
                                            }
                                        }}
                                    />
                                </div>
                                <div className="p-5 space-y-2">
                                    <h3 className="text-[14px] font-bold group-hover:text-[#2EC4B6] transition-colors line-clamp-1">{cat.title}</h3>
                                    <p className="text-[11px] text-[#6B7280]">{cat.items}</p>
                                    <div className="pt-1 flex items-center text-[12px] font-bold text-[#2EC4B6]">
                                        {t('home', 'explore')} <ChevronRight size={14} />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* 7. WHY CHOOSE US */}
                <section className="space-y-8 py-8">
                    <div className="text-center">
                        <h2 className="text-[24px] font-bold text-[#111827]">{t('home', 'whyChooseUs')}</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        {[
                            { title: t('home', 'b2bFocus'), desc: t('home', 'b2bFocusDesc'), icon: Package },
                            { title: t('home', 'competitiveWholesalePrices'), desc: t('home', 'pricingDesc'), icon: TrendingUp },
                            { title: t('home', 'globalShippingSolutions'), desc: t('home', 'shippingDesc'), icon: Truck },
                            { title: t('home', 'dedicatedB2BSupport'), desc: t('home', 'supportDesc'), icon: Headphones },
                            { title: t('home', 'secureFlexiblePayments'), desc: t('home', 'paymentDesc'), icon: ShieldCheck }
                        ].map((item, i) => (
                            <div key={i} className="flex items-start gap-4 p-2">
                                <div className="w-12 h-12 rounded-full bg-[#F8FAFC] flex items-center justify-center text-[#2EC4B6] shrink-0 border border-[#E5E7EB] group-hover:bg-[#2EC4B6] group-hover:text-white transition-all">
                                    <item.icon size={22} />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-[14px] font-bold text-[#111827]">{item.title}</h3>
                                    <p className="text-[12px] text-[#64748B] leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 8. POPULAR WHOLESALE PRODUCTS (No Fake Data) */}
                <section className="space-y-8">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[20px] font-bold text-[#111827]">{t('home', 'popularWholesale')}</h2>
                        <Link href="/categories" className="text-[13px] font-bold text-[#2EC4B6] flex items-center gap-1 hover:underline no-underline">
                            {t('home', 'viewAllProducts')} <ArrowRight size={14} />
                        </Link>
                    </div>
                    
                    {isLoadingProducts ? (
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="animate-pulse space-y-4">
                                    <div className="aspect-square bg-slate-200 rounded-2xl" />
                                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                                    <div className="h-4 bg-slate-200 rounded w-1/2" />
                                </div>
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <div className="h-[300px] border-2 border-dashed border-[#E5E7EB] rounded-[20px] flex flex-col items-center justify-center space-y-4 bg-white/50">
                            <div className="w-16 h-16 rounded-full bg-[#F8FAFC] flex items-center justify-center text-[#94A3B8]">
                                <Package size={32} />
                            </div>
                            <div className="text-center">
                                <h3 className="text-[16px] font-bold text-[#111827]">{t('home', 'noProductsYet')}</h3>
                                <p className="text-[13px] text-[#64748B]">{t('home', 'onboardingSuppliers')}</p>
                            </div>
                            <button className="px-6 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-[8px] text-[13px] font-bold hover:bg-white transition-all">
                                {t('home', 'notifyMe')}
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
                            {products.slice(0, 6).map((prod, idx) => (
                                <ProductCard key={prod.id} product={prod} index={idx} />
                            ))}
                        </div>
                    )}
                </section>

                {/* 9. STATS BANNER (Truthful Data) */}
                <section className="bg-[#0F172A] rounded-[20px] p-10 relative overflow-hidden group shadow-2xl">
                    <div className="absolute top-0 right-0 w-1/3 h-full bg-[#2EC4B6]/10 blur-[100px] -rotate-12" />
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center text-[#2EC4B6] border border-white/10 shadow-inner">
                                <Package size={32} />
                            </div>
                             <div className="space-y-1">
                                <h2 className="text-[26px] font-bold text-white tracking-tight">{t('home', 'expandingNetwork')}</h2>
                                <p className="text-[15px] text-[#CBD5F5] opacity-80">{t('home', 'firstWave')}</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-12 border-l border-white/10 pl-12 hidden lg:flex">
                            <div className="text-center">
                                <p className="text-[32px] font-black text-[#2EC4B6]">0</p>
                                <p className="text-[11px] text-[#CBD5F5] uppercase tracking-wider font-bold">{t('home', 'activeBuyers')}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[32px] font-black text-[#2EC4B6]">0</p>
                                <p className="text-[11px] text-[#CBD5F5] uppercase tracking-wider font-bold">{t('home', 'verifiedSuppliers')}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[32px] font-black text-[#2EC4B6]">Global</p>
                                <p className="text-[11px] text-[#CBD5F5] uppercase tracking-wider font-bold">{t('home', 'globalVision')}</p>
                            </div>
                        </div>

                        <Link 
                            href="/auth/register?role=customer&fixed=true"
                            className="h-[52px] px-10 bg-[#2EC4B6] hover:brightness-110 text-white rounded-[14px] text-[15px] font-bold transition-all shadow-xl shadow-[#2EC4B6]/20 active:scale-95 flex items-center justify-center no-underline"
                        >
                            {t('home', 'becomeBuyer')}
                        </Link>
                    </div>
                </section>

            </main>
        </div>
    );
}
