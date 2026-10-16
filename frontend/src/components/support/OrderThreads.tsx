'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ExternalLink, MessageSquarePlus, Package, RotateCcw, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { fetchMyOrders } from '@/lib/buyer-orders';
import { supplierApi } from '@/lib/supplier-api';
import { cn } from '@/lib/utils';
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';
import { DayDivider, IncomingMessage, OutgoingMessage, orderRef, useWhen } from './messages';
import { Composer, Kbd } from './Composer';

/**
 * Order conversations: one thread per order between you and the Atlantis team
 * (buyers and suppliers each see only their own thread). Everything shown is
 * read from the server; nothing is sent without the server accepting it.
 */
interface Chat { orderId: string; status: string; createdAt: string; firstProduct: string | null; firstImage: string | null; lastMessage: string | null; lastMessageAt: string | null; lastFromStaff?: boolean }
interface Msg { id: string; content: string | null; createdAt: string; senderId: string; sender?: { id: string; name: string; role: string } | null; state?: 'sending' | 'failed-send'; error?: string }
interface OrderOption { id: string; createdAt: string; status: string; label: string }

const STAFF = ['ADMIN', 'SUPPORT', 'OWNER', 'LOGISTICS', 'DEVELOPER'];
/** Server order status → dictionary key and pill style (unknown statuses show the raw value). */
const STATUS: Record<string, { label: string; cls: string }> = {
    PENDING: { label: 'statusPending', cls: 'bg-[#FFFBEB] text-[#B45309] ring-[#FDE68A]' },
    PAID: { label: 'statusPaid', cls: 'bg-teal-soft text-teal ring-transparent' },
    PROCESSING: { label: 'statusProcessing', cls: 'bg-teal-soft text-teal ring-transparent' },
    SHIPPED: { label: 'statusShipped', cls: 'bg-[#EFF6FF] text-[#1E3A8A] ring-[#BFDBFE]' },
    DELIVERED: { label: 'statusDelivered', cls: 'bg-[#ECFDF5] text-[#047857] ring-[#A7F3D0]' },
    CANCELLED: { label: 'statusCancelled', cls: 'bg-surface-3 text-ink-3 ring-line' },
};
const StatusPill = ({ status }: { status: string }) => {
    const { t } = useLanguage();
    const s = STATUS[status];
    return <span className={cn('inline-flex items-center h-6 px-2 rounded-md text-[12px] font-medium ring-1 whitespace-nowrap', s ? s.cls : 'bg-surface-3 text-ink-2 ring-line')}>{s ? t('support', s.label) : status}</span>;
};

