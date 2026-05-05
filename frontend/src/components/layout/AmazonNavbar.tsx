'use client';

import * as React from 'react';
import { useCart } from '@/lib/cart';
import {
    Search, ShoppingCart, Menu, ChevronDown, X,
    Building2, Package, Tag, Users, HelpCircle,
    Moon, Sun, Globe, LogIn, LayoutDashboard
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CATEGORIES_LIST } from '@/lib/products';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { useLanguage } from '@/contexts/LanguageContext';
import { Locale } from '@/locales';
import { fetchSearchSuggestions } from '@/lib/api';
import { type Product } from '@/lib/types';

export default function AmazonNavbar() {
    const { items } = useCart();
    const { user } = useAuth();
    const { t, locale, setLocale } = useLanguage();
    const [searchTerm, setSearchTerm] = React.useState('');
    const [searchCategory, setSearchCategory] = React.useState('All');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
    const [isCategoriesOpen, setIsCategoriesOpen] = React.useState(false);
    const [suggestions, setSuggestions] = React.useState<Product[]>([]);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [isSearching, setIsSearching] = React.useState(false);
    const router = useRouter();
    const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    const categoriesRef = React.useRef<HTMLDivElement>(null);
    const searchContainerRef = React.useRef<HTMLDivElement>(null);
    const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => { setMounted(true); }, []);

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (categoriesRef.current && !categoriesRef.current.contains(e.target as Node)) {
                setIsCategoriesOpen(false);
            }
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!val.trim() || val.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            const results = await fetchSearchSuggestions(val.trim());
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
            setIsSearching(false);
        }, 280);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setShowSuggestions(false);
        if (searchTerm.trim()) {
            router.push(`/categories?q=${encodeURIComponent(searchTerm)}`);
            setIsMobileMenuOpen(false);
        }
    };

    const getDashboardLink = () => {
        if (!user) return '/auth/login';
        switch (user.role?.toLowerCase()) {
            case 'admin': return '/admin';
            case 'supplier': return '/supplier';
            default: return '/dashboard/customer';
        }
    };

    const navLinks = [
        { href: '/deals', label: t('navbar', 'volumeDeals') || 'Daily Deals', icon: Tag },
        { href: '/categories', label: t('navbar', 'browseCatalog') || 'All Products', icon: Package },
        { href: '/suppliers', label: t('navbar', 'supplyPartners') || 'Suppliers', icon: Users },
        { href: '/help', label: t('navbar', 'logisticsHelp') || 'Help & Support', icon: HelpCircle },
    ];

    return (
        <header className="sticky top-0 z-50 w-full flex flex-col shadow-md">
            <div className="bg-primary text-primary-foreground">
                <div className="page-container flex items-center gap-3 h-16">
                    <Link href="/" className="flex items-center gap-3 shrink-0 group" aria-label="Home">
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-sm group-hover:scale-105 transition-transform">
                            <img src="/icon.png" alt="Atlantis" className="w-full h-full object-cover" />
                        </div>
                        <div className="hidden sm:flex flex-col leading-none">
                            <span className="font-black text-lg tracking-tighter uppercase">
                                <span className="text-white">ATLAN</span><span className="text-[#2EC4B6]">TIS.</span>
                            </span>
                            <span className="text-[10px] text-white/60 font-medium uppercase tracking-widest">Premium B2B Platform</span>
                        </div>
                    </Link>

                    <div className="flex-1 relative" ref={searchContainerRef}>
                        <form onSubmit={handleSearch} className="flex items-center h-10 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-accent/70 transition-all shadow-sm">
                            <div className="hidden md:flex h-full items-center border-e border-gray-200 bg-gray-50 relative">
                                <select
                                    value={searchCategory}
                                    onChange={(e) => setSearchCategory(e.target.value)}
                                    className="appearance-none h-full bg-transparent text-gray-600 text-xs font-semibold ps-3 pe-7 outline-none cursor-pointer"
                                >
                                    <option value="All">{t('navbar', 'allCategories') || 'All Categories'}</option>
                                    {CATEGORIES_LIST.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                <ChevronDown size={12} className="absolute end-2 text-gray-400 pointer-events-none" />
                            </div>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={handleSearchInput}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                placeholder={t('navbar', 'searchPlaceholder') || 'Search products, brands, categories...'}
                                className="flex-1 h-full px-4 text-sm text-gray-800 placeholder:text-gray-400 outline-none bg-white"
                                autoComplete="off"
                            />
                            {isSearching && (
                                <div className="h-full px-3 flex items-center">
                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-accent rounded-full animate-spin" />
                                </div>
                            )}
                            <button type="submit" className="h-full px-5 bg-accent hover:bg-accent/90 text-white flex items-center justify-center transition-colors" aria-label="Search">
                                <Search size={18} />
                            </button>
                        </form>

                        {/* ── Suggestions Dropdown ───────────────────────────── */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-xl shadow-2xl z-[60] overflow-hidden mt-0.5">
                                <div className="py-1">
                                    {suggestions.map((prod) => (
                                        <Link
                                            key={prod.id}
                                            href={`/products/${prod.id}`}
                                            onClick={() => { setShowSuggestions(false); setSearchTerm(''); setSuggestions([]); }}
                                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group"
                                        >
                                            <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                                                {prod.image ? (
                                                    <img src={prod.image} alt={prod.name} referrerPolicy="no-referrer" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                ) : (
                                                    <Package size={14} className="text-gray-300" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-accent transition-colors">{prod.name}</p>
                                                <p className="text-xs text-gray-400 truncate">{prod.category || prod.brand || ''}</p>
                                            </div>
                                            <Search size={12} className="text-gray-300 shrink-0" />
                                        </Link>
                                    ))}
                                    <button
                                        onClick={() => { handleSearch({ preventDefault: () => {} } as any); }}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-t border-gray-100 text-xs font-bold text-accent hover:bg-accent/5 transition-colors"
                                    >
                                        <Search size={12} /> See all results for &ldquo;{searchTerm}&rdquo;
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        {mounted && (
                            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors" aria-label="Toggle theme">
                                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                            </button>
                        )}
                        <div className="hidden sm:flex items-center">
                            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
                                <Globe size={15} />
                                <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="bg-transparent text-xs font-semibold outline-none cursor-pointer text-inherit uppercase">
                                    <option value="en" className="text-black bg-white">EN</option>
                                    <option value="ar" className="text-black bg-white">AR</option>
                                    <option value="fr" className="text-black bg-white">FR</option>
                                    <option value="de" className="text-black bg-white">DE</option>
                                    <option value="es" className="text-black bg-white">ES</option>
                                    <option value="pt" className="text-black bg-white">PT</option>
                                    <option value="ro" className="text-black bg-white">RO</option>
                                </select>
                            </div>
                        </div>
                        {user ? (
                            <UserMenu role={user.role} />
                        ) : (
                            <Link href="/auth/login" className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                                <LogIn size={16} />
                                <span>{t('navbar', 'signIn')}</span>
                            </Link>
                        )}
                        {user && (
                            <Link href={getDashboardLink()} className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                                <LayoutDashboard size={16} />
                                <span>{user.role?.toLowerCase() === 'buyer' ? t('sidebar', 'orders') : 'Dashboard'}</span>
                            </Link>
                        )}
                        <Link href="/cart" className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white font-semibold text-sm transition-colors shadow-sm" aria-label={`Cart (${cartCount} items)`}>
                            <ShoppingCart size={18} />
                            <span className="hidden sm:inline">{t('navbar', 'cartLabel')}</span>
                            {cartCount > 0 && (
                                <span className="absolute -top-1.5 -end-1.5 min-w-[20px] h-5 px-1 bg-white text-accent rounded-full text-[11px] font-black flex items-center justify-center shadow">
                                    {cartCount > 99 ? '99+' : cartCount}
                                </span>
                            )}
                        </Link>
                        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="flex sm:hidden w-9 h-9 items-center justify-center rounded-lg text-white hover:bg-white/10 transition-colors" aria-label="Toggle mobile menu">
                            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-primary-800 border-t border-white/10 hidden sm:block">
                <div className="page-container flex items-center gap-1 h-10">
                    <div ref={categoriesRef} className="relative h-full flex items-center">
                        <button onClick={() => setIsCategoriesOpen(!isCategoriesOpen)} className={cn('flex items-center gap-1.5 px-3 h-full text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-colors uppercase tracking-wider', isCategoriesOpen && 'bg-white/10 text-white')}>
                            <Menu size={15} />
                            <span>{t('navbar', 'categories')}</span>
                            <ChevronDown size={13} className={cn('transition-transform', isCategoriesOpen && 'rotate-180')} />
                        </button>
                        {isCategoriesOpen && (
                            <div className="absolute top-full start-0 w-64 bg-card border border-border rounded-b-xl shadow-2xl overflow-hidden z-50">
                                <div className="py-1">
                                    {CATEGORIES_LIST.map((cat) => (
                                        <Link key={cat} href={`/categories?category=${encodeURIComponent(cat)}`} className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-primary/5 hover:text-primary transition-colors font-medium" onClick={() => setIsCategoriesOpen(false)}>
                                            <div className="w-2 h-2 rounded-full bg-accent/60" />
                                            {cat}
                                        </Link>
                                    ))}
                                    <div className="border-t border-border mt-1 pt-1">
                                        <Link href="/categories" className="flex items-center justify-center py-2.5 text-xs font-bold text-accent uppercase tracking-wider hover:bg-accent/5 transition-colors" onClick={() => setIsCategoriesOpen(false)}>
                                            {t('navbar', 'browseAll')} →
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="w-px h-5 bg-white/20 mx-1" />
                    {navLinks.map(({ href, label }) => (
                        <Link key={href} href={href} className="flex items-center gap-1.5 px-3 h-full text-xs font-semibold text-white/75 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
                            {label}
                        </Link>
                    ))}
                </div>
            </div>

            {isMobileMenuOpen && (
                <div className="sm:hidden bg-card border-t border-border shadow-xl">
                    <div className="p-3 border-b border-border">
                        <form onSubmit={handleSearch} className="flex items-center h-10 rounded-lg overflow-hidden border border-border bg-background">
                            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search products..." className="flex-1 h-full px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none bg-transparent" />
                            <button type="submit" className="h-full px-4 bg-accent text-white flex items-center"><Search size={16} /></button>
                        </form>
                    </div>
                    <div className="py-2">
                        {navLinks.map(({ href, label, icon: Icon }) => (
                            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                                <Icon size={16} className="text-muted-foreground" />
                                {label}
                            </Link>
                        ))}
                        <div className="border-t border-border mt-2 pt-2 px-4 pb-3 flex items-center gap-3">
                            {mounted && (
                                <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                                    <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                                </button>
                            )}
                            <div className="flex items-center gap-1 ms-auto">
                                <Globe size={14} className="text-muted-foreground" />
                                <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="text-sm text-foreground bg-transparent outline-none cursor-pointer">
                                    <option value="en">EN</option>
                                    <option value="ar">AR</option>
                                    <option value="fr">FR</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
