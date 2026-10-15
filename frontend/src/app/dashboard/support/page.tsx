'use client';

import * as React from 'react';
import OrderChatModal from '@/components/chat/OrderChatModal';
import SupportAssistant from '@/components/support/SupportAssistant';
import { apiFetch } from '@/lib/api';
import { ShoppingBag, ChevronRight, MessageSquare } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type Tab = 'assistant' | 'orders';

interface OrderChat {
    orderId: string;
    status: string;
    total: number;
    createdAt: string;
    firstProduct: string | null;
    firstImage: string | null;
    lastMessage: string | null;
    lastMessageAt: string | null;
    lastMessageSender: string | null;
}

/** Buyer support: the assistant (with account context), plus order-specific threads with the Atlantis team. */
export default function BuyerSupportPage() {
    const [tab, setTab] = React.useState<Tab>('assistant');
    const [orderChats, setOrderChats] = React.useState<OrderChat[]>([]);
    const [loadingChats, setLoadingChats] = React.useState(false);
    const [openOrderId, setOpenOrderId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (tab !== 'orders') return;
        setLoadingChats(true);
        apiFetch('/chat/my-order-chats')
            .then((r) => (r.ok ? r.json() : []))
            .then((d) => setOrderChats(Array.isArray(d) ? d : []))
            .catch(() => setOrderChats([]))
            .finally(() => setLoadingChats(false));
    }, [tab]);

    const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');
    const openChat = orderChats.find((o) => o.orderId === openOrderId);

    return (
        <div className="min-h-screen bg-surface text-start">
            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
                <div role="tablist" aria-label="Support" className="inline-flex rounded-lg bg-surface-2 ring-1 ring-line p-0.5 mb-5">
                    {([['assistant', 'Assistant', MessageSquare], ['orders', 'Order conversations', ShoppingBag]] as const).map(([k, label, Icon]) => (
                        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                            className={cn('h-8 px-3.5 rounded-md text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors', tab === k ? 'bg-surface text-heading shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink')}>
                            <Icon size={14} /> {label}
                        </button>
                    ))}
                </div>

                {tab === 'assistant' ? <SupportAssistant /> : (
                    <section className="rounded-2xl ring-1 ring-line bg-surface overflow-hidden">
                        <div className="px-5 py-4 border-b border-line">
                            <h1 className="text-[18px] font-bold text-heading">Order conversations</h1>
                            <p className="text-[13px] text-ink-3">Messages with the Atlantis team about a specific order.</p>
                        </div>
                        {loadingChats ? (
                            <div className="py-16 flex justify-center"><div className="w-7 h-7 border-2 border-teal border-t-transparent rounded-full animate-spin" /></div>
                        ) : orderChats.length === 0 ? (
                            <div className="py-16 px-6 text-center">
                                <ShoppingBag size={28} className="mx-auto text-ink-4" />
                                <p className="mt-2 text-[14px] font-semibold text-heading">No order conversations yet</p>
                                <p className="mt-1 text-[13px] text-ink-3 max-w-sm mx-auto">When the Atlantis team writes to you about an order (shipping, delivery, documents), it appears here.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-line">
                                {orderChats.map((chat) => (
                                    <li key={chat.orderId}>
                                        <button onClick={() => setOpenOrderId(chat.orderId)} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2 transition-colors text-start">
                                            {chat.firstImage
                                                // eslint-disable-next-line @next/next/no-img-element
                                                ? <img src={chat.firstImage} alt="" className="w-11 h-11 rounded-lg object-contain bg-surface-2 ring-1 ring-line shrink-0" />
                                                : <div className="w-11 h-11 rounded-lg bg-surface-2 flex items-center justify-center shrink-0"><ShoppingBag size={18} className="text-ink-4" /></div>}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[13.5px] font-semibold text-ink truncate">{chat.firstProduct ?? `Order #${chat.orderId.slice(-8).toUpperCase()}`}</p>
                                                    <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-2 ring-1 ring-line text-ink-2">{chat.status}</span>
                                                </div>
                                                <p className="text-[12.5px] text-ink-3 truncate">{chat.lastMessage ?? 'New conversation'}</p>
                                            </div>
                                            <div className="shrink-0 text-end">
                                                <p className="text-[12px] text-ink-4">{fmtDate(chat.lastMessageAt)}</p>
                                                <ChevronRight size={14} className="text-ink-4 ms-auto" />
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
            </main>

            <AnimatePresence>
                {openOrderId && openChat && <OrderChatModal orderId={openOrderId} orderTotal={openChat.total} isAdmin={false} onClose={() => setOpenOrderId(null)} />}
            </AnimatePresence>
        </div>
    );
}
