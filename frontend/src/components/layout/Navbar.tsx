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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useCart } from '@/lib/cart';
import NotificationBell from '@/components/ui/NotificationBell';

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
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Industrial & Machining', slug: 'industrial' },
    { name: 'Packaging & Print', slug: 'packaging' },
    { name: 'Automotive Parts', slug: 'automotive' },
    { name: 'Fashion & Textiles', slug: 'fashion' },
    { name: 'Health & Medical', slug: 'health' },
    { name: 'Home & Garden', slug: 'home' }
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
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isLangOpen, setIsLangOpen] = React.useState(false);
    const [isCurrOpen, setIsCurrOpen] = React.useState(false);
    const [isCatMenuOpen, setIsCatMenuOpen] = React.useState(false);
    const [isLocationOpen, setIsLocationOpen] = React.useState(false);
    const [savedAddress, setSavedAddress] = React.useState<string>('');
    const [savedCount, setSavedCount] = React.useState<number>(0);
    const [showAddressPrompt, setShowAddressPrompt] = React.useState(false);
    const [addressInput, setAddressInput] = React.useState('');
    const locationRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        // Hydrate saved-address from localStorage
        try {
            const stored = localStorage.getItem('atl_delivery_address') || '';
            setSavedAddress(stored);
            const saved = JSON.parse(localStorage.getItem('atl_saved_items') || '[]');
            setSavedCount(Array.isArray(saved) ? saved.length : 0);
        } catch { /* noop */ }

        // Listen for saved-items changes from other components
        const handleSavedChange = () => {
            try {
                const saved = JSON.parse(localStorage.getItem('atl_saved_items') || '[]');
                setSavedCount(Array.isArray(saved) ? saved.length : 0);
            } catch { /* noop */ }
        };
        window.addEventListener('atl:saved-changed', handleSavedChange);
        window.addEventListener('storage', handleSavedChange);
        return () => {
            window.removeEventListener('atl:saved-changed', handleSavedChange);
            window.removeEventListener('storage', handleSavedChange);
        };
    }, []);

    React.useEffect(() => {
        // Close location dropdown on outside click
        const handler = (e: MouseEvent) => {
            if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
                setIsLocationOpen(false);
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

    const handleSaveAddress = () => {
        const value = addressInput.trim();
        if (!value) return;
        try {
            localStorage.setItem('atl_delivery_address', value);
            setSavedAddress(value);
            setShowAddressPrompt(false);
            setIsLocationOpen(false);
            setAddressInput('');
        } catch { /* noop */ }
    };

    const country = getCountryDisplay(user?.country);
    const displayCity = savedAddress
        ? savedAddress.split(',')[0].trim().slice(0, 18)
        : (user ? 'Set address' : 'Sign in for address');

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
                    <Link href="/sell" className="hover:text-white transition-colors">Sell on Atlantis</Link>
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

                    {/* DELIVER TO — Amazon-style location pill */}
                    <div ref={locationRef} className="hidden md:flex relative shrink-0">
                        <button
                            onClick={() => setIsLocationOpen(!isLocationOpen)}
                            className="flex items-start gap-1.5 h-[44px] px-3 hover:bg-[#F1F5F9] rounded-lg transition-colors group"
                        >
                            <MapPin size={16} className="text-[#64748B] mt-0.5 group-hover:text-[#2EC4B6] transition-colors" />
                            <div className="flex flex-col leading-tight items-start min-w-0">
                                <span className="text-[10px] text-[#64748B] font-medium">
                                    Deliver to {country.label && <span className="font-bold text-[#0F172A]">{country.flag} {country.label}</span>}
                                </span>
                                <span className="text-[12px] font-bold text-[#0F172A] truncate max-w-[140px]">
                                    {displayCity}
                                </span>
                            </div>
                            <ChevronDown size={12} className="text-[#94A3B8] mt-1.5" />
                        </button>

                        <AnimatePresence>
                            {isLocationOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 4 }}
                                    className="absolute top-full left-0 mt-2 w-[320px] bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl z-[110] overflow-hidden"
                                >
                                    <div className="px-5 py-4 border-b border-[#E5E7EB] bg-gradient-to-br from-[#F8FAFC] to-white">
                                        <div className="flex items-center gap-2 mb-1">
                                            <MapPin size={14} className="text-[#2EC4B6]" />
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Delivery Location</span>
                                        </div>
                                        <h4 className="text-[14px] font-bold text-[#0F172A]">
                                            {country.label ? (
                                                <>Shipping to {country.flag} {country.label}</>
                                            ) : (
                                                <>Set your delivery address</>
                                            )}
                                        </h4>
                                    </div>

                                    <div className="p-5 space-y-3">
                                        {savedAddress && !showAddressPrompt ? (
                                            <div className="space-y-2">
                                                <p className="text-[12px] text-[#64748B] font-medium">Default shipping address:</p>
                                                <div className="px-3 py-2.5 bg-[#F1F5F9] border border-[#E5E7EB] rounded-lg text-[12px] text-[#0F172A] leading-relaxed">
                                                    {savedAddress}
                                                </div>
                                                <div className="flex items-center gap-2 pt-1">
                                                    <button
                                                        onClick={() => { setShowAddressPrompt(true); setAddressInput(savedAddress); }}
                                                        className="flex-1 h-9 text-[12px] font-bold border border-[#E5E7EB] hover:border-[#2EC4B6] hover:text-[#2EC4B6] text-[#64748B] rounded-lg transition-colors"
                                                    >
                                                        Edit address
                                                    </button>
                                                    <Link
                                                        href={user ? '/dashboard/customer/settings' : '/auth/login'}
                                                        onClick={() => setIsLocationOpen(false)}
                                                        className="flex-1 h-9 text-[12px] font-bold bg-[#0B1F3A] hover:bg-[#2EC4B6] text-white rounded-lg transition-colors flex items-center justify-center no-underline"
                                                    >
                                                        Manage in account
                                                    </Link>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <p className="text-[12px] text-[#64748B] leading-relaxed">
                                                    Save your shipping address so we can show you accurate delivery time and freight pricing.
                                                </p>
                                                <input
                                                    type="text"
                                                    value={addressInput}
                                                    onChange={(e) => setAddressInput(e.target.value)}
                                                    placeholder="e.g. Cairo, Egypt — 6th of October City"
                                                    className="w-full h-10 px-3 text-[13px] border border-[#E5E7EB] rounded-lg outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20 transition-all"
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAddress(); }}
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={handleSaveAddress}
                                                    disabled={!addressInput.trim()}
                                                    className="w-full h-10 bg-[#2EC4B6] hover:bg-[#0B1F3A] disabled:bg-[#94A3B8] text-white rounded-lg text-[12px] font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed"
                                                >
                                                    Save Address
                                                </button>
                                                {!user && (
                                                    <p className="text-[11px] text-center text-[#94A3B8]">
                                                        <Link href="/auth/login" className="text-[#2EC4B6] font-bold hover:underline">Sign in</Link> to sync across devices
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
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
                                                        key={cat.slug}
                                                        href={`/categories/${cat.slug}`}
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
                                key={cat.slug}
                                href={`/categories/${cat.slug}`}
                                className="px-3 h-full flex items-center text-[12px] font-semibold text-[#475569] hover:text-[#2EC4B6] whitespace-nowrap transition-colors"
                            >
                                {cat.name}
                            </Link>
                        ))}
                        <span className="w-px h-4 bg-[#E5E7EB]" />
                        <Link href="/deals" className="px-3 h-full flex items-center text-[12px] font-bold text-[#EF4444] hover:text-[#0B1F3A] whitespace-nowrap transition-colors">
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
