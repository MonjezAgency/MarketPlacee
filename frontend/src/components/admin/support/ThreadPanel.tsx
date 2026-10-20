'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { AlertCircle, ArrowLeft, ArrowUpRight, Bot, ExternalLink, Hand, MessageCircle, RotateCcw, Route, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, EmptyState, ErrorState, Skeleton, StatusBadge, selectCls } from '@/components/supplier/ui';
import { AtlantisMark, DayDivider, RichText, splitLinks, useWhen } from '@/components/support/messages';
import { Composer, Kbd } from '@/components/support/Composer';
import { Trans } from '@/components/i18n/Trans';
import { PaymentBadge } from '@/components/admin/OrderBadges';
import { KycBadge, StatusBadge as AccountStatusBadge, initials } from '@/components/admin/users/userUi';
import { TEAMS, orderRef, supportHqApi, type Team, type Thread, type ThreadMessage } from '@/lib/admin-support-api';
import { RoleChip, StateChips, displayName, teamLabel, useTs } from './hqUi';

const USERS_ROLES = ['ADMIN', 'OWNER'];
const ORDER_DETAIL_ROLES = ['ADMIN', 'OWNER', 'SUPPORT', 'MODERATOR', 'LOGISTICS'];
type InnerTab = 'conversation' | 'order' | 'profile';

/**
 * Right panel: one conversation. Header (participant, role, order, state,
 * routing / take-over), inner tabs, the message list (scrolls on its own) and
 * the composer pinned to the bottom. Everything shown comes from
 * GET /chat/admin/hq/thread; sends go through the existing send endpoints and
 * show the server's answer (or its error) — nothing is marked sent before it is.
 */
