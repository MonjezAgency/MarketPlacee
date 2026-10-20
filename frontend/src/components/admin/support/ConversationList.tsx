'use client';

import * as React from 'react';
import { ImageIcon, MessageCircle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmptyState, ErrorState, Skeleton, inputCls } from '@/components/supplier/ui';
import { useWhen } from '@/components/support/messages';
import { initials } from '@/components/admin/users/userUi';
import { orderRef, type InboxThread } from '@/lib/admin-support-api';
import { RoleChip, StateChips, displayName, useTs } from './hqUi';

export type ListFilter = 'all' | 'support' | 'orders';

/** Left panel: search, All / Support / Orders, "waiting only", and the conversation rows. Scrolls on its own. */
export function ConversationList({ threads, loading, error, onRetry, filter, onFilter, query, onQuery, waitingOnly, onWaitingOnly, selectedKey, onSelect, ordersVisible, truncated }: {
    threads: InboxThread[]; loading: boolean; error: string | null; onRetry: () => void;
    filter: ListFilter; onFilter: (f: ListFilter) => void; query: string; onQuery: (q: string) => void;
    waitingOnly: boolean; onWaitingOnly: (v: boolean) => void;
    selectedKey: string | null; onSelect: (t: InboxThread) => void; ordersVisible: boolean; truncated: boolean;
}) {
    const ts = useTs();
    const counts = React.useMemo(() => ({
        all: threads.length,
        support: threads.filter((t) => t.kind === 'support').length,
        orders: threads.filter((t) => t.kind === 'order').length,
    }), [threads]);
    const q = query.trim().toLowerCase();
    const shown = threads.filter((t) => {
        if (filter === 'support' && t.kind !== 'support') return false;
        if (filter === 'orders' && t.kind !== 'order') return false;
        if (waitingOnly && !t.awaitingTeam) return false;
        if (!q) return true;
        const hay = [t.participant.name, t.participant.companyName, t.participant.email, t.lastMessage, t.orderId, t.orderId ? orderRef(t.orderId) : null].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    });
    const tabs: { id: ListFilter; label: string }[] = [
        { id: 'all', label: ts('filterAll') },
        { id: 'support', label: ts('filterSupport') },
        ...(ordersVisible ? [{ id: 'orders' as const, label: ts('filterOrders') }] : []),
    ];
    return (
        <div className="flex flex-col min-h-0 h-full">
            <div className="p-3 border-b border-line space-y-2.5 shrink-0">
                <div className="relative">
                    <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                    <label htmlFor="hq-list-search" className="sr-only">{ts('listSearchLabel')}</label>
                    <input id="hq-list-search" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={ts('listSearchPlaceholder')} className={cn(inputCls, 'h-9 ps-9 text-[13.5px]')} />
                </div>
                <div className="flex items-center justify-between gap-2">
                    <div role="group" aria-label={ts('listFilterLabel')} className="inline-flex rounded-lg bg-surface-2 ring-1 ring-line p-0.5">
                        {tabs.map((f) => (
                            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}
                                className={cn('h-7 px-2.5 rounded-md text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                    filter === f.id ? 'bg-surface text-heading shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink')}>
                                {f.label} <span className="tabular-nums text-ink-4">{counts[f.id]}</span>
                            </button>
                        ))}
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2 cursor-pointer select-none">
                        <input type="checkbox" checked={waitingOnly} onChange={(e) => onWaitingOnly(e.target.checked)} className="w-4 h-4 rounded border-line-strong text-teal focus:ring-[#2EC4B6]" />
                        {ts('waitingOnly')}
                    </label>
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" aria-busy={loading}>
                {error ? <div className="p-3"><ErrorState message={error} onRetry={onRetry} /></div>
                    : loading && !threads.length ? (
                        <ul className="divide-y divide-line">{Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3 flex gap-3"><Skeleton className="w-9 h-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-full" /></div></li>)}</ul>
                    ) : !shown.length ? (
                        <EmptyState icon={<MessageCircle size={20} />} title={threads.length ? ts('listNoMatch') : ts('listEmptyTitle')}>
                            {threads.length ? ts('listNoMatchBody') : ts('listEmptyBody')}
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-line" aria-label={ts('listAria')}>
                            {shown.map((t) => <Row key={t.key} t={t} selected={selectedKey === t.key} onSelect={() => onSelect(t)} />)}
                        </ul>
                    )}
                {truncated && !error && <p className="px-3 py-2 text-[12px] text-ink-3 border-t border-line">{ts('listTruncated')}</p>}
            </div>
        </div>
    );
}

function Row({ t, selected, onSelect }: { t: InboxThread; selected: boolean; onSelect: () => void }) {
    const ts = useTs();
    const { shortWhen } = useWhen();
    const name = displayName(t.participant, ts('unknownUser'));
    const prefix = t.lastFrom === 'team' ? ts('prefixTeam') : t.lastFrom === 'assistant' ? ts('prefixAssistant') : null;
    return (
        <li>
            <button type="button" onClick={onSelect} aria-current={selected ? 'true' : undefined}
                className={cn('w-full text-start px-3 py-2.5 flex gap-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6] border-s-[3px]',
                    selected ? 'bg-teal-soft/60 border-[#2EC4B6]' : 'border-transparent hover:bg-surface-2')}>
                <span aria-hidden className="w-9 h-9 shrink-0 rounded-full bg-surface-3 text-ink-3 text-[12px] font-semibold flex items-center justify-center">{initials(name)}</span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className={cn('truncate text-[13.5px] text-heading', t.unread ? 'font-semibold' : 'font-medium')}>{name}</span>
                        <time dateTime={new Date(t.lastAt).toISOString()} className="ms-auto shrink-0 text-[12px] text-ink-4">{shortWhen(t.lastAt)}</time>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        <RoleChip role={t.participant.role} partyKind={t.partyKind} />
                        {t.kind === 'order' && t.orderId
                            ? <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-surface-3 text-[11.5px] text-ink-2">{ts('rowOrder')} <bdi dir="ltr" className="ms-1 font-mono">{orderRef(t.orderId)}</bdi></span>
                            : <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-surface-3 text-[11.5px] text-ink-2">{ts('rowSupport')}</span>}
                        <StateChips compact state={t.state} team={t.assignedTeam} takenOverBy={t.handedOverByName} awaiting={t.awaitingTeam} />
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                        <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', t.unread ? 'text-ink' : 'text-ink-3')}>
                            {prefix && <span className="text-ink-4">{prefix} </span>}
                            {t.lastMessage || (t.lastHasImage ? <span className="inline-flex items-center gap-1"><ImageIcon size={12} aria-hidden />{ts('imageOnly')}</span> : ts('noText'))}
                        </span>
                        {t.unread > 0 && <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[#B91C1C] text-white text-[11px] font-semibold tabular-nums flex items-center justify-center" aria-label={ts('unreadAria', { count: t.unread })}>{t.unread}</span>}
                    </span>
                </span>
            </button>
        </li>
    );
}
