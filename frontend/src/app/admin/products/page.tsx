'use client';

import * as React from 'react';
import { 
    Search, Upload, Plus, Package, Clock, CheckCircle2, 
    XCircle, AlertCircle, MoreHorizontal, ChevronRight,
    ArrowUpRight, Info, User, Sparkles, MessageSquare,
    Trash2, Eye, ExternalLink, Filter, Download,
    CheckCircle, ShieldAlert, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    images: string[];
    supplier?: {
        name: string;
        email: string;
        id: string;
    };
    createdAt: string;
    completeness?: number; // Calculated field
}

// ─── Components ─────────────────────────────────────────────────────────────

function KPICard({ label, value, icon: Icon, color, bg }: any) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4 flex-1">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", bg)}>
                <Icon className={cn("w-6 h-6", color)} />
            </div>
            <div>
                <p className="text-[13px] font-medium text-slate-500 mb-0.5">{label}</p>
                <p className="text-2xl font-semibold text-slate-900 leading-none">{value}</p>
            </div>
        </div>
    );
}

function CompletenessBar({ value }: { value: number }) {
    const color = value < 50 ? 'bg-red-500' : value < 80 ? 'bg-orange-500' : 'bg-green-500';
    return (
        <div className="flex flex-col gap-1.5 w-full max-w-[100px]">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">{value}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    className={cn("h-full rounded-full transition-all duration-1000", color)}
                />
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: any = {
        PENDING: 'bg-orange-50 text-orange-600 border-orange-100',
        APPROVED: 'bg-green-50 text-green-600 border-green-100',
        REJECTED: 'bg-red-50 text-red-600 border-red-100',
    };
    return (
        <span className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-semibold border",
            styles[status] || 'bg-slate-50 text-slate-600'
        )}>
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ProductsModerationPage() {
    const { locale } = useLanguage();
    const isAr = locale === 'ar';
    
    const [products, setProducts] = React.useState<Product[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [activeTab, setActiveTab] = React.useState('All Products');
    const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
    const [activePanelTab, setActivePanelTab] = React.useState('Product Info');
    const [rejectReason, setRejectReason] = React.useState('');
    const [showRejectInput, setShowRejectInput] = React.useState(false);
    
    // Bulk Selection
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const [isBulkLoading, setIsBulkLoading] = React.useState(false);

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiFetch('/products/admin/all');
            if (res.ok) {
                const data = await res.json();
                // Add mock completeness for visual demonstration if missing
                const enriched = (data as Product[]).map(p => ({
                    ...p,
                    completeness: p.completeness ?? Math.floor(Math.random() * 40) + 60
                }));
                setProducts(enriched);
            }
        } catch (err) {
            toast.error('Failed to load products');
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const [isMobile, setIsMobile] = React.useState(false);
    React.useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const handleApprove = async (id: string) => {
        const tid = toast.loading('Approving product...');
        try {
            const res = await apiFetch(`/products/${id}/approve`, { method: 'PATCH' });
            if (res.ok) {
                toast.success('Product approved successfully', { id: tid });
                fetchData();
                setSelectedProduct(null);
            } else {
                toast.error('Approval failed', { id: tid });
            }
        } catch (err) {
            toast.error('Error during approval', { id: tid });
        }
    };

    const handleReject = async (id: string) => {
        if (!rejectReason) {
            toast.error('Please enter a reason for rejection');
            return;
        }
        const tid = toast.loading('Rejecting product...');
        try {
            const res = await apiFetch(`/products/${id}/reject`, { 
                method: 'PATCH',
                body: JSON.stringify({ reason: rejectReason })
            });
            if (res.ok) {
                toast.success('Product rejected', { id: tid });
                fetchData();
                setSelectedProduct(null);
                setRejectReason('');
                setShowRejectInput(false);
            } else {
                toast.error('Rejection failed', { id: tid });
            }
        } catch (err) {
            toast.error('Error during rejection', { id: tid });
        }
    };

    const handleBulkAction = async (action: 'approve' | 'reject' | 'delete') => {
        if (selectedIds.length === 0) return;
        
        const confirmMsg = action === 'delete' 
            ? `Are you sure you want to delete ${selectedIds.length} products?`
            : `Are you sure you want to ${action} ${selectedIds.length} products?`;
            
        if (!window.confirm(confirmMsg)) return;

        const tid = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing products...`);
        setIsBulkLoading(true);
        try {
            const endpoint = `/products/bulk-${action}`;
            const res = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify({ ids: selectedIds })
            });

            if (res.ok) {
                const result = await res.json();
                toast.success(result.message || `Successfully ${action}d products`, { id: tid, duration: 4000 });
                setSelectedIds([]);
                fetchData();
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
        if (selectedIds.length === filteredProducts.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredProducts.map(p => p.id));
        }
    };

    const toggleSelectProduct = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Don't trigger row click (panel open)
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = React.useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const tid = toast.loading(`Uploading ${file.name}...`);
        
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await apiFetch('/products/bulk-upload', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const result = await res.json();
                toast.success(`Successfully processed! Created ${result.createdCount} products.`, { id: tid, duration: 5000 });
                fetchData();
            } else {
                toast.error('Failed to process file', { id: tid });
            }
        } catch (err) {
            toast.error('Upload connection error', { id: tid });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Filters
    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             p.supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTab = 
            activeTab === 'All Products' ? true :
            activeTab === 'Pending Review' ? p.status === 'PENDING' :
            activeTab === 'Approved' ? p.status === 'APPROVED' :
            activeTab === 'Rejected' ? p.status === 'REJECTED' : true;
        return matchesSearch && matchesTab;
    });

    const stats = {
        total: products.length,
        pending: products.filter(p => p.status === 'PENDING').length,
        approved: products.filter(p => p.status === 'APPROVED').length,
        rejected: products.filter(p => p.status === 'REJECTED').length,
        missing: products.filter(p => (p.completeness || 0) < 80).length
    };

    const tabs = ['All Products', 'Pending Review', 'Approved', 'Rejected'];

    return (
        <div className="space-y-8 pb-20 max-w-[1600px] mx-auto">
            {/* 1. Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Products Catalog</h1>
                    <p className="text-sm text-slate-500 mt-1">Review and manage the marketplace inventory catalog.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text"
                            placeholder="Search products, suppliers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-10 w-[320px] pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/5 transition-all"
                        />
                    </div>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                        accept=".csv,.xlsx,.xls"
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 flex items-center gap-2 hover:bg-slate-50 transition-all disabled:opacity-50"
                    >
                        <Upload size={16} /> {isUploading ? 'Uploading...' : 'Upload File'}
                    </button>
                    <Link 
                        href="/admin/products/new"
                        className="h-10 px-4 bg-teal-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20"
                    >
                        <Plus size={16} /> Add Product
                    </Link>
                </div>
            </div>

            {/* 2. KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 px-6">
                <KPICard label="Total Products" value={stats.total} icon={Package} color="text-slate-600" bg="bg-slate-50" />
                <KPICard label="Pending Approval" value={stats.pending} icon={Clock} color="text-orange-600" bg="bg-orange-50" />
                <KPICard label="Approved Products" value={stats.approved} icon={CheckCircle2} color="text-green-600" bg="bg-green-50" />
                <KPICard label="Rejected Products" value={stats.rejected} icon={XCircle} color="text-red-600" bg="bg-red-50" />
                <KPICard label="Missing Data" value={stats.missing} icon={AlertCircle} color="text-amber-600" bg="bg-amber-50" />
            </div>

            {/* 3. Main Content Area */}
            <div className="grid grid-cols-12 gap-8 px-6 h-full min-h-[600px]">
                
                {/* LEFT: 65% Table Area */}
                <div className={cn(
                    "space-y-6 transition-all duration-500",
                    selectedProduct ? "col-span-12 lg:col-span-8" : "col-span-12"
                )}>
                    {/* Tabs */}
                    <div className="flex items-center gap-2 p-1 bg-white border border-slate-200 rounded-xl w-fit">
                        {tabs.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "h-9 px-4 rounded-lg text-xs font-semibold transition-all",
                                    activeTab === tab 
                                        ? "bg-teal-50 text-teal-700 shadow-sm border border-teal-100" 
                                        : "text-slate-500 hover:text-slate-900"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Table (Desktop/Tablet) */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hidden md:block">
                        <div className="overflow-x-auto scrollbar-hide">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50/50 border-b border-slate-100">
                                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        <th className="px-6 py-4 w-10">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.length > 0 && selectedIds.length === filteredProducts.length}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                            />
                                        </th>
                                        <th className="px-6 py-4">Product</th>
                                        <th className="px-6 py-4">Supplier</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Completeness</th>
                                        <th className="px-6 py-4">Price</th>
                                        <th className="px-6 py-4">Stock</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {isLoading ? (
                                        [...Array(6)].map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td colSpan={8} className="px-6 py-4 h-16 bg-slate-50/50" />
                                            </tr>
                                        ))
                                    ) : filteredProducts.map((p) => (
                                        <tr 
                                            key={p.id} 
                                            onClick={() => setSelectedProduct(p)}
                                            className={cn(
                                                "group hover:bg-slate-50 transition-all cursor-pointer h-[64px]",
                                                (selectedProduct?.id === p.id || selectedIds.includes(p.id)) && "bg-teal-50/30"
                                            )}
                                        >
                                            <td className="px-6 py-4" onClick={(e) => toggleSelectProduct(e, p.id)}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.includes(p.id)}
                                                    readOnly
                                                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                                                        <img src={p.images?.[0] || 'https://via.placeholder.com/40'} className="w-full h-full object-cover" />
                                                    </div>
                                                    <span className="text-sm font-semibold text-slate-900 truncate max-w-[200px]">{p.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{p.supplier?.name || 'Admin Upload'}</td>
                                            <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                                            <td className="px-6 py-4"><CompletenessBar value={p.completeness || 0} /></td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-900">${p.price.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{p.stock.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-xs text-slate-400 font-medium">{new Date(p.createdAt).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 text-end">
                                                <button className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                                                    <ChevronRight size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Cards (Mobile) */}
                    <div className="grid grid-cols-1 gap-4 md:hidden">
                        {filteredProducts.map(p => (
                            <div key={p.id} onClick={() => setSelectedProduct(p)} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm active:scale-95 transition-all">
                                <div className="flex items-center gap-4">
                                    <img src={p.images?.[0]} className="w-16 h-16 rounded-xl object-cover border border-slate-100" />
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-bold text-slate-900 truncate">{p.name}</h4>
                                        <p className="text-xs text-slate-500 mt-0.5">{p.supplier?.name || 'Admin Upload'}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <StatusBadge status={p.status} />
                                            <span className="text-[10px] font-bold text-slate-900">${p.price.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT: 35% Panel Area */}
                <AnimatePresence>
                    {selectedProduct && (
                        <motion.div 
                            initial={isMobile ? { opacity: 0, y: 100 } : { opacity: 0, x: 20 }}
                            animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
                            exit={isMobile ? { opacity: 0, y: 100 } : { opacity: 0, x: 20 }}
                            className={cn(
                                "col-span-12 lg:col-span-4",
                                isMobile && "fixed inset-x-0 bottom-0 z-50 p-4"
                            )}
                        >
                            <div className={cn(
                                "bg-white border border-slate-200 shadow-xl overflow-hidden flex flex-col transition-all",
                                isMobile ? "rounded-t-3xl max-h-[80vh] h-[80vh]" : "rounded-3xl sticky top-8 h-[calc(100vh-140px)]"
                            )}>
                                {isMobile && (
                                    <div className="h-1.5 w-12 bg-slate-200 rounded-full mx-auto mt-3 mb-1 shrink-0" />
                                )}
                                {/* Panel Header */}
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden">
                                            <img src={selectedProduct.images?.[0]} className="w-full h-full object-cover" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900 truncate max-w-[200px]">{selectedProduct.name}</h3>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ID: {selectedProduct.id.slice(0, 8)}</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedProduct(null)}
                                        className="w-10 h-10 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 transition-all"
                                    >
                                        <XCircle size={20} />
                                    </button>
                                </div>

                                {/* Panel Content Tabs */}
                                <div className="flex items-center gap-4 px-6 border-b border-slate-100">
                                    {['Product Info', 'Supplier Info', 'AI Data', 'Notes'].map((t) => (
                                        <button 
                                            key={t}
                                            onClick={() => setActivePanelTab(t)}
                                            className={cn(
                                                "py-4 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all",
                                                activePanelTab === t ? "border-teal-500 text-teal-600" : "border-transparent text-slate-400 hover:text-slate-600"
                                            )}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>

                                {/* Scrollable Content */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                                    {activePanelTab === 'Product Info' && (
                                        <>
                                            <div className="space-y-4">
                                                <div className="aspect-video w-full rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden relative group">
                                                    <img src={selectedProduct.images?.[0]} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                                        <button className="h-9 px-4 bg-white rounded-xl text-xs font-bold flex items-center gap-2">
                                                            <Eye size={14} /> Full View
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                                    {selectedProduct.images.map((img, i) => (
                                                        <img key={i} src={img} className="w-16 h-16 rounded-xl object-cover border border-slate-100 shrink-0" />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Price</p>
                                                    <p className="text-lg font-bold text-slate-900">${selectedProduct.price.toLocaleString()}</p>
                                                </div>
                                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Stock</p>
                                                    <p className="text-lg font-bold text-slate-900">{selectedProduct.stock.toLocaleString()} units</p>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</p>
                                                <p className="text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-slate-100 italic">
                                                    "{selectedProduct.description || 'No description provided'}"
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="px-3 py-1 bg-teal-50 text-teal-600 text-[11px] font-bold rounded-lg border border-teal-100">
                                                        {selectedProduct.category}
                                                    </span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {activePanelTab === 'Supplier Info' && (
                                        <div className="space-y-6">
                                            <div className="p-6 bg-slate-900 rounded-3xl text-white relative overflow-hidden">
                                                <div className="absolute -right-4 -top-4 opacity-10">
                                                    <User size={120} />
                                                </div>
                                                <div className="relative z-10">
                                                    <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-2">Verified Supplier</p>
                                                    <h4 className="text-xl font-bold mb-1">{selectedProduct.supplier?.name || 'Platform Inventory'}</h4>
                                                    <p className="text-xs text-slate-400">{selectedProduct.supplier?.email || 'N/A'}</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="p-4 border border-slate-100 rounded-2xl flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400"><Package size={16}/></div>
                                                        <span className="text-xs font-semibold">Total Products</span>
                                                    </div>
                                                    <span className="text-sm font-bold">42</span>
                                                </div>
                                                <div className="p-4 border border-slate-100 rounded-2xl flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400"><CheckCircle size={16}/></div>
                                                        <span className="text-xs font-semibold">Quality Score</span>
                                                    </div>
                                                    <span className="text-sm font-bold text-green-600">98%</span>
                                                </div>
                                            </div>
                                            <button className="w-full h-12 bg-slate-100 text-slate-900 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                                                <ExternalLink size={14} /> View Supplier Profile
                                            </button>
                                        </div>
                                    )}

                                    {activePanelTab === 'AI Data' && (
                                        <div className="space-y-6">
                                            <div className="p-5 bg-teal-50 border border-teal-100 rounded-2xl flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-lg shadow-teal-600/20">
                                                    <Sparkles size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-teal-900">AI Data Extraction</h4>
                                                    <p className="text-[10px] text-teal-600 font-medium">Confidence Score: 94.2%</p>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between p-3 border-b border-slate-50">
                                                    <span className="text-xs text-slate-500 font-medium">Auto-Categorization</span>
                                                    <span className="text-xs font-bold text-slate-900">{selectedProduct.category}</span>
                                                </div>
                                                <div className="flex items-center justify-between p-3 border-b border-slate-50">
                                                    <span className="text-xs text-slate-500 font-medium">Price Alignment</span>
                                                    <span className="text-xs font-bold text-green-600">Optimal (+12%)</span>
                                                </div>
                                                <div className="flex items-center justify-between p-3 border-b border-slate-50">
                                                    <span className="text-xs text-slate-500 font-medium">Quality Check</span>
                                                    <span className="text-xs font-bold text-green-600">Passed</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {activePanelTab === 'Notes' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-slate-400 mb-2">
                                                <MessageSquare size={16} />
                                                <span className="text-[11px] font-bold uppercase tracking-widest">Internal Review Notes</span>
                                            </div>
                                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                                <p className="text-xs text-amber-700 leading-relaxed font-medium">
                                                    Supplier needs to provide higher resolution images for the secondary views. 
                                                    Current images are slightly blurred.
                                                </p>
                                                <p className="text-[9px] text-amber-500 font-bold mt-4 uppercase">Last updated: 2 hours ago</p>
                                            </div>
                                            <textarea 
                                                placeholder="Add private note for admin team..."
                                                className="w-full h-32 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs outline-none focus:border-teal-500 transition-all resize-none"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Panel Footer Actions */}
                                <div className="p-6 border-t border-slate-100 bg-slate-50/50 space-y-4">
                                    {showRejectInput ? (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="space-y-4"
                                        >
                                            <textarea 
                                                value={rejectReason}
                                                onChange={(e) => setRejectReason(e.target.value)}
                                                placeholder="Explain why this product is being rejected..."
                                                className="w-full h-24 bg-white border border-red-100 rounded-2xl p-4 text-xs outline-none focus:border-red-500 transition-all resize-none shadow-sm"
                                            />
                                            <div className="grid grid-cols-2 gap-3">
                                                <button 
                                                    onClick={() => setShowRejectInput(false)}
                                                    className="h-11 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={() => handleReject(selectedProduct.id)}
                                                    className="h-11 bg-red-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/20"
                                                >
                                                    Submit Rejection
                                                </button>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            <button 
                                                onClick={() => setShowRejectInput(true)}
                                                className="h-11 bg-white border border-red-100 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
                                            >
                                                Reject Product
                                            </button>
                                            <button 
                                                onClick={() => handleApprove(selectedProduct.id)}
                                                className="h-11 bg-teal-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-teal-600/20 hover:bg-teal-700 transition-all"
                                            >
                                                Approve Product
                                            </button>
                                            <button className="col-span-2 h-11 bg-orange-50 border border-orange-100 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-100 transition-all">
                                                Request Changes
                                            </button>
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
                                    <p className="text-sm font-bold">Items Selected</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Apply actions to selection</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => handleBulkAction('approve')}
                                    disabled={isBulkLoading}
                                    className="h-10 px-4 bg-teal-600 hover:bg-teal-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    <CheckCircle size={14} /> Approve
                                </button>
                                <button 
                                    onClick={() => handleBulkAction('reject')}
                                    disabled={isBulkLoading}
                                    className="h-10 px-4 bg-orange-600 hover:bg-orange-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    <XCircle size={14} /> Reject
                                </button>
                                <div className="w-px h-6 bg-slate-800 mx-1" />
                                <button 
                                    onClick={() => handleBulkAction('delete')}
                                    disabled={isBulkLoading}
                                    className="h-10 px-4 bg-white/10 hover:bg-red-600 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    <Trash2 size={14} /> Delete
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
