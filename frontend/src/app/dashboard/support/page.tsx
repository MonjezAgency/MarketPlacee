'use client';

import * as React from 'react';
import { SupportChat } from '@/components/chat/SupportChat';
import OrderChatModal from '@/components/chat/OrderChatModal';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { MessageCircle, Headphones, ShieldCheck, Clock, Zap, ShoppingBag, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type Tab = 'general' | 'orders';

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

export default function BuyerSupportPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = React.useState<Tab>('general');
    const [orderChats, setOrderChats] = React.useState<OrderChat[]>([]);
    const [loadingChats, setLoadingChats] = React.useState(false);
    const [openOrderId, setOpenOrderId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (activeTab === 'orders') {
            setLoadingChats(true);
            apiFetch('/chat/my-order-chats')
                .then(d => setOrderChats(Array.isArray(d) ? d : []))
                .catch(() => setOrderChats([]))
                .finally(() => setLoadingChats(false));
        }
    }, [activeTab]);

    const fmtDate = (s: string | null) => {
        if (!s) return '';
        return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    };

    const openChat = orderChats.find(o => o.orderId === openOrderId);

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            <header className="h-24 border-b border-line bg-surface px-8 flex items-center justify-between sticky top-0 z-40">
                <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-heading tracking-tight">Support Center</h1>
                        <p className="text-[10px] text-ink-4 font-bold uppercase tracking-[0.2em] mt-1">Direct communication with Atlantis HQ</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-4 py-2 bg-teal-50 rounded-xl border border-teal-100">
                            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                            <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider">Agents Online</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-8 py-10">
                {/* Tab switcher */}
                <div className="flex gap-2 mb-8">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={cn(
                            'flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[13px] transition-all',
                            activeTab === 'general'
                                ? 'bg-[#0B1F3A] text-white shadow-sm'
                                : 'bg-surface border border-line text-ink-2 hover:border-slate-300',
                        )}
                    >
                        <Headphones size={15} />
                        General Support
                    </button>
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={cn(
                            'flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[13px] transition-all',
                            activeTab === 'orders'
                                ? 'bg-[#0B1F3A] text-white shadow-sm'
                                : 'bg-surface border border-line text-ink-2 hover:border-slate-300',
                        )}
                    >
                        <ShoppingBag size={15} />
                        Order Conversations
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'general' ? (
                        <motion.div
                            key="general"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                        >
                            {/* Chat Area */}
                            <div className="lg:col-span-8">
                                <div className="bg-surface border border-line rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col h-[700px]">
                                    <div className="px-6 py-4 border-b border-line bg-slate-50/50 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-[#0B1F3A] flex items-center justify-center text-white">
                                                <Headphones size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-ink">Atlantis Official Support</p>
                                                <p className="text-[10px] text-ink-4 font-bold uppercase tracking-tight">Verified Corporate Account</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-line rounded-full text-[10px] font-bold text-ink-3">
                                            <Clock size={12} />
                                            Avg. Response: 15m
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <SupportChat isSupport={false} isLight={true} />
                                    </div>
                                </div>
                            </div>

                            {/* Sidebar Info */}
                            <div className="lg:col-span-4 space-y-6">
                                <div className="bg-surface border border-line rounded-2xl p-8 space-y-6">
                                    <h3 className="text-xs font-bold text-ink uppercase tracking-widest border-b border-line pb-4">Support Protocol</h3>
                                    <div className="space-y-6">
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                                                <ShieldCheck size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-ink">Secure Channel</p>
                                                <p className="text-[11px] text-ink-3 font-medium leading-relaxed mt-1">
                                                    All conversations are encrypted and monitored for quality assurance.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-teal-soft flex items-center justify-center text-teal shrink-0">
                                                <Zap size={20} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-ink">Instant Escalation</p>
                                                <p className="text-[11px] text-ink-3 font-medium leading-relaxed mt-1">
                                                    Type "AGENT" at any time to bypass the AI and speak with a human.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t border-line">
                                        <p className="text-[10px] font-bold text-ink-4 uppercase tracking-widest mb-4">Common Topics</p>
                                        <div className="flex flex-wrap gap-2">
                                            {['Shipping Rates', 'Payment Terms', 'Bulk Orders', 'Product Sourcing'].map(tag => (
                                                <span key={tag} className="px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-[10px] font-bold text-ink-2">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-gradient-to-br from-[#0B1F3A] to-[#152D4F] rounded-2xl p-8 text-white relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-8 opacity-10">
                                        <MessageCircle size={120} />
                                    </div>
                                    <div className="relative z-10">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-teal-400 mb-4">Direct Access</p>
                                        <h4 className="text-xl font-bold tracking-tight leading-tight mb-4">
                                            Need immediate business assistance?
                                        </h4>
                                        <p className="text-[11px] text-slate-300 font-medium leading-relaxed mb-6">
                                            Our logistics and procurement teams are standing by to assist with your wholesale needs.
                                        </p>
                                        <button className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-white rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all shadow-xl shadow-teal-500/20">
                                            Speak to an Expert
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="orders"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                        >
                            <div className="bg-surface border border-line rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">
                                <div className="px-6 py-5 border-b border-line bg-slate-50/50 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-[#0B1F3A] flex items-center justify-center text-white">
                                        <ShoppingBag size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-ink">Order Conversations</p>
                                        <p className="text-[10px] text-ink-4 font-bold uppercase tracking-tight">Messages from Atlantis team about your orders</p>
                                    </div>
                                </div>

                                {loadingChats ? (
                                    <div className="py-20 flex justify-center">
                                        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : orderChats.length === 0 ? (
                                    <div className="py-20 flex flex-col items-center gap-3 text-center px-8">
                                        <ShoppingBag size={36} className="text-slate-200" />
                                        <p className="text-[15px] font-bold text-ink-3">No order conversations yet</p>
                                        <p className="text-[12px] text-ink-4 max-w-sm">
                                            When Atlantis support contacts you about a specific order (shipping, delivery, documents), it will appear here — separate from general support.
                                        </p>
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-slate-100">
                                        {orderChats.map(chat => (
                                            <li key={chat.orderId}>
                                                <button
                                                    onClick={() => setOpenOrderId(chat.orderId)}
                                                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-surface-2 transition-colors text-left"
                                                >
                                                    {chat.firstImage ? (
                                                        <img
                                                            src={chat.firstImage}
                                                            alt=""
                                                            className="w-12 h-12 rounded-xl object-contain bg-surface-3 shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center shrink-0">
                                                            <ShoppingBag size={20} className="text-slate-300" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <p className="text-[13px] font-bold text-ink truncate">
                                                                {chat.firstProduct ?? `Order #${chat.orderId.slice(-8).toUpperCase()}`}
                                                            </p>
                                                            <span className={cn(
                                                                'shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full',
                                                                chat.status === 'DELIVERED' ? 'bg-teal-50 text-teal-700' :
                                                                chat.status === 'SHIPPED' ? 'bg-blue-50 text-blue-700' :
                                                                'bg-amber-50 text-amber-700',
                                                            )}>
                                                                {chat.status}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-ink-4 truncate">
                                                            {chat.lastMessage ?? 'New conversation started'}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <p className="text-[11px] text-ink-4 mb-1">{fmtDate(chat.lastMessageAt)}</p>
                                                        <ChevronRight size={14} className="text-slate-300 ml-auto" />
                                                    </div>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Order chat modal */}
            <AnimatePresence>
                {openOrderId && openChat && (
                    <OrderChatModal
                        orderId={openOrderId}
                        orderTotal={openChat.total}
                        isAdmin={false}
                        onClose={() => setOpenOrderId(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
