'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageSquare, Loader2, ShoppingBag, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface OrderMessage {
    id: string;
    content: string;
    senderId: string;
    sender: { id: string; name: string; role: string; avatar?: string };
    createdAt: string;
}

interface Props {
    orderId: string;
    orderTotal?: number;
    customerName?: string;
    /** If true — shown from admin side; false — shown from customer side */
    isAdmin?: boolean;
    onClose: () => void;
}

const STAFF_ROLES = new Set(['ADMIN', 'OWNER', 'SUPPORT', 'LOGISTICS', 'MODERATOR']);

export default function OrderChatModal({ orderId, orderTotal, customerName, isAdmin = false, onClose }: Props) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<OrderMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };

    const fetchMessages = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch(`/chat/order/${orderId}/messages`);
            setMessages(Array.isArray(data) ? data : []);
        } catch { /* silent fail on poll */ } finally {
            if (!silent) setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchMessages();
        // Poll every 8s for new messages
        pollRef.current = setInterval(() => fetchMessages(true), 8000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchMessages]);

    useEffect(() => { scrollToBottom(); }, [messages]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || sending) return;
        setSending(true);
        setInput('');
        try {
            await apiFetch(`/chat/order/${orderId}/send`, {
                method: 'POST',
                body: JSON.stringify({ content: text }),
            });
            await fetchMessages(true);
        } catch {
            setInput(text); // restore on error
        } finally {
            setSending(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const isStaff = (role: string) => STAFF_ROLES.has(role?.toUpperCase() || '');
    const isMine = (msg: OrderMessage) => msg.senderId === user?.id;
    const isStaffMsg = (msg: OrderMessage) => isStaff(msg.sender?.role || '');

    const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                className="w-full sm:w-[480px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '90vh', height: 600 }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 bg-[#0B1F3A] shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <ShoppingBag size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-[14px] leading-tight">
                            {isAdmin ? `Chat with ${customerName || 'Customer'}` : 'Order Support'}
                        </p>
                        <p className="text-white/60 text-[11px] font-mono truncate">
                            Order #{orderId.slice(-8).toUpperCase()}
                            {orderTotal ? ` · €${orderTotal.toFixed(2)}` : ''}
                        </p>
                    </div>
                    <button
                        onClick={() => fetchMessages(true)}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors mr-1"
                        title="Refresh"
                    >
                        <RefreshCw size={14} className="text-white" />
                    </button>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                    >
                        <X size={16} className="text-white" />
                    </button>
                </div>

                {/* Context banner */}
                <div className="px-5 py-2 bg-teal-50 border-b border-teal-100 shrink-0">
                    <p className="text-[11px] text-teal-700 font-semibold">
                        🔒 This is a private conversation about this order only. Atlantis support team can see this chat.
                    </p>
                </div>

                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F8FAFC]">
                    {loading ? (
                        <div className="flex justify-center items-center h-full">
                            <Loader2 size={24} className="animate-spin text-slate-300" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                            <MessageSquare size={32} className="text-slate-200" />
                            <p className="text-[13px] text-slate-400 font-medium">
                                {isAdmin
                                    ? 'Start a conversation with this customer about their order.'
                                    : 'No messages yet. Our team will contact you about this order here.'}
                            </p>
                        </div>
                    ) : (
                        messages.map((msg, i) => {
                            const mine = isMine(msg);
                            const staff = isStaffMsg(msg);
                            const showDate = i === 0 || fmtDate(msg.createdAt) !== fmtDate(messages[i - 1].createdAt);

                            return (
                                <div key={msg.id}>
                                    {showDate && (
                                        <div className="flex justify-center my-2">
                                            <span className="text-[10px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-semibold">
                                                {fmtDate(msg.createdAt)}
                                            </span>
                                        </div>
                                    )}
                                    <div className={cn('flex gap-2', mine ? 'flex-row-reverse' : 'flex-row')}>
                                        {/* Avatar */}
                                        {!mine && (
                                            <div className={cn(
                                                'w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5',
                                                staff ? 'bg-[#0B1F3A]' : 'bg-teal-500',
                                            )}>
                                                {(msg.sender?.name || '?')[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div className={cn('flex flex-col gap-0.5 max-w-[80%]', mine ? 'items-end' : 'items-start')}>
                                            {!mine && (
                                                <span className="text-[10px] text-slate-400 font-bold px-1">
                                                    {staff ? '🏢 Atlantis Support' : msg.sender?.name}
                                                </span>
                                            )}
                                            <div className={cn(
                                                'px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed',
                                                mine
                                                    ? 'bg-[#0B1F3A] text-white rounded-tr-sm'
                                                    : staff
                                                        ? 'bg-white border border-[#E5E7EB] text-[#111827] rounded-tl-sm shadow-sm'
                                                        : 'bg-teal-50 border border-teal-100 text-teal-900 rounded-tl-sm',
                                            )}>
                                                {msg.content}
                                            </div>
                                            <span className="text-[10px] text-slate-400 px-1">{fmtTime(msg.createdAt)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t border-[#E5E7EB] bg-white flex gap-2 items-end shrink-0">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder={isAdmin ? `Message to ${customerName || 'customer'}…` : 'Type your message…'}
                        rows={1}
                        className="flex-1 resize-none rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-[13px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#0B1F3A]/40 transition-all leading-relaxed max-h-24 overflow-y-auto"
                        style={{ minHeight: 40 }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || sending}
                        className="w-10 h-10 rounded-xl bg-[#0B1F3A] hover:bg-[#1a3a6b] disabled:opacity-40 flex items-center justify-center transition-all shrink-0"
                    >
                        {sending
                            ? <Loader2 size={16} className="text-white animate-spin" />
                            : <Send size={16} className="text-white" />
                        }
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
