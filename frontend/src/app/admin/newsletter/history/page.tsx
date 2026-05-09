'use client';

/**
 * Campaign History — every campaign the admin sent (or saved) lives
 * here. Each row shows audience, success rate, timestamp; clicking a
 * row reopens the campaign in the builder so the admin can re-send a
 * variant without rebuilding from scratch. Delete is permanent and
 * gated by confirm().
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Send, Eye, Trash2, Loader2, Globe, Mail, CheckCircle2,
    AlertTriangle, Clock,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface CampaignRow {
    id: string;
    subject: string;
    audience: 'PLATFORM' | 'NEWSLETTER';
    sentCount: number;
    totalCount: number;
    status: 'SENT' | 'DRAFT' | 'FAILED';
    createdAt: string;
}

const asArray = (raw: any): any[] =>
    Array.isArray(raw) ? raw
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.items) ? raw.items
    : [];

export default function CampaignHistoryPage() {
    const router = useRouter();
    const [rows, setRows] = React.useState<CampaignRow[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [previewing, setPreviewing] = React.useState<{ id: string; html: string; subject: string } | null>(null);

    const fetchRows = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/newsletter/campaigns');
            if (res.ok) setRows(asArray(await res.json()));
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { fetchRows(); }, [fetchRows]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this campaign permanently? This cannot be undone.')) return;
        try {
            const res = await apiFetch(`/newsletter/campaigns/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Campaign removed from history');
                fetchRows();
            } else {
                toast.error('Delete failed');
            }
        } catch {
            toast.error('Network error');
        }
    };

    const handlePreview = async (id: string) => {
        try {
            const res = await apiFetch(`/newsletter/campaigns/${id}`);
            if (res.ok) {
                const c = await res.json();
                setPreviewing({ id: c.id, html: c.html, subject: c.subject });
            }
        } catch {}
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-16">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <Link href="/admin/newsletter" className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50">
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#2EC4B6]">Marketing</p>
                        <h1 className="text-[26px] font-black tracking-tight text-[#0F172A]">Campaign History</h1>
                    </div>
                </div>
                <Link href="/admin/newsletter/campaign" className="h-12 px-6 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-xl text-[12px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
                    <Send size={14} /> New Campaign
                </Link>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                {isLoading ? (
                    <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#2EC4B6]" size={28} /></div>
                ) : rows.length === 0 ? (
                    <div className="py-20 text-center text-slate-400">
                        <Clock size={28} className="mx-auto mb-3 opacity-40" />
                        <p className="font-bold text-slate-500">No campaigns yet</p>
                        <p className="text-[13px] mt-1">Build and send your first campaign — it'll show up here automatically.</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Subject</th>
                                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Audience</th>
                                <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Delivery</th>
                                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">When</th>
                                <th className="px-5 py-3 w-32"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(r => {
                                const aud = r.audience === 'PLATFORM' ? Globe : Mail;
                                const Aud = aud;
                                const audLabel = r.audience === 'PLATFORM' ? 'All platform' : 'Newsletter';
                                const success = r.totalCount > 0 ? Math.round((r.sentCount / r.totalCount) * 100) : 0;
                                return (
                                    <tr key={r.id} className="hover:bg-slate-50/60">
                                        <td className="px-5 py-4">
                                            <div className="font-black text-[14px] text-[#0F172A]">{r.subject}</div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] font-bold text-slate-700">
                                                <Aud size={12} /> {audLabel}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <span className="text-[13px] font-bold text-[#0F172A] tabular-nums">{r.sentCount}</span>
                                            <span className="text-[11px] text-slate-400 tabular-nums"> / {r.totalCount}</span>
                                            <span className="ml-2 text-[11px] font-bold text-emerald-600 tabular-nums">{success}%</span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={cn(
                                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold',
                                                r.status === 'SENT' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                                r.status === 'DRAFT' && 'bg-amber-50 text-amber-700 border-amber-200',
                                                r.status === 'FAILED' && 'bg-rose-50 text-rose-700 border-rose-200',
                                            )}>
                                                {r.status === 'SENT' ? <CheckCircle2 size={12} /> : r.status === 'FAILED' ? <AlertTriangle size={12} /> : <Clock size={12} />}
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-[12px] text-slate-500 font-bold whitespace-nowrap">
                                            {new Date(r.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4 text-right whitespace-nowrap">
                                            <button onClick={() => handlePreview(r.id)} title="Preview" className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 rounded-lg"><Eye size={15} /></button>
                                            <button
                                                onClick={() => router.push(`/admin/newsletter/campaign?reopen=${r.id}`)}
                                                title="Re-open in builder"
                                                className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-[#2EC4B6] hover:bg-slate-100 rounded-lg"
                                            ><Send size={15} /></button>
                                            <button onClick={() => handleDelete(r.id)} title="Delete" className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={15} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Preview iframe overlay */}
            {previewing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#0F172A]/80 backdrop-blur-md">
                    <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col" style={{ height: '85vh' }}>
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preview</p>
                                <h3 className="text-[15px] font-black text-[#0F172A]">{previewing.subject}</h3>
                            </div>
                            <button onClick={() => setPreviewing(null)} className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center">✕</button>
                        </div>
                        <iframe srcDoc={previewing.html} className="flex-1 w-full bg-slate-100 border-0" title="campaign preview" />
                    </div>
                </div>
            )}
        </div>
    );
}
