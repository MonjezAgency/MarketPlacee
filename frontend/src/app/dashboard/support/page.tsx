'use client';
import { apiFetch, getToken } from "@/lib/api";

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SupportChat } from '@/components/chat/SupportChat';
import { useAuth } from '@/lib/auth';
import {
    MessageCircle, ShieldCheck, Search, AlertCircle,
    ShoppingCart, Users, Clock, CheckCircle2, XCircle,
    Eye, ChevronRight, Star, Package, RefreshCw, Receipt,
    Loader2, UserCheck, Filter, Bot, UserCheck2, Zap,
    TrendingUp, TrendingDown, Activity, Info, FileText,
    History, ExternalLink, Download, LayoutDashboard,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { cn } from '@/lib/utils';

const API_URL = '/api';

// ─── Design Tokens ──────────────────────────────────────────────────────────
const COLORS = {
    primary: '#FF6B00',
    secondary: '#131921',
    accent: '#232F3E',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
};

const PRIORITY_STYLES = {
    HIGH: 'bg-red-500/10 text-red-500 border-red-500/20',
    MEDIUM: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    LOW: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

// ─── UI Components ──────────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, trend, trendValue, color }: any) {
    const isUp = trend === 'up';
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#131921] border border-white/5 rounded-2xl p-5 shadow-2xl relative overflow-hidden group"
        >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Icon size={48} />
            </div>
            <div className="flex items-center justify-between mb-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
                    <Icon size={18} />
                </div>
                {trend && (
                    <div className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black",
                        isUp ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                    )}>
                        {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {trendValue}%
                    </div>
                )}
            </div>
            <p className="text-2xl font-black text-white tracking-tight">{value ?? '—'}</p>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-1">{label}</p>
        </motion.div>
    );
}

// ─── Customer-facing support page ───────────────────────────────────────────
function CustomerSupportView() {
    return (
        <div className="flex flex-col h-[calc(100vh-80px)] bg-[#0A0D12] rounded-[2.5rem] overflow-hidden border border-white/10">
            <SupportChat />
        </div>
    );
}

