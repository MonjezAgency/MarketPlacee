'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth';
import {
    Plus,
    Search,
    Filter,
    Box,
    Tag,
    DollarSign,
    Archive,
    Edit2,
    Trash2,
    ExternalLink,
    Camera,
    CheckCircle2,
    X,
    UploadCloud,
    FileSpreadsheet,
    ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CATEGORIES_LIST } from '@/lib/products';
import { fetchMyProducts, apiFetch, apiUrl } from '@/lib/api';
import { Product, ProductStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { getActiveCurrency } from '@/lib/currency';
import AddProductDrawer from '@/components/product/AddProductDrawer';
import BulkUploadSchemaPreview from '@/components/products/BulkUploadSchemaPreview';

export default function SupplierProductsPage() {
    const { t, locale } = useLanguage();
    const { user } = useAuth();
    const [products, setProducts] = React.useState<Product[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState('All');
    const [currentPage, setCurrentPage] = React.useState(1);
    const [isAddDrawerOpen, setIsAddDrawerOpen] = React.useState(false);
    // Status filter — All | APPROVED | PENDING | NEEDS_CHANGES | REJECTED
    // Drives the filter chip row above the table; "All" is the default
    // landing view so a new supplier sees every listing they have.
    const [statusFilter, setStatusFilter] = React.useState<'All' | 'APPROVED' | 'PENDING' | 'NEEDS_CHANGES' | 'REJECTED'>('All');

    const [isBulkModalOpen, setIsBulkModalOpen] = React.useState(false);
    const [bulkFiles, setBulkFiles] = React.useState<File[]>([]);
    const [bulkCurrency, setBulkCurrency] = React.useState(() => getActiveCurrency());

    // Stay in sync with the supplier's settings — they don't pick the
    // currency manually anymore.
    React.useEffect(() => {
        const sync = () => setBulkCurrency(getActiveCurrency());
        window.addEventListener('currency-changed', sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener('currency-changed', sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [bulkResults, setBulkResults] = React.useState<any>(null);

    const [selectedProducts, setSelectedProducts] = React.useState<Set<string>>(new Set());
    const [isDeletingBulk, setIsDeletingBulk] = React.useState(false);
    const router = useRouter();
    const [kycStatus, setKycStatus] = React.useState<string>('UNVERIFIED');
    /**
     * KYC enforcement is currently DISABLED on the platform — operator
     * decision to let suppliers list products immediately without an
     * identity-verification gate. To re-enable later, change this back
     * to:  const kycBlocked = kycStatus !== 'VERIFIED';
     * Everything else (KYC pages, AI verification, admin KYC review
     * tab, revoke / resync endpoints) stays in place — only the
     * BLOCKING is suppressed.
     */
    const kycBlocked = false;

    React.useEffect(() => {
        loadProducts();
        // Fetch KYC status via apiFetch (httpOnly cookie handles auth)
        apiFetch('/kyc/status')
            .then(r => r.json())
            .then(d => setKycStatus(d.kycStatus || 'UNVERIFIED'))
            .catch(() => {});
    }, []);

    const loadProducts = async () => {
        try {
            const data = await fetchMyProducts();
            setProducts(data as Product[]);
        } catch (error) {
            console.error('Failed to fetch products:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (bulkFiles.length === 0) return;

        setIsSubmitting(true);
        let accumulatedResults = {
            totalRows: 0,
            successCount: 0,
            errorCount: 0,
            createdCount: 0,
            results: [] as any[]
        };

        try {
            for (const file of bulkFiles) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('currency', bulkCurrency);

                const res = await apiFetch('/products/bulk-upload', {
                    method: 'POST',
                    body: formData,
                });

                if (!res.ok) {
                    let errMsg = 'Upload failed';
                    try {
                        const data = await res.json();
                        errMsg = data.message || errMsg;
                    } catch (_e) {
                        const text = await res.text().catch(() => '');
                        errMsg = text || `Server error (${res.status})`;
                    }
                    throw new Error(`Failed on file ${file.name}: ${errMsg}`);
                }

                const report = await res.json();
                accumulatedResults.totalRows += report.totalRows || 0;
                accumulatedResults.successCount += report.successCount || 0;
                accumulatedResults.errorCount += report.errorCount || 0;
                accumulatedResults.createdCount += report.createdCount || 0;
                
                const fileResults = (report.results || []).map((r: any) => ({
                    ...r,
                    file: file.name
                }));
                accumulatedResults.results.push(...fileResults);
            }

            setBulkResults(accumulatedResults);
            
            // Only refresh if something was actually created
            if (accumulatedResults.createdCount > 0) {
                loadProducts();
            }
        } catch (err: any) {
            console.error('Bulk upload error:', err);
            alert(`${t('supplier', 'uploadFailed')}: ${err.message || 'Unknown error. Check connection.'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedProducts.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedProducts.size} product(s)?`)) return;

        setIsDeletingBulk(true);
        try {
            const res = await apiFetch('/products/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ ids: Array.from(selectedProducts) }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || 'Failed to delete products');
            }

            setSelectedProducts(new Set());
            loadProducts();
        } catch (err: any) {
            console.error('Bulk delete error:', err);
            alert(`Delete failed: ${err.message}`);
        } finally {
            setIsDeletingBulk(false);
        }
    };

    const handleDeleteProduct = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
        try {
            const res = await apiFetch(`/products/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete product');
            loadProducts();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    // handleQuickBoost was removed — the operator decided the per-row
    // ⚡ Boost button next to Edit/Delete created friction (a confirm
    // popup asking "$300?" on every accidental click). Suppliers who
    // want to promote a product now go through /supplier/placements
    // explicitly, where they pick tier + duration deliberately.

    // Edit is now a dedicated route at /supplier/products/[id]/edit —
    // saves happen inside ProductEditorForm, the table just navigates.
    // Create is still handled by AddProductDrawer below.

    // Count how many products sit in each status bucket so the
    // filter chips can show a live "{N}" badge next to the label.
    // Computed off the full list (NOT the filtered list) so the
    // counts stay stable regardless of search / category.
    const statusCounts = React.useMemo(() => {
        const counts = { All: products.length, APPROVED: 0, PENDING: 0, NEEDS_CHANGES: 0, REJECTED: 0 };
        for (const p of products) {
            const s = String(p.status || '').toUpperCase();
            if (s === 'APPROVED') counts.APPROVED++;
            else if (s === 'PENDING') counts.PENDING++;
            else if (s === 'NEEDS_CHANGES') counts.NEEDS_CHANGES++;
            else if (s === 'REJECTED') counts.REJECTED++;
        }
        return counts;
    }, [products]);

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.ean || '').includes(searchTerm);
        const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
        const status = String(p.status || '').toUpperCase();
        const matchesStatus = statusFilter === 'All' || status === statusFilter;
        return matchesSearch && matchesCategory && matchesStatus;
    });

    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
    const paginatedProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const getStatusColor = (status: string | undefined) => {
        switch ((status || '').toUpperCase()) {
            case 'ACTIVE':
            case 'APPROVED':       return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            case 'PENDING':        return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
            case 'REJECTED':       return 'text-destructive bg-destructive/10 border-destructive/20';
            case 'NEEDS_CHANGES':  return 'text-orange-600 bg-orange-50 border-orange-200';
            default: return 'text-muted-foreground bg-muted/10 border-border/50';
        }
    };

    /**
     * Supplier sees admin's comment on a NEEDS_CHANGES row, opens
     * a popup to read the message, fixes the product (or not), and
     * clicks "Resend for Review" to push it back to admin. The
     * popup also surfaces the missing-fields list when the row
     * still doesn't pass the required-fields gate.
     */
    const [openComment, setOpenComment] = React.useState<{ id: string; message: string; name: string } | null>(null);
    const [isResending, setIsResending] = React.useState(false);

    const handleResend = async (id: string) => {
        setIsResending(true);
        const tid = (await import('react-hot-toast')).toast.loading('Resending for review…');
        try {
            const res = await apiFetch(`/products/${id}/resend`, { method: 'PATCH' });
            const data = await res.json().catch(() => ({}));
            const { toast } = await import('react-hot-toast');
            if (res.ok) {
                toast.success('Resent — Atlantis will review it shortly.', { id: tid });
                setOpenComment(null);
                loadProducts();
            } else {
                toast.error(data?.message || 'Resend failed', { id: tid, duration: 8000 });
            }
        } catch {
            const { toast } = await import('react-hot-toast');
            toast.error('Network error', { id: tid });
        } finally {
            setIsResending(false);
        }
    };

    const toggleProductSelection = (id: string) => {
        const newSelected = new Set(selectedProducts);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedProducts(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedProducts.size === filteredProducts.length) {
            setSelectedProducts(new Set());
        } else {
            setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
        }
    };

    return (
        <div className="space-y-8 p-6 lg:p-10 max-w-7xl mx-auto">
            {/* KYC Enforcement Banner — high-contrast in BOTH themes.
                Previously the light-only amber-50 background sat on top
                of the dark-theme dashboard and produced a washed-out,
                barely-readable strip. The dark variant now uses a
                semi-transparent amber tile with a glowing border so it
                pops on the navy background. */}
            {kycBlocked && (
                <div className="flex items-start gap-4 p-5 bg-amber-50 dark:bg-amber-500/10 border-2 border-amber-300 dark:border-amber-500/40 rounded-2xl shadow-sm dark:shadow-amber-500/5">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-black text-amber-900 dark:text-amber-200 text-[15px] leading-tight">
                            {kycStatus === 'PENDING' ? (locale === 'ar' ? 'KYC قيد المراجعة ⏳' : 'KYC Under Review ⏳') : (locale === 'ar' ? 'مطلوب التحقق من الهوية 🔐' : 'Identity Verification Required 🔐')}
                        </p>
                        <p className="text-[13px] text-amber-800 dark:text-amber-300/90 mt-1 leading-relaxed">
                            {kycStatus === 'PENDING'
                                ? (locale === 'ar' ? 'يتم مراجعة مستنداتك. ستتمكن من إضافة المنتجات بمجرد التحقق من هويتك.' : 'Your documents are being reviewed. You can add products once your identity is verified.')
                                : (locale === 'ar' ? 'يجب إكمال KYC (التحقق من الهوية) قبل إدراج المنتجات على المنصة.' : 'You must complete KYC (identity verification) before listing products on the platform.')}
                        </p>
                    </div>
                    {kycStatus !== 'PENDING' && (
                        <button
                            onClick={() => router.push('/dashboard/kyc')}
                            className="shrink-0 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 dark:bg-amber-400 dark:hover:bg-amber-300 dark:text-amber-950 text-white text-[13px] font-black uppercase tracking-wider rounded-xl transition-colors shadow-lg shadow-amber-500/30"
                        >
                            {locale === 'ar' ? 'تحقق الآن' : 'Verify Now'}
                        </button>
                    )}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
                        {t('supplier', 'allProducts')} <Box className="text-primary w-8 h-8" />
                    </h1>
                    <p className="text-muted-foreground font-medium mt-1">{t('supplier', 'performanceMetrics')}</p>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {selectedProducts.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={isDeletingBulk}
                            className="h-12 px-6 rounded-xl font-black bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all flex items-center gap-2"
                        >
                            <Trash2 size={18} />
                            {isDeletingBulk ? (locale === 'ar' ? 'جاري الحذف...' : 'Deleting...') : (locale === 'ar' ? `حذف المحدد (${selectedProducts.size})` : `Delete Selected (${selectedProducts.size})`)}
                        </button>
                    )}
                    <button
                        onClick={() => setIsBulkModalOpen(true)}
                        disabled={kycBlocked}
                        className="h-12 px-6 rounded-xl font-black border border-border/50 hover:bg-muted/50 flex items-center gap-2 text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <UploadCloud size={18} /> {t('supplier', 'bulkUploadTitle')}
                    </button>
                    <button
                        disabled={kycBlocked}
                        onClick={() => setIsAddDrawerOpen(true)}
                        className="h-12 px-8 bg-primary text-primary-foreground rounded-xl font-black flex items-center gap-2 hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        <Plus size={20} /> {locale === 'ar' ? 'إضافة جديد' : 'Add New'}
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: t('admin', 'totalProducts'), value: products.length, icon: Archive, color: 'text-primary' },
                    { label: t('common', 'active'), value: products.filter(p => p.status === ProductStatus.APPROVED || p.status === 'APPROVED').length, icon: CheckCircle2, color: 'text-emerald-500' },
                    { label: t('common', 'pending'), value: products.filter(p => p.status === ProductStatus.PENDING || p.status === 'PENDING').length, icon: Box, color: 'text-amber-500' },
                    { label: t('admin', 'categories'), value: new Set(products.map(p => p.category).filter(Boolean)).size, icon: Tag, color: 'text-blue-500' },
                ].map((stat, idx) => (
                    <div key={idx} className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <stat.icon className={cn("w-5 h-5", stat.color)} />
                            <span className={cn("text-2xl font-black text-foreground")}>{stat.value}</span>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-2">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4 items-center">
                <button
                    onClick={handleSelectAll}
                    style={{ whiteSpace: 'nowrap' }}
                    className="h-14 px-6 rounded-2xl border border-border/50 text-foreground font-bold flex flex-shrink-0 items-center gap-3 hover:bg-muted/50 transition-colors"
                >
                    <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        selectedProducts.size === filteredProducts.length && filteredProducts.length > 0 
                            ? "bg-primary border-primary text-primary-foreground" 
                            : "border-muted-foreground/30"
                    )}>
                        {selectedProducts.size === filteredProducts.length && filteredProducts.length > 0 && <CheckCircle2 size={14} />}
                    </div>
                    Select All
                </button>
                <div className="flex-1 relative w-full">
                    <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <input
                        type="text"
                        placeholder="Search by name, EAN, or description..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="w-full h-14 bg-card border border-border/50 rounded-2xl ps-12 pe-4 text-foreground outline-none focus:border-primary/50 transition-all font-medium"
                    />
                </div>
                <div className="flex gap-2 min-w-max">
                    <select
                        value={selectedCategory}
                        onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                        className="h-14 px-6 bg-card border border-border/50 rounded-2xl text-foreground font-bold outline-none cursor-pointer appearance-none min-w-[160px]"
                    >
                        <option value="All">All Categories</option>
                        {CATEGORIES_LIST.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── Status filter chips ──
                Operator request: quick way to slice the table by
                listing status. Five chips:
                  • All              — default landing view
                  • Approved         — emerald, live on Atlantis
                  • Pending          — amber, waiting for review
                  • Has Comment      — orange, NEEDS_CHANGES (admin
                                       sent feedback; supplier acts on it)
                  • Rejected         — red, admin rejected the listing
                Each chip shows the live count of matching rows so
                the supplier sees the breakdown without opening each
                filter. Counts are computed off the FULL list so they
                don't change when search/category narrows the view. */}
            <div className="flex flex-wrap items-center gap-2">
                {([
                    { key: 'All',           label: 'All',           color: 'slate' },
                    { key: 'APPROVED',      label: 'Approved',      color: 'emerald' },
                    { key: 'PENDING',       label: 'Pending review', color: 'amber' },
                    { key: 'NEEDS_CHANGES', label: 'Has comment',   color: 'orange' },
                    { key: 'REJECTED',      label: 'Rejected',      color: 'red' },
                ] as const).map((tab) => {
                    const active = statusFilter === tab.key;
                    const count = statusCounts[tab.key];
                    // Tailwind safelist hint — colour classes must be
                    // literal so the JIT compiler keeps them. We map
                    // each colour name to its three flavours below.
                    const palette: Record<string, { activeBg: string; activeText: string; idleText: string; idleHover: string; badge: string }> = {
                        slate:   { activeBg: 'bg-slate-900 text-white',    activeText: '',  idleText: 'text-slate-600 hover:text-slate-900', idleHover: 'hover:bg-slate-100', badge: 'bg-slate-200 text-slate-700' },
                        emerald: { activeBg: 'bg-emerald-600 text-white',  activeText: '',  idleText: 'text-emerald-700 hover:text-emerald-900', idleHover: 'hover:bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' },
                        amber:   { activeBg: 'bg-amber-500 text-white',    activeText: '',  idleText: 'text-amber-700 hover:text-amber-900', idleHover: 'hover:bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
                        orange:  { activeBg: 'bg-orange-500 text-white',   activeText: '',  idleText: 'text-orange-700 hover:text-orange-900', idleHover: 'hover:bg-orange-50', badge: 'bg-orange-100 text-orange-700' },
                        red:     { activeBg: 'bg-rose-600 text-white',     activeText: '',  idleText: 'text-rose-700 hover:text-rose-900', idleHover: 'hover:bg-rose-50', badge: 'bg-rose-100 text-rose-700' },
                    };
                    const p = palette[tab.color];
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => { setStatusFilter(tab.key as any); setCurrentPage(1); }}
                            className={cn(
                                'h-10 px-4 rounded-full inline-flex items-center gap-2 text-[12px] font-bold tracking-wide border transition-all',
                                active
                                    ? `${p.activeBg} border-transparent shadow-sm`
                                    : `bg-white border-border/50 ${p.idleText} ${p.idleHover}`,
                            )}
                            aria-pressed={active}
                        >
                            <span>{tab.label}</span>
                            <span
                                className={cn(
                                    'inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-black',
                                    active ? 'bg-white/20 text-white' : p.badge,
                                )}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Products List (Table on Desktop, Cards on Mobile) */}
            {isLoading ? (
                <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-20 bg-card rounded-2xl border border-border/50 animate-pulse" />
                    ))}
                </div>
            ) : filteredProducts.length > 0 ? (
                <div className="space-y-6">
                    {/* Desktop Table View */}
                    <div className="hidden md:block bg-card border border-border/50 rounded-[32px] overflow-hidden shadow-sm">
                        <div className="overflow-x-auto scrollbar-hide">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-muted/30 border-b border-border/50">
                                    <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                                        <th className="px-8 py-6 w-12 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                                                onChange={handleSelectAll}
                                                className="w-5 h-5 rounded border-muted-foreground/30 text-primary focus:ring-primary/20"
                                            />
                                        </th>
                                        <th className="px-6 py-6">{locale === 'ar' ? 'المنتج' : 'Product'}</th>
                                        <th className="px-6 py-6">{locale === 'ar' ? 'التصنيف' : 'Category'}</th>
                                        <th className="px-6 py-6">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                                        <th className="px-6 py-6">{locale === 'ar' ? 'السعر' : 'Price'}</th>
                                        <th className="px-6 py-6">{locale === 'ar' ? 'المخزون' : 'Stock'}</th>
                                        <th className="px-8 py-6 text-end">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                    <AnimatePresence mode="popLayout">
                                        {paginatedProducts.map((product) => (
                                            <motion.tr
                                                key={product.id}
                                                layout
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className={cn(
                                                    "group hover:bg-muted/20 transition-all cursor-default",
                                                    selectedProducts.has(product.id) && "bg-primary/[0.03]"
                                                )}
                                            >
                                                <td className="px-8 py-5 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedProducts.has(product.id)}
                                                        onChange={() => toggleProductSelection(product.id)}
                                                        className="w-5 h-5 rounded border-muted-foreground/30 text-primary focus:ring-primary/20 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-muted border border-border/50 overflow-hidden flex-shrink-0 flex items-center justify-center p-1">
                                                            {product.images?.[0] ? (
                                                                <img
                                                                    src={product.images[0]}
                                                                    alt={product.name}
                                                                    onError={(e) => {
                                                                        // Hide on load failure so the URL
                                                                        // text doesn't leak as an alt label.
                                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                                    }}
                                                                    className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
                                                                />
                                                            ) : (
                                                                <Camera size={18} className="text-muted-foreground/30" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-black text-foreground text-sm line-clamp-1">{product.name}</p>
                                                            <p className="text-[10px] font-medium text-muted-foreground mt-0.5 truncate max-w-[150px]">ID: {product.id.slice(0,8)}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">{product.category}</span>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col gap-1.5">
                                                        {(() => {
                                                            const statusUpper = String(product.status).toUpperCase();
                                                            const isNeedsChanges = statusUpper === 'NEEDS_CHANGES';
                                                            const isRejected = statusUpper === 'REJECTED';
                                                            // Either status carries a written admin reason
                                                            // on adminNotes. We make the badge clickable on
                                                            // both, with role-aware fallback copy.
                                                            const isClickable = isNeedsChanges || isRejected;
                                                            const note = (product as any).adminNotes || '';
                                                            const openMine = () =>
                                                                setOpenComment({
                                                                    id: product.id,
                                                                    message: note || (isRejected
                                                                        ? 'This listing was rejected. The admin didn\'t leave a specific reason — please create a fresh listing avoiding the gaps you noticed on review.'
                                                                        : 'The admin marked this product as needing changes but didn\'t leave a written note. Please review the product page and resubmit if you\'re happy with the data.'),
                                                                    name: product.name,
                                                                });
                                                            const badgeClasses = cn(
                                                                'inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[10px] font-black w-fit',
                                                                getStatusColor(product.status),
                                                                isClickable && 'cursor-pointer hover:opacity-80 transition-opacity',
                                                            );
                                                            return isClickable ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); openMine(); }}
                                                                    title={isRejected ? 'Click to read the rejection reason' : 'Click to read the admin\'s comment'}
                                                                    className={badgeClasses}
                                                                >
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                                                    {product.status?.toUpperCase() || 'UNKNOWN'}
                                                                </button>
                                                            ) : (
                                                                <div className={badgeClasses}>
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                                                    {product.status?.toUpperCase() || 'UNKNOWN'}
                                                                </div>
                                                            );
                                                        })()}
                                                        {/* "💬 View comment" pill — only shows on
                                                            NEEDS_CHANGES rows. Same handler as the badge
                                                            above; we keep both because the badge is
                                                            visually paired with the status colour and
                                                            the pill makes the action explicit. Even
                                                            when the admin didn't leave a written note,
                                                            the pill still appears so the supplier can
                                                            open the modal and see a helpful fallback
                                                            instead of "needs change" with zero context. */}
                                                        {String(product.status).toUpperCase() === 'NEEDS_CHANGES' && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenComment({
                                                                        id: product.id,
                                                                        message: (product as any).adminNotes
                                                                            || 'The admin marked this product as needing changes but didn\'t leave a written note. Please review the product page and resubmit if you\'re happy with the data.',
                                                                        name: product.name,
                                                                    });
                                                                }}
                                                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 text-[10px] font-black w-fit"
                                                            >
                                                                💬 View comment
                                                            </button>
                                                        )}
                                                        {String(product.status).toUpperCase() === 'REJECTED' && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenComment({
                                                                        id: product.id,
                                                                        message: (product as any).adminNotes
                                                                            || 'This listing was rejected. The admin didn\'t leave a specific reason — please create a fresh listing avoiding the gaps you noticed on review.',
                                                                        name: product.name,
                                                                    });
                                                                }}
                                                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-black w-fit"
                                                            >
                                                                💬 View reason
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <p className="text-sm font-black text-foreground">€{(product.basePrice ?? product.price).toFixed(2)}</p>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="space-y-1">
                                                        <p className={cn("text-sm font-black", (product.stock ?? 0) < 10 ? "text-destructive" : "text-foreground")}>
                                                            {product.stock ?? 0}
                                                        </p>
                                                        <p className="text-[9px] font-bold text-muted-foreground uppercase">{product.unit || 'pcs'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-end">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => { router.push(`/supplier/products/${product.id}/edit`); }}
                                                            className="w-9 h-9 rounded-lg bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all flex items-center justify-center"
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteProduct(product.id, product.name)}
                                                            className="w-9 h-9 rounded-lg bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all flex items-center justify-center"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="grid grid-cols-1 gap-4 md:hidden">
                        <AnimatePresence mode="popLayout">
                            {paginatedProducts.map((product) => (
                                <motion.div
                                    key={product.id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className={cn(
                                        "bg-card border border-border/50 rounded-2xl p-4 flex gap-4 relative",
                                        selectedProducts.has(product.id) && "ring-2 ring-primary border-primary"
                                    )}
                                >
                                    <div className="w-20 h-20 rounded-xl bg-muted border border-border/50 overflow-hidden flex-shrink-0 flex items-center justify-center p-2">
                                        {product.images?.[0] ? (
                                            <img
                                                src={product.images[0]}
                                                alt={product.name}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                                className="w-full h-full object-contain"
                                            />
                                        ) : (
                                            <Camera size={24} className="text-muted-foreground/20" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                        <div>
                                            <div className="flex items-start justify-between gap-2">
                                                <h3 className="font-black text-foreground text-sm line-clamp-1">{product.name}</h3>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedProducts.has(product.id)}
                                                    onChange={() => toggleProductSelection(product.id)}
                                                    className="w-5 h-5 rounded border-muted-foreground/30 text-primary focus:ring-primary/20"
                                                />
                                            </div>
                                            <p className="text-[10px] font-bold text-primary/70 uppercase tracking-widest mt-0.5">{product.category}</p>
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                            <p className="font-black text-foreground">€{(product.basePrice ?? product.price).toFixed(2)}</p>
                                            <div className={cn(
                                                "h-6 px-2.5 rounded-full border text-[9px] font-black flex items-center gap-1",
                                                getStatusColor(product.status)
                                            )}>
                                                {product.status?.toUpperCase()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="absolute bottom-4 end-4 flex gap-2">
                                        <button onClick={() => { router.push(`/supplier/products/${product.id}/edit`); }} className="p-2 text-muted-foreground hover:text-primary"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteProduct(product.id, product.name)} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-4 py-4">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                className="h-10 px-4 rounded-xl border border-border/50 bg-card hover:bg-muted font-bold text-sm disabled:opacity-50 transition-all"
                            >
                                Previous
                            </button>
                            <span className="text-sm font-bold text-muted-foreground">
                                Page <span className="text-foreground">{currentPage}</span> of {totalPages}
                            </span>
                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                className="h-10 px-4 rounded-xl border border-border/50 bg-card hover:bg-muted font-bold text-sm disabled:opacity-50 transition-all"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-card rounded-[48px] border border-border/50 border-dashed">
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                        <Box size={32} className="text-muted-foreground" />
                    </div>
                    <h3 className="text-2xl font-black text-foreground">No products found</h3>
                    <p className="text-muted-foreground font-medium mt-2">Try adjusting your filters or add a new product.</p>
                    <button
                        onClick={() => setIsAddDrawerOpen(true)}
                        className="mt-8 h-12 px-8 bg-primary text-primary-foreground rounded-full font-black flex items-center gap-2 hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
                    >
                        <Plus size={20} /> List First Product
                    </button>
                </div>
            )}

            {/* Editing happens at /supplier/products/[id]/edit — no modal here. */}

            {/* Add Product Side Drawer — for creating NEW products */}
            <AddProductDrawer
                isOpen={isAddDrawerOpen}
                onClose={() => setIsAddDrawerOpen(false)}
                onCreated={loadProducts}
                role="supplier"
            />

            {/* Bulk Upload Modal */}
            {typeof window !== 'undefined' && createPortal(
                <AnimatePresence>
                    {isBulkModalOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 w-screen h-screen overflow-hidden"
                        >
                            <motion.form
                                onSubmit={handleBulkUpload}
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                /* max-h + flex-col + the inner content
                                   gets the scroll, footer stays pinned —
                                   fixes the "where's the upload button"
                                   problem the operator reported when the
                                   instruction list pushed the form
                                   beyond the viewport. */
                                className="bg-card w-full max-w-2xl max-h-[90vh] rounded-[40px] border border-border/50 overflow-hidden shadow-2xl flex flex-col"
                            >
                                <div className="p-8 border-b border-border/50 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-2xl font-black text-foreground tracking-tight">{t('supplier', 'bulkUploadTitle')}</h2>
                                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">{t('supplier', 'uploadViaExcel')}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                // Full column set the importer understands. The
                                                // first row is the header so the supplier can fill
                                                // their own values directly underneath.
                                                const headers = 'name,brand,description,category,price,stock,EXW,ean,weight,origin,shelfLife,minOrder,unitsPerCase,casesPerPallet,unitsPerPallet,palletsPerShipment';
                                                const blob = new Blob([headers + '\n'], { type: 'text/csv;charset=utf-8' });
                                                const url = window.URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = 'atlantis_upload_template.csv';
                                                a.click();
                                            }}
                                            className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                                        >
                                            {t('supplier', 'downloadTemplate')}
                                        </button>
                                        <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkResults(null); setBulkFiles([]); }} className="w-10 h-10 bg-muted/50 hover:bg-muted rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-8 space-y-6 overflow-y-auto flex-1">
                                    {/* Operator-requested: visual schema map so the
                                        supplier sees what columns are required vs
                                        optional BEFORE picking a file. Collapsed by
                                        default — clicking expands the mini-sheet. */}
                                    {!bulkResults && <BulkUploadSchemaPreview />}

                                    {!bulkResults ? (
                                        <div className="border-2 border-dashed border-border/50 rounded-3xl p-12 flex flex-col items-center justify-center text-center relative group hover:border-primary/50 hover:bg-primary/5 transition-all">
                                            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                                <FileSpreadsheet size={32} className="text-primary" />
                                            </div>
                                            <h3 className="text-xl font-black text-foreground mb-2">{t('supplier', 'dropSpreadsheet')}</h3>
                                            <p className="text-muted-foreground">{t('supplier', 'supportsXlsxCsv')}</p>

                                            <div className="mt-6 text-start bg-muted/30 p-4 rounded-xl border border-border/50 max-w-md w-full relative z-20 pointer-events-auto">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-foreground mb-2 flex items-center gap-2">
                                                    <CheckCircle2 size={14} className="text-primary" /> What columns the sheet should have
                                                </h4>
                                                <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ps-4 font-medium">
                                                    <li><strong className="text-foreground">Required:</strong> Name · Description · Category · Price · Stock · <strong className="text-foreground">EXW</strong> (origin warehouse / country)</li>
                                                    <li><strong className="text-foreground">Recommended:</strong> EAN · Brand · Weight · Country of Origin · BBD · Units per case · Cases per pallet · Pallets per truck · MOQ</li>
                                                    <li>The EAN column auto-fetches the product image from EAN-DB if a barcode is provided.</li>
                                                    <li>Brand and weight are auto-extracted from the product name when not provided as their own column.</li>
                                                    <li>Rows missing EXW are rejected — Atlantis logistics needs the origin to quote transport.</li>
                                                    <li>No default / placeholder images (e.g. generic Coca-Cola PNG) will be used — only real product photos.</li>
                                                </ul>
                                            </div>

                                            {/* Currency is taken from the supplier's profile/settings —
                                                shown here so they can confirm before uploading. To change
                                                it, they update their settings. */}
                                            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border/50 relative z-20 pointer-events-auto">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                                                    {locale === 'ar' ? 'عملة الأسعار في الملف' : 'Prices in file are in'}
                                                </span>
                                                <span className="text-base font-black text-foreground">{bulkCurrency}</span>
                                                <span className="text-[10px] text-muted-foreground ms-auto">
                                                    {locale === 'ar' ? 'غيّرها من الإعدادات' : 'Change in Settings'}
                                                </span>
                                            </div>

                                            <input
                                                type="file"
                                                accept=".xlsx, .csv"
                                                multiple
                                                onChange={(e) => setBulkFiles(Array.from(e.target.files || []))}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />

                                            {bulkFiles.length > 0 && (
                                                <div className="mt-6 p-4 bg-muted/50 rounded-xl border border-border/50 flex flex-col gap-2 relative z-10 w-full justify-center">
                                                    <div className="flex items-center gap-3 justify-center text-emerald-500 font-bold">
                                                        <CheckCircle2 size={20} />
                                                        <span>{bulkFiles.length} file(s) selected</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 mt-2 max-h-[100px] overflow-y-auto w-full">
                                                        {bulkFiles.map((file, i) => (
                                                            <span key={i} className="px-2 py-1 bg-background rounded-md text-[10px] text-muted-foreground border border-border/50 truncate max-w-[200px]">
                                                                {file.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            <div className={cn(
                                                "p-6 rounded-2xl flex flex-col items-center justify-center text-center border",
                                                bulkResults.createdCount > 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"
                                            )}>
                                                {bulkResults.createdCount > 0 ? (
                                                    <CheckCircle2 className="text-emerald-500 mb-2" size={32} />
                                                ) : (
                                                    <ShieldAlert className="text-red-500 mb-2" size={32} />
                                                )}
                                                <h3 className="text-xl font-black text-foreground">
                                                    {bulkResults.createdCount > 0 ? t('supplier', 'uploadSuccess') : t('supplier', 'uploadFailed')}
                                                </h3>
                                                <p className={cn("mt-1 font-bold", bulkResults.createdCount > 0 ? "text-emerald-500" : "text-red-500")}>
                                                    {bulkResults.createdCount} {t('supplier', 'productsCreated')} {bulkResults.totalRows} {t('supplier', 'row')}.
                                                </p>
                                            </div>

                                            {bulkResults.errorCount > 0 && (
                                                <div className="space-y-3">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('supplier', 'errorReport')} ({bulkResults.errorCount})</h4>
                                                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                                                        {bulkResults.results.filter((r: any) => !r.success).map((err: any, i: number) => (
                                                            <div key={i} className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-[11px]">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="font-black text-red-500">{t('supplier', 'row')} {err.rowNumber}</span>
                                                                    <span className="text-[9px] text-muted-foreground">{err.file}</span>
                                                                </div>
                                                                <p className="text-muted-foreground">{err.errors?.join(', ') || 'Validation error'}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="p-6 border-t border-border/50 flex items-center justify-end gap-3 bg-muted/10">
                                    <button
                                        type="button"
                                        onClick={() => { setIsBulkModalOpen(false); setBulkResults(null); setBulkFiles([]); }}
                                        className="px-6 h-12 rounded-xl border border-border/50 font-bold text-foreground hover:bg-muted/50 transition-colors"
                                    >
                                        {bulkResults ? 'Close' : 'Cancel'}
                                    </button>
                                    {!bulkResults && (
                                        <button
                                            type="submit"
                                            disabled={bulkFiles.length === 0 || isSubmitting}
                                            className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isSubmitting ? 'Uploading...' : <><UploadCloud size={18} /> Upload Products</>}
                                        </button>
                                    )}
                                </div>
                            </motion.form>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Admin comment popup — supplier reads the issue and
                clicks Resend for Review after fixing. The Resend
                endpoint re-runs the required-fields gate and will
                refuse if the row is still incomplete. */}
            <AnimatePresence>
                {openComment && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setOpenComment(null)}
                            className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
                        >
                            <div className="bg-amber-500 p-6 text-white">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Atlantis comment</p>
                                <h2 className="text-[18px] font-black mt-1">{openComment.name} needs changes</h2>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-[12px] text-slate-500">
                                    Atlantis reviewed your submission and asked for the following changes before approving:
                                </p>
                                <div className="border-l-4 border-amber-500 bg-amber-50 rounded-r-xl p-4 text-[14px] text-slate-800 leading-relaxed whitespace-pre-wrap">
                                    {openComment.message}
                                </div>
                                <p className="text-[12px] text-slate-500">
                                    Edit the product row below, fix the issue, then click <strong>Resend for Review</strong>.
                                </p>
                            </div>
                            <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
                                <button
                                    onClick={() => setOpenComment(null)}
                                    className="h-11 px-5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-[12px] uppercase tracking-widest"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => handleResend(openComment.id)}
                                    disabled={isResending}
                                    className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[12px] uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isResending ? '…' : '↻'} Resend for Review
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
