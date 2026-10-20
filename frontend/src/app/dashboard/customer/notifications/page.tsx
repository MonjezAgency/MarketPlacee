'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, Check, CheckCheck, CreditCard, Package, RefreshCw, ShoppingCart, Target, UserCheck } from 'lucide-react';
import { useNotifications, type AppNotification } from '@/hooks/useNotifications';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { notifyToast } from '@/components/ui/NotifyToasts';
import { dayBucket, notificationGroup, notificationHref, notificationRef, notificationText, type DayBucket, type NotificationGroup } from '@/lib/notifications';

const ICON: Record<NotificationGroup, React.ComponentType<{ className?: string }>> = { order: ShoppingCart, target: Target, product: Package, account: UserCheck, payment: CreditCard, other: Bell };
const TONE: Record<string, string> = {
    SUCCESS: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    ERROR: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    WARNING: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

/** The buyer's full notification list: the same data, text and links as the bell, with paging. */
export default function NotificationsPage() {
    const { user } = useAuth();
    const { notifications, unreadCount, status, filter, setFilter, hasMore, loadingMore, loadMore, reload, markRead, markAllRead } = useNotifications(!!user);
    const { t, fmt } = useLanguage();
    const tn = (k: string, v?: Record<string, string | number>) => t('notificationsCenter', k, v);
    const router = useRouter();
    const money = (v: number) => fmt.number(v, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const failed = () => notifyToast({ id: 'notif-save-failed', title: tn('saveFailed'), message: tn('saveFailedBody'), tone: 'error' });

    const groups: { bucket: DayBucket; items: AppNotification[] }[] = [];
    for (const n of notifications) {
        const b = dayBucket(n.createdAt);
        const g = groups.find((x) => x.bucket === b);
        if (g) g.items.push(n); else groups.push({ bucket: b, items: [n] });
    }
    const open = (n: AppNotification) => {
        if (!n.read) markRead(n.id).catch(failed);
        const href = notificationHref(n, user?.role);
        if (href) router.push(href);
    };

    return (
        <div className="space-y-5" data-no-translate>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-title-sm text-heading">{t('buyerAccount', 'nTitle')}</h1>
                    <p className="mt-1 text-small text-ink-3">{t('buyerAccount', 'nDesc')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div role="tablist" aria-label={tn('filterLabel')} className="grid grid-cols-2 rounded-lg bg-surface-3 p-0.5 text-[13px] font-medium">
                        {(['all', 'unread'] as const).map((f) => (
                            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => filter !== f && setFilter(f)}
                                className={cn('h-8 rounded-md px-3 transition-colors', filter === f ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}>
                                {f === 'all' ? tn('all') : tn('unreadTab', { count: unreadCount })}
                            </button>
                        ))}
                    </div>
                    <button type="button" onClick={() => markAllRead().catch(failed)} disabled={unreadCount === 0}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-2 disabled:opacity-50">
                        <CheckCheck className="h-4 w-4" aria-hidden />{t('buyerAccount', 'nMarkAll')}
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line" aria-busy={status === 'loading'}>
                {status === 'loading' && (
                    <ul className="divide-y divide-line">
                        {[0, 1, 2].map((i) => (
                            <li key={i} className="flex gap-4 p-5"><span className="h-10 w-10 rounded-xl bg-surface-3 motion-safe:animate-pulse" /><span className="flex-1 space-y-2 pt-1"><span className="block h-3.5 w-1/3 rounded bg-surface-3 motion-safe:animate-pulse" /><span className="block h-3.5 w-2/3 rounded bg-surface-3 motion-safe:animate-pulse" /></span></li>
                        ))}
                    </ul>
                )}
                {status === 'error' && (
                    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center" role="alert">
                        <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden />
                        <p className="font-semibold text-ink">{tn('errorTitle')}</p>
                        <p className="text-small text-ink-3">{tn('errorBody')}</p>
                        <button type="button" onClick={() => reload()} className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ring-line hover:bg-surface-2"><RefreshCw className="h-3.5 w-3.5" aria-hidden />{tn('retry')}</button>
                    </div>
                )}
                {status === 'ready' && notifications.length === 0 && (
                    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
                        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-3 text-ink-3">{filter === 'unread' ? <Check className="h-6 w-6" aria-hidden /> : <Bell className="h-6 w-6" aria-hidden />}</span>
                        <p className="font-semibold text-ink">{filter === 'unread' ? tn('caughtUp') : t('buyerAccount', 'nEmptyTitle')}</p>
                        <p className="text-small text-ink-3">{filter === 'unread' ? tn('caughtUpBody') : t('buyerAccount', 'nEmptyText')}</p>
                    </div>
                )}
                {status === 'ready' && groups.map((g) => (
                    <section key={g.bucket} aria-label={tn(g.bucket)}>
                        <h2 className="border-b border-line bg-surface-2 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">{tn(g.bucket)}</h2>
                        <ul className="divide-y divide-line">
                            {g.items.map((n) => {
                                const { title, body } = notificationText(n, t, money);
                                const Icon = ICON[notificationGroup(n)];
                                const ref = notificationRef(n);
                                const href = notificationHref(n, user?.role);
                                return (
                                    <li key={n.id} className={cn('relative flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-2', !n.read && 'bg-teal-soft/40')}>
                                        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', TONE[n.type] || 'bg-teal-soft text-teal')}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
                                        <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-start outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-teal/60">
                                            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                                                <span className={cn('text-[14.5px] text-ink', n.read ? 'font-medium' : 'font-semibold')}>{title}</span>
                                                <time dateTime={n.createdAt} className="text-[12px] text-ink-4 tabular-nums">{fmt.date(n.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                                            </span>
                                            <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-2">{body}</span>
                                            {(ref || !href) && (
                                                <span className="mt-2 flex flex-wrap gap-2">
                                                    {ref && <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{ref}</span>}
                                                    {!href && <span className="text-[12px] text-ink-4">{tn('noRecord')}</span>}
                                                </span>
                                            )}
                                            {!n.read && <span className="sr-only">{tn('unreadSr')}</span>}
                                        </button>
                                        {!n.read && (
                                            <button type="button" onClick={() => markRead(n.id).catch(failed)} className="relative z-10 shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-teal hover:bg-teal-soft">
                                                {t('buyerAccount', 'nMarkRead')}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
                {status === 'ready' && hasMore && (
                    <div className="border-t border-line p-3">
                        <button type="button" onClick={loadMore} disabled={loadingMore} className="w-full rounded-lg py-2 text-[13px] font-medium text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-2 disabled:opacity-60">{loadingMore ? tn('loading') : tn('loadMore')}</button>
                    </div>
                )}
            </div>
        </div>
    );
}
