'use client';
import { apiFetch, getToken } from "@/lib/api";

import * as React from 'react';
import { motion } from 'framer-motion';
import { SupportChat } from '@/components/chat/SupportChat';
import { useAuth } from '@/lib/auth';
import {
    MessageCircle, ShieldCheck, Search, AlertCircle,
    ShoppingCart, Users, Clock, CheckCircle2, XCircle,
    Eye, ChevronRight, Star, Package, RefreshCw,
    Loader2, UserCheck, Filter, Bot, UserCheck2, Zap,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { cn } from '@/lib/utils';

const API_URL = '/api';

type Tab = 'overview' | 'disputes' | 'orders' | 'kyc' | 'chat';

const DISPUTE_STATUS_COLORS: Record<string, string> = {
    OPEN: 'bg-red-500/10 text-red-500 border-red-500/20',
    UNDER_REVIEW: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    RESOLVED_REFUND: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    RESOLVED_NO_REFUND: 'bg-muted/50 text-muted-foreground border-border/50',
    CLOSED: 'bg-muted/30 text-muted-foreground/50 border-border/30',
};

function StatCard({ icon: Icon, label, value, color, onClick }: any) {
    return (
        <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onClick}
            className="w-full text-left glass-card p-6 hover:border-primary/30 transition-all group hover:scale-[1.02]"
        >
            <div className="flex items-start justify-between">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", color)}>
                    <Icon size={20} />
                </div>
                <ChevronRight size={14} className="text-muted-foreground/30 group-hover:text-primary transition-colors mt-1" />
            </div>
            <p className="text-3xl font-black font-heading mt-4">{value ?? '—'}</p>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-2">{label}</p>
        </motion.button>
    );
}

// ─── Customer-facing support page ───────────────────────────────────────────
function CustomerSupportView() {
    return (
        <div className="flex flex-col h-[calc(100vh-80px)] bg-accent/5 rounded-3xl overflow-hidden border border-border/50">
            <SupportChat />
        </div>
    );
}

