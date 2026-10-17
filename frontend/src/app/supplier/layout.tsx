'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Package,
    Warehouse,
    LifeBuoy,
    ShoppingCart,
    MessageSquare,
    Bell,
    LogOut,
    Menu,
    X,
    Clock,
    Moon,
    Sun,
    Star,
    Settings,
    Truck
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { supplierApi, SUPPLIER_DATA_CHANGED, type SupplierAttention } from '@/lib/supplier-api';
import { useLanguage } from '@/contexts/LanguageContext';
import { LOCALES, LOCALE_META } from '@/locales/config';
import { ProductTour } from '@/components/onboarding/ProductTour';
import { SUPPLIER_TOUR } from '@/components/onboarding/tours';
import NotificationBell from '@/components/ui/NotificationBell';
import { ConfirmProvider } from '@/components/supplier/ui';

// Languages available to suppliers — the same list as the storefront (locales/config.ts).
const SUPPLIER_LANGUAGES = LOCALES.map((code) => ({ code, name: LOCALE_META[code].name, flag: LOCALE_META[code].short }));

// Supplier navigation. Removed from the menu (pages and APIs still exist, so
// old links keep working): Analytics (its useful metrics now live on the
// Business Overview), Wholesale Offers, Offers & Ads, Payment Methods.
// `labelKey` is a key of the supplierShell dictionary, translated at render time.
// `tour` is the data-tour target used by the first-login tour (components/onboarding/tours.ts).
const SUPPLIER_LINKS: { labelKey: string; href: string; icon: any; key?: string; locked?: boolean; tour?: string }[] = [
    { labelKey: 'navOverview', href: '/supplier', icon: LayoutDashboard },
    { labelKey: 'navProducts', href: '/supplier/products', icon: Package, key: 'products', tour: 'supplier-nav-products' },
    { labelKey: 'navInventory', href: '/supplier/inventory', icon: Warehouse, tour: 'supplier-nav-inventory' },
    { labelKey: 'navOrders', href: '/supplier/orders', icon: ShoppingCart, key: 'orders', tour: 'supplier-nav-orders' },
    { labelKey: 'navFulfillment', href: '/supplier/fulfillment', icon: Truck },
    { labelKey: 'navSettings', href: '/supplier/settings', icon: Settings },
    { labelKey: 'navSupport', href: '/supplier/support', icon: LifeBuoy, tour: 'supplier-nav-support' },
];