export function ThreadPanel({ userId, orderId, viewerRole, hintName, onBack, onChanged }: {
    userId: string; orderId: string | null; viewerRole: string; hintName?: string | null;
    onBack?: () => void; onChanged: () => void;
}) {
    const ts = useTs();
    const [thread, setThread] = React.useState<Thread | null>(null);
    const [error, setError] = React.useState<{ message: string; status?: number } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [tab, setTab] = React.useState<InnerTab>('conversation');
    const [draft, setDraft] = React.useState('');
    const [sending, setSending] = React.useState(false);
    const [sendError, setSendError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState<'assign' | 'take' | 'back' | null>(null);
    const [team, setTeam] = React.useState<Team>('SUPPORT');
    const listRef = React.useRef<HTMLDivElement>(null);
    const key = `${userId}|${orderId || ''}`;

    const load = React.useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const th = await supportHqApi.thread(userId, orderId);
            setThread(th); setError(null);
            if (th.state.assignedTeam && (TEAMS as readonly string[]).includes(th.state.assignedTeam)) setTeam(th.state.assignedTeam as Team);
            const unread = th.messages.filter((m) => m.from === 'participant' && !m.isRead).map((m) => m.id);
            if (unread.length) supportHqApi.markRead(unread).then(() => onChanged()).catch(() => { /* read state stays as stored */ });
        } catch (e: any) {
            setError({ message: e?.message || ts('threadLoadFailed'), status: e?.status });
            if (!silent) setThread(null);
        } finally { setLoading(false); }
    }, [userId, orderId, ts, onChanged]);

    // A new target: reset the panel, keep nothing from the previous conversation.
    React.useEffect(() => { setTab('conversation'); setDraft(''); setSendError(null); setThread(null); load(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    // Live refresh while open (socket events in the parent also call onChanged).
    React.useEffect(() => { const id = window.setInterval(() => load(true), 20_000); return () => window.clearInterval(id); }, [load]);

    React.useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [thread?.messages.length, tab]);

    const send = async () => {
        const content = draft.trim();
        if (!content || sending) return;
        setSending(true); setSendError(null);
        try {
            if (orderId) await supportHqApi.replyOrder(orderId, thread?.participant.id || userId, content);
            else await supportHqApi.reply(userId, content);
            setDraft('');
            await load(true);
            onChanged();
        } catch (e: any) {
            setSendError(e?.message || ts('sendFailed'));
        } finally { setSending(false); }
    };

    const act = async (kind: 'assign' | 'take' | 'back') => {
        setBusy(kind);
        try {
            if (kind === 'assign') {
                const r = await supportHqApi.assign(userId, team);
                toast.success(r.changed ? ts('assignDone', { team: teamLabel(ts, r.team) }) : ts('assignSame', { team: teamLabel(ts, r.team) }));
            } else if (kind === 'take') { await supportHqApi.takeOver(userId); toast.success(ts('takeOverDone')); }
            else { await supportHqApi.handBack(userId); toast.success(ts('handBackDone')); }
            await load(true); onChanged();
        } catch (e: any) { toast.error(e?.message || ts('actionFailed')); }
        finally { setBusy(null); }
    };

    const tabs: { id: InnerTab; label: string }[] = [
        { id: 'conversation', label: ts('tabConversation') },
        ...(orderId ? [{ id: 'order' as const, label: ts('tabOrder') }] : []),
        { id: 'profile', label: ts('tabProfile') },
    ];
    const onTabKey = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const rtl = typeof document !== 'undefined' && document.dir === 'rtl';
        const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
        const i = tabs.findIndex((x) => x.id === tab);
        const next = tabs[(i + step + tabs.length) % tabs.length];
        setTab(next.id);
        document.getElementById(`hq-tab-${next.id}`)?.focus();
    };

    const p = thread?.participant;
    const name = p ? displayName(p, ts('unknownUser')) : hintName || ts('unknownUser');
    const role = String(viewerRole || '').toUpperCase();

    return (
        <section aria-label={ts('threadAria', { name })} className="flex flex-col min-h-0 h-full">
            {/* Header */}
            <header className="shrink-0 px-4 py-3 border-b border-line">
                <div className="flex items-start gap-3">
                    {onBack && <button type="button" onClick={onBack} aria-label={ts('backToList')} className="lg:hidden -ms-1 mt-1 w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-2"><ArrowLeft size={17} className="rtl:rotate-180" /></button>}
                    <span aria-hidden className="w-10 h-10 shrink-0 rounded-full bg-surface-3 text-ink-3 text-[13px] font-semibold flex items-center justify-center">{initials(name)}</span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h2 className="text-[15px] font-semibold text-heading truncate">{name}</h2>
                            {p && <RoleChip role={p.role} partyKind={thread?.partyKind ?? null} />}
                            {orderId && <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-surface-3 text-[11.5px] text-ink-2">{ts('rowOrder')} <bdi dir="ltr" className="ms-1 font-mono">{orderRef(orderId)}</bdi></span>}
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-ink-3 truncate">
                            {p?.companyName && p.name && p.companyName !== p.name ? <>{p.name} · </> : null}
                            {p?.email ? <bdi dir="ltr">{p.email}</bdi> : null}
                        </p>
                        {thread && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {thread.kind === 'order'
                                    ? <span className="text-[12px] text-ink-3">{ts(thread.partyKind === 'supplier' ? 'orderThreadSupplier' : 'orderThreadBuyer')}</span>
                                    : null}
                                <StateChips state={thread.state.state} team={thread.state.assignedTeam} takenOverBy={thread.state.takenOverBy?.name} awaiting={thread.state.awaitingTeam} />
                            </div>
                        )}
                    </div>
                    <div className="hidden sm:flex shrink-0 items-center gap-1.5">
                        {USERS_ROLES.includes(role) && <Link href={`/admin/users/${encodeURIComponent(userId)}`} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12.5px] font-medium text-teal hover:bg-teal-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">{ts('openProfile')} <ArrowUpRight size={13} className="rtl:-scale-x-100" aria-hidden /></Link>}
                        {orderId && ORDER_DETAIL_ROLES.includes(role) && <Link href={`/admin/orders/${encodeURIComponent(orderId)}`} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[12.5px] font-medium text-teal hover:bg-teal-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">{ts('openOrder')} <ArrowUpRight size={13} className="rtl:-scale-x-100" aria-hidden /></Link>}
                    </div>
                </div>
                {thread?.kind === 'support' && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {thread.can.assign && (
                            <div className="flex items-center gap-1.5">
                                <label htmlFor="hq-team" className="sr-only">{ts('routeLabel')}</label>
                                <select id="hq-team" value={team} onChange={(e) => setTeam(e.target.value as Team)} className={cn(selectCls, 'h-8 w-auto text-[12.5px] py-0')} disabled={!thread.state.participantMessages}>
                                    {TEAMS.map((x) => <option key={x} value={x}>{teamLabel(ts, x)}</option>)}
                                </select>
                                <Button size="sm" icon={<Route size={13} />} loading={busy === 'assign'} disabled={!!busy || !thread.state.participantMessages} onClick={() => act('assign')}>{ts('routeAction')}</Button>
                            </div>
                        )}
                        {thread.state.state === 'taken_over'
                            ? <Button size="sm" icon={<Bot size={13} />} loading={busy === 'back'} disabled={!!busy} onClick={() => act('back')}>{ts('handBack')}</Button>
                            : <Button size="sm" variant="primary" icon={<Hand size={13} />} loading={busy === 'take'} disabled={!!busy || !thread.can.takeOver} onClick={() => act('take')}>{ts('takeOver')}</Button>}
                        {!thread.can.takeOver && thread.state.state !== 'taken_over' && <span className="text-[12px] text-ink-3">{ts('takeOverNeedsMessage')}</span>}
                    </div>
                )}
            </header>

            {/* Tabs */}
            <div role="tablist" aria-label={ts('threadTabsAria')} onKeyDown={onTabKey} className="shrink-0 flex items-center gap-5 px-4 border-b border-line">
                {tabs.map((x) => (
                    <button key={x.id} id={`hq-tab-${x.id}`} type="button" role="tab" aria-selected={tab === x.id} aria-controls="hq-tabpanel" tabIndex={tab === x.id ? 0 : -1} onClick={() => setTab(x.id)}
                        className={cn('h-10 -mb-px border-b-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6]',
                            tab === x.id ? 'border-teal text-teal' : 'border-transparent text-ink-3 hover:text-ink')}>{x.label}</button>
                ))}
            </div>

            {/* Body */}
            <div id="hq-tabpanel" role="tabpanel" aria-labelledby={`hq-tab-${tab}`} className="flex-1 min-h-0 flex flex-col">
                {error && !thread ? (
                    <div className="p-4 space-y-3">
                        <ErrorState message={error.message} onRetry={() => load()} />
                        {(error.status === 400 || error.status === 403 || error.status === 404) && <p className="text-[13px] text-ink-3">{ts('threadRefusedHint')}</p>}
                    </div>
                ) : loading && !thread ? (
                    <div className="p-4 space-y-4" aria-busy>{[0, 1, 2].map((i) => <div key={i} className={cn('flex', i % 2 ? 'justify-end' : '')}><Skeleton className="h-14 w-2/3 rounded-xl" /></div>)}</div>
                ) : thread && tab === 'conversation' ? (
                    <>
                        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
                            {thread.truncated && <p className="mb-3 text-center text-[12px] text-ink-3">{ts('threadTruncated')}</p>}
                            {thread.messages.length ? <Messages messages={thread.messages} name={name} /> : (
                                <EmptyState icon={<MessageCircle size={20} />} title={ts('composeTitle', { name })}>
                                    {orderId ? ts('composeOrderBody', { name }) : ts('composeBody', { name })}
                                </EmptyState>
                            )}
                        </div>
                        <div className="shrink-0 border-t border-line bg-surface px-3 sm:px-4 pt-2.5 pb-3">
                            {sendError && <p role="alert" className="mb-2 flex items-start gap-1.5 text-[12.5px] text-[#B91C1C]"><AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />{ts('sendFailedWith', { error: sendError })}</p>}
                            <Composer id="hq-composer" value={draft} onChange={setDraft} onSend={send} canSend={!!draft.trim() && !sending} busy={sending}
                                placeholder={ts('composerPlaceholder', { name })}
                                hint={<Trans text={orderId ? ts('hintOrder', { name }) : thread.state.state === 'taken_over' ? ts('hintTakenOver') : ts('hintAssistant')} tags={{ k: (c) => <Kbd>{c}</Kbd> }} />} />
                        </div>
                    </>
                ) : thread && tab === 'order' && orderId ? (
                    <OrderTab thread={thread} orderId={orderId} canOpen={ORDER_DETAIL_ROLES.includes(role)} />
                ) : thread && tab === 'profile' ? (
                    <ProfileTab thread={thread} canOpen={USERS_ROLES.includes(role)} />
                ) : null}
            </div>
        </section>
    );
}

