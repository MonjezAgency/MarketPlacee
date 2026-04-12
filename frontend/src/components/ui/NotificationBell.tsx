'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Package, ShoppingCart, Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';
import { useAuth } from '@/lib/auth';
import { NOTIFICATION_TYPES } from '@/lib/types';
import { useRouter } from 'next/navigation';

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

function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell({ isLight }: { isLight?: boolean }) {
    const { user } = useAuth();
    const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
    const router = useRouter();
    const [open, setOpen] = useState(false);
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
                    isLight ? 'text-foreground' : 'text-white'
                )}
                aria-label="Notifications"
            >
                <Bell className="w-5 h-5 group-hover:text-secondary transition-colors" />
                <span className="text-[10px] font-bold">Alerts</span>
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -end-1 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute end-0 top-full mt-3 w-80 bg-card border border-border/50 rounded-2xl shadow-2xl z-[200] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                        <span className="font-bold text-sm">Notifications</span>
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
                    <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
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
                                    'w-full flex items-start gap-3 px-4 py-3 text-start hover:bg-muted/40 transition-colors',
                                    !n.read && 'bg-primary/5'
                                )}
                            >
                                <NotificationIcon type={n.type} />
                                <div className="flex-1 min-w-0">
                                    <p className={cn('text-xs font-bold truncate', !n.read && 'text-foreground')}>{n.title}</p>
                                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                                    <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                                </div>
                                {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