/** Overview matches only itself; other items also match their sub-pages. */
const isLinkActive = (pathname: string, href: string) => (href === '/supplier' ? pathname === '/supplier' : pathname === href || pathname.startsWith(href + '/'));

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = React.useState(true);
    const [isMobileOpen, setIsMobileOpen] = React.useState(false);
    const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
    const pathname = usePathname();
    const { user, logout, isAuthReady } = useAuth();
    const { theme, setTheme } = useTheme();
    const router = useRouter();
    const { t, dir, fmt } = useLanguage();
    const tr = (key: string, vars?: Record<string, string | number>) => t('supplierShell', key, vars);
    const [attention, setAttention] = React.useState<SupplierAttention | null>(null);

    // Auto-collapse sidebar on smaller screens
    React.useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 1024) setIsOpen(false);
            else setIsOpen(true);
        };
        handleResize(); // Initial check
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Role Guard: Only Suppliers allowed in /supplier
    React.useEffect(() => {
        if (isAuthReady) {
            if (!user) {
                router.replace('/auth/login?session=expired');
            } else if (user.role?.toUpperCase() !== 'SUPPLIER') {
                if (user.role?.toUpperCase() === 'ADMIN' || user.role?.toUpperCase() === 'OWNER') {
                    router.replace('/admin');
                } else {
                    router.replace('/dashboard/customer');
                }
            }
        }
    }, [isAuthReady, user, router]);

    // (A header stats poll of /dashboard/supplier used to run here every 60 s; its result was never
    // shown and the response carries buyer-price revenue — see the gap register, SUP findings.)

    // Navigation badges (GET /supplier-catalog/attention): products needing the supplier
    // (draft, rejected, needs changes — each product once) and order requests awaiting
    // their confirmation. Refreshed on navigation, when the window regains focus, after
    // product/order changes made through supplierApi, and every minute while visible.
    const isSupplier = user?.role?.toUpperCase() === 'SUPPLIER';
    const refreshAttention = React.useCallback(() => {
        supplierApi.attention().then(setAttention).catch(() => { /* keep the last known counts */ });
    }, []);
    React.useEffect(() => { if (isSupplier) refreshAttention(); }, [isSupplier, pathname, refreshAttention]);
    React.useEffect(() => {
        if (!isSupplier) return;
        const onFocus = () => refreshAttention();
        const onVisible = () => { if (document.visibilityState === 'visible') refreshAttention(); };
        window.addEventListener('focus', onFocus);
        window.addEventListener(SUPPLIER_DATA_CHANGED, onFocus);
        document.addEventListener('visibilitychange', onVisible);
        const interval = setInterval(() => { if (document.visibilityState === 'visible') refreshAttention(); }, 60_000);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener(SUPPLIER_DATA_CHANGED, onFocus);
            document.removeEventListener('visibilitychange', onVisible);
            clearInterval(interval);
        };
    }, [isSupplier, refreshAttention]);

    /**
     * Badge for a nav item: the count, its accessible label and the filtered view it opens.
     * Products: on "Inventory & Products" (/supplier/products), where drafts, rejections and
     * requested changes are resolved — not "Stock & Reservations", which is stock only.
     */
    const badgeFor = (key?: string): { count: number; label: string; href: string } | null => {
        if (!attention || !key) return null;
        if (key === 'products' && attention.products.total > 0) {
            const p = attention.products;
            return { count: p.total, href: '/supplier/products?status=DRAFT,NEEDS_CHANGES,REJECTED', label: t('supplierOverview', 'navProductsBadgeAria', { total: p.total, drafts: p.drafts, rejected: p.rejected, changes: p.needsChanges }) };
        }
        if (key === 'orders' && attention.ordersAwaiting > 0) {
            return { count: attention.ordersAwaiting, href: '/supplier/orders?view=action', label: t('supplierOverview', 'navOrdersBadgeAria', { count: attention.ordersAwaiting }) };
        }
        return null;
    };

    if (!isAuthReady || (user && user.role?.toUpperCase() !== 'SUPPLIER')) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#F8FAFC]">
                <div className="w-10 h-10 border-4 border-[#0EA5A4] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-[100dvh] overflow-hidden bg-[#F8FAFC] font-sans selection:bg-[#0EA5A4]/10">
            {/* Sidebar (Desktop) */}
            <aside data-no-translate className={cn(
                "hidden md:flex flex-col h-full bg-[#0F172A] transition-all duration-300 ease-in-out shrink-0 text-start",
                isOpen ? "w-[260px]" : "w-[80px]"
            )}>
                {/* Brand Logo */}
                <div className="h-16 flex items-center px-6 border-b border-white/5">
                    <Link href="/" className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
                            <img src="/brand/atlantis-mark.png" alt={'Atlantis'} className="w-6 h-6 object-contain" />
                        </div>
                        <AnimatePresence>
                            {isOpen && (
                                <motion.span 
                                    initial={{ opacity: 0, x: dir === 'rtl' ? 10 : -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: dir === 'rtl' ? 10 : -10 }}
                                    className="font-black text-lg tracking-tighter text-white uppercase"
                                >
                                    Atlan<span className="text-[#0EA5A4]">tis.</span>{/* i18n-ignore: brand wordmark */}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Link>
                </div>

                {/* Sidebar Navigation */}
                <nav aria-label={tr('navAria')} className="flex-1 py-5 px-3 space-y-0.5 overflow-y-auto no-scrollbar">
                    {isOpen && <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">{tr('workspace')}</p>}
                    {SUPPLIER_LINKS.map((link) => {
                        const Icon = link.icon;
                        const label = tr(link.labelKey);
                        const isActive = isLinkActive(pathname, link.href);
                        const badge = badgeFor(link.key);
                        return (
                            <div key={link.href} className="relative">
                            <Link
                                href={link.href}
                                data-tour={link.tour}
                                aria-current={isActive ? 'page' : undefined}
                                title={isOpen ? undefined : label}
                                className={cn(
                                    "relative flex items-center gap-3 h-10 px-3 rounded-lg transition-colors group outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]",
                                    isActive ? "bg-white/[0.08] text-white" : "text-[#A3B1C6] hover:text-white hover:bg-white/[0.04]",
                                )}
                            >
                                {isActive && <span aria-hidden className="absolute start-0 top-2 bottom-2 w-[3px] rounded-full bg-[#2EC4B6]" />}
                                <Icon size={18} strokeWidth={1.9} className={cn("shrink-0", isActive ? "text-[#2EC4B6]" : "text-[#7C8BA1] group-hover:text-white")} />
                                {isOpen && <span className={cn("text-[13.5px] font-medium flex-1 truncate", badge && "pe-8")}>{label}</span>}
                            </Link>
                            {badge && (
                                <Link href={badge.href} aria-label={badge.label} title={badge.label}
                                    className={cn("absolute rounded-full bg-[#F59E0B] text-[#111827] font-bold flex items-center justify-center tabular-nums hover:bg-[#FBBF24] outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]",
                                        isOpen ? "top-2.5 end-2 min-w-[20px] h-5 px-1.5 text-[11px]" : "top-0.5 end-0.5 min-w-[16px] h-4 px-1 text-[10px]")}>
                                    {fmt.number(badge.count)}
                                </Link>
                            )}
                            </div>
                        );
                    })}
                </nav>

                {/* Sidebar Footer */}
                <div className="p-3 border-t border-white/5">
                    <button 
                        onClick={() => setIsOpen(!isOpen)}
                        aria-label={isOpen ? tr('collapseMenu') : tr('expandMenu')}
                        aria-expanded={isOpen}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all"
                    >
                        <Menu size={20} />
                        {isOpen && <span className="text-[14px] font-medium">{tr('collapseMenu')}</span>}
                    </button>
                    <button
                        onClick={async () => { await logout(); window.location.href = '/auth/login'; }}
                        aria-label={isOpen ? undefined : tr('signOut')}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all"
                    >
                        <LogOut size={20} />
                        {isOpen && <span className="text-[14px] font-medium">{tr('signOut')}</span>}
                    </button>
                </div>
            </aside>

            {/* Main Wrapper */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                {/* Top Header */}
                <header data-no-translate className="h-16 bg-white border-b border-[#E2E8F0] flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 shrink-0 z-30 text-start">
                    <div className="flex items-center gap-4">
                        {/* Mobile Menu Trigger */}
                        <button 
                            className="md:hidden p-2 text-[#64748B] hover:bg-slate-50 rounded-lg"
                            onClick={() => setIsMobileOpen(true)}
                            aria-label={tr('openMenu')}
                        >
                            <Menu size={24} />
                        </button>
                        <h1 className="text-[17px] sm:text-[20px] font-semibold text-[#0F172A] tracking-tight whitespace-nowrap">{tr('businessHub')}</h1>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        {/* Status Badge */}
                        {/* Company verification comes from the KYC review, not from having an account. */}
                        <Link href="/dashboard/kyc" className={cn('hidden lg:flex items-center gap-2 px-3 py-1 rounded-full ring-1 ring-inset text-[12px] font-semibold',
                            user?.kycStatus === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : user?.kycStatus === 'PENDING' ? 'bg-amber-50 text-amber-800 ring-amber-200'
                                    : 'bg-slate-100 text-slate-600 ring-slate-200')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', user?.kycStatus === 'VERIFIED' ? 'bg-emerald-500' : user?.kycStatus === 'PENDING' ? 'bg-amber-500' : 'bg-slate-400')} />
                            {tr(user?.kycStatus === 'VERIFIED' ? 'kycVerified' : user?.kycStatus === 'PENDING' ? 'kycPending' : user?.kycStatus === 'REJECTED' ? 'kycRejected' : 'kycNone')}
                        </Link>

                        {/* Language picker — supplier can switch to their
                            language directly from the dashboard, matches
                            the same dropdown style used in the public
                            Navbar so it feels like one consistent app. */}
                        <div className="hidden sm:block"><SupplierLanguagePicker /></div>

                        {/* Theme Toggle */}
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            aria-label={theme === 'dark' ? tr('switchToLight') : tr('switchToDark')}
                            title={theme === 'dark' ? tr('switchToLight') : tr('switchToDark')}
                            className="hidden sm:flex w-10 h-10 rounded-full hover:bg-slate-50 items-center justify-center text-[#64748B] transition-all"
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>

                        {/* Notifications */}
                        <NotificationBell isLight={theme !== 'dark'} />

                        <div className="hidden sm:block h-8 w-[1px] bg-[#E2E8F0]" />

                        {/* User Profile */}
                        <div className="flex items-center gap-3 ps-2">
                            <div className="flex flex-col items-end hidden sm:flex">
                                <span className="text-[13px] font-bold text-[#0F172A]">{user?.name || tr('fallbackName')}</span>
                                <span className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wider">{user?.role?.toUpperCase() === 'SUPPLIER' ? tr('roleSupplier') : user?.role}</span>
                            </div>
                            <UserMenu role="supplier" />
                        </div>
                    </div>
                </header>

                {/* Main Content (Scrollable) */}
                {/* `relative` makes this scroll area the containing block for
                    absolutely-positioned descendants (e.g. sr-only labels). Without
                    it they anchored to <body>, stretched the document past the
                    viewport and the window scrolled the whole app up, leaving a
                    blank band at the bottom of long pages like the product editor. */}
                <main className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth text-start">
                    <div className="max-w-[1320px] mx-auto w-full py-6 px-4 sm:px-6 lg:px-8">
                        <ConfirmProvider>{children}</ConfirmProvider>
                    </div>
                </main>
            </div>

            {/* Mobile Overlay Sidebar */}
            <AnimatePresence>
                {isMobileOpen && (
                    <div data-no-translate className="fixed inset-0 z-[100] md:hidden">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
                            onClick={() => setIsMobileOpen(false)} 
                        />
                        <motion.aside 
                            initial={{ x: dir === 'rtl' ? 260 : -260 }}
                            animate={{ x: 0 }}
                            exit={{ x: dir === 'rtl' ? 260 : -260 }}
                            className="absolute top-0 start-0 h-full w-[260px] bg-[#0F172A] flex flex-col shadow-2xl text-start"
                        >
                            <div className="h-16 flex items-center justify-between px-6 border-b border-white/5">
                                <span className="font-black text-lg text-white uppercase">Atlan<span className="text-[#0EA5A4]">tis.</span></span>{/* i18n-ignore: brand wordmark */}
                                <button onClick={() => setIsMobileOpen(false)} aria-label={tr('closeMenu')} className="text-white/60"><X size={20} /></button>
                            </div>
                            <nav aria-label={tr('navAria')} className="flex-1 p-4 space-y-1">
                                {SUPPLIER_LINKS.map((link) => {
                                    const active = isLinkActive(pathname, link.href);
                                    const badge = badgeFor(link.key);
                                    return (
                                        <div key={link.href} className="relative">
                                        <Link
                                            href={link.href}
                                            aria-current={active ? 'page' : undefined}
                                            onClick={() => setIsMobileOpen(false)}
                                            className={cn("flex items-center gap-3 h-11 px-3 rounded-lg transition-colors", active ? "bg-white/[0.08] text-white" : "text-[#A3B1C6] hover:text-white")}
                                        >
                                            <link.icon size={18} className={active ? "text-[#2EC4B6]" : undefined} />
                                            <span className={cn("text-[14px] font-medium", badge && "pe-12")}>{tr(link.labelKey)}</span>
                                        </Link>
                                        {badge && (
                                            <Link href={badge.href} aria-label={badge.label} onClick={() => setIsMobileOpen(false)}
                                                className="absolute top-0 end-0 h-11 min-w-[44px] px-2 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] rounded-lg">
                                                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#F59E0B] text-[#111827] text-[11px] font-bold flex items-center justify-center tabular-nums">{fmt.number(badge.count)}</span>
                                            </Link>
                                        )}
                                        </div>
                                    );
                                })}
                            </nav>
                        </motion.aside>
                    </div>
                )}
            </AnimatePresence>

            {/* First-login tour (server-persisted; shows only on /supplier for eligible accounts). */}
            <ProductTour tour={SUPPLIER_TOUR} />
        </div>
    );
}


// ─── Supplier-side language picker ─────────────────────────────────────────

function SupplierLanguagePicker() {
    const { locale, setLocale, t } = useLanguage();
    const [isOpen, setIsOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    const current = SUPPLIER_LANGUAGES.find(l => l.code === locale) || SUPPLIER_LANGUAGES[0];

    React.useEffect(() => {
        const onClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setIsOpen(o => !o)}
                title={t('supplierShell', 'changeLanguage')}
                aria-label={t('supplierShell', 'changeLanguage')}
                aria-expanded={isOpen}
                className="h-10 px-3 rounded-full hover:bg-slate-50 flex items-center gap-2 text-[#475569] transition-all border border-transparent hover:border-[#E2E8F0]"
            >
                <span className="text-[12px] font-bold uppercase tracking-wider">{current.flag}</span>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="absolute end-0 top-full mt-2 bg-white border border-[#E2E8F0] rounded-xl shadow-2xl p-2 min-w-[200px] z-[110] max-h-[320px] overflow-y-auto"
                    >
                        {SUPPLIER_LANGUAGES.map(l => (
                            <button
                                key={l.code}
                                onClick={() => { setLocale(l.code); setIsOpen(false); }}
                                className={cn(
                                    'w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold rounded-lg transition-colors',
                                    locale === l.code ? 'bg-[#0EA5A4]/10 text-[#0EA5A4]' : 'text-[#475569] hover:bg-slate-50',
                                )}
                            >
                                <span lang={l.code}>{l.name}</span>
                                {locale === l.code && <span className="w-1.5 h-1.5 rounded-full bg-[#0EA5A4]" />}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
