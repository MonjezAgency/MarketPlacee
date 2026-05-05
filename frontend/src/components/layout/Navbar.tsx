'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    Search,
    ChevronDown,
    User,
    Globe,
    Menu,
    ShoppingCart,
    ArrowRight,
    ChevronRight,
    Monitor,
    Package,
    Headphones,
    LogOut,
    MapPin,
    Heart,
    Tag,
    Truck,
    HelpCircle,
    X,
    Settings,
    Navigation,
    Pencil,
    ExternalLink,
    Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCart } from '@/lib/cart';
import NotificationBell from '@/components/ui/NotificationBell';
import { useRouter } from 'next/navigation';

const LANGUAGES = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ar', name: 'العربية', flag: '🇪🇬' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'cn', name: '中文', flag: '🇨🇳' },
    { code: 'jp', name: '日本語', flag: '🇯🇵' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' }
];

const CURRENCIES = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
    { code: 'SAR', symbol: 'SR', name: 'Saudi Riyal' },
    { code: 'AED', symbol: 'DH', name: 'UAE Dirham' },
    { code: 'GBP', symbol: '£', name: 'Pound Sterling' },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { code: 'RUB', symbol: '₽', name: 'Russian Ruble' }
];

const NAV_CATEGORIES = [
    { name: 'Electronics', q: 'Electronics' },
    { name: 'Industrial & Machining', q: 'Industrial' },
    { name: 'Packaging & Print', q: 'Packaging' },
    { name: 'Automotive Parts', q: 'Automotive' },
    { name: 'Fashion & Textiles', q: 'Fashion' },
    { name: 'Health & Medical', q: 'Health' },
    { name: 'Home & Garden', q: 'Home' }
];

// Country code → flag emoji + label
const COUNTRY_INFO: Record<string, { flag: string; label: string }> = {
    EG: { flag: '🇪🇬', label: 'Egypt' },
    SA: { flag: '🇸🇦', label: 'Saudi Arabia' },
    AE: { flag: '🇦🇪', label: 'UAE' },
    US: { flag: '🇺🇸', label: 'United States' },
    GB: { flag: '🇬🇧', label: 'United Kingdom' },
    DE: { flag: '🇩🇪', label: 'Germany' },
    FR: { flag: '🇫🇷', label: 'France' },
    IT: { flag: '🇮🇹', label: 'Italy' },
    ES: { flag: '🇪🇸', label: 'Spain' },
    TR: { flag: '🇹🇷', label: 'Turkey' },
    CN: { flag: '🇨🇳', label: 'China' },
};

function getCountryDisplay(rawCountry?: string): { flag: string; label: string } {
    if (!rawCountry) return { flag: '🌍', label: '' };
    const upper = rawCountry.toUpperCase();
    if (COUNTRY_INFO[upper]) return COUNTRY_INFO[upper];
    // Fallback if it's already a name
    return { flag: '🌍', label: rawCountry };
}

