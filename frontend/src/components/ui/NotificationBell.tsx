'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, Check, CheckCheck, CreditCard, Package, RefreshCw, ShoppingCart, Target, UserCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';
import { useAuth } from '@/lib/auth';
import { notifyToast, toneOf } from '@/components/ui/NotifyToasts';
import { useLanguage } from '@/contexts/LanguageContext';
import { dayBucket, isStaff, notificationGroup, notificationHref, notificationRef, notificationText, type DayBucket, type NotificationGroup } from '@/lib/notifications';

const GROUP_ICON: Record<NotificationGroup, React.ComponentType<{ className?: string }>> = {
    order: ShoppingCart, target: Target, product: Package, account: UserCheck, payment: CreditCard, other: Bell,
};
/** Tile colour follows the stored severity, so a warning about an order still reads as a warning. */
const TONE: Record<string, string> = {
    SUCCESS: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    ERROR: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    WARNING: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

function timeAgo(date: string, intl: string) {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    let rtf: Intl.RelativeTimeFormat;
    try { rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto', style: 'short' }); } catch { rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }); }
    if (mins < 60) return rtf.format(-Math.max(0, mins), 'minute');
    const hours = Math.floor(mins / 60);
    if (hours < 24) return rtf.format(-hours, 'hour');
    return rtf.format(-Math.floor(hours / 24), 'day');
}

/**
 * The notification bell used in every header (admin, supplier, storefront).
 * A 36px icon button with a small unread badge; the panel lists the user's own
 * notifications grouped by day, in their language, with All / Unread, mark one
 * or all read, and loading, empty and error states. Clicking a notification
 * marks it read and opens its record for the reader's role.
 */
export default function NotificationBell(_props: { isLight?: boolean; compact?: boolean }) {
    const { user } = useAuth();
    const role = user?.role;
    const { notifications, unreadCount, status, filter, setFilter, hasMore, loadingMore, loadMore, reload, markRead, markAllRead } = useNotifications(!!user);
    const router = useRouter();
    const { t, fmt, meta } = useLanguage();
    const tn = (k: string, v?: Record<string, string | number>) => t('notificationsCenter', k, v);
    const money = React.useCallback((v: number) => fmt.number(v, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }), [fmt]);
    const [open, setOpen] = React.useState(false);
    const [shown, setShown] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    const buttonRef = React.useRef<HTMLButtonElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const panelId = React.useId();

    // "While you were away": one summary toast for unread items that arrived after this browser last looked.
    const awayChecked = React.useRef(false);
    React.useEffect(() => {
        if (awayChecked.current || status !== 'ready' || notifications.length === 0) return;
        awayChecked.current = true;
        let since: number | null = null;
        try {
            const raw = localStorage.getItem('atl_notif_seen_at');
            since = raw ? Number(raw) : null;
            localStorage.setItem('atl_notif_seen_at', String(Date.now()));
        } catch { return; }
        if (since == null) return;
        const fresh = notifications.filter((n) => !n.read && new Date(n.createdAt).getTime() > since!);
        if (!fresh.length) return;
        notifyToast({
            id: `away:${fresh[0].id}`,
            eyebrow: t('notifications', 'whileAway'),
            title: t('notifications', 'newCount', { count: fresh.length }),
            message: notificationText(fresh[0], t, money).title,
            tone: toneOf(fresh[0].type),
            action: { label: t('notifications', 'view'), onClick: () => setOpen(true) },
        });
    }, [notifications, status, t, money]);

    React.useEffect(() => {
        if (!open) { setShown(false); return; }
        const id = requestAnimationFrame(() => setShown(true));
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        panelRef.current?.focus();
        return () => { cancelAnimationFrame(id); document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    if (!user) return null;

    const failed = () => notifyToast({ id: 'notif-save-failed', title: tn('saveFailed'), message: tn('saveFailedBody'), tone: 'error' });
    const openOne = (n: AppNotification) => {
        if (!n.read) markRead(n.id).catch(failed);
        const href = notificationHref(n, role);
        if (href) { setOpen(false); router.push(href); }
    };

    const groups: { bucket: DayBucket; items: AppNotification[] }[] = [];
    for (const n of notifications) {
        const b = dayBucket(n.createdAt);
        const g = groups.find((x) => x.bucket === b);
        if (g) g.items.push(n); else groups.push({ bucket: b, items: [n] });
    }
    const badge = unreadCount > 99 ? '99+' : String(unreadCount);
    const viewAll = !isStaff(role) && String(role || '').toUpperCase() !== 'SUPPLIER' ? '/dashboard/customer/notifications' : null;

    return (
        <div className="relative" ref={ref}>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                aria-label={unreadCount > 0 ? tn('bellUnread', { count: unreadCount }) : t('notifications', 'title')}
                className={cn('relative grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal/60', open && 'bg-surface-3 text-ink')}
            >
                <Bell className="h-[18px] w-[18px]" aria-hidden />
                {unreadCount > 0 && (
                    <span aria-hidden className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white tabular-nums ring-2 ring-surface text-center">
                        {badge}
                    </span>
                )}
            </button>

            {open && (
                <div
                    ref={panelRef}
                    id={panelId}
                    role="dialog"
                    aria-label={t('notifications', 'title')}
                    tabIndex={-1}
                    className={cn(
                        'z-[200] flex flex-col overflow-hidden outline-none',
                        'fixed inset-x-3 top-14 max-h-[calc(100dvh-72px)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-[384px] sm:max-h-[min(560px,calc(100dvh-96px))]',
                        'rounded-2xl bg-surface/95 backdrop-blur-xl ring-1 ring-line shadow-[0_18px_48px_rgba(15,23,42,0.18)]',
                        'transition-[opacity,transform] duration-150 ease-atl motion-reduce:transition-none',
                        shown ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
                    )}
                >
                    <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
                        <h2 className="text-[15px] font-semibold text-ink">{t('notifications', 'title')}</h2>
                        {unreadCount > 0 && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold text-ink-2 tabular-nums">{badge}</span>}
                        <span className="flex-1" />
                        <button
                            type="button"
                            onClick={() => markAllRead().catch(failed)}
                            disabled={unreadCount === 0}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-teal hover:bg-teal-soft disabled:text-ink-4 disabled:hover:bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-teal/60"
                        >
                            <CheckCheck className="h-3.5 w-3.5" aria-hidden />{t('notifications', 'markAllRead')}
                        </button>
                    </div>

                    <div className="px-4 pb-2.5">
                        <div role="tablist" aria-label={tn('filterLabel')} className="grid grid-cols-2 rounded-lg bg-surface-3 p-0.5 text-[12px] font-medium">
                            {(['all', 'unread'] as const).map((f) => (
                                <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => filter !== f && setFilter(f)}
                                    className={cn('h-7 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal/60', filter === f ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}>
                                    {f === 'all' ? tn('all') : tn('unreadTab', { count: unreadCount })}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line" aria-busy={status === 'loading'}>
                        {status === 'loading' && (
                            <ul className="space-y-1 p-2" aria-label={tn('loading')}>
                                {[0, 1, 2, 3].map((i) => (
                                    <li key={i} className="flex gap-3 rounded-xl px-2.5 py-2.5">
                                        <span className="h-8 w-8 shrink-0 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
                                        <span className="flex-1 space-y-2 pt-1"><span className="block h-3 w-2/3 rounded bg-surface-3 motion-safe:animate-pulse" /><span className="block h-3 w-full rounded bg-surface-3 motion-safe:animate-pulse" /></span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {status === 'error' && (
                            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center" role="alert">
                                <span className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><AlertTriangle className="h-5 w-5" aria-hidden /></span>
                                <p className="text-[13.5px] font-semibold text-ink">{tn('errorTitle')}</p>
                                <p className="text-[12.5px] text-ink-3">{tn('errorBody')}</p>
                                <button type="button" onClick={() => reload()} className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-ink ring-1 ring-inset ring-line hover:bg-surface-2">
                                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />{tn('retry')}
                                </button>
                            </div>
                        )}

                        {status === 'ready' && notifications.length === 0 && (
                            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                                <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-ink-3">{filter === 'unread' ? <Check className="h-5 w-5" aria-hidden /> : <BellOff className="h-5 w-5" aria-hidden />}</span>
                                <p className="text-[13.5px] font-semibold text-ink">{filter === 'unread' ? tn('caughtUp') : t('notifications', 'empty')}</p>
                                <p className="text-[12.5px] text-ink-3">{filter === 'unread' ? tn('caughtUpBody') : tn('emptyBody')}</p>
                            </div>
                        )}

                        {status === 'ready' && groups.map((g) => (
                            <section key={g.bucket} aria-label={tn(g.bucket)}>
                                <h3 className="sticky top-0 z-10 bg-surface/95 px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4 backdrop-blur">{tn(g.bucket)}</h3>
                                <ul className="space-y-0.5 px-2 pb-1.5">
                                    {g.items.map((n) => {
                                        const { title, body } = notificationText(n, t, money);
                                        const Icon = GROUP_ICON[notificationGroup(n)];
                                        const refChip = notificationRef(n);
                                        const href = notificationHref(n, role);
                                        return (
                                            <li key={n.id} className={cn('group relative flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-2', !n.read && 'bg-teal-soft/40')}>
                                                <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', TONE[n.type] || 'bg-teal-soft text-teal')}><Icon className="h-4 w-4" aria-hidden /></span>
                                                <button type="button" onClick={() => openOne(n)} className="min-w-0 flex-1 text-start outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-teal/60">
                                                    <span className="flex items-baseline gap-2">
                                                        <span className={cn('min-w-0 flex-1 truncate text-[13.5px] text-ink', n.read ? 'font-medium' : 'font-semibold')}>{title}</span>
                                                        <time dateTime={n.createdAt} title={fmt.date(n.createdAt, { dateStyle: 'medium', timeStyle: 'short' } as any)} className="shrink-0 text-[11.5px] text-ink-4 tabular-nums">{timeAgo(n.createdAt, meta.intl)}</time>
                                                    </span>
                                                    <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2 line-clamp-2">{body}</span>
                                                    {(refChip || !href) && (
                                                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                            {refChip && <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{refChip}</span>}
                                                            {!href && <span className="text-[11px] text-ink-4">{tn('noRecord')}</span>}
                                                        </span>
                                                    )}
                                                    {!n.read && <span className="sr-only">{tn('unreadSr')}</span>}
                                                </button>
                                                {!n.read ? (
                                                    <button type="button" onClick={() => markRead(n.id).catch(failed)} aria-label={tn('markRead')} title={tn('markRead')}
                                                        className="relative z-10 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-teal/60">
                                                        <span className="h-2 w-2 rounded-full bg-teal group-hover:hidden group-focus-within:hidden" aria-hidden />
                                                        <Check className="hidden h-3.5 w-3.5 text-ink-2 group-hover:block group-focus-within:block" aria-hidden />
                                                    </button>
                                                ) : <span className="w-6 shrink-0" aria-hidden />}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ))}

                        {status === 'ready' && hasMore && (
                            <div className="px-4 pb-3 pt-1">
                                <button type="button" onClick={loadMore} disabled={loadingMore} className="w-full rounded-lg py-2 text-[12.5px] font-medium text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-2 disabled:opacity-60">
                                    {loadingMore ? tn('loading') : tn('loadMore')}
                                </button>
                            </div>
                        )}
                    </div>

                    {viewAll && (
                        <div className="border-t border-line px-4 py-2.5 text-center">
                            <Link href={viewAll} onClick={() => setOpen(false)} className="text-[12.5px] font-medium text-teal hover:underline">{tn('viewAll')}</Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