export function OrderThreads({ role, userId, onCount }: { role: 'supplier' | 'buyer'; userId: string | null; onCount?: (n: number) => void }) {
    const [chats, setChats] = React.useState<Chat[] | null>(null);
    const [listError, setListError] = React.useState(false);
    const [active, setActive] = React.useState<string | null>(null);
    const [q, setQ] = React.useState('');
    const [picking, setPicking] = React.useState(false);
    const [options, setOptions] = React.useState<OrderOption[] | null>(null);
    const { t, fmt } = useLanguage();
    const { shortWhen } = useWhen();

    const loadList = React.useCallback(async () => {
        setListError(false);
        try {
            const res = await apiFetch('/chat/my-order-chats', { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const d = await res.json();
            const list: Chat[] = Array.isArray(d) ? d : [];
            setChats(list); onCount?.(list.length);
        } catch { setListError(true); setChats((c) => c ?? []); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { loadList(); }, [loadList]);

    // Orders you can start a conversation about (your own, from the server).
    const openPicker = async () => {
        setPicking(true);
        if (options) return;
        try {
            if (role === 'supplier') {
                const list = await supplierApi.orders();
                setOptions((list || []).slice(0, 40).map((o: any) => ({ id: o.id, createdAt: o.createdAt, status: o.status, label: o.items?.[0]?.name || t('support', 'orderFallback') })));
            } else {
                const { data } = await fetchMyOrders(40);
                setOptions(data.map((o) => ({ id: o.id, createdAt: o.createdAt, status: o.status, label: o.items[0]?.product?.name || o.items[0]?.productNameSnapshot || t('support', 'orderFallback') })));
            }
        } catch { setOptions([]); }
    };

    const term = q.trim().toLowerCase().replace('#', '');
    const shown = (chats || []).filter((c) => !term || c.orderId.toLowerCase().includes(term) || (c.firstProduct || '').toLowerCase().includes(term));
    const activeChat = chats?.find((c) => c.orderId === active) || null;
    const activeOption = options?.find((o) => o.id === active) || null;

    return (
        <div className="flex-1 min-w-0 min-h-0 grid grid-cols-1 md:grid-cols-[19rem_minmax(0,1fr)]">
            {/* List */}
            <div className={cn('min-w-0 min-h-0 flex-col border-line md:border-e', active ? 'hidden md:flex' : 'flex')}>
                <div className="shrink-0 p-3 border-b border-line space-y-2">
                    <label className="relative block">
                        <span className="sr-only">{t('support', 'searchLabel')}</span>
                        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('support', 'searchPlaceholder')} className="w-full h-10 ps-9 pe-3 rounded-lg ring-1 ring-inset ring-line-strong bg-surface text-[14px] text-ink placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-[#2EC4B6]" />
                    </label>
                    <button type="button" onClick={() => (picking ? setPicking(false) : openPicker())} aria-expanded={picking}
                        className="w-full h-10 rounded-lg ring-1 ring-line-strong text-[13.5px] font-semibold text-heading inline-flex items-center justify-center gap-2 hover:ring-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                        <MessageSquarePlus size={16} aria-hidden /> {picking ? t('support', 'close') : t('support', 'newConversation')}
                    </button>
                </div>

                {picking ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <p className="px-4 pt-3 pb-1 text-small text-ink-3">{t('support', 'chooseOrder')}</p>
                        {!options ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-surface-2 animate-pulse motion-reduce:animate-none" />)}</div>
                            : options.length === 0 ? <p className="px-4 py-6 text-[14px] text-ink-3">{t('support', 'noOrders')}</p>
                                : (
                                    <ul className="divide-y divide-line">
                                        {options.map((o) => (
                                            <li key={o.id}><button type="button" onClick={() => { setActive(o.id); setPicking(false); }}
                                                className="w-full text-start px-4 py-3 hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2">
                                                <span className="flex items-center justify-between gap-2"><span dir="ltr" className="font-mono text-[13px] font-semibold text-heading">{orderRef(o.id)}</span><StatusPill status={o.status} /></span>
                                                <span className="mt-0.5 block truncate text-[13px] text-ink-3">{o.label} · {fmt.date(o.createdAt, { day: 'numeric', month: 'short' })}</span>
                                            </button></li>
                                        ))}
                                    </ul>
                                )}
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {listError && <p className="m-3 flex items-center gap-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#991B1B]"><AlertCircle size={14} aria-hidden /> {t('support', 'listError')} <button type="button" onClick={loadList} className="font-semibold underline">{t('support', 'retry')}</button></p>}
                        {!chats ? <div className="p-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-surface-2 animate-pulse motion-reduce:animate-none" />)}</div>
                            : shown.length === 0 ? (
                                <div className="px-5 py-10 text-center">
                                    <span className="mx-auto w-11 h-11 rounded-xl bg-surface-2 text-ink-4 flex items-center justify-center"><Package size={20} aria-hidden /></span>
                                    <p className="mt-3 text-[14px] font-semibold text-heading">{chats.length ? t('support', 'noMatch') : t('support', 'noThreads')}</p>
                                    <p className="mt-1 text-[13px] text-ink-3">{chats.length ? t('support', 'noMatchHint') : t('support', role === 'supplier' ? 'noThreadsSupplier' : 'noThreadsBuyer')}</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-line" aria-label={t('support', 'tabOrders')}>
                                    {shown.map((c) => {
                                        const on = c.orderId === active;
                                        return (
                                            <li key={c.orderId}>
                                                <button type="button" onClick={() => setActive(c.orderId)} aria-current={on ? 'true' : undefined}
                                                    className={cn('w-full text-start px-4 py-3 transition-colors duration-150 focus-visible:outline-none focus-visible:bg-surface-2', on ? 'bg-teal-soft/60' : 'hover:bg-surface-2')}>
                                                    <span className="flex items-center justify-between gap-2">
                                                        <span dir="ltr" className="font-mono text-[13px] font-semibold text-heading">{orderRef(c.orderId)}</span>
                                                        <span className="text-[12px] text-ink-4">{c.lastMessageAt ? shortWhen(c.lastMessageAt) : ''}</span>
                                                    </span>
                                                    {c.firstProduct && <span className="mt-0.5 block truncate text-[13px] font-medium text-ink">{c.firstProduct}</span>}
                                                    <span className="mt-0.5 flex items-center gap-2">
                                                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">{c.lastFromStaff ? t('support', 'lastFromAtlantis') : t('support', 'lastFromYou')} {c.lastMessage || '—'}</span>
                                                        <StatusPill status={c.status} />
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                    </div>
                )}
            </div>

            {/* Thread */}
            <div className={cn('min-w-0 min-h-0 flex-col', active ? 'flex' : 'hidden md:flex')}>
                {active ? (
                    <Thread key={active} orderId={active} role={role} userId={userId}
                        meta={activeChat ? { status: activeChat.status, product: activeChat.firstProduct } : activeOption ? { status: activeOption.status, product: activeOption.label } : null}
                        onBack={() => setActive(null)} onSent={loadList} />
                ) : (
                    <div className="flex-1 flex items-center justify-center p-8 text-center">
                        <div>
                            <span className="mx-auto w-12 h-12 rounded-xl bg-surface-2 text-ink-4 flex items-center justify-center"><Package size={22} aria-hidden /></span>
                            <p className="mt-3 text-[15px] font-semibold text-heading">{t('support', 'selectConversation')}</p>
                            <p className="mt-1 max-w-xs text-[13.5px] text-ink-3">{t('support', 'selectConversationHint')}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Thread({ orderId, role, userId, meta, onBack, onSent }: { orderId: string; role: 'supplier' | 'buyer'; userId: string | null; meta: { status: string; product: string | null } | null; onBack: () => void; onSent: () => void }) {
    const [msgs, setMsgs] = React.useState<Msg[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [draft, setDraft] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLTextAreaElement>(null);
    const { t } = useLanguage();
    const { dayLabel } = useWhen();

    const load = React.useCallback(async () => {
        try {
            const res = await apiFetch(`/chat/order/${orderId}/messages`, { cache: 'no-store' });
            const d = await res.json().catch(() => null);
            if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : t('support', 'threadLoadError'));
            setMsgs((cur) => { const pending = (cur || []).filter((m) => m.state); return [...(Array.isArray(d) ? d : []), ...pending]; });
            setError(null);
        } catch (e: any) { setError(e.message); setMsgs((m) => m ?? []); }
    }, [orderId, t]);
    React.useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000); return () => clearInterval(t); }, [load]);
    React.useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs?.length]);

    const send = async (textIn?: string, retryId?: string) => {
        const text = (textIn ?? draft).trim();
        if (!text || busy) return;
        const tempId = retryId || `tmp-${Date.now()}`;
        setMsgs((cur) => [...(cur || []).filter((m) => m.id !== tempId), { id: tempId, content: text, createdAt: new Date().toISOString(), senderId: userId || 'me', state: 'sending' }]);
        if (!retryId) setDraft('');
        setBusy(true);
        try {
            const res = await apiFetch(`/chat/order/${orderId}/send`, { method: 'POST', body: JSON.stringify({ content: text }) });
            const d = await res.json().catch(() => null);
            if (!res.ok) throw new Error(typeof d?.message === 'string' ? d.message : t('support', 'threadNotSent'));
            setMsgs((cur) => [...(cur || []).filter((m) => m.id !== tempId), d]);
            onSent();
        } catch (e: any) {
            setMsgs((cur) => (cur || []).map((m) => (m.id === tempId ? { ...m, state: 'failed-send', error: e.message } : m)));
        } finally { setBusy(false); inputRef.current?.focus(); }
    };

    const rows: React.ReactNode[] = [];
    let last = '';
    for (const m of msgs || []) {
        const d = dayLabel(m.createdAt);
        if (d !== last) { rows.push(<DayDivider key={`d-${m.id}`} label={d} />); last = d; }
        const mine = m.state || m.senderId === userId;
        const staff = STAFF.includes(String(m.sender?.role || '').toUpperCase());
        rows.push(mine
            ? <OutgoingMessage key={m.id} text={m.content || ''} at={m.createdAt} state={m.state} error={m.error} onRetry={m.state ? () => send(m.content || '', m.id) : undefined} />
            : <IncomingMessage key={m.id} from="team" name={staff ? t('support', 'atlantisTeam') : t('support', 'participant')} text={m.content || ''} at={m.createdAt} />);
    }
    const orderHref = role === 'supplier' ? `/supplier/orders?view=all&q=${orderId.slice(-8).toUpperCase()}` : `/dashboard/customer/orders/${orderId}`;

    return (
        <>
            <header className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-line">
                <button type="button" onClick={onBack} aria-label={t('support', 'backAria')} className="md:hidden w-9 h-9 -ms-1 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2"><ArrowLeft size={18} className="rtl:rotate-180" /></button>
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-heading"><Trans text={t('support', 'orderTitle', { ref: orderRef(orderId) })} tags={{ ref: (c) => <bdi dir="ltr" className="font-mono">{c}</bdi> }} /></span>
                        {meta && <StatusPill status={meta.status} />}
                    </p>
                    <p className="truncate text-[13px] text-ink-3">{meta?.product ? t('support', 'withTeamProduct', { product: meta.product }) : t('support', 'withTeam')}</p>
                </div>
                <Link href={orderHref} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg ring-1 ring-line text-[13px] font-semibold text-heading hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                    <span className="hidden sm:inline">{t('support', 'viewOrder')}</span><ExternalLink size={14} aria-hidden /><span className="sr-only sm:hidden">{t('support', 'viewOrder')}</span>
                </Link>
            </header>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-label={t('support', 'threadAria', { ref: orderRef(orderId) })}>
                <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-5">
                    {error && <p className="flex flex-wrap items-center gap-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[13.5px] text-[#991B1B]"><AlertCircle size={15} aria-hidden /> {error} <button type="button" onClick={load} className="inline-flex items-center gap-1 font-semibold underline"><RotateCcw size={13} aria-hidden /> {t('support', 'retry')}</button></p>}
                    {!msgs ? <div className="space-y-4">{[60, 45].map((w, i) => <div key={i} className="h-12 rounded-xl bg-surface-2 animate-pulse motion-reduce:animate-none" style={{ width: `${w}%` }} />)}</div>
                        : msgs.length === 0 && !error ? (
                            <p className="rounded-xl bg-surface-2 px-4 py-3 text-[14px] text-ink-2">{t('support', role === 'supplier' ? 'emptyThreadSupplier' : 'emptyThreadBuyer')}</p>
                        ) : rows}
                </div>
            </div>
            <div className="shrink-0 border-t border-line bg-surface px-3 sm:px-5 py-3">
                <div className="mx-auto w-full max-w-3xl">
                    <Composer id={`order-input-${orderId}`} ref={inputRef} value={draft} onChange={setDraft} onSend={() => send()}
                        canSend={!busy && !!draft.trim()} busy={busy} placeholder={t('support', 'placeholderOrder')}
                        hint={<Trans text={t('support', 'hintOrder')} tags={{ k: (c) => <Kbd>{c}</Kbd> }} />} />
                </div>
            </div>
        </>
    );
}
