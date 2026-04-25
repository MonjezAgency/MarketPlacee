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

const SUPPLIER_LINKS = [
    { label: 'Business Overview', href: '/supplier', icon: LayoutDashboard },
    { label: 'Inventory Manager', href: '/supplier/products', icon: Box, key: 'products' },
    { label: 'Placements', href: '/supplier/placements', icon: Star },
    { label: 'Offers & Ads', href: '/supplier/offers', icon: ListPlus },
    { label: 'My Sales', href: '/supplier/orders', icon: ShoppingCart, key: 'orders' },
    { label: 'Analytics', href: '/supplier/analytics', icon: TrendingUp },
    { label: 'Payment Methods', href: '/supplier/payment-methods', icon: CreditCard, locked: true },
    { label: 'Support', href: '/supplier/support', icon: MessageSquare },
    { label: 'Settings', href: '/supplier/settings', icon: Settings },
];


export default function SupplierLayout({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = React.useState(true);
    const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
    const pathname = usePathname();
    const { user, logout, isAuthReady } = useAuth();
    const { theme, setTheme } = useTheme();
    const router = useRouter();
    const [stats, setStats] = React.useState<any>(null);
    const [showTour, setShowTour] = React.useState(false);

    // Role Guard: Only Suppliers allowed in /supplier
    React.useEffect(() => {
        if (isAuthReady) {
            if (!user) {
                router.replace('/auth/login');
            } else if (user.role?.toUpperCase() !== 'SUPPLIER') {
                // Redirect non-suppliers to their appropriate home
                if (user.role?.toUpperCase() === 'ADMIN' || user.role?.toUpperCase() === 'OWNER') {
                    router.replace('/admin');
                } else {
                    router.replace('/dashboard/customer');
                }
            }
        }
    }, [isAuthReady, user, router]);


    React.useEffect(() => {
        const hasSeenTour = localStorage.getItem('atlantis-tour-supplier');
        if (!hasSeenTour && user?.status === 'ACTIVE') {
            const timer = setTimeout(() => setShowTour(true), 2000);
            return () => clearTimeout(timer);
        }
    }, [user]);

    const tourSteps = [
        {
            targetId: 'tour-business-hub',
            title: 'Your Command Center',
            description: 'This is where you monitor your entire wholesale operation at a glance. Real-time data, injected directly from the platform core.'
        },
        {
            targetId: 'tour-inventory',
            title: 'Inventory Control',
            description: 'Manage your product catalog, update prices, and monitor stock levels across all your distribution centers.'
        },
        {
            targetId: 'tour-revenue',
            title: 'Financial Insights',
            description: 'Track your month-to-date revenue and active order volume. All figures are automatically converted to your preferred currency.'
        },
        {
            targetId: 'tour-notifications',
            title: 'Priority Alerts',
            description: 'Never miss a wholesale lead or urgent order. Stay updated with real-time notifications from buyers.'
        }
    ];

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
    }, []);
    const [pendingCounts, setPendingCounts] = React.useState<Record<string, number>>({
        orders: 0,
        products: 0
    });

    React.useEffect(() => {
        const fetchCounts = async () => {
            try {
                // Fetch orders and products to count pending status
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
        const interval = setInterval(fetchCounts, 60000); // 1 min poll
        return () => clearInterval(interval);
    }, []);

    // Show nothing while checking auth to prevent layout flash
    // This MUST be after all hooks to avoid "Rendered more hooks" error
    if (!isAuthReady || (user && user.role?.toUpperCase() !== 'SUPPLIER')) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background overflow-hidden transition-colors duration-500">
            {/* Sidebar */}
            <aside className={cn(
                "bg-card border-e border-border/50 transition-all duration-300 flex flex-col z-50",
                isOpen ? "w-64" : "w-20"
            )}>
                {/* Sidebar Header */}
                <div className="h-20 flex items-center justify-between px-6 border-b border-border/50">
                    {isOpen ? (
                        <Link href="/" className="flex items-center gap-3 group">
                            <div className="w-10 h-10 bg-white border-2 border-primary/20 rounded-xl overflow-hidden flex items-center justify-center transition-transform group-hover:scale-110 shadow-lg shadow-primary/5">
                                <img src="/icon.png" alt="Atlantis" className="w-full h-full object-cover" />
                            </div>
                            <span className="font-heading font-black text-xl tracking-tighter text-foreground uppercase flex items-center">
                                Atlan<span className="text-primary">tis.</span>
                            </span>
                        </Link>
                    ) : (
                        <div className="w-10 h-10 bg-white border-2 border-primary/20 rounded-xl overflow-hidden flex items-center justify-center">
                            <img src="/icon.png" alt="A" className="w-full h-full object-cover" />
                        </div>
                    )}
                    <button onClick={() => setIsOpen(!isOpen)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {isOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>

                {/* Nav Links */}
                <nav className="flex-1 py-8 px-4 space-y-2 overflow-y-auto no-scrollbar">
                    {SUPPLIER_LINKS.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;

                        if (link.locked) {
                            return (
                                <div
                                    key={link.href}
                                    className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all relative overflow-hidden cursor-not-allowed opacity-70"
                                    title="Temporarily unavailable"
                                >
                                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-10" />
                                    <Icon size={20} className="relative z-0 text-muted-foreground" />
                                    {isOpen && <span className="text-sm flex-1 relative z-0 text-muted-foreground font-medium strike-through">{link.label}</span>}
                                    {isOpen && <Lock size={16} className="absolute right-4 z-20 text-foreground/50" />}
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                id={link.key === 'products' ? 'tour-inventory' : undefined}
                                className={cn(
                                    "flex items-center gap-4 px-4 py-3 rounded-xl transition-all group",
                                    isActive
                                        ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                <Icon size={20} className={cn("transition-transform group-hover:scale-110", isActive ? "stroke-[2.5]" : "")} />
                                {isOpen && <span className="text-sm flex-1">{link.label}</span>}
                                {isOpen && (link as any).key && pendingCounts[(link as any).key] > 0 && (
                                    <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-[10px] font-black text-white px-1">
                                        {pendingCounts[(link as any).key]}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-border/50">
                    <button
                        onClick={async () => {
                            await logout();
                            window.location.href = '/auth/login';
                        }}
                        className="flex items-center gap-4 px-4 py-3 w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all group"
                    >
                        <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
                        {isOpen && <span className="text-sm font-bold">Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* Header Row */}
                <header className="h-20 bg-background/80 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-8 z-40">
                    <div className="flex items-center gap-8">
                        <div id="tour-business-hub" className="flex flex-col">
                            <h2 className="text-foreground font-black tracking-tight text-xl">Business Hub</h2>
                            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em] leading-none mt-1">Direct Sales Access</p>
                        </div>

                        {/* Quick KPIs in Header */}
                        <div id="tour-revenue" className="hidden lg:flex items-center gap-8 border-s border-border/50 ps-8">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Revenue (MTD)</span>
                                <span className="text-sm font-black text-foreground">{stats ? formatPrice(stats.totalRevenue) : '—'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Active Orders</span>
                                <span className="text-sm font-black text-emerald-500">{stats?.totalOrders || '0'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>

                        <div className="relative group">
                            <button
                                id="tour-notifications"
                                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                className="p-2 rounded-xl hover:bg-muted transition-all outline-none"
                            >
                                <Bell size={20} className="text-muted-foreground group-hover:text-emerald-500 transition-colors" />
                                <span className="absolute top-2 end-2 w-2 h-2 bg-emerald-500 rounded-full border-2 border-background" />
                            </button>

                            {/* Dropdown Notification Preview */}
                            <div className={cn(
                                "absolute top-full end-0 mt-4 w-80 bg-card border border-border/50 rounded-2xl shadow-2xl transition-all p-4 z-[100] origin-top-right",
                                isNotificationsOpen ? "scale-100 opacity-100 visible" : "scale-95 opacity-0 invisible"
                            )}>
                                <h4 className="text-xs font-black text-foreground uppercase tracking-widest mb-4">Urgent Actions</h4>
                                <div className="space-y-3">
                                    <Link href="/supplier/orders" onClick={() => setIsNotificationsOpen(false)} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 border border-border/50 hover:border-emerald-500/50 transition-colors">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <p className="text-[10px] text-foreground/80 font-medium group-hover:text-emerald-500">New wholesale order received</p>
                                    </Link>
                                    <Link href="/supplier/messages" onClick={() => setIsNotificationsOpen(false)} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 border border-border/50 hover:border-emerald-500/50 transition-colors">
                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        <p className="text-[10px] text-foreground/80 font-medium group-hover:text-emerald-500">New message from buyer</p>
                                    </Link>
                                </div>
                            </div>
                        </div>

                        <div className="h-8 w-[1px] bg-border/50 mx-2" />

                        <UserMenu role="supplier" />
                    </div>
                </header>


                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-8 no-scrollbar relative">
                    <AnimatePresence>
                        {user?.status === 'PENDING_APPROVAL' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0 z-50 bg-background/60 backdrop-blur-md flex items-center justify-center p-8"
                            >
                                <motion.div
                                    initial={{ scale: 0.9, y: 20 }}
                                    animate={{ scale: 1, y: 0 }}
                                    className="max-w-md w-full bg-card border border-border/50 rounded-[40px] p-10 text-center shadow-2xl relative overflow-hidden"
                                >
                                    <div className="absolute top-0 start-0 w-full h-1 bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0" />

                                    <div className="w-20 h-20 bg-amber-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 border border-amber-500/20">
                                        <Clock className="text-amber-500 animate-pulse" size={40} />
                                    </div>

                                    <h3 className="text-2xl font-black text-foreground mb-4 tracking-tight">Registration Pending</h3>
                                    <p className="text-muted-foreground text-sm font-medium leading-relaxed mb-10">
                                        Your supplier application is currently under review by our administration team.
                                        You'll get full access to the vendor hub as soon as your account is verified.
                                    </p>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-2xl border border-border/50 text-start">
                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Current Status</p>
                                                <p className="text-xs font-bold text-foreground">Manual Verification in Progress</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={async () => { await logout(); window.location.href = '/auth/login'; }}
                                            className="w-full py-4 text-[11px] font-black text-muted-foreground hover:text-foreground uppercase tracking-[0.2em] transition-colors"
                                        >
                                            Sign Out
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {children}
                </div>
            </main>

            <GuidedTour 
                show={showTour}
                steps={tourSteps}
                onComplete={() => {
                    localStorage.setItem('atlantis-tour-supplier', 'true');
                    setShowTour(false);
                }}
                onDismiss={() => {
                    localStorage.setItem('atlantis-tour-supplier', 'true');
                    setShowTour(false);
                }}
            />
        </div>
    );
}
