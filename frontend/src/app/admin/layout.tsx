'use client';
import { apiFetch } from '@/lib/api';
import NotificationBell from '@/components/ui/NotificationBell';


import * as React from 'react';
import Link from 'next/link';
import '../globals.css';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
    Lock,
    LifeBuoy,
    MessageCircle,
    Activity,
    CheckCircle2,
    Image as ImageIcon,
    Target,
    Globe2,
    MailCheck
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import AdminAccountMenu from '@/components/admin/AdminAccountMenu';
import { canAccessAdminPath, defaultAdminPath } from '@/lib/admin-access';
import { useLanguage } from '@/contexts/LanguageContext';

interface SidebarGroup {
    title: string;
    titleKey: string;
    icon: React.ElementType;
    links: SidebarLink[];
    /** A single direct item: no heading, no collapse. */
    bare?: boolean;
}
/** `section`: dictionary section of translationKey when it isn't `admin`. `children`: a parent that expands (no page of its own). */
interface SidebarLink { label: string; translationKey: string; href: string; icon: React.ElementType; locked?: boolean; soon?: boolean; section?: 'promotions' | 'adminProducts' | 'adminUsers' | 'adminNav' | 'adminOffers'; children?: SidebarLink[] }

// Owner-only group — بيظهر بس لـ OWNER
const OWNER_GROUP: SidebarGroup = {
    title: 'Owner Control',
    titleKey: 'groupOwner',
    icon: Crown,
    links: [
        { label: 'Owner Dashboard', translationKey: 'ownerDashboard', href: '/admin/owner', icon: Crown },
    ],
};

const SIDEBAR_GROUPS: SidebarGroup[] = [
    {
        title: 'Control Panel',
        titleKey: 'groupControlPanel',
        icon: LayoutDashboard,
        links: [
            { label: 'Dashboard', translationKey: 'overview', href: '/admin', icon: Home },
            {
                label: 'Products', translationKey: 'allProducts', href: '/admin/products', icon: Package,
                children: [
                    { label: 'Ali FMCG Catalog', translationKey: 'tabCatalog', section: 'adminProducts', href: '/admin/products/catalog', icon: Store },
                    { label: 'Supplier Submissions', translationKey: 'tabSubmissions', section: 'adminProducts', href: '/admin/products/submissions', icon: Package },
                ],
            },
            { label: 'Orders', translationKey: 'orders', section: 'adminNav', href: '/admin/orders', icon: ShoppingCart },
            // One Offers entry: supplier offers to review and Ali FMCG special offers, as two tabs (/admin/wholesale-offers and /admin/promotions redirect).
            {
                label: 'Offers', translationKey: 'offers', section: 'adminNav', href: '/admin/offers', icon: Tag,
                children: [
                    { label: 'Supplier offers', translationKey: 'tabSupplier', section: 'adminOffers', href: '/admin/offers/supplier', icon: Tag },
                    { label: 'Special offers', translationKey: 'tabSpecial', section: 'adminOffers', href: '/admin/offers/special', icon: Tag },
                ],
            },
            { label: 'Target Prices', translationKey: 'targetPriceRequests', href: '/admin/target-prices', icon: Target },
            // Delivery countries, hubs and freight rates now live in Settings (/admin/delivery and /admin/fulfillment redirect there).
            // One Users entry replaces Suppliers, Buyers and User Directory; /admin/suppliers and /admin/buyers redirect there.
            { label: 'Users', translationKey: 'nav', section: 'adminUsers', href: '/admin/users', icon: Users },
            { label: 'Finance & Logistics', translationKey: 'groupFinance', href: '/admin/finance', icon: DollarSign },
        ]
    },
    {
        title: 'GROWTH & CAMPAIGNS',
        titleKey: 'groupGrowth',
        icon: Megaphone,
        links: [
            { label: 'Newsletter Hub', translationKey: 'newsletter', href: '/admin/newsletter', icon: MessageCircle },
            { label: 'Email Analytics', translationKey: 'emailAnalytics', href: '/admin/email-analytics', icon: Activity },
            { label: 'Email Setup & Preview', translationKey: 'emailSetup', href: '/admin/email-setup', icon: MailCheck },
            { label: 'Coupons & Codes', translationKey: 'coupons', href: '/admin/coupons', icon: Ticket },
            // Homepage banners left the sidebar; the page (/admin/banners) still manages the live banners and is linked from Settings.
            // Ads & Placements is paused — full self-service ads flow will
            // return after the bidding engine is in place. Renders as a
            // disabled "SOON" pill so the operator can still see it on
            // the roadmap but can't click into a half-built page.
            { label: 'Ads & Placements', translationKey: 'ads', href: '/admin/placements', icon: Star, soon: true },
        ]
    },
    {
        title: 'SUPPORT & KYC',
        titleKey: 'groupSupport',
        bare: true,
        icon: LifeBuoy,
        links: [
            // Disputes and KYC review live inside Support HQ; /admin/disputes and /admin/kyc redirect there.
            { label: 'Support HQ', translationKey: 'supportHq', section: 'adminNav', href: '/admin/support', icon: LifeBuoy },
        ]
    },
    {
        title: 'ADMINISTRATION',
        titleKey: 'groupUsers',
        bare: true,
        icon: Shield,
        links: [
            // Invitations are managed inside Team Members; /admin/invite redirects there.
            { label: 'Team Members', translationKey: 'teamMembers', href: '/admin/team', icon: KeyRound },
        ]
    },
];
/** Settings is a direct destination, not a group with one child. */
const SETTINGS_LINK: SidebarLink = { label: 'Settings', translationKey: 'settings', section: 'adminNav', href: '/admin/settings', icon: Settings };