function Messages({ messages, name }: { messages: ThreadMessage[]; name: string }) {
    const ts = useTs();
    const { dayLabel, clock } = useWhen();
    const out: React.ReactNode[] = [];
    let day = '';
    for (const m of messages) {
        const d = new Date(m.createdAt).toDateString();
        if (d !== day) { day = d; out.push(<DayDivider key={`d-${m.id}`} label={dayLabel(m.createdAt)} />); }
        const time = <time dateTime={new Date(m.createdAt).toISOString()} className="text-ink-4">{clock(m.createdAt)}</time>;
        if (m.from === 'participant') {
            out.push(
                <div key={m.id} className="flex items-start gap-2.5">
                    <span aria-hidden className="w-8 h-8 rounded-lg bg-surface-3 text-ink-3 flex items-center justify-center shrink-0"><UserRound size={15} /></span>
                    <div className="min-w-0 max-w-[min(100%,40rem)]">
                        <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] leading-5"><span className="font-semibold text-heading">{name}</span>{time}{!m.isRead && <span className="text-[11.5px] font-medium text-[#B45309]">{ts('unreadTag')}</span>}</p>
                        <div className="mt-1 rounded-xl rounded-ss-sm bg-surface ring-1 ring-line px-3.5 py-2 text-[14px] leading-[1.55] text-ink">
                            <Img url={m.imageUrl} />
                            {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                        </div>
                    </div>
                </div>,
            );
        } else if (m.from === 'assistant') {
            const { body, links } = splitLinks(m.content || '');
            out.push(
                <div key={m.id} className="flex flex-col items-end">
                    <p className="flex items-center gap-2 text-[12.5px] leading-5"><span className="font-semibold text-heading">{ts('authorAssistant')}</span>{time}</p>
                    <div className="mt-1 flex items-start gap-2 flex-row-reverse">
                        <AtlantisMark size={28} />
                        <div className="max-w-[min(85%,34rem)] rounded-xl rounded-se-sm bg-surface-2 px-3.5 py-2 text-[14px] leading-[1.55] text-ink">
                            <RichText text={body} />
                            {links.length > 0 && <p className="mt-1.5 text-[12px] text-ink-3">{ts('assistantLinks', { links: links.map((l) => l.label).join(', ') })}</p>}
                        </div>
                    </div>
                </div>,
            );
        } else {
            out.push(
                <div key={m.id} className="flex flex-col items-end">
                    <p className="flex items-center gap-2 text-[12.5px] leading-5"><span className="font-semibold text-heading">{m.senderName || ts('authorTeam')}</span><span className="text-[11px] font-semibold uppercase tracking-wide text-teal">{ts('teamBadge')}</span>{time}</p>
                    <div className="mt-1 max-w-[min(85%,34rem)] rounded-xl rounded-se-sm bg-heading text-white px-3.5 py-2 text-[14px] leading-[1.55]">
                        <Img url={m.imageUrl} />
                        {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    </div>
                </div>,
            );
        }
    }
    return <div className="space-y-4">{out}</div>;
}

function Img({ url }: { url: string | null }) {
    const ts = useTs();
    if (!url) return null;
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block mb-1.5 w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={ts('attachmentAlt')} className="max-h-56 rounded-lg ring-1 ring-line bg-white" loading="lazy" />
        </a>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 border-b border-line last:border-0">
            <dt className="text-[12.5px] text-ink-3">{label}</dt>
            <dd className="text-[13.5px] text-ink min-w-0">{children}</dd>
        </div>
    );
}

/** Stored tier → quantity label ('carton' is the stored name for a case). */
const unitKey = (u: string | null) => (u === 'carton' || u === 'case' ? 'case' : u === 'pallet' || u === 'truck' ? u : 'unit');

function OrderTab({ thread, orderId, canOpen }: { thread: Thread; orderId: string; canOpen: boolean }) {
    const ts = useTs();
    const { t, fmt } = useLanguage();
    const o = thread.order;
    const tl = React.useCallback((k: string, v?: Record<string, string | number>) => t('adminOrders', k, v), [t]);
    if (!o) return <div className="p-4"><ErrorState message={ts('orderMissing')} /></div>;
    return (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            <dl>
                <Row label={ts('orderRef')}><bdi dir="ltr" className="font-mono">{orderRef(o.id)}</bdi></Row>
                <Row label={ts('orderStatus')}><StatusBadge status={o.status} kind="order" /></Row>
                <Row label={ts('orderPayment')}><PaymentBadge value={o.paymentStatus} tl={tl} /></Row>
                <Row label={ts('orderPlaced')}>{fmt.date(o.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</Row>
                {o.buyer && <Row label={ts('orderBuyer')}>{o.buyer.companyName || o.buyer.name}</Row>}
            </dl>
            <h3 className="mt-5 text-[13px] font-semibold text-heading">{ts('orderLines', { count: o.lines.length })}</h3>
            <ul className="mt-2 divide-y divide-line rounded-lg ring-1 ring-line">
                {o.lines.map((l) => (
                    <li key={l.id} className="px-3 py-2 flex items-center gap-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate text-ink">{l.name || ts('deletedProduct')}</span>
                        {l.fromParty && <span className="shrink-0 text-[11.5px] font-medium text-teal">{ts('thisSupplier')}</span>}
                        <span className="shrink-0 tabular-nums text-ink-2">{ts(`qty_${unitKey(l.unit)}`, { count: l.quantity })}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-ink-3">{ts('orderPricesElsewhere')}</p>
            {canOpen && <Link href={`/admin/orders/${encodeURIComponent(orderId)}`} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-teal hover:underline">{ts('openOrder')} <ExternalLink size={13} aria-hidden /></Link>}
        </div>
    );
}

function ProfileTab({ thread, canOpen }: { thread: Thread; canOpen: boolean }) {
    const ts = useTs();
    const { fmt } = useLanguage();
    const p = thread.participant;
    const actionLabel = (a: string, d: any) => a === 'SUPPORT_ASSIGN_TEAM' ? ts('logAssigned', { team: teamLabel(ts, String(d?.team || '')) }) : a === 'SUPPORT_TAKE_OVER' ? ts('logTakeOver') : a === 'SUPPORT_HAND_BACK' ? ts('logHandBack') : a;
    return (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            <dl>
                <Row label={ts('profileName')}>{p.name}</Row>
                {p.companyName && <Row label={ts('profileCompany')}>{p.companyName}</Row>}
                <Row label={ts('profileEmail')}><bdi dir="ltr">{p.email}</bdi></Row>
                <Row label={ts('profileRole')}><RoleChip role={p.role} partyKind={thread.partyKind ?? null} /></Row>
                <Row label={ts('profileAccount')}><AccountStatusBadge status={p.status} /></Row>
                <Row label={ts('profileKyc')}><KycBadge status={p.kycStatus} /></Row>
                {p.country && <Row label={ts('profileCountry')}>{p.country}</Row>}
                <Row label={ts('profileSince')}>{fmt.date(p.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</Row>
            </dl>
            {canOpen && <Link href={`/admin/users/${encodeURIComponent(p.id)}`} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-teal hover:underline">{ts('openProfile')} <ExternalLink size={13} aria-hidden /></Link>}
            {thread.kind === 'support' && (
                <>
                    <h3 className="mt-6 text-[13px] font-semibold text-heading">{ts('historyTitle')}</h3>
                    {thread.history.length ? (
                        <ol className="mt-2 space-y-2">
                            {thread.history.map((h) => (
                                <li key={h.id} className="flex items-start gap-2 text-[13px]">
                                    <RotateCcw size={13} className="mt-1 text-ink-4 shrink-0" aria-hidden />
                                    <span className="min-w-0"><span className="text-ink">{actionLabel(h.action, h.details)}</span> <span className="text-ink-3">· {h.by?.name || ts('unknownUser')} · {fmt.date(h.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
                                </li>
                            ))}
                        </ol>
                    ) : <p className="mt-1 text-[12.5px] text-ink-3">{ts('historyEmpty')}</p>}
                </>
            )}
        </div>
    );
}