export default function Navbar() {
    const { user, logout } = useAuth();
    const { items } = useCart();
    const { locale, setLocale, t } = useLanguage();
    const { currency, setCurrency } = useCurrency();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isLangOpen, setIsLangOpen] = React.useState(false);
    const [isCurrOpen, setIsCurrOpen] = React.useState(false);
    const [isCatMenuOpen, setIsCatMenuOpen] = React.useState(false);
    const [isLocationOpen, setIsLocationOpen] = React.useState(false);
    const [savedAddress, setSavedAddress] = React.useState<string>('');
    const [savedCount, setSavedCount] = React.useState<number>(0);
    const [showQuickEdit, setShowQuickEdit] = React.useState(false);
    const [addressInput, setAddressInput] = React.useState('');
    const [isGpsLoading, setIsGpsLoading] = React.useState(false);
    const locationRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        try {
            const stored = localStorage.getItem('atl_delivery_address') || '';
            setSavedAddress(stored);
            const saved = JSON.parse(localStorage.getItem('atl_saved_items') || '[]');
            setSavedCount(Array.isArray(saved) ? saved.length : 0);
        } catch { /* noop */ }

        const handleSavedChange = () => {
            try {
                const saved = JSON.parse(localStorage.getItem('atl_saved_items') || '[]');
                setSavedCount(Array.isArray(saved) ? saved.length : 0);
            } catch { /* noop */ }
        };
        // Also re-read address when it changes (e.g. from address page)
        const handleAddressChange = () => {
            try {
                const stored = localStorage.getItem('atl_delivery_address') || '';
                setSavedAddress(stored);
            } catch { /* noop */ }
        };
        window.addEventListener('atl:saved-changed', handleSavedChange);
        window.addEventListener('atl:address-changed', handleAddressChange);
        window.addEventListener('storage', handleSavedChange);
        return () => {
            window.removeEventListener('atl:saved-changed', handleSavedChange);
            window.removeEventListener('atl:address-changed', handleAddressChange);
            window.removeEventListener('storage', handleSavedChange);
        };
    }, []);

    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
                setIsLocationOpen(false);
                setShowQuickEdit(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            window.location.href = `/categories?q=${encodeURIComponent(searchQuery)}`;
        }
    };

    /** GPS auto-detect using browser geolocation + Nominatim reverse geocoding */
    const handleGps = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!navigator.geolocation) return;
        setIsGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude: lat, longitude: lon } = pos.coords;
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
                        { headers: { 'Accept-Language': 'en' } }
                    );
                    const data = await res.json();
                    const a = data.address || {};
                    const city = a.city || a.town || a.village || a.county || '';
                    const state = a.state || a.region || '';
                    const country = a.country || '';
                    const formatted = [city, state, country].filter(Boolean).join(', ');
                    if (formatted) {
                        localStorage.setItem('atl_delivery_address', formatted);
                        setSavedAddress(formatted);
                        window.dispatchEvent(new Event('atl:address-changed'));
                        setIsLocationOpen(false);
                        setShowQuickEdit(false);
                    }
                } catch { /* noop */ }
                setIsGpsLoading(false);
            },
            () => setIsGpsLoading(false),
            { timeout: 8000 }
        );
    };

    /** Click the delivery pill — navigate to address page (or login) */
    const handleDeliverClick = () => {
        setIsLocationOpen(false);
        if (!user) {
            router.push('/auth/login?redirect=/account/address');
        } else {
            router.push('/account/address');
        }
    };

    /** Save inline quick-edit address */
    const handleQuickSave = () => {
        const value = addressInput.trim();
        if (!value) return;
        try {
            localStorage.setItem('atl_delivery_address', value);
            setSavedAddress(value);
            window.dispatchEvent(new Event('atl:address-changed'));
            setShowQuickEdit(false);
            setIsLocationOpen(false);
            setAddressInput('');
        } catch { /* noop */ }
    };

    const country = getCountryDisplay(user?.country);
    const displayCity = savedAddress
        ? savedAddress.split(',')[0].trim().slice(0, 18)
        : (user ? 'Set address' : 'Set address');

    return (
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-[100] w-full shadow-sm">
            {/* 1. SLIM TOP UTILITY BAR — Noon style */}
            <div className="hidden lg:flex h-9 items-center justify-between px-8 bg-[#0B1F3A] text-white text-[11px] font-semibold">
                <div className="flex items-center gap-5">
                    <span className="flex items-center gap-1.5">
                        <Truck size={13} className="text-[#2EC4B6]" />
                        <span className="text-white/80">Free shipping on bulk orders over 1 truck</span>
                    </span>
                    <span className="text-white/20">·</span>
                    <span className="flex items-center gap-1.5 text-white/70">
                        <Tag size={12} className="text-[#2EC4B6]" />
                        Verified suppliers worldwide
                    </span>
                </div>
                <div className="flex items-center gap-5 text-white/70">
                    <Link href="/auth/register?role=supplier" className="hover:text-white transition-colors">Sell on Atlantis</Link>
                    <span className="text-white/20">·</span>
                    <Link href="/help" className="hover:text-white transition-colors">Help Center</Link>
                    <span className="text-white/20">·</span>
                    <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
                </div>
            </div>

            {/* 2. MAIN NAVBAR — Amazon style */}
            <div className="px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto">
                <div className="h-[68px] flex items-center gap-4 sm:gap-5">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
                        <img src="/icon.png" alt="Atlantis" className="w-9 h-9 object-contain rounded-lg" />
                        <span className="text-[20px] font-black tracking-tighter uppercase hidden sm:inline">
                            <span className="text-[#0B1F3A]">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
                        </span>
                    </Link>

                    {/* DELIVER TO — GPS-enabled location pill */}
                    <div ref={locationRef} className="hidden md:flex relative shrink-0 items-center gap-1">

                        {/* Main pill — click goes to full address page */}
                        <button
                            onClick={handleDeliverClick}
                            className="flex items-start gap-1.5 h-[44px] px-2.5 hover:bg-[#F1F5F9] rounded-lg transition-colors group"
                        >
                            <MapPin size={16} className="text-[#64748B] mt-0.5 group-hover:text-[#2EC4B6] transition-colors shrink-0" />
                            <div className="flex flex-col leading-tight items-start min-w-0">
                                <span className="text-[10px] text-[#64748B] font-medium whitespace-nowrap">
                                    Deliver to {country.label && <span className="font-bold text-[#0F172A]">{country.flag} {country.label}</span>}
                                </span>
                                <span className="text-[12px] font-bold text-[#0F172A] truncate max-w-[120px]">
                                    {displayCity}
                                </span>
                            </div>
                        </button>

                        {/* GPS auto-detect button */}
                        <button
                            onClick={handleGps}
                            title="Auto-detect my location"
                            disabled={isGpsLoading}
                            className="w-[30px] h-[30px] flex items-center justify-center rounded-full border border-[#E5E7EB] hover:border-[#2EC4B6] hover:bg-[#F0FDFA] text-[#64748B] hover:text-[#2EC4B6] transition-all disabled:opacity-50"
                        >
                            {isGpsLoading
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Navigation size={13} />
                            }
                        </button>

                        {/* Chevron — opens dropdown for saved-address quick options */}
                        {savedAddress && (
                            <button
                                onClick={() => { setIsLocationOpen(!isLocationOpen); setShowQuickEdit(false); }}
                                className="w-[24px] h-[30px] flex items-center justify-center text-[#94A3B8] hover:text-[#2EC4B6] transition-colors"
                            >
                                <ChevronDown size={12} className={cn('transition-transform', isLocationOpen && 'rotate-180')} />
                            </button>
                        )}

                        {/* Dropdown — only for users who already have a saved address */}
                        <AnimatePresence>
                            {isLocationOpen && savedAddress && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 4 }}
                                    className="absolute top-full left-0 mt-2 w-[300px] bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl z-[110] overflow-hidden"
                                >
                                    {/* Header */}
                                    <div className="px-4 py-3 border-b border-[#E5E7EB] bg-[#F8FAFC]">
                                        <div className="flex items-center gap-2">
                                            <MapPin size={13} className="text-[#2EC4B6]" />
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Delivery Location</span>
                                        </div>
                                        <p className="mt-1 text-[12px] text-[#0F172A] font-semibold truncate">{savedAddress}</p>
                                    </div>

                                    {!showQuickEdit ? (
                                        <div className="p-3 space-y-1.5">
                                            {/* GPS re-detect */}
                                            <button
                                                onClick={handleGps}
                                                disabled={isGpsLoading}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F0FDFA] text-left transition-colors group disabled:opacity-50"
                                            >
                                                <span className="w-7 h-7 rounded-full bg-[#CCFBF1] flex items-center justify-center shrink-0">
                                                    {isGpsLoading ? <Loader2 size={13} className="text-[#2EC4B6] animate-spin" /> : <Navigation size={13} className="text-[#2EC4B6]" />}
                                                </span>
                                                <div>
                                                    <p className="text-[12px] font-bold text-[#0F172A]">Use my current location</p>
                                                    <p className="text-[11px] text-[#64748B]">Auto-detect via GPS</p>
                                                </div>
                                            </button>

                                            {/* Quick Edit */}
                                            <button
                                                onClick={() => { setShowQuickEdit(true); setAddressInput(savedAddress); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F1F5F9] text-left transition-colors"
                                            >
                                                <span className="w-7 h-7 rounded-full bg-[#F1F5F9] flex items-center justify-center shrink-0">
                                                    <Pencil size={13} className="text-[#64748B]" />
                                                </span>
                                                <div>
                                                    <p className="text-[12px] font-bold text-[#0F172A]">Quick edit</p>
                                                    <p className="text-[11px] text-[#64748B]">Edit address inline</p>
                                                </div>
                                            </button>

                                            {/* Full Edit */}
                                            <button
                                                onClick={() => { setIsLocationOpen(false); router.push('/account/address'); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#F1F5F9] text-left transition-colors"
                                            >
                                                <span className="w-7 h-7 rounded-full bg-[#F1F5F9] flex items-center justify-center shrink-0">
                                                    <ExternalLink size={13} className="text-[#64748B]" />
                                                </span>
                                                <div>
                                                    <p className="text-[12px] font-bold text-[#0F172A]">Full edit</p>
                                                    <p className="text-[11px] text-[#64748B]">Street, city, zip & more</p>
                                                </div>
                                            </button>
                                        </div>
                                    ) : (
                                        /* Quick-edit inline form */
                                        <div className="p-4 space-y-3">
                                            <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Quick Edit</p>
                                            <input
                                                type="text"
                                                value={addressInput}
                                                onChange={(e) => setAddressInput(e.target.value)}
                                                placeholder="City, Country"
                                                className="w-full h-10 px-3 text-[13px] border border-[#E5E7EB] rounded-lg outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20 transition-all"
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleQuickSave(); if (e.key === 'Escape') setShowQuickEdit(false); }}
                                                autoFocus
                                            />
                                            <div className="flex gap-2">
                                                <button onClick={() => setShowQuickEdit(false)} className="flex-1 h-9 text-[12px] font-bold border border-[#E5E7EB] text-[#64748B] rounded-lg hover:border-[#94A3B8] transition-colors">Cancel</button>
                                                <button onClick={handleQuickSave} disabled={!addressInput.trim()} className="flex-1 h-9 text-[12px] font-black bg-[#2EC4B6] hover:bg-[#0B1F3A] disabled:bg-[#94A3B8] text-white rounded-lg transition-colors disabled:cursor-not-allowed">Save</button>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Search Bar — Amazon style with category dropdown */}
                    <form onSubmit={handleSearch} className="flex-1 max-w-[760px] mx-auto">
                        <div className="flex items-center w-full h-[44px] rounded-lg overflow-hidden border-2 border-[#E5E7EB] focus-within:border-[#2EC4B6] hover:border-[#2EC4B6]/60 transition-colors bg-white">
                            <div
                                className="relative h-full flex items-center"
                                onMouseEnter={() => setIsCatMenuOpen(true)}
                                onMouseLeave={() => setIsCatMenuOpen(false)}
                            >
                                <button
                                    type="button"
                                    className="h-full px-3 flex items-center gap-1.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] border-r border-[#E5E7EB] text-[12px] font-bold text-[#0F172A]"
                                >
                                    <Menu size={14} className="text-[#64748B]" />
                                    <span className="hidden sm:inline">All</span>
                                    <ChevronDown size={12} className={cn('text-[#64748B] transition-transform', isCatMenuOpen && 'rotate-180')} />
                                </button>

                                <AnimatePresence>
                                    {isCatMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 4 }}
                                            className="absolute top-full left-0 mt-1 w-[260px] bg-white border border-[#E5E7EB] rounded-xl shadow-2xl p-2 z-50"
                                        >
                                            <div className="space-y-0.5">
                                                {NAV_CATEGORIES.map((cat) => (
                                                    <Link
                                                        key={cat.q}
                                                        href={`/categories?category=${encodeURIComponent(cat.q)}`}
                                                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#F8FAFC] group transition-colors no-underline"
                                                    >
                                                        <span className="text-[13px] font-semibold text-[#475569] group-hover:text-[#2EC4B6]">{cat.name}</span>
                                                        <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 text-[#2EC4B6] transition-all" />
                                                    </Link>
                                                ))}
                                                <div className="pt-1.5 mt-1.5 border-t border-[#E5E7EB]">
                                                    <Link
                                                        href="/categories"
                                                        className="flex items-center justify-center gap-2 w-full py-2 bg-[#0B1F3A] text-white rounded-lg text-[12px] font-bold hover:bg-[#2EC4B6] transition-colors no-underline"
                                                    >
                                                        Browse all <ArrowRight size={12} />
                                                    </Link>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('navbar', 'searchPlaceholder') || 'Search products, brands, suppliers...'}
                                className="flex-1 h-full px-4 text-[13px] outline-none bg-transparent placeholder:text-[#94A3B8]"
                            />
                            <button
                                type="submit"
                                className="h-full px-5 bg-[#2EC4B6] hover:bg-[#0B1F3A] text-white flex items-center justify-center transition-colors"
                                aria-label="Search"
                            >
                                <Search size={18} />
                            </button>
                        </div>
                    </form>

                    {/* Right cluster — saved, language, account, cart */}
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        {/* Language */}
                        <div className="relative hidden md:block">
                            <button
                                onClick={() => setIsLangOpen(!isLangOpen)}
                                className="h-[44px] px-2.5 flex items-center gap-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors text-[12px] font-bold text-[#0F172A]"
                            >
                                <Globe size={15} className="text-[#64748B]" />
                                <span className="uppercase">{locale}</span>
                                <ChevronDown size={11} className={cn('text-[#94A3B8] transition-transform', isLangOpen && 'rotate-180')} />
                            </button>
                            <AnimatePresence>
                                {isLangOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 4 }}
                                        className="absolute top-full right-0 mt-2 bg-white border border-[#E5E7EB] rounded-xl shadow-2xl p-2 min-w-[180px] z-[110]"
                                    >
                                        <div className="max-h-[280px] overflow-y-auto p-1 space-y-0.5">
                                            {LANGUAGES.map((l) => (
                                                <button
                                                    key={l.code}
                                                    onClick={() => { setLocale(l.code as any); setIsLangOpen(false); }}
                                                    className={cn(
                                                        'w-full flex items-center justify-between px-3 py-2 text-[12px] font-semibold rounded-lg transition-colors',
                                                        locale === l.code ? 'bg-[#2EC4B6]/10 text-[#2EC4B6]' : 'text-[#475569] hover:bg-[#F8FAFC]'
                                                    )}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <span>{l.flag}</span>
                                                        {l.name}
                                                    </span>
                                                    {locale === l.code && <div className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6]" />}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Currency */}
                        <div className="relative hidden lg:block">
                            <button
                                onClick={() => setIsCurrOpen(!isCurrOpen)}
                                className="h-[44px] px-2.5 flex items-center gap-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors text-[12px] font-bold text-[#0F172A]"
                            >
                                <span>{currency}</span>
                                <ChevronDown size={11} className={cn('text-[#94A3B8] transition-transform', isCurrOpen && 'rotate-180')} />
                            </button>
                            <AnimatePresence>
                                {isCurrOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 4 }}
                                        className="absolute top-full right-0 mt-2 bg-white border border-[#E5E7EB] rounded-xl shadow-2xl p-2 min-w-[200px] z-[110]"
                                    >
                                        <div className="max-h-[280px] overflow-y-auto p-1 space-y-0.5">
                                            {CURRENCIES.map((c) => (
                                                <button
                                                    key={c.code}
                                                    onClick={() => { setCurrency(c.code); setIsCurrOpen(false); }}
                                                    className={cn(
                                                        'w-full flex items-center justify-between px-3 py-2 text-[12px] font-semibold rounded-lg transition-colors',
                                                        currency === c.code ? 'bg-[#2EC4B6]/10 text-[#2EC4B6]' : 'text-[#475569] hover:bg-[#F8FAFC]'
                                                    )}
                                                >
                                                    <div className="flex flex-col items-start leading-tight">
                                                        <span className="font-black">{c.code}</span>
                                                        <span className="text-[10px] opacity-60 font-medium">{c.name}</span>
                                                    </div>
                                                    <span className="text-[14px] font-black">{c.symbol}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Notifications */}
                        <div className="hidden md:block">
                            <NotificationBell isLight={true} />
                        </div>

                        {/* Saved items — Noon-style heart */}
                        <Link
                            href="/saved"
                            className="relative h-[44px] w-[44px] flex items-center justify-center rounded-lg hover:bg-[#F1F5F9] transition-colors group"
                            aria-label="Saved items"
                        >
                            <Heart size={20} className="text-[#475569] group-hover:text-[#EF4444] group-hover:fill-[#EF4444]/20 transition-colors" />
                            {savedCount > 0 && (
                                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-[#EF4444] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                    {savedCount > 99 ? '99+' : savedCount}
                                </span>
                            )}
                        </Link>

                        {/* User Account */}
                        {(() => {
                            let dashboardLink = '/auth/login';
                            if (user) {
                                const role = user.role?.toUpperCase() || '';
                                if (['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(role)) {
                                    dashboardLink = '/admin';
                                } else if (role === 'SUPPLIER') {
                                    dashboardLink = '/supplier';
                                } else {
                                    dashboardLink = '/dashboard/customer';
                                }
                            }

                            return (
                                <div className="relative group">
                                    <Link
                                        href={dashboardLink}
                                        className="flex items-center gap-2 h-[44px] px-2 sm:px-3 rounded-lg hover:bg-[#F1F5F9] transition-colors no-underline"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-[#F8FAFC] border border-[#E5E7EB] flex items-center justify-center overflow-hidden shrink-0">
                                            {user?.avatar ? (
                                                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={16} className="text-[#64748B]" />
                                            )}
                                        </div>
                                        <div className="hidden sm:flex flex-col items-start leading-tight">
                                            <span className="text-[10px] text-[#64748B] font-medium">
                                                {user ? `Hi, ${user.name?.split(' ')[0] || 'there'}` : 'Hello, sign in'}
                                            </span>
                                            <span className="text-[12px] text-[#0F172A] font-black truncate max-w-[100px] flex items-center gap-1">
                                                Account
                                                <ChevronDown size={11} className="text-[#94A3B8]" />
                                            </span>
                                        </div>
                                    </Link>

                                    {user && (
                                        <div className="absolute top-full right-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                                            <div className="w-56 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl p-2 overflow-hidden">
                                                {(() => {
                                                    const role = user.role?.toUpperCase() || '';
                                                    const isAdmin = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(role);
                                                    const isSupplier = role === 'SUPPLIER';

                                                    let settingsLink = '/dashboard/customer/settings';
                                                    if (isAdmin) settingsLink = '/admin/settings';
                                                    if (isSupplier) settingsLink = '/supplier/settings';

                                                    return (
                                                        <>
                                                            <Link href={dashboardLink} className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[#F8FAFC] text-[13px] font-bold text-[#475569] hover:text-[#2EC4B6] transition-colors no-underline">
                                                                <Monitor size={16} /> {isAdmin ? 'Admin Dashboard' : 'My Dashboard'}
                                                            </Link>
                                                            {!isAdmin && !isSupplier && (
                                                                <Link href="/dashboard/customer/orders" className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[#F8FAFC] text-[13px] font-bold text-[#475569] hover:text-[#2EC4B6] transition-colors no-underline">
                                                                    <Package size={16} /> Orders & Tracking
                                                                </Link>
                                                            )}
                                                            <Link href="/saved" className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[#F8FAFC] text-[13px] font-bold text-[#475569] hover:text-[#2EC4B6] transition-colors no-underline">
                                                                <Heart size={16} /> Saved Items
                                                            </Link>
                                                            <Link href={settingsLink} className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[#F8FAFC] text-[13px] font-bold text-[#475569] hover:text-[#2EC4B6] transition-colors no-underline">
                                                                <Settings size={16} /> Settings
                                                            </Link>
                                                        </>
                                                    );
                                                })()}
                                                <div className="h-px bg-[#E5E7EB] my-1" />
                                                <button
                                                    onClick={logout}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-[#FEF2F2] text-[13px] font-bold text-[#EF4444] transition-colors"
                                                >
                                                    <LogOut size={16} /> Sign out
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Cart */}
                        <Link
                            href="/cart"
                            className="relative flex items-center gap-2 h-[44px] px-2.5 sm:px-3.5 rounded-lg hover:bg-[#F1F5F9] transition-colors no-underline group"
                        >
                            <div className="relative">
                                <ShoppingCart size={22} className="text-[#0F172A]" />
                                {items.length > 0 && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-[#2EC4B6] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                        {items.length > 99 ? '99+' : items.length}
                                    </span>
                                )}
                            </div>
                            <span className="hidden sm:inline text-[12px] font-bold text-[#0F172A]">Cart</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* 3. SECONDARY NAV — quick categories (Amazon black bar style, but lighter) */}
            <div className="hidden md:block bg-[#F8FAFC] border-t border-[#E5E7EB]">
                <div className="px-4 sm:px-6 lg:px-8 max-w-[1600px] mx-auto">
                    <nav className="h-10 flex items-center gap-1 overflow-x-auto scrollbar-hide">
                        <Link href="/categories" className="flex items-center gap-1.5 px-3 h-full text-[12px] font-bold text-[#0F172A] hover:text-[#2EC4B6] whitespace-nowrap transition-colors">
                            <Menu size={13} /> All Categories
                        </Link>
                        <span className="w-px h-4 bg-[#E5E7EB]" />
                        {NAV_CATEGORIES.map((cat) => (
                            <Link
                                key={cat.q}
                                href={`/categories?category=${encodeURIComponent(cat.q)}`}
                                className="px-3 h-full flex items-center text-[12px] font-semibold text-[#475569] hover:text-[#2EC4B6] whitespace-nowrap transition-colors"
                            >
                                {cat.name}
                            </Link>
                        ))}
                        <span className="w-px h-4 bg-[#E5E7EB]" />
                        <Link href="/categories?sort=deals" className="px-3 h-full flex items-center text-[12px] font-bold text-[#EF4444] hover:text-[#0B1F3A] whitespace-nowrap transition-colors">
                            🔥 Today's Deals
                        </Link>
                        <Link href="/sponsored-highlights" className="px-3 h-full flex items-center text-[12px] font-semibold text-[#475569] hover:text-[#2EC4B6] whitespace-nowrap transition-colors">
                            Sponsored
                        </Link>
                        <Link href="/help" className="px-3 h-full flex items-center text-[12px] font-semibold text-[#475569] hover:text-[#2EC4B6] whitespace-nowrap transition-colors ml-auto">
                            <HelpCircle size={13} className="inline mr-1" /> Help
                        </Link>
                    </nav>
                </div>
            </div>
        </header>
    );
}
