'use client';
import { apiFetch } from '@/lib/api';


import { useState, useEffect, useRef } from 'react';
import {
    Package, Plus, Upload, Search, MoreHorizontal,
    Loader2, AlertTriangle, CheckCircle2, XCircle, FileSpreadsheet,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import ProductEditorModal from './ProductEditorModal';
import { useAuth } from '@/lib/auth';
import { formatPrice } from '@/lib/currency';
import { useTheme } from 'next-themes';
import { Sun, Moon, TrendingUp } from 'lucide-react';
import { Product, ProductStatus } from '@/lib/types';

const API_URL = '/api';

interface UploadReport {
    totalRows: number;
    successCount: number;
    errorCount: number;
    createdCount: number;
    results: { rowNumber: number; success: boolean; errors?: string[] }[];
}

export default function SupplierDashboard() {
    const { user } = useAuth();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    useEffect(() => {
        setMounted(true);
    }, []);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dashboardStats, setDashboardStats] = useState<any>(null);

    // Bulk upload state
    const bulkFileRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadReport, setUploadReport] = useState<UploadReport | null>(null);

    

    // Fetch supplier products
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await apiFetch(`/products/my-products`, {
                });
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data);
                }
            } catch (err) {
                console.error('Failed to fetch products:', err);
            } finally {
                setIsLoading(false);
            }
        };

        // Fetch dashboard stats
        const fetchStats = async () => {
            try {
                const res = await apiFetch(`/dashboard/supplier`, {
                });
                if (res.ok) {
                    const data = await res.json();
                    setDashboardStats(data);
                }
            } catch (err) {
                console.error('Failed to fetch dashboard stats:', err);
            }
        };

        fetchProducts();
        fetchStats();
    }, []);

    const handleNewProduct = () => {
        setEditingProduct(null);
        setIsProductModalOpen(true);
    };

    const handleEditProduct = (product: any) => {
        setEditingProduct({
            ...product,
            price: product.price,
            category: product.category || 'Beverages',
            description: product.description || '',
            unit: 'Case',
            minOrder: 1,
            image: product.images?.[0] || '',
            variants: product.variants || [],
        });
        setIsProductModalOpen(true);
    };

    const handleSaveProduct = async (data: any) => {
        try {
            const payload = {
                name: data.name,
                description: data.description || 'No description',
                price: data.price,
                stock: data.stock,
                category: data.category,
                images: data.image ? [data.image] : [],
                ean: data.ean || undefined,
            };

            const res = await apiFetch(`/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const newProduct = await res.json();
                setProducts(prev => [newProduct, ...prev]);
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(`Failed to save product: ${errData.message || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Failed to save product:', err);
            alert('Failed to save product. Check your connection.');
        }
        setIsProductModalOpen(false);
    };

    // Bulk Upload handler
    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsUploading(true);
        setUploadReport(null);
        let accumulatedResults = {
            totalRows: 0,
            successCount: 0,
            errorCount: 0,
            createdCount: 0,
            results: [] as any[]
        };

        try {
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                
                const backendBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
                const apiUrl = `${backendBase}/products/bulk-upload`;

                const res = await fetch(apiUrl, {
                    method: 'POST',
                    body: formData,
                });

                if (res.ok) {
                    const report: UploadReport = await res.json();
                    accumulatedResults.totalRows += report.totalRows || 0;
                    accumulatedResults.successCount += report.successCount || 0;
                    accumulatedResults.errorCount += report.errorCount || 0;
                    accumulatedResults.createdCount += report.createdCount || 0;
                    
                    const fileResults = (report.results || []).map((r: any) => ({
                        ...r,
                        file: file.name
                    }));
                    accumulatedResults.results.push(...fileResults);
                } else {
                    let errMsg = 'Upload failed';
                    try {
                        const data = await res.json();
                        errMsg = data.message || errMsg;
                    } catch {
                        const text = await res.text().catch(() => '');
                        errMsg = text || `Server error (${res.status})`;
                    }
                    throw new Error(`Failed on file ${file.name}: ${errMsg}`);
                }
            }
            
            // Set accumulated report
            setUploadReport(accumulatedResults);
            
            // Refresh products
            const prodRes = await apiFetch(`/products/my-products`, {
            });
            if (prodRes.ok) {
                setProducts(await prodRes.json());
            }

        } catch (err: any) {
            console.error('Bulk upload error:', err);
            alert(`${err.message || 'Upload failed. Check your connection.'}`);
        } finally {
            setIsUploading(false);
            if (bulkFileRef.current) bulkFileRef.current.value = '';
        }
    };

    const filteredProducts = products.filter(p =>
        (p.name?.toLowerCase() ?? '').includes(searchTerm.toLowerCase()) ||
        (p.category?.toLowerCase() ?? '').includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
    const paginatedProducts = filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const totalRevenue = dashboardStats?.totalRevenue ?? 0;
    const activePlacements = dashboardStats?.activePlacements ?? 0;
    const openOrders = dashboardStats?.openOrders ?? 0;

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-poppins font-black tracking-tight">Overview</h1>
                    <p className="text-foreground/60">Manage your wholesale distribution and operations.</p>
                </div>
                <div className="flex gap-3">
                    <input
                        ref={bulkFileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        className="hidden"
                        onChange={handleBulkUpload}
                    />
                    <Button
                        variant="outline"
                        className="rounded-full gap-2 border-foreground/10"
                        onClick={() => bulkFileRef.current?.click()}
                        disabled={isUploading}
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {isUploading ? 'Uploading...' : 'Bulk Upload'}
                    </Button>
                    <Button onClick={handleNewProduct} className="rounded-full gap-2 shadow-xl shadow-primary/20">
                        <Plus className="w-4 h-4" />
                        New Product
                    </Button>
                    {mounted && (
                        <Button
                            variant="outline"
                            className="rounded-full w-10 h-10 p-0 border-foreground/10"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </Button>
                    )}
                </div>
            </div>

            {/* Upload Report */}
            {uploadReport && (
                <div className="bg-card border border-border/50 rounded-[2rem] p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-primary" />
                            Upload Report
                        </h3>
                        <button onClick={() => setUploadReport(null)} className="text-muted-foreground hover:text-foreground">
                            <XCircle size={18} />
                        </button>
                    </div>
                    <div className="flex gap-6 text-sm">
                        <span className="font-bold">Total Rows: <span className="text-foreground">{uploadReport.totalRows}</span></span>
                        <span className="font-bold text-green-500 flex items-center gap-1"><CheckCircle2 size={14} /> {uploadReport.successCount} Success</span>
                        <span className="font-bold text-red-500 flex items-center gap-1"><XCircle size={14} /> {uploadReport.errorCount} Errors</span>
                    </div>
                    {uploadReport.results.filter(r => !r.success).length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {uploadReport.results.filter(r => !r.success).map((r, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs bg-red-500/10 text-red-400 rounded-lg px-3 py-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <span>Row {r.rowNumber}: {r.errors?.join(', ')}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Stats — Real Data */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-primary rounded-[2.5rem] p-8 text-primary-foreground relative overflow-hidden group shadow-2xl shadow-primary/20">
                    <div className="absolute top-0 end-0 w-32 h-32 bg-white/10 rounded-full -me-10 -mt-10 blur-2xl group-hover:scale-150 transition-transform duration-700" />
                    <p className="text-sm font-bold opacity-80 uppercase tracking-widest mb-2">Total Products</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-5xl font-black">{products.length}</h3>
                        <div className="flex items-center gap-1 text-xs font-black bg-white/20 px-3 py-1 rounded-full mb-1">
                            Active
                        </div>
                    </div>
                    <p className="mt-8 text-sm opacity-80">{products.filter(p => p.status === 'APPROVED').length} Approved · {products.filter(p => p.status === 'PENDING').length} Pending</p>
                </div>

                <div className="bg-surface border border-border/50 rounded-[2.5rem] p-8 group hover:shadow-xl transition-shadow">
                    <p className="text-sm font-bold text-foreground/40 uppercase tracking-widest mb-2">Active Placements</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-5xl font-black">{activePlacements}</h3>
                    </div>
                    <p className="mt-8 text-sm text-foreground/60">Managed through the Placements tab</p>
                </div>

                <div className="bg-surface border border-border/50 rounded-[2.5rem] p-8 group hover:shadow-xl transition-shadow">
                    <p className="text-sm font-bold text-foreground/40 uppercase tracking-widest mb-2">Open Orders</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-5xl font-black">{openOrders}</h3>
                    </div>
                    <p className="mt-8 text-sm text-foreground/60">Track orders from the Orders tab</p>
                </div>
            </div>

            {/* Top 5 Best-Selling Products */}
            <div className="bg-surface border border-border/50 rounded-[2.5rem] overflow-hidden shadow-sm">
                <div className="p-8 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold">Top 5 Best-Selling Products</h2>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-start">
                        <thead>
                            <tr className="bg-muted/30">
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">Product</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">Total Sold</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">Revenue generated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {!dashboardStats?.topProducts && (
                                <tr>
                                    <td colSpan={3} className="px-8 py-10 text-center">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                    </td>
                                </tr>
                            )}
                            {(!dashboardStats?.topProducts || dashboardStats.topProducts.length === 0) && (
                                <tr>
                                    <td colSpan={3} className="px-8 py-10 text-center text-muted-foreground text-sm font-bold">
                                        No sales data available yet.
                                    </td>
                                </tr>
                            )}
                            {dashboardStats?.topProducts?.map((product: any) => (
                                <tr key={product.productId} className="hover:bg-muted/20 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            {product.image ? (
                                                <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/50" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                                    <Package size={16} />
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-bold">{product.name}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-primary">{product.totalSold}</span>
                                            <span className="text-xs text-foreground/40 uppercase">Units</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 font-bold text-green-500">
                                        {formatPrice(product.totalRevenue, false)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Inventory & Control */}
            <div className="bg-surface border border-border/50 rounded-[2.5rem] overflow-hidden shadow-sm">
                <div className="p-8 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                            <Package className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold">Inventory Management</h2>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                        <input
                            className="w-full h-12 rounded-full border border-border/50 ps-11 pe-6 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all bg-background"
                            placeholder="Search products..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-start">
                        <thead>
                            <tr className="bg-muted/30">
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">Product</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">Status</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">Category</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">Price</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">Stock</th>
                                <th className="px-8 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {isLoading && (
                                <tr>
                                    <td colSpan={6} className="px-8 py-10 text-center">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                                    </td>
                                </tr>
                            )}
                            {!isLoading && filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-8 py-10 text-center text-muted-foreground text-sm font-bold">
                                        {searchTerm ? 'No products match your search.' : 'No products yet. Click "New Product" to get started.'}
                                    </td>
                                </tr>
                            )}
                            {paginatedProducts.map((product) => {
                                const missingFields: string[] = [];
                                if (!product.description || product.description.trim() === '' || product.description === 'No description') missingFields.push('Description');
                                if (!product.images || product.images.length === 0) missingFields.push('Image');
                                if (!product.ean) missingFields.push('EAN');

                                return (
                                    <tr key={product.id} className="hover:bg-muted/20 transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                {product.images?.[0] ? (
                                                    <img src={product.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/50" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                                        <Package size={16} />
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-bold">{product.name}</p>
                                                    {missingFields.length > 0 && (
                                                        <p className="text-[10px] text-amber-500 font-bold flex items-center gap-1 mt-0.5">
                                                            <AlertTriangle size={10} /> Missing: {missingFields.join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <Badge variant={
                                                product.status === 'APPROVED' ? 'success' :
                                                    product.status === 'PENDING' ? 'accent' : 'destructive'
                                            }>
                                                {product.status}
                                            </Badge>
                                        </td>
                                        <td className="px-8 py-6 text-sm text-foreground/60">{product.category}</td>
                                        <td className="px-8 py-6 font-bold">{formatPrice(product.basePrice ?? product.price, false)}</td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black">{product.stock}</span>
                                                <span className="text-xs text-foreground/40 uppercase">Units</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-end">
                                            <Button onClick={() => handleEditProduct(product)} variant="ghost" size="sm" className="rounded-full w-10 h-10 p-0 text-foreground/40 hover:text-foreground">
                                                <MoreHorizontal className="w-5 h-5" />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-border/50 bg-muted/10">
                        <span className="text-sm text-foreground/60">
                            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length} products
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="flex items-center px-4 text-sm font-black text-foreground">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
            <ProductEditorModal
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                product={editingProduct}
                onSave={handleSaveProduct}
            />
        </div>
    );
}
