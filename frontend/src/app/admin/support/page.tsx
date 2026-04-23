'use client';
import { apiFetch, getToken } from "@/lib/api";

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SupportChat } from '@/components/chat/SupportChat';
import { useAuth } from '@/lib/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    MessageCircle, ShieldCheck, Search, AlertCircle,
    ShoppingCart, Users, Clock, CheckCircle2, XCircle,
    Eye, ChevronRight, Star, Package, RefreshCw, Receipt,
    Loader2, UserCheck, Filter, Bot, UserCheck2, Zap,
    TrendingUp, TrendingDown, Activity, Info, FileText,
    History, ExternalLink, Download, LayoutDashboard,
    MoreHorizontal, Send, Paperclip, Smile,
    LifeBuoy, BookOpen, Share2, ArrowLeft, ChevronDown, Megaphone,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { cn } from '@/lib/utils';

const API_URL = '/api';

// ─── Design System Tokens (Matching Reference Image) ────────────────────────
const THEME = {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    text: {
        main: '#0F172A',
        muted: '#64748B',
        dim: '#94A3B8',
    },
    border: '#E2E8F0',
    primary: '#0D9488', // Teal from reference
    secondary: '#0D9488',
    accent: '#131921',
};

// ─── UI Components ──────────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, subtext, trend, trendValue, color, iconColor }: any) {
    const isUp = trend === 'up';
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between"
        >
            <div className="flex items-start justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
                    <Icon size={20} className={iconColor} />
                </div>
                {trend && (
                    <div className={cn(
                        "flex items-center gap-1 text-[11px] font-bold",
                        isUp ? "text-emerald-500" : "text-amber-500"
                    )}>
                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {trendValue}%
                    </div>
                )}
            </div>
            <div>
                <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wide mb-2">{label}</p>
                <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-semibold text-slate-900 tracking-tight leading-tight">{value ?? '—'}</p>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">{subtext}</p>
            </div>
        </motion.div>
    );
}

function SectionTab({ active, label, icon: Icon, count, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "h-11 px-8 rounded-2xl flex items-center gap-3 text-xs font-black transition-all whitespace-nowrap",
                active 
                    ? "bg-[#14B8A6] text-white shadow-lg shadow-[#14B8A6]/20" 
                    : "text-slate-500 hover:bg-slate-100"
            )}
        >
            <Icon size={18} />
            {label}
            {count !== undefined && (
                <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-black min-w-[24px]",
                    active ? "bg-white/20 text-white" : "bg-red-500 text-white"
                )}>
                    {count}
                </span>
            )}
        </button>
    );
}

