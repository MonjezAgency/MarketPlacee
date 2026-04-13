'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, CreditCard, Shield, Warehouse, Plus, Trash2, Check, X, AlertCircle,
    RefreshCw, Eye, DollarSign, Clock, Search, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiFetch } from '@/lib/api';

type Tab = 'invoices' | 'credit' | 'tax' | 'warehouses';

export default function AdminFinancePage() {
    return (
        <React.Suspense fallback={<div className="p-8 text-center text-muted-foreground font-medium animate-pulse">Loading finance data...</div>}>
            <AdminFinanceContent />
        </React.Suspense>
    );
}

function AdminFinanceContent() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const searchParams = useSearchParams();
    
    const initialTab = (searchParams.get('tab') as Tab) || 'invoices';
    const [tab, setTab] = React.useState<Tab>(initialTab);
    const [toast, setToast] = React.useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // Sync state with URL params
    React.useEffect(() => {
        const t = searchParams.get('tab') as Tab;
        if (t && ['invoices', 'credit', 'tax', 'warehouses'].includes(t)) {
            setTab(t);
        }
    }, [searchParams]);

    const showToast = (type: 'success' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

    // ── Invoices State ─────────────────────────────────────
    const [invoices, setInvoices] = React.useState<any[]>([]);
    const [isLoadingInvoices, setIsLoadingInvoices] = React.useState(false);

    // ── Credit Terms State ─────────────────────────────────
    const [credits, setCredits] = React.useState<any[]>([]);
    const [showNewCredit, setShowNewCredit] = React.useState(false);
    const [newCredit, setNewCredit] = React.useState({ userId: '', creditLimit: 10000, paymentTermDays: 30, notes: '' });
    const [buyers, setBuyers] = React.useState<any[]>([]);

    // ── Tax Exemptions State ───────────────────────────────
    const [exemptions, setExemptions] = React.useState<any[]>([]);

    // ── Warehouses State ───────────────────────────────────
    const [warehouses, setWarehouses] = React.useState<any[]>([]);
    const [showNewWarehouse, setShowNewWarehouse] = React.useState(false);
    const [newWarehouse, setNewWarehouse] = React.useState({ name: '', address: '', city: '', country: '', zipCode: '', supplierId: '' });
    const [suppliers, setSuppliers] = React.useState<any[]>([]);

    // ── Fetch Buyers & Suppliers ───────────────────────────
    React.useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await apiFetch(`/admin/users`);
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : data.data || [];
                    setBuyers(list.filter((u: any) => u.role === 'CUSTOMER'));
                    setSuppliers(list.filter((u: any) => u.role === 'SUPPLIER'));
                }
            } catch (e) { console.error(e); }
        };
        fetchUsers();
    }, []);

    // ── Invoices ───────────────────────────────────────────
    const fetchInvoices = async () => {
        setIsLoadingInvoices(true);
        try {
            const res = await apiFetch(`/invoices`);
            if (res.ok) setInvoices(await res.json());
        } catch (e) { console.error(e); }
        setIsLoadingInvoices(false);
    };
    React.useEffect(() => { if (tab === 'invoices') fetchInvoices(); }, [tab]);

    const markPaid = async (id: string) => {
        try {
            const res = await apiFetch(`/invoices/${id}/pay`, { method: 'POST' });
            if (res.ok) { showToast('success', t('admin', 'markedAsPaid')); fetchInvoices(); }
        } catch { showToast('error', 'Failed'); }
    };

    // ── Credit Terms ───────────────────────────────────────
    const fetchCredits = async () => {
        try {
            const res = await apiFetch(`/finance/credit-terms`);
            if (res.ok) setCredits(await res.json());
        } catch (e) { console.error(e); }
    };
    React.useEffect(() => { if (tab === 'credit') fetchCredits(); }, [tab]);

    const createCredit = async () => {
        try {
            const res = await apiFetch(`/finance/credit-terms`, {
                method: 'POST',
                body: JSON.stringify(newCredit),
            });
            if (res.ok) { showToast('success', t('admin', 'creditTermSet')); fetchCredits(); setShowNewCredit(false); }
            else { const e = await res.json(); showToast('error', e.message || 'Failed'); }
        } catch { showToast('error', 'Network error'); }
    };

    const deleteCredit = async (id: string) => {
        try {
            await apiFetch(`/finance/credit-terms/${id}`, { method: 'DELETE' });
            showToast('success', 'Deleted'); fetchCredits();
        } catch { showToast('error', 'Failed'); }
    };

    // ── Tax Exemptions ─────────────────────────────────────
    const fetchExemptions = async () => {
        try {
            const res = await apiFetch(`/finance/tax-exemptions`);
            if (res.ok) setExemptions(await res.json());
        } catch (e) { console.error(e); }
    };
    React.useEffect(() => { if (tab === 'tax') fetchExemptions(); }, [tab]);

    const reviewExemption = async (id: string, status: string) => {
        try {
            const res = await apiFetch(`/finance/tax-exemptions/${id}/review`, {
                method: 'POST',
                body: JSON.stringify({ status }),
            });
            if (res.ok) { showToast('success', `${status === 'APPROVED' ? 'Approved' : 'Rejected'}`); fetchExemptions(); }
        } catch { showToast('error', 'Failed'); }
    };

    // ── Warehouses ─────────────────────────────────────────
    const fetchWarehouses = async () => {
        try {
            const res = await apiFetch(`/finance/warehouses`);
            if (res.ok) setWarehouses(await res.json());
        } catch (e) { console.error(e); }
    };
    React.useEffect(() => { if (tab === 'warehouses') fetchWarehouses(); }, [tab]);

    const createWarehouse = async () => {
        try {
            const res = await apiFetch(`/finance/warehouses`, {
                method: 'POST',
                body: JSON.stringify(newWarehouse),
            });
            if (res.ok) { showToast('success', t('admin', 'warehouseCreated')); fetchWarehouses(); setShowNewWarehouse(false); }
            else { const e = await res.json(); showToast('error', e.message || 'Failed'); }
        } catch { showToast('error', 'Network error'); }
    };

    const deleteWarehouse = async (id: string) => {
        try {
            await apiFetch(`/finance/warehouses/${id}`, { method: 'DELETE' });
            showToast('success', 'Deleted'); fetchWarehouses();
        } catch { showToast('error', 'Failed'); }
    };

    const statusColor = (s: string) => {
        const map: Record<string, string> = { ISSUED: 'bg-blue-100 text-blue-700', PAID: 'bg-emerald-100 text-emerald-700', OVERDUE: 'bg-red-100 text-red-700', APPROVED: 'bg-emerald-100 text-emerald-700', PENDING: 'bg-amber-100 text-amber-700', REJECTED: 'bg-red-100 text-red-700', ACTIVE: 'bg-emerald-100 text-emerald-700', SUSPENDED: 'bg-red-100 text-red-700' };
        return map[s] || 'bg-gray-100 text-gray-700';
    };

    const tabs = [
        { key: 'invoices' as Tab, label: t('admin', 'tabInvoices'), icon: FileText },
        { key: 'credit' as Tab, label: t('admin', 'tabCredit'), icon: CreditCard },
        { key: 'tax' as Tab, label: t('admin', 'tabTax'), icon: Shield },
        { key: 'warehouses' as Tab, label: t('admin', 'tabWarehouses'), icon: Warehouse },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <DollarSign size={20} />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-[#0F1111] dark:text-white tracking-tight">{t('admin', 'financeAndCompliance')}</h1>
                    <p className="text-[#555] dark:text-[#999] font-medium text-sm">{t('admin', 'financeDescription')}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-2xl p-1.5 w-fit">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                            tab === t.key ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-[#888] hover:text-[#0F1111] dark:hover:text-white hover:bg-[#F3F3F3] dark:hover:bg-white/10")}>
                        <t.icon size={14} />{t.label}
                    </button>
                ))}
            </div>

            {/* ── Invoices Tab ──────────────────────── */}
            {tab === 'invoices' && (
                <div className="space-y-4">
                    {isLoadingInvoices ? <div className="py-16 flex justify-center"><RefreshCw size={24} className="animate-spin text-[#888]" /></div> :
                    invoices.length === 0 ? (
                        <div className="text-center py-16 text-[#888]">
                            <FileText size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="font-bold">No invoices yet.</p>
                            <p className="text-sm">Invoices are auto-generated when orders are confirmed.</p>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] overflow-hidden">
                            <table className="w-full text-sm">
                                <thead><tr className="border-b border-[#EAEDED] dark:border-white/10 text-[10px] font-black text-[#888] uppercase tracking-widest">
                                    <th className="p-4 text-start">Invoice #</th><th className="p-4 text-start">Buyer</th>
                                    <th className="p-4 text-end">Amount</th><th className="p-4 text-end">Tax</th>
                                    <th className="p-4 text-end">Total</th><th className="p-4 text-center">Status</th>
                                    <th className="p-4 text-center">Due</th><th className="p-4 text-center">Actions</th>
                                </tr></thead>
                                <tbody>
                                    {invoices.map(inv => (
                                        <tr key={inv.id} className="border-b border-[#EAEDED] dark:border-white/10 hover:bg-[#F7F8F8] dark:hover:bg-white/5 transition-all">
                                            <td className="p-4 font-bold text-[#0F1111] dark:text-white">{inv.invoiceNumber}</td>
                                            <td className="p-4 text-[#555] dark:text-[#999]">{inv.order?.buyer?.name || inv.buyerId}</td>
                                            <td className="p-4 text-end font-bold">${inv.amount?.toFixed(2)}</td>
                                            <td className="p-4 text-end text-[#888]">${inv.tax?.toFixed(2)}</td>
                                            <td className="p-4 text-end font-black text-[#FF9900]">${inv.totalAmount?.toFixed(2)}</td>
                                            <td className="p-4 text-center"><span className={cn("px-2 py-1 rounded-lg text-[10px] font-black uppercase", statusColor(inv.status))}>{inv.status}</span></td>
                                            <td className="p-4 text-center text-[#888] text-xs">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}</td>
                                            <td className="p-4 text-center">
                                                {inv.status === 'ISSUED' && (
                                                    <button onClick={() => markPaid(inv.id)} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase hover:scale-105 transition-all">
                                                        <Check size={12} className="inline me-1" />Paid
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Credit Terms Tab ─────────────────── */}
            {tab === 'credit' && (
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <button onClick={() => setShowNewCredit(!showNewCredit)}
                            className="h-10 px-5 bg-emerald-500 text-white rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-emerald-500/20">
                            {showNewCredit ? <X size={14} /> : <Plus size={14} />}{showNewCredit ? 'Cancel' : 'Set Credit Term'}
                        </button>
                    </div>

                    <AnimatePresence>{showNewCredit && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 space-y-6 shadow-sm">
                            <h4 className="text-xs font-black text-[#0F1111] dark:text-white uppercase tracking-widest">Set Credit Terms</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Buyer</label>
                                    <select value={newCredit.userId} onChange={e => setNewCredit({ ...newCredit, userId: e.target.value })}
                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none text-[#0F1111] dark:text-white font-medium text-sm">
                                        <option value="">Select buyer...</option>
                                        {buyers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.companyName})</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Credit Limit ($)</label>
                                    <input type="number" min={0} value={newCredit.creditLimit} onChange={e => setNewCredit({ ...newCredit, creditLimit: parseFloat(e.target.value) || 0 })}
                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none text-[#0F1111] dark:text-white font-bold text-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Payment Terms</label>
                                    <select value={newCredit.paymentTermDays} onChange={e => setNewCredit({ ...newCredit, paymentTermDays: parseInt(e.target.value) })}
                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none text-[#0F1111] dark:text-white font-bold text-sm">
                                        <option value={15}>Net 15</option><option value={30}>Net 30</option><option value={45}>Net 45</option><option value={60}>Net 60</option><option value={90}>Net 90</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button onClick={createCredit} disabled={!newCredit.userId}
                                        className={cn("w-full h-11 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                                            newCredit.userId ? "bg-emerald-500 text-white hover:scale-[1.02] shadow-lg" : "bg-[#F3F3F3] text-[#888] cursor-not-allowed")}>
                                        <Check size={14} />Set
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}</AnimatePresence>

                    {credits.length === 0 ? (
                        <div className="text-center py-16 text-[#888]"><CreditCard size={48} className="mx-auto mb-4 opacity-20" /><p className="font-bold">No credit terms set.</p></div>
                    ) : (
                        <div className="space-y-3">
                            {credits.map(c => {
                                const buyer = buyers.find(b => b.id === c.userId);
                                const usedPercent = (c.creditLimit ?? 0) > 0 ? (c.usedCredit / c.creditLimit) * 100 : 0;
                                return (
                                    <div key={c.id} className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-2xl p-6 flex items-center justify-between group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 font-black text-xs">
                                                Net{c.paymentTermDays}
                                            </div>
                                            <div>
                                                <p className="font-bold text-[#0F1111] dark:text-white">{buyer?.name || c.userId}</p>
                                                <p className="text-xs text-[#888]">{buyer?.companyName || ''}</p>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <div className="w-32 h-2 bg-[#EAEDED] dark:bg-white/10 rounded-full overflow-hidden">
                                                        <div className={cn("h-full rounded-full transition-all", usedPercent > 80 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-[#888]">${c.usedCredit.toFixed(0)} / ${c.creditLimit.toFixed(0)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={cn("px-2 py-1 rounded-lg text-[10px] font-black uppercase", statusColor(c.status))}>{c.status}</span>
                                            <button onClick={() => deleteCredit(c.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-all"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Tax Exemptions Tab ───────────────── */}
            {tab === 'tax' && (
                <div className="space-y-4">
                    {exemptions.length === 0 ? (
                        <div className="text-center py-16 text-[#888]"><Shield size={48} className="mx-auto mb-4 opacity-20" /><p className="font-bold">No tax exemption requests.</p><p className="text-sm">Buyers can upload exemption certificates from their profile.</p></div>
                    ) : exemptions.map(ex => {
                        const buyer = buyers.find(b => b.id === ex.userId);
                        return (
                            <div key={ex.id} className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-2xl p-6 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600"><Shield size={18} /></div>
                                    <div>
                                        <p className="font-bold text-[#0F1111] dark:text-white">{buyer?.name || ex.userId}</p>
                                        <p className="text-xs text-[#888]">{ex.certificateType} · Uploaded {new Date(ex.createdAt).toLocaleDateString()}</p>
                                        {ex.certificateUrl && <a href={ex.certificateUrl} target="_blank" rel="noopener" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"><Eye size={12} />View Certificate</a>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={cn("px-2 py-1 rounded-lg text-[10px] font-black uppercase", statusColor(ex.status))}>{ex.status}</span>
                                    {ex.status === 'PENDING' && (
                                        <>
                                            <button onClick={() => reviewExemption(ex.id, 'APPROVED')} className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase hover:scale-105 transition-all"><Check size={12} className="inline me-1" />Approve</button>
                                            <button onClick={() => reviewExemption(ex.id, 'REJECTED')} className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-[10px] font-black uppercase hover:scale-105 transition-all"><X size={12} className="inline me-1" />Reject</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Warehouses Tab ────────────────────── */}
            {tab === 'warehouses' && (
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <button onClick={() => setShowNewWarehouse(!showNewWarehouse)}
                            className="h-10 px-5 bg-emerald-500 text-white rounded-xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-emerald-500/20">
                            {showNewWarehouse ? <X size={14} /> : <Plus size={14} />}{showNewWarehouse ? 'Cancel' : 'Add Warehouse'}
                        </button>
                    </div>

                    <AnimatePresence>{showNewWarehouse && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-[32px] p-8 space-y-6 shadow-sm">
                            <h4 className="text-xs font-black text-[#0F1111] dark:text-white uppercase tracking-widest">Add Warehouse</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Supplier</label>
                                    <select value={newWarehouse.supplierId} onChange={e => setNewWarehouse({ ...newWarehouse, supplierId: e.target.value })}
                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none text-[#0F1111] dark:text-white font-medium text-sm">
                                        <option value="">Select supplier...</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.companyName})</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Name</label>
                                    <input type="text" value={newWarehouse.name} onChange={e => setNewWarehouse({ ...newWarehouse, name: e.target.value })} placeholder="e.g. Main Warehouse"
                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none text-[#0F1111] dark:text-white font-medium text-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">City</label>
                                    <input type="text" value={newWarehouse.city} onChange={e => setNewWarehouse({ ...newWarehouse, city: e.target.value })} placeholder="e.g. Cairo"
                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none text-[#0F1111] dark:text-white font-medium text-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Country</label>
                                    <input type="text" value={newWarehouse.country} onChange={e => setNewWarehouse({ ...newWarehouse, country: e.target.value })} placeholder="e.g. Egypt"
                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none text-[#0F1111] dark:text-white font-medium text-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#888] uppercase tracking-widest">Full Address</label>
                                    <input type="text" value={newWarehouse.address} onChange={e => setNewWarehouse({ ...newWarehouse, address: e.target.value })} placeholder="Street, Building"
                                        className="w-full h-11 bg-[#F7F8F8] dark:bg-white/5 rounded-xl border border-[#EAEDED] dark:border-white/10 px-4 outline-none text-[#0F1111] dark:text-white font-medium text-sm" />
                                </div>
                                <div className="flex items-end">
                                    <button onClick={createWarehouse} disabled={!newWarehouse.name || !newWarehouse.supplierId}
                                        className={cn("w-full h-11 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                                            newWarehouse.name && newWarehouse.supplierId ? "bg-emerald-500 text-white hover:scale-[1.02] shadow-lg" : "bg-[#F3F3F3] text-[#888] cursor-not-allowed")}>
                                        <Plus size={14} />Create
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}</AnimatePresence>

                    {warehouses.length === 0 ? (
                        <div className="text-center py-16 text-[#888]"><Warehouse size={48} className="mx-auto mb-4 opacity-20" /><p className="font-bold">No warehouses registered.</p></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {warehouses.map(w => {
                                const supplier = suppliers.find(s => s.id === w.supplierId);
                                return (
                                    <div key={w.id} className="bg-white dark:bg-[#131921] border border-[#DDD] dark:border-white/10 rounded-2xl p-6 space-y-3 group">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center text-violet-600"><Warehouse size={18} /></div>
                                                <div>
                                                    <p className="font-bold text-[#0F1111] dark:text-white">{w.name} {w.isDefault && <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md ms-1">DEFAULT</span>}</p>
                                                    <p className="text-xs text-[#888]">{supplier?.companyName || w.supplierId}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => deleteWarehouse(w.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-all"><Trash2 size={14} /></button>
                                        </div>
                                        <p className="text-sm text-[#555] dark:text-[#999]">{w.address}, {w.city}, {w.country} {w.zipCode || ''}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
                        className={cn("fixed bottom-8 end-8 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-[100]",
                            toast.type === 'success' ? "bg-emerald-500 text-white" : "bg-red-500 text-white")}>
                        {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                        <span className="text-xs font-black uppercase tracking-widest">{toast.msg}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
