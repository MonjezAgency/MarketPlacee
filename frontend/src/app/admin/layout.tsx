'use client';

import * as React from 'react';
import Link from 'next/link';
import '../globals.css';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Users,
    Package,
    ShoppingCart,
    Settings,
    Bell,
    LogOut,
    Menu,
    UserPlus,
    LayoutList,
    Tag,
    Shield,
    ShieldCheck,
    Ticket,
    Home,
    ChevronDown,
    FolderTree,
    Megaphone,
    Store,
    Wrench,
    Sun,
    Moon,
    CreditCard,
    Percent,
    DollarSign,
    Truck,
    Warehouse as WarehouseIcon,
    AlertCircle,
    Star,
    Crown,
    KeyRound,
    ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { Locale } from '@/locales';

interface SidebarGroup {
    title: string;
    titleKey: string;
    icon: React.ElementType;
    links: { label: string; translationKey: string; href: string; icon: React.ElementType }[];
}

// Owner-only group — بيظهر بس لـ OWNER
const OWNER_GROUP: SidebarGroup = {
    title: 'Owner Control',
    titleKey: 'groupOwner',
    icon: Crown,
    links: [
        { label: 'Owner Dashboard', translationKey: 'ownerDashboard', href: '/admin/owner', icon: Crown },
        { label: 'Team & Permissions', translationKey: 'teamPermissions', href: '/admin/owner', icon: KeyRound },
    ],
};

const SIDEBAR_GROUPS: SidebarGroup[] = [
    {
        title: 'Dashboard',
        titleKey: 'groupDashboard',
        icon: LayoutDashboard,
        links: [
            { label: 'Overview', translationKey: 'overview', href: '/admin', icon: LayoutDashboard },
            { label: 'Homepage', translationKey: 'homepage', href: '/admin/homepage', icon: Home },
        ]
    },
    {
        title: 'Team & Users',
        titleKey: 'groupUsers',
        icon: Users,
        links: [
            { label: 'User Approvals', translationKey: 'allUsers', href: '/admin/users', icon: Users },
            { label: 'KYC Review', translationKey: 'allUsers', href: '/admin/kyc', icon: ShieldCheck },
            { label: 'Buyers', translationKey: 'buyers', href: '/admin/buyers', icon: Users },
            { label: 'Suppliers', translationKey: 'suppliers', href: '/admin/suppliers', icon: Store },
            { label: 'Team Members', translationKey: 'teamMembers', href: '/admin/team', icon: Users },
            { label: 'Invite Center', translationKey: 'inviteCenter', href: '/admin/invite', icon: UserPlus },
        ]
    },
    {
        title: 'Catalog',
        titleKey: 'groupCatalog',
        icon: Package,
        links: [
            { label: 'All Products', translationKey: 'allProducts', href: '/admin/products', icon: Package },
            { label: 'Add Product', translationKey: 'addProduct', href: '/admin/products/new', icon: Package },
            { label: 'Categories', translationKey: 'categories', href: '/admin/categories', icon: FolderTree },
        ]
    },
    {
        title: 'Promotions',
        titleKey: 'groupPromotions',
        icon: Megaphone,
        links: [
            { label: 'Active Offers', translationKey: 'activeOffers', href: '/admin/offers', icon: Tag },
            { label: 'Create Offer', translationKey: 'createOffer', href: '/admin/offers/new', icon: Tag },
            { label: 'Bulk Discounts', translationKey: 'bulkDiscounts', href: '/admin/discounts', icon: Percent },
            { label: 'Discount Codes', translationKey: 'discountCodes', href: '/admin/coupons', icon: Ticket },
            { label: 'Ad Placements', translationKey: 'adPlacements', href: '/admin/placements', icon: LayoutList },
        ]
    },
    {
        title: 'Finance & Logistics',
        titleKey: 'groupFinance',
        icon: DollarSign,
        links: [
            { label: 'Finance & Compliance', translationKey: 'financeCompliance', href: '/admin/finance', icon: CreditCard },
            { label: 'Warehouses', translationKey: 'warehouses', href: '/admin/finance?tab=warehouses', icon: WarehouseIcon },
            { label: 'Shipments', translationKey: 'shipments', href: '/admin/logistics', icon: Truck },
        ]
    },
    {
        title: 'Support',
        titleKey: 'groupSupport',
        icon: Megaphone,
        links: [
            { label: 'Support Center', translationKey: 'supportCenter', href: '/dashboard/support', icon: Megaphone },
            { label: 'Disputes', translationKey: 'disputes', href: '/admin/disputes', icon: AlertCircle },
            { label: 'Review Moderation', translationKey: 'reviews', href: '/admin/reviews', icon: Star },
        ]
    },
    {
        title: 'System',
        titleKey: 'groupSystem',
        icon: Wrench,
        links: [
            { label: 'Orders', translationKey: 'orders', href: '/admin/orders', icon: ShoppingCart },
            { label: 'Billing', translationKey: 'billing', href: '/admin/billing', icon: CreditCard },
            { label: 'Pricing / Markup', translationKey: 'pricingMarkup', href: '/admin/pricing', icon: Tag },
            { label: 'Security Logs', translationKey: 'securityLogs', href: '/admin/security', icon: Shield },
            { label: 'Settings', translationKey: 'settings', href: '/admin/settings', icon: Settings },
        ]
    },
];

