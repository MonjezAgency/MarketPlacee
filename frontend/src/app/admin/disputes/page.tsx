'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle, CheckCircle2, XCircle, Clock, Eye,
    Loader2, RefreshCw, ChevronDown, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

const STATUS_STYLES: Record<string, string> = {
    OPEN: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    UNDER_REVIEW: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    RESOLVED_REFUND: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    RESOLVED_NO_REFUND: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    CLOSED: 'bg-muted text-muted-foreground border-border/50',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
    OPEN: Clock,
    UNDER_REVIEW: Eye,
    RESOLVED_REFUND: CheckCircle2,
    RESOLVED_NO_REFUND: XCircle,
    CLOSED: XCircle,
};

export default function AdminDisputesPage() {
    const [disputes, setDisputes] = React.useState<any[]>([]);
    const [stats, setStats] = React.useState<any>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [filterStatus, setFilterStatus] = React.useState('');
    const [selected, setSelected] = React.useState<any>(null);
    const [resolution, setResolution] = React.useState('');
    const [isResolving, setIsResolving] = React.useState(false);
    const [resolveError, setResolveError] = React.useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('bev-token') : '';
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const url = filterStatus
                ? `${API_URL}/disputes?status=${filterStatus}&limit=50`
                : `${API_URL}/disputes?limit=50`;
            const [disputesRes, statsRes] = await Promise.all([
                fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/disputes/stats`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (disputesRes.ok) setDisputes((await disputesRes.json()).data || []);
            if (statsRes.ok) setStats(await statsRes.json());
        } finally { setIsLoading(false); }
    }, [filterStatus, token]);

    React.useEffect(() => { fetchData(); }, [fetchData]);

    const handleMarkUnderReview = async (id: string) => {
        await fetch(`${API_URL}/disputes/${id}/status`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'UNDER_REVIEW' }),
        });
        fetchData();
    };

    const handleResolve = async (decision: 'RESOLVED_REFUND' | 'RESOLVED_NO_REFUND') => {
        if (!resolution.trim()) { setResolveError('Resolution note is required'); return; }
        if (!selected) return;
        setIsResolving(true);
        setResolveError('');
        try {
            const res = await fetch(`${API_URL}/disputes/${selected.id}/resolve`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ decision, resolution: resolution.trim() }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setResolveError(err.message || 'Failed to resolve');
                return;
            }
            setSelected(null);
            setResolution('');
            fetchData();
        } finally { setIsResolving(false); }
    };

    const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
        <div className="bg-card border border-border/50 rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
            <p className={cn('text-3xl font-black', color)}>{value ?? 0}</p>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black">Disputes</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Review and resolve customer disputes</p>
                </div>
                <button onClick={fetchData} className="w-9 h-9 rounded-xl border border-border/50 bg-card flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Open" value={stats.open} color="text-yellow-500" />
                    <StatCard label="Under Review" value={stats.underReview} color="text-blue-500" />
                    <StatCard label="Refunded" value={stats.resolvedRefund} color="text-emerald-500" />
                    <StatCard label="No Refund" value={stats.resolvedNoRefund} color="text-muted-foreground" />
                </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                {['', 'OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_REFUND'].map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)}
                        className={cn('h-8 px-4 rounded-xl text-xs font-black border transition-all',
                            filterStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border/50 text-muted-foreground hover:border-primary/30')}>
                        {s || 'All'}
                    </button>
                ))}
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : disputes.length === 0 ? (
                <div className="bg-card border border-border/50 rounded-3xl p-12 text-center">
                    <AlertTriangle size={32} className="text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-bold">No disputes found</p>
                </div>
            ) : (
                <div className="bg-card border border-border/50 rounded-3xl overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border/50">
                                {['Dispute ID', 'Order', 'Buyer', 'Reason', 'Status', 'Date', 'Actions'].map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {disputes.map(d => {
                                const StatusIcon = STATUS_ICONS[d.status] || Clock;
                                return (
                                    <tr key={d.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3 text-xs font-black font-mono text-muted-foreground">
                                            #{d.id.slice(-6).toUpperCase()}
                                        </td>
                                        <td className="px-4 py-3 text-xs font-bold">
                                            #{d.order?.id?.slice(-8).toUpperCase()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-xs font-bold">{d.order?.buyer?.name}</p>
                                            <p className="text-[10px] text-muted-foreground">{d.order?.buyer?.email}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate">{d.reason}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border', STATUS_STYLES[d.status])}>
                                                <StatusIcon size={9} />
                                                {d.status.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-[10px] text-muted-foreground">
                                            {new Date(d.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {d.status === 'OPEN' && (
                                                    <button onClick={() => handleMarkUnderReview(d.id)}
                                                        className="h-7 px-2.5 bg-blue-500/10 text-blue-500 text-[10px] font-black rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
                                                        Review
                                                    </button>
                                                )}
                                                {['OPEN', 'UNDER_REVIEW'].includes(d.status) && (
                                                    <button onClick={() => { setSelected(d); setResolution(''); setResolveError(''); }}
                                                        className="h-7 px-2.5 bg-primary/10 text-primary text-[10px] font-black rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors">
                                                        Resolve
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Resolve Modal */}
            {selected && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="bg-card border border-border/50 rounded-3xl p-8 w-full max-w-lg space-y-5">
                        <div>
                            <h2 className="text-xl font-black">Resolve Dispute</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Dispute #{selected.id.slice(-6).toUpperCase()} — Order #{selected.order?.id?.slice(-8).toUpperCase()}
                            </p>
                        </div>
                        <div className="bg-muted/40 rounded-2xl p-4 space-y-1">
                            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Reason</p>
                            <p className="text-sm font-bold">{selected.reason}</p>
                            <p className="text-xs text-muted-foreground mt-1">{selected.description}</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Resolution Note *
                            </label>
                            <textarea
                                value={resolution}
                                onChange={e => setResolution(e.target.value)}
                                placeholder="Explain your decision to the customer..."
                                rows={4}
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-primary/50 resize-none"
                            />
                        </div>
                        {resolveError && <p className="text-xs text-red-500 font-bold">{resolveError}</p>}
                        <div className="flex gap-3">
                            <button onClick={() => setSelected(null)}
                                className="flex-1 py-3 border border-border rounded-xl font-black text-sm hover:bg-muted transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => handleResolve('RESOLVED_NO_REFUND')} disabled={isResolving}
                                className="flex-1 py-3 bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 rounded-xl font-black text-sm hover:bg-zinc-500/20 transition-colors disabled:opacity-50">
                                No Refund
                            </button>
                            <button onClick={() => handleResolve('RESOLVED_REFUND')} disabled={isResolving}
                                className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-black text-sm hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                {isResolving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                Refund
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
