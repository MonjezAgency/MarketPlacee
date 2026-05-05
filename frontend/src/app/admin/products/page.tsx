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
import { formatPrice, getActiveCurrency, getCurrencyInfo } from '@/lib/currency';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import AddProductDrawer from '@/components/product/AddProductDrawer';

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
    unitsPerCase?: number;
    casesPerPallet?: number;
    unitsPerPallet?: number;
    palletsPerShipment?: number;
    basePrice?: number;
    moq?: number;
    ean?: string;
    origin?: string;
    shelfLife?: string;
    weight?: number;
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
    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [activeTab, setActiveTab] = React.useState('All Products');
    const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
    const [activePanelTab, setActivePanelTab] = React.useState('Product Info');
    const [rejectReason, setRejectReason] = React.useState('');
    const [showRejectInput, setShowRejectInput] = React.useState(false);
    const panelScrollRef = React.useRef<HTMLDivElement>(null);
    
    // Bulk Selection
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const [isBulkLoading, setIsBulkLoading] = React.useState(false);

    // Markup config (fetched from /config/markup)
    const [markups, setMarkups] = React.useState({ piece: 1.5, pallet: 1.1, container: 1.05 });

    React.useEffect(() => {
        apiFetch('/config/markup')
            .then(r => r.json())
            .then(d => { if (d?.piece) setMarkups({ piece: d.piece, pallet: d.pallet, container: d.container }); })
            .catch(() => {});
    }, []);

    // Edit Mode State
    const [isEditing, setIsEditing] = React.useState(false);
    const [editData, setEditData] = React.useState<any>(null);
    const [isSavingEdit, setIsSavingEdit] = React.useState(false);
    const [isUploadingImage, setIsUploadingImage] = React.useState(false);
    const imageInputRef = React.useRef<HTMLInputElement>(null);
    const [showUploadGuide, setShowUploadGuide] = React.useState(false);
    const [showUrlInput, setShowUrlInput] = React.useState(false);
    const [urlInputValue, setUrlInputValue] = React.useState('');

    const startEditing = (product: any) => {
        setEditData({ ...product });
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        if (!editData) return;
        const tid = toast.loading('Saving changes...');
        setIsSavingEdit(true);
        try {
            // Backend PATCH treats `price` field as the new basePrice and recalculates
            // the customer-facing price with markup. So we must send basePrice here,
            // NOT the already-marked-up `price` — otherwise price keeps compounding.
            const patchPayload = {
                ...editData,
                price: editData.basePrice ?? editData.price,
            };
            const res = await apiFetch(`/products/${editData.id}`, {
                method: 'PATCH',
                body: JSON.stringify(patchPayload)
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
        const files = Array.from(e.target.files || []);
        if (!files.length || !editData) return;

        setIsUploadingImage(true);
        const newUrls: string[] = [];
        for (const file of files) {
            const tid = toast.loading(`Uploading ${file.name}...`);
            try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await apiFetch('/products/upload-image', { method: 'POST', body: formData });
                if (res.ok) {
                    const { url } = await res.json();
                    newUrls.push(url);
                    toast.success(`Uploaded: ${file.name}`, { id: tid });
                } else {
                    toast.error(`Failed: ${file.name}`, { id: tid });
                }
            } catch {
                toast.error(`Error: ${file.name}`);
            }
        }
        if (newUrls.length) {
            setEditData((prev: any) => ({ ...prev, images: [...(prev.images || []), ...newUrls] }));
        }
        setIsUploadingImage(false);
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    const handleAddImageUrls = () => {
        if (!urlInputValue.trim() || !editData) return;
        // Accept newline-separated, comma-separated, or space-separated URLs
        const urls = urlInputValue
            .split(/[\n,\s]+/)
            .map(u => u.trim())
            .filter(u => u.startsWith('http'));
        if (!urls.length) { toast.error('No valid URLs found'); return; }
        setEditData((prev: any) => ({ ...prev, images: [...(prev.images || []), ...urls] }));
        setUrlInputValue('');
        setShowUrlInput(false);
        toast.success(`Added ${urls.length} image${urls.length > 1 ? 's' : ''}`);
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

    // Delete a single product (admin) — only allowed for PENDING / REJECTED.
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);

    const handleDelete = async (id: string) => {
        const tid = toast.loading('Deleting product...');
        setIsDeleting(true);
        try {
            const res = await apiFetch(`/products/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Product deleted', { id: tid });
                setShowDeleteConfirm(false);
                setSelectedProduct(null);
                fetchData();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.message || 'Delete failed', { id: tid });
            }
        } catch (err) {
            toast.error('Error during delete', { id: tid });
        } finally {
            setIsDeleting(false);
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
    const [uploadCurrency, setUploadCurrency] = React.useState(() => getActiveCurrency());

    // Keep uploadCurrency in sync with the user's settings — they no longer
    // pick it manually, so we re-read whenever the settings change.
    React.useEffect(() => {
        const sync = () => setUploadCurrency(getActiveCurrency());
        window.addEventListener('currency-changed', sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener('currency-changed', sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    // Currency repair tool state
    const [showFixCurrency, setShowFixCurrency] = React.useState(false);
    const [fixFromCurrency, setFixFromCurrency] = React.useState('EUR');
    const [fixSupplierId, setFixSupplierId] = React.useState('');
    const [fixPreview, setFixPreview] = React.useState<any>(null);
    const [isFixing, setIsFixing] = React.useState(false);

    const runFixCurrency = async (dryRun: boolean) => {
        setIsFixing(true);
        const tid = toast.loading(dryRun ? 'Calculating preview...' : 'Converting prices...');
        try {
            const res = await apiFetch('/products/admin/fix-currency', {
                method: 'POST',
                body: JSON.stringify({
                    fromCurrency: fixFromCurrency,
                    supplierId: fixSupplierId || undefined,
                    dryRun,
                }),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                toast.error(data.error || data.message || 'Failed', { id: tid });
                return;
            }
            if (dryRun) {
                setFixPreview(data);
                toast.success(`Preview ready: ${data.count} products would be updated`, { id: tid });
            } else {
                toast.success(`Updated ${data.count} products successfully`, { id: tid });
                setShowFixCurrency(false);
                setFixPreview(null);
                fetchData();
            }
        } catch (e) {
            toast.error('Connection error', { id: tid });
        } finally {
            setIsFixing(false);
        }
    };
    const [isAddDrawerOpen, setIsAddDrawerOpen] = React.useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const tid = toast.loading(`Uploading ${file.name}...`);
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('currency', uploadCurrency);

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
                    {/* Currency comes from the user's settings (platform-currency
                        in localStorage) — no manual dropdown shown. The active
                        currency is displayed beside the Upload File button so
                        the admin can confirm before uploading. */}
                    <div className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2" title="Currency the file's prices will be interpreted in. Change in Settings.">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">File in</span>
                        <span className="text-xs font-black text-slate-900">{uploadCurrency}</span>
                    </div>
                    <button
                        onClick={() => setShowUploadGuide(true)}
                        disabled={isUploading}
                        className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 flex items-center gap-2 hover:bg-slate-50 transition-all disabled:opacity-50"
                    >
                        <Upload size={16} /> {isUploading ? 'Uploading...' : 'Upload File'}
                    </button>
                    <button
                        onClick={() => setIsAddDrawerOpen(true)}
                        className="h-10 px-4 bg-teal-600 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20"
                    >
                        <Plus size={16} /> Add Product
                    </button>
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
                <div className="col-span-12 space-y-6">
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
                                            <td className="px-6 py-4 text-sm font-bold text-slate-900" title={`Buyer price (with markup): ${formatPrice(p.price)}`}>{formatPrice(p.basePrice ?? p.price)}</td>
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
                                            <span className="text-[10px] font-bold text-slate-900" title={`Buyer price: ${formatPrice(p.price)}`}>{formatPrice(p.basePrice ?? p.price)}</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* Product Details — centered modal */}
            <AnimatePresence>
                {selectedProduct && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => setSelectedProduct(null)}
                    >
                        <motion.div
                            key={selectedProduct.id}
                            initial={{ opacity: 0, y: 24, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 24, scale: 0.97 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            onClick={(e) => e.stopPropagation()}
                            className="relative w-full max-w-[920px] flex flex-col"
                        >
                            <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
                                {/* Panel Header */}
                                <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                            {selectedProduct.images?.[0] ? (
                                                <img src={selectedProduct.images[0]} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} className="w-full h-full object-cover" />
                                            ) : (
                                                <Package size={20} className="text-slate-300" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base font-black text-slate-900 leading-tight truncate" title={selectedProduct.name}>
                                                    {selectedProduct.name}
                                                </h3>
                                                {selectedProduct.supplier?.email === 'Info@atlantisfmcg.com' && (
                                                    <span className="px-1.5 py-0.5 bg-indigo-600 text-[8px] text-white font-bold rounded uppercase tracking-tighter shadow-sm shadow-indigo-600/20 shrink-0">Founder</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                                                    selectedProduct.status === 'APPROVED' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                                    selectedProduct.status === 'PENDING' && "bg-amber-50 text-amber-700 border border-amber-200",
                                                    selectedProduct.status === 'REJECTED' && "bg-red-50 text-red-700 border border-red-200"
                                                )}>
                                                    {selectedProduct.status}
                                                </span>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {selectedProduct.id.slice(0, 8)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedProduct(null)}
                                        className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-all shrink-0"
                                    >
                                        <XCircle size={20} />
                                    </button>
                                </div>

                                {/* Panel Content Tabs */}
                                <div className="flex items-center gap-4 px-6 border-b border-slate-100 overflow-x-auto scrollbar-hide">
                                    {['Product Info', 'Pricing & Units', 'Supplier Info', 'AI Data', 'Notes'].map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => { setActivePanelTab(t); panelScrollRef.current?.scrollTo({ top: 0 }); }}
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
                                <div ref={panelScrollRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                                    {activePanelTab === 'Product Info' && (
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                            {/* LEFT COLUMN — Overview + Basic Info */}
                                            <div className="lg:col-span-2 space-y-5">
                                                {/* Product Overview card */}
                                                <div className="border border-slate-200 rounded-2xl p-5">
                                                    <h4 className="text-[14px] font-bold text-slate-900 mb-4">Product Overview</h4>
                                                    <div className="aspect-[5/3] w-full rounded-2xl bg-slate-50 border border-slate-200 border-dashed overflow-hidden relative flex items-center justify-center">
                                                        {(isEditing ? editData.images?.[0] : selectedProduct.images?.[0]) ? (
                                                            <img src={isEditing ? editData.images?.[0] : selectedProduct.images?.[0]} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-3 text-slate-300 text-center px-6">
                                                                <ImageIcon size={44} strokeWidth={1.5} />
                                                                <div>
                                                                    <p className="text-[14px] font-semibold text-slate-500">No image uploaded</p>
                                                                    <p className="text-[12px] text-slate-400 mt-1">Upload a clear product image to help buyers identify your product.</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {isEditing && (
                                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                                <p className="text-white text-[10px] font-bold uppercase tracking-widest">Editing Mode</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Image thumbnails strip (only when there are multiple) */}
                                                    {(selectedProduct.images && selectedProduct.images.length > 1) && (
                                                        <div className="flex gap-2 overflow-x-auto pt-3 scrollbar-hide">
                                                            {(isEditing ? editData.images : selectedProduct.images).map((img: string, i: number) => (
                                                                <div key={i} className="relative group shrink-0">
                                                                    <div className="relative w-14 h-14 rounded-xl border border-slate-100 bg-slate-100 overflow-hidden flex items-center justify-center">
                                                                        <Package size={16} className="text-slate-300" />
                                                                        <img src={img} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover" />
                                                                    </div>
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
                                                        </div>
                                                    )}
                                                    {isEditing && (
                                                        <div className="mt-3 space-y-2">
                                                            {/* Row 1 — upload + paste buttons */}
                                                            <div className="flex gap-2">
                                                                <input type="file" hidden multiple ref={imageInputRef} onChange={handleImageUpload} accept="image/*" />
                                                                <button
                                                                    onClick={() => imageInputRef.current?.click()}
                                                                    disabled={isUploadingImage}
                                                                    className="flex-1 h-10 rounded-xl border border-dashed border-slate-300 text-[12px] font-semibold text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                                                >
                                                                    <Upload size={14} /> {isUploadingImage ? 'Uploading…' : 'Upload images'}
                                                                </button>
                                                                <button
                                                                    onClick={() => { setShowUrlInput(!showUrlInput); setUrlInputValue(''); }}
                                                                    className="flex-1 h-10 rounded-xl border border-dashed border-slate-300 text-[12px] font-semibold text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                                                >
                                                                    <ImageIcon size={14} /> Paste URLs
                                                                </button>
                                                            </div>
                                                            {/* Row 2 — inline URL textarea (toggle) */}
                                                            {showUrlInput && (
                                                                <div className="space-y-1.5">
                                                                    <textarea
                                                                        rows={3}
                                                                        value={urlInputValue}
                                                                        onChange={(e) => setUrlInputValue(e.target.value)}
                                                                        placeholder={"Paste image URLs (one per line or comma-separated):\nhttps://example.com/img1.jpg\nhttps://example.com/img2.jpg"}
                                                                        className="w-full px-3 py-2 text-[12px] border border-slate-200 rounded-xl outline-none focus:border-teal-500 resize-none placeholder:text-slate-300"
                                                                    />
                                                                    <button
                                                                        onClick={handleAddImageUrls}
                                                                        className="w-full h-9 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-[12px] font-bold transition-colors"
                                                                    >
                                                                        Add URLs
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Basic Information card */}
                                                <div className="border border-slate-200 rounded-2xl p-5">
                                                    <h4 className="text-[14px] font-bold text-slate-900 mb-4">Basic Information</h4>
                                                    <dl className="divide-y divide-slate-100">
                                                        <div className="flex items-center justify-between py-3">
                                                            <dt className="text-[13px] text-slate-500">Product Name</dt>
                                                            <dd className="text-[13px] font-bold text-slate-900 max-w-[60%] text-right truncate" title={selectedProduct.name}>
                                                                {isEditing ? (
                                                                    <input className="h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:border-teal-500" value={editData.name} onChange={(e) => setEditData({...editData, name: e.target.value})} />
                                                                ) : selectedProduct.name}
                                                            </dd>
                                                        </div>
                                                        <div className="flex items-center justify-between py-3">
                                                            <dt className="text-[13px] text-slate-500">Product ID</dt>
                                                            <dd className="text-[13px] font-bold text-slate-900 font-mono">{selectedProduct.id.slice(0, 8).toUpperCase()}</dd>
                                                        </div>
                                                        <div className="flex items-center justify-between py-3">
                                                            <dt className="text-[13px] text-slate-500">Status</dt>
                                                            <dd>
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                                                    selectedProduct.status === 'APPROVED' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                                                    selectedProduct.status === 'PENDING' && "bg-amber-50 text-amber-700 border border-amber-200",
                                                                    selectedProduct.status === 'REJECTED' && "bg-red-50 text-red-700 border border-red-200"
                                                                )}>
                                                                    {selectedProduct.status}
                                                                </span>
                                                            </dd>
                                                        </div>
                                                        {selectedProduct.ean && (
                                                            <div className="flex items-center justify-between py-3">
                                                                <dt className="text-[13px] text-slate-500">EAN / UPC</dt>
                                                                <dd className="text-[13px] font-bold text-slate-900 font-mono">{selectedProduct.ean}</dd>
                                                            </div>
                                                        )}
                                                        {selectedProduct.origin && (
                                                            <div className="flex items-center justify-between py-3">
                                                                <dt className="text-[13px] text-slate-500">Origin</dt>
                                                                <dd className="text-[13px] font-bold text-slate-900">{selectedProduct.origin}</dd>
                                                            </div>
                                                        )}
                                                        {selectedProduct.shelfLife && (
                                                            <div className="flex items-center justify-between py-3">
                                                                <dt className="text-[13px] text-slate-500">BBD</dt>
                                                                <dd className="text-[13px] font-bold text-slate-900">{selectedProduct.shelfLife}</dd>
                                                            </div>
                                                        )}
                                                        {selectedProduct.weight ? (
                                                            <div className="flex items-center justify-between py-3">
                                                                <dt className="text-[13px] text-slate-500">Weight</dt>
                                                                <dd className="text-[13px] font-bold text-slate-900">{selectedProduct.weight} kg</dd>
                                                            </div>
                                                        ) : null}
                                                        {selectedProduct.description && (
                                                            <div className="py-3">
                                                                <dt className="text-[13px] text-slate-500 mb-2">Description</dt>
                                                                <dd className="text-[12px] text-slate-700 leading-relaxed">{selectedProduct.description}</dd>
                                                            </div>
                                                        )}
                                                    </dl>
                                                </div>
                                            </div>

                                            {/* RIGHT COLUMN — Summary + Submission Checklist */}
                                            <div className="space-y-5">
                                                {/* Product Summary */}
                                                <div className="border border-slate-200 rounded-2xl p-5">
                                                    <h4 className="text-[14px] font-bold text-slate-900 mb-4">Product Summary</h4>
                                                    <dl className="space-y-3">
                                                        {[
                                                            { label: 'Category',  value: selectedProduct.category },
                                                            { label: 'Brand',     value: (selectedProduct as any).brand },
                                                            { label: 'Unit Type', value: (() => {
                                                                const u = String(selectedProduct.unit || '').toLowerCase();
                                                                if (u === 'piece' || u === 'pcs' || u === 'item') return 'Piece';
                                                                if (u === 'case' || u === 'carton' || u === 'box') return 'Carton';
                                                                if (u === 'pallet') return 'Pallet';
                                                                if (u === 'truck' || u === 'container' || u === 'shipment') return 'Truck';
                                                                return selectedProduct.unit || null;
                                                            })() },
                                                            { label: 'Created At',   value: (selectedProduct as any).createdAt ? new Date((selectedProduct as any).createdAt).toLocaleDateString() : null },
                                                            { label: 'Last Updated', value: (selectedProduct as any).updatedAt ? new Date((selectedProduct as any).updatedAt).toLocaleDateString() : null },
                                                        ].map((row) => (
                                                            <div key={row.label} className="flex items-center justify-between">
                                                                <dt className="text-[12px] text-slate-500">{row.label}</dt>
                                                                <dd className="text-[12px] font-bold text-slate-700">{row.value || '—'}</dd>
                                                            </div>
                                                        ))}
                                                    </dl>
                                                </div>

                                                {/* Submission Checklist */}
                                                <div className="border border-slate-200 rounded-2xl p-5">
                                                    <h4 className="text-[14px] font-bold text-slate-900 mb-4">Submission Checklist</h4>
                                                    {(() => {
                                                        const checklist = [
                                                            { label: 'Product image',       done: (selectedProduct.images || []).length > 0,        missingLabel: 'Missing' },
                                                            { label: 'Pricing & units',     done: !!selectedProduct.price && !!selectedProduct.unit,  missingLabel: 'Pending' },
                                                            { label: 'Supplier information', done: !!selectedProduct.supplier?.id,                    missingLabel: 'Pending' },
                                                            { label: 'AI data',             done: !!selectedProduct.description && selectedProduct.description.length > 30, missingLabel: 'Pending' },
                                                            { label: 'Notes',               done: !!(selectedProduct as any).notes,                   missingLabel: 'Pending' },
                                                        ];
                                                        return (
                                                            <ul className="space-y-3">
                                                                {checklist.map(item => (
                                                                    <li key={item.label} className="flex items-center justify-between">
                                                                        <span className="flex items-center gap-2.5">
                                                                            <span className={cn(
                                                                                'w-2 h-2 rounded-full',
                                                                                item.done ? 'bg-emerald-500' : 'bg-slate-300'
                                                                            )} />
                                                                            <span className="text-[12px] font-semibold text-slate-700">{item.label}</span>
                                                                        </span>
                                                                        <span className={cn(
                                                                            'px-2 py-0.5 rounded-full text-[10px] font-bold',
                                                                            item.done
                                                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                                : item.missingLabel === 'Missing'
                                                                                    ? 'bg-slate-50 text-slate-500 border border-slate-200'
                                                                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                        )}>
                                                                            {item.done ? 'Complete' : item.missingLabel}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {activePanelTab === 'Pricing & Units' && (
                                        <div className="space-y-6">
                                            {/* ── Order Requirements ──────────────────── */}
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    Order Requirements <Info size={12} className="text-teal-500"/>
                                                </p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Price per Piece</p>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                className="w-full h-8 text-sm font-bold outline-none border-b border-teal-100 bg-transparent"
                                                                value={editData.basePrice ?? editData.price ?? 0}
                                                                onChange={(e) => setEditData({...editData, basePrice: parseFloat(e.target.value)})}
                                                            />
                                                        ) : (
                                                            <p className="text-sm font-bold text-slate-900">{formatPrice(selectedProduct.basePrice || 0)}</p>
                                                        )}
                                                    </div>
                                                    <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Min Order (MOQ)</p>
                                                        <div className="flex items-center gap-1.5">
                                                            {isEditing ? (
                                                                <input
                                                                    type="number"
                                                                    className="w-16 h-8 text-sm font-bold outline-none border-b border-teal-100 bg-transparent"
                                                                    value={editData.moq ?? 1}
                                                                    onChange={(e) => setEditData({...editData, moq: parseInt(e.target.value)})}
                                                                />
                                                            ) : (
                                                                <span className="text-sm font-bold text-slate-900">{selectedProduct.moq || 1}</span>
                                                            )}
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase">piece(s)</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">Available Stock (pcs)</p>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                className="w-full h-8 text-sm font-bold outline-none border-b border-teal-100 bg-transparent"
                                                                value={editData.stock ?? 0}
                                                                onChange={(e) => setEditData({...editData, stock: parseInt(e.target.value)})}
                                                            />
                                                        ) : (
                                                            <p className="text-sm font-bold text-slate-900">{selectedProduct.stock ?? 0}</p>
                                                        )}
                                                    </div>
                                                    <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">EAN / Barcode</p>
                                                        {isEditing ? (
                                                            <input
                                                                type="text"
                                                                className="w-full h-8 text-sm font-bold outline-none border-b border-teal-100 bg-transparent"
                                                                value={editData.ean || ''}
                                                                onChange={(e) => setEditData({...editData, ean: e.target.value})}
                                                                placeholder="e.g. 7613035..."
                                                            />
                                                        ) : (
                                                            <p className="text-sm font-bold text-slate-900 font-mono">{selectedProduct.ean || '—'}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ── Logistics / Pack Configuration ───── */}
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logistics & Pack Configuration</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {[
                                                        { label: 'Pcs / Case',      key: 'unitsPerCase',       placeholder: 'e.g. 24' },
                                                        { label: 'Cases / Pallet',  key: 'casesPerPallet',     placeholder: 'e.g. 40' },
                                                        { label: 'Pallets / Truck', key: 'palletsPerShipment', placeholder: 'e.g. 20' },
                                                    ].map(({ label, key, placeholder }) => (
                                                        <div key={key} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">{label}</p>
                                                            {isEditing ? (
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    className="w-full h-8 text-sm font-bold outline-none border-b border-teal-100 bg-transparent"
                                                                    value={(editData as any)[key] ?? ''}
                                                                    onChange={(e) => setEditData({...editData, [key]: e.target.value ? parseInt(e.target.value) : null})}
                                                                    placeholder={placeholder}
                                                                />
                                                            ) : (
                                                                <p className="text-sm font-bold text-slate-900">{(selectedProduct as any)[key] ?? '—'}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {/* Units / Pallet — auto-calculated */}
                                                    <div className="p-4 border border-slate-100 rounded-2xl bg-teal-50/40">
                                                        <p className="text-[9px] text-teal-500 font-bold uppercase mb-1">Units / Pallet (auto)</p>
                                                        <p className="text-sm font-bold text-teal-700">
                                                            {(() => {
                                                                const pcs = (isEditing ? editData.unitsPerCase : selectedProduct.unitsPerCase) || 0;
                                                                const cases = (isEditing ? editData.casesPerPallet : selectedProduct.casesPerPallet) || 0;
                                                                return pcs && cases ? `${pcs * cases} pcs` : '—';
                                                            })()}
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Tier price preview — with markup, NO currency conversion (math stays in input currency) */}
                                                {(() => {
                                                    const pp = parseFloat((isEditing ? editData.basePrice : selectedProduct.basePrice) || 0);
                                                    const pc = (isEditing ? editData.unitsPerCase : selectedProduct.unitsPerCase) || 0;
                                                    const cp = (isEditing ? editData.casesPerPallet : selectedProduct.casesPerPallet) || 0;
                                                    const pt = (isEditing ? editData.palletsPerShipment : selectedProduct.palletsPerShipment) || 0;
                                                    if (!pp || !pc) return null;
                                                    // Apply tier-specific markups
                                                    const cartonTotal = pp * pc * markups.piece;
                                                    const palletTotal = cp ? pp * pc * cp * markups.pallet : null;
                                                    const truckTotal  = cp && pt ? pp * pc * cp * pt * markups.container : null;
                                                    // Per-carton equivalents
                                                    const palletPerCtn = palletTotal !== null && cp ? palletTotal / cp : null;
                                                    const truckPerCtn  = truckTotal !== null && cp && pt ? truckTotal / (cp * pt) : null;
                                                    // Local formatter — no currency conversion (input value is already in user's display currency)
                                                    const sym = getCurrencyInfo().symbol;
                                                    const fmt = (n: number) => `${sym}${n.toFixed(2)}`;
                                                    return (
                                                        <div className="p-4 bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-[10px] text-teal-700 font-black uppercase tracking-widest">Customer prices (markup applied)</p>
                                                                <p className="text-[9px] text-slate-500 font-mono">base {fmt(pp)} / pc</p>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <div className="bg-white/60 rounded-xl p-2.5 text-center border border-white">
                                                                    <p className="text-[9px] text-teal-600 font-black uppercase">Carton</p>
                                                                    <p className="text-[15px] font-black text-teal-800">{fmt(cartonTotal)}</p>
                                                                    <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                                                                        {fmt(pp)} × {pc} × {markups.piece}
                                                                    </p>
                                                                </div>
                                                                {palletTotal !== null && (
                                                                    <div className="bg-white/60 rounded-xl p-2.5 text-center border border-white">
                                                                        <p className="text-[9px] text-teal-600 font-black uppercase">Pallet</p>
                                                                        <p className="text-[15px] font-black text-teal-800">{fmt(palletTotal)}</p>
                                                                        <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                                                                            {fmt(pp)} × {pc} × {cp} × {markups.pallet}
                                                                        </p>
                                                                        <p className="text-[9px] text-emerald-700 font-bold mt-0.5">{fmt(palletPerCtn!)}/ctn</p>
                                                                    </div>
                                                                )}
                                                                {truckTotal !== null && (
                                                                    <div className="bg-white/60 rounded-xl p-2.5 text-center border border-white">
                                                                        <p className="text-[9px] text-teal-600 font-black uppercase">Truck</p>
                                                                        <p className="text-[15px] font-black text-teal-800">{fmt(truckTotal)}</p>
                                                                        <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                                                                            {fmt(pp)} × {pc} × {cp} × {pt} × {markups.container}
                                                                        </p>
                                                                        <p className="text-[9px] text-emerald-700 font-bold mt-0.5">{fmt(truckPerCtn!)}/ctn</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* ── Product Details ─────────────────── */}
                                            <div className="space-y-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Details</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {[
                                                        { label: 'Origin (Country)',  key: 'origin',     placeholder: 'e.g. Germany' },
                                                        { label: 'BBD (Best Before)', key: 'shelfLife',  placeholder: 'e.g. 20260731' },
                                                        { label: 'Weight',            key: 'weight',     placeholder: 'e.g. 700g' },
                                                        { label: 'Brand',             key: 'brand',      placeholder: 'e.g. Nestlé' },
                                                    ].map(({ label, key, placeholder }) => (
                                                        <div key={key} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-1">{label}</p>
                                                            {isEditing ? (
                                                                <input
                                                                    type="text"
                                                                    className="w-full h-8 text-sm font-bold outline-none border-b border-teal-100 bg-transparent"
                                                                    value={(editData as any)[key] || ''}
                                                                    onChange={(e) => setEditData({...editData, [key]: e.target.value})}
                                                                    placeholder={placeholder}
                                                                />
                                                            ) : (
                                                                <p className="text-sm font-bold text-slate-900">{(selectedProduct as any)[key] || '—'}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* Description */}
                                                <div className="p-4 border border-slate-100 rounded-2xl bg-slate-50/30">
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase mb-2">Product Description</p>
                                                    {isEditing ? (
                                                        <textarea
                                                            rows={4}
                                                            className="w-full px-0 text-[13px] font-medium outline-none border-b border-teal-100 bg-transparent resize-none"
                                                            value={editData.description || ''}
                                                            onChange={(e) => setEditData({...editData, description: e.target.value})}
                                                        />
                                                    ) : (
                                                        <p className="text-[12px] text-slate-700 leading-relaxed">{selectedProduct.description || '—'}</p>
                                                    )}
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
                                            <button
                                                onClick={() => {
                                                    if (selectedProduct?.supplier?.id) {
                                                        router.push(`/admin/suppliers?id=${selectedProduct.supplier.id}`);
                                                    } else {
                                                        toast.error('Supplier info not available for this product');
                                                    }
                                                }}
                                                disabled={!selectedProduct?.supplier?.id}
                                                className="w-full h-12 bg-slate-100 text-slate-900 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
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
                                    ) : showDeleteConfirm ? (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="space-y-4 p-4 bg-red-50 border border-red-200 rounded-2xl"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                                    <Trash2 size={18} className="text-red-600" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[14px] font-bold text-red-900 mb-1">Delete this product permanently?</p>
                                                    <p className="text-[12px] text-red-700 leading-relaxed">
                                                        "<strong>{selectedProduct.name}</strong>" ({selectedProduct.status}) will be removed from the system. This action cannot be undone.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    onClick={() => setShowDeleteConfirm(false)}
                                                    disabled={isDeleting}
                                                    className="h-11 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(selectedProduct.id)}
                                                    disabled={isDeleting}
                                                    className="h-11 bg-red-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
                                                >
                                                    {isDeleting ? 'Deleting…' : <><Trash2 size={13} /> Yes, Delete</>}
                                                </button>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className={`grid gap-3 ${selectedProduct.status === 'PENDING' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                                                {/* Edit — always visible */}
                                                <button
                                                    onClick={() => startEditing(selectedProduct)}
                                                    className="h-12 bg-white border border-slate-200 text-slate-700 rounded-xl text-[13px] font-semibold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Pencil size={14} /> Edit Product Details
                                                </button>
                                                {/* Reject — hide if already rejected */}
                                                {selectedProduct.status !== 'REJECTED' && (
                                                    <button
                                                        onClick={() => setShowRejectInput(true)}
                                                        className="h-12 bg-white border border-red-200 text-red-600 rounded-xl text-[13px] font-semibold hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <XCircle size={14} /> Reject
                                                    </button>
                                                )}
                                                {/* Approve — hide if already approved */}
                                                {selectedProduct.status !== 'APPROVED' && (
                                                    <button
                                                        onClick={() => handleApprove(selectedProduct.id)}
                                                        className="h-12 bg-teal-600 text-white rounded-xl text-[13px] font-semibold shadow-lg shadow-teal-600/25 hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <CheckCircle2 size={14} /> Approve
                                                    </button>
                                                )}
                                                {/* Already approved label */}
                                                {selectedProduct.status === 'APPROVED' && (
                                                    <div className="h-12 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2">
                                                        <CheckCircle2 size={14} /> Product Approved
                                                    </div>
                                                )}
                                            </div>
                                            {/* Delete — only for PENDING / REJECTED. Approved products may have orders. */}
                                            {(selectedProduct.status === 'PENDING' || selectedProduct.status === 'REJECTED') && (
                                                <button
                                                    onClick={() => setShowDeleteConfirm(true)}
                                                    className="w-full h-10 bg-white border border-red-100 text-red-500 rounded-xl text-[12px] font-semibold hover:bg-red-50 hover:border-red-300 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Trash2 size={13} /> Delete this product
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                                                'UnitBarcode', 'BBD (BBD)', 'Units / Carton',
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

            {/* ── Add Product Side Drawer ──────────────────────────────── */}
            <AddProductDrawer
                isOpen={isAddDrawerOpen}
                onClose={() => setIsAddDrawerOpen(false)}
                onCreated={fetchData}
                role="admin"
            />

            {/* Fix Currency Modal — repair wrongly-stored prices */}
            <AnimatePresence>
                {showFixCurrency && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
                                <div>
                                    <h2 className="text-xl font-black text-slate-900">Fix Product Prices</h2>
                                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                                        Convert existing prices from a wrong source currency to EGP base. Use Preview first to verify.
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setShowFixCurrency(false); setFixPreview(null); }}
                                    className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400"
                                >
                                    <XCircle size={20} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">
                                        Prices were actually in
                                    </label>
                                    <select
                                        value={fixFromCurrency}
                                        onChange={(e) => { setFixFromCurrency(e.target.value); setFixPreview(null); }}
                                        className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-teal-500"
                                    >
                                        <option value="USD">USD — US Dollar (×48.5)</option>
                                        <option value="EUR">EUR — Euro (×52.8)</option>
                                        <option value="GBP">GBP — British Pound (×61.4)</option>
                                        <option value="AED">AED — UAE Dirham (×13.2)</option>
                                        <option value="SAR">SAR — Saudi Riyal (×12.9)</option>
                                        <option value="KWD">KWD — Kuwaiti Dinar (×158.0)</option>
                                        <option value="QAR">QAR — Qatari Riyal (×13.3)</option>
                                        <option value="TRY">TRY — Turkish Lira (×1.49)</option>
                                        <option value="INR">INR — Indian Rupee (×0.583)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">
                                        Limit to supplier (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={fixSupplierId}
                                        onChange={(e) => { setFixSupplierId(e.target.value); setFixPreview(null); }}
                                        placeholder="Leave empty to apply to ALL products"
                                        className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-500"
                                    />
                                </div>

                                {fixPreview && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                                        <p className="text-xs font-black text-amber-900">
                                            Preview: {fixPreview.count} products will be multiplied by ×{fixPreview.multiplier}
                                        </p>
                                        <div className="space-y-1.5">
                                            {fixPreview.sample?.map((p: any) => (
                                                <div key={p.id} className="text-[11px] flex justify-between gap-2 bg-white/50 rounded-lg px-2 py-1">
                                                    <span className="truncate font-medium text-slate-700">{p.name}</span>
                                                    <span className="font-bold text-slate-900 shrink-0">
                                                        {p.currentBasePrice?.toFixed(2)} → {p.newBasePrice?.toFixed(2)} EGP
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-[11px] text-red-700">
                                    <strong>⚠ Warning:</strong> This is a one-way operation. If you run it twice with EUR, prices will be multiplied by 52.8² = 2787× — too much. Always preview first and only run once per source currency.
                                </div>
                            </div>

                            <div className="p-4 border-t border-slate-100 flex gap-3">
                                <button
                                    onClick={() => runFixCurrency(true)}
                                    disabled={isFixing}
                                    className="flex-1 h-12 bg-slate-100 text-slate-900 rounded-2xl text-sm font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
                                >
                                    {isFixing ? '...' : 'Preview'}
                                </button>
                                <button
                                    onClick={() => {
                                        if (!fixPreview) {
                                            toast.error('Run Preview first to verify');
                                            return;
                                        }
                                        if (!confirm(`Multiply prices of ${fixPreview.count} products by ×${fixPreview.multiplier}? This cannot be undone.`)) return;
                                        runFixCurrency(false);
                                    }}
                                    disabled={isFixing || !fixPreview}
                                    className="flex-1 h-12 bg-teal-600 text-white rounded-2xl text-sm font-black hover:bg-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={16} /> {isFixing ? 'Converting...' : 'Apply Fix'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
