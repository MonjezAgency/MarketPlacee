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
import { CATEGORIES_LIST } from '@/lib/products';
import { fetchMyProducts, apiFetch, apiUrl, requestAdPlacement } from '@/lib/api';
import { Zap, Rocket } from 'lucide-react';
import { Product, ProductStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import ProductEditorModal from '@/app/dashboard/supplier/ProductEditorModal';

export default function SupplierProductsPage() {
    const { t, locale } = useLanguage();
    const { user } = useAuth();
    const [products, setProducts] = React.useState<Product[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState('All');
    const [currentPage, setCurrentPage] = React.useState(1);
    const [isEditorOpen, setIsEditorOpen] = React.useState(false);
    const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);

    const [isBulkModalOpen, setIsBulkModalOpen] = React.useState(false);
    const [bulkFiles, setBulkFiles] = React.useState<File[]>([]);
    const [bulkCurrency, setBulkCurrency] = React.useState('EGP');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [bulkResults, setBulkResults] = React.useState<any>(null);

    const [selectedProducts, setSelectedProducts] = React.useState<Set<string>>(new Set());
    const [isDeletingBulk, setIsDeletingBulk] = React.useState(false);
    const [kycStatus, setKycStatus] = React.useState<string>('UNVERIFIED');
    const kycBlocked = kycStatus !== 'VERIFIED';

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

    const handleQuickBoost = async (productId: string, productName: string) => {
        if (!confirm(`Boost "${productName}" to the Featured section for $300?`)) return;
        try {
            await requestAdPlacement({
                productId,
                type: 'FEATURED',
                durationDays: 7
            });
            alert('Boost request submitted! An admin will review it shortly.');
        } catch (err: any) {
            alert(`Failed to boost: ${err.message}`);
        }
    };

    const handleSaveProduct = async (formData: any) => {
        try {
            const endpoint = editingProduct
                ? `/products/${editingProduct.id}`
                : '/products';
            const method = editingProduct ? 'PATCH' : 'POST';

            // Map image to images for backend schema compatibility
            const payload = { ...formData };
            if (payload.image) {
                payload.images = [payload.image, ...(payload.images || [])];
                delete payload.image;
            }

            const res = await apiFetch(endpoint, {
                method,
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error.message || 'Failed to save product');
            }

            setIsEditorOpen(false);
            setEditingProduct(null);
            loadProducts();
        } catch (err: any) {
            console.error('Product save error:', err);
            alert(`Error: ${err.message}`);
        }
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.ean || '').includes(searchTerm);
        const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
    const paginatedProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const getStatusColor = (status: string | undefined) => {
        switch ((status || '').toUpperCase()) {
            case 'ACTIVE': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            case 'PENDING': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
            case 'REJECTED': return 'text-destructive bg-destructive/10 border-destructive/20';
            default: return 'text-muted-foreground bg-muted/10 border-border/50';
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
            {/* KYC Enforcement Banner */}
            {kycBlocked && (
                <div className="flex items-start gap-4 p-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-2xl">
                    <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="font-black text-amber-800 dark:text-amber-300">
                            {kycStatus === 'PENDING' ? (locale === 'ar' ? 'KYC قيد المراجعة ⏳' : 'KYC Under Review ⏳') : (locale === 'ar' ? 'مطلوب التحقق من الهوية 🔐' : 'Identity Verification Required 🔐')}
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                            {kycStatus === 'PENDING'
                                ? (locale === 'ar' ? 'يتم مراجعة مستنداتك. ستتمكن من إضافة المنتجات بمجرد التحقق من هويتك.' : 'Your documents are being reviewed. You can add products once your identity is verified.')
                                : (locale === 'ar' ? 'يجب إكمال KYC (التحقق من الهوية) قبل إدراج المنتجات على المنصة.' : 'You must complete KYC (identity verification) before listing products on the platform.')}
                        </p>
                    </div>
                    {kycStatus !== 'PENDING' && (
                        <Link href="/dashboard/kyc" className="shrink-0 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-colors">
                            {locale === 'ar' ? 'تحقق الآن' : 'Verify Now'}
                        </Link>
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
                        onClick={() => { setEditingProduct(null); setIsEditorOpen(true); }}
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
                                                    <div className={cn(
                                                        "inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[10px] font-black",
                                                        getStatusColor(product.status)
                                                    )}>
                                                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                                        {product.status?.toUpperCase() || 'UNKNOWN'}
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
                                                        <p className="text-[9px] font-bold text-muted-foreground uppercase">{product.unit || 'units'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-end">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => { setEditingProduct(product); setIsEditorOpen(true); }}
                                                            className="w-9 h-9 rounded-lg bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all flex items-center justify-center"
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleQuickBoost(product.id, product.name)}
                                                            className="w-9 h-9 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all flex items-center justify-center shadow-lg shadow-primary/5"
                                                            title="Boost"
                                                        >
                                                            <Zap size={16} />
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
                                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain" />
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
                                        <button onClick={() => { setEditingProduct(product); setIsEditorOpen(true); }} className="p-2 text-muted-foreground hover:text-primary"><Edit2 size={16} /></button>
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
                        onClick={() => { setEditingProduct(null); setIsEditorOpen(true); }}
                        className="mt-8 h-12 px-8 bg-primary text-primary-foreground rounded-full font-black flex items-center gap-2 hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
                    >
                        <Plus size={20} /> List First Product
                    </button>
                </div>
            )}

            {/* Product Editor Modal */}
            <ProductEditorModal
                isOpen={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                onSave={handleSaveProduct}
                product={editingProduct as any}
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
                                className="bg-card w-full max-w-2xl rounded-[40px] border border-border/50 overflow-hidden shadow-2xl flex flex-col"
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
                                                const headers = 'name,brand,description,category,price,stock,ean,unit,minOrder,unitsPerPallet,palletsPerShipment';
                                                const blob = new Blob([headers], { type: 'text/csv' });
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

                                <div className="p-8 space-y-6">
                                    {!bulkResults ? (
                                        <div className="border-2 border-dashed border-border/50 rounded-3xl p-12 flex flex-col items-center justify-center text-center relative group hover:border-primary/50 hover:bg-primary/5 transition-all">
                                            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                                <FileSpreadsheet size={32} className="text-primary" />
                                            </div>
                                            <h3 className="text-xl font-black text-foreground mb-2">{t('supplier', 'dropSpreadsheet')}</h3>
                                            <p className="text-muted-foreground">{t('supplier', 'supportsXlsxCsv')}</p>

                                            <div className="mt-6 text-start bg-muted/30 p-4 rounded-xl border border-border/50 max-w-md w-full relative z-20 pointer-events-auto">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-foreground mb-2 flex items-center gap-2">
                                                    <CheckCircle2 size={14} className="text-primary" /> {t('supplier', 'importantRules')}
                                                </h4>
                                                <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ps-4 font-medium">
                                                    <li><strong className="text-foreground">{t('supplier', 'requiredColumns')}:</strong> name, description, category, price, stock</li>
                                                    <li>{t('supplier', 'pendingWarning')}</li>
                                                    <li>{t('supplier', 'eanFetch')}</li>
                                                    <li>No default or placeholder images (e.g., Coca-Cola) will be used.</li>
                                                </ul>
                                            </div>

                                            <div className="mt-4 flex items-center gap-3 relative z-20 pointer-events-auto">
                                                <label className="text-xs font-black uppercase tracking-widest text-foreground whitespace-nowrap">
                                                    {locale === 'ar' ? 'عملة الأسعار في الملف' : 'Prices in file are in'}
                                                </label>
                                                <select
                                                    value={bulkCurrency}
                                                    onChange={(e) => setBulkCurrency(e.target.value)}
                                                    className="flex-1 h-10 px-3 rounded-xl border border-border/50 bg-background text-foreground font-bold text-sm outline-none focus:border-primary"
                                                >
                                                    <option value="EGP">EGP — Egyptian Pound</option>
                                                    <option value="USD">USD — US Dollar</option>
                                                    <option value="EUR">EUR — Euro</option>
                                                    <option value="GBP">GBP — British Pound</option>
                                                    <option value="AED">AED — UAE Dirham</option>
                                                    <option value="SAR">SAR — Saudi Riyal</option>
                                                    <option value="KWD">KWD — Kuwaiti Dinar</option>
                                                    <option value="QAR">QAR — Qatari Riyal</option>
                                                    <option value="TRY">TRY — Turkish Lira</option>
                                                    <option value="INR">INR — Indian Rupee</option>
                                                </select>
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
        </div>
    );
}
