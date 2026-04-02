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

interface SidebarItem {
    name: string;
    icon: any;
    href: string;
    badge?: string;
}

const SUPPLIER_ITEMS: SidebarItem[] = [
    { name: 'Overview', icon: LayoutDashboard, href: '/supplier' },
    { name: 'My Products', icon: Package, href: '/supplier/products' },
    { name: 'Placements', icon: Star, href: '/supplier/placements', badge: 'New' },
    { name: 'Orders', icon: ShoppingCart, href: '/supplier/orders' },
    { name: 'Analytics', icon: TrendingUp, href: '/supplier/analytics' },
    { name: 'Support', icon: MessageCircle, href: '/supplier/support' },
    { name: 'Settings', icon: Settings, href: '/supplier/settings' },
];

const BUYER_ITEMS: SidebarItem[] = [
    { name: 'My Dashboard', icon: LayoutDashboard, href: '/dashboard/buyer' },
    { name: 'Orders History', icon: History, href: '/dashboard/buyer/orders' },
    { name: 'Notifications', icon: Bell, href: '/dashboard/buyer/notifications' },
    { name: 'Support', icon: MessageCircle, href: '/dashboard/support' },
    { name: 'Settings', icon: Settings, href: '/dashboard/buyer/settings' },
];

const ADMIN_ITEMS: SidebarItem[] = [
    { name: 'Overview', icon: LayoutDashboard, href: '/admin' },
    { name: 'Control Center', icon: ShieldCheck, href: '/admin/users' },
    { name: 'Manage Placements', icon: Star, href: '/admin/placements' },
    { name: 'Global Orders', icon: ShoppingCart, href: '/admin/orders' },
    { name: 'Support Hub', icon: MessageCircle, href: '/dashboard/support' },
    { name: 'Settings', icon: Settings, href: '/admin/settings' },
];

export default function Sidebar({ role = 'supplier' }: { role?: 'supplier' | 'buyer' | 'admin' }) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const { user, logout } = useAuth();
    const [mounted, setMounted] = useState(false);

    // Dynamic items state to hold badges
    const [supplierItems, setSupplierItems] = useState<SidebarItem[]>(SUPPLIER_ITEMS);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (role === 'supplier' && user?.id) {
            const fetchNotifications = async () => {
                try {
                    const token = localStorage.getItem('bev-token');
                    if (!token) return;

                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/users/${user.id}/notifications`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (res.ok) {
                        const notifications = await res.json();
                        const unreadErrors = notifications.filter((n: any) => n.type === 'ERROR' && !n.read);

                        if (unreadErrors.length > 0) {
                            // Update badge for My Products tab
                            setSupplierItems(prev => prev.map(item =>
                                item.name === 'My Products'
                                    ? { ...item, badge: `${unreadErrors.length} Errors` }
                                    : item
                            ));

                            // Trigger iPhone toast for the most recent unread error
                            const latestError = unreadErrors[0];

                            // Only show if we haven't shown it this session (simple sessionStorage check)
                            const shownKey = `notif_shown_${latestError.id}`;
                            if (!sessionStorage.getItem(shownKey)) {
                                import('@/components/ui/IPhoneToast').then(({ showIPhoneToast }) => {
                                    showIPhoneToast(
                                        latestError.title,
                                        latestError.message,
                                        "error"
                                    );
                                });
                                sessionStorage.setItem(shownKey, 'true');

                                // Mark as read so badge eventually clears when user clicks or views them (we can just mark it read here or let the products page do it)
                                // We will leave it unread so the badge persists until they fix it, but let's just mark it read so it stops popping up. Wait, the requirement says "shows the number of errors on the tab".
                                // Let's keep it unread but stop popup via sessionStorage.
                            }
                        } else {
                            // Clear badge
                            setSupplierItems(prev => prev.map(item =>
                                item.name === 'My Products' ? { ...item, badge: undefined } : item
                            ));
                        }
                    }
                } catch (err) {
                    console.error('Failed to fetch notifications', err);
                }
            };

            fetchNotifications();
            // Optional: Poll every 30 seconds
            const interval = setInterval(fetchNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [role, user?.id]);

    const items = role === 'admin' ? ADMIN_ITEMS : role === 'buyer' ? BUYER_ITEMS : supplierItems;

    return (
        <aside style={{ backgroundColor: '#0A1A2F', color: '#F5F7FA' }} className="w-72 border-e border-border min-h-screen hidden md:flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-hidden group/sidebar transition-all duration-300">
            {/* Branding Header */}
            <div className="p-6 flex items-center gap-4 border-b border-border/50">
                <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground font-black text-2xl shadow-lg shadow-primary/20">
                    AT
                </div>
                <div className="flex flex-col">
                    <h2 className="text-lg font-poppins font-bold tracking-tight text-white leading-none">
                        Atlantis
                    </h2>
                    <span className="text-[10px] text-secondary font-black uppercase tracking-[0.2em] mt-1">
                        {role} Portal
                    </span>
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
            <div className="p-4 border-t border-white/10 space-y-1">
                {/* Theme Toggle */}
                {mounted && (
                    <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className="flex items-center gap-3 px-4 py-3 w-full text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        <span className="font-bold text-sm">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                )}
                <Button
                    variant="ghost"
                    onClick={() => { logout(); window.location.href = '/'; }}
                    className="w-full justify-start gap-3 px-4 py-6 hover:bg-red-500/10 text-white/60 hover:text-red-400 rounded-xl"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="font-bold text-sm">Sign Out</span>
                </Button>
            </div>
        </aside>
    );
}
