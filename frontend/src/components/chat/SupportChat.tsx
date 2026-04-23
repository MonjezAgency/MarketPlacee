'use client';
import { apiFetch, getToken } from "@/lib/api";

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Image as ImageIcon, X, User, Check, CheckCheck, Headphones, Bot, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '@/store/chatStore';

interface Message {
    id: string;
    content: string;
    imageUrl?: string;
    senderId: string;
    receiverId?: string;
    isRead: boolean;
    isBot?: boolean;
    assignedTeam?: string;
    createdAt: string;
    sender: {
        name: string;
        role: string;
    };
}

const ISSUE_CATEGORIES = [
    { id: 'marketplace', label: 'مشكلة في الماركت بليس', labelEn: 'Marketplace Issue' },
    { id: 'shipment', label: 'مشكلة في الشحنة', labelEn: 'Shipment Issue' },
    { id: 'inquiry', label: 'استفسار', labelEn: 'General Inquiry' },
    { id: 'payment', label: 'مشكلة في الـ Payment', labelEn: 'Payment Issue' },
    { id: 'other', label: 'أخرى', labelEn: 'Other' },
];

export function SupportChat({ isSupport = false, targetUserId = null }: { isSupport?: boolean, targetUserId?: string | null }) {
    const { user } = useAuth();
    const chatId = isSupport ? (targetUserId || 'support_admin') : 'customer';
    const { messages, setMessages, updateMessage, removeMessage } = useChatStore(chatId);
    
    const [newMessage, setNewMessage] = React.useState('');
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
    const [hasLoadedMessages, setHasLoadedMessages] = React.useState(false);
    const [isConnected, setIsConnected] = React.useState(false);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const socketRef = React.useRef<Socket | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Load initial messages via HTTP
    const fetchMessages = React.useCallback(async () => {
        try {
            const url = isSupport && targetUserId
                ? `/chat/admin/messages/${targetUserId}`
                : `/chat/messages`;

            const res = await apiFetch(url);
            if (!res.ok) {
                if (res.status === 401) throw new Error('Unauthorized');
                throw new Error('Failed to fetch');
            }
            setMessages(await res.json());
            setHasLoadedMessages(true);
        } catch (err: any) {
            setHasLoadedMessages(true);
            if (err.response?.status === 401) {
                window.location.href = '/auth/login';
            }
        }
    }, [isSupport, targetUserId]);

    // Setup WebSocket connection
    React.useEffect(() => {
        fetchMessages();

        let socket: Socket | null = null;

        const initSocket = async () => {
            let token: string | undefined;
            try {
                const tokenRes = await fetch('/api/auth/socket-token');
                if (tokenRes.ok) {
                    const tokenData = await tokenRes.json();
                    token = tokenData.token;
                }
            } catch (err) {
                console.error("Failed to fetch socket token:", err);
            }

            const socketUrl = process.env.NEXT_PUBLIC_API_URL || 'https://marketplace-backend-production-539c.up.railway.app';
            socket = io(`${socketUrl}/chat`, {
                auth: { token },
                transports: ['websocket', 'polling'],
            });

            socketRef.current = socket;

            socket.on('connect', () => {
                setIsConnected(true);
            });

            socket.on('disconnect', () => {
                setIsConnected(false);
            });

            // Listen for new incoming messages
            socket.on('new_message', (msg: Message) => {
                setMessages((prev: Message[]) => {
                    const exists = prev.some(m => m.id === msg.id);
                    if (exists) return prev;
                    return [...prev, msg];
                });
            });

            // Support staff: listen for new user inquiries
            if (isSupport) {
                socket.on('new_inquiry', ({ message }: { userId: string; message: Message }) => {
                    setMessages((prev: Message[]) => {
                        if (prev.some((m: Message) => m.id === message.id)) return prev;
                        return [...prev, message];
                    });
                });
            }
        };

        initSocket();

        return () => {
            if (socket) {
                socket.disconnect();
                socketRef.current = null;
            }
        };
    }, [user?.id, targetUserId, isSupport]);

    // Auto-scroll on new messages
    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleCategorySelect = async (category: typeof ISSUE_CATEGORIES[0]) => {
        setSelectedCategory(category.id);
        const greetingText = `${category.label} — ${category.labelEn}`;

        // Optimistic UI
        const optimisticMsg: Message = {
            id: `temp-${Date.now()}`,
            content: greetingText,
            senderId: user?.id || '',
            isRead: false,
            isBot: false,
            createdAt: new Date().toISOString(),
            sender: { name: user?.name || 'You', role: user?.role || '' },
        };
        setMessages((prev: Message[]) => [...prev, optimisticMsg]);

        if (socketRef.current?.connected) {
            socketRef.current.emit('send_message', { content: greetingText, receiverId: null }, (res: any) => {
                if (res?.id) updateMessage(optimisticMsg.id, res);
                else if (res?.userMessage?.id) updateMessage(optimisticMsg.id, res.userMessage);
            });
        } else {
            try {
                const res = await apiFetch(`/chat/send`, {
                    method: 'POST',
                    body: JSON.stringify({ content: greetingText, receiverId: null })
                });
                if (!res.ok) {
                    if (res.status === 401) window.location.href = '/auth/login';
                    throw new Error('Failed to send');
                }
                fetchMessages();
            } catch (err: any) {
                removeMessage(optimisticMsg.id);
            }
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setSelectedImage(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSend = async () => {
        if (!newMessage.trim() && !selectedImage) return;

        const content = newMessage;
        const image = selectedImage;
        setNewMessage('');
        setSelectedImage(null);

        const receiverId = isSupport ? targetUserId : null;

        const optimisticMsg: Message = {
            id: `temp-${Date.now()}`,
            content,
            imageUrl: image || undefined,
            senderId: user?.id || '',
            receiverId: receiverId || undefined,
            isRead: false,
            isBot: false,
            createdAt: new Date().toISOString(),
            sender: { name: user?.name || 'You', role: user?.role || '' },
        };
        setMessages((prev: Message[]) => [...prev, optimisticMsg]);

        if (socketRef.current?.connected) {
            socketRef.current.emit('send_message', { content, imageUrl: image, receiverId }, (res: any) => {
                if (res?.id) updateMessage(optimisticMsg.id, res);
                else if (res?.userMessage?.id) updateMessage(optimisticMsg.id, res.userMessage);
            });
        } else {
            try {
                const res = await apiFetch(`/chat/send`, {
                    method: 'POST',
                    body: JSON.stringify({ content, imageUrl: image, receiverId })
                });
                if (!res.ok) {
                    if (res.status === 401) window.location.href = '/auth/login';
                    throw new Error('Failed to send');
                }
                fetchMessages();
            } catch (err: any) {
                removeMessage(optimisticMsg.id);
            }
        }
    };

    const showCategorySelector = !isSupport && hasLoadedMessages && messages.length === 0 && !selectedCategory;

    return (
        <div className="flex flex-col h-full w-full bg-[#0A0D12] border-none rounded-none overflow-hidden relative">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-secondary/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2" />

            {/* Header */}
            <div className="p-4 bg-white/5 backdrop-blur-xl border-b border-white/10 flex items-center justify-between shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-lg shadow-primary/20">
                            {isSupport ? <User size={20} className="text-white" /> : <Headphones size={20} className="text-white" />}
                        </div>
                        <div className={cn(
                            "absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#0A0D12]",
                            isConnected ? "bg-emerald-500" : "bg-red-500"
                        )} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white tracking-tight uppercase">{isSupport ? 'Live Inquirer' : 'Atlantis Support'}</h3>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[8px] font-black uppercase tracking-widest text-primary animate-pulse">
                                {isConnected ? 'Secure Connection' : 'Offline'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar z-10"
            >
                <AnimatePresence>
                {showCategorySelector && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-6 pt-8"
                    >
                        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl text-center">
                            <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                                <Sparkles size={32} className="text-primary" />
                            </div>
                            <h2 className="text-xl font-black text-white mb-2 uppercase tracking-tight">How can we help?</h2>
                            <p className="text-xs text-white/40 mb-8 font-medium">Select a category to reach the specialized support team.</p>
                            <div className="flex flex-col gap-3">
                                {ISSUE_CATEGORIES.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => handleCategorySelect(cat)}
                                        className="w-full text-center px-6 py-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/50 hover:bg-primary/10 transition-all text-xs font-black text-white uppercase tracking-widest"
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {messages.map((msg, idx) => {
                    const isMine = (msg.senderId === user?.id) && !msg.isBot;
                    const isSystem = msg.senderId === 'SYSTEM' || msg.isBot;
                    
                    let displayContent = msg.content;
                    if (msg.isBot && msg.content?.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(msg.content);
                            displayContent = parsed.response || parsed.message;
                        } catch (e) {}
                    }

                    return (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.4, delay: 0.05 }}
                            className={cn("flex w-full gap-3", isMine ? "justify-end" : "justify-start")}
                        >
                            {!isMine && (
                                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0 mt-1 border border-white/10">
                                    {msg.isBot ? <Bot size={16} className="text-primary" /> : <User size={16} className="text-white/60" />}
                                </div>
                            )}
                            <div className={cn(
                                "max-w-[80%] flex flex-col",
                                isMine ? "items-end" : "items-start"
                            )}>
                                <div className={cn(
                                    "rounded-[1.5rem] px-5 py-3.5 shadow-xl relative overflow-hidden",
                                    isMine
                                        ? "bg-gradient-to-br from-primary to-orange-600 text-white rounded-tr-none"
                                        : "bg-white/5 backdrop-blur-xl border border-white/10 text-white rounded-tl-none"
                                )}>
                                    {msg.imageUrl && (
                                        <img src={msg.imageUrl} alt="attached" className="rounded-xl mb-3 max-w-full h-auto border border-white/10" />
                                    )}
                                    <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap" dir="auto">
                                        {displayContent}
                                    </p>
                                </div>
                                <div className={cn(
                                    "flex items-center gap-2 mt-2 px-1",
                                    isMine ? "text-white/40" : "text-white/20"
                                )}>
                                    <span className="text-[9px] font-black uppercase tracking-widest">
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {isMine && (msg.isRead ? <CheckCheck size={12} className="text-primary" /> : <Check size={12} />)}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
                </AnimatePresence>
            </div>

            {/* Input Area */}
            <div className="p-6 bg-[#0A0D12] border-t border-white/10 z-10">
                <AnimatePresence>
                {selectedImage && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="relative inline-block mb-4"
                    >
                        <img src={selectedImage} alt="Preview" className="h-24 w-24 object-cover rounded-2xl border-2 border-primary/30" />
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:scale-110 transition-transform"
                        >
                            <X size={14} />
                        </button>
                    </motion.div>
                )}
                </AnimatePresence>
                
                <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-2 pl-4">
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageSelect}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-white/40 hover:text-primary transition-colors"
                    >
                        <ImageIcon size={22} />
                    </button>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type your message..."
                        className="flex-1 bg-transparent border-none py-3 text-sm text-white placeholder:text-white/20 outline-none"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!newMessage.trim() && !selectedImage}
                        className="w-12 h-12 bg-primary text-white rounded-xl flex items-center justify-center disabled:opacity-30 disabled:grayscale hover:scale-105 transition-all shadow-lg shadow-primary/20"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
