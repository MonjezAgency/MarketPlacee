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
import Footer from '@/components/layout/Footer';
import { Marquee } from '@/components/ui/Marquee';
import { apiFetch } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';

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
    { name: 'Coca Cola', logo: '/Logos/cocacola.png' },
    { name: 'Red Bull', logo: '/Logos/redbull.png' },
    { name: 'Starbucks', logo: '/Logos/starbucks.png' },
    { name: 'Oreo', logo: '/Logos/oreo.png' },
    { name: 'Fanta', logo: '/Logos/fanta.png' },
    { name: 'Ferrero', logo: '/Logos/ferrero.png' },
    { name: 'AXE', logo: '/Logos/axe.png' },
    { name: 'Nutella', logo: '/Logos/nutella.png' },
    { name: 'Kinder', logo: '/Logos/kinder.png' },
    { name: 'Twix', logo: '/Logos/twix.png' },
    { name: 'Nescafe', logo: '/Logos/nescafe.png' },
    { name: 'L\'Or', logo: '/Logos/lor.png' },
];

const TOP_CAT_CARDS = [
    { title: 'Electronics & Accessories', items: '0 products', image: '/marketplace/img1.png' },
    { title: 'Industrial & Machinery', items: '0 products', image: '/marketplace/img2.png' },
    { title: 'Packaging & Materials', items: '0 products', image: '/marketplace/img3.png' },
    { title: 'Home & Kitchen Supplies', items: '0 products', image: '/marketplace/img4.png' },
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
    { name: 'Bluetooth Earbuds Pro', model: 'EB-2024', moq: '50 units', price: '$12.45', image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&q=80&w=300' },
    { name: 'Cordless Drill 20V', model: 'CD-201', moq: '20 units', price: '$68.90', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&q=80&w=300' },
    { name: 'Corrugated Shipping Boxes', model: 'BOX-500', moq: '1000 units', price: '$0.45', image: 'https://images.unsplash.com/photo-1589939705384-5185138a047a?auto=format&fit=crop&q=80&w=300' },
    { name: 'Ergonomic Office Chair', model: 'OC-500', moq: '10 units', price: '$45.75', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=300' },
    { name: 'Laundry Detergent 5L', model: 'LD-200', moq: '100 units', price: '$6.25', image: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&q=80&w=300' },
    { name: 'LED Bulb 12W', model: 'LB-100', moq: '500 units', price: '$1.20', image: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=300' },
];

function HeroCarousel() {
    const slides = [
        {
            label: "GLOBAL LOGISTICS SOLUTIONS",
            title: "Global Sourcing.\nSeamless Delivery",
            desc: "From factory to your warehouse, we handle the logistics so you can focus on growth.",
            features: [
                { icon: Package, title: "Low MOQs", sub: "Start small, grow big" },
                { icon: Truck, title: "Global Shipping", sub: "Reliable & fast delivery" },
                { icon: ShieldCheck, title: "Verified Sources", sub: "100% factory inspection" }
            ],
            image: "/hero/1.png"
        },
        {
            label: "PREMIUM B2B NETWORK",
            title: "Bulk Orders.\nBigger Savings",
            desc: "Access exclusive wholesale prices and flexible ordering for verified business entities.",
            features: [
                { icon: TrendingUp, title: "Volume Discounts", sub: "Buy more, pay less" },
                { icon: CircleDollarSign, title: "Flexible Payments", sub: "Secure trade terms" },
                { icon: Headphones, title: "24/7 Support", sub: "Dedicated account help" }
            ],
            image: "/hero/2.png"
        },
        {
            label: "SMART SUPPLY CHAIN",
            title: "Verified Factories.\nQuality Assured",
            desc: "Every supplier on Atlantis is strictly vetted to ensure premium quality and reliability.",
            features: [
                { icon: ShieldCheck, title: "Vetted Sources", sub: "100% verified factories" },
                { icon: CheckCircle2, title: "Quality Control", sub: "Strict inspection protocols" },
                { icon: Star, title: "Premium Brands", sub: "Top global names" }
            ],
            image: "/hero/3.png"
        },
        {
            label: "INTEGRATED WAREHOUSING",
            title: "Smart Logistics.\nFaster Growth",
            desc: "Streamline your supply chain with our integrated logistics and warehousing solutions.",
            features: [
                { icon: Zap, title: "Fast Transit", sub: "Reduced shipping times" },
                { icon: History, title: "Live Tracking", sub: "Real-time visibility" },
                { icon: Box, title: "Safe Handling", sub: "Premium standards" }
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
                                <button className="h-[52px] px-[28px] bg-[#2EC4B6] hover:brightness-110 text-white rounded-[14px] text-[16px] font-semibold transition-all shadow-lg hover:shadow-[#2EC4B6]/25 active:scale-95 flex items-center gap-3">
                                    Start Sourcing Now <ChevronRight size={18} />
                                </button>
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

export default function Home() {
    // HERO CAROUSEL DATA
    const HERO_SLIDES = [
        {
            title: <>Your <span className="text-[#2EC4B6]">B2B</span> Partner for<br />Global Wholesale</>,
            desc: "Source quality products in bulk from verified suppliers worldwide. Better prices, reliable shipping, and business growth—together.",
            image: "/Images/4.png"
        },
        {
            title: <>Direct <span className="text-[#2EC4B6]">Sourcing</span> from<br />Verified Factories</>,
            desc: "Eliminate middlemen and get factory-direct pricing for your business inventory.",
            image: "/Images/1.png"
        },
        {
            title: <>Seamless <span className="text-[#2EC4B6]">Logistics</span><br />to Your Door</>,
            desc: "Expert handling of shipping, customs, and delivery so you can focus on selling.",
            image: "/Images/2.png"
        },
        {
            title: <>Global <span className="text-[#2EC4B6]">Expansion</span><br />Made Simple</>,
            desc: "Scale your brand by reaching new markets with our end-to-end trade infrastructure.",
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

            {/* 1. TOP FEATURE BAR (Above Hero) */}
            <div className="bg-white border-b border-[#E5E7EB] py-3 hidden md:block">
                <div className="max-w-[1440px] mx-auto px-10 flex items-center justify-between">
                    {[
                        { icon: CheckCircle2, text: "Verified Global Suppliers" },
                        { icon: TrendingUp, text: "Competitive Wholesale Prices" },
                        { icon: Package, text: "Bulk Order Discounts" },
                        { icon: Truck, text: "Global Shipping Solutions" },
                        { icon: Headphones, text: "Dedicated B2B Support" }
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
                                            { icon: ShieldCheck, label: "Verified Partners", sub: "100% vetted" },
                                            { icon: TrendingUp, label: "Direct Pricing", sub: "Lower costs" },
                                            { icon: Truck, label: "Global Logistics", sub: "Fast & reliable" },
                                            { icon: Shield, label: "Secure Payments", sub: "Safe transactions" }
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
                                            Start Sourcing Now <ArrowRight size={20} />
                                        </Link>
                                        <Link href="/how-it-works" className="h-[56px] px-8 bg-white/5 hover:bg-white/10 text-white rounded-[16px] text-[15px] font-bold transition-all border border-white/10 backdrop-blur-sm flex items-center justify-center no-underline">
                                            How it works?
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
                            <h3 className="text-[18px] font-black text-[#0F172A] tracking-tight">Need a custom quote?</h3>
                            <p className="text-[12px] text-[#64748B] font-medium">Get a tailored offer within 24 hours.</p>
                        </div>

                        {/* Steps Section (Expanded) */}
                        <div className="flex-1 flex items-center justify-start gap-12 px-10 overflow-hidden">
                            {[
                                { icon: LayoutList, title: "Fill Requirements", desc: "Add products & quantities" },
                                { icon: Headphones, title: "Expert Review", desc: "Our team validates specs" },
                                { icon: Store, title: "Receive Quotes", desc: "Compare best wholesale offers" }
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
                                Request a Quote
                            </button>
                        </div>
                    </div>
                </section>

                {/* 4. BROWSE BY BUSINESS CATEGORY */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[18px] font-black text-[#0B1F3A] tracking-tight">Browse by Business Category</h2>
                        <Link href="/categories" className="text-[13px] font-bold text-[#2EC4B6] flex items-center gap-1 hover:underline group no-underline">
                            View all categories <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
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
                        <h2 className="text-[20px] font-bold">Trusted by Leading Global Brands</h2>
                        <Link href="/brands" className="text-[13px] font-bold text-[#2EC4B6] flex items-center gap-1 hover:underline">
                            View all brands <ArrowRight size={14} />
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
                        <h2 className="text-[20px] font-bold text-[#111827]">Top Categories for Your Business</h2>
                        <Link href="/categories" className="text-[13px] font-bold text-[#2EC4B6] flex items-center gap-1 hover:underline">
                            View all categories <ArrowRight size={14} />
                        </Link>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {TOP_CAT_CARDS.map((cat, i) => (
                            <Link key={i} href="/categories" className="bg-white border border-[#E5E7EB] rounded-[16px] overflow-hidden group hover:shadow-xl transition-all">
                                <div className="h-[180px] overflow-hidden bg-[#F8FAFC]">
                                    <img src={cat.image} alt={cat.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                </div>
                                <div className="p-5 space-y-2">
                                    <h3 className="text-[14px] font-bold group-hover:text-[#2EC4B6] transition-colors line-clamp-1">{cat.title}</h3>
                                    <p className="text-[11px] text-[#6B7280]">{cat.items}</p>
                                    <div className="pt-1 flex items-center text-[12px] font-bold text-[#2EC4B6]">
                                        Explore <ChevronRight size={14} />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* 7. WHY CHOOSE US */}
                <section className="space-y-8 py-8">
                    <div className="text-center">
                        <h2 className="text-[24px] font-bold text-[#111827]">Why Businesses Choose Atlantis</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        {[
                            { title: "B2B Wholesale Focus", desc: "Built specifically for business buyers and bulk purchasing.", icon: Package },
                            { title: "Competitive Pricing", desc: "Lower wholesale prices with volume-based discounts.", icon: TrendingUp },
                            { title: "Reliable Global Shipping", desc: "Fast and secure delivery to your business anywhere.", icon: Truck },
                            { title: "Dedicated Account Support", desc: "Personal account managers and 24/7 business support.", icon: Headphones },
                            { title: "Secure & Flexible Payments", desc: "Multiple payment options with trade assurance.", icon: ShieldCheck }
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
                        <h2 className="text-[20px] font-bold text-[#111827]">Popular Wholesale Products</h2>
                        <Link href="/categories" className="text-[13px] font-bold text-[#2EC4B6] flex items-center gap-1 hover:underline no-underline">
                            View all products <ArrowRight size={14} />
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
                                <h3 className="text-[16px] font-bold text-[#111827]">No products available yet</h3>
                                <p className="text-[13px] text-[#64748B]">We are currently onboarding top suppliers. Check back soon!</p>
                            </div>
                            <button className="px-6 py-2 bg-[#F8FAFC] border border-[#E5E7EB] rounded-[8px] text-[13px] font-bold hover:bg-white transition-all">
                                Notify Me
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
                                <h2 className="text-[26px] font-bold text-white tracking-tight">Expanding Our Network.</h2>
                                <p className="text-[15px] text-[#CBD5F5] opacity-80">Be part of the first wave of elite businesses on Atlantis.</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-12 border-l border-white/10 pl-12 hidden lg:flex">
                            <div className="text-center">
                                <p className="text-[32px] font-black text-[#2EC4B6]">0</p>
                                <p className="text-[11px] text-[#CBD5F5] uppercase tracking-wider font-bold">Active Buyers</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[32px] font-black text-[#2EC4B6]">0</p>
                                <p className="text-[11px] text-[#CBD5F5] uppercase tracking-wider font-bold">Verified Suppliers</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[32px] font-black text-[#2EC4B6]">Global</p>
                                <p className="text-[11px] text-[#CBD5F5] uppercase tracking-wider font-bold">Vision</p>
                            </div>
                        </div>

                        <button className="h-[52px] px-10 bg-[#2EC4B6] hover:brightness-110 text-white rounded-[14px] text-[15px] font-bold transition-all shadow-xl shadow-[#2EC4B6]/20 active:scale-95">
                            Become a Buyer
                        </button>
                    </div>
                </section>

            </main>
        </div>
    );
}