interface NotificationCounts {
    pendingUsers: number;
    pendingProducts: number;
    pendingOrders: number;
    pendingPlacements: number;
}

/** A link is active on its own path and on its sub-pages (e.g. /admin/products/catalog/import, a product under review). */
function linkActive(href: string, pathname: string) {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(href + '/');
}
/** Products under review (/admin/products/<id>) belong to Supplier Submissions unless they are under Catalog routes. */
function childActive(child: SidebarLink, pathname: string) {
    if (linkActive(child.href, pathname)) return true;
    return child.href === '/admin/products/submissions' && /^\/admin\/products\/(?!catalog|submissions|new)[^/]+/.test(pathname);
}
const EXPANDED_KEY = 'atl-admin-nav-expanded';

function SidebarGroupComponent({ group, isOpen, pathname, badgeCounts, bare }: { group: SidebarGroup; isOpen: boolean; pathname: string; badgeCounts: Record<string, number>; bare?: boolean }) {
    const { t } = useLanguage();
    const label = (l: SidebarLink) => t(l.section ?? 'admin', l.translationKey) || l.label;
    const isLinkActive = (l: SidebarLink) => (l.children ? l.children.some((c) => childActive(c, pathname)) : linkActive(l.href, pathname));
    const hasActiveLink = group.links.some(isLinkActive);
    const [expanded, setExpanded] = React.useState(true);
    // Parents (Products) remember whether they are open; they always open when one of their pages is active.
    const [openParents, setOpenParents] = React.useState<Record<string, boolean>>({});
    React.useEffect(() => {
        let saved: Record<string, boolean> = {};
        try { saved = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '{}'); } catch { /* storage blocked */ }
        const next = { ...saved };
        for (const l of group.links) if (l.children && isLinkActive(l)) next[l.href] = true;
        setOpenParents(next);
    }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { if (hasActiveLink) setExpanded(true); }, [hasActiveLink, pathname]);
    const toggleParent = (href: string) => setOpenParents((o) => {
        const next = { ...o, [href]: !o[href] };
        try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
        return next;
    });

    const rowCls = (active: boolean) => cn(
        'flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
        active ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]',
    );
    const badge = (n: number) => n > 0 ? <span className="ms-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10.5px] font-semibold flex items-center justify-center tabular-nums">{n > 99 ? '99+' : n}</span> : null;

    if (!isOpen) {
        return (
            <div className="py-2 flex flex-col items-center gap-1 border-b border-white/5 last:border-0">
                {group.links.map((link) => {
                    const Icon = link.icon;
                    const target = link.children ? link.children[0].href : link.href;
                    const n = link.children ? link.children.reduce((s, c) => s + (badgeCounts[c.href] || 0), badgeCounts[link.href] || 0) : badgeCounts[link.href] || 0;
                    return (
                        <Link key={link.href} href={link.soon ? '#' : target} title={label(link)} aria-label={label(link)} aria-current={isLinkActive(link) ? 'page' : undefined}
                            className={cn('relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors', isLinkActive(link) ? 'bg-white/[0.08] text-[#2EC4B6]' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]')}>
                            <Icon size={18} />
                            {n > 0 && <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-red-500 rounded-full" />}
                        </Link>
                    );
                })}
            </div>
        );
    }

    return (
        <div className={bare ? 'mb-0.5' : 'mb-3'}>
            {!bare && <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
                className="w-full px-2.5 h-7 flex items-center justify-between text-start rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                <span className={cn('text-[11px] font-semibold uppercase tracking-[0.08em]', hasActiveLink ? 'text-[#2EC4B6]' : 'text-slate-500')}>{t('admin', group.titleKey) || group.title}</span>
                <ChevronDown size={13} className={cn('text-slate-600 transition-transform', expanded && 'rotate-180')} />
            </button>}
            {expanded && (
                <ul className="mt-0.5 space-y-0.5">
                    {group.links.map((link) => {
                        const Icon = link.icon;
                        if (link.soon) {
                            return (
                                <li key={link.href}>
                                    <div aria-disabled="true" className="flex items-center gap-2.5 h-9 px-2.5 text-[13.5px] font-medium rounded-lg text-slate-500 opacity-70 cursor-not-allowed select-none">
                                        <Icon size={16} /><span className="truncate">{label(link)}</span>
                                        <span className="ms-auto text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">{t('adminNav', 'soonBadge')}</span>
                                    </div>
                                </li>
                            );
                        }
                        if (link.children) {
                            const open = !!openParents[link.href];
                            const active = isLinkActive(link);
                            const id = `nav-${link.href.replace(/\W+/g, '-')}`;
                            return (
                                <li key={link.href}>
                                    <button type="button" onClick={() => toggleParent(link.href)} aria-expanded={open} aria-controls={id} className={cn(rowCls(false), 'w-full text-start', active && 'text-white')}>
                                        <Icon size={16} className={cn(active && 'text-[#2EC4B6]')} /><span className="truncate">{label(link)}</span>
                                        {!open && badge(link.children.reduce((s, c) => s + (badgeCounts[c.href] || 0), 0))}
                                        <ChevronDown size={14} className={cn('text-slate-500 transition-transform', open ? 'rotate-180' : '', !open && link.children.some((c) => badgeCounts[c.href]) ? 'ms-1' : 'ms-auto')} />
                                    </button>
                                    {open && (
                                        <ul id={id} className="mt-0.5 ms-[19px] ps-2.5 border-s border-white/10 space-y-0.5">
                                            {link.children.map((c) => (
                                                <li key={c.href}>
                                                    <Link href={c.href} aria-current={childActive(c, pathname) ? 'page' : undefined} className={cn(rowCls(childActive(c, pathname)), 'h-8 text-[13px]', childActive(c, pathname) && 'text-[#2EC4B6]')}>
                                                        <span className="truncate">{label(c)}</span>{badge(badgeCounts[c.href] || 0)}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        }
                        const active = isLinkActive(link);
                        return (
                            <li key={link.href}>
                                <Link href={link.href} aria-current={active ? 'page' : undefined} className={rowCls(active)}>
                                    <Icon size={16} className={cn(active && 'text-[#2EC4B6]')} /><span className="truncate">{label(link)}</span>{badge(badgeCounts[link.href] || 0)}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}


export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, logout, isAuthReady } = useAuth();
    const [isOpen, setIsOpen] = React.useState(true); // Open by default on desktop
    // Phones and tablets start with the menu closed and close it after navigating.
    React.useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth < 1024) setIsOpen(false); }, []);
    const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
    const [notifications, setNotifications] = React.useState<NotificationCounts>({
        pendingUsers: 0,
        pendingProducts: 0,
        pendingOrders: 0,
        pendingPlacements: 0
    });
    const [kycBlocked, setKycBlocked] = React.useState(false);
    const pathname = usePathname();
    React.useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth < 1024) setIsOpen(false); }, [pathname]);
    const isOwner = user?.role?.toUpperCase() === 'OWNER';
    const isTeamMember = ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(user?.role?.toUpperCase() || '') || isOwner;

    // Fetch Admin Notification Counts
    React.useEffect(() => {
        if (!user || !isTeamMember) return;

        const fetchCounts = async () => {
            try {
                const res = await apiFetch('/dashboard/admin/notifications');
                if (res.ok) {
                    const data = await res.json();
                    setNotifications(data);
                }
            } catch (err) {
                console.error('Failed to fetch admin notifications:', err);
            }
        };

        fetchCounts();
        const interval = setInterval(fetchCounts, 30000); // Polling every 30s
        return () => clearInterval(interval);
    }, [user, isTeamMember]);
    const { t } = useLanguage();
    // ... (keep role logic)


    // Role Guard: Only Admin/Team allowed in /admin
    React.useEffect(() => {
        if (isAuthReady) {
            if (!user) {
                router.replace('/auth/login?session=expired');
            } else if (!isTeamMember) {
                // Redirect non-admins to their appropriate home
                if (user.role?.toUpperCase() === 'SUPPLIER') {
                    router.replace('/supplier');
                } else {
                    router.replace('/dashboard/customer');
                }
            }
        }
    }, [isAuthReady, user, isTeamMember, router]);


    const isDeveloper = (user?.role || '').toUpperCase() === 'DEVELOPER';
    const role = user?.role || '';

    // The sidebar shows only what this role may open (lib/admin-access.ts mirrors the backend @Roles; the server stays the authority).
    const mayOpen = (href: string) => canAccessAdminPath(role, href);
    const filterLink = (l: SidebarLink): SidebarLink | null => {
        if (l.children) {
            const kids = l.children.filter((c) => mayOpen(c.href));
            return kids.length ? { ...l, children: kids } : null;
        }
        return mayOpen(l.href) ? l : null;
    };
    const filteredSidebarGroups = SIDEBAR_GROUPS
        .map((g) => ({ ...g, links: g.links.map(filterLink).filter((l): l is SidebarLink => !!l) }))
        .filter((g) => g.links.length > 0);
    const showSettings = mayOpen(SETTINGS_LINK.href);
    const pathAllowed = canAccessAdminPath(role, pathname);
    const homeForRole = defaultAdminPath(role);
    // /admin itself is the Overview (owner/admin): other roles land on their first page instead.
    React.useEffect(() => {
        if (!isAuthReady || !user || !isTeamMember) return;
        if (pathname === '/admin' && !pathAllowed && homeForRole) router.replace(homeForRole);
    }, [isAuthReady, user, isTeamMember, pathname, pathAllowed, homeForRole, router]);

    // KYC enforcement is for SUPPLIERS and BUYERS — never for platform staff.
    // Everyone in /admin (OWNER + ADMIN + MODERATOR + EDITOR + SUPPORT +
    // DEVELOPER + LOGISTICS) is platform staff and bypasses KYC entirely.
    React.useEffect(() => {
        if (!user) return;
        if (isTeamMember) { setKycBlocked(false); return; }
    }, [user, isTeamMember]);

    const badgeCounts: Record<string, number> = {
        '/admin/users': notifications.pendingUsers,
        '/admin/products/submissions': notifications.pendingProducts,
        '/admin/orders': notifications.pendingOrders,
        '/admin/placements': notifications.pendingPlacements,
    };

    // Show nothing while checking auth to prevent layout flash
    // This MUST be after all hooks to avoid "Rendered more hooks" error
    if (!isAuthReady || (user && !isTeamMember)) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#0F172A]">
                <div className="w-12 h-12 border-4 border-[#14B8A6] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

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
                    'transition-[width,transform] duration-300 flex flex-col z-[60] shrink-0 border-e border-white/5',
                    'fixed inset-y-0 start-0 lg:relative overflow-hidden',
                    isOpen ? 'translate-x-0 w-[232px]' : '-translate-x-[120%] rtl:translate-x-[120%] lg:translate-x-0 rtl:lg:translate-x-0 w-[232px] lg:w-[64px]'
                )}>
                <div className={cn('h-14 flex items-center border-b border-white/5 shrink-0', isOpen ? 'px-4' : 'justify-center')}>
                    <Link href="/" className="flex items-center gap-2.5 min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]" aria-label={t('adminNav', 'marketplaceHome')}>
                        <span className="w-8 h-8 rounded-lg bg-white overflow-hidden flex items-center justify-center shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/brand/atlantis-mark.png" alt="" className="w-6 h-6 object-contain" />
                        </span>
                        {isOpen && (
                            <span className="font-sans font-black text-[17px] tracking-tighter uppercase leading-none">
                                <span className="text-white">ALI&nbsp;</span><span className="text-[#2EC4B6]">FMCG.</span>{/* i18n-ignore: wordmark */}
                            </span>
                        )}
                    </Link>
                </div>

                <nav id="tour-admin-nav" aria-label={t('admin', 'panelTitle')} className={cn('flex-1 py-3 overflow-y-auto no-scrollbar', isOpen ? 'px-2.5' : 'px-0')}>
                    {filteredSidebarGroups.map(group => (
                        <SidebarGroupComponent key={group.title} group={group} isOpen={isOpen} pathname={pathname} badgeCounts={badgeCounts} bare={group.bare} />
                    ))}
                    {showSettings && <SidebarGroupComponent group={{ title: '', titleKey: '', icon: Settings, links: [SETTINGS_LINK] }} isOpen={isOpen} pathname={pathname} badgeCounts={badgeCounts} bare />}
                </nav>

                <div className={cn('border-t border-white/5 shrink-0', isOpen ? 'p-2.5' : 'py-3')}>
                    <AdminAccountMenu user={user} collapsed={!isOpen} onSignOut={async () => { await logout(); window.location.href = '/auth/login'; }} />
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {isOpen && <div className="fixed inset-0 bg-black/50 z-50 lg:hidden" onClick={() => setIsOpen(false)} aria-hidden />}
                <header className="h-14 bg-white border-b border-slate-200 flex items-center gap-2 px-3 sm:px-5 z-40 shrink-0">
                    <button type="button" onClick={() => setIsOpen(!isOpen)} aria-label={t('admin', 'panelTitle')} aria-expanded={isOpen}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                        <Menu size={18} />
                    </button>
                    <div id="tour-admin-panel" className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-[#0B1F3A] truncate">{isDeveloper ? 'Support HQ' : t('admin', 'panelTitle')}</p>{/* i18n-ignore: developer-only label */}
                    </div>
                    {/* Language, theme, settings and sign-out live in the account menu (sidebar footer); the logo goes to the marketplace home. */}
                    <span id="tour-admin-alerts" className="flex items-center"><NotificationBell /></span>
                </header>

                <div className="flex-1 overflow-y-auto bg-[#F6F8FA]">
                    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 min-h-full">
                        {pathAllowed ? children : pathname === '/admin' && homeForRole ? null : (
                            // A direct link to a page this role can't use: say so instead of rendering a page whose calls the server would refuse.
                            <div role="alert" className="mx-auto mt-16 max-w-md rounded-2xl bg-surface ring-1 ring-line p-8 text-center">
                                <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Lock size={20} aria-hidden /></span>
                                <h1 className="text-[18px] font-semibold text-heading">{t('adminNav', 'noAccessTitle')}</h1>
                                <p className="mt-1.5 text-[13.5px] text-ink-3">{t('adminNav', 'noAccessBody')}</p>
                                {homeForRole && <Link href={homeForRole} className="mt-4 inline-flex h-9 items-center rounded-lg bg-heading px-4 text-[13px] font-medium text-white hover:opacity-90">{t('adminNav', 'noAccessHome')}</Link>}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
