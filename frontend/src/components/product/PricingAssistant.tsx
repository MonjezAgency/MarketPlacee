'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Loader2, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface Props {
    productId: string;
    productName: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-production-a2b5.up.railway.app';

export default function PricingAssistant({ productId, productName }: Props) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [greeted, setGreeted] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to latest message
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Show greeting when first opened
    useEffect(() => {
        if (open && !greeted) {
            setGreeted(true);
            const greeting: Message = {
                role: 'assistant',
                content: `Hi! I'm your AI pricing assistant for **${productName}**.\n\nI can calculate exact prices for any quantity — carton, pallet, or full truck — and show you how much you save per carton at each tier. What would you like to know?`,
            };
            setMessages([greeting]);
            // Load default suggestions
            sendQuery('What are the buying tiers?', true);
        }
    }, [open, greeted, productName]);

    const sendQuery = async (query: string, silent = false) => {
        if (!query.trim()) return;

        const userMsg: Message = { role: 'user', content: query };
        const newHistory = silent ? messages : [...messages, userMsg];

        if (!silent) {
            setMessages(newHistory);
            setInput('');
        }
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/ai-agent/pricing-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId,
                    message: query,
                    history: messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0)
                        .slice(-6)
                        .map(m => ({ role: m.role, content: m.content })),
                }),
            });

            const data = await res.json();

            if (!silent) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
            }
            if (data.suggestedQuestions?.length) {
                setSuggestions(data.suggestedQuestions);
            }
        } catch {
            if (!silent) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: 'Sorry, I couldn\'t connect to the pricing engine. Please try again.',
                }]);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSend = () => {
        if (input.trim() && !loading) {
            sendQuery(input.trim());
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Render message with basic markdown (bold, line breaks)
    const renderMessage = (content: string) => {
        return content.split('\n').map((line, i) => {
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
                <span key={i}>
                    {parts.map((part, j) =>
                        part.startsWith('**') && part.endsWith('**')
                            ? <strong key={j}>{part.slice(2, -2)}</strong>
                            : <span key={j}>{part}</span>
                    )}
                    {i < content.split('\n').length - 1 && <br />}
                </span>
            );
        });
    };

    return (
        <>
            {/* Floating trigger button */}
            <AnimatePresence>
                {!open && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => setOpen(true)}
                        className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-[14px] shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-105 transition-all"
                    >
                        <Sparkles size={17} className="animate-pulse" />
                        Ask AI about pricing
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                        className="flex flex-col rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl overflow-hidden"
                        style={{ height: 480 }}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 shrink-0">
                            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                                <Bot size={20} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-[14px] leading-tight">AI Pricing Assistant</p>
                                <p className="text-white/70 text-[11px] truncate">{productName}</p>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                            >
                                <X size={16} className="text-white" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F8FAFC]"
                        >
                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        'flex gap-2.5',
                                        msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                                    )}
                                >
                                    {msg.role === 'assistant' && (
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                                            <Bot size={14} className="text-white" />
                                        </div>
                                    )}
                                    <div
                                        className={cn(
                                            'max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed',
                                            msg.role === 'user'
                                                ? 'bg-indigo-600 text-white rounded-tr-sm'
                                                : 'bg-white border border-[#E5E7EB] text-[#111827] rounded-tl-sm shadow-sm',
                                        )}
                                    >
                                        {renderMessage(msg.content)}
                                    </div>
                                </div>
                            ))}

                            {loading && (
                                <div className="flex gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                                        <Bot size={14} className="text-white" />
                                    </div>
                                    <div className="bg-white border border-[#E5E7EB] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Suggestion chips */}
                        {suggestions.length > 0 && (
                            <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide shrink-0 bg-white border-t border-[#F3F4F6] pt-2">
                                {suggestions.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => sendQuery(s)}
                                        disabled={loading}
                                        className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors whitespace-nowrap disabled:opacity-50"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Input */}
                        <div className="px-4 py-3 border-t border-[#E5E7EB] bg-white flex gap-2 items-end shrink-0">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKey}
                                placeholder="Ask about pricing, quantities, savings…"
                                rows={1}
                                className="flex-1 resize-none rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-[13px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-indigo-400 focus:bg-white transition-all leading-relaxed max-h-24 overflow-y-auto"
                                style={{ minHeight: 40 }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || loading}
                                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center transition-all shrink-0"
                            >
                                {loading
                                    ? <Loader2 size={16} className="text-white animate-spin" />
                                    : <Send size={16} className="text-white" />
                                }
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
