'use client';

import * as React from 'react';
import { useCart } from '@/lib/cart';
import { Search, ShoppingCart, User, Menu, PackageSearch, Moon, Sun, ChevronRight, ChevronDown, Heart, Globe } from 'lucide-react';
import NotificationBell from '@/components/ui/NotificationBell';
import { SUPPORTED_CURRENCIES, getActiveCurrency, setActiveCurrency } from '@/lib/currency';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { Locale } from '@/locales';
import { usePathname } from 'next/navigation';
import { CATEGORIES_LIST } from '@/lib/products';
import { ThemeToggle } from '../ui/ThemeToggle';

export default function Navbar() {
    const { items } = useCart();
    const { user, logout } = useAuth();
    const { theme, setTheme } = useTheme();
    const { locale, setLocale, t, dir } = useLanguage();
    const [searchTerm, setSearchTerm] = React.useState('');
    const [scrolled, setScrolled] = React.useState(false);
    const [isCategoriesOpen, setIsCategoriesOpen] = React.useState(false);
    const [isCurrencyOpen, setIsCurrencyOpen] = React.useState(false);
    const [activeCurrency, setActiveCurrencyState] = React.useState('USD');
    const categoriesRef = React.useRef<HTMLDivElement>(null);
    const currencyRef = React.useRef<HTMLDivElement>(null);

    // Load saved currency on mount + react to changes
    React.useEffect(() => {
        setActiveCurrencyState(getActiveCurrency());
        const handler = () => setActiveCurrencyState(getActiveCurrency());
        window.addEventListener('currency-changed', handler);
        return () => window.removeEventListener('currency-changed', handler);
    }, []);

    const handleCurrencySelect = (code: string) => {
        setActiveCurrency(code);
        setActiveCurrencyState(code);
        setIsCurrencyOpen(false);
    };

    // Close currency dropdown on outside click
    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
                setIsCurrencyOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    const router = useRouter();
    const pathname = usePathname();
    const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

    const isWhiteBackgroundPage = pathname.startsWith('/categories') || pathname.startsWith('/products') || pathname.startsWith('/cart') || pathname.startsWith('/checkout') || pathname.startsWith('/dashboard') || pathname.startsWith('/wishlist');

    // Hide Navbar completely on auth pages, as they have their own integrated clean layout.
    if (pathname.startsWith('/auth')) {
        return null;
    }

    React.useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        const handleClickOutside = (e: MouseEvent) => {
            if (categoriesRef.current && !categoriesRef.current.contains(e.target as Node)) {
                setIsCategoriesOpen(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('scroll', handleScroll);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchTerm.trim()) {
            router.push(`/categories?q=${encodeURIComponent(searchTerm)}`);
        }
    };

    return (
        <header className={cn(
            "fixed top-0 start-0 end-0 z-50 transition-all duration-300",
            scrolled ? "glass py-2 text-foreground" : (isWhiteBackgroundPage ? "bg-card border-b border-border/50 py-4 text-foreground shadow-sm" : "bg-transparent py-4 text-white")
        )}>
            <div className="container mx-auto px-6 flex items-center justify-between gap-8">
                {/* Logo & Categories */}
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 group">
                        <span className={cn(
                            "font-heading font-black text-2xl tracking-tighter",
                            (scrolled || isWhiteBackgroundPage) ? "text-primary" : "text-white"
                        )}>
                            Atlan<span className="text-secondary">tis</span>
                        </span>
                    </Link>

                    <div 
                        className="relative" 
                        ref={categoriesRef}
                        onMouseEnter={() => setIsCategoriesOpen(true)}
                        onMouseLeave={() => setIsCategoriesOpen(false)}
                    >
                        <button
                            onClick={() => setIsCategoriesOpen(!isCategoriesOpen)}
                            className={cn(
                                "hidden lg:flex items-center gap-2 text-sm font-bold transition-all group",
                                (isCategoriesOpen || scrolled || isWhiteBackgroundPage) ? "text-primary hover:text-secondary" : "text-white hover:text-secondary"
                            )}
                        >
                            <Menu size={20} className={cn("transition-transform", isCategoriesOpen ? "rotate-90" : "group-hover:rotate-90")} />
                            <span>{t('navbar', 'categories')}</span>
                            <ChevronDown size={16} className={cn("transition-transform", isCategoriesOpen ? "rotate-180" : "")} />
                        </button>

                        {isCategoriesOpen && (
                            <div className="absolute top-full -mt-1 pt-4 start-0 w-72 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="bg-card border border-border/50 rounded-xl shadow-2xl py-3 whitespace-nowrap overflow-hidden">
                                <div className="px-4 pb-2 mb-2 border-b border-border/50">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        {t('navbar', 'browseCategories') || 'Browse Categories'}
                                    </span>
                                </div>
                                <div className="max-h-[60vh] overflow-y-auto no-scrollbar py-1">
                                    {CATEGORIES_LIST.map((cat) => (
                                        <Link
                                            key={cat}
                                            href={`/categories?category=${encodeURIComponent(cat)}`}
                                            className="flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-primary/5 hover:text-primary transition-colors group/item"
                                            onClick={() => setIsCategoriesOpen(false)}
                                        >
                                            <span>{t('categories', cat.replace(/\s+/g, '').replace(/&/g, '').charAt(0).toLowerCase() + cat.replace(/\s+/g, '').replace(/&/g, '').slice(1)) || cat}</span>
                                            <ChevronRight size={14} className={cn("opacity-0 group-hover/item:opacity-100 translate-x-1 group-hover/item:translate-x-0 transition-all", dir === 'rtl' ? "rotate-180" : "")} />
                                        </Link>
                                    ))}
                                </div>
                                <div className="mt-2 pt-2 border-t border-border/50 px-3">
                                    <Link
                                        href="/categories"
                                        className="flex items-center justify-center gap-2 w-full py-2 bg-secondary/10 text-secondary hover:bg-secondary hover:text-white rounded-lg text-xs font-bold transition-all uppercase tracking-wider"
                                        onClick={() => setIsCategoriesOpen(false)}
                                    >
                                        {t('navbar', 'browseAll')}
                                        <PackageSearch size={14} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                </div>

                {/* Main Search Bar */}
                <form onSubmit={handleSearch} className="flex-1 max-w-2xl hidden md:flex relative group h-11">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={t('navbar', 'searchPlaceholder')}
                        className="w-full h-full bg-white text-black rounded-s-lg px-12 text-sm font-medium outline-none border-none"
                    />
                    <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <button
                        type="submit"
                        className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-8 font-bold text-sm rounded-e-lg transition-colors"
                    >
                        {t('common', 'search')}
                    </button>
                </form>

                {/* Actions */}
                <div className="flex items-center gap-6">
                    {/* How to use button */}
                    <div className="hidden lg:flex items-center gap-2">
                        <Link
                            href="/how-it-works"
                            className={cn(
                                "text-xs font-bold px-4 py-2 rounded-lg border transition-all hover:bg-secondary hover:text-white hover:border-secondary",
                                (scrolled || isWhiteBackgroundPage) ? "border-primary text-primary" : "border-white/20 text-white"
                            )}
                        >
                            {t('navbar', 'howToUse')}
                        </Link>
                    </div>

                    {/* Language Switcher */}
                    <div className="hidden lg:flex items-center gap-2">
                        <select
                            value={locale}
                            onChange={(e) => setLocale(e.target.value as Locale)}
                            className={cn(
                                "bg-transparent text-xs font-bold outline-none cursor-pointer uppercase",
                                (scrolled || isWhiteBackgroundPage) ? "text-foreground" : "text-white"
                            )}
                        >
                            <option value="en" className="text-black">EN</option>
                            <option value="ar" className="text-black">عربي</option>
                            <option value="fr" className="text-black">FR</option>
                            <option value="de" className="text-black">DE</option>
                            <option value="es" className="text-black">ES</option>
                            <option value="pt" className="text-black">PT</option>
                            <option value="ro" className="text-black">RO</option>
                        </select>
                    </div>

                    <ThemeToggle />

                    <div className={cn(
                        "hidden xl:flex flex-col items-end text-[10px] font-bold uppercase tracking-widest",
                        (scrolled || isWhiteBackgroundPage) ? "text-muted-foreground" : "text-white/50"
                    )}>
                        <span>{t('navbar', 'logisticsHelp')}</span>
                        <span className={(scrolled || isWhiteBackgroundPage) ? "text-foreground" : "text-white"}>{t('navbar', 'supplyPartners')}</span>
                    </div>

                    <div className={cn("w-px h-8 mx-2 hidden lg:block", (scrolled || isWhiteBackgroundPage) ? "bg-border" : "bg-white/10")} />

                    <Link
                        href={user ? (user.role?.toLowerCase() === 'admin' ? '/admin' : user.role?.toLowerCase() === 'supplier' ? '/supplier' : '/dashboard/customer') : '/auth/login'}
                        className="flex flex-col items-center gap-0.5 group"
                    >
                        <User className="w-5 h-5 group-hover:text-secondary transition-colors" />
                        <span className="text-[10px] font-bold">{user ? (user.name?.split(' ')[0] || 'User') : t('navbar', 'account')}</span>
                    </Link>

                    {/* Wishlist */}
                    {user && (
                        <Link href="/wishlist" className="flex flex-col items-center gap-0.5 group">
                            <Heart className="w-5 h-5 group-hover:text-secondary transition-colors" />
                            <span className="text-[10px] font-bold">Saved</span>
                        </Link>
                    )}

                    {/* Currency Switcher */}
                    <div className="relative" ref={currencyRef}>
                        <button
                            onClick={() => setIsCurrencyOpen(prev => !prev)}
                            className="flex flex-col items-center gap-0.5 group"
                        >
                            <Globe className="w-5 h-5 group-hover:text-secondary transition-colors" />
                            <span className="text-[10px] font-bold">{activeCurrency}</span>
                        </button>
                        {isCurrencyOpen && (
                            <div className="absolute end-0 top-10 w-52 bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden z-50">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1">Select Currency</p>
                                <div className="max-h-64 overflow-y-auto">
                                    {SUPPORTED_CURRENCIES.map(c => (
                                        <button key={c.code} onClick={() => handleCurrencySelect(c.code)}
                                            className={cn(
                                                "w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors text-foreground dark:text-white",
                                                activeCurrency === c.code && "bg-primary/5 text-primary font-black"
                                            )}>
                                            <span className="font-bold">{c.name}</span>
                                            <span className="text-xs font-black opacity-60">{c.symbol} {c.code}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notifications */}
                    <NotificationBell isLight={scrolled || isWhiteBackgroundPage} />

                    {/* Cart */}
                    <Link href="/cart" className="relative flex flex-col items-center gap-0.5 group">
                        <ShoppingCart className="w-5 h-5 group-hover:text-secondary transition-colors" />
                        <span className="text-[10px] font-bold">{t('navbar', 'cart')}</span>
                        {cartCount > 0 && (
                            <span className="absolute -top-1 -end-1 bg-secondary text-secondary-foreground text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                                {cartCount}
                            </span>
                        )}
                    </Link>
                </div>
            </div>
        </header>
    );
}