// ─── Support HQ Dashboard ────────────────────────────────────────────────────
export default function SupportPage() {
    const { user } = useAuth();
    const userRole = user?.role?.toUpperCase();
    const isSupportTeam = ['SUPPORT', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'LOGISTICS', 'OWNER'].includes(userRole || '');

    const [stats, setStats] = React.useState<any>(null);
    const [disputes, setDisputes] = React.useState<any[]>([]);
    const [orders, setOrders] = React.useState<any[]>([]);
    const [kycList, setKycList] = React.useState<any[]>([]);
    const [conversations, setConversations] = React.useState<any[]>([]);
    const [selectedUser, setSelectedUser] = React.useState<any>(null);
    const searchParams = useSearchParams();
    const initialSearch = searchParams.get('search') || '';
    const [searchTerm, setSearchTerm] = React.useState(initialSearch);
    const [switchingId, setSwitchingId] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [tab, setTab] = React.useState<'overview' | 'disputes' | 'orders' | 'kyc' | 'chat'>('chat');
    const [chatTab, setChatTab] = React.useState<'conversation' | 'order' | 'customer'>('conversation');
    
    const socketRef = React.useRef<Socket | null>(null);

    const fetchAll = React.useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);
        
        try {
            const [disputeStats, disputeData, orderData, kycData, chatData] = await Promise.allSettled([
                apiFetch(`/disputes/stats`).then(r => r.json()),
                apiFetch(`/disputes?page=1&limit=50`).then(r => r.json()),
                apiFetch(`/orders?page=1&limit=30`).then(r => r.json()),
                apiFetch(`/kyc/pending`).then(r => r.json()),
                apiFetch(`/chat/admin/conversations`).then(r => r.json()),
            ]);

            if (disputeStats.status === 'fulfilled') setStats(disputeStats.value);
            if (disputeData.status === 'fulfilled') setDisputes(disputeData.value?.data || []);
            if (orderData.status === 'fulfilled') setOrders(orderData.value?.data || orderData.value || []);
            if (kycData.status === 'fulfilled') setKycList(Array.isArray(kycData.value) ? kycData.value : []);
            
            if (chatData.status === 'fulfilled') {
                const convs = Array.isArray(chatData.value) ? chatData.value : [];
                setConversations(convs);
                
                // Auto-select if searching
                if (initialSearch && convs.length > 0) {
                    const match = convs.find(c => c.name?.toLowerCase().includes(initialSearch.toLowerCase()));
                    if (match) setSelectedUser(match);
                }
            }
        } catch (_e) {
            // silently ignore fetch errors
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [initialSearch]);

    React.useEffect(() => { 
        fetchAll(); 
        if (initialSearch) {
            setTab('chat');
        }
    }, [fetchAll, initialSearch]);

    React.useEffect(() => {
        const tok = getToken();
        if (!tok) return;
        const socket = io(`${API_URL}/chat`, {
            auth: { token: tok },
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;
        socket.on('new_inquiry', () => { fetchAll(true); });
        socket.on('conversation_updated', () => { fetchAll(true); });
        return () => { socket.disconnect(); socketRef.current = null; };
    }, [fetchAll]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)]">
                <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
                <p className="text-xs font-bold text-slate-400 mt-4 uppercase tracking-widest">Loading Support HQ...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] space-y-10">
            {/* Header Area */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 tracking-tight flex items-center gap-3">
                        Support HQ
                    </h1>
                    <p className="text-sm font-medium text-slate-400 mt-1">Commerce Resolution & Entity Verification</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search anything..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-12 w-64 pl-12 pr-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                        />
                    </div>
                    <button className="h-12 px-6 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-2xl flex items-center gap-2 hover:bg-slate-50 transition-all">
                        Customize Dashboard
                    </button>
                </div>
            </div>

            {/* Section Tabs */}
            <div className="flex items-center gap-3 pb-8 border-b border-slate-100">
                <SectionTab label="Overview" icon={LayoutDashboard} active={tab === 'overview'} onClick={() => setTab('overview')} />
                <SectionTab label="Disputes" icon={AlertCircle} active={tab === 'disputes'} count={stats?.OPEN} onClick={() => setTab('disputes')} />
                <SectionTab label="Orders" icon={ShoppingCart} active={tab === 'orders'} onClick={() => setTab('orders')} />
                <SectionTab label="KYC Queue" icon={UserCheck} active={tab === 'kyc'} count={kycList.length} onClick={() => setTab('kyc')} />
                <SectionTab label="Live Chat" icon={MessageCircle} active={tab === 'chat'} count={conversations.filter(c => c.unread).length} onClick={() => setTab('chat')} />
            </div>

            {/* KPI Row - Responsive Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                <KPICard 
                    icon={AlertCircle} label="Open Disputes" value={stats?.OPEN ?? 8} 
                    subtext="Require attention" trend="up" trendValue={23} 
                    color="bg-red-50" iconColor="text-red-500" 
                />
                <KPICard 
                    icon={Clock} label="Under Review" value={stats?.UNDER_REVIEW ?? 12} 
                    subtext="Awaiting review" trend="up" trendValue={15} 
                    color="bg-orange-50" iconColor="text-orange-500" 
                />
                <KPICard 
                    icon={UserCheck} label="KYC Pending" value={kycList.length || 24} 
                    subtext="Pending verification" trend="down" trendValue={8} 
                    color="bg-blue-50" iconColor="text-blue-500" 
                />
                <KPICard 
                    icon={MessageCircle} label="Active Conversations" value={conversations.length || 3} 
                    subtext="Unresolved chats" trend="up" trendValue={12} 
                    color="bg-emerald-50" iconColor="text-emerald-500" 
                />
                <KPICard 
                    icon={Clock} label="Avg. Response Time" value="18m" 
                    subtext="Within SLA" trend="down" trendValue={2.7} 
                    color="bg-purple-50" iconColor="text-purple-500" 
                />
            </div>

            {/* Main Content Grid (3 Columns matching Image) */}
            <div className="grid grid-cols-12 gap-6 items-start">
                
                {/* 1. Support Conversations (Col-span 7) */}
                <div className="col-span-12 lg:col-span-7 space-y-6">
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[600px]">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                    Conversations
                                    <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold">
                                        {conversations.length}
                                    </span>
                                </h3>
                                <p className="text-xs text-slate-400 mt-1">Active resolution threads</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 transition-colors">
                                    <Filter size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto no-scrollbar">
                            {conversations
                                .filter(c => 
                                    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                    c.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())
                                )
                                .map((conv, idx) => {
                                const priority = conv.lastMessage?.toLowerCase().includes('payment') || conv.lastMessage?.toLowerCase().includes('نزاع') ? 'HIGH' : 'MEDIUM';
                                return (
                                    <button 
                                        key={conv.id}
                                        onClick={() => setSelectedUser(conv)}
                                        className={cn(
                                            "w-full p-4 border-b border-slate-50 flex items-start gap-4 transition-all text-start",
                                            selectedUser?.id === conv.id ? "bg-teal-50/30 border-l-4 border-l-teal-500" : "hover:bg-slate-50/50"
                                        )}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shrink-0">
                                            {(conv.name || '?')[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="text-sm font-semibold text-slate-900 truncate">{conv.name}</h4>
                                                <span className="text-[10px] text-slate-400">5m ago</span>
                                            </div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={cn(
                                                    "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                                                    priority === 'HIGH' ? "bg-red-50 text-red-600 border border-red-100" : "bg-orange-50 text-orange-600 border border-orange-100"
                                                )}>
                                                    {priority}
                                                </span>
                                                <p className="text-[10px] text-slate-400 font-medium">Order #AT-78451</p>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate leading-relaxed">
                                                {conv.lastMessage || 'I haven\'t received my order yet and the tracking...'}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 2. Active Conversation (Col-span 5) */}
                <div className="col-span-12 lg:col-span-5 space-y-6">
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[600px]">
                        {selectedUser ? (
                            <>
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white z-10">
                                    <div className="flex items-center gap-3">
                                        <button className="lg:hidden text-slate-400" onClick={() => setSelectedUser(null)}>
                                            <ArrowLeft size={20} />
                                        </button>
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400">
                                            {(selectedUser.name || '?')[0]}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-semibold text-slate-900">{selectedUser.name}</h3>
                                                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider">High Priority</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-medium">Order #AT-78451 · Placed on May 20, 2024</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full text-[10px] font-bold text-emerald-600">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            Open
                                        </div>
                                        <button className="p-2 text-slate-400 hover:text-slate-900">
                                            <MoreHorizontal size={18} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 px-6 py-2 border-b border-slate-50 bg-white">
                                    <button 
                                        onClick={() => setChatTab('conversation')}
                                        className={cn("text-xs font-semibold pb-2 transition-all border-b-2", chatTab === 'conversation' ? "text-teal-600 border-teal-500" : "text-slate-400 border-transparent hover:text-slate-900")}
                                    >
                                        Conversation
                                    </button>
                                    <button 
                                        onClick={() => setChatTab('order')}
                                        className={cn("text-xs font-semibold pb-2 transition-all border-b-2", chatTab === 'order' ? "text-teal-600 border-teal-500" : "text-slate-400 border-transparent hover:text-slate-900")}
                                    >
                                        Order Details
                                    </button>
                                    <button 
                                        onClick={() => setChatTab('customer')}
                                        className={cn("text-xs font-semibold pb-2 transition-all border-b-2", chatTab === 'customer' ? "text-teal-600 border-teal-500" : "text-slate-400 border-transparent hover:text-slate-900")}
                                    >
                                        Customer Info
                                    </button>
                                </div>

                                <div className="flex-1 overflow-hidden">
                                    <SupportChat isSupport={true} targetUserId={selectedUser.id} isLight={true} />
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
                                <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-200">
                                    <MessageCircle size={40} />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-slate-900">Select a conversation</h4>
                                    <p className="text-[11px] text-slate-400 font-bold mt-1">Choose a thread from the left to start responding.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* Support Insights Section - Responsive Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {/* Support Health */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Support Health</h3>
                        <button className="text-[10px] font-bold text-slate-400 flex items-center gap-1 hover:text-slate-900 transition-colors">
                            Today <ChevronDown size={12} />
                        </button>
                    </div>

                    <div className="flex flex-col items-center justify-center py-4 relative">
                        <svg className="w-32 h-32 transform -rotate-90">
                            <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-100" />
                            <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="10" fill="transparent" strokeDasharray={364.4} strokeDashoffset={364.4 * 0.08} className="text-teal-500" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-2xl font-semibold text-slate-900 tracking-tight">92%</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">SLA Met</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Avg Response</p>
                            <p className="text-lg font-semibold text-teal-600">18m</p>
                            <p className="text-[9px] font-medium text-slate-400">Within SLA</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Resolved</p>
                            <p className="text-lg font-semibold text-slate-900">42</p>
                            <p className="text-[9px] font-medium text-slate-400">Tickets today</p>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Quick Actions</h3>
                    <div className="space-y-2">
                        <button className="w-full h-11 px-4 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all">
                            <Megaphone size={14} className="text-slate-400" />
                            Create Announcement
                        </button>
                        <button className="w-full h-11 px-4 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all">
                            <BookOpen size={14} className="text-slate-400" />
                            View Knowledge Base
                        </button>
                        <button className="w-full h-11 px-4 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all">
                            <Share2 size={14} className="text-slate-400" />
                            Export Chat Report
                        </button>
                    </div>
                </div>

                {/* Help Center */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                        <LifeBuoy size={24} className="text-teal-600" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Help Center</h4>
                        <p className="text-[10px] text-slate-400 font-medium mt-1 mb-3">Browse articles and guides for common support scenarios.</p>
                        <button className="text-[10px] font-bold text-teal-600 flex items-center gap-1 hover:underline">
                            View all articles <ChevronRight size={10} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Alert (Matching Image) */}
            <div className="bg-amber-50 border border-amber-200 rounded-[1.5rem] p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-amber-800">
                    <AlertCircle size={18} />
                    <p className="text-xs font-bold">You have <span className="font-black">8 open disputes</span> that need your attention.</p>
                </div>
                <button className="h-9 px-6 bg-white border border-amber-200 text-amber-800 text-[10px] font-black rounded-xl hover:bg-amber-100 transition-all">
                    Review Disputes
                </button>
            </div>
        </div>
    );
}