interface NotificationCounts {
    pendingUsers: number;
    pendingProducts: number;
    pendingOrders: number;
    pendingPlacements: number;
}

function SidebarGroupComponent({ group, isOpen, pathname, badgeCounts }: { group: SidebarGroup; isOpen: boolean; pathname: string; badgeCounts: Record<string, number> }) {
    const hasActiveLink = group.links.some(l => l.href === pathname);
    const [expanded, setExpanded] = React.useState(hasActiveLink);
    const GroupIcon = group.icon;
    const { t } = useLanguage();

    // Auto-expand on route change
    React.useEffect(() => {
        if (hasActiveLink) setExpanded(true);
    }, [hasActiveLink]);

    if (!isOpen) {
        // Collapsed: just show icons
        return (
            <div className="space-y-2">
                {group.links.map(link => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            title={t('admin', link.translationKey) || link.label}
                            className={cn(
                                "flex items-center justify-center w-12 h-12 mx-auto rounded-2xl transition-all shadow-lg",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-primary/30"
                                    : "text-white/50 hover:text-white hover:bg-white/10"
                            )}
                        >
                            <Icon size={20} />
                        </Link>
                    );
                })}
            </div>
        );
    }

    // Check if any link in this group has a badge
    const groupBadgeCount = group.links.reduce((acc, link) => acc + (badgeCounts[link.href] || 0), 0);

    return (
        <div className="mb-4">
            <button
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    "flex items-center justify-between w-full px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                    hasActiveLink ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
            >
                <span className="flex items-center gap-3">
                    <GroupIcon size={16} />
                    {t('admin', group.titleKey) || group.title}
                    {groupBadgeCount > 0 && !expanded && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary ms-1" />
                    )}
                </span>
                <ChevronDown size={14} className={cn("transition-transform duration-300", expanded && "rotate-180")} />
            </button>
            {expanded && (
                <div className="mt-2 ms-4 space-y-1 border-s-2 border-white/20 ps-4">
                    {group.links.map(link => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "flex items-center justify-between px-6 py-3 rounded-xl text-xs font-bold transition-all",
                                    isActive
                                        ? "bg-secondary text-secondary-foreground shadow-lg shadow-secondary/20 scale-105"
                                        : "text-white/50 hover:text-white hover:bg-white/10"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon size={16} />
                                    <span>{t('admin', link.translationKey) || link.label}</span>
                                </div>
                                {(badgeCounts[link.href] || 0) > 0 && (
                                    <div className="flex items-center justify-center bg-secondary text-secondary-foreground text-[10px] font-black px-2 py-0.5 min-w-[20px] h-[20px] rounded-full shadow-lg">
                                        {badgeCounts[link.href] > 99 ? '99+' : badgeCounts[link.href]}
                                    </div>
                                )}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}


export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = React.useState(true);
    const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
    const [notifications, setNotifications] = React.useState<NotificationCounts>({
        pendingUsers: 0,
        pendingProducts: 0,
        pendingOrders: 0,
        pendingPlacements: 0
    });
    const [kycBlocked, setKycBlocked] = React.useState(false);
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { resolvedTheme, setTheme } = useTheme();
    const { locale, setLocale, t } = useLanguage();
    const [mounted, setMounted] = React.useState(false);

    const isOwner = user?.role === 'OWNER' || user?.role === 'owner';
    const isTeamMember = ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS']
        .includes((user?.role || '').toUpperCase());

    // ── KYC Gate: block team members who haven't verified ────────────────────
    React.useEffect(() => {
        if (!user) return;
        if (isOwner) { setKycBlocked(false); return; }
        if (!isTeamMember) return;
        const token = localStorage.getItem('bev-token');
        fetch((process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001') + '/kyc/status', {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                // لو الـ endpoint رجع null أو error — مش نحجب المستخدم
                if (!data) return;
                setKycBlocked(data?.kycStatus !== 'VERIFIED');
            })
            .catch(() => {}); // في حالة network error — مش نحجب
    }, [user]);

    React.useEffect(() => {
        setMounted(true);
        const fetchNotifications = async () => {
            if (user?.role !== 'admin' && user?.role !== 'ADMIN' && !isOwner) return;
            try {
                const token = localStorage.getItem('bev-token');
                const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001') + '/dashboard/admin/notifications', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setNotifications(data);
                }
            } catch (err) {
                console.error("Failed to fetch notifications:", err);
            }
        };
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [user]);

    // Map notification counts to sidebar routes
    const badgeCounts: Record<string, number> = {
        '/admin/users': notifications.pendingUsers,
        '/admin/products': notifications.pendingProducts,
        '/admin/orders': notifications.pendingOrders,
        '/admin/placements': notifications.pendingPlacements,
    };

    // Total pending interactions for the bell icon
    const totalPending = Object.values(notifications).reduce((a, b) => a + b, 0);

    // ── KYC Block Screen ──────────────────────────────────────────────────────
    if (kycBlocked) {
        return (
            <div className="flex h-screen items-center justify-center bg-background" dir="rtl">
                <div className="max-w-md w-full mx-4 bg-white dark:bg-white/5 border border-red-200 dark:border-red-700/30 rounded-3xl p-10 text-center shadow-2xl">
                    <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <ShieldAlert size={40} className="text-red-500" />
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-2">التحقق من الهوية مطلوب</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
                        لا يمكنك الوصول للوحة التحكم قبل إكمال التحقق من هويتك (KYC).
                        يرجى رفع وثائقك وانتظار موافقة المالك.
                    </p>
                    <a href="/kyc/upload"
                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-3 rounded-2xl text-sm transition-all">
                        رفع وثائق KYC
                    </a>
                    <button onClick={() => { logout(); window.location.href = '/'; }}
                        className="block w-full mt-3 text-xs text-gray-400 hover:text-red-500 font-bold">
                        تسجيل الخروج
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
            {/* Sidebar - Inspired by Image 1 Density + Image 2 Cleanliness */}
            <aside
                style={{ backgroundColor: '#0A1A2F', color: '#F5F7FA' }}
                className={cn(
                    "transition-all duration-500 flex flex-col z-50 m-4 rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5",
                    isOpen ? "w-72" : "w-24"
                )}>
                {/* Sidebar Header */}
                <div className="h-24 flex items-center justify-between px-8">
                    {isOpen ? (
                        <Link href="/" className="flex items-center gap-3 group">
                            <div className="w-10 h-10 bg-gradient-to-tr from-sidebar to-primary rounded-2xl flex items-center justify-center shadow-lg shadow-sidebar/20 rotate-3 group-hover:rotate-12 transition-transform">
                                <Shield className="text-white" size={20} />
                            </div>
                            <span className="font-heading font-black text-xl tracking-tighter uppercase text-white">
                                Atlan<span className="text-secondary">tis</span><span className="text-secondary">.</span>
                            </span>
                        </Link>
                    ) : (
                        <div className="w-12 h-12 bg-gradient-to-tr from-sidebar to-primary rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-sidebar/20">
                            <Shield className="text-white" size={24} />
                        </div>
                    )}
                </div>

                {/* Sidebar Content */}
                <nav className="flex-1 py-4 px-4 space-y-2 overflow-y-auto no-scrollbar">
                    {/* Owner-only section — يظهر بس للمالك */}
                    {isOwner && (
                        <div className="mb-2">
                            {isOpen && (
                                <div className="px-4 py-2 mb-1">
                                    <div className="flex items-center gap-2 text-yellow-400">
                                        <Crown size={14} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Owner Zone</span>
                                    </div>
                                </div>
                            )}
                            <SidebarGroupComponent group={OWNER_GROUP} isOpen={isOpen} pathname={pathname} badgeCounts={badgeCounts} />
                            <div className="my-2 mx-4 border-t border-white/10" />
                        </div>
                    )}
                    {SIDEBAR_GROUPS.map(group => (
                        <SidebarGroupComponent key={group.title} group={group} isOpen={isOpen} pathname={pathname} badgeCounts={badgeCounts} />
                    ))}
                </nav>

                {/* Sidebar Footer */}
                <div className="p-6">
                    <button
                        onClick={() => {
                            logout();
                            window.location.href = '/';
                        }}
                        className="flex items-center gap-4 px-6 py-4 w-full bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white rounded-[1.5rem] transition-all group font-black uppercase text-xs tracking-widest"
                    >
                        <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                        {isOpen && <span>Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative p-4 gap-4">
                {/* Header Row - Glassy and High Contrast */}
                <header className="h-20 glass rounded-[2rem] flex items-center justify-between px-8 z-40">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => setIsOpen(!isOpen)}
                            className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground hover:scale-110 transition-transform shadow-sm"
                        >
                            <Menu size={20} />
                        </button>
                        <div className="flex flex-col">
                            <h2 className="text-foreground font-black text-xl tracking-tighter uppercase leading-none">
                                {t('admin', 'panelTitle')}
                            </h2>
                            <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mt-1 opacity-80">
                                {t('admin', 'enterpriseAdmin')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Language Switcher */}
                        <select
                            value={locale}
                            onChange={(e) => setLocale(e.target.value as Locale)}
                            className="bg-transparent dark:bg-transparent text-xs font-bold outline-none cursor-pointer text-[#555] dark:text-[#999] hover:text-[#0F1111] dark:hover:text-white border border-[#DDD] dark:border-white/10 rounded-md px-2 py-1.5 transition-all"
                        >
                            <option value="en" className="text-black bg-white">EN</option>
                            <option value="ar" className="text-black bg-white">عربي</option>
                            <option value="fr" className="text-black bg-white">FR</option>
                            <option value="de" className="text-black bg-white">DE</option>
                            <option value="es" className="text-black bg-white">ES</option>
                            <option value="pt" className="text-black bg-white">PT</option>
                            <option value="ro" className="text-black bg-white">RO</option>
                        </select>

                        {/* Theme Toggle */}
                        {mounted && (
                            <button
                                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                                className="p-2 rounded-md hover:bg-[#F3F3F3] dark:hover:bg-white/10 transition-all outline-none text-[#555] dark:text-[#999] hover:text-[#0F1111] dark:hover:text-white"
                                aria-label="Toggle Theme"
                            >
                                {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                            </button>
                        )}

                        {/* Notification Bell */}
                        <div className="relative group">
                            <button
                                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                className="p-2 rounded-md hover:bg-[#F3F3F3] dark:hover:bg-white/10 transition-all outline-none"
                            >
                                <Bell size={18} className="text-[#555] dark:text-[#999] group-hover:text-[#FF9900] transition-all" />
                                {totalPending > 0 && <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-[#C40000] rounded-full animate-pulse" />}
                            </button>

                            {/* Dropdown Notification */}
                            <div className={cn(
                                "absolute top-full end-0 mt-2 w-72 bg-white dark:bg-[#1A1F26] border border-[#DDD] dark:border-white/10 rounded-lg shadow-lg transition-all p-3 z-[100] origin-top-right",
                                isNotificationsOpen ? "scale-100 opacity-100 visible" : "scale-95 opacity-0 invisible"
                            )}>
                                <h4 className="text-xs font-bold text-[#0F1111] dark:text-white uppercase tracking-wider mb-3">{t('admin', 'notifications')}</h4>
                                <div className="space-y-2">
                                    {totalPending > 0 ? (
                                        <div className="space-y-1">
                                            {notifications.pendingUsers > 0 && (
                                                <Link href="/admin/users" onClick={() => setIsNotificationsOpen(false)} className="flex items-center gap-2 p-2 rounded-md hover:bg-[#FEF8E8] dark:hover:bg-[#FF9900]/10 border border-transparent hover:border-[#FF9900]/20 transition-colors">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#FF9900]" />
                                                    <p className="text-xs text-[#0F1111] dark:text-white font-medium">{notifications.pendingUsers} {t('admin', 'userApprovalsCount')}</p>
                                                </Link>
                                            )}
                                            {notifications.pendingProducts > 0 && (
                                                <Link href="/admin/products" onClick={() => setIsNotificationsOpen(false)} className="flex items-center gap-2 p-2 rounded-md hover:bg-[#FEF8E8] dark:hover:bg-[#FF9900]/10 border border-transparent hover:border-[#FF9900]/20 transition-colors">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#FF9900]" />
                                                    <p className="text-xs text-[#0F1111] dark:text-white font-medium">{notifications.pendingProducts} {t('admin', 'pendingProductsCount')}</p>
                                                </Link>
                                            )}
                                            {notifications.pendingOrders > 0 && (
                                                <Link href="/admin/orders" onClick={() => setIsNotificationsOpen(false)} className="flex items-center gap-2 p-2 rounded-md hover:bg-[#FEF8E8] dark:hover:bg-[#FF9900]/10 border border-transparent hover:border-[#FF9900]/20 transition-colors">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#FF9900]" />
                                                    <p className="text-xs text-[#0F1111] dark:text-white font-medium">{notifications.pendingOrders} {t('admin', 'pendingOrdersCount')}</p>
                                                </Link>
                                            )}
                                            {notifications.pendingPlacements > 0 && (
                                                <Link href="/admin/placements" onClick={() => setIsNotificationsOpen(false)} className="flex items-center gap-2 p-2 rounded-md hover:bg-[#FEF8E8] dark:hover:bg-[#FF9900]/10 border border-transparent hover:border-[#FF9900]/20 transition-colors">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#FF9900]" />
                                                    <p className="text-xs text-[#0F1111] dark:text-white font-medium">{notifications.pendingPlacements} {t('admin', 'placementRequestsCount')}</p>
                                                </Link>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-2 text-xs text-[#888] font-medium">{t('admin', 'noPendingActions')}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="h-6 w-[1px] bg-[#DDD] dark:bg-white/10" />

                        <UserMenu role="admin" />
                    </div>
                </header>


                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                    {children}
                </div>
            </main>
        </div>
    );
}
