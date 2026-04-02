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
import { fetchMyProducts } from '@/lib/api';
import { cn } from '@/lib/utils';
import ProductEditorModal from '@/app/dashboard/supplier/ProductEditorModal';

interface SupplierProduct {
    id: string;
    name: string;
    description: string;
    price: number;       // customer-facing price (with markup) — never shown to supplier
    basePrice?: number;  // supplier's original price — what they set and what they get paid
    stock: number;
    category: string;
    images: string[];
    status: string;
    ean?: string;
    minOrder?: number;
    unit?: string;
}

export default function SupplierProductsPage() {
    const { user } = useAuth();
    const [products, setProducts] = React.useState<SupplierProduct[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState('All');
    const [isEditorOpen, setIsEditorOpen] = React.useState(false);
    const [editingProduct, setEditingProduct] = React.useState<SupplierProduct | null>(null);

    const [isBulkModalOpen, setIsBulkModalOpen] = React.useState(false);
    const [bulkFile, setBulkFile] = React.useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [bulkResults, setBulkResults] = React.useState<any>(null);

    const [selectedProducts, setSelectedProducts] = React.useState<Set<string>>(new Set());
    const [isDeletingBulk, setIsDeletingBulk] = React.useState(false);
    const [kycStatus, setKycStatus] = React.useState<string>('UNVERIFIED');
    const kycBlocked = kycStatus !== 'VERIFIED';

    React.useEffect(() => {
        loadProducts();
        // Fetch KYC status
        const token = localStorage.getItem('bev-token');
        if (token) {
            fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/kyc/status', {
                headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.json()).then(d => setKycStatus(d.kycStatus || 'UNVERIFIED')).catch(() => {});
        }
    }, []);

    const loadProducts = async () => {
        try {
            const token = localStorage.getItem('bev-token') || '';
            const data = await fetchMyProducts(token);
            setProducts(data as any);
        } catch (error) {
            console.error('Failed to fetch products:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkFile) return;

        setIsSubmitting(true);
        try {
            const token = localStorage.getItem('bev-token');
            if (!token || token === 'LOCAL_ONLY') {
                localStorage.removeItem('bev-token');
                localStorage.removeItem('bev-user');
                window.location.href = '/auth/login';
                return;
            }
            const formData = new FormData();
            formData.append('file', bulkFile);

            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/products/bulk-upload', {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: formData,
            });

            if (!res.ok) {
                let errMsg = 'Upload failed';
                try {
                    const data = await res.json();
                    errMsg = data.message || errMsg;
                } catch {
                    const text = await res.text().catch(() => '');
                    errMsg = text || `Server error (${res.status})`;
                }
                throw new Error(errMsg);
            }

            const report = await res.json();
            setBulkResults(report);
            loadProducts(); // Refresh list
        } catch (err: any) {
            console.error('Bulk upload error:', err);
            alert(`Upload failed: ${err.message || 'Unknown error. Check connection.'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedProducts.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedProducts.size} product(s)?`)) return;

        setIsDeletingBulk(true);
        try {
            const token = localStorage.getItem('bev-token');
            if (!token || token === 'LOCAL_ONLY') {
                localStorage.removeItem('bev-token'); localStorage.removeItem('bev-user');
                window.location.href = '/auth/login'; return;
            }

            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/products/bulk-delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids: Array.from(selectedProducts) })
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

    const handleSaveProduct = async (formData: any) => {
        try {
            const token = localStorage.getItem('bev-token');
            if (!token || token === 'LOCAL_ONLY') {
                localStorage.removeItem('bev-token'); localStorage.removeItem('bev-user');
                window.location.href = '/auth/login'; return;
            }

            const url = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + 
                (editingProduct ? `/products/${editingProduct.id}` : '/products');
            
            const method = editingProduct ? 'PATCH' : 'POST';

            // Map image to images for backend schema compatibility
            const payload = { ...formData };
            if (payload.image) {
                payload.images = [payload.image, ...(payload.images || [])];
                delete payload.image;
            }

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
            p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.ean?.includes(searchTerm);
        const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

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
                            {kycStatus === 'PENDING' ? 'KYC Under Review ⏳' : 'Identity Verification Required 🔐'}
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                            {kycStatus === 'PENDING'
                                ? 'Your documents are being reviewed. You can add products once your identity is verified.'
                                : 'You must complete KYC (identity verification) before listing products on the platform.'}
                        </p>
                    </div>
                    {kycStatus !== 'PENDING' && (
                        <Link href="/dashboard/kyc" className="shrink-0 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-colors">
                            Verify Now
                        </Link>
                    )}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
                        Product Management <Box className="text-primary w-8 h-8" />
                    </h1>
                    <p className="text-muted-foreground font-medium mt-1">Manage your active inventory and listings.</p>
                </div>

                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {selectedProducts.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={isDeletingBulk}
                            className="h-12 px-6 rounded-xl font-black bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all flex items-center gap-2"
                        >
                            <Trash2 size={18} />
                            {isDeletingBulk ? 'Deleting...' : `Delete Selected (${selectedProducts.size})`}
                        </button>
                    )}
                    <button
                        onClick={() => setIsBulkModalOpen(true)}
                        disabled={kycBlocked}
                        className="h-12 px-6 rounded-xl font-black border border-border/50 hover:bg-muted/50 flex items-center gap-2 text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <UploadCloud size={18} /> Bulk Upload
                    </button>
                    <button
                        disabled={kycBlocked}
                        onClick={() => { setEditingProduct(null); setIsEditorOpen(true); }}
                        className="h-12 px-8 bg-primary text-primary-foreground rounded-xl font-black flex items-center gap-2 hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        <Plus size={20} /> Add New
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Listings', value: products.length, icon: Archive, color: 'text-primary' },
                    { label: 'Active', value: products.filter(p => p.status === 'ACTIVE').length, icon: CheckCircle2, color: 'text-emerald-500' },
                    { label: 'Pending', value: products.filter(p => p.status === 'PENDING').length, icon: Box, color: 'text-amber-500' },
                    { label: 'Categories', value: new Set(products.map(p => p.category)).size, icon: Tag, color: 'text-blue-500' },
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
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-14 bg-card border border-border/50 rounded-2xl ps-12 pe-4 text-foreground outline-none focus:border-primary/50 transition-all font-medium"
                    />
                </div>
                <div className="flex gap-2 min-w-max">
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="h-14 px-6 bg-card border border-border/50 rounded-2xl text-foreground font-bold outline-none cursor-pointer appearance-none min-w-[160px]"
                    >
                        <option value="All">All Categories</option>
                        {CATEGORIES_LIST.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Products Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-64 bg-card rounded-3xl border border-border/50 animate-pulse" />
                    ))}
                </div>
            ) : filteredProducts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                        {filteredProducts.map((product) => (
                            <motion.div
                                key={product.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className={cn(
                                    "bg-card border border-border/50 rounded-3xl overflow-hidden group transition-all flex flex-col relative",
                                    selectedProducts.has(product.id) ? "ring-2 ring-primary border-primary hover:border-primary" : "hover:border-primary/30"
                                )}
                            >
                                <button
                                    onClick={() => toggleProductSelection(product.id)}
                                    className="absolute top-4 end-4 z-20 w-8 h-8 rounded-full bg-background/80 backdrop-blur-md border border-border/50 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                                >
                                    <div className={cn(
                                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                                        selectedProducts.has(product.id)
                                            ? "bg-primary border-primary text-primary-foreground"
                                            : "border-muted-foreground/30 hover:border-primary/50"
                                    )}>
                                        {selectedProducts.has(product.id) && <CheckCircle2 size={12} />}
                                    </div>
                                </button>
                                <div className="aspect-[4/3] relative bg-muted flex items-center justify-center overflow-hidden">
                                    {product.images?.[0] ? (
                                        <img
                                            src={product.images[0]}
                                            alt={product.name}
                                            className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 opacity-20">
                                            <Camera size={32} />
                                            <span className="text-[10px] font-black uppercase tracking-tighter">No Preview</span>
                                        </div>
                                    )}
                                    <div className={cn(
                                        "absolute top-4 start-4 h-6 px-3 rounded-full border text-[10px] font-black flex items-center gap-1.5 backdrop-blur-md",
                                        getStatusColor(product.status)
                                    )}>
                                        {product.status?.toUpperCase() || 'UNKNOWN'}
                                    </div>
                                </div>

                                <div className="p-6 space-y-4 flex-1 flex flex-col">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">{product.category}</p>
                                        <h3 className="font-black text-foreground leading-tight line-clamp-1">{product.name}</h3>
                                        <p className="text-xs text-muted-foreground font-medium line-clamp-2 min-h-[32px]">{product.description}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/10 mt-auto">
                                        <div className="space-y-0.5">
                                            <p className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground flex items-center gap-1">
                                                <DollarSign size={8} /> Price
                                            </p>
                                            <p className="text-base font-black text-foreground">€{(product.basePrice ?? product.price).toFixed(2)}</p>
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground flex items-center gap-1">
                                                <Archive size={8} /> Stock
                                            </p>
                                            <p className={cn("text-base font-black", product.stock < 10 ? "text-destructive" : "text-foreground")}>
                                                {product.stock} <span className="text-[10px]">{product.unit || 'units'}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={() => { setEditingProduct(product); setIsEditorOpen(true); }}
                                            className="flex-1 h-10 bg-muted hover:bg-muted/80 text-foreground rounded-xl flex items-center justify-center gap-2 transition-colors text-xs font-bold"
                                        >
                                            <Edit2 size={14} /> Edit
                                        </button>
                                        <button
                                            className="w-10 h-10 bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl flex items-center justify-center transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
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
                product={editingProduct as any || undefined}
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
                                        <h2 className="text-2xl font-black text-foreground tracking-tight">Bulk Upload Products</h2>
                                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">Upload via Excel or CSV</p>
                                    </div>
                                    <button type="button" onClick={() => { setIsBulkModalOpen(false); setBulkResults(null); setBulkFile(null); }} className="w-10 h-10 bg-muted/50 hover:bg-muted rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="p-8 space-y-6">
                                    {!bulkResults ? (
                                        <div className="border-2 border-dashed border-border/50 rounded-3xl p-12 flex flex-col items-center justify-center text-center relative group hover:border-primary/50 hover:bg-primary/5 transition-all">
                                            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                                <FileSpreadsheet size={32} className="text-primary" />
                                            </div>
                                            <h3 className="text-xl font-black text-foreground mb-2">Drop your spreadsheet here</h3>
                                            <p className="text-muted-foreground">Supports .xlsx and .csv files</p>

                                            <div className="mt-6 text-start bg-muted/30 p-4 rounded-xl border border-border/50 max-w-md w-full relative z-20 pointer-events-auto">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-foreground mb-2 flex items-center gap-2">
                                                    <CheckCircle2 size={14} className="text-primary" /> Important Rules
                                                </h4>
                                                <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ps-4 font-medium">
                                                    <li><strong className="text-foreground">Required Columns:</strong> name, description, category, price, stock</li>
                                                    <li>Products missing a title, description, or image <strong className="text-amber-500">will remain PENDING</strong> and hidden from the marketplace.</li>
                                                    <li>If no image URL is provided, the system will attempt to fetch one using the <strong className="text-foreground">EAN</strong> if available.</li>
                                                    <li>No default or placeholder images (e.g., Coca-Cola) will be used.</li>
                                                </ul>
                                            </div>

                                            <input
                                                type="file"
                                                accept=".xlsx, .csv"
                                                onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />

                                            {bulkFile && (
                                                <div className="mt-6 p-4 bg-muted/50 rounded-xl border border-border/50 flex items-center gap-3 relative z-10 w-full justify-center">
                                                    <CheckCircle2 className="text-emerald-500" size={20} />
                                                    <span className="font-bold text-foreground truncate max-w-[200px]">{bulkFile.name}</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col items-center justify-center text-center">
                                                <CheckCircle2 className="text-emerald-500 mb-2" size={32} />
                                                <h3 className="text-xl font-black text-foreground">Upload Complete!</h3>
                                                <p className="text-emerald-500 mt-1">Successfully processed {bulkResults.totalRows} rows.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-6 border-t border-border/50 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { setIsBulkModalOpen(false); setBulkResults(null); setBulkFile(null); }}
                                        className="px-6 h-12 rounded-xl border border-border/50 font-bold text-foreground hover:bg-muted/50 transition-colors"
                                    >
                                        {bulkResults ? 'Close' : 'Cancel'}
                                    </button>
                                    {!bulkResults && (
                                        <button
                                            type="submit"
                                            disabled={!bulkFile || isSubmitting}
                                            className="px-6 h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        >
                                            {isSubmitting ? 'Uploading...': 'Upload Products'}
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
