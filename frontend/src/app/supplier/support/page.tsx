'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Paperclip, 
    Image as ImageIcon, 
    Mic, 
    Send, 
    MoreHorizontal, 
    Bot, 
    User,
    CheckCheck,
    AlertCircle,
    X,
    FileText,
    CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

// Design Tokens
const COLORS = {
    primary: '#0B1F3A',
    accent: '#2EC4B6',
    background: '#F8FAFC',
    aiBubble: '#F1F5F9',
    userBubble: '#D1FAE5',
    border: '#E5E7EB',
    textPrimary: '#0F172A',
    textSecondary: '#64748B'
};

interface Message {
    id: string;
    type: 'ai' | 'user' | 'system';
    content: string;
    timestamp: string;
    status?: 'sent' | 'read';
    attachments?: { type: 'image' | 'pdf'; name: string; url?: string }[];
}

export default function SupplierSupportPage() {
    const { user } = useAuth();
    const [messages, setMessages] = React.useState<Message[]>([
        {
            id: '1',
            type: 'ai',
            content: "Hi 👋 I'm your assistant. Tell me what's wrong.",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
    ]);
    const [inputValue, setInputValue] = React.useState('');
    const [isTyping, setIsTyping] = React.useState(false);
    const [isRecording, setIsRecording] = React.useState(false);
    const [isEscalated, setIsEscalated] = React.useState(false);
    const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Auto-scroll on new messages
    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // Handle Sending
    const handleSend = () => {
        if (!inputValue.trim() && selectedFiles.length === 0) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            type: 'user',
            content: inputValue,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'sent',
            attachments: selectedFiles.map(f => ({
                type: f.type.includes('image') ? 'image' : 'pdf',
                name: f.name
            }))
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setSelectedFiles([]);
        setIsTyping(true);

        // Simulate AI Response
        setTimeout(() => {
            setIsTyping(false);
            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                type: 'ai',
                content: "I'm looking into this for you. I've analyzed your store status and see some discrepancies in the API logs.",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prev => [...prev, aiMsg]);

            // Simulate Escalation for "complex" keywords
            if (userMsg.content.toLowerCase().includes('urgent') || userMsg.content.toLowerCase().includes('error')) {
                setTimeout(() => {
                    setIsEscalated(true);
                    const systemMsg: Message = {
                        id: 'escalate',
                        type: 'system',
                        content: "A support specialist has joined the conversation",
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    };
                    setMessages(prev => [...prev, systemMsg]);
                }, 2000);
            }
        }, 1500);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-10 selection:bg-[#2EC4B6]/10">
            {/* 1. HEADER */}
            <header className="h-20 border-b border-[#E5E7EB] bg-white px-8 flex items-center justify-between sticky top-0 z-40">
                <div className="max-w-[1200px] mx-auto w-full flex items-center justify-between">
                    <div>
                        <h1 className="text-[28px] font-bold text-[#0F172A] leading-tight">Support</h1>
                        <p className="text-[12px] text-[#64748B] font-medium mt-0.5">Chat with our assistant to resolve issues instantly.</p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[12px] font-bold text-emerald-600 uppercase tracking-wider">AI Assistant Online</span>
                    </div>
                </div>
            </header>

            <main className="max-w-[1200px] mx-auto px-8 pt-8">
                {/* 2. MAIN CHAT CONTAINER */}
                <div className="bg-white border border-[#E5E7EB] rounded-[20px] shadow-sm overflow-hidden flex flex-col h-[650px] relative">
                    
                    {/* Chat Messages Area */}
                    <div 
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar bg-[#FDFDFD]"
                    >
                        {messages.map((msg) => (
                            <React.Fragment key={msg.id}>
                                {msg.type === 'system' ? (
                                    <div className="flex justify-center my-4">
                                        <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-full text-[12px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                            <CheckCircle2 size={14} className="text-[#2EC4B6]" />
                                            {msg.content}
                                        </div>
                                    </div>
                                ) : (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "flex flex-col max-w-[80%]",
                                            msg.type === 'user' ? "ms-auto items-end" : "me-auto items-start"
                                        )}
                                    >
                                        <div className={cn(
                                            "px-4 py-3 text-[14px] leading-relaxed shadow-sm",
                                            msg.type === 'user' 
                                                ? "bg-[#D1FAE5] text-[#0F172A] rounded-[16px] rounded-tr-none" 
                                                : "bg-[#F1F5F9] text-[#0F172A] rounded-[16px] rounded-tl-none border border-[#E5E7EB]"
                                        )}>
                                            {msg.attachments && msg.attachments.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {msg.attachments.map((at, i) => (
                                                        <div key={i} className="bg-white/50 p-2 rounded-lg border border-black/5 flex items-center gap-2">
                                                            {at.type === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />}
                                                            <span className="text-[11px] font-bold truncate max-w-[100px]">{at.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <p>{msg.content}</p>
                                        </div>
                                        <div className="flex items-center gap-2 mt-2 px-1">
                                            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-tighter">{msg.timestamp}</span>
                                            {msg.type === 'user' && <CheckCheck size={12} className="text-[#2EC4B6]" />}
                                        </div>
                                    </motion.div>
                                )}
                            </React.Fragment>
                        ))}

                        {/* Typing Indicator */}
                        {isTyping && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex items-start gap-3"
                            >
                                <div className="bg-[#F1F5F9] px-4 py-3 rounded-[16px] rounded-tl-none border border-[#E5E7EB] flex items-center gap-1">
                                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* 3. INPUT AREA */}
                    <div className="bg-white border-t border-[#E5E7EB] p-4 min-h-[72px] flex flex-col gap-3">
                        
                        {/* Selected Files Preview */}
                        {selectedFiles.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {selectedFiles.map((file, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0">
                                        <FileText size={14} className="text-slate-400" />
                                        <span className="text-[11px] font-bold text-slate-700 max-w-[120px] truncate">{file.name}</span>
                                        <button 
                                            onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                                            className="p-1 hover:bg-slate-200 rounded-full transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => document.getElementById('file-upload')?.click()}
                                    className="w-10 h-10 rounded-xl hover:bg-slate-50 flex items-center justify-center text-[#64748B] transition-colors"
                                >
                                    <Paperclip size={20} />
                                </button>
                                <button 
                                    onClick={() => document.getElementById('image-upload')?.click()}
                                    className="w-10 h-10 rounded-xl hover:bg-slate-50 flex items-center justify-center text-[#64748B] transition-colors"
                                >
                                    <ImageIcon size={20} />
                                </button>
                                <input id="file-upload" type="file" className="hidden" multiple onChange={handleFileSelect} />
                                <input id="image-upload" type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                            </div>

                            <div className="flex-1 relative">
                                <input 
                                    type="text" 
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder="Describe your issue..."
                                    className="w-full h-12 bg-slate-50 border border-[#E5E7EB] rounded-xl px-4 text-[14px] text-[#0F172A] outline-none focus:border-[#2EC4B6] transition-all"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setIsRecording(!isRecording)}
                                    className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                        isRecording ? "bg-red-50 text-red-500 animate-pulse" : "hover:bg-slate-50 text-[#64748B]"
                                    )}
                                >
                                    <Mic size={20} />
                                </button>
                                <button 
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() && selectedFiles.length === 0}
                                    className="w-12 h-12 bg-[#0B1F3A] text-white rounded-xl flex items-center justify-center hover:bg-[#152D4F] transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-[#0B1F3A]/10"
                                >
                                    <Send size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Hints / UX Section */}
                <div className="mt-8 flex items-center justify-center gap-8 opacity-50">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">You can upload screenshots for faster help</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Secure enterprise support</span>
                    </div>
                </div>
            </main>
        </div>
    );
}

function ShieldCheck({ size, className }: { size: number, className: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
    )
}