// ─── Support HQ Dashboard ────────────────────────────────────────────────────
export default function SupportPage() {
    const { user } = useAuth();
    const userRole = user?.role?.toUpperCase();
    const isSupportTeam = ['SUPPORT', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'LOGISTICS', 'OWNER'].includes(userRole || '');

    if (!isSupportTeam) return <CustomerSupportView />;

    const [stats, setStats] = React.useState<any>(null);
    const [disputes, setDisputes] = React.useState<any[]>([]);
    const [orders, setOrders] = React.useState<any[]>([]);
    const [kycList, setKycList] = React.useState<any[]>([]);
    const [conversations, setConversations] = React.useState<any[]>([]);
    const [selectedUser, setSelectedUser] = React.useState<any>(null);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [switchingId, setSwitchingId] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [rightPanelTab, setRightPanelTab] = React.useState<'chat' | 'order' | 'customer'>('chat');
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
            if (chatData.status === 'fulfilled') setConversations(Array.isArray(chatData.value) ? chatData.value : []);
        } catch (_e) {
            // silently ignore fetch errors
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    React.useEffect(() => { fetchAll(); }, [fetchAll]);

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

    const handleSwitch = async (userId: string) => {
        setSwitchingId(userId);
        try {
            await apiFetch(`/chat/admin/switch/${userId}`, { method: 'PATCH' });
            await fetchAll(true);
            const conv = conversations.find(c => c.id === userId);
            if (conv) setSelectedUser(conv);
        } finally { setSwitchingId(null); }
    };

    const handleSwitchAI = async (userId: string) => {
        setSwitchingId(userId);
        try {
            await apiFetch(`/chat/admin/switch-ai/${userId}`, { method: 'PATCH' });
            await fetchAll(true);
            const conv = conversations.find(c => c.id === userId);
            if (conv) setSelectedUser(conv);
        } finally { setSwitchingId(null); }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Initializing Command Center...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10 max-w-[1600px] mx-auto">
            {/* Header Area */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-white/5 pb-8">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-2xl shadow-primary/20">
                        <LayoutDashboard size={28} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">Support HQ</h1>
                        <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.4em] mt-3 flex items-center gap-2">
                            <Activity size={10} className="text-emerald-500" /> 
                            Operational Control Center · v2.4
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => fetchAll(true)} disabled={isRefreshing}
                        className="h-14 px-8 flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-50 transition-all">
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                        Synchronize
                    </button>
                    <a href="/admin" className="h-14 w-14 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all">
                        <ChevronRight size={18} />
                    </a>
                </div>
            </div>

            {/* KPI Row (5 Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <KPICard icon={AlertCircle} label="Open Disputes" value={stats?.OPEN ?? 0} trend="down" trendValue={12} color="bg-red-500/10 text-red-500" />
                <KPICard icon={Clock} label="Under Review" value={stats?.UNDER_REVIEW ?? 0} trend="up" trendValue={5} color="bg-amber-500/10 text-amber-500" />
                <KPICard icon={UserCheck} label="KYC Pending" value={kycList.length} color="bg-blue-500/10 text-blue-500" />
                <KPICard icon={MessageCircle} label="Active Chats" value={conversations.length} trend="up" trendValue={24} color="bg-primary/10 text-primary" />
                <KPICard icon={Activity} label="SLA Compliance" value="98.2%" trend="up" trendValue={1.4} color="bg-emerald-500/10 text-emerald-500" />
            </div>

            {/* Main Grid: 70% Conversations | 30% Active Context */}
            <div className="grid grid-cols-1 xl:grid-cols-10 gap-6 h-[calc(100vh-320px)] min-h-[700px]">
                
                {/* Left (70%): Conversations List */}
                <div className="xl:col-span-7 bg-[#131921] border border-white/5 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="relative flex-1 max-w-md">
                                <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Search by customer name, email, or order ID..." 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full h-12 bg-white/5 rounded-2xl ps-12 pe-4 text-sm text-white placeholder:text-white/20 outline-none border border-transparent focus:border-primary/30 transition-all"
                                />
                            </div>
                            <button className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:text-white">
                                <Filter size={18} />
                            </button>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{conversations.length} Threads</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        {conversations
                            .filter(c => !searchTerm || c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || c.email?.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map((conv, idx) => {
                                // Priority Logic (Mocked based on category or content)
                                const priority = conv.lastMessage?.toLowerCase().includes('payment') || conv.lastMessage?.toLowerCase().includes('نزاع') ? 'HIGH' : 
                                               conv.lastMessage?.toLowerCase().includes('delay') ? 'MEDIUM' : 'LOW';

                                return (
                                    <motion.button
                                        key={conv.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.02 }}
                                        onClick={() => setSelectedUser(conv)}
                                        className={cn(
                                            "w-full p-5 flex items-center gap-6 border-b border-white/[0.02] text-start transition-all group",
                                            selectedUser?.id === conv.id ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-white/[0.02]"
                                        )}
                                    >
                                        <div className="relative shrink-0">
                                            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center font-black text-white text-xl">
                                                {(conv.name || '?')[0]}
                                            </div>
                                            <div className={cn(
                                                "absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-[#131921] flex items-center justify-center",
                                                conv.isHandedOver ? "bg-emerald-500" : "bg-blue-500"
                                            )}>
                                                {conv.isHandedOver ? <UserCheck2 size={10} className="text-white" /> : <Bot size={10} className="text-white" />}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="text-sm font-black text-white truncate">{conv.name}</h4>
                                                <span className="text-[9px] font-black text-white/30 uppercase tracking-tighter">
                                                    {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-white/40 truncate font-medium mb-3">
                                                {conv.lastMessage || 'No messages yet...'}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span className={cn("text-[8px] font-black px-2 py-1 rounded-lg border uppercase tracking-widest", PRIORITY_STYLES[priority])}>
                                                    {priority} Priority
                                                </span>
                                                <span className="text-[8px] font-black px-2 py-1 rounded-lg border border-white/5 bg-white/5 text-white/40 uppercase tracking-widest">
                                                    {conv.isHandedOver ? 'Assigned' : 'AI Routing'}
                                                </span>
                                                {conv.unread > 0 && (
                                                    <span className="bg-red-500 text-white text-[8px] font-black px-2 py-1 rounded-lg animate-pulse">
                                                        {conv.unread} NEW
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <ChevronRight size={16} className="text-white/10 group-hover:text-primary transition-colors" />
                                    </motion.button>
                                );
                            })}
                        
                        {conversations.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-white/20">
                                <MessageCircle size={48} className="mb-4 opacity-10" />
                                <p className="text-sm font-black uppercase tracking-widest">Awaiting inquiries...</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right (30%): Active Chat & Context */}
                <div className="xl:col-span-3 flex flex-col gap-6 overflow-hidden">
                    
                    {/* Main Context Card */}
                    <div className="flex-1 bg-[#131921] border border-white/5 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
                        <div className="p-2 border-b border-white/5 flex gap-1">
                            {(['chat', 'order', 'customer'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setRightPanelTab(t)}
                                    className={cn(
                                        "flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        rightPanelTab === t ? "bg-primary text-white" : "text-white/30 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 relative overflow-hidden">
                            {selectedUser ? (
                                <AnimatePresence mode="wait">
                                    {rightPanelTab === 'chat' && (
                                        <motion.div 
                                            key="chat"
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                            className="h-full flex flex-col"
                                        >
                                            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("w-2 h-2 rounded-full", selectedUser.isHandedOver ? "bg-emerald-500" : "bg-blue-500")} />
                                                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                                                        {selectedUser.isHandedOver ? 'Human Active' : 'AI Assistant'}
                                                    </span>
                                                </div>
                                                <div className="flex gap-2">
                                                    {selectedUser.isHandedOver ? (
                                                        <button 
                                                            onClick={() => handleSwitchAI(selectedUser.id)}
                                                            className="p-2 bg-white/5 hover:bg-primary/20 hover:text-primary rounded-xl transition-all"
                                                            title="Switch to AI"
                                                        >
                                                            <Bot size={14} />
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => handleSwitch(selectedUser.id)}
                                                            className="p-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl transition-all shadow-lg"
                                                            title="Take Control"
                                                        >
                                                            <Zap size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <SupportChat isSupport={true} targetUserId={selectedUser.id} />
                                            </div>
                                        </motion.div>
                                    )}

                                    {rightPanelTab === 'order' && (
                                        <motion.div 
                                            key="order"
                                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                            className="p-6 space-y-6 overflow-y-auto h-full no-scrollbar"
                                        >
                                            <h5 className="text-xs font-black text-white uppercase tracking-widest mb-4">Latest Order Reference</h5>
                                            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-white/40 uppercase">Status</span>
                                                    <span className="px-2 py-1 bg-primary/10 text-primary text-[9px] font-black rounded-lg">SHIPPED</span>
                                                </div>
                                                <div className="flex items-center justify-between text-white">
                                                    <span className="text-[10px] font-black text-white/40 uppercase">Total Value</span>
                                                    <span className="text-sm font-black">$1,240.00</span>
                                                </div>
                                                <div className="pt-4 border-t border-white/5">
                                                    <p className="text-[10px] font-black text-white/40 uppercase mb-3">Items</p>
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-primary"><Package size={14} /></div>
                                                            <span className="text-xs font-bold text-white/80">Industrial Compressor x1</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button className="w-full py-3 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2">
                                                    <ExternalLink size={12} /> Full Transaction Ledger
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {rightPanelTab === 'customer' && (
                                        <motion.div 
                                            key="customer"
                                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                            className="p-6 space-y-6 overflow-y-auto h-full no-scrollbar"
                                        >
                                            <div className="text-center pb-6">
                                                <div className="w-20 h-20 rounded-[2rem] bg-white/5 border-2 border-primary/20 flex items-center justify-center mx-auto mb-4 font-black text-white text-3xl">
                                                    {(selectedUser.name || '?')[0]}
                                                </div>
                                                <h4 className="text-lg font-black text-white">{selectedUser.name}</h4>
                                                <p className="text-xs text-white/40 font-medium">{selectedUser.email}</p>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="bg-white/5 rounded-2xl p-4 flex items-center gap-4">
                                                    <Users size={16} className="text-primary" />
                                                    <div>
                                                        <p className="text-[9px] font-black text-white/30 uppercase">Relationship Type</p>
                                                        <p className="text-xs font-bold text-white">Wholesale Customer</p>
                                                    </div>
                                                </div>
                                                <div className="bg-white/5 rounded-2xl p-4 flex items-center gap-4">
                                                    <History size={16} className="text-primary" />
                                                    <div>
                                                        <p className="text-[9px] font-black text-white/30 uppercase">Member Since</p>
                                                        <p className="text-xs font-bold text-white">August 2023</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-white/10">
                                    <ShieldCheck size={48} className="mb-4 opacity-5" />
                                    <p className="text-xs font-black uppercase tracking-widest">Select a Thread to begin processing</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Operational Health Widget */}
                    <div className="bg-[#131921] border border-white/5 rounded-[2.5rem] p-6 shadow-2xl">
                        <h5 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Support Health</h5>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-white/80 uppercase">Avg Response</span>
                                <span className="text-xs font-black text-emerald-500">2m 14s</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 w-[92%]" />
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <span className="text-[10px] font-black text-white/80 uppercase">Resolved Today</span>
                                <span className="text-xs font-black text-white">142</span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-2 gap-3">
                        <button className="h-12 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black uppercase text-white hover:bg-primary hover:border-primary transition-all flex items-center justify-center gap-2">
                            <FileText size={12} /> Reports
                        </button>
                        <button className="h-12 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-black uppercase text-white hover:bg-primary hover:border-primary transition-all flex items-center justify-center gap-2">
                            <Download size={12} /> Export
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
