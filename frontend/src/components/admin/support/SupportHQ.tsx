'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { io } from 'socket.io-client';
import { ArrowUpRight, BookOpen, ClipboardList, MessageCircle, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inputCls } from '@/components/supplier/ui';
import { DISPUTE_ROLES, HQ_CHAT_ROLES, KYC_REVIEW_ROLES, supportHqApi, type HqStats, type Inbox, type InboxThread } from '@/lib/admin-support-api';
import { ConversationList, type ListFilter } from './ConversationList';
import { ThreadPanel } from './ThreadPanel';
import { SupportOverview } from './SupportOverview';
import { DisputesWorkspace } from '@/components/admin/disputes/DisputesWorkspace';
import { KycReview } from '@/components/admin/kyc/KycReview';
import { useTs } from './hqUi';

type View = 'overview' | 'chat' | 'orders' | 'disputes' | 'kyc';
const VIEWS: View[] = ['overview', 'chat', 'orders', 'disputes', 'kyc'];
const SOCKET_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin → Support HQ (/admin/support).
 * Deep links: ?view=chat&user=<userId>[&order=<orderId>] opens that exact
 * conversation (order: that order's thread with this buyer or supplier,
 * verified by the server). The legacy ?search=<userId> opens the same way.
 * ?view=disputes&id=<disputeId> opens a dispute; ?view=kyc&id=<documentId>
 * (or &user=<userId>, that account's latest submission) opens a KYC document.
 * `tab` is accepted as an alias of `view` (the /admin/disputes and /admin/kyc
 * redirects use it). The Disputes and KYC tabs appear only for the roles their
 * endpoints allow (DISPUTE_ROLES, KYC_REVIEW_ROLES).
 * The live-chat workspace fills the viewport: list and thread scroll on
 * their own, the composer stays at the bottom.
 */
export function SupportHQ() {
    const ts = useTs();
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();
    const { user } = useAuth();
    const role = String(user?.role || '').toUpperCase();
    const canKyc = KYC_REVIEW_ROLES.includes(role);
    const canDisputes = DISPUTE_ROLES.includes(role);
    // Conversations (Overview, Live chat, Orders) follow the Support HQ endpoints; a role without them (MODERATOR) gets its review tabs only.
    const canChat = HQ_CHAT_ROLES.includes(role);

    const legacy = sp.get('search') || '';
    const rawView = (sp.get('view') || sp.get('tab')) as View | null;
    const allowed = (v: View) => (v !== 'kyc' || canKyc) && (v !== 'disputes' || canDisputes) && (canChat || v === 'kyc' || v === 'disputes');
    const fallback: View = canChat ? 'chat' : canKyc ? 'kyc' : 'disputes';
    const view: View = rawView && VIEWS.includes(rawView) && allowed(rawView) ? rawView : fallback;
    const target = React.useMemo(() => {
        if (view !== 'chat' && view !== 'orders') return null;
        const u = sp.get('user') || (UUIDISH.test(legacy) ? legacy : '');
        return u ? { userId: u, orderId: sp.get('order') || null } : null;
    }, [sp, legacy, view]);
    const recordId = sp.get('id') || sp.get('doc') || null;

    const [inbox, setInbox] = React.useState<Inbox | null>(null);
    const [inboxError, setInboxError] = React.useState<string | null>(null);
    const [stats, setStats] = React.useState<HqStats | null>(null);
    const [statsError, setStatsError] = React.useState<string | null>(null);
    const [filter, setFilter] = React.useState<ListFilter>(view === 'orders' ? 'orders' : 'all');
    const [query, setQuery] = React.useState(UUIDISH.test(legacy) ? '' : legacy);
    const [waitingOnly, setWaitingOnly] = React.useState(false);

    const loadInbox = React.useCallback(async () => {
        try { setInbox(await supportHqApi.inbox()); setInboxError(null); }
        catch (e: any) { setInboxError(e?.message || ts('loadFailed')); }
    }, [ts]);
    const loadStats = React.useCallback(async () => {
        try { setStats(await supportHqApi.stats()); setStatsError(null); }
        catch (e: any) { setStatsError(e?.message || ts('loadFailed')); }
    }, [ts]);
    const refresh = React.useCallback(() => { loadInbox(); loadStats(); }, [loadInbox, loadStats]);

    React.useEffect(() => { if (canChat) refresh(); }, [refresh, canChat]);
    // New messages: socket events where they arrive, and a 30 s refresh as a fallback (order messages are sent over HTTP).
    React.useEffect(() => {
        if (!canChat) return;
        const id = window.setInterval(refresh, 30_000);
        const tok = getToken();
        const socket = tok ? io(`${SOCKET_BASE}/chat`, { auth: { token: tok }, transports: ['websocket', 'polling'] }) : null;
        socket?.on('new_inquiry', refresh);
        socket?.on('conversation_updated', refresh);
        return () => { window.clearInterval(id); socket?.disconnect(); };
    }, [refresh, canChat]);
    React.useEffect(() => { if (view === 'orders') setFilter('orders'); }, [view]);

    const go = React.useCallback((v: View, t?: { userId: string; orderId: string | null } | null, id?: string | null) => {
        const q = new URLSearchParams();
        q.set('view', v);
        if (t) { q.set('user', t.userId); if (t.orderId) q.set('order', t.orderId); }
        if (id) q.set('id', id);
        router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    }, [router, pathname]);
    const selectDispute = React.useCallback((id: string | null) => go('disputes', null, id), [go]);
    const selectKyc = React.useCallback((id: string | null) => go('kyc', null, id), [go]);
    const open = (t: InboxThread) => go(view === 'orders' ? 'orders' : 'chat', { userId: t.participantId, orderId: t.orderId });

    const threads = inbox?.threads ?? [];
    const selectedKey = target ? (target.orderId ? `order:${target.orderId}:${target.userId}` : `support:${target.userId}`) : null;
    const selectedRow = threads.find((t) => t.key === selectedKey) || null;
    const awaiting = stats?.awaitingTeam.total ?? threads.filter((t) => t.awaitingTeam).length;

    const tabs: { id: View; label: string; count?: number; tone?: 'warning' | 'danger' }[] = [
        ...(canChat ? [
            { id: 'overview' as const, label: ts('tabOverview') },
            { id: 'chat' as const, label: ts('tabLiveChat'), count: awaiting || undefined, tone: 'warning' as const },
            ...(inbox?.ordersVisible !== false ? [{ id: 'orders' as const, label: ts('tabOrders') }] : []),
        ] : []),
        ...(canDisputes ? [{ id: 'disputes' as const, label: ts('tabDisputes'), count: stats?.openDisputes || undefined, tone: 'danger' as const }] : []),
        ...(canKyc ? [{ id: 'kyc' as const, label: ts('tabKyc'), count: stats?.kycPending.available ? stats.kycPending.count || undefined : undefined, tone: 'warning' as const }] : []),
    ];
    const workspace = view === 'chat' || view === 'orders';

    return (
        <div className={cn('text-start flex flex-col gap-4', workspace && 'lg:h-[calc(100dvh-96px)]')} data-no-translate>
            {/* Header */}
            <header className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="font-sans text-[22px] leading-tight font-semibold text-heading tracking-tight">{ts('title')}</h1>
                    <p className="mt-0.5 text-[13.5px] text-ink-3">{ts('subtitle')}</p>
                </div>
                <div className="relative w-full sm:w-72">
                    <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                    <label htmlFor="hq-search" className="sr-only">{ts('searchLabel')}</label>
                    <input id="hq-search" type="search" value={query}
                        onChange={(e) => { setQuery(e.target.value); if (!workspace) go('chat', target); }}
                        placeholder={ts('searchPlaceholder')} className={cn(inputCls, 'h-9 ps-9 text-[13.5px]')} />
                </div>
            </header>

            {/* Tabs */}
            <nav aria-label={ts('tabsAria')} className="shrink-0 flex items-center gap-1 overflow-x-auto border-b border-line -mx-1 px-1">
                {tabs.map((tab) => (
                    <button key={tab.id} type="button" aria-current={view === tab.id ? 'page' : undefined} onClick={() => go(tab.id, tab.id === 'chat' || tab.id === 'orders' ? target : null)}
                        className={cn('h-9 -mb-px px-3 border-b-2 inline-flex items-center gap-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6]',
                            view === tab.id ? 'border-teal text-teal' : 'border-transparent text-ink-3 hover:text-ink')}>
                        {tab.label}
                        {tab.count ? <span className={cn('min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums inline-flex items-center justify-center', tab.tone === 'danger' ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#FFFBEB] text-[#B45309]')}>{tab.count}</span> : null}
                    </button>
                ))}
            </nav>

            {/* Content */}
            {workspace ? (
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr] lg:grid-rows-[minmax(0,1fr)] gap-3">
                    <div className={cn('rounded-xl bg-surface ring-1 ring-line overflow-hidden h-[70dvh] lg:h-auto min-h-0', target && 'hidden lg:block')}>
                        <ConversationList threads={threads} loading={!inbox && !inboxError} error={inboxError} onRetry={loadInbox}
                            filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} waitingOnly={waitingOnly} onWaitingOnly={setWaitingOnly}
                            selectedKey={selectedKey} onSelect={open} ordersVisible={inbox?.ordersVisible !== false} truncated={!!inbox?.truncated} />
                    </div>
                    <div className={cn('rounded-xl bg-surface ring-1 ring-line overflow-hidden h-[80dvh] lg:h-auto min-h-0', !target && 'hidden lg:block')}>
                        {target ? (
                            <ThreadPanel key={selectedKey!} userId={target.userId} orderId={target.orderId} viewerRole={role}
                                hintName={selectedRow ? selectedRow.participant.companyName || selectedRow.participant.name : null}
                                onBack={() => go(view, null)} onChanged={refresh} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <span className="w-11 h-11 rounded-xl bg-surface-2 ring-1 ring-line text-ink-3 flex items-center justify-center"><MessageCircle size={20} aria-hidden /></span>
                                <p className="mt-3 text-[15px] font-semibold text-heading">{ts('pickTitle')}</p>
                                <p className="mt-1 text-[13.5px] text-ink-3 max-w-[44ch]">{ts('pickBody')}</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : view === 'overview' ? (
                <SupportOverview stats={stats} statsError={statsError} onRetry={loadStats} threads={threads} onOpen={(t) => go('chat', { userId: t.participantId, orderId: t.orderId })} onView={(v) => go(v)} canDisputes={canDisputes} />
            ) : view === 'disputes' && canDisputes ? <DisputesWorkspace role={role} selectedId={recordId} onSelect={selectDispute} />
                : view === 'kyc' && canKyc ? <KycReview role={role} selectedId={recordId} userId={recordId ? null : sp.get('user')} onSelect={selectKyc} /> : null}

            <QuickLinks role={role} />
        </div>
    );
}

/** Real destinations only, kept small under the workspace. Disputes and KYC are tabs of this page. */
function QuickLinks({ role }: { role: string }) {
    const ts = useTs();
    const admin = role === 'ADMIN' || role === 'OWNER';
    const links = [
        ...(admin ? [{ href: '/admin/orders', label: ts('qlOrders'), icon: ClipboardList }, { href: '/admin/users', label: ts('qlUsers'), icon: Users }] : []),
        { href: '/help', label: ts('qlHelp'), icon: BookOpen },
    ];
    return (
        <nav aria-label={ts('quickLinksAria')} className="shrink-0 flex flex-wrap items-center gap-x-1 gap-y-1 text-[12.5px]">
            <span className="text-ink-4 me-1">{ts('quickLinks')}</span>
            {links.map((l) => (
                <Link key={l.href} href={l.href} className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-ink-2 hover:bg-surface hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                    <l.icon size={13} className="text-ink-4" aria-hidden />{l.label}<ArrowUpRight size={12} className="text-ink-4 rtl:-scale-x-100" aria-hidden />
                </Link>
            ))}
        </nav>
    );
}
