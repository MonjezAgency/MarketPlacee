'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, UserCircle2, Mail, Phone, 
    ChevronRight, Store, Shield, 
    ShieldCheck, ShieldAlert, Activity, 
    TrendingUp, Filter, X, Globe, 
    Clock, Package, FileText, Download,
    Check, AlertCircle, MoreVertical, 
    ArrowUpRight, BarChart3, Briefcase,
    Zap, DollarSign, Target, Award
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface Supplier {
    id: string;
    name: string;
    email: string;
    phone?: string;
    companyName?: string;
    avatar?: string;
    status: string;
    kycStatus?: 'VERIFIED' | 'PENDING' | 'REJECTED' | 'NOT_STARTED';
    role: string;
    createdAt: string;
    _count?: {
        products: number;
    };
    revenue?: number;
    approvalRate?: number;
}

export default function AdminSuppliersPage() {
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedSupplier, setSelectedSupplier] = React.useState<Supplier | null>(null);
    const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState<'ALL' | 'ACTIVE' | 'PENDING'>('ALL');
    const [panelTab, setPanelTab] = React.useState<'profile' | 'products' | 'performance' | 'compliance'>('profile');

    // Bulk Selection
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const [isBulkLoading, setIsBulkLoading] = React.useState(false);

    const loadSuppliers = async () => {
        try {
            const res = await apiFetch('/users?role=SUPPLIER&limit=100', { cache: 'no-store' });
            if (res.ok) {
                const result = await res.json();
                const usersData = Array.isArray(result) ? result : (result.users || []);
                // Add some mock data for performance display
                const enrichedData = usersData.map((s: any) => ({
                    ...s,
                    revenue: Math.floor(Math.random() * 50000) + 5000,
                    approvalRate: Math.floor(Math.random() * 20) + 80,
                }));
                setSuppliers(enrichedData);
            }
        } catch (err) {
            console.error("Failed to load suppliers:", err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadSuppliers();
    }, []);

    const handleBulkAction = async (action: 'approve' | 'block' | 'delete') => {
        if (selectedIds.length === 0) return;
        
        if (!window.confirm(`Are you sure you want to ${action} ${selectedIds.length} suppliers?`)) return;

        const tid = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing suppliers...`);
        setIsBulkLoading(true);
        try {
            const endpoint = `/users/bulk-${action}`;
            const res = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify({ ids: selectedIds })
            });

            if (res.ok) {
                const result = await res.json();
                toast.success(result.message || `Successfully ${action}d suppliers`, { id: tid });
                setSelectedIds([]);
                loadSuppliers();
            } else {
                const errorData = await res.json().catch(() => ({}));
                toast.error(errorData.message || `Bulk ${action} failed`, { id: tid });
            }
        } catch (err) {
            toast.error(`Error during bulk ${action}`, { id: tid });
        } finally {
            setIsBulkLoading(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredSuppliers.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredSuppliers.map(s => s.id));
        }
    };

    const toggleSelectSupplier = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const filteredSuppliers = suppliers.filter(s => {
        const matchesSearch = (s.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (s.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (s.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        
        const matchesTab = activeTab === 'ALL' ? true : 
                          activeTab === 'ACTIVE' ? s.status === 'ACTIVE' : 
                          s.status === 'PENDING_APPROVAL';
        
        return matchesSearch && matchesTab;
    });

    const getKycBadge = (status?: string) => {
        switch (status) {
            case 'VERIFIED': return <span className="flex items-center gap-1 text-teal-600 bg-teal-50 px-2 py-0.5 rounded text-[10px] font-bold border border-teal-100"><ShieldCheck size={12} /> Verified</span>;
            case 'PENDING': return <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-100"><Clock size={12} /> Pending</span>;
            case 'REJECTED': return <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded text-[10px] font-bold border border-red-100"><ShieldAlert size={12} /> Rejected</span>;
            default: return <span className="flex items-center gap-1 text-slate-400 bg-slate-50 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-100">Not Started</span>;
        }
    };

    return (
        <div className="flex flex-col h-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Suppliers Network</h1>
                    <p className="text-sm text-slate-500 mt-1">Monitor vendor performance, product catalogs, and compliance standards.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text"
                            placeholder="Search suppliers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-10 w-64 pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-teal-500 transition-all shadow-sm"
                        />
                    </div>
                    <button className="h-10 px-4 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                        <Filter size={16} /> Filters
                    </button>
                </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Total Suppliers', value: suppliers.length, icon: Store, color: 'text-slate-600', bg: 'bg-slate-100' },
                    { label: 'Network Revenue', value: `$${suppliers.reduce((acc, s) => acc + (s.revenue || 0), 0).toLocaleString()}`, icon: DollarSign, color: 'text-teal-600', bg: 'bg-teal-50' },
                    { label: 'Verified Partners', value: suppliers.filter(s => s.status === 'ACTIVE').length, icon: ShieldCheck, color: 'text-teal-600', bg: 'bg-teal-50' },
                    { label: 'KYC Backlog', value: suppliers.filter(s => s.status === 'PENDING_APPROVAL').length, icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", stat.bg, stat.color)}>
                            <stat.icon size={22} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                            <h3 className="text-lg font-bold text-slate-900 mt-0.5">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-12 gap-6 items-start">
                {/* TABLE (LEFT - 65%) */}
                <div className={cn(
                    "transition-all duration-500",
                    selectedSupplier ? "col-span-12 lg:col-span-7" : "col-span-12"
                )}>
                    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4 w-10">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.length > 0 && selectedIds.length === filteredSuppliers.length}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                            />
                                        </th>
                                        <th className="px-6 py-4">Supplier Name</th>
                                        <th className="px-6 py-4">Products</th>
                                        <th className="px-6 py-4">Revenue</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">KYC</th>
                                        <th className="px-6 py-4 text-end">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {loading ? (
                                        [...Array(6)].map((_, i) => (
                                            <tr key={i} className="animate-pulse h-[64px]">
                                                <td colSpan={6} className="px-6 py-4 bg-slate-50/30" />
                                            </tr>
                                        ))
                                    ) : filteredSuppliers.map((supplier) => (
                                        <tr 
                                            key={supplier.id} 
                                            onClick={() => setSelectedSupplier(supplier)}
                                            className={cn(
                                                "group cursor-pointer hover:bg-slate-50 transition-all h-[64px]",
                                                (selectedSupplier?.id === supplier.id || selectedIds.includes(supplier.id)) ? "bg-teal-50/50" : ""
                                            )}
                                        >
                                            <td className="px-6 py-4" onClick={(e) => toggleSelectSupplier(e, supplier.id)}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.includes(supplier.id)}
                                                    readOnly
                                                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                        {supplier.avatar ? (
                                                            <img src={supplier.avatar} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-sm font-bold text-slate-400">{supplier.name[0]}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-bold text-slate-900 truncate">{supplier.name}</span>
                                                        <span className="text-[11px] text-slate-500 truncate">{supplier.companyName || 'Private Supplier'}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-700">
                                                {supplier._count?.products || 0}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-900">
                                                ${supplier.revenue?.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase border",
                                                    supplier.status === 'ACTIVE' ? "bg-teal-50 text-teal-600 border-teal-100" : "bg-red-50 text-red-600 border-red-100"
                                                )}>
                                                    {supplier.status === 'ACTIVE' ? 'Active' : 'Blocked'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {getKycBadge(supplier.kycStatus || (supplier.status === 'ACTIVE' ? 'VERIFIED' : 'PENDING'))}
                                            </td>
                                            <td className="px-6 py-4 text-end">
                                                <button className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                                                    <ChevronRight size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL (35% / 420px) */}
                <AnimatePresence>
                    {selectedSupplier && (
                        <motion.div 
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 20, opacity: 0 }}
                            className="col-span-12 lg:col-span-5"
                        >
                            <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden sticky top-8 flex flex-col max-h-[calc(100vh-140px)]">
                                {/* Panel Header */}
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-teal-500 text-white overflow-hidden flex items-center justify-center font-bold text-xl border-2 border-slate-100 shadow-sm">
                                            {selectedSupplier.avatar ? (
                                                <img src={selectedSupplier.avatar} className="w-full h-full object-cover" alt={selectedSupplier.name} />
                                            ) : (
                                                <span>{selectedSupplier.name[0]}</span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900">{selectedSupplier.name}</h3>
                                            <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest">{selectedSupplier.companyName || 'Private Unit'}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedSupplier(null)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Panel Tabs */}
                                <div className="flex items-center px-4 pt-4 gap-2 border-b border-slate-100">
                                    {[
                                        { id: 'profile', label: 'Profile', icon: Briefcase },
                                        { id: 'products', label: 'Products', icon: Package },
                                        { id: 'performance', label: 'Performance', icon: Zap },
                                        { id: 'compliance', label: 'Compliance', icon: ShieldCheck }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setPanelTab(tab.id as any)}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-3 text-[11px] font-bold transition-all border-b-2",
                                                panelTab === tab.id ? "border-teal-600 text-teal-600" : "border-transparent text-slate-500 hover:text-slate-900"
                                            )}
                                        >
                                            <tab.icon size={13} />
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Panel Content */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                                    {panelTab === 'profile' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                            <div className="space-y-4">
                                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enterprise Profile</h4>
                                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 border border-slate-100">
                                                        <Mail size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Business Email</p>
                                                        <p className="text-sm font-bold text-slate-900">{selectedSupplier.email}</p>
                                                    </div>
                                                </div>
                                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 border border-slate-100">
                                                        <Phone size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contact Line</p>
                                                        <p className="text-sm font-bold text-slate-900">{selectedSupplier.phone || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Onboarding</p>
                                                        <p className="text-sm font-bold text-slate-900">{new Date(selectedSupplier.createdAt).toLocaleDateString()}</p>
                                                    </div>
                                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rating</p>
                                                        <div className="flex items-center gap-1">
                                                            <Check size={14} className="text-teal-600" />
                                                            <span className="text-sm font-bold text-slate-900">4.9/5.0</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pt-6 border-t border-slate-100">
                                                <button className="w-full h-12 bg-slate-900 text-white rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                                                    Manage Access Rights
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {panelTab === 'products' && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Catalog</h4>
                                                <span className="text-[10px] font-bold text-teal-600">{selectedSupplier._count?.products || 0} Products</span>
                                            </div>
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group hover:border-teal-200 transition-all">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center">
                                                            <Package size={20} className="text-slate-400" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-900">Premium Product {i + 1}</p>
                                                            <p className="text-[9px] text-slate-500 font-medium">SKU: AT-8429-{i}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-bold text-slate-900">$124.00</p>
                                                        <span className="text-[8px] font-bold text-teal-600 bg-teal-50 px-1 py-0.5 rounded">IN STOCK</span>
                                                    </div>
                                                </div>
                                            ))}
                                            <button className="w-full py-4 text-teal-600 text-[10px] font-bold uppercase tracking-widest hover:bg-teal-50 rounded-2xl transition-all">
                                                Open Full Catalog
                                            </button>
                                        </div>
                                    )}

                                    {panelTab === 'performance' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Growth Metrics</h4>
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-5 bg-teal-600 rounded-3xl text-white space-y-2 shadow-lg shadow-teal-600/20">
                                                    <BarChart3 size={20} />
                                                    <div>
                                                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">Sales Volume</p>
                                                        <p className="text-lg font-bold">${selectedSupplier.revenue?.toLocaleString()}</p>
                                                    </div>
                                                </div>
                                                <div className="p-5 bg-slate-900 rounded-3xl text-white space-y-2 shadow-lg shadow-slate-900/20">
                                                    <Award size={20} className="text-teal-400" />
                                                    <div>
                                                        <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">Approval Rate</p>
                                                        <p className="text-lg font-bold">{selectedSupplier.approvalRate}%</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operational Health</h4>
                                                {[
                                                    { label: 'Order Fulfillment', value: '98.2%', icon: Check, color: 'bg-teal-500' },
                                                    { label: 'Avg. Shipping Time', value: '1.2 Days', icon: Clock, color: 'bg-blue-500' },
                                                    { label: 'Return Rate', value: '0.4%', icon: ArrowUpRight, color: 'bg-emerald-500' }
                                                ].map((metric, i) => (
                                                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white", metric.color)}>
                                                                <metric.icon size={14} />
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-700">{metric.label}</span>
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-900">{metric.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {panelTab === 'compliance' && (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col items-center text-center space-y-4">
                                                <div className="w-16 h-16 rounded-3xl bg-teal-100 text-teal-600 flex items-center justify-center shadow-lg shadow-teal-600/10">
                                                    <ShieldCheck size={32} />
                                                </div>
                                                <div>
                                                    <h4 className="text-base font-bold text-slate-900">Fully Compliant Entity</h4>
                                                    <p className="text-xs text-slate-500 mt-1">KYC & Tax documents verified</p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verification Status</h4>
                                                <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl">
                                                    <div className="flex items-center gap-3">
                                                        <FileText size={18} className="text-teal-600" />
                                                        <span className="text-xs font-bold text-slate-900">Tax Compliance Status</span>
                                                    </div>
                                                    <span className="px-2 py-0.5 bg-teal-50 text-teal-600 rounded text-[9px] font-bold uppercase border border-teal-100">VALID</span>
                                                </div>
                                                <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl">
                                                    <div className="flex items-center gap-3">
                                                        <ShieldAlert size={18} className="text-slate-400" />
                                                        <span className="text-xs font-bold text-slate-900">Policy Violations</span>
                                                    </div>
                                                    <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded text-[9px] font-bold uppercase border border-slate-100">NONE</span>
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-slate-100 flex items-center gap-3">
                                                <button className="flex-1 h-12 bg-teal-600 text-white rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-teal-700 transition-all">
                                                    Review Full KYC
                                                </button>
                                                <button className="h-12 px-6 bg-red-50 text-red-600 border border-red-100 rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-red-100 transition-all">
                                                    Suspend
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bulk Actions Floating Bar */}
            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] w-full max-w-2xl px-6"
                    >
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl flex items-center justify-between gap-6 text-white ring-1 ring-white/10">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-teal-500 flex items-center justify-center font-bold text-white shadow-lg shadow-teal-500/20">
                                    {selectedIds.length}
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Suppliers Selected</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Apply network actions</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => handleBulkAction('approve')}
                                    disabled={isBulkLoading}
                                    className="h-10 px-4 bg-teal-600 hover:bg-teal-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    <Check size={14} /> Approve
                                </button>
                                <button 
                                    onClick={() => handleBulkAction('block')}
                                    disabled={isBulkLoading}
                                    className="h-10 px-4 bg-orange-600 hover:bg-orange-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    <Shield size={14} /> Block
                                </button>
                                <div className="w-px h-6 bg-slate-800 mx-1" />
                                <button 
                                    onClick={() => handleBulkAction('delete')}
                                    disabled={isBulkLoading}
                                    className="h-10 px-4 bg-white/10 hover:bg-red-600 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    <X size={14} /> Delete
                                </button>
                                <button 
                                    onClick={() => setSelectedIds([])}
                                    className="h-10 px-4 text-slate-400 hover:text-white transition-colors text-xs font-bold"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
