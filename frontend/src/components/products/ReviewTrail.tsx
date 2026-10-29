'use client';

import * as React from 'react';
import { CheckCircle2, MessageSquare, RefreshCw, Send, Shuffle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ReviewEvent } from '@/lib/admin-api';

/**
 * The review trail of one product (ProductReviewEvent rows): submissions,
 * Ali FMCG decisions and feedback, oldest first. Staff see team members'
 * names; a supplier sees "Ali FMCG" and "You". Text is from `productReview`.
 */
const ICON: Record<string, { icon: React.ElementType; cls: string }> = {
    SUBMITTED: { icon: Send, cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
    RESUBMITTED: { icon: RefreshCw, cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
    CHANGES_REQUESTED: { icon: MessageSquare, cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
    APPROVED: { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    REJECTED: { icon: XCircle, cls: 'bg-red-50 text-red-700 ring-red-200' },
    STATUS_CHANGED: { icon: Shuffle, cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

export function ReviewTrail({ events, viewer, compact }: { events: ReviewEvent[]; viewer: 'staff' | 'supplier'; compact?: boolean }) {
    const { t, fmt } = useLanguage();
    const tr = (k: string, v?: Record<string, string | number>) => t('productReview', k, v);
    if (!events.length) return <p className={cn('text-[13px] text-ink-3', compact ? 'py-1' : 'px-4 sm:px-5 py-4')}>{tr(viewer === 'staff' ? 'emptyStaff' : 'emptySupplier')}</p>;
    const who = (e: ReviewEvent) => e.by === 'atlantis' ? (viewer === 'staff' && e.actorName ? e.actorName : tr('byAtlantis')) : e.by === 'supplier' ? (viewer === 'supplier' ? tr('byYou') : tr('bySupplier')) : tr('bySystem');
    return (
        <ol className={cn('divide-y divide-line', compact && 'text-[12.5px]')}>
            {[...events].reverse().map((e) => {
                const m = ICON[e.action] || ICON.STATUS_CHANGED;
                const Icon = m.icon;
                return (
                    <li key={e.id} className={cn('flex gap-3', compact ? 'py-2' : 'px-4 sm:px-5 py-3')}>
                        <span className={cn('mt-0.5 w-7 h-7 shrink-0 rounded-lg ring-1 ring-inset flex items-center justify-center', m.cls)} aria-hidden><Icon size={14} /></span>
                        <div className="min-w-0 flex-1">
                            <p className={cn('font-medium text-ink', compact ? 'text-[13px]' : 'text-[13.5px]')}>
                                {tr(`action_${e.action}`, { who: who(e) })}
                                <span className="ms-2 font-normal text-[12px] text-ink-4 tabular-nums">{fmt.date(e.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </p>
                            {e.message && <p className={cn('mt-1 whitespace-pre-line text-ink-2 rounded-lg bg-surface-2 px-3 py-2', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>{e.message}</p>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
