'use client';
import { apiFetch } from '@/lib/api';
import NotificationBell from '@/components/ui/NotificationBell';


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
    Code2,
    ExternalLink,
    Bot,
    Lock,
    LifeBuoy,
    MessageCircle,
    Activity,
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
    links: { label: string; translationKey: string; href: string; icon: React.ElementType; locked?: boolean }[];
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
        title: 'Control Panel',
        titleKey: 'groupControlPanel',
        icon: LayoutDashboard,
        links: [
            { label: 'Dashboard', translationKey: 'overview', href: '/admin', icon: Home },
            { label: 'Products', translationKey: 'allProducts', href: '/admin/products', icon: Package },
            { label: 'Orders', translationKey: 'orders', href: '/admin/orders', icon: ShoppingCart },
            { label: 'Sellers', translationKey: 'suppliers', href: '/admin/suppliers', icon: Store },
            { label: 'Customers', translationKey: 'buyers', href: '/admin/buyers', icon: Users },
            { label: 'Finance & Logistics', translationKey: 'groupFinance', href: '/admin/finance', icon: DollarSign },
        ]
    },
    {
        title: 'SUPPORT',
        titleKey: 'groupSupport',
        icon: LifeBuoy,
        links: [
            { label: 'Overview', translationKey: 'overview', href: '/admin/support', icon: LayoutDashboard },
            { label: 'Disputes', translationKey: 'disputes', href: '/admin/disputes', icon: AlertCircle },
            { label: 'Live Chat', translationKey: 'liveChat', href: '/admin/support?tab=chat', icon: MessageCircle },
            { label: 'KYC Queue', translationKey: 'kycQueue', href: '/admin/kyc', icon: ShieldCheck },
        ]
    },
    {
        title: 'REPORTS & SYSTEM',
        titleKey: 'groupSystem',
        icon: Wrench,
        links: [
            { label: 'Reports', translationKey: 'reports', href: '/admin/security', icon: Activity },
            { label: 'Settings', translationKey: 'settings', href: '/admin/settings', icon: Settings },
            { label: 'AI Agent', translationKey: 'aiAgent', href: '/admin/ai-agent', icon: Bot },
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
    const { t } = useLanguage();

    // Auto-expand on route change
    React.useEffect(() => {
        if (hasActiveLink) setExpanded(true);
    }, [hasActiveLink, pathname]);

    if (!isOpen) {
        return (
            <div className="space-y-4 py-4 flex flex-col items-center">
                {group.links.map(link => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            title={t('admin', link.translationKey) || link.label}
                            className={cn(
                                "flex items-center justify-center w-11 h-11 rounded-xl transition-all relative group",
                                isActive
                                    ? "bg-teal-500/10 text-teal-500"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                            )}
                        >
                            <Icon size={20} />
                            {(badgeCounts[link.href] || 0) > 0 && (
                                <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0F172A]" />
                            )}
                        </Link>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="mb-6">
            <div 
                className="px-6 py-2 mb-2 flex items-center justify-between group/header cursor-pointer" 
                onClick={() => setExpanded(!expanded)}
            >
                <span className={cn(
                    "text-[11px] font-semibold uppercase tracking-widest transition-all",
                    hasActiveLink ? "text-teal-500" : "text-slate-500 group-hover/header:text-slate-400"
                )}>
                    {t('admin', group.titleKey) || group.title}
                </span>
                <ChevronDown size={14} className={cn("text-slate-600 transition-transform duration-300", expanded && "rotate-180")} />
            </div>
            
            {expanded && (
                <div className="space-y-1.5 px-3">
                    {group.links.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;
                        
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "flex items-center justify-between px-4 h-[44px] text-[14px] font-medium transition-all rounded-xl",
                                    isActive
                                        ? "bg-teal-500/10 text-teal-500"
                                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon size={18} />
                                    <span>{t('admin', link.translationKey) || link.label}</span>
                                </div>
                                {(badgeCounts[link.href] || 0) > 0 && (
                                    <div className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                        {badgeCounts[link.href]}
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
    const [isOpen, setIsOpen] = React.useState(true); // Open by default
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

    // ... (keep role logic)
    const isOwner = user?.role === 'OWNER' || user?.role === 'owner';
    const isDeveloper = (user?.role || '').toUpperCase() === 'DEVELOPER';
    const isTeamMember = ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS']
        .includes((user?.role || '').toUpperCase());

    const getFilteredSidebarGroups = () => {
        if (isDeveloper) {
            return SIDEBAR_GROUPS.filter(g => ['Dashboard', 'Support', 'System'].includes(g.title));
        }
        return SIDEBAR_GROUPS;
    };
    const filteredSidebarGroups = getFilteredSidebarGroups();

    // ... (keep KYC logic)
    React.useEffect(() => {
        if (!user) return;
        if (isOwner) { setKycBlocked(false); return; }
        if (!isTeamMember) return;
        
        apiFetch('/kyc/status', {
            headers: {  },
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                setKycBlocked(data?.kycStatus !== 'VERIFIED');
            })
            .catch(() => {});
    }, [user]);

    const badgeCounts: Record<string, number> = {
        '/admin/users': notifications.pendingUsers,
        '/admin/products': notifications.pendingProducts,
        '/admin/orders': notifications.pendingOrders,
        '/admin/placements': notifications.pendingPlacements,
    };

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
                    <a href="/dashboard/kyc"
                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-3 rounded-2xl text-sm transition-all">
                        رفع وثائق KYC
                    </a>
                    <button onClick={async () => { await logout(); window.location.href = '/auth/login'; }}
                        className="block w-full mt-3 text-xs text-gray-400 hover:text-red-500 font-bold">
                        تسجيل الخروج
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#F8FAFC] text-foreground overflow-hidden font-sans">
            <aside
                style={{ backgroundColor: '#0F172A' }}
                className={cn(
                    "transition-all duration-500 flex flex-col z-[60] shrink-0",
                    "fixed h-screen lg:h-auto lg:relative overflow-hidden shadow-2xl border-e border-white/5",
                    isOpen ? "translate-x-0 w-[260px]" : "-translate-x-[120%] lg:translate-x-0 w-0 lg:w-[72px]"
                )}>
                {/* Sidebar Header */}
                <div className="h-28 flex items-center px-8 border-b border-white/5">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="w-10 h-10 border-2 border-[#14B8A6]/30 rounded-xl overflow-hidden flex items-center justify-center transition-transform group-hover:scale-110 shadow-[0_0_20px_rgba(20,184,166,0.1)]">
                            <img src="/icon.png" alt="Atlantis" className="w-full h-full object-cover" />
                        </div>
                        <span className="font-heading font-black text-2xl tracking-tighter uppercase text-white flex items-center">
                            Atlan<span className="text-[#14B8A6]">tis.</span>
                        </span>
                    </Link>
                </div>

                {/* Sidebar Content */}
                <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto no-scrollbar">
                    {isOwner && (
                        <div className="mb-10">
                            {isOpen && (
                                <div className="px-8 py-2 mb-2">
                                    <div className="flex items-center gap-3 text-[#14B8A6]">
                                        <Crown size={16} />
                                        <span className="text-[11px] font-black uppercase tracking-[0.3em]">Owner Access</span>
                                    </div>
                                </div>
                            )}
                            <SidebarGroupComponent group={OWNER_GROUP} isOpen={isOpen} pathname={pathname} badgeCounts={badgeCounts} />
                            <div className="my-8 mx-8 border-t border-white/5" />
                        </div>
                    )}
                    {filteredSidebarGroups.map(group => (
                        <SidebarGroupComponent key={group.title} group={group} isOpen={isOpen} pathname={pathname} badgeCounts={badgeCounts} />
                    ))}
                </nav>

                {/* Sidebar Footer */}
                <div className="p-4 mt-auto border-t border-white/5">
                    {isOpen && (
                        <div className="bg-white/[0.03] border border-white/5 rounded-[15px] p-5 mb-4">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-11 h-11 rounded-full ring-2 ring-[#14B8A6]/30 p-0.5 overflow-hidden">
                                        {user?.avatar ? (
                                            <img src={user.avatar} alt={user.name || 'User'} className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-[#14B8A6] font-black text-xs">
                                                {user?.name?.[0] || 'A'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[13px] font-black text-white truncate max-w-[130px]">{user?.name || 'Admin User'}</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{user?.role || 'Super Admin'}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={async () => {
                                    await logout();
                                    window.location.href = '/auth/login';
                                }}
                                className="flex items-center justify-center gap-3 h-11 w-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-[12px] transition-all font-black uppercase text-[10px] tracking-widest border border-red-500/20"
                            >
                                <LogOut size={16} />
                                Terminate Session
                            </button>
                        </div>
                    )}
                    
                    {!isOpen && (
                        <button
                            onClick={async () => {
                                await logout();
                                window.location.href = '/auth/login';
                            }}
                            className="w-12 h-12 mx-auto flex items-center justify-center bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        >
                            <LogOut size={20} />
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* Header Row - Perfect Balanced Proportions */}
                <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 z-40 shrink-0">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => setIsOpen(!isOpen)}
                            className="w-11 h-11 bg-[#14B8A6] text-white rounded-[12px] flex items-center justify-center shadow-lg shadow-[#14B8A6]/20 hover:scale-105 transition-all"
                        >
                            <Menu size={20} />
                        </button>

                        {/* Mobile Overlay / Backdrop */}
                        {isOpen && (
                            <div 
                                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
                                onClick={() => setIsOpen(false)}
                            />
                        )}

                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                            title="Back to Home"
                        >
                            <Home size={18} />
                        </Link>
                        {pathname !== '/admin' && (
                            <Link
                                href="/admin"
                                className="w-10 h-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                                title="Back to Dashboard"
                            >
                                <LayoutDashboard size={18} />
                            </Link>
                        )}
                        <div className="flex flex-col">
                            <h1 className="text-[#0F172A] font-semibold text-2xl tracking-tight uppercase leading-none">
                                {isDeveloper ? 'Support HQ' : t('admin', 'panelTitle')}
                            </h1>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-1 opacity-80">
                                {isDeveloper ? 'Commerce Resolution & Entity Verification' : t('admin', 'enterpriseAdmin')}
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

                        {/* Unified Notification Bell */}
                        <div className="flex items-center">
                            <NotificationBell isLight={resolvedTheme !== 'dark'} />
                        </div>

                        <div className="h-6 w-[1px] bg-[#DDD] dark:bg-white/10" />

                        <UserMenu role={user?.role || 'admin'} />
                    </div>
                </header>


                {/* Scrollable Content with Perfect Spacing */}
                <div className="flex-1 overflow-y-auto no-scrollbar bg-[#F8FAFC]">
                    <div className="max-w-[1440px] mx-auto px-6 py-8 lg:py-10 min-h-full">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}
