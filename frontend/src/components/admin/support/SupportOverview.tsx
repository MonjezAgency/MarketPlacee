'use client';

import * as React from 'react';
import { AlertCircle, ArrowRight, Clock, Hourglass, MessageCircle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, EmptyState, ErrorState, Notice, Skeleton, Stat } from '@/components/supplier/ui';
import { useWhen } from '@/components/support/messages';
import { orderRef, type HqStats, type InboxThread } from '@/lib/admin-support-api';
import { InfoTip, RoleChip, StateChips, displayName, useDuration, useTs } from './hqUi';

/** Metric label with its definition in an info tooltip. */
function Label({ text, tip }: { text: string; tip: string }) {
    return <span className="inline-flex items-center gap-1">{text}<InfoTip label={text}>{tip}</InfoTip></span>;
}

/** Overview: figures computed by GET /chat/admin/hq/stats, and the conversations waiting for a person. */
export function SupportOverview({ stats, statsError, onRetry, threads, onOpen, onView, canDisputes }: {
    stats: HqStats | null; statsError: string | null; onRetry: () => void;
    threads: InboxThread[]; onOpen: (t: InboxThread) => void; onView: (v: 'disputes' | 'kyc' | 'chat') => void; canDisputes: boolean;
}) {
    const ts = useTs();
    const dur = useDuration();
    const { shortWhen } = useWhen();
    const loading = !stats && !statsError;
    const waiting = threads.filter((t) => t.awaitingTeam).slice(0, 8);
    const fr = stats?.firstResponse;
    return (
        <div className="space-y-5">
            {statsError && <ErrorState message={statsError} onRetry={onRetry} />}
            <div className={cn('grid gap-3 grid-cols-1 sm:grid-cols-2', stats?.kycPending.available ? 'xl:grid-cols-5' : 'xl:grid-cols-4')}>
                <Stat loading={loading} icon={<AlertCircle size={17} />} tone={stats?.openDisputes ? 'danger' : 'neutral'}
                    label={ts('mOpenDisputes')} value={stats ? stats.openDisputes : '—'}
                    hint={stats ? ts('mOpenDisputesHint', { count: stats.disputesUnderReview }) : undefined} href={canDisputes ? '/admin/support?view=disputes' : undefined} />
                <Stat loading={loading} icon={<Hourglass size={17} />} tone={stats?.awaitingTeam.total ? 'warning' : 'neutral'}
                    label={<Label text={ts('mWaiting')} tip={ts('mWaitingTip')} /> as unknown as string} value={stats ? stats.awaitingTeam.total : '—'}
                    hint={stats ? ts('mSplit', { support: stats.awaitingTeam.support, order: stats.awaitingTeam.order }) : undefined} />
                <Stat loading={loading} icon={<MessageCircle size={17} />} tone="brand"
                    label={<Label text={ts('mActive')} tip={ts('mActiveTip', { days: stats?.active.days ?? 7 })} /> as unknown as string} value={stats ? stats.active.total : '—'}
                    hint={stats ? ts('mSplit', { support: stats.active.support, order: stats.active.order }) : undefined} />
                {stats?.kycPending.available && (
                    <Stat icon={<ShieldCheck size={17} />} tone={stats.kycPending.count ? 'warning' : 'neutral'}
                        label={<Label text={ts('mKyc')} tip={ts('mKycTip')} /> as unknown as string} value={stats.kycPending.count} hint={ts('mKycHint')} href="/admin/support?view=kyc" />
                )}
                <Stat loading={loading} icon={<Clock size={17} />}
                    label={<Label text={ts('mFirstResponse')} tip={ts('mFirstResponseTip', { days: 30 })} /> as unknown as string}
                    value={fr?.available ? dur(fr.averageMs) : <span className="text-[15px] font-medium text-ink-3">{ts('notAvailable')}</span>}
                    hint={fr ? (fr.available ? ts('mFirstResponseHint', { count: fr.samples, days: fr.days }) : fr.reason === 'role' ? ts('mFirstResponseRole') : ts('mFirstResponseNone', { days: fr.days ?? 30 })) : undefined} />
            </div>
            {stats?.truncated && <Notice tone="info">{ts('statsTruncated')}</Notice>}

            <Card title={ts('waitingTitle')} description={ts('waitingDesc')} bodyClassName="px-0 py-0"
                actions={<button type="button" onClick={() => onView('chat')} className="inline-flex items-center gap-1 text-[13px] font-medium text-teal hover:underline">{ts('openLiveChat')} <ArrowRight size={13} className="rtl:rotate-180" aria-hidden /></button>}>
                {loading ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                    : !waiting.length ? <EmptyState icon={<MessageCircle size={20} />} title={ts('waitingEmpty')}>{ts('waitingEmptyBody')}</EmptyState>
                        : (
                            <ul className="divide-y divide-line border-t border-line mt-3">
                                {waiting.map((t) => (
                                    <li key={t.key}>
                                        <button type="button" onClick={() => onOpen(t)} className="w-full text-start px-4 sm:px-5 py-2.5 flex items-center gap-3 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6]">
                                            <span className="min-w-0 flex-1">
                                                <span className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-[13.5px] font-medium text-heading truncate">{displayName(t.participant, ts('unknownUser'))}</span>
                                                    <RoleChip role={t.participant.role} partyKind={t.partyKind} />
                                                    {t.orderId && <bdi dir="ltr" className="text-[12px] font-mono text-ink-3">{orderRef(t.orderId)}</bdi>}
                                                    <StateChips compact state={t.state} team={t.assignedTeam} takenOverBy={t.handedOverByName} awaiting={false} />
                                                </span>
                                                <span className="block mt-0.5 text-[12.5px] text-ink-3 truncate">{t.lastMessage || ts('noText')}</span>
                                            </span>
                                            <time dateTime={new Date(t.lastAt).toISOString()} className="shrink-0 text-[12px] text-ink-4">{shortWhen(t.lastAt)}</time>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
            </Card>
        </div>
    );
}
