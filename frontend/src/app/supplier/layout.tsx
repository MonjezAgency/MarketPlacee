'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Box,
    ListPlus,
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
    TrendingUp,
    Settings,
    CreditCard,
    Lock
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { GuidedTour } from '@/components/ui/GuidedTour';
import NotificationBell from '@/components/ui/NotificationBell';

const SUPPLIER_LINKS = [
    { label: 'Business Overview', href: '/supplier', icon: LayoutDashboard },
    { label: 'Inventory Manager', href: '/supplier/products', icon: Box, key: 'products' },
    { label: 'Offers & Ads', href: '/supplier/offers', icon: ListPlus },
    { label: 'My Sales', href: '/supplier/orders', icon: ShoppingCart, key: 'orders' },
    { label: 'Analytics', href: '/supplier/analytics', icon: TrendingUp },
    { label: 'Payment Methods', href: '/supplier/payment-methods', icon: CreditCard, locked: true },
    { label: 'Support', href: '/supplier/support', icon: MessageSquare },
    { label: 'Settings', href: '/supplier/settings', icon: Settings },
];

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
                    apiFetch('/orders'),
                    apiFetch('/products/my-products')
                ]);
                
                let oCount = 0;
                let pCount = 0;

                if (ordersRes.ok) {
                    const data = await ordersRes.json();
                    oCount = data.filter((o: any) => o.status === 'PENDING').length;
                }
                if (prodsRes.ok) {
                    const data = await prodsRes.json();
                    pCount = data.filter((p: any) => p.status === 'PENDING').length;
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
        <div className="flex h-screen bg-[#F8FAFC] font-sans selection:bg-[#0EA5A4]/10">
            {/* Sidebar (Desktop) */}
            <aside className={cn(
                "hidden md:flex flex-col h-full bg-[#0F172A] transition-all duration-300 ease-in-out shrink-0",
                isOpen ? "w-[260px]" : "w-[80px]"
            )}>
                {/* Brand Logo */}
                <div className="h-[72px] flex items-center px-6 border-b border-white/5">
                    <Link href="/" className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
                            <img src="/icon.png" alt="A" className="w-6 h-6 object-contain" />
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
                <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto no-scrollbar">
                    {SUPPLIER_LINKS.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;
                        const badgeCount = link.key ? pendingCounts[link.key] : 0;

                        return (
                            <Link
                                key={link.href}
                                href={link.locked ? '#' : link.href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
                                    isActive 
                                        ? "bg-[#1E293B] text-white" 
                                        : "text-[#94A3B8] hover:text-white hover:bg-[#1E293B]/50",
                                    link.locked && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Icon size={20} className={cn(isActive ? "text-[#0EA5A4]" : "text-[#94A3B8] group-hover:text-white")} />
                                {isOpen && <span className="text-[14px] font-medium flex-1 truncate">{link.label}</span>}
                                {isOpen && badgeCount > 0 && (
                                    <span className="bg-[#EF4444] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                        {badgeCount}
                                    </span>
                                )}
                                {link.locked && isOpen && <Lock size={14} className="text-[#94A3B8]/50" />}
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
                <header className="h-[72px] bg-white border-b border-[#E2E8F0] flex items-center justify-between px-8 shrink-0 z-30">
                    <div className="flex items-center gap-4">
                        {/* Mobile Menu Trigger */}
                        <button 
                            className="md:hidden p-2 text-[#64748B] hover:bg-slate-50 rounded-lg"
                            onClick={() => setIsMobileOpen(true)}
                        >
                            <Menu size={24} />
                        </button>
                        <h1 className="text-[20px] font-semibold text-[#0F172A] tracking-tight">Business Hub</h1>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Status Badge */}
                        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-[#F1F5F9] border border-[#E2E8F0] rounded-full">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                            <span className="text-[12px] font-semibold text-[#64748B]">Verified Supplier</span>
                        </div>

                        {/* Theme Toggle */}
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="w-10 h-10 rounded-full hover:bg-slate-50 flex items-center justify-center text-[#64748B] transition-all"
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>

                        {/* Notifications */}
                        <NotificationBell isLight={theme !== 'dark'} />

                        <div className="h-8 w-[1px] bg-[#E2E8F0]" />

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
                <main className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
                    <div className="max-w-[1440px] mx-auto w-full py-8 px-8 md:px-10">
                        {children}
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
                            className="absolute top-0 left-0 h-full w-[260px] bg-[#0F172A] flex flex-col shadow-2xl"
                        >
                            <div className="h-[72px] flex items-center justify-between px-6 border-b border-white/5">
                                <span className="font-black text-lg text-white uppercase">Atlan<span className="text-[#0EA5A4]">tis.</span></span>
                                <button onClick={() => setIsMobileOpen(false)} className="text-white/60"><X size={20} /></button>
                            </div>
                            <nav className="flex-1 p-4 space-y-1">
                                {SUPPLIER_LINKS.map((link) => (
                                    <Link
                                        key={link.href}
                                        href={link.locked ? '#' : link.href}
                                        onClick={() => !link.locked && setIsMobileOpen(false)}
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#94A3B8] hover:text-white transition-colors"
                                    >
                                        <link.icon size={20} />
                                        <span className="text-[14px] font-medium">{link.label}</span>
                                    </Link>
                                ))}
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
