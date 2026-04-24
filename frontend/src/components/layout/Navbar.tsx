'use client';

import * as React from 'react';
import { useCart } from '@/lib/cart';
import { Search, ShoppingCart, User, Menu, PackageSearch, Moon, Sun, ChevronRight, ChevronDown, Heart, Globe, Loader2 } from 'lucide-react';
import NotificationBell from '@/components/ui/NotificationBell';
import { SUPPORTED_CURRENCIES, getActiveCurrency, setActiveCurrency } from '@/lib/currency';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Locale } from '@/locales';
import { usePathname } from 'next/navigation';
import { CATEGORIES_LIST } from '@/lib/products';
import { ThemeToggle } from '../ui/ThemeToggle';
import { fetchSearchSuggestions } from '@/lib/api';
import type { Product } from '@/lib/types';

export default function Navbar() {
    const { items } = useCart();
    const { user, logout } = useAuth();
    const { theme, setTheme } = useTheme();
    const { locale, setLocale, t, dir } = useLanguage();
    const { currency, setCurrency } = useCurrency();
    const [searchTerm, setSearchTerm] = React.useState('');
    const [scrolled, setScrolled] = React.useState(false);
    const [isCategoriesOpen, setIsCategoriesOpen] = React.useState(false);
    const [isCurrencyOpen, setIsCurrencyOpen] = React.useState(false);
    
    // Autocomplete states
    const [suggestions, setSuggestions] = React.useState<Product[]>([]);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [isSearching, setIsSearching] = React.useState(false);

    const categoriesRef = React.useRef<HTMLDivElement>(null);
    const currencyRef = React.useRef<HTMLDivElement>(null);
    const searchRef = React.useRef<HTMLFormElement>(null);

    const handleCurrencySelect = (code: string) => {
        setCurrency(code);
        // Mark that the user has manually chosen a currency,
        // so the platform default doesn't overwrite it on reload
        if (typeof window !== 'undefined') {
            localStorage.setItem('user-currency-chosen', 'true');
        }
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

    const whiteBackgroundPrefixes = ['/categories', '/products', '/cart', '/checkout', '/dashboard', '/wishlist', '/admin', '/supplier'];
    const isWhiteBackgroundPage = whiteBackgroundPrefixes.some(prefix => pathname.startsWith(prefix));

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
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('scroll', handleScroll);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    React.useEffect(() => {
        if (!searchTerm.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setIsSearching(true);
        setShowSuggestions(true);

        const timer = setTimeout(async () => {
            try {
                const results = await fetchSearchSuggestions(searchTerm);
                setSuggestions(results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchTerm.trim()) {
            setShowSuggestions(false);
            router.push(`/categories?q=${encodeURIComponent(searchTerm)}`);
        }
    };

    const highlightMatch = (text: string, query: string) => {
        if (!query.trim()) return text;
        const regex = new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) => 
            regex.test(part) ? <span key={i} className="text-secondary font-black">{part}</span> : part
        );
    };

    const isDashboardPath = pathname.startsWith('/admin') || pathname.startsWith('/supplier') || pathname.startsWith('/dashboard');

    return (
        <header className={cn(
            "fixed top-0 start-0 end-0 z-[999] transition-all duration-300",
            scrolled ? "glass py-2 text-foreground" : (isWhiteBackgroundPage ? "bg-card border-b border-border/50 py-4 text-foreground shadow-sm" : "bg-transparent py-4 text-white")
        )}>
            <div className="container mx-auto px-6 flex items-center justify-between gap-8">
                {/* Logo & Categories */}
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center premium-shadow group-hover:scale-110 transition-transform duration-300">
                            <img src="/icon.png" alt="Atlantis" className="w-full h-full object-cover" />
                        </div>
                        <span className={cn(
                            "font-heading font-black text-2xl tracking-tighter",
                            (scrolled || isWhiteBackgroundPage) ? "text-primary dark:text-foreground" : "text-white"
                        )}>
                            Atlan<span className="text-secondary">tis</span>
                        </span>
                    </Link>

                    {!isDashboardPath && (
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
                                    (isCategoriesOpen || scrolled || isWhiteBackgroundPage) ? "text-secondary hover:text-primary" : "text-white hover:text-secondary"
                                )}
                            >
                                <Menu size={20} className={cn("transition-transform", isCategoriesOpen ? "rotate-90" : "group-hover:rotate-90")} />
                                <span>{t('navbar', 'categories') || 'Categories'}</span>
                                <ChevronDown size={16} className={cn("transition-transform", isCategoriesOpen ? "rotate-180" : "")} />
                            </button>

                            {isCategoriesOpen && (
                                <div className="absolute top-full -mt-1 pt-4 start-0 w-72 z-[1000] animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="bg-card border border-border/50 rounded-xl shadow-2xl py-3 whitespace-nowrap overflow-hidden text-foreground">
                                    <div className="px-4 pb-2 mb-2 border-b border-border/50">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                            {t('footer', 'browseCategories') || 'Browse Categories'}
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
                    )}
                </div>

                {/* Main Search Bar */}
                <form ref={searchRef} onSubmit={handleSearch} className="flex-1 max-w-4xl hidden md:flex relative group h-11">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => { if (searchTerm.trim()) setShowSuggestions(true); }}
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

                    {/* Autocomplete Dropdown */}
                    {showSuggestions && searchTerm.trim() && (
                        <div className="absolute top-full mt-2 w-full bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden z-[1000] animate-in fade-in slide-in-from-top-2 duration-200 text-foreground">
                            {isSearching ? (
                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                    <Loader2 className="w-5 h-5 animate-spin me-2" />
                                    <span className="text-sm font-medium">Searching...</span>
                                </div>
                            ) : suggestions.length > 0 ? (
                                <div>
                                    <div className="px-4 py-2 border-b border-border/50">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                            Suggestions
                                        </span>
                                    </div>
                                    <ul className="max-h-80 overflow-y-auto no-scrollbar">
                                        {suggestions.map((product) => (
                                            <li key={product.id}>
                                                <Link
                                                    href={`/products/${product.id}`}
                                                    onClick={() => {
                                                        setShowSuggestions(false);
                                                        setSearchTerm(product.name);
                                                    }}
                                                    className="flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors border-b border-border/50 last:border-0 group/item"
                                                >
                                                    {product.images && product.images.length > 0 ? (
                                                        <img
                                                            src={product.images[0]}
                                                            alt={product.name}
                                                            className="w-10 h-10 object-contain rounded-md bg-white border border-border"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 flex items-center justify-center bg-muted rounded-md text-muted-foreground border border-border">
                                                            <PackageSearch size={16} />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold truncate group-hover/item:text-primary transition-colors">
                                                            {highlightMatch(product.name, searchTerm)}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                                            <span className="truncate">{product.category}</span>
                                                            {product.brand && (
                                                                <>
                                                                    <span className="w-1 h-1 rounded-full bg-border" />
                                                                    <span className="truncate font-medium">{product.brand}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="p-2 border-t border-border/50 bg-muted/20">
                                        <button
                                            type="submit"
                                            className="w-full py-2 text-xs font-bold text-secondary hover:bg-secondary hover:text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            View all results for "{searchTerm}" <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                    <Search className="w-10 h-10 text-muted-foreground/30 mb-3" />
                                    <p className="text-sm font-bold">No products found</p>
                                    <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
                                        We couldn't find anything matching "{searchTerm}". Try adjusting your search term.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </form>

                {/* Actions */}
                <div className="flex items-center gap-3 md:gap-5">
                    {/* How to use button */}
                    <div className="hidden xl:flex items-center">
                        <Link
                            href="/how-it-works"
                            className={cn(
                                "text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all hover:bg-secondary hover:text-white hover:border-secondary",
                                (scrolled || isWhiteBackgroundPage) ? "border-secondary text-secondary dark:border-secondary dark:text-secondary" : "border-white/40 text-white"
                            )}
                        >
                            {t('navbar', 'howToUse')}
                        </Link>
                    </div>

                    <div className={cn("w-px h-6 hidden xl:block", (scrolled || isWhiteBackgroundPage) ? "bg-border" : "bg-white/10")} />

                    {/* Language Switcher */}
                    <div className="hidden lg:flex items-center">
                        <select
                            value={locale}
                            onChange={(e) => setLocale(e.target.value as Locale)}
                            className={cn(
                                "bg-transparent text-[11px] font-black outline-none cursor-pointer p-1 rounded-md transition-colors",
                                (scrolled || isWhiteBackgroundPage) ? "text-foreground hover:bg-muted" : "text-white hover:bg-white/10"
                            )}
                        >
                            <option value="en" className="text-black bg-white">EN</option>
                            <option value="ar" className="text-black bg-white">عربي</option>
                            <option value="fr" className="text-black bg-white">FR</option>
                            <option value="de" className="text-black bg-white">DE</option>
                            <option value="es" className="text-black bg-white">ES</option>
                            <option value="pt" className="text-black bg-white">PT</option>
                            <option value="ro" className="text-black bg-white">RO</option>
                        </select>
                    </div>

                    <ThemeToggle />

                    <div className={cn("w-px h-6 mx-1 hidden lg:block", (scrolled || isWhiteBackgroundPage) ? "bg-border" : "bg-white/10")} />

                    {/* Account / Dashboard Selection */}
                    <Link
                        href={user ? (user.role?.toLowerCase() === 'admin' ? '/admin' : user.role?.toLowerCase() === 'supplier' ? '/supplier' : '/dashboard/customer') : '/auth/login'}
                        className="flex flex-col items-center gap-0.5 group transition-transform active:scale-95"
                    >
                        <User className="w-5 h-5 group-hover:text-secondary transition-colors" />
                        <span className="text-[10px] font-black tracking-tight uppercase">
                            {user ? (user.name?.split(' ')[0] || t('navbar', 'account')) : t('navbar', 'account')}
                        </span>
                    </Link>

                    {/* Wishlist - Only for non-suppliers for now or as a generic feature */}
                    {user && user.role !== 'SUPPLIER' && !isDashboardPath && (
                        <Link href="/wishlist" className="flex flex-col items-center gap-0.5 group transition-transform active:scale-95">
                            <Heart className="w-5 h-5 group-hover:text-secondary transition-colors" />
                            <span className="text-[10px] font-black tracking-tight uppercase">{t('navbar', 'saved') || 'Saved'}</span>
                        </Link>
                    )}

                    {/* Currency Switcher */}
                    <div className="relative" ref={currencyRef}>
                        <button
                            onClick={() => setIsCurrencyOpen(prev => !prev)}
                            className="flex flex-col items-center gap-0.5 group transition-transform active:scale-95"
                        >
                            <Globe className="w-5 h-5 group-hover:text-secondary transition-colors" />
                            <span className="text-[10px] font-black tracking-tight uppercase">{currency}</span>
                        </button>
                        {isCurrencyOpen && (
                            <div className="absolute end-0 top-10 w-52 bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden z-[1000] animate-in fade-in zoom-in-95 duration-200">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1 border-b border-border/50">
                                    {t('navbar', 'selectCurrency') || 'Select Currency'}
                                </p>
                                <div className="max-h-64 overflow-y-auto no-scrollbar">
                                    {SUPPORTED_CURRENCIES.map(c => (
                                        <button key={c.code} onClick={() => handleCurrencySelect(c.code)}
                                            className={cn(
                                                "w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors text-foreground dark:text-white capitalize",
                                                currency === c.code && "bg-primary/5 text-primary font-black"
                                            )}>
                                            <span className="font-bold">{c.name.toLowerCase()}</span>
                                            <span className="text-[10px] font-black opacity-40">{c.symbol} {c.code}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notifications */}
                    <NotificationBell isLight={scrolled || isWhiteBackgroundPage} />

                    {/* Cart */}
                    {!isDashboardPath && (
                        <Link href="/cart" className="relative flex flex-col items-center gap-0.5 group transition-transform active:scale-95">
                            <div className="relative">
                                <ShoppingCart className="w-5 h-5 group-hover:text-secondary transition-colors" />
                                {cartCount > 0 && (
                                    <span className="absolute -top-1.5 -end-1.5 bg-secondary text-secondary-foreground text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-card shadow-sm">
                                        {cartCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] font-black tracking-tight uppercase">{t('navbar', 'cart')}</span>
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
