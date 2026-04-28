'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, ChevronDown, User, Globe, Menu, ShoppingCart, ArrowRight, ChevronRight, Monitor, Package, Headphones, LogOut } from 'lucide-react';
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

export default function Navbar() {
    const { user, logout } = useAuth();
    const { items } = useCart();
    const { locale, setLocale, t } = useLanguage();
    const { currency, setCurrency } = useCurrency();
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isLangOpen, setIsLangOpen] = React.useState(false);
    const [isCurrOpen, setIsCurrOpen] = React.useState(false);
    const [isCatMenuOpen, setIsCatMenuOpen] = React.useState(false);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            window.location.href = `/categories?q=${encodeURIComponent(searchQuery)}`;
        }
    };

    return (
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-[100] w-full shadow-sm">
            {/* 1. TOP INFO BAR */}
            <div className="hidden lg:flex h-10 items-center justify-between px-8 bg-[#0B1F3A] text-white text-[11px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-6">
                    <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6] animate-pulse" />
                        {t('navbar', 'marketplace')} Global B2B Wholesale
                    </span>
                    <span className="opacity-40">|</span>
                    <span className="flex items-center gap-2">
                        <Package size={14} className="text-[#2EC4B6]" />
                        Direct Factory Sourcing
                    </span>
                </div>
                <div className="flex items-center gap-8">
                    <Link href="/shipping" className="hover:text-[#2EC4B6] transition-colors">{t('navbar', 'volumeDeals')}</Link>
                    <Link href="/help" className="hover:text-[#2EC4B6] transition-colors">{t('navbar', 'logisticsHelp')}</Link>
                </div>
            </div>

            {/* 2. MAIN NAVBAR */}
            <div className="h-[76px] px-6 flex items-center justify-between max-w-[1440px] mx-auto gap-8">
                {/* Logo & Category Menu */}
                <div className="flex items-center gap-6 shrink-0">
                    <Link href="/" className="flex items-center gap-3 group">
                        <img src="/icon.png" alt="Atlantis" className="w-10 h-10 object-contain rounded-xl" />
                        <span className="text-[24px] font-black tracking-tighter uppercase">
                            <span className="text-[#0B1F3A]">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
                        </span>
                    </Link>
                    
                    <div 
                        className="relative h-full flex items-center"
                        onMouseEnter={() => setIsCatMenuOpen(true)}
                        onMouseLeave={() => setIsCatMenuOpen(false)}
                    >
                        <button className={cn(
                            "h-[44px] px-5 bg-[#F8FAFC] border border-[#E5E7EB] text-[#0F172A] rounded-xl flex items-center gap-3 transition-all font-bold text-[14px]",
                            isCatMenuOpen && "border-[#2EC4B6] bg-white shadow-md text-[#2EC4B6]"
                        )}>
                            <Menu size={18} />
                            {t('navbar', 'categories')}
                            <ChevronDown size={16} className={cn("transition-transform duration-300", isCatMenuOpen && "rotate-180")} />
                        </button>

                        <AnimatePresence>
                            {isCatMenuOpen && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute top-full left-0 mt-1 w-[280px] bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl p-3 z-50 overflow-hidden"
                                >
                                    <div className="space-y-1">
                                        {NAV_CATEGORIES.map((cat, i) => (
                                            <Link 
                                                key={i}
                                                href={`/categories/${cat.slug}`}
                                                className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-[#F8FAFC] group transition-all"
                                            >
                                                <span className="text-[13px] font-bold text-[#64748B] group-hover:text-[#2EC4B6] transition-colors">{cat.name}</span>
                                                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-[#2EC4B6] transition-all" />
                                            </Link>
                                        ))}
                                        <div className="pt-2 mt-2 border-t border-[#E5E7EB]">
                                            <Link 
                                                href="/categories"
                                                className="flex items-center justify-center gap-2 w-full py-3 bg-[#0B1F3A] text-white rounded-xl text-[12px] font-bold hover:bg-[#2EC4B6] transition-all shadow-md"
                                            >
                                                {t('navbar', 'browseAll')} <ArrowRight size={14} />
                                            </Link>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Search Bar */}
                <form onSubmit={handleSearch} className="flex-1 max-w-[600px]">
                    <div className="relative w-full group">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('navbar', 'searchPlaceholder')}
                            className="w-full h-[48px] bg-[#F1F5F9] border-2 border-transparent rounded-full pl-14 pr-24 text-[14px] font-medium outline-none focus:bg-white focus:border-[#2EC4B6] transition-all shadow-inner"
                        />
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[#94A3B8] group-focus-within:text-[#2EC4B6] transition-colors" size={20} />
                        <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 h-[36px] px-6 bg-[#0B1F3A] hover:bg-[#2EC4B6] text-white rounded-full text-[13px] font-black uppercase transition-all shadow-md active:scale-95">
                            {t('common', 'search')}
                        </button>
                    </div>
                </form>

                {/* Right Actions */}
                <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2 px-1 py-1 bg-[#F1F5F9] rounded-xl border border-[#E5E7EB]">
                        {/* Language */}
                        <div className="relative">
                            <button 
                                onClick={() => setIsLangOpen(!isLangOpen)}
                                className="h-9 px-3 flex items-center gap-2 rounded-lg hover:bg-white transition-all text-[13px] font-black text-[#0F172A] uppercase"
                            >
                                <Globe size={16} className="text-[#94A3B8]" />
                                {locale}
                                <ChevronDown size={14} className={cn("text-[#94A3B8] transition-transform", isLangOpen && "rotate-180")} />
                            </button>
                            <AnimatePresence>
                                {isLangOpen && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute top-full right-0 mt-2 bg-white border border-[#E5E7EB] rounded-xl shadow-2xl p-2 min-w-[160px] z-[110]"
                                    >
                                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                                            {LANGUAGES.map(l => (
                                                <button 
                                                    key={l.code} 
                                                    onClick={() => { setLocale(l.code as any); setIsLangOpen(false); }} 
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-3 py-2 text-[13px] font-bold rounded-lg transition-all mb-1",
                                                        locale === l.code ? "bg-[#2EC4B6]/10 text-[#2EC4B6]" : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
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
                        <div className="w-px h-4 bg-[#E5E7EB]" />
                        {/* Currency */}
                        <div className="relative">
                            <button 
                                onClick={() => setIsCurrOpen(!isCurrOpen)}
                                className="h-9 px-3 flex items-center gap-2 rounded-lg hover:bg-white transition-all text-[13px] font-black text-[#0F172A]"
                            >
                                {currency}
                                <ChevronDown size={14} className={cn("text-[#94A3B8] transition-transform", isCurrOpen && "rotate-180")} />
                            </button>
                            <AnimatePresence>
                                {isCurrOpen && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute top-full right-0 mt-2 bg-white border border-[#E5E7EB] rounded-xl shadow-2xl p-2 min-w-[180px] z-[110]"
                                    >
                                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                                            {CURRENCIES.map(c => (
                                                <button 
                                                    key={c.code} 
                                                    onClick={() => { setCurrency(c.code); setIsCurrOpen(false); }} 
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-3 py-2 text-[13px] font-bold rounded-lg transition-all mb-1",
                                                        currency === c.code ? "bg-[#2EC4B6]/10 text-[#2EC4B6]" : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
                                                    )}
                                                >
                                                    <div className="flex flex-col items-start">
                                                        <span className="leading-none mb-0.5">{c.code}</span>
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
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <NotificationBell isLight={true} />
                        </div>
                        
                        {/* User Account */}
                        {(() => {
                            let dashboardLink = "/auth/login";
                            if (user) {
                                const role = user.role?.toUpperCase();
                                if (['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(role)) {
                                    dashboardLink = "/admin";
                                } else {
                                    dashboardLink = "/dashboard";
                                }
                            }

                            return (
                                <div className="relative group">
                                    <Link href={dashboardLink} className="flex items-center gap-3 h-12 pl-2 pr-4 bg-[#F8FAFC] border border-[#E5E7EB] rounded-full hover:border-[#2EC4B6] transition-all group/acc">
                                        <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center border border-[#E5E7EB] overflow-hidden group-hover/acc:border-[#2EC4B6] transition-all">
                                            {user?.avatar ? (
                                                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={20} className="text-[#64748B] group-hover/acc:text-[#2EC4B6]" />
                                            )}
                                        </div>
                                        <div className="hidden sm:flex flex-col items-start leading-tight">
                                            <span className="text-[11px] text-[#64748B] font-bold uppercase tracking-tight">{t('navbar', 'account')}</span>
                                            <span className="text-[13px] text-[#111827] font-black truncate max-w-[80px]">
                                                {user?.name?.split(' ')[0] || t('navbar', 'signIn')}
                                            </span>
                                        </div>
                                        <ChevronDown size={14} className="text-[#94A3B8] hidden sm:block group-hover/acc:text-[#2EC4B6] transition-all" />
                                    </Link>

                                    {/* User Hover Dropdown */}
                                    {user && (
                                        <div className="absolute top-full right-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
                                            <div className="w-56 bg-white border border-[#E5E7EB] rounded-2xl shadow-2xl p-2 overflow-hidden">
                                                {(() => {
                                                    const role = user.role?.toUpperCase() || '';
                                                    const isAdmin = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(role);
                                                    const isSupplier = role === 'SUPPLIER';

                                                    let settingsLink = "/dashboard/customer/settings";
                                                    if (isAdmin) settingsLink = "/admin/settings";
                                                    if (isSupplier) settingsLink = "/supplier/settings";

                                                    return (
                                                        <>
                                                            <Link href={dashboardLink} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F8FAFC] text-[13px] font-bold text-[#64748B] hover:text-[#2EC4B6] transition-all">
                                                                <Monitor size={16} /> {isAdmin ? t('userMenu', 'techDashboard') : t('userMenu', 'dashboard')}
                                                            </Link>
                                                            {!isAdmin && !isSupplier && (
                                                                <Link href="/dashboard/customer/orders" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F8FAFC] text-[13px] font-bold text-[#64748B] hover:text-[#2EC4B6] transition-all">
                                                                    <Package size={16} /> {t('userMenu', 'trackOrder')}
                                                                </Link>
                                                            )}
                                                            <Link href={settingsLink} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F8FAFC] text-[13px] font-bold text-[#64748B] hover:text-[#2EC4B6] transition-all">
                                                                <User size={16} /> {t('userMenu', 'settings')}
                                                            </Link>
                                                        </>
                                                    );
                                                })()}
                                                <div className="h-px bg-[#E5E7EB] my-1" />
                                                <button 
                                                    onClick={logout}
                                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#FEF2F2] text-[13px] font-bold text-[#EF4444] transition-all"
                                                >
                                                    <LogOut size={16} /> {t('navbar', 'logout')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        <Link href="/cart" className="relative w-12 h-12 flex items-center justify-center rounded-full bg-[#0B1F3A] text-white hover:bg-[#2EC4B6] transition-all shadow-lg active:scale-90">
                            <ShoppingCart size={22} />
                            {items.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#2EC4B6] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-in zoom-in duration-300">
                                    {items.length}
                                </span>
                            )}
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}
