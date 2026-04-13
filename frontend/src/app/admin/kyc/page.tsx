'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck, ShieldX, Clock, CheckCircle2, XCircle,
    Eye, Loader2, AlertCircle, User, X
} from 'lucide-react';
import axios from 'axios';
import { cn } from '@/lib/utils';

interface KycDoc {
    id: string;
    documentType: string;
    frontImageUrl: string;
    backImageUrl?: string;
    selfieUrl?: string;
    livenessScore?: number;
    status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    adminNotes?: string;
    createdAt: string;
    user: { id: string; name: string; email: string; role: string };
}

interface Stats {
    pending: number;
    verified: number;
    rejected: number;
    unverified: number;
}

type FilterStatus = 'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export default function AdminKycPage() {
    const API_URL = '/api';
    
    const headers = {  };

    const [docs, setDocs] = React.useState<KycDoc[]>([]);
    const [stats, setStats] = React.useState<Stats | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [filter, setFilter] = React.useState<FilterStatus>('PENDING');
    const [selected, setSelected] = React.useState<KycDoc | null>(null);
    const [adminNotes, setAdminNotes] = React.useState('');
    const [actionLoading, setActionLoading] = React.useState(false);
    const [toast, setToast] = React.useState('');

    const fetchData = async (status: FilterStatus) => {
        setLoading(true);
        try {
            const [docsRes, statsRes] = await Promise.all([
                axios.get(`${API_URL}/kyc/admin/all${status !== 'ALL' ? `?status=${status}` : ''}`, { headers }),
                axios.get(`${API_URL}/kyc/admin/stats`, { headers }),
            ]);
            setDocs(docsRes.data);
            setStats(statsRes.data);
        } catch (_e) {
            /* handle silently */
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => { fetchData(filter); }, [filter]);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const handleVerify = async (id: string) => {
        setActionLoading(true);
        try {
            await axios.patch(`${API_URL}/kyc/admin/${id}/verify`, { adminNotes }, { headers });
            showToast('✅ KYC Verified');
            setSelected(null);
            fetchData(filter);
        } catch (err: any) {
            showToast('❌ ' + (err.response?.data?.message || 'Failed'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async (id: string) => {
        if (!adminNotes.trim()) { showToast('⚠️ Please add a reason for rejection'); return; }
        setActionLoading(true);
        try {
            await axios.patch(`${API_URL}/kyc/admin/${id}/reject`, { adminNotes }, { headers });
            showToast('❌ KYC Rejected');
            setSelected(null);
            fetchData(filter);
        } catch (err: any) {
            showToast('❌ ' + (err.response?.data?.message || 'Failed'));
        } finally {
            setActionLoading(false);
        }
    };

    const statusColor: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400',
        VERIFIED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
        REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    };

    return (
        <div className="space-y-6 p-6">
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        className="fixed top-6 right-6 z-50 bg-card border border-border shadow-xl rounded-xl px-5 py-3 text-sm font-bold"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black">KYC Review Center</h1>
                        <p className="text-xs text-muted-foreground">Review and verify identity documents</p>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Pending Review', value: stats.pending, icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/30' },
                        { label: 'Verified', value: stats.verified, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
                        { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/30' },
                        { label: 'Not Submitted', value: stats.unverified, icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted/30' },
                    ].map(s => (
                        <div key={s.label} className={cn("p-4 rounded-xl border border-border", s.bg)}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{s.label}</span>
                                <s.icon className={cn("w-4 h-4", s.color)} />
                            </div>
                            <p className="text-3xl font-black">{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
                {(['ALL', 'PENDING', 'VERIFIED', 'REJECTED'] as FilterStatus[]).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                            filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                        )}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : docs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-bold">No KYC submissions found</p>
                </div>
            ) : (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="text-start px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground">User</th>
                                <th className="text-start px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground hidden md:table-cell">Document</th>
                                <th className="text-start px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Liveness</th>
                                <th className="text-start px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Status</th>
                                <th className="text-start px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground hidden md:table-cell">Submitted</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {docs.map((doc, i) => (
                                <tr key={doc.id} className={cn("border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer", i % 2 === 0 ? '' : 'bg-muted/10')}
                                    onClick={() => { setSelected(doc); setAdminNotes(doc.adminNotes || ''); }}>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <User className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">{doc.user.name}</p>
                                                <p className="text-xs text-muted-foreground">{doc.user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell">
                                        <span className="text-sm font-mono text-muted-foreground">{doc.documentType.replace(/_/g, ' ')}</span>
                                    </td>
                                    <td className="px-4 py-3 hidden lg:table-cell">
                                        {doc.livenessScore != null ? (
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
                                                    <div className={cn("h-1.5 rounded-full", doc.livenessScore >= 0.7 ? "bg-emerald-500" : "bg-red-500")}
                                                        style={{ width: `${doc.livenessScore * 100}%` }} />
                                                </div>
                                                <span className="text-xs font-bold">{(doc.livenessScore * 100).toFixed(0)}%</span>
                                            </div>
                                        ) : <span className="text-xs text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider", statusColor[doc.status])}>
                                            {doc.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                                        {new Date(doc.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button className="p-2 hover:bg-primary/10 rounded-lg transition-colors">
                                            <Eye className="w-4 h-4 text-primary" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Review Modal */}
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                        onClick={(e) => e.target === e.currentTarget && setSelected(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-5 border-b border-border">
                                <div>
                                    <h3 className="font-black text-lg">KYC Review — {selected.user.name}</h3>
                                    <p className="text-xs text-muted-foreground">{selected.user.email} · {selected.user.role}</p>
                                </div>
                                <button onClick={() => setSelected(null)} className="p-2 hover:bg-muted rounded-xl transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-5 space-y-5">
                                {/* Document Info */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Document Type</p>
                                        <p className="font-black">{selected.documentType.replace(/_/g, ' ')}</p>
                                    </div>
                                    <span className={cn("text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider", statusColor[selected.status])}>
                                        {selected.status}
                                    </span>
                                </div>

                                {/* Liveness Score */}
                                {selected.livenessScore != null && (
                                    <div className="p-4 bg-muted/30 rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold">Liveness Score</span>
                                            <span className={cn("text-sm font-black", selected.livenessScore >= 0.7 ? "text-emerald-500" : "text-red-500")}>
                                                {(selected.livenessScore * 100).toFixed(0)}%
                                                {selected.livenessScore >= 0.7 ? " ✅" : " ⚠️"}
                                            </span>
                                        </div>
                                        <div className="w-full bg-muted rounded-full h-2">
                                            <div
                                                className={cn("h-2 rounded-full transition-all", selected.livenessScore >= 0.7 ? "bg-emerald-500" : "bg-red-500")}
                                                style={{ width: `${selected.livenessScore * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Document Images */}
                                <div className="grid grid-cols-3 gap-3">
                                    {selected.frontImageUrl && (
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-muted-foreground">Front Side</p>
                                            <a href={selected.frontImageUrl} target="_blank" rel="noreferrer">
                                                <img src={selected.frontImageUrl} alt="Front" className="w-full h-32 object-cover rounded-xl border border-border hover:opacity-80 transition-opacity" />
                                            </a>
                                        </div>
                                    )}
                                    {selected.backImageUrl && (
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-muted-foreground">Back Side</p>
                                            <a href={selected.backImageUrl} target="_blank" rel="noreferrer">
                                                <img src={selected.backImageUrl} alt="Back" className="w-full h-32 object-cover rounded-xl border border-border hover:opacity-80 transition-opacity" />
                                            </a>
                                        </div>
                                    )}
                                    {selected.selfieUrl && (
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-muted-foreground">Selfie</p>
                                            <a href={selected.selfieUrl} target="_blank" rel="noreferrer">
                                                <img src={selected.selfieUrl} alt="Selfie" className="w-full h-32 object-cover rounded-xl border border-border hover:opacity-80 transition-opacity" />
                                            </a>
                                        </div>
                                    )}
                                </div>

                                {/* Admin Notes */}
                                {selected.status === 'PENDING' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold">Admin Notes</label>
                                        <textarea
                                            value={adminNotes}
                                            onChange={e => setAdminNotes(e.target.value)}
                                            placeholder="Add notes (required for rejection)..."
                                            rows={3}
                                            className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 ring-primary/30 resize-none"
                                        />
                                    </div>
                                )}

                                {selected.adminNotes && selected.status !== 'PENDING' && (
                                    <div className="p-4 bg-muted/30 rounded-xl">
                                        <p className="text-xs font-bold text-muted-foreground mb-1">Admin Notes</p>
                                        <p className="text-sm">{selected.adminNotes}</p>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                {selected.status === 'PENDING' && (
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => handleReject(selected.id)}
                                            disabled={actionLoading}
                                            className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                                        >
                                            {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldX size={16} />}
                                            Reject
                                        </button>
                                        <button
                                            onClick={() => handleVerify(selected.id)}
                                            disabled={actionLoading}
                                            className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                                        >
                                            {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                            Verify
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
