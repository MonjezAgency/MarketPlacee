'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard, Package, ShoppingCart, Users, Settings, LogOut,
    TrendingUp, Star, Bell, ShieldCheck, History, Sun, Moon,
    MessageCircle
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { DollarSign } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface SidebarItem {
    name: string;
    icon: any;
    href: string;
    badge?: string;
}

export default function Sidebar({ role = 'supplier' }: { role?: 'supplier' | 'buyer' | 'admin' }) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const [mounted, setMounted] = useState(false);

    const SUPPLIER_ITEMS: SidebarItem[] = [
        { name: t('sidebar', 'overview'), icon: LayoutDashboard, href: '/supplier' },
        { name: t('sidebar', 'myProducts'), icon: Package, href: '/supplier/products' },
        { name: t('sidebar', 'placements'), icon: Star, href: '/supplier/placements', badge: 'New' },
        { name: t('sidebar', 'orders'), icon: ShoppingCart, href: '/supplier/orders' },
        { name: t('sidebar', 'earnings'), icon: DollarSign, href: '/supplier/earnings' },
        { name: t('sidebar', 'analytics'), icon: TrendingUp, href: '/supplier/analytics' },
        { name: t('sidebar', 'support'), icon: MessageCircle, href: '/supplier/support' },
        { name: t('sidebar', 'settings'), icon: Settings, href: '/supplier/settings' },
    ];

    const BUYER_ITEMS: SidebarItem[] = [
        { name: t('sidebar', 'myDashboard'), icon: LayoutDashboard, href: '/dashboard/customer' },
        { name: t('sidebar', 'ordersHistory'), icon: History, href: '/dashboard/customer/orders' },
        { name: t('sidebar', 'notifications'), icon: Bell, href: '/dashboard/customer/notifications' },
        { name: t('sidebar', 'support'), icon: MessageCircle, href: '/dashboard/support' },
        { name: t('sidebar', 'settings'), icon: Settings, href: '/dashboard/customer/settings' },
    ];

    const ADMIN_ITEMS: SidebarItem[] = [
        { name: t('sidebar', 'overview'), icon: LayoutDashboard, href: '/admin' },
        { name: t('sidebar', 'controlCenter'), icon: ShieldCheck, href: '/admin/users' },
        { name: t('sidebar', 'managePlacements'), icon: Star, href: '/admin/placements' },
        { name: t('sidebar', 'globalOrders'), icon: ShoppingCart, href: '/admin/orders' },
        { name: t('sidebar', 'supportHub'), icon: MessageCircle, href: '/admin/support' },
        { name: t('sidebar', 'settings'), icon: Settings, href: '/admin/settings' },
    ];

    // Dynamic items state to hold badges
    const [supplierItems, setSupplierItems] = useState<SidebarItem[]>(SUPPLIER_ITEMS);
    const [buyerItems, setBuyerItems] = useState<SidebarItem[]>(BUYER_ITEMS);

    useEffect(() => { setMounted(true); }, []);

    // Update items when language changes
    useEffect(() => {
        setSupplierItems(SUPPLIER_ITEMS);
        setBuyerItems(BUYER_ITEMS);
    }, [t]);

    useEffect(() => {
        if ((role === 'supplier' || role === 'buyer') && user?.id) {
            const fetchNotifications = async () => {
                try {
                    const res = await apiFetch(`/users/${user.id}/notifications`);

                    if (res.ok) {
                        const notifications = await res.json();
                        
                        if (role === 'supplier') {
                            const unreadErrors = notifications.filter((n: any) => n.type === 'ERROR' && !n.read);
                            if (unreadErrors.length > 0) {
                                setSupplierItems(prev => prev.map(item =>
                                    item.href === '/supplier/products'
                                        ? { ...item, badge: `${unreadErrors.length} Errors` }
                                        : item
                                ));
                            } else {
                                setSupplierItems(prev => prev.map(item =>
                                    item.href === '/supplier/products' ? { ...item, badge: undefined } : item
                                ));
                            }
                        }

                        // Also check for unread support messages (INFO type from ChatService)
                        const unreadSupport = notifications.filter((n: any) => n.title === 'New Support Message' && !n.read);
                        if (unreadSupport.length > 0) {
                            if (role === 'supplier') {
                                setSupplierItems(prev => prev.map(item =>
                                    item.href === '/supplier/support' ? { ...item, badge: 'New' } : item
                                ));
                            } else {
                                setBuyerItems(prev => prev.map(item =>
                                    item.href === '/dashboard/support' ? { ...item, badge: 'New' } : item
                                ));
                            }
                        } else {
                            if (role === 'supplier') {
                                setSupplierItems(prev => prev.map(item =>
                                    item.href === '/supplier/support' ? { ...item, badge: undefined } : item
                                ));
                            } else {
                                setBuyerItems(prev => prev.map(item =>
                                    item.href === '/dashboard/support' ? { ...item, badge: undefined } : item
                                ));
                            }
                        }
                    }
                } catch (err) {
                    console.error('Failed to fetch notifications', err);
                }
            };

            fetchNotifications();
            const interval = setInterval(fetchNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [role, user?.id]);

    const items = role === 'admin' ? ADMIN_ITEMS : role === 'buyer' ? buyerItems : supplierItems;

    const portalLabel = role === 'admin' 
        ? t('sidebar', 'adminPortal') 
        : role === 'buyer' 
            ? t('sidebar', 'buyerPortal') 
            : t('sidebar', 'supplierPortal');

    return (
        <aside style={{ backgroundColor: '#0A1A2F', color: '#F5F7FA' }} className="w-72 border-e border-border min-h-screen hidden md:flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-hidden group/sidebar transition-all duration-300">
            {/* Branding Header */}
            <div className="p-6 flex items-center gap-4 border-b border-white/10 bg-white/[0.02]">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden border-2 border-white/10 group-hover/sidebar:scale-110 transition-transform">
                    <img 
                        src="/icon.png" 
                        alt="Atlantis" 
                        className="w-full h-full object-contain p-1" 
                    />
                </div>
                <div className="flex flex-col">
                    <h2 className="text-xl font-poppins font-black tracking-tighter text-white leading-none">
                        Atlan<span className="text-teal-400">tis.</span>
                    </h2>
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-teal-400/50 mt-1">{portalLabel}</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
                {items.map((item) => {
                    const isActive = pathname === item.href;
                    // Check if badge is an error string
                    const isErrorBadge = item.badge?.includes('Error');

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                ${isActive
                                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 bg-gradient-to-r from-primary to-primary/90'
                                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                                }
              `}
                        >
                            <item.icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-white/40 group-hover:text-white'}`} />
                            <span className="font-semibold text-sm flex-1">{item.name}</span>
                            {item.badge && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${isActive ? 'bg-white/20 text-white' : isErrorBadge ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-primary/10 text-primary'}`}>
                                    {item.badge}
                                </span>
                            )}
                            {isActive && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 space-y-4">
                {/* User Profile Section */}
                {user && (
                    <div className="px-4 py-3 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center overflow-hidden">
                            {user.avatar ? (
                                <img src={user.avatar} className="w-full h-full object-cover" alt={user.name} />
                            ) : (
                                <span className="text-teal-400 font-bold text-sm">{user.name?.[0] || 'U'}</span>
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <p className="text-xs font-bold text-white truncate">{user.name}</p>
                            <p className="text-[9px] text-teal-500 font-black uppercase tracking-widest">{user.role}</p>
                        </div>
                    </div>
                )}

                <div className="space-y-1">
                    {/* Theme Toggle */}
                    {mounted && (
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="flex items-center gap-3 px-4 py-3 w-full text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                            <span className="font-bold text-sm">{theme === 'dark' ? t('sidebar', 'lightMode') : t('sidebar', 'darkMode')}</span>
                        </button>
                    )}
                    <button
                        onClick={async () => { await logout(); window.location.href = '/auth/login'; }}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-transparent hover:bg-red-500/10 text-white/60 hover:text-red-400 rounded-xl transition-all outline-none"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="font-bold text-sm">{t('sidebar', 'signOut')}</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
