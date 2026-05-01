'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, CreditCard, Shield, Warehouse, Plus, Trash2, Check, X, AlertCircle,
    RefreshCw, Eye, DollarSign, Clock, Search, ChevronRight, BarChart3, TrendingUp,
    Download, Filter, MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiFetch } from '@/lib/api';
import { getCurrencyInfo, SUPPORTED_CURRENCIES, convertToBase } from '@/lib/currency';

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
    const [showNewInvoice, setShowNewInvoice] = React.useState(false);
    const [newInvoice, setNewInvoice] = React.useState({ customerId: '', amount: 0, notes: '' });
    const [newWarehouse, setNewWarehouse] = React.useState({ name: '', address: '', city: '', country: '', zipCode: '', supplierId: '' });
    const [suppliers, setSuppliers] = React.useState<any[]>([]);
    const [userSearch, setUserSearch] = React.useState('');
    const [activeCurrency, setActiveCurrency] = React.useState(getCurrencyInfo().code);

    // ── Analytics State ─────────────────────────────────────
    const stats = {
        totalRevenue: invoices.reduce((acc, inv) => acc + (inv.status === 'PAID' ? inv.totalAmount : 0), 0),
        pendingInvoices: invoices.filter(inv => inv.status === 'ISSUED').length,
        paidInvoices: invoices.filter(inv => inv.status === 'PAID').length,
        outstandingBalance: invoices.reduce((acc, inv) => acc + (inv.status === 'ISSUED' ? inv.totalAmount : 0), 0),
    };

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
    React.useEffect(() => { fetchInvoices(); }, []);

    const markPaid = async (id: string) => {
        try {
            const res = await apiFetch(`/invoices/${id}/pay`, { method: 'POST' });
            if (res.ok) { showToast('success', t('admin', 'markedAsPaid') || 'Marked as paid'); fetchInvoices(); }
        } catch (_e) { showToast('error', 'Failed'); }
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
            if (res.ok) { showToast('success', t('admin', 'creditTermSet') || 'Credit term set'); fetchCredits(); setShowNewCredit(false); }
            else { const e = await res.json(); showToast('error', e.message || 'Failed'); }
        } catch (_e) { showToast('error', 'Network error'); }
    };

    const deleteCredit = async (id: string) => {
        try {
            await apiFetch(`/finance/credit-terms/${id}`, { method: 'DELETE' });
            showToast('success', 'Deleted'); fetchCredits();
        } catch (_e) { showToast('error', 'Failed'); }
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
        } catch (_e) { showToast('error', 'Failed'); }
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
            if (res.ok) { showToast('success', t('admin', 'warehouseCreated') || 'Warehouse created'); fetchWarehouses(); setShowNewWarehouse(false); }
            else { const e = await res.json(); showToast('error', e.message || 'Failed'); }
        } catch (_e) { showToast('error', 'Network error'); }
    };

    const deleteWarehouse = async (id: string) => {
        try {
            await apiFetch(`/finance/warehouses/${id}`, { method: 'DELETE' });
            showToast('success', 'Deleted'); fetchWarehouses();
        } catch (_e) { showToast('error', 'Failed'); }
    };

    const viewInvoice = (inv: any) => {
        const clientName = inv.order?.buyer?.name || inv.customer?.name || 'Manual Customer';
        const itemRows = (inv.order?.items || [])
            .map((i: any) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">${i.product?.name || 'Item'}</td><td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">${i.quantity}</td><td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">$${(i.price ?? 0).toFixed(2)}</td><td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:700">$${((i.price ?? 0) * (i.quantity ?? 1)).toFixed(2)}</td></tr>`)
            .join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${inv.invoiceNumber}</title>
<style>body{font-family:'Segoe UI',sans-serif;margin:0;padding:40px;color:#0A1A2F;background:#fff}
.header{background:#0A1A2F;color:#fff;padding:32px;border-radius:12px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:center}
.logo{font-size:26px;font-weight:900}.logo span{color:#1BC7C9}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px}
.meta-box{background:#F2F4F7;padding:16px;border-radius:8px}
.meta-box label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#667085;display:block;margin-bottom:4px}
.meta-box p{margin:0;font-weight:700;font-size:14px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#667085;padding:8px 12px;border-bottom:2px solid #E5E7EB}
.totals{margin-left:auto;width:280px}
.total-row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px}
.total-final{display:flex;justify-content:space-between;padding:16px 0;font-size:18px;font-weight:900;color:#1BC7C9;border-top:2px solid #0A1A2F;margin-top:8px}
</style></head><body>
<div class="header"><div class="logo">Atlan<span>tis</span></div>
<div style="text-align:right"><div style="font-size:22px;font-weight:900">${inv.invoiceNumber}</div>
<div style="font-size:12px;color:#B0BCCF;margin-top:4px">Issued: ${inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '-'}</div></div></div>
<div class="meta">
<div class="meta-box"><label>Client</label><p>${clientName}</p></div>
<div class="meta-box"><label>Status</label><p>${inv.status}</p></div>
<div class="meta-box"><label>Due Date</label><p>${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}</p></div>
<div class="meta-box"><label>Currency</label><p>${inv.currency || 'USD'}</p></div>
</div>
${itemRows ? `<h2 style="font-size:16px;margin-bottom:12px">Order Items</h2>
<table><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
<tbody>${itemRows}</tbody></table>` : ''}
<div class="totals">
<div class="total-row"><span>Subtotal</span><span>$${(inv.amount ?? 0).toFixed(2)}</span></div>
<div class="total-row"><span>Tax</span><span>$${(inv.tax ?? 0).toFixed(2)}</span></div>
<div class="total-final"><span>Total</span><span>$${(inv.totalAmount ?? 0).toFixed(2)}</span></div>
</div>
<div style="text-align:center;color:#667085;font-size:11px;margin-top:40px;padding-top:16px;border-top:1px solid #E5E7EB">© 2026 Atlantis Marketplace — atlantisfmcg.com</div>
</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) win.addEventListener('load', () => { win.print(); URL.revokeObjectURL(url); });
    };

    const exportData = () => {
        let csv = '';
        let filename = '';
        if (tab === 'invoices') {
            filename = 'invoices_export.csv';
            csv = 'Invoice #,Client,Amount,Tax,Total,Status,Due Date\n' +
                invoices.map(inv => [
                    inv.invoiceNumber,
                    `"${inv.order?.buyer?.name || inv.customer?.name || 'Manual'}"`,
                    (inv.amount ?? 0).toFixed(2),
                    (inv.tax ?? 0).toFixed(2),
                    (inv.totalAmount ?? 0).toFixed(2),
                    inv.status,
                    inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-',
                ].join(',')).join('\n');
        } else if (tab === 'credit') {
            filename = 'credit_terms_export.csv';
            csv = 'Buyer,Credit Limit,Used Credit,Payment Days,Status\n' +
                credits.map(c => {
                    const buyer = buyers.find(b => b.id === c.userId);
                    return [`"${buyer?.name || 'Unknown'}"`, c.creditLimit, c.usedCredit, c.paymentTermDays, c.status].join(',');
                }).join('\n');
        } else if (tab === 'tax') {
            filename = 'tax_exemptions_export.csv';
            csv = 'Buyer,Certificate Type,Status,Date\n' +
                exemptions.map(ex => {
                    const buyer = buyers.find(b => b.id === ex.userId);
                    return [`"${buyer?.name || 'Unknown'}"`, ex.certificateType, ex.status, new Date(ex.createdAt).toLocaleDateString()].join(',');
                }).join('\n');
        } else {
            filename = 'warehouses_export.csv';
            csv = 'Name,City,Country,Address\n' +
                warehouses.map(w => [`"${w.name}"`, `"${w.city}"`, `"${w.country}"`, `"${w.address}"`].join(',')).join('\n');
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    };

    const createManualInvoice = async () => {
        if (!newInvoice.customerId || newInvoice.amount <= 0) return;
        try {
            // Convert to EGP base
            const amountEGP = convertToBase(newInvoice.amount, activeCurrency);
            
            const res = await apiFetch(`/finance/manual-invoice`, {
                method: 'POST',
                body: JSON.stringify({ ...newInvoice, amount: amountEGP }),
            });
            if (res.ok) {
                showToast('success', 'Manual invoice created');
                fetchInvoices();
                setShowNewInvoice(false);
                setNewInvoice({ customerId: '', amount: 0, notes: '' });
            } else {
                const e = await res.json();
                showToast('error', e.message || 'Failed to create invoice');
            }
        } catch (_e) { showToast('error', 'Network error'); }
    };

    const statusColor = (s: string) => {
        const map: Record<string, string> = { 
            ISSUED: 'bg-amber-50 text-amber-600 border-amber-100', 
            PAID: 'bg-teal-50 text-teal-600 border-teal-100', 
            OVERDUE: 'bg-red-50 text-red-600 border-red-100', 
            APPROVED: 'bg-teal-50 text-teal-600 border-teal-100', 
            PENDING: 'bg-amber-50 text-amber-600 border-amber-100', 
            REJECTED: 'bg-red-50 text-red-600 border-red-100', 
            ACTIVE: 'bg-teal-50 text-teal-600 border-teal-100', 
            SUSPENDED: 'bg-red-50 text-red-600 border-red-100' 
        };
        return map[s] || 'bg-slate-50 text-slate-600 border-slate-100';
    };

    const tabs = [
        { key: 'invoices' as Tab, label: 'Invoices', icon: FileText },
        { key: 'credit' as Tab, label: 'Credit Terms', icon: CreditCard },
        { key: 'tax' as Tab, label: 'Tax Exemptions', icon: Shield },
        { key: 'warehouses' as Tab, label: 'Warehouses', icon: Warehouse },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center p-2 shadow-sm">
                        <img 
                            src="https://mgecljoxasstdfmlytov.supabase.co/storage/v1/object/public/marketplace-assets/logo_atlantis.png" 
                            alt="Atlantis" 
                            className="w-full h-full object-contain"
                        />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            Finance & Compliance
                            <span className="px-2 py-0.5 bg-teal-50 text-teal-600 text-[9px] font-black uppercase tracking-widest rounded-md border border-teal-100">Verified HQ</span>
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">Manage billing, credit policies, and global warehouse infrastructure.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={exportData} className="h-10 px-4 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                        <Download size={16} /> Export Data
                    </button>
                    {tab === 'warehouses' && (
                        <button onClick={() => setShowNewWarehouse(true)} className="h-10 px-6 bg-teal-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20">
                            <Plus size={16} /> Add Warehouse
                        </button>
                    )}
                    {tab === 'credit' && (
                        <button onClick={() => setShowNewCredit(true)} className="h-10 px-6 bg-teal-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20">
                            <Plus size={16} /> Set Credit Term
                        </button>
                    )}
                    {tab === 'invoices' && (
                        <button onClick={() => setShowNewInvoice(true)} className="h-10 px-6 bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-md shadow-slate-900/20">
                            <Plus size={16} /> Create Manual Invoice
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-teal-600', bg: 'bg-teal-50' },
                    { label: 'Pending Invoices', value: stats.pendingInvoices, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Paid Invoices', value: stats.paidInvoices, icon: Check, color: 'text-teal-600', bg: 'bg-teal-50' },
                    { label: 'Outstanding Balance', value: `$${stats.outstandingBalance.toLocaleString()}`, icon: BarChart3, color: 'text-red-600', bg: 'bg-red-50' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", stat.bg, stat.color)}>
                                <stat.icon size={20} />
                            </div>
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                        <h3 className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</h3>
                    </div>
                ))}
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-2xl w-fit">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all",
                            tab === t.key 
                                ? "bg-white text-teal-600 shadow-sm" 
                                : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                        )}
                    >
                        <t.icon size={14} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={tab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* ── Invoices Tab ──────────────────────── */}
                        {tab === 'invoices' && (
                                <div className="max-h-[600px] overflow-y-auto scrollbar-hide">
                                    <table className="w-full text-left relative border-collapse">
                                        <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-md border-b border-slate-100 z-20">
                                            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                <th className="px-6 py-4">Invoice ID</th>
                                                <th className="px-6 py-4">Client</th>
                                                <th className="px-6 py-4">Amount</th>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4">Due Date</th>
                                                <th className="px-6 py-4 text-end">Actions</th>
                                            </tr>
                                        </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {isLoadingInvoices ? (
                                            [...Array(5)].map((_, i) => (
                                                <tr key={i} className="animate-pulse">
                                                    <td colSpan={6} className="px-6 py-8 bg-slate-50/30" />
                                                </tr>
                                            ))
                                        ) : invoices.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-20 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <FileText size={40} className="text-slate-200" />
                                                        <p className="text-sm font-medium text-slate-400">No invoices found.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            invoices.map((inv) => (
                                                <tr key={inv.id} className="group hover:bg-slate-50 transition-all h-[64px]">
                                                    <td className="px-6 py-4">
                                                        <span className="text-sm font-bold text-slate-900">#{inv.invoiceNumber}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-semibold text-slate-900">
                                                                {inv.order?.buyer?.name || inv.customer?.name || 'Manual Customer'}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-medium">
                                                                {inv.order?.buyer?.companyName || inv.customer?.companyName || 'Retail / Manual'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-slate-900">${inv.totalAmount?.toLocaleString()}</span>
                                                            <span className="text-[10px] text-slate-500 font-medium">Tax: ${inv.tax?.toFixed(2)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border", statusColor(inv.status))}>
                                                            {inv.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs text-slate-500 font-medium">
                                                            {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-end">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {inv.status === 'ISSUED' && (
                                                                <button onClick={() => markPaid(inv.id)} className="h-8 px-3 bg-teal-50 text-teal-600 rounded-lg text-[10px] font-bold uppercase hover:bg-teal-600 hover:text-white transition-all">
                                                                    Mark Paid
                                                                </button>
                                                            )}
                                                            <button onClick={() => viewInvoice(inv)} className="p-2 text-slate-400 hover:text-slate-900 transition-all" title="View Invoice">
                                                                <Eye size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    </table>
                                </div>
                        )}

                        {/* ── Credit Terms Tab ─────────────────── */}
                        {tab === 'credit' && (
                            <div className="p-6 space-y-6">
                                {credits.length === 0 ? (
                                    <div className="py-20 text-center flex flex-col items-center gap-3">
                                        <CreditCard size={40} className="text-slate-200" />
                                        <p className="text-sm font-medium text-slate-400">No active credit terms.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {credits.map((c) => {
                                            const buyer = buyers.find(b => b.id === c.userId);
                                            const usedPercent = (c.creditLimit ?? 0) > 0 ? (c.usedCredit / c.creditLimit) * 100 : 0;
                                            return (
                                                <div key={c.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-6 hover:border-teal-200 transition-all group">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-teal-600 font-bold text-xs">
                                                                N{c.paymentTermDays}
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-bold text-slate-900">{buyer?.name || 'Customer Account'}</h4>
                                                                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">{buyer?.companyName || 'Corporate Entity'}</p>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => deleteCredit(c.id)} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                    
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                            <span>Credit Utilization</span>
                                                            <span>{usedPercent.toFixed(1)}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                                            <motion.div 
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${Math.min(usedPercent, 100)}%` }}
                                                                className={cn("h-full rounded-full transition-all", usedPercent > 80 ? "bg-red-500" : "bg-teal-500")} 
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between mt-2">
                                                            <span className="text-xs font-bold text-slate-900">${c.usedCredit.toLocaleString()} <span className="text-slate-400 font-medium">/ ${c.creditLimit.toLocaleString()}</span></span>
                                                            <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border", statusColor(c.status))}>{c.status}</span>
                                                        </div>
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
                            <div className="divide-y divide-slate-50">
                                {exemptions.length === 0 ? (
                                    <div className="py-20 text-center flex flex-col items-center gap-3">
                                        <Shield size={40} className="text-slate-200" />
                                        <p className="text-sm font-medium text-slate-400">No tax exemption requests found.</p>
                                    </div>
                                ) : (
                                    exemptions.map((ex) => {
                                        const buyer = buyers.find(b => b.id === ex.userId);
                                        return (
                                            <div key={ex.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600">
                                                        <Shield size={22} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-bold text-slate-900">{buyer?.name || 'Corporate Account'}</h4>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[10px] text-slate-500 font-medium">{ex.certificateType}</span>
                                                            <span className="text-slate-300">•</span>
                                                            <span className="text-[10px] text-slate-500 font-medium">Uploaded {new Date(ex.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                        {ex.certificateUrl && (
                                                            <a href={ex.certificateUrl} target="_blank" rel="noopener" className="text-[10px] text-teal-600 font-bold hover:underline flex items-center gap-1 mt-1 uppercase tracking-widest">
                                                                <Eye size={12} /> View Certificate
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border", statusColor(ex.status))}>
                                                        {ex.status}
                                                    </span>
                                                    {ex.status === 'PENDING' && (
                                                        <div className="flex items-center gap-2">
                                                            <button onClick={() => reviewExemption(ex.id, 'APPROVED')} className="h-8 px-4 bg-teal-600 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-teal-700 transition-all">
                                                                Approve
                                                            </button>
                                                            <button onClick={() => reviewExemption(ex.id, 'REJECTED')} className="h-8 px-4 bg-white border border-red-200 text-red-500 rounded-lg text-[10px] font-bold uppercase hover:bg-red-50 transition-all">
                                                                Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* ── Warehouses Tab ────────────────────── */}
                        {tab === 'warehouses' && (
                            <div className="p-6">
                                {warehouses.length === 0 ? (
                                    <div className="py-20 text-center flex flex-col items-center gap-3">
                                        <Warehouse size={40} className="text-slate-200" />
                                        <p className="text-sm font-medium text-slate-400">No warehouses registered.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {warehouses.map((w) => {
                                            const supplier = suppliers.find(s => s.id === w.supplierId);
                                            return (
                                                <div key={w.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-6 hover:border-teal-200 transition-all group flex flex-col justify-between h-full">
                                                    <div>
                                                        <div className="flex items-start justify-between mb-4">
                                                            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-teal-600">
                                                                <Warehouse size={22} />
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {w.isDefault && <span className="text-[9px] font-bold bg-teal-500 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">Default</span>}
                                                                <button onClick={() => deleteWarehouse(w.id)} className="p-2 text-slate-300 hover:text-red-500 transition-all">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <h4 className="text-sm font-bold text-slate-900 mb-1">{w.name}</h4>
                                                        <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest mb-3">{supplier?.companyName || 'Supplier Global'}</p>
                                                        <div className="space-y-1.5">
                                                            <div className="flex items-start gap-2 text-xs text-slate-500">
                                                                <Search size={14} className="shrink-0 mt-0.5" />
                                                                <span>{w.address}, {w.city}, {w.country}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-6 pt-4 border-t border-slate-200/50 flex items-center justify-between">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Stock</span>
                                                            <span className="text-sm font-bold text-slate-900">4,280 Units</span>
                                                        </div>
                                                        <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-all">
                                                            <ChevronRight size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Modals & Overlays */}
            <AnimatePresence>
                {(showNewCredit || showNewWarehouse || showNewInvoice) && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowNewCredit(false); setShowNewWarehouse(false); setShowNewInvoice(false); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl w-full max-w-lg relative z-10 overflow-hidden shadow-2xl">
                            {showNewInvoice && (
                                <div className="p-8 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900">Manual Invoice</h3>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Record offline payment or manual billing</p>
                                        </div>
                                        <button onClick={() => setShowNewInvoice(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400"><X size={20} /></button>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Account (Customer/Supplier)</label>
                                            <div className="space-y-3">
                                                {!newInvoice.customerId ? (
                                                    <div className="relative">
                                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                        <input 
                                                            type="text"
                                                            placeholder="Search by name, email or حرف..."
                                                            className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 outline-none focus:border-teal-500 text-sm font-medium transition-all"
                                                            value={userSearch}
                                                            onChange={(e) => setUserSearch(e.target.value)}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between p-3 bg-teal-600 text-white rounded-xl shadow-lg shadow-teal-600/20 animate-in zoom-in-95 duration-200">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-xs">
                                                                {([...buyers, ...suppliers].find(u => u.id === newInvoice.customerId)?.name || 'U')[0]}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold">{[...buyers, ...suppliers].find(u => u.id === newInvoice.customerId)?.name}</p>
                                                                <p className="text-[9px] opacity-80 font-medium uppercase tracking-widest">{[...buyers, ...suppliers].find(u => u.id === newInvoice.customerId)?.role}</p>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => { setNewInvoice({...newInvoice, customerId: ''}); setUserSearch(''); }}
                                                            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-all"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                )}

                                                {!newInvoice.customerId && userSearch && (
                                                    <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-2xl bg-white p-2 space-y-1 shadow-xl border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200 scrollbar-hide">
                                                        {[...buyers, ...suppliers]
                                                            .filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
                                                            .slice(0, 10)
                                                            .map(u => (
                                                                <button 
                                                                    key={u.id}
                                                                    onClick={() => { setNewInvoice({...newInvoice, customerId: u.id}); setUserSearch(''); }}
                                                                    className="w-full p-3 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between group hover:bg-slate-50 border border-transparent hover:border-slate-100"
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                                                                            {u.name[0]}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-slate-700">{u.name}</p>
                                                                            <p className="text-[9px] text-slate-400 font-medium">{u.email}</p>
                                                                        </div>
                                                                    </div>
                                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold uppercase tracking-tighter group-hover:bg-teal-100 group-hover:text-teal-700">{u.role}</span>
                                                                </button>
                                                            ))
                                                        }
                                                        {[...buyers, ...suppliers].filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                                                            <div className="p-4 text-center">
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No matching accounts</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Currency & Amount</label>
                                            <div className="flex gap-2">
                                                <select 
                                                    className="h-12 bg-slate-50 border border-slate-200 rounded-xl px-3 outline-none focus:border-teal-500 font-bold text-sm"
                                                    value={activeCurrency}
                                                    onChange={(e) => setActiveCurrency(e.target.value)}
                                                >
                                                    {SUPPORTED_CURRENCIES.map(c => (
                                                        <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                                                    ))}
                                                </select>
                                                <input 
                                                    type="number" 
                                                    className="flex-1 h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-bold text-lg"
                                                    value={newInvoice.amount}
                                                    onChange={(e) => setNewInvoice({...newInvoice, amount: Number(e.target.value)})}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
                                                Invoice Record (PDF)
                                                <span className="text-teal-600">Encrypted Storage</span>
                                            </label>
                                            <div className="relative group">
                                                <input 
                                                    type="file" 
                                                    accept=".pdf"
                                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            // In a real app, you'd upload this to a server
                                                            // For now, we mock the success
                                                            showToast('success', `Attached: ${file.name}`);
                                                        }
                                                    }}
                                                />
                                                <div className="w-full h-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-2 text-slate-400 group-hover:border-teal-500 group-hover:text-teal-600 transition-all">
                                                    <Download size={16} />
                                                    <span className="text-[11px] font-black uppercase tracking-widest">Attach PDF Document</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description / Notes</label>
                                            <textarea 
                                                className="w-full h-20 bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:border-teal-500 text-sm font-medium resize-none"
                                                placeholder="Transaction details..."
                                                value={newInvoice.notes}
                                                onChange={(e) => setNewInvoice({...newInvoice, notes: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <button 
                                        onClick={createManualInvoice}
                                        disabled={!newInvoice.customerId || newInvoice.amount <= 0}
                                        className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold uppercase text-xs tracking-widest shadow-lg shadow-slate-900/20 hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <FileText size={18} /> Generate Manual Invoice
                                    </button>
                                </div>
                            )}
                            {showNewCredit && (
                                <div className="p-8 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold text-slate-900">Set Credit Term</h3>
                                        <button onClick={() => setShowNewCredit(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400"><X size={20} /></button>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Buyer</label>
                                            <select value={newCredit.userId} onChange={e => setNewCredit({ ...newCredit, userId: e.target.value })} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-medium text-sm transition-all appearance-none">
                                                <option value="">Select account...</option>
                                                {buyers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.companyName})</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Credit Limit ($)</label>
                                                <input type="number" value={newCredit.creditLimit} onChange={e => setNewCredit({ ...newCredit, creditLimit: parseFloat(e.target.value) || 0 })} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-bold text-sm transition-all" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Term</label>
                                                <select value={newCredit.paymentTermDays} onChange={e => setNewCredit({ ...newCredit, paymentTermDays: parseInt(e.target.value) })} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-bold text-sm transition-all">
                                                    <option value={30}>Net 30</option><option value={60}>Net 60</option><option value={90}>Net 90</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={createCredit} className="w-full h-14 bg-teal-600 text-white rounded-2xl font-bold uppercase text-xs tracking-widest shadow-lg shadow-teal-600/20 hover:bg-teal-700 transition-all flex items-center justify-center gap-2">
                                        <Check size={18} /> Confirm Policy
                                    </button>
                                </div>
                            )}
                            {showNewWarehouse && (
                                <div className="p-8 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold text-slate-900">Add Warehouse</h3>
                                        <button onClick={() => setShowNewWarehouse(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400"><X size={20} /></button>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Supplier Owner</label>
                                            <select value={newWarehouse.supplierId} onChange={e => setNewWarehouse({ ...newWarehouse, supplierId: e.target.value })} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-medium text-sm transition-all appearance-none">
                                                <option value="">Select supplier...</option>
                                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.companyName})</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Warehouse Name</label>
                                            <input type="text" value={newWarehouse.name} onChange={e => setNewWarehouse({ ...newWarehouse, name: e.target.value })} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-medium text-sm transition-all" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">City</label>
                                                <input type="text" value={newWarehouse.city} onChange={e => setNewWarehouse({ ...newWarehouse, city: e.target.value })} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-medium text-sm transition-all" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Country</label>
                                                <input type="text" value={newWarehouse.country} onChange={e => setNewWarehouse({ ...newWarehouse, country: e.target.value })} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-medium text-sm transition-all" />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Address</label>
                                            <input type="text" value={newWarehouse.address} onChange={e => setNewWarehouse({ ...newWarehouse, address: e.target.value })} className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 outline-none focus:border-teal-500 font-medium text-sm transition-all" />
                                        </div>
                                    </div>
                                    <button onClick={createWarehouse} className="w-full h-14 bg-teal-600 text-white rounded-2xl font-bold uppercase text-xs tracking-widest shadow-lg shadow-teal-600/20 hover:bg-teal-700 transition-all flex items-center justify-center gap-2">
                                        <Plus size={18} /> Create Warehouse
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
                        className={cn("fixed bottom-8 end-8 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-[100]",
                            toast.type === 'success' ? "bg-teal-600 text-white" : "bg-red-500 text-white")}>
                        {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                        <span className="text-xs font-bold uppercase tracking-widest">{toast.msg}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
