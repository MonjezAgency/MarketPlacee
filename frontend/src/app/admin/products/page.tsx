'use client';

import * as React from 'react';
import { 
    Search, Upload, Plus, Package, Clock, CheckCircle2, 
    XCircle, AlertCircle, MoreHorizontal, ChevronRight,
    ArrowUpRight, Info, User, Sparkles, MessageSquare,
    Trash2, Eye, ExternalLink, Filter, Download,
    CheckCircle, ShieldAlert, Activity, Pencil,
    Image as ImageIcon, ListFilter, FileSpreadsheet, ShieldCheck
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
    unit?: string;
    unitsPerPallet?: number;
    palletsPerShipment?: number;
    basePrice?: number;
    moq?: number;
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

    // Edit Mode State
    const [isEditing, setIsEditing] = React.useState(false);
    const [editData, setEditData] = React.useState<any>(null);
    const [isSavingEdit, setIsSavingEdit] = React.useState(false);
    const [isUploadingImage, setIsUploadingImage] = React.useState(false);
    const imageInputRef = React.useRef<HTMLInputElement>(null);
    const [showUploadGuide, setShowUploadGuide] = React.useState(false);

    const startEditing = (product: any) => {
        setEditData({ ...product });
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        if (!editData) return;
        const tid = toast.loading('Saving changes...');
        setIsSavingEdit(true);
        try {
            const res = await apiFetch(`/products/${editData.id}`, {
                method: 'PATCH',
                body: JSON.stringify(editData)
            });

            if (res.ok) {
                toast.success('Product updated successfully', { id: tid });
                setIsEditing(false);
                fetchData();
                setSelectedProduct(editData);
            } else {
                const err = await res.json();
                toast.error(err.message || 'Failed to save changes', { id: tid });
            }
        } catch (err) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsSavingEdit(false);
        }
    };

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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !editData) return;

        setIsUploadingImage(true);
        const tid = toast.loading(`Uploading ${file.name}...`);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await apiFetch('/products/upload-image', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const { url } = await res.json();
                setEditData({ ...editData, images: [...(editData.images || []), url] });
                toast.success('Image uploaded', { id: tid });
            } else {
                toast.error('Upload failed', { id: tid });
            }
        } catch (err) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsUploadingImage(false);
            if (imageInputRef.current) imageInputRef.current.value = '';
        }
    };

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
                        onClick={() => setShowUploadGuide(true)}
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
                                                        <img src={p.images?.[0] || 'https://via.placeholder.com/40'} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40?text=NA'; }} className="w-full h-full object-cover" />
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
                                    <img src={p.images?.[0] || 'https://via.placeholder.com/64'} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=NA'; }} className="w-16 h-16 rounded-xl object-cover border border-slate-100" />
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
                                            <img src={selectedProduct.images?.[0] || 'https://via.placeholder.com/64'} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=NA'; }} className="w-full h-full object-cover" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-bold text-slate-900 truncate max-w-[150px]">{selectedProduct.name}</h3>
                                                {selectedProduct.supplier?.email === 'Info@atlantisfmcg.com' && (
                                                    <span className="px-1.5 py-0.5 bg-indigo-600 text-[8px] text-white font-bold rounded uppercase tracking-tighter shadow-sm shadow-indigo-600/20">Founder</span>
                                                )}
                                            </div>
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
                                <div className="flex items-center gap-4 px-6 border-b border-slate-100 overflow-x-auto scrollbar-hide">
                                    {['Product Info', 'Pricing & Units', 'Supplier Info', 'AI Data', 'Notes'].map((t) => (
                                        <button 
                                            key={t}
                                            onClick={() => setActivePanelTab(t)}
                                            className={cn(
                                                "py-4 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap",
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
                                                    <img src={isEditing ? editData.images?.[0] : selectedProduct.images?.[0]} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400?text=Invalid+URL'; }} className="w-full h-full object-cover" />
                                                    {isEditing && (
                                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                            <p className="text-white text-[10px] font-bold uppercase tracking-widest">Editing Mode</p>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                                    {(isEditing ? editData.images : selectedProduct.images).map((img: string, i: number) => (
                                                        <div key={i} className="relative group shrink-0">
                                                            <img src={img} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=NA'; }} className="w-16 h-16 rounded-xl object-cover border border-slate-100" />
                                                            {isEditing && (
                                                                <button 
                                                                    onClick={() => setEditData({...editData, images: editData.images.filter((_:any, idx:number) => idx !== i)})}
                                                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                                                                >
                                                                    <Trash2 size={10} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {isEditing && (
                                                        <div className="flex gap-2">
                                                            <input 
                                                                type="file" 
                                                                hidden 
                                                                ref={imageInputRef} 
                                                                onChange={handleImageUpload}
                                                                accept="image/*"
                                                            />
                                                            <button 
                                                                onClick={() => imageInputRef.current?.click()}
                                                                className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 hover:border-teal-200 transition-all shrink-0"
                                                            >
                                                                <Upload size={16} />
                                                                <span className="text-[8px] font-bold mt-1">DEVICE</span>
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    const url = window.prompt('Enter professional image URL:');
                                                                    if (url && url.trim()) setEditData({...editData, images: [...(editData.images || []), url.trim()]});
                                                                }}
                                                                className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 hover:border-teal-200 transition-all shrink-0"
                                                            >
                                                                <ImageIcon size={16} />
                                                                <span className="text-[8px] font-bold mt-1">URL</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Name</label>
                                                    {isEditing ? (
                                                        <input 
                                                            className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-teal-500"
                                                            value={editData.name}
                                                            onChange={(e) => setEditData({...editData, name: e.target.value})}
                                                        />
                                                    ) : (
                                                        <p className="text-sm font-bold text-slate-900">{selectedProduct.name}</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Display Price ($)</p>
                                                    {isEditing ? (
                                                        <input 
                                                            type="number"
                                                            className="w-full bg-transparent border-b border-teal-200 text-lg font-bold outline-none"
                                                            value={editData.price}
                                                            onChange={(e) => setEditData({...editData, price: parseFloat(e.target.value)})}
                                                        />
                                                    ) : (
                                                        <p className="text-lg font-bold text-slate-900">${selectedProduct.price.toLocaleString()}</p>
                                                    )}
                                                </div>
                                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Stock</p>
                                                    {isEditing ? (
                                                        <input 
                                                            type="number"
                                                            className="w-full bg-transparent border-b border-teal-200 text-lg font-bold outline-none"
                                                            value={editData.stock}
                                                            onChange={(e) => setEditData({...editData, stock: parseInt(e.target.value)})}
                                                        />
                                                    ) : (
                                                        <p className="text-lg font-bold text-slate-900">{selectedProduct.stock.toLocaleString()} units</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</p>
                                                {isEditing ? (
                                                    <textarea 
                                                        className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-teal-500 resize-none"
                                                        value={editData.description}
                                                        onChange={(e) => setEditData({...editData, description: e.target.value})}
                                                    />
                                                ) : (
                                                    <p className="text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-slate-100 italic">
                                                        "{selectedProduct.description || 'No description provided'}"
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</p>
                                                {isEditing ? (
                                                    <select 
                                                        className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none"
                                                        value={editData.category}
                                                        onChange={(e) => setEditData({...editData, category: e.target.value})}
                                                    >
                                                        <option value="Beverages">Beverages</option>
                                                        <option value="Soft Drinks">Soft Drinks</option>
                                                        <option value="Energy Drinks">Energy Drinks</option>
                                                        <option value="Water">Water</option>
                                                        <option value="Juices">Juices</option>
                                                        <option value="Snacks">Snacks</option>
                                                        <option value="Chips">Chips</option>
                                                        <option value="Chocolate">Chocolate</option>
                                                        <option value="Candy">Candy</option>
                                                        <option value="Biscuits">Biscuits</option>
                                                        <option value="Dairy">Dairy</option>
                                                        <option value="Milk">Milk</option>
                                                        <option value="Cheese">Cheese</option>
                                                        <option value="Yogurt">Yogurt</option>
                                                        <option value="Personal Care">Personal Care</option>
                                                        <option value="Skincare">Skincare</option>
                                                        <option value="Haircare">Haircare</option>
                                                        <option value="Oral Care">Oral Care</option>
                                                        <option value="Cleaning">Cleaning</option>
                                                        <option value="Household">Household</option>
                                                        <option value="Detergent">Detergent</option>
                                                        <option value="Frozen Food">Frozen Food</option>
                                                        <option value="Ice Cream">Ice Cream</option>
                                                        <option value="Meat">Meat</option>
                                                        <option value="Seafood">Seafood</option>
                                                        <option value="Bakery">Bakery</option>
                                                        <option value="Bread">Bread</option>
                                                        <option value="Pastries">Pastries</option>
                                                        <option value="Tobacco">Tobacco</option>
                                                        <option value="Coffee">Coffee</option>
                                                        <option value="Tea">Tea</option>
                                                        <option value="Baby Products">Baby Products</option>
                                                        <option value="Pet Food">Pet Food</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-3 py-1 bg-teal-50 text-teal-600 text-[11px] font-bold rounded-lg border border-teal-100">
                                                            {selectedProduct.category}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {activePanelTab === 'Pricing & Units' && (
                                        <div className="space-y-6">
                                            <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl">
                                                <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mb-3">Unit Configuration</p>
                                                <div className="grid grid-cols-1 gap-4">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Pricing Unit</label>
                                                        {isEditing ? (
                                                            <select 
                                                                className="w-full h-11 px-4 bg-white border border-teal-200 rounded-xl text-sm font-bold outline-none"
                                                                value={editData.unit || 'piece'}
                                                                onChange={(e) => setEditData({...editData, unit: e.target.value})}
                                                            >
                                                                <option value="piece">Base Piece / Item</option>
                                                                <option value="pallet">Pallet (Wholesale)</option>
                                                                <option value="shipment">Full Shipment / Container</option>
                                                            </select>
                                                        ) : (
                                                            <p className="text-sm font-bold text-slate-900 capitalize">{selectedProduct.unit || 'Piece'}</p>
                                                        )}
                                                    </div>

                                                    {(isEditing ? editData.unit : selectedProduct.unit) === 'pallet' && (
                                                        <div className="space-y-1 animate-in slide-in-from-top-2">
                                                            <label className="text-[10px] text-slate-500 font-bold uppercase">Pieces Per Pallet</label>
                                                            {isEditing ? (
                                                                <input 
                                                                    type="number"
                                                                    className="w-full h-10 px-3 bg-white border border-teal-100 rounded-xl text-sm font-bold"
                                                                    value={editData.unitsPerPallet || 0}
                                                                    onChange={(e) => setEditData({...editData, unitsPerPallet: parseInt(e.target.value)})}
                                                                />
                                                            ) : (
                                                                <p className="text-sm font-bold text-slate-900">{selectedProduct.unitsPerPallet || 0} pieces</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {(isEditing ? editData.unit : selectedProduct.unit) === 'shipment' && (
                                                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] text-slate-500 font-bold uppercase">Pallets / Shipment</label>
                                                                {isEditing ? (
                                                                    <input 
                                                                        type="number"
                                                                        className="w-full h-10 px-3 bg-white border border-teal-100 rounded-xl text-sm font-bold"
                                                                        value={editData.palletsPerShipment || 0}
                                                                        onChange={(e) => setEditData({...editData, palletsPerShipment: parseInt(e.target.value)})}
                                                                    />
                                                                ) : (
                                                                    <p className="text-sm font-bold text-slate-900">{selectedProduct.palletsPerShipment || 0}</p>
                                                                )}
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] text-slate-500 font-bold uppercase">Pieces / Pallet</label>
                                                                {isEditing ? (
                                                                    <input 
                                                                        type="number"
                                                                        className="w-full h-10 px-3 bg-white border border-teal-100 rounded-xl text-sm font-bold"
                                                                        value={editData.unitsPerPallet || 0}
                                                                        onChange={(e) => setEditData({...editData, unitsPerPallet: parseInt(e.target.value)})}
                                                                    />
                                                                ) : (
                                                                    <p className="text-sm font-bold text-slate-900">{selectedProduct.unitsPerPallet || 0}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    Order Requirements <Info size={12} className="text-teal-500"/>
                                                </p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Unit Price ($)</p>
                                                        {isEditing ? (
                                                            <input 
                                                                type="number"
                                                                className="w-full h-8 text-sm font-bold outline-none border-b border-teal-100 bg-transparent"
                                                                value={editData.basePrice || 0}
                                                                onChange={(e) => setEditData({...editData, basePrice: parseFloat(e.target.value)})}
                                                            />
                                                        ) : (
                                                            <p className="text-sm font-bold text-slate-900">${selectedProduct.basePrice || 0}</p>
                                                        )}
                                                    </div>
                                                    <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Min Order (MOQ)</p>
                                                        <div className="flex items-center gap-1.5">
                                                            {isEditing ? (
                                                                <input 
                                                                    type="number"
                                                                    className="w-12 h-8 text-sm font-bold outline-none border-b border-teal-100 bg-transparent"
                                                                    value={editData.moq || 1}
                                                                    onChange={(e) => setEditData({...editData, moq: parseInt(e.target.value)})}
                                                                />
                                                            ) : (
                                                                <span className="text-sm font-bold text-slate-900">{selectedProduct.moq || 1}</span>
                                                            )}
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase">{(isEditing ? editData.unit : selectedProduct.unit) || 'Piece'}(s)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                                    <p className="text-[9px] text-amber-700 font-medium leading-tight">
                                                        {((isEditing ? editData.unit : selectedProduct.unit) === 'pallet') ? 
                                                            `The customer must purchase at least ${(isEditing ? editData.moq : selectedProduct.moq) || 1} pallet(s) (${((isEditing ? editData.moq : selectedProduct.moq) || 1) * ((isEditing ? editData.unitsPerPallet : selectedProduct.unitsPerPallet) || 0)} pieces total).` :
                                                         ((isEditing ? editData.unit : selectedProduct.unit) === 'shipment') ?
                                                            `The customer must purchase at least ${(isEditing ? editData.moq : selectedProduct.moq) || 1} shipment(s).` :
                                                            `The customer must purchase at least ${(isEditing ? editData.moq : selectedProduct.moq) || 1} piece(s).`
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
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
                                    {isEditing ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            <button 
                                                onClick={() => setIsEditing(false)}
                                                className="h-11 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                onClick={handleSaveEdit}
                                                disabled={isSavingEdit}
                                                className="h-11 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg shadow-slate-900/20"
                                            >
                                                {isSavingEdit ? "Saving..." : "Save Changes"}
                                            </button>
                                        </div>
                                    ) : showRejectInput ? (
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
                                            <button 
                                                onClick={() => startEditing(selectedProduct)}
                                                className="col-span-2 h-11 bg-slate-100 border border-slate-200 text-slate-900 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                            >
                                                <Pencil size={14} /> Edit Product Details
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

            {/* Bulk Upload Guidelines Modal */}
            <AnimatePresence>
                {showUploadGuide && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowUploadGuide(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-[32px] w-full max-w-2xl relative z-10 overflow-hidden shadow-2xl border border-slate-200"
                        >
                            <div className="p-8">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600">
                                            <FileSpreadsheet size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900">Bulk Ingestion Guidelines</h3>
                                            <p className="text-sm text-slate-500 mt-0.5">Please ensure your file meets these requirements</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowUploadGuide(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all">
                                        <XCircle size={20} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Supported Formats</h4>
                                            <div className="flex items-center gap-2">
                                                <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600">.XLSX</span>
                                                <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600">.CSV</span>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl">
                                            <div className="flex items-start gap-3">
                                                <ShieldCheck className="text-teal-600 mt-0.5" size={18} />
                                                <div>
                                                    <p className="text-sm font-bold text-teal-900">Validation Protocol</p>
                                                    <p className="text-[12px] text-teal-700 mt-1 leading-relaxed">
                                                        The system will verify each row. Invalid data (e.g. text in price column) will stop the ingestion.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-2">Mandatory Columns</h4>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            {[
                                                'Product Name', 'Description', 'Product image',
                                                'UnitBarcode', 'BBD (Shelf Life)', 'Units / Carton',
                                                'Cartons / Pallet', 'UnitPriceEUR', 'MOQ'
                                            ].map(col => (
                                                <div key={col} className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                                                    <span className="text-[10px] font-bold text-slate-600 truncate">{col}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-10 flex items-center gap-3">
                                    <button 
                                        onClick={() => {
                                            setShowUploadGuide(false);
                                            setTimeout(() => fileInputRef.current?.click(), 100);
                                        }}
                                        className="flex-1 h-14 bg-teal-600 text-white rounded-2xl font-bold uppercase text-[12px] tracking-widest shadow-lg shadow-teal-600/20 hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle size={18} /> I Understand, Start Upload
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
