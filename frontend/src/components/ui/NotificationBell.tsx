'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Package, ShoppingCart, Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';
import { useAuth } from '@/lib/auth';
import { NOTIFICATION_TYPES } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { notifyToast, toneOf } from '@/components/ui/NotifyToasts';

function getNotificationLink(n: AppNotification): string | null {
  switch (n.type) {
    case NOTIFICATION_TYPES.NEW_REGISTRATION:
    case NOTIFICATION_TYPES.GOOGLE_REGISTRATION:
      return '/admin/users?status=PENDING_APPROVAL';
    case NOTIFICATION_TYPES.NEW_REVIEW:
      return '/admin/reviews';
    case NOTIFICATION_TYPES.NEW_ORDER:
      return '/dashboard/supplier/orders';
    case NOTIFICATION_TYPES.KYC_SUBMITTED:
      return '/admin/kyc';
    case NOTIFICATION_TYPES.ERROR:
    case NOTIFICATION_TYPES.WARNING: {
      // Product approval failure → go to supplier products to fix
      const productId = (n as any).data?.productId;
      if (productId) return `/supplier/products?highlight=${productId}`;
      if (n.title?.toLowerCase().includes('product')) return '/supplier/products';
      return null;
    }
    default:
      return null;
  }
}


function NotificationIcon({ type }: { type: AppNotification['type'] }) {
    if (type === 'SUCCESS') return <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />;
    if (type === 'ERROR') return <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />;
    if (type === 'WARNING') return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
}

const TILE: Record<string, string> = {
    SUCCESS: 'bg-[#ECFDF5] dark:bg-emerald-500/15 text-[#059669]',
    ERROR: 'bg-[#FEF2F2] dark:bg-red-500/15 text-[#DC2626]',
    WARNING: 'bg-[#FFF7ED] dark:bg-amber-500/15 text-[#D97706]',
};
function NotificationTile({ type }: { type: AppNotification['type'] }) {
    const Icon = type === 'SUCCESS' ? CheckCircle : type === 'ERROR' ? AlertCircle : type === 'WARNING' ? AlertTriangle : Info;
    return (
        <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', TILE[type] || 'bg-teal-soft text-teal')}>
            <Icon className="w-[18px] h-[18px]" />
        </span>
    );
}

function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

/** `compact` renders an icon-only 44px button that matches the storefront header controls. */
export default function NotificationBell({ isLight, compact }: { isLight?: boolean; compact?: boolean }) {
    const { user } = useAuth();
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications(!!user);
    const router = useRouter();
    const [open, setOpen] = useState(false);
    // "While you were away": one summary toast, only for unread items that
    // arrived after this browser last saw the list. (Previously this showed
    // for ANY unread item on every new session, and a dependency change
    // cancelled its auto-hide timer, so it popped up on entry and stayed.)
    const awayChecked = useRef(false);
    useEffect(() => {
        if (!compact || awayChecked.current || notifications.length === 0) return;
        awayChecked.current = true;
        let since: number | null = null;
        try {
            const raw = localStorage.getItem('atl_notif_seen_at');
            since = raw ? Number(raw) : null;
            localStorage.setItem('atl_notif_seen_at', String(Date.now()));
        } catch { /* storage blocked: skip the summary */ return; }
        if (since == null) return; // first visit on this device: the bell's badge is enough
        const fresh = notifications.filter((n) => !n.read && new Date(n.createdAt).getTime() > since!);
        if (!fresh.length) return;
        notifyToast({
            id: `away:${fresh[0].id}`,
            eyebrow: 'While you were away',
            title: `${fresh.length} new ${fresh.length === 1 ? 'notification' : 'notifications'}`,
            message: fresh[0].title,
            tone: toneOf(fresh[0].type),
            action: { label: 'View notifications', onClick: () => setOpen(true) },
        });
    }, [compact, notifications]);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(prev => !prev)}
                className={cn(
                    'relative flex flex-col items-center gap-0.5 group',
                    compact && 'h-9 w-9 justify-center rounded-lg text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]/60',
                    !compact && (isLight ? 'text-foreground' : 'text-white')
                )}
                aria-label="Notifications"
            >
                <Bell className="w-5 h-5 group-hover:text-secondary transition-colors" />
                {!compact && <span className="text-[10px] font-bold">Alerts</span>}
                {unreadCount > 0 && (
                    <span className={cn('absolute bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center', compact ? 'top-1.5 end-1.5 ring-2 ring-white' : '-top-1 -end-1 animate-pulse')}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className={cn(
                    'absolute end-0 top-full mt-3 z-[200] overflow-hidden',
                    compact
                        ? 'w-[380px] max-w-[calc(100vw-24px)] bg-surface rounded-2xl ring-1 ring-line shadow-[0_24px_60px_rgba(15,23,42,0.16)]'
                        : 'w-80 bg-card border border-border/50 rounded-2xl shadow-2xl'
                )}>
                    {/* Header */}
                    <div className={cn('flex items-center justify-between px-4 py-3 border-b', compact ? 'px-5 py-4 border-line' : 'border-border/50')}>
                        <span className={cn('font-bold', compact ? 'text-[15px] text-ink' : 'text-sm')}>Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors"
                            >
                                <CheckCheck className="w-3 h-3" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className={cn('max-h-[420px] overflow-y-auto divide-y', compact ? 'divide-[#F1F3F6]' : 'divide-border/50')}>
                        {notifications.length === 0 && (
                            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                                <Bell className="w-8 h-8 opacity-30" />
                                <p className="text-xs font-bold">No notifications yet</p>
                            </div>
                        )}
                        {notifications.map(n => (
                            <button
                                key={n.id}
                                onClick={() => {
                                    if (!n.read) markRead(n.id);
                                    const link = getNotificationLink(n);
                                    if (link) {
                                        setOpen(false);
                                        router.push(link);
                                    }
                                }}
                                className={cn(
                                    'w-full flex items-start gap-3 text-start transition-colors',
                                    compact ? 'px-5 py-4 hover:bg-surface-2' : 'px-4 py-3 hover:bg-muted/40',
                                    !n.read && (compact ? 'bg-[#F4FBFA]' : 'bg-primary/5')
                                )}
                            >
                                {compact ? <NotificationTile type={n.type} /> : <NotificationIcon type={n.type} />}
                                <div className="flex-1 min-w-0">
                                    <p className={cn(compact ? 'text-[14px] font-semibold text-ink truncate' : 'text-xs font-bold truncate', !n.read && !compact && 'text-foreground')}>{n.title}</p>
                                    <p className={cn(compact ? 'text-[13px] text-ink-2 line-clamp-2 mt-0.5' : 'text-[11px] text-muted-foreground line-clamp-2 mt-0.5')}>{n.message}</p>
                                    <p className={cn(compact ? 'text-[12px] text-ink-4 mt-1.5' : 'text-[10px] text-muted-foreground/60 mt-1')}>{timeAgo(n.createdAt)}</p>
                                </div>
                                {!n.read && <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', compact ? 'bg-[#2EC4B6]' : 'bg-primary')} />}
                            </button>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}
