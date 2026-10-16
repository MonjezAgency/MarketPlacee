'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Bot, Package, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { AssistantPanel, type AssistantSession } from './AssistantPanel';
import { OrderThreads } from './OrderThreads';

/**
 * The Atlantis Support workspace (suppliers and buyers): a header with the
 * real assistant state, and two clearly separate areas — the assistant
 * conversation, and per-order threads with the Atlantis team.
 */
export default function SupportCenter({ role, heightClass }: { role: 'supplier' | 'buyer'; heightClass: string }) {
    return <React.Suspense fallback={null}><Center role={role} heightClass={heightClass} /></React.Suspense>;
}

function Center({ role, heightClass }: { role: 'supplier' | 'buyer'; heightClass: string }) {
    const sp = useSearchParams();
    const { user } = useAuth();
    const [tab, setTab] = React.useState<'assistant' | 'orders'>(sp.get('tab') === 'orders' ? 'orders' : 'assistant');
    const [session, setSession] = React.useState<AssistantSession | null>(null);
    const [orderCount, setOrderCount] = React.useState<number | null>(null);
    const onSession = React.useCallback((s: AssistantSession | null) => setSession(s), []);

    const select = (t: 'assistant' | 'orders') => {
        setTab(t);
        const url = new URL(window.location.href);
        if (t === 'orders') url.searchParams.set('tab', 'orders'); else url.searchParams.delete('tab');
        window.history.replaceState(null, '', url.toString());
    };
    const onKeyTabs = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(tab === 'assistant' ? 'orders' : 'assistant'); }
    };

    // Status reflects what the server reports: whether the AI assistant is switched on, and whether a person is in the conversation.
    const status = !session ? null : session.mode === 'team'
        ? { dot: 'bg-[#2EC4B6]', text: 'Atlantis team in your conversation', title: 'A person from the Atlantis team has joined; replies appear in the Assistant tab.' }
        : session.assistant.available
            ? { dot: 'bg-[#10B981]', text: 'AI assistant on', title: 'The assistant answers from your own account data. If it can’t answer, your message is kept for the team.' }
            : { dot: 'bg-ink-4', text: 'AI assistant off — the team replies', title: 'The AI assistant isn’t switched on. Messages are saved for the Atlantis team.' };

    const tabs = [
        { key: 'assistant' as const, label: 'Assistant', short: 'Assistant', icon: Bot, badge: null as number | null },
        { key: 'orders' as const, label: 'Order conversations', short: 'Orders', icon: Package, badge: orderCount },
    ];

    return (
        <div className="text-start">
            <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="font-sans text-[24px] leading-tight font-semibold tracking-tight text-heading">Support</h1>
                    <p className="mt-1 max-w-[70ch] text-[14px] text-ink-3">
                        {role === 'supplier' ? 'Get answers about your listings, stock, prices and orders, or write to the Atlantis team about a specific order.' : 'Get answers about your orders, cart and account, or write to the Atlantis team about a specific order.'}
                    </p>
                </div>
                {status && (
                    <p title={status.title} className="inline-flex shrink-0 items-center gap-2 h-8 px-3 rounded-full ring-1 ring-line bg-surface text-[13px] font-medium text-ink-2">
                        <span className={cn('w-2 h-2 rounded-full', status.dot)} aria-hidden /> {status.text}
                    </p>
                )}
            </header>

            <section className={cn('flex flex-col rounded-2xl ring-1 ring-line bg-surface overflow-hidden', heightClass)} aria-label="Support workspace">
                <div role="tablist" aria-label="Support" onKeyDown={onKeyTabs} className="shrink-0 flex items-end gap-1 px-2 sm:px-3 border-b border-line overflow-x-auto scrollbar-hide">
                    {tabs.map((t) => {
                        const on = tab === t.key;
                        return (
                            <button key={t.key} role="tab" id={`support-tab-${t.key}`} aria-selected={on} aria-controls={`support-panel-${t.key}`} tabIndex={on ? 0 : -1} type="button" onClick={() => select(t.key)}
                                className={cn('relative h-12 px-3 sm:px-4 inline-flex items-center gap-2 whitespace-nowrap text-[14px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6] rounded-t-lg',
                                    on ? 'text-heading' : 'text-ink-3 hover:text-ink')}>
                                <t.icon size={16} aria-hidden /> <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.short}</span>
                                {t.badge != null && t.badge > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-surface-3 text-[12px] font-semibold text-ink-2 inline-flex items-center justify-center">{t.badge}</span>}
                                <span aria-hidden className={cn('absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-colors duration-150', on ? 'bg-heading' : 'bg-transparent')} />
                            </button>
                        );
                    })}
                    {session?.mode === 'team' && tab === 'assistant' && (
                        <span className="ms-auto mb-3 hidden sm:inline-flex items-center gap-1.5 text-[12.5px] text-ink-3"><UserRound size={14} className="text-teal" aria-hidden /> A person is helping you</span>
                    )}
                </div>

                <div id="support-panel-assistant" role="tabpanel" aria-labelledby="support-tab-assistant" hidden={tab !== 'assistant'} className={cn('flex-1 min-w-0 min-h-0', tab === 'assistant' ? 'flex' : 'hidden')}>
                    <AssistantPanel onSession={onSession} />
                </div>
                <div id="support-panel-orders" role="tabpanel" aria-labelledby="support-tab-orders" hidden={tab !== 'orders'} className={cn('flex-1 min-w-0 min-h-0', tab === 'orders' ? 'flex' : 'hidden')}>
                    <OrderThreads role={role} userId={user?.id || null} onCount={setOrderCount} />
                </div>
            </section>
        </div>
    );
}
