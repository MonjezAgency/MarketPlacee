'use client';
import { apiFetch, getToken } from "@/lib/api";

import * as React from 'react';
import { motion } from 'framer-motion';
import { Send, Image as ImageIcon, X, User, Check, CheckCheck, Headphones } from 'lucide-react';
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

        // Optimistic UI: show the message immediately
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

        // Send via WebSocket for instant delivery
        if (socketRef.current?.connected) {
            socketRef.current.emit('send_message', { content: greetingText, receiverId: null }, (res: any) => {
                if (res?.id) updateMessage(optimisticMsg.id, res);
                else if (res?.userMessage?.id) updateMessage(optimisticMsg.id, res.userMessage);
            });
        } else {
            // Fallback to HTTP
            try {
                const res = await apiFetch(`/chat/send`, {
                    method: 'POST',
                    body: JSON.stringify({
                        content: greetingText,
                        receiverId: null
                    })
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

        // Optimistic UI: add message immediately
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
            socketRef.current.emit('send_message', {
                content,
                imageUrl: image,
                receiverId,
            }, (res: any) => {
                // Reconcile ID from backend to fix state desync / duplicate IDs
                if (res?.id) {
                    updateMessage(optimisticMsg.id, res);
                } else if (res?.userMessage?.id) {
                    updateMessage(optimisticMsg.id, res.userMessage);
                }
            });
        } else {
            // Fallback to HTTP
            try {
                const res = await apiFetch(`/chat/send`, {
                    method: 'POST',
                    body: JSON.stringify({
                        content,
                        imageUrl: image,
                        receiverId,
                    })
                });
                
                if (!res.ok) {
                    if (res.status === 401) {
                        alert("انتهت صلاحية الجلسة. سيتم تحويلك لصفحة الدخول.");
                        window.location.href = '/auth/login';
                        return;
                    }
                    throw new Error('Failed to send message');
                }
                
                fetchMessages();
            } catch (err: any) {
                if (err.response?.status === 401) {
                    
                    
                    alert("انتهت صلاحية الجلسة. سيتم تحويلك لصفحة الدخول.");
                    window.location.href = '/auth/login';
                }
                // Remove optimistic message on failure
                removeMessage(optimisticMsg.id);
            }
        }
    };

    const showCategorySelector = !isSupport && hasLoadedMessages && messages.length === 0 && !selectedCategory;

    return (
        <div className="flex flex-col h-full w-full bg-card border-none rounded-none overflow-hidden">
            {/* Header - Simplified as it's now internal to the dashboard's chat area */}
            <div className="p-4 bg-muted/30 border-b border-border/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        {isSupport ? <User size={16} className="text-primary" /> : <Headphones size={16} className="text-primary" />}
                    </div>
                    <div>
                        <h3 className="text-xs font-black">{isSupport ? 'Customer' : 'Atlantis Support'}</h3>
                        <p className={cn(
                            "text-[8px] uppercase tracking-widest font-black",
                            isConnected ? "text-emerald-500" : "text-muted-foreground"
                        )}>
                            {isConnected ? '● Online' : '○ Connecting...'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-accent/5 no-scrollbar"
            >
                {showCategorySelector && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-4 pt-4"
                    >
                        <div className="bg-card border border-border rounded-2xl p-5 max-w-sm w-full shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <Headphones size={18} className="text-primary" />
                                <p className="text-sm font-black text-foreground">مرحباً! كيف يمكننا مساعدتك؟</p>
                            </div>
                            <p className="text-xs text-muted-foreground mb-4">اختر نوع المشكلة لنتمكن من مساعدتك بشكل أفضل:</p>
                            <div className="flex flex-col gap-2">
                                {ISSUE_CATEGORIES.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => handleCategorySelect(cat)}
                                        className="w-full text-start px-4 py-2.5 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm font-bold text-foreground"
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {messages.map((msg) => {
                    const isMine = (msg.senderId === user?.id) && !msg.isBot;
                    // In RTL (Arabic), isMine should be at the "start" (Right) 
                    // and others at the "end" (Left), but since Flexbox justify-start 
                    // is Right in RTL and justify-end is Left:
                    // isMine (Right) -> justify-start
                    // others (Left) -> justify-end
                    // Wait, usually we want My messages on the Right and Others on the Left.
                    // In RTL: justify-start is Right, justify-end is Left.
                    // So: isMine ? "justify-start" : "justify-end"
                    // However, if the user switched to English, it flips.
                    // Let's use a more robust way or just stick to standard RTL conventions.
                    
                    let displayContent = msg.content;
                    if (msg.isBot && msg.content?.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(msg.content);
                            if (parsed.response) displayContent = parsed.response;
                            else if (parsed.message) displayContent = parsed.message;
                        } catch (e) {}
                    }

                    return (
                        <div
                            key={msg.id}
                            className={cn("flex w-full", isMine ? "justify-start" : "justify-end")}
                        >
                            <div className={cn(
                                "max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm relative group",
                                isMine
                                    ? "bg-primary text-primary-foreground rounded-se-none"
                                    : "bg-card border border-border rounded-ss-none"
                            )}>
                                {!isMine && (
                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-primary opacity-80 flex items-center gap-2">
                                        {msg.isBot ? "Atlantis Support" : `${msg.sender?.name || 'User'} (${msg.sender?.role || 'Guest'})`}
                                        {msg.assignedTeam && (
                                            <span className="bg-secondary/20 text-secondary px-2 py-0.5 rounded-full text-[8px]">{msg.assignedTeam}</span>
                                        )}
                                    </p>
                                )}
                                {isMine && isSupport && (
                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-primary-foreground opacity-80">
                                        You ({msg.sender?.role || 'Admin'})
                                    </p>
                                )}
                                {msg.imageUrl && (
                                    <img src={msg.imageUrl} alt="attached" className="rounded-lg mb-2 max-w-full h-auto" />
                                )}
                                <p className="text-sm whitespace-pre-wrap" dir="auto" style={{ textAlign: 'start' }}>{displayContent}</p>
                                <div className={cn(
                                    "flex items-center justify-end gap-1 mt-1 opacity-60",
                                    isMine ? "text-primary-foreground" : "text-muted-foreground"
                                )}>
                                    <span className="text-[9px]">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    {isMine && (msg.isRead ? <CheckCheck size={10} /> : <Check size={10} />)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-card border-t border-border">
                {selectedImage && (
                    <div className="relative inline-block mb-2">
                        <img src={selectedImage} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-border" />
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-2 -end-2 bg-red-500 text-white rounded-full p-1"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageSelect}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                        <ImageIcon size={20} />
                    </button>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="اكتب رسالتك هنا... / Type your message..."
                        className="flex-1 bg-accent/10 border-none rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 ring-primary/30 transition-all"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!newMessage.trim() && !selectedImage}
                        className="p-2.5 bg-secondary text-secondary-foreground rounded-xl disabled:opacity-50 hover:scale-105 transition-transform"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
