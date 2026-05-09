'use client';

/**
 * Admin Newsletter Hub.
 *
 * Capabilities the operator asked for:
 *  - Upload Clients: pick a CSV / XLS / XLSX with at minimum an Email
 *    column (Name / Region optional) and bulk-create subscribers in
 *    one shot. Calls POST /newsletter/bulk-upload.
 *  - Manual add: a small inline form to type one client at a time.
 *  - Multi-select with a status-filter pill bar (All / Active /
 *    Hidden / Blocked) and a sticky bulk-action bar (Delete / Hide /
 *    Block / Unhide / Unblock) that fires POST /newsletter/bulk-action.
 *  - Create Campaign: when rows are selected the campaign goes ONLY to
 *    those rows; otherwise it goes to every ACTIVE subscriber.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
    Mail, Search, Download, Upload, Trash2, Send, Users, Activity,
    CheckCircle2, EyeOff, Ban, X, Loader2, Plus, RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'active' | 'hidden' | 'blocked';

export default function NewsletterPage() {
    const [subscribers, setSubscribers] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('active');
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

    const router = useRouter();
    const [isExporting, setIsExporting] = React.useState(false);
    const [isCampaignOpen, setIsCampaignOpen] = React.useState(false);
    const [isAddOpen, setIsAddOpen] = React.useState(false);
    const [isSending, setIsSending] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const [uploadReport, setUploadReport] = React.useState<any>(null);
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);

    const fetchSubscribers = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/newsletter?includeHidden=true');
            if (res.ok) {
                const data = await res.json();
                setSubscribers(data);
            }
        } catch (error) {
            console.error('Failed to fetch subscribers:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { fetchSubscribers(); }, [fetchSubscribers]);

    // Clear selection whenever the filter changes — selecting a row in
    // "Active" and then jumping to "Blocked" would otherwise keep stale
    // ids hidden behind the new filter.
    React.useEffect(() => { setSelectedIds([]); }, [statusFilter]);

    const filtered = subscribers
        .filter(s => {
            if (statusFilter === 'all') return s.status !== 'HIDDEN' || statusFilter === 'all';
            if (statusFilter === 'active') return s.status === 'ACTIVE';
            if (statusFilter === 'hidden') return s.status === 'HIDDEN';
            if (statusFilter === 'blocked') return s.status === 'BLOCKED';
            return true;
        })
        .filter(s => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (s.email || '').toLowerCase().includes(q)
                || (s.name || '').toLowerCase().includes(q)
                || (s.region || '').toLowerCase().includes(q);
        });

    const toggleOne = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleAll = () => {
        if (selectedIds.length === filtered.length) setSelectedIds([]);
        else setSelectedIds(filtered.map(s => s.id));
    };

    const handleBulkAction = async (action: 'delete' | 'hide' | 'block' | 'unhide' | 'unblock') => {
        if (selectedIds.length === 0) return;
        const verb = action === 'delete' ? 'permanently delete' : action;
        if (action === 'delete' && !confirm(`Are you sure you want to ${verb} ${selectedIds.length} subscriber(s)? This cannot be undone.`)) return;
        try {
            const res = await apiFetch('/newsletter/bulk-action', {
                method: 'POST',
                body: JSON.stringify({ ids: selectedIds, action }),
            });
            if (res.ok) {
                const result = await res.json();
                toast.success(`${action.toUpperCase()} applied to ${result.affected} subscriber(s)`);
                setSelectedIds([]);
                fetchSubscribers();
            } else {
                toast.error(`Bulk ${action} failed`);
            }
        } catch (err) {
            toast.error('Network error');
        }
    };

    const handleManualAdd = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const email = String(fd.get('email') || '').trim();
        const name = String(fd.get('name') || '').trim();
        const region = String(fd.get('region') || '').trim();
        if (!email) return toast.error('Email is required');
        try {
            const res = await apiFetch('/newsletter/subscribe', {
                method: 'POST',
                body: JSON.stringify({ email, name: name || undefined, region: region || undefined, source: 'Manual Add' }),
            });
            if (res.ok) {
                toast.success('Client added');
                setIsAddOpen(false);
                fetchSubscribers();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Add failed');
            }
        } catch {
            toast.error('Network error');
        }
    };

    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        setUploadReport(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('source', 'Bulk Upload');
            const res = await apiFetch('/newsletter/bulk-upload', { method: 'POST', body: fd });
            if (res.ok) {
                const report = await res.json();
                setUploadReport(report);
                toast.success(`Imported ${report.created} new + ${report.updated} updated client(s)`);
                fetchSubscribers();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Upload failed');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleExport = () => {
        setIsExporting(true);
        const headers = ['Name', 'Email', 'Region', 'Source', 'Status', 'Date Joined'];
        const csv = [
            headers.join(','),
            ...subscribers.map(s => [
                JSON.stringify(s.name || ''),
                JSON.stringify(s.email),
                JSON.stringify(s.region || ''),
                JSON.stringify(s.source || ''),
                s.status,
                new Date(s.createdAt).toLocaleDateString(),
            ].join(',')),
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atlantis_clients_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        setTimeout(() => setIsExporting(false), 600);
    };

    const handleSendCampaign = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const subject = String(fd.get('subject') || '').trim();
        const content = String(fd.get('content') || '').trim();
        if (!subject || !content) return toast.error('Subject and content are required');

        // If the admin selected specific rows, send only to those. Otherwise
        // the campaign hits every ACTIVE subscriber.
        const recipientIds = selectedIds.length > 0 ? selectedIds : undefined;

        setIsSending(true);
        try {
            const res = await apiFetch('/newsletter/send-campaign', {
                method: 'POST',
                body: JSON.stringify({ subject, content, recipientIds }),
            });
            if (res.ok) {
                const result = await res.json();
                toast.success(`Campaign sent to ${result.successCount} of ${result.total} subscriber(s)`);
                setIsCampaignOpen(false);
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Send failed');
            }
        } catch {
            toast.error('Network error');
        } finally {
            setIsSending(false);
        }
    };

    const STATUS_TABS: { key: StatusFilter; label: string; count: number; color: string }[] = [
        { key: 'all',     label: 'All',     count: subscribers.length, color: 'text-slate-700' },
        { key: 'active',  label: 'Active',  count: subscribers.filter(s => s.status === 'ACTIVE').length, color: 'text-emerald-600' },
        { key: 'hidden',  label: 'Hidden',  count: subscribers.filter(s => s.status === 'HIDDEN').length, color: 'text-slate-500' },
        { key: 'blocked', label: 'Blocked', count: subscribers.filter(s => s.status === 'BLOCKED').length, color: 'text-rose-600' },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <input ref={fileInputRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleBulkUpload} className="hidden" />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#0F172A] p-8 rounded-[32px] text-white relative overflow-hidden shadow-2xl border border-white/5">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-[#2EC4B6]/10 blur-[120px] -rotate-12" />
                <div className="relative z-10 space-y-2">
                    <div className="flex items-center gap-3 text-[#2EC4B6] mb-2">
                        <Mail size={20} />
                        <span className="text-[11px] font-black uppercase tracking-[0.4em]">Marketing Intelligence</span>
                    </div>
                    <h1 className="text-[36px] font-black tracking-tighter">Newsletter Hub</h1>
                    <p className="text-slate-400 text-sm max-w-md font-medium leading-relaxed">Upload, manage and email your global business clients. Every send is delivered through the Atlantis transactional pipeline.</p>
                </div>
                <div className="flex items-center gap-3 relative z-10 flex-wrap justify-end">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="h-[52px] px-6 bg-white text-[#0F172A] hover:brightness-95 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all disabled:opacity-50"
                    >
                        {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        {isUploading ? 'Uploading…' : 'Upload Clients'}
                    </button>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="h-[52px] px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all"
                    >
                        <Plus size={18} /> Add Client
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isExporting || subscribers.length === 0}
                        className="h-[52px] px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        Export CSV
                    </button>
                    <button
                        onClick={() => router.push('/admin/newsletter/campaign')}
                        className="h-[52px] px-8 bg-[#2EC4B6] hover:brightness-110 text-[#0F172A] rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-2xl shadow-[#2EC4B6]/30 flex items-center gap-3 active:scale-95"
                    >
                        <Send size={18} /> Create Campaign
                    </button>
                </div>
            </div>

            {/* Upload report — shown right after a bulk import */}
            {uploadReport && (
                <div className="bg-white border border-emerald-200 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
                    <CheckCircle2 size={22} className="text-emerald-500 mt-0.5" />
                    <div className="flex-1 text-[13px] text-slate-700">
                        <p className="font-black mb-1">Bulk upload finished</p>
                        <p>
                            <span className="font-bold text-emerald-600">{uploadReport.created} created</span> · <span className="font-bold">{uploadReport.updated} updated</span> · <span className="font-bold text-amber-600">{uploadReport.skipped} skipped</span> · {uploadReport.totalRows} rows total
                        </p>
                        {uploadReport.errors?.length > 0 && (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-amber-700 font-bold">{uploadReport.errors.length} row error(s) — click to see</summary>
                                <ul className="mt-2 ml-4 list-disc text-[12px] text-slate-600 space-y-0.5 max-h-[200px] overflow-y-auto">
                                    {uploadReport.errors.slice(0, 50).map((e: any, i: number) => (
                                        <li key={i}>Row {e.row}: {e.reason}</li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                    <button onClick={() => setUploadReport(null)} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Total Clients',  value: subscribers.length.toLocaleString(), icon: Users, color: '#2EC4B6' },
                    { label: 'Active',         value: subscribers.filter(s => s.status === 'ACTIVE').length, icon: CheckCircle2, color: '#10B981' },
                    { label: 'Hidden',         value: subscribers.filter(s => s.status === 'HIDDEN').length, icon: EyeOff, color: '#64748B' },
                    { label: 'Blocked',        value: subscribers.filter(s => s.status === 'BLOCKED').length, icon: Ban, color: '#EF4444' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: stat.color }}>
                            <stat.icon size={26} />
                        </div>
                        <div>
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                            <span className="text-2xl font-black text-[#0F172A]">{stat.value}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search + Status tabs */}
            <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name, email or region…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-[48px] pl-12 pr-4 bg-slate-50 border-2 border-transparent rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-[#2EC4B6] transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                        {STATUS_TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setStatusFilter(tab.key)}
                                className={cn(
                                    'h-[40px] px-4 rounded-lg text-[12px] font-black uppercase tracking-widest transition-all flex items-center gap-2',
                                    statusFilter === tab.key
                                        ? 'bg-white shadow-sm text-[#0F172A]'
                                        : 'text-slate-500 hover:text-slate-700',
                                )}
                            >
                                {tab.label}
                                <span className={cn('text-[11px] tabular-nums', statusFilter === tab.key ? tab.color : 'text-slate-400')}>{tab.count}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Bulk action bar — only shows when at least one row is selected */}
                {selectedIds.length > 0 && (
                    <div className="px-6 py-3 bg-[#0F172A] text-white flex items-center justify-between flex-wrap gap-3">
                        <span className="text-[13px] font-bold">
                            {selectedIds.length} selected
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                            {statusFilter !== 'hidden' && (
                                <button onClick={() => handleBulkAction('hide')} className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-[12px] font-bold flex items-center gap-2">
                                    <EyeOff size={14} /> Hide
                                </button>
                            )}
                            {statusFilter === 'hidden' && (
                                <button onClick={() => handleBulkAction('unhide')} className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-[12px] font-bold flex items-center gap-2">
                                    <RotateCcw size={14} /> Unhide
                                </button>
                            )}
                            {statusFilter !== 'blocked' && (
                                <button onClick={() => handleBulkAction('block')} className="h-9 px-4 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[12px] font-bold flex items-center gap-2">
                                    <Ban size={14} /> Block
                                </button>
                            )}
                            {statusFilter === 'blocked' && (
                                <button onClick={() => handleBulkAction('unblock')} className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-[12px] font-bold flex items-center gap-2">
                                    <RotateCcw size={14} /> Unblock
                                </button>
                            )}
                            <button onClick={() => handleBulkAction('delete')} className="h-9 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-[12px] font-bold flex items-center gap-2">
                                <Trash2 size={14} /> Delete
                            </button>
                        </div>
                    </div>
                )}

                {/* Subscriber table */}
                <div className="overflow-x-auto">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4">
                            <Loader2 size={32} className="animate-spin text-[#2EC4B6]" />
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading clients…</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50">
                                    <th className="px-6 py-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={filtered.length > 0 && selectedIds.length === filtered.length}
                                            onChange={toggleAll}
                                            className="w-4 h-4 cursor-pointer accent-[#2EC4B6]"
                                        />
                                    </th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Client</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Region</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Source</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Status</th>
                                    <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Joined</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-20 text-center text-slate-400 font-bold">
                                            No clients in this view. Use <span className="text-[#0F172A]">Upload Clients</span> or <span className="text-[#0F172A]">Add Client</span> to start.
                                        </td>
                                    </tr>
                                ) : filtered.map((sub) => (
                                    <tr key={sub.id} className={cn('hover:bg-slate-50/80 transition-colors', selectedIds.includes(sub.id) && 'bg-[#2EC4B6]/5')}>
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(sub.id)}
                                                onChange={() => toggleOne(sub.id)}
                                                className="w-4 h-4 cursor-pointer accent-[#2EC4B6]"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-[#2EC4B6]/10 flex items-center justify-center text-[#2EC4B6] font-black text-[13px]">
                                                    {(sub.name || sub.email)[0].toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[14px] font-black text-[#0F172A]">{sub.name || sub.email}</span>
                                                    {sub.name && <span className="text-[11px] text-slate-500">{sub.email}</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[12px] text-slate-600 font-bold">{sub.region || '—'}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2.5 py-1 bg-slate-100 rounded-md text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                {sub.source || 'Unknown'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    'w-2 h-2 rounded-full',
                                                    sub.status === 'ACTIVE' && 'bg-emerald-500',
                                                    sub.status === 'BOUNCED' && 'bg-amber-500',
                                                    sub.status === 'UNSUBSCRIBED' && 'bg-slate-400',
                                                    sub.status === 'HIDDEN' && 'bg-slate-500',
                                                    sub.status === 'BLOCKED' && 'bg-rose-500',
                                                )} />
                                                <span className={cn(
                                                    'text-[11px] font-black uppercase tracking-widest',
                                                    sub.status === 'ACTIVE' && 'text-emerald-600',
                                                    sub.status === 'BOUNCED' && 'text-amber-600',
                                                    sub.status === 'UNSUBSCRIBED' && 'text-slate-500',
                                                    sub.status === 'HIDDEN' && 'text-slate-500',
                                                    sub.status === 'BLOCKED' && 'text-rose-600',
                                                )}>{sub.status}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[12px] text-slate-500 font-bold">{new Date(sub.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Add Client modal */}
            <AnimatePresence>
                {isAddOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddOpen(false)} className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-md" />
                        <motion.form
                            onSubmit={handleManualAdd}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-7 space-y-4"
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="text-[18px] font-black text-[#0F172A]">Add a Client</h2>
                                <button type="button" onClick={() => setIsAddOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} /></button>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Email *</label>
                                <input required name="email" type="email" placeholder="purchasing@acme.com" className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Name / Company</label>
                                <input name="name" type="text" placeholder="Acme Wholesale" className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Region</label>
                                <input name="region" type="text" placeholder="Europe" className="w-full h-12 px-4 bg-slate-50 border-2 border-transparent rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                            </div>
                            <button type="submit" className="w-full h-12 bg-[#2EC4B6] hover:brightness-110 text-[#0F172A] rounded-xl font-black uppercase text-sm tracking-widest">
                                Add Client
                            </button>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>

            {/* Create Campaign modal */}
            <AnimatePresence>
                {isCampaignOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCampaignOpen(false)} className="absolute inset-0 bg-[#0F172A]/80 backdrop-blur-md" />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden"
                        >
                            <div className="p-7 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-[#2EC4B6]/10 rounded-xl flex items-center justify-center text-[#2EC4B6]">
                                        <Send size={20} />
                                    </div>
                                    <h2 className="text-[20px] font-black text-[#0F172A]">New Campaign</h2>
                                </div>
                                <button onClick={() => setIsCampaignOpen(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={22} /></button>
                            </div>
                            <form onSubmit={handleSendCampaign} className="p-7 space-y-5">
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[12px] text-slate-700">
                                    {selectedIds.length > 0 ? (
                                        <span><span className="font-black">{selectedIds.length} selected client(s)</span> will receive this campaign.</span>
                                    ) : (
                                        <span><span className="font-black">{subscribers.filter(s => s.status === 'ACTIVE').length} active client(s)</span> will receive this campaign. Select rows in the table first to limit the audience.</span>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Subject</label>
                                    <input required name="subject" placeholder="e.g. May 2026 Wholesale Catalog Update" className="w-full h-[52px] px-5 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-[#2EC4B6]" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Email Content</label>
                                    <textarea required name="content" rows={6} placeholder="Write your message here…" className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-medium outline-none focus:bg-white focus:border-[#2EC4B6] resize-none" />
                                </div>
                                <div className="flex items-center justify-end pt-2">
                                    <button type="submit" disabled={isSending} className="h-[52px] px-10 bg-[#0F172A] hover:bg-[#2EC4B6] text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-3 disabled:opacity-50">
                                        {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                        {isSending ? 'Sending…' : 'Send Campaign'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