// ─── Support Team full dashboard ─────────────────────────────────────────────
export default function SupportPage() {
    const { user } = useAuth();
    const userRole = user?.role?.toUpperCase();
    const isSupportTeam = ['SUPPORT', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'LOGISTICS'].includes(userRole || '');

    if (!isSupportTeam) return <CustomerSupportView />;

    const [tab, setTab] = React.useState<Tab>('overview');
    const [stats, setStats] = React.useState<any>(null);
    const [disputes, setDisputes] = React.useState<any[]>([]);
    const [orders, setOrders] = React.useState<any[]>([]);
    const [kycList, setKycList] = React.useState<any[]>([]);
    const [conversations, setConversations] = React.useState<any[]>([]);
    const [selectedUser, setSelectedUser] = React.useState<any>(null);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [switchingId, setSwitchingId] = React.useState<string | null>(null);
    const socketRef = React.useRef<Socket | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [disputeFilter, setDisputeFilter] = React.useState<string>('OPEN');

    

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
            // silently ignore fetch errors — Promise.allSettled handles partial failures
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    React.useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Real-time WebSocket for conversation list updates ─────────────────────
    React.useEffect(() => {
        const tok = getToken();
        if (!tok) return;
        const socket = io(`${API_URL}/chat`, {
            auth: { token: tok },
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        // New inquiry from customer → refresh conversations list immediately
        socket.on('new_inquiry', () => { fetchAll(true); });
        // Any conversation updated (support replied, etc.)
        socket.on('conversation_updated', () => { fetchAll(true); });

        return () => { socket.disconnect(); socketRef.current = null; };
    }, [fetchAll]);

    const handleDisputeAction = async (id: string, action: 'review' | 'refund' | 'no_refund') => {
        if (action === 'review') {
            await apiFetch(`/disputes/${id}/status`, {
                method: 'PATCH', body: JSON.stringify({ status: 'UNDER_REVIEW' }),
            });
        } else {
            const decision = action === 'refund' ? 'RESOLVED_REFUND' : 'RESOLVED_NO_REFUND';
            const resolution = action === 'refund' ? 'Refund approved after review.' : 'No refund issued after review.';
            await apiFetch(`/disputes/${id}/resolve`, {
                method: 'PATCH', body: JSON.stringify({ decision, resolution }),
            });
        }
        fetchAll(true);
    };

    const handleSwitch = async (userId: string) => {
        setSwitchingId(userId);
        try {
            await apiFetch(`/chat/admin/switch/${userId}`, {
                method: 'PATCH',
            });
            await fetchAll(true);
            // Auto-open this conversation after switching
            const conv = conversations.find(c => c.id === userId);
            if (conv) setSelectedUser(conv);
            setTab('chat');
        } finally {
            setSwitchingId(null);
        }
    };

    const filteredDisputes = disputes.filter(d =>
        disputeFilter === 'ALL' ? true : d.status === disputeFilter
    );

    const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
        { id: 'overview', label: 'Overview', icon: ShieldCheck },
        { id: 'disputes', label: 'Disputes', icon: AlertCircle, badge: stats?.OPEN },
        { id: 'orders', label: 'Orders', icon: ShoppingCart },
        { id: 'kyc', label: 'KYC Queue', icon: UserCheck, badge: kycList.length },
        { id: 'chat', label: 'Live Chat', icon: MessageCircle, badge: conversations.filter(c => c.unread).length || undefined },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <a
                        href="/admin"
                        className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-sm"
                        title="Back to Dashboard"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </a>
                    <div>
                        <h1 className="text-2xl font-black font-heading tracking-tighter uppercase">Support Dashboard</h1>
                        <p className="text-sm text-muted-foreground font-bold mt-0.5">Manage disputes, orders, KYC, and live chat.</p>
                    </div>
                </div>
                <button onClick={() => fetchAll(true)} disabled={isRefreshing}
                    className="h-10 px-5 flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground text-xs font-black hover:opacity-90 disabled:opacity-50 transition-all">
                    <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 flex-wrap p-1.5 bg-muted/30 rounded-2xl border border-border/50 w-fit">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={cn(
                            "h-10 px-5 rounded-xl text-xs font-black flex items-center gap-2 transition-all relative",
                            tab === t.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}>
                        <t.icon size={14} />
                        {t.label}
                        {t.badge ? (
                            <span className="absolute -top-1.5 -end-1.5 w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-lg">
                                {t.badge > 9 ? '9+' : t.badge}
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>

            {/* ── Overview ── */}
            {tab === 'overview' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard icon={AlertCircle} label="Open Disputes" value={stats?.OPEN ?? 0}
                            color="bg-red-500/10 text-red-500" onClick={() => setTab('disputes')} />
                        <StatCard icon={Clock} label="Under Review" value={stats?.UNDER_REVIEW ?? 0}
                            color="bg-amber-500/10 text-amber-500" onClick={() => setTab('disputes')} />
                        <StatCard icon={UserCheck} label="KYC Pending" value={kycList.length}
                            color="bg-blue-500/10 text-blue-500" onClick={() => setTab('kyc')} />
                        <StatCard icon={MessageCircle} label="Conversations" value={conversations.length}
                            color="bg-primary/10 text-primary" onClick={() => setTab('chat')} />
                    </div>

                    {/* Quick actions: latest open disputes */}
                    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-widest">Urgent — Open Disputes</h3>
                            <button onClick={() => setTab('disputes')} className="text-xs font-bold text-primary hover:underline">View all</button>
                        </div>
                        {disputes.filter(d => d.status === 'OPEN').slice(0, 5).length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500" />
                                No open disputes
                            </div>
                        ) : (
                            disputes.filter(d => d.status === 'OPEN').slice(0, 5).map(d => (
                                <div key={d.id} className="flex items-center justify-between px-5 py-3 border-b border-border/20 hover:bg-muted/20 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold">{d.reason?.replace(/_/g, ' ')}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {d.buyer?.name || '—'} · Order #{d.orderId?.slice(-8).toUpperCase()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border uppercase", DISPUTE_STATUS_COLORS[d.status])}>
                                            {d.status}
                                        </span>
                                        <button onClick={() => handleDisputeAction(d.id, 'review')}
                                            className="h-7 px-3 bg-amber-500/10 text-amber-600 text-[10px] font-black rounded-lg hover:bg-amber-500/20 transition-colors">
                                            Take Over
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Recent KYC pending */}
                    {kycList.length > 0 && (
                        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
                                <h3 className="text-sm font-black uppercase tracking-widest">KYC Awaiting Review</h3>
                                <button onClick={() => setTab('kyc')} className="text-xs font-bold text-primary hover:underline">View all</button>
                            </div>
                            {kycList.slice(0, 4).map((kyc: any) => (
                                <div key={kyc.id} className="flex items-center justify-between px-5 py-3 border-b border-border/20">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center font-black text-primary text-sm">
                                            {(kyc.user?.name || kyc.name || '?')[0]}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold">{kyc.user?.name || kyc.name || '—'}</p>
                                            <p className="text-xs text-muted-foreground">{kyc.documentType} · {new Date(kyc.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <a href="/admin/kyc"
                                        className="h-7 px-3 bg-primary/10 text-primary text-[10px] font-black rounded-lg hover:bg-primary/20 transition-colors flex items-center gap-1">
                                        <Eye size={11} /> Review
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Disputes ── */}
            {tab === 'disputes' && (
                <div className="space-y-4">
                    {/* Filter */}
                    <div className="flex gap-2 flex-wrap items-center">
                        <Filter size={13} className="text-muted-foreground" />
                        {['ALL', 'OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_REFUND'].map(s => (
                            <button key={s} onClick={() => setDisputeFilter(s)}
                                className={cn("h-7 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors",
                                    disputeFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                                )}>
                                {s.replace(/_/g, ' ')} ({s === 'ALL' ? disputes.length : disputes.filter(d => d.status === s).length})
                            </button>
                        ))}
                    </div>

                    {filteredDisputes.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <AlertCircle size={32} className="mx-auto mb-3 opacity-20" />
                            <p className="font-bold text-sm">No disputes in this category</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredDisputes.map((d, i) => (
                                <motion.div key={d.id}
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                                    className="bg-card border border-border/50 rounded-2xl p-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border uppercase", DISPUTE_STATUS_COLORS[d.status])}>
                                                    {d.status.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground font-bold">
                                                    #{d.orderId?.slice(-8).toUpperCase()}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {new Date(d.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="font-black text-sm">{d.reason?.replace(/_/g, ' ')}</p>
                                            <p className="text-xs text-muted-foreground line-clamp-2">{d.description}</p>
                                            <p className="text-xs font-bold text-muted-foreground">
                                                Buyer: {d.buyer?.name || '—'} · {d.buyer?.email || '—'}
                                            </p>
                                        </div>
                                        {(d.status === 'OPEN' || d.status === 'UNDER_REVIEW') && (
                                            <div className="flex flex-col gap-2 shrink-0">
                                                {d.status === 'OPEN' && (
                                                    <button onClick={() => handleDisputeAction(d.id, 'review')}
                                                        className="h-8 px-3 bg-amber-500/10 text-amber-600 text-[10px] font-black rounded-xl hover:bg-amber-500/20 transition-colors whitespace-nowrap">
                                                        Take Over
                                                    </button>
                                                )}
                                                <button onClick={() => handleDisputeAction(d.id, 'refund')}
                                                    className="h-8 px-3 bg-emerald-500/10 text-emerald-600 text-[10px] font-black rounded-xl hover:bg-emerald-500/20 transition-colors whitespace-nowrap">
                                                    ✓ Refund
                                                </button>
                                                <button onClick={() => handleDisputeAction(d.id, 'no_refund')}
                                                    className="h-8 px-3 bg-red-500/10 text-red-500 text-[10px] font-black rounded-xl hover:bg-red-500/20 transition-colors whitespace-nowrap">
                                                    ✗ No Refund
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Orders ── */}
            {tab === 'orders' && (
                <div className="space-y-3">
                    <div className="relative mb-4">
                        <Search size={14} className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search by order ID or buyer name..."
                            className="w-full h-11 bg-muted rounded-2xl ps-10 pe-4 text-sm outline-none border border-border/50 focus:border-primary/50" />
                    </div>
                    {orders
                        .filter(o => !searchTerm ||
                            o.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            o.buyer?.name?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map((o: any, i: number) => (
                            <motion.div key={o.id}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                                className="bg-card border border-border/50 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Package size={16} className="text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black">#{o.id?.slice(-8).toUpperCase()}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {o.buyer?.name || '—'} · {new Date(o.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-end">
                                    <p className="text-sm font-black">${Number(o.totalAmount || 0).toFixed(2)}</p>
                                    <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border uppercase",
                                        o.status === 'DELIVERED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                        o.status === 'CANCELLED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                        'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                    )}>
                                        {o.status}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                </div>
            )}

            {/* ── KYC Queue ── */}
            {tab === 'kyc' && (
                <div className="space-y-3">
                    {kycList.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-500 opacity-60" />
                            <p className="font-bold text-sm">No pending KYC reviews</p>
                        </div>
                    ) : (
                        kycList.map((kyc: any, i: number) => (
                            <motion.div key={kyc.id}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                                className="bg-card border border-border/50 rounded-2xl p-5 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center font-black text-blue-500">
                                        {(kyc.user?.name || kyc.name || '?')[0]}
                                    </div>
                                    <div>
                                        <p className="font-black text-sm">{kyc.user?.name || kyc.name || '—'}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {kyc.documentType} · Submitted {new Date(kyc.createdAt).toLocaleDateString()}
                                        </p>
                                        {kyc.livenessScore !== undefined && (
                                            <p className="text-xs font-bold text-amber-500">
                                                Liveness Score: {(kyc.livenessScore * 100).toFixed(0)}%
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <a href="/admin/kyc"
                                    className="h-9 px-4 bg-primary text-primary-foreground text-[11px] font-black rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2">
                                    <Eye size={13} /> Review in KYC Panel
                                </a>
                            </motion.div>
                        ))
                    )}
                </div>
            )}

            {/* ── Live Chat ── */}
            {tab === 'chat' && (
                <div className="flex gap-4 h-[72vh]">
                    {/* Conversations list */}
                    <div className="w-80 bg-card border border-border/50 rounded-2xl overflow-hidden flex flex-col shrink-0">
                        {/* Search */}
                        <div className="p-3 border-b border-border/30 space-y-2">
                            <div className="relative">
                                <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Search users..."
                                    className="w-full bg-muted rounded-xl ps-9 pe-4 py-2 text-xs outline-none" />
                            </div>
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                    {conversations.length} conversations
                                </span>
                                <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                                    Live
                                </span>
                            </div>
                        </div>

                        {/* Conversation rows */}
                        <div className="flex-1 overflow-y-auto divide-y divide-border/20">
                            {conversations
                                .filter(c => c.name?.toLowerCase().includes(searchTerm.toLowerCase()))
                                .map(conv => (
                                    <div key={conv.id}
                                        className={cn(
                                            "group hover:bg-muted/20 transition-colors",
                                            selectedUser?.id === conv.id && "bg-primary/5 border-s-2 border-s-primary"
                                        )}>
                                        {/* Main row — click to open */}
                                        <button className="w-full p-3 flex items-center gap-3 text-start"
                                            onClick={() => { setSelectedUser(conv); }}>
                                            {/* Avatar */}
                                            <div className="relative shrink-0">
                                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-black text-primary text-sm">
                                                    {(conv.name || '?')[0]}
                                                </div>
                                                {/* Bot / Human indicator */}
                                                <div className={cn(
                                                    "absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-card",
                                                    conv.isHandedOver ? "bg-emerald-500" : "bg-blue-500"
                                                )}>
                                                    {conv.isHandedOver
                                                        ? <UserCheck2 size={8} className="text-white" />
                                                        : <Bot size={8} className="text-white" />}
                                                </div>
                                            </div>

                                            <div className="flex-1 overflow-hidden">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-black truncate">{conv.name}</p>
                                                    {conv.unread > 0 && (
                                                        <span className="shrink-0 w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                                                            {conv.unread > 9 ? '9+' : conv.unread}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                                    {conv.lastMessage || '—'}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className={cn(
                                                        "text-[9px] font-black px-1.5 py-0.5 rounded-full",
                                                        conv.isHandedOver
                                                            ? "bg-emerald-500/10 text-emerald-600"
                                                            : "bg-blue-500/10 text-blue-600"
                                                    )}>
                                                        {conv.isHandedOver ? '👤 Human' : '🤖 Bot'}
                                                    </span>
                                                    {conv.lastMessageAt && (
                                                        <span className="text-[9px] text-muted-foreground">
                                                            {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>

                                        {/* Switch button — only shown when still bot-handled */}
                                        {!conv.isHandedOver && (
                                            <div className="px-3 pb-2">
                                                <button
                                                    onClick={() => handleSwitch(conv.id)}
                                                    disabled={switchingId === conv.id}
                                                    className={cn(
                                                        "w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-black transition-all",
                                                        "bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20",
                                                        switchingId === conv.id && "opacity-60 cursor-wait"
                                                    )}>
                                                    {switchingId === conv.id
                                                        ? <RefreshCw size={10} className="animate-spin" />
                                                        : <Zap size={10} />}
                                                    Switch to Human
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}

                            {conversations.filter(c => c.name?.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                                    <MessageCircle size={24} className="mb-2 opacity-20" />
                                    <p className="text-xs font-bold">No conversations yet</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Chat area */}
                    <div className="flex-1 bg-card border border-border/50 rounded-2xl overflow-hidden flex flex-col">
                        {selectedUser ? (
                            <>
                                {/* Chat header with user info + status */}
                                <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-black text-primary text-sm">
                                            {(selectedUser.name || '?')[0]}
                                        </div>
                                        <div>
                                            <p className="font-black text-sm">{selectedUser.name}</p>
                                            <p className="text-[10px] text-muted-foreground">{selectedUser.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedUser.isHandedOver ? (
                                            <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full">
                                                <UserCheck2 size={10} /> Human Support Active
                                            </span>
                                        ) : (
                                            <>
                                                <span className="flex items-center gap-1 text-[10px] font-black text-blue-600 bg-blue-500/10 px-2 py-1 rounded-full">
                                                    <Bot size={10} /> Bot Handling
                                                </span>
                                                <button
                                                    onClick={() => handleSwitch(selectedUser.id)}
                                                    disabled={switchingId === selectedUser.id}
                                                    className="flex items-center gap-1.5 text-[10px] font-black bg-amber-500 text-white px-3 py-1.5 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-60">
                                                    {switchingId === selectedUser.id
                                                        ? <RefreshCw size={10} className="animate-spin" />
                                                        : <Zap size={10} />}
                                                    Switch to Human
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <SupportChat isSupport={true} targetUserId={selectedUser.id} />
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                                <MessageCircle size={36} className="mb-3 opacity-20" />
                                <p className="font-bold text-sm">Select a conversation</p>
                                <p className="text-xs mt-1 max-w-48">
                                    Choose a conversation from the list — 🤖 means the bot is handling it, click <strong>Switch</strong> to take over
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
