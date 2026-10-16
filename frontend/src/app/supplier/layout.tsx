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
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Locale } from '@/locales';
import { formatPrice } from '@/lib/currency';
import { GuidedTour } from '@/components/ui/GuidedTour';
import NotificationBell from '@/components/ui/NotificationBell';
import { ConfirmProvider } from '@/components/supplier/ui';

// Languages available to suppliers — kept in sync with the public
// Navbar list (LANGUAGES in components/layout/Navbar.tsx) so a
// supplier sees the same options as a buyer.
const SUPPLIER_LANGUAGES: { code: Locale; name: string; flag: string }[] = [
    { code: 'en', name: 'English',     flag: '🇬🇧' },
    { code: 'ar', name: 'العربية',     flag: '🇪🇬' },
    { code: 'fr', name: 'Français',    flag: '🇫🇷' },
    { code: 'ro', name: 'Română',      flag: '🇷🇴' },
    { code: 'el', name: 'Ελληνικά',    flag: '🇬🇷' },
    { code: 'it', name: 'Italiano',    flag: '🇮🇹' },
    { code: 'es', name: 'Español',     flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch',     flag: '🇩🇪' },
    { code: 'pt', name: 'Português',   flag: '🇵🇹' },
    { code: 'nl', name: 'Nederlands',  flag: '🇳🇱' },
    { code: 'pl', name: 'Polski',      flag: '🇵🇱' },
    { code: 'tr', name: 'Türkçe',      flag: '🇹🇷' },
];

// Supplier navigation. Removed from the menu (pages and APIs still exist, so
// old links keep working): Analytics (its useful metrics now live on the
// Business Overview), Wholesale Offers, Offers & Ads, Payment Methods.
const SUPPLIER_LINKS: { label: string; href: string; icon: any; key?: string; locked?: boolean }[] = [
    { label: 'Business Overview', href: '/supplier', icon: LayoutDashboard },
    { label: 'Inventory & Products', href: '/supplier/products', icon: Package, key: 'products' },
    { label: 'Stock & Reservations', href: '/supplier/inventory', icon: Warehouse },
    { label: 'Orders', href: '/supplier/orders', icon: ShoppingCart, key: 'orders' },
    { label: 'Shipping & Fulfilment', href: '/supplier/fulfillment', icon: Truck },
    { label: 'Settings', href: '/supplier/settings', icon: Settings },
    { label: 'Support', href: '/supplier/support', icon: LifeBuoy },
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
    const [stats, setStats] = React.useState<any>(null);
    const [showTour, setShowTour] = React.useState(false);
    const [pendingCounts, setPendingCounts] = React.useState<Record<string, number>>({
        orders: 0,
        products: 0
    });

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

    // Tour Logic
    React.useEffect(() => {
        if (!user?.id) return;
        const tourKey = `atlantis-tour-supplier-${user.id}`;
        const hasSeenTour = localStorage.getItem(tourKey);
        if (!hasSeenTour && user?.status === 'ACTIVE') {
            const timer = setTimeout(() => setShowTour(true), 2000);
            return () => clearTimeout(timer);
        }
    }, [user]);

    const tourSteps = [
        {
            targetId: 'tour-inventory',
            title: 'Inventory Control',
            description: 'Manage your product catalog, update prices, and monitor stock levels across all your distribution centers.'
        },
        {
            targetId: 'tour-revenue',
            title: 'Financial Insights',
            description: 'Track your month-to-date revenue and active order volume. All figures are automatically converted to your preferred currency.'
        }
    ];

    // Stats Polling
    React.useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await apiFetch(`/dashboard/supplier`);
                if (res.ok) setStats(await res.json());
            } catch (err) {
                console.error('Failed to fetch header stats:', err);
            }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, []);

    // Counts Polling
    React.useEffect(() => {
        const fetchCounts = async () => {
            try {
                const [ordersRes, prodsRes] = await Promise.all([
                    apiFetch('/supplier-catalog/overview?from=' + new Date(Date.now() - 86400000).toISOString().slice(0, 10)),
                    apiFetch('/supplier-catalog/products?limit=5'),
                ]);

                let oCount = 0;
                let pCount = 0;

                // Orders badge = orders waiting for this supplier to confirm.
                if (ordersRes.ok) {
                    const data = await ordersRes.json();
                    oCount = Number(data?.awaitingConfirmation) || 0;
                }
                // Products badge = listings Atlantis asked to change.
                if (prodsRes.ok) {
                    const data = await prodsRes.json();
                    pCount = Number(data?.summary?.byStatus?.NEEDS_CHANGES) || 0;
                }

                setPendingCounts({ orders: oCount, products: pCount });
            } catch (err) {
                console.error('Failed to fetch sidebar counts:', err);
            }
        };

        fetchCounts();
        const interval = setInterval(fetchCounts, 60000);
        return () => clearInterval(interval);
    }, []);

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
            <aside className={cn(
                "hidden md:flex flex-col h-full bg-[#0F172A] transition-all duration-300 ease-in-out shrink-0 text-start",
                isOpen ? "w-[260px]" : "w-[80px]"
            )}>
                {/* Brand Logo */}
                <div className="h-16 flex items-center px-6 border-b border-white/5">
                    <Link href="/" className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
                            <img src="/brand/atlantis-mark.png" alt="Atlantis" className="w-6 h-6 object-contain" />
                        </div>
                        <AnimatePresence>
                            {isOpen && (
                                <motion.span 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className="font-black text-lg tracking-tighter text-white uppercase"
                                >
                                    Atlan<span className="text-[#0EA5A4]">tis.</span>
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Link>
                </div>

                {/* Sidebar Navigation */}
                <nav aria-label="Supplier navigation" className="flex-1 py-5 px-3 space-y-0.5 overflow-y-auto no-scrollbar">
                    {isOpen && <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Workspace</p>}
                    {SUPPLIER_LINKS.map((link) => {
                        const Icon = link.icon;
                        const isActive = isLinkActive(pathname, link.href);
                        const badgeCount = link.key ? pendingCounts[link.key] : 0;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                aria-current={isActive ? 'page' : undefined}
                                title={isOpen ? undefined : link.label}
                                className={cn(
                                    "relative flex items-center gap-3 h-10 px-3 rounded-lg transition-colors group outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]",
                                    isActive ? "bg-white/[0.08] text-white" : "text-[#A3B1C6] hover:text-white hover:bg-white/[0.04]",
                                )}
                            >
                                {isActive && <span aria-hidden className="absolute start-0 top-2 bottom-2 w-[3px] rounded-full bg-[#2EC4B6]" />}
                                <Icon size={18} strokeWidth={1.9} className={cn("shrink-0", isActive ? "text-[#2EC4B6]" : "text-[#7C8BA1] group-hover:text-white")} />
                                {isOpen && <span className="text-[13.5px] font-medium flex-1 truncate">{link.label}</span>}
                                {badgeCount > 0 && (
                                    <span className={cn("min-w-[20px] h-5 px-1.5 rounded-full bg-[#F59E0B] text-[#111827] text-[11px] font-bold flex items-center justify-center", !isOpen && "absolute top-0.5 end-0.5 min-w-[16px] h-4 text-[10px]")} aria-label={`${badgeCount} need attention`}>
                                        {badgeCount}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Sidebar Footer */}
                <div className="p-3 border-t border-white/5">
                    <button 
                        onClick={() => setIsOpen(!isOpen)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all"
                    >
                        <Menu size={20} />
                        {isOpen && <span className="text-[14px] font-medium">Collapse Menu</span>}
                    </button>
                    <button
                        onClick={async () => { await logout(); window.location.href = '/auth/login'; }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all"
                    >
                        <LogOut size={20} />
                        {isOpen && <span className="text-[14px] font-medium">Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* Main Wrapper */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                {/* Top Header */}
                <header className="h-16 bg-white border-b border-[#E2E8F0] flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 shrink-0 z-30 text-start">
                    <div className="flex items-center gap-4">
                        {/* Mobile Menu Trigger */}
                        <button 
                            className="md:hidden p-2 text-[#64748B] hover:bg-slate-50 rounded-lg"
                            onClick={() => setIsMobileOpen(true)}
                        >
                            <Menu size={24} />
                        </button>
                        <h1 className="text-[17px] sm:text-[20px] font-semibold text-[#0F172A] tracking-tight whitespace-nowrap">Business Hub</h1>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        {/* Status Badge */}
                        {/* Company verification comes from the KYC review, not from having an account. */}
                        <Link href="/dashboard/kyc" className={cn('hidden lg:flex items-center gap-2 px-3 py-1 rounded-full ring-1 ring-inset text-[12px] font-semibold',
                            user?.kycStatus === 'VERIFIED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                : user?.kycStatus === 'PENDING' ? 'bg-amber-50 text-amber-800 ring-amber-200'
                                    : 'bg-slate-100 text-slate-600 ring-slate-200')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', user?.kycStatus === 'VERIFIED' ? 'bg-emerald-500' : user?.kycStatus === 'PENDING' ? 'bg-amber-500' : 'bg-slate-400')} />
                            {user?.kycStatus === 'VERIFIED' ? 'Verified supplier' : user?.kycStatus === 'PENDING' ? 'Verification in review' : user?.kycStatus === 'REJECTED' ? 'Verification declined' : 'Not verified yet'}
                        </Link>

                        {/* Language picker — supplier can switch to their
                            language directly from the dashboard, matches
                            the same dropdown style used in the public
                            Navbar so it feels like one consistent app. */}
                        <div className="hidden sm:block"><SupplierLanguagePicker /></div>

                        {/* Theme Toggle */}
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            aria-label="Toggle dark mode"
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
                                <span className="text-[13px] font-bold text-[#0F172A]">{user?.name || 'Monjez Vendor'}</span>
                                <span className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wider">{user?.role}</span>
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
                    <div className="fixed inset-0 z-[100] md:hidden">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
                            onClick={() => setIsMobileOpen(false)} 
                        />
                        <motion.aside 
                            initial={{ x: -260 }}
                            animate={{ x: 0 }}
                            exit={{ x: -260 }}
                            className="absolute top-0 left-0 h-full w-[260px] bg-[#0F172A] flex flex-col shadow-2xl text-start"
                        >
                            <div className="h-16 flex items-center justify-between px-6 border-b border-white/5">
                                <span className="font-black text-lg text-white uppercase">Atlan<span className="text-[#0EA5A4]">tis.</span></span>
                                <button onClick={() => setIsMobileOpen(false)} className="text-white/60"><X size={20} /></button>
                            </div>
                            <nav className="flex-1 p-4 space-y-1">
                                {SUPPLIER_LINKS.map((link) => {
                                    const active = isLinkActive(pathname, link.href);
                                    return (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            aria-current={active ? 'page' : undefined}
                                            onClick={() => setIsMobileOpen(false)}
                                            className={cn("flex items-center gap-3 h-11 px-3 rounded-lg transition-colors", active ? "bg-white/[0.08] text-white" : "text-[#A3B1C6] hover:text-white")}
                                        >
                                            <link.icon size={18} className={active ? "text-[#2EC4B6]" : undefined} />
                                            <span className="text-[14px] font-medium">{link.label}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </motion.aside>
                    </div>
                )}
            </AnimatePresence>

            {/* Guided Tour Component */}
            {showTour && <GuidedTour 
                steps={tourSteps} 
                onDismiss={() => {
                    if (user?.id) localStorage.setItem(`atlantis-tour-supplier-${user.id}`, 'true');
                    setShowTour(false);
                }}
                onComplete={() => {
                    if (user?.id) localStorage.setItem(`atlantis-tour-supplier-${user.id}`, 'true');
                    setShowTour(false);
                }} 
            />}
        </div>
    );
}


// ─── Supplier-side language picker ─────────────────────────────────────────

function SupplierLanguagePicker() {
    const { locale, setLocale } = useLanguage();
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
                title="Change language"
                className="h-10 px-3 rounded-full hover:bg-slate-50 flex items-center gap-2 text-[#475569] transition-all border border-transparent hover:border-[#E2E8F0]"
            >
                <span className="text-base">{current.flag}</span>
                <span className="text-[12px] font-bold uppercase tracking-wider">{current.code}</span>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="absolute right-0 top-full mt-2 bg-white border border-[#E2E8F0] rounded-xl shadow-2xl p-2 min-w-[200px] z-[110] max-h-[320px] overflow-y-auto"
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
                                <span className="flex items-center gap-2">
                                    <span>{l.flag}</span>
                                    {l.name}
                                </span>
                                {locale === l.code && <span className="w-1.5 h-1.5 rounded-full bg-[#0EA5A4]" />}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
