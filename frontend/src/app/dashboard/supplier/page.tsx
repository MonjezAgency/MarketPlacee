'use client';
import { apiFetch } from '@/lib/api';


import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Package, Plus, Upload, Search, MoreHorizontal,
    Loader2, AlertTriangle, CheckCircle2, XCircle, FileSpreadsheet,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import ProductEditorModal, { categoryLabel } from './ProductEditorModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trans } from '@/components/i18n/Trans';
import { useAuth } from '@/lib/auth';
import { formatPrice } from '@/lib/currency';
import { useTheme } from 'next-themes';
import { Sun, Moon, TrendingUp } from 'lucide-react';
import { Product, ProductStatus } from '@/lib/types';

interface UploadReport {
    totalRows: number;
    successCount: number;
    errorCount: number;
    createdCount: number;
    results: { rowNumber: number; success: boolean; errors?: string[] }[];
}

export default function SupplierDashboard() {
    const { user } = useAuth();
    const { t, fmt, meta } = useLanguage();
    const L = (key: string, vars?: Record<string, string | number>) => t('legacySupplier', key, vars);
    const STATUS_KEYS: Record<string, string> = {
        PENDING: 'statusPending', PENDING_APPROVAL: 'statusPendingApproval', APPROVED: 'statusApproved',
        REJECTED: 'statusRejected', BLOCKED: 'statusBlocked', ACTIVE: 'statusActive', INACTIVE: 'statusInactive',
    };
    const statusLabel = (s?: string) => (s && STATUS_KEYS[s] ? L(STATUS_KEYS[s]) : s || '');
    const listJoin = (items: string[]) => {
        try { return new (Intl as any).ListFormat(meta.intl, { style: 'narrow', type: 'unit' }).format(items); } catch { return items.join(', '); }
    };
    const router = useRouter();
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
        router.push('/supplier/products/new');
    };

    const handleEditProduct = (product: any) => {
        setEditingProduct({
            ...product,
            price: product.price,
            category: product.category || 'Beverages',
            description: product.description || '',
            unit: product.unit || 'Case',
            minOrder: product.minOrder || 1,
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
                images: data.images || (data.image ? [data.image] : []),
                ean: data.ean || undefined,
                weight: data.weight || undefined,
                shelfLife: data.shelfLife || undefined,
                origin: data.origin || undefined,
                unitsPerPallet: data.unitsPerPallet || undefined,
                palletsPerShipment: data.palletsPerShipment || undefined,
                brand: data.brand || undefined,
                unit: data.unit || undefined,
                minOrder: data.minOrder || undefined,
            };

            const res = await apiFetch(`/products${data.id ? `/${data.id}` : ''}`, {
                method: data.id ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const savedProduct = await res.json();
                if (data.id) {
                    setProducts(prev => prev.map(p => p.id === data.id ? savedProduct : p));
                } else {
                    setProducts(prev => [savedProduct, ...prev]);
                }
            } else {
                const errData = await res.json().catch(() => ({}));
                alert(L('saveFailed', { message: errData.message || L('unknownError') }));
            }
        } catch (err) {
            console.error('Failed to save product:', err);
            alert(L('saveFailedConnection'));
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
                // Default to EUR (platform base currency for the EU market).
                // The previous 'USD' default caused bulk uploads to be tagged
                // as USD, which the backend then converted via TO_EUR['USD']
                // (0.926) — shrinking supplier prices on every upload.
                const currentCurrency = (typeof window !== 'undefined' ? localStorage.getItem('platform-currency') : null) || 'EUR';
                formData.append('currency', currentCurrency);
                
                const res = await apiFetch(`/products/bulk-upload`, {
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
                    let errMsg = L('uploadFailed');
                    try {
                        const data = await res.json();
                        errMsg = data.message || errMsg;
                    } catch (_e) {
                        const text = await res.text().catch(() => '');
                        errMsg = text || L('serverError', { status: res.status });
                    }
                    throw new Error(L('uploadFailedOnFile', { file: file.name, message: errMsg }));
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
            alert(err.message || L('uploadFailedConnection'));
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
        <div data-no-translate className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-poppins font-black tracking-tight">{L('pageTitle')}</h1>
                    <p className="text-foreground/60">{L('pageSubtitle')}</p>
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
                        {isUploading ? L('uploading') : L('bulkUpload')}
                    </Button>
                    <Button onClick={handleNewProduct} className="rounded-full gap-2 shadow-xl shadow-primary/20">
                        <Plus className="w-4 h-4" />
                        {L('newProduct')}
                    </Button>
                    {mounted && (
                        <Button
                            variant="outline"
                            className="rounded-full w-10 h-10 p-0 border-foreground/10"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            aria-label={theme === 'dark' ? L('themeToLight') : L('themeToDark')}
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
                            {L('reportTitle')}
                        </h3>
                        <button onClick={() => setUploadReport(null)} aria-label={L('reportClose')} className="text-muted-foreground hover:text-foreground">
                            <XCircle size={18} />
                        </button>
                    </div>
                    <div className="flex gap-6 text-sm">
                        <span className="font-bold"><Trans text={L('reportTotalRows', { count: fmt.number(uploadReport.totalRows) })} tags={{ num: (c) => <span className="text-foreground">{c}</span> }} /></span>
                        <span className="font-bold text-green-500 flex items-center gap-1"><CheckCircle2 size={14} /> {L('reportSuccess', { count: uploadReport.successCount })}</span>
                        <span className="font-bold text-red-500 flex items-center gap-1"><XCircle size={14} /> {L('errorsCount', { count: uploadReport.errorCount })}</span>
                    </div>
                    {uploadReport.results.filter(r => !r.success).length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {uploadReport.results.filter(r => !r.success).map((r, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs bg-red-500/10 text-red-400 rounded-lg px-3 py-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <span>{L('reportRowError', { row: r.rowNumber, errors: r.errors?.join(', ') ?? '' })}</span>
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
                    <p className="text-sm font-bold opacity-80 uppercase tracking-widest mb-2">{L('statTotalProducts')}</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-5xl font-black">{fmt.number(products.length)}</h3>
                        <div className="flex items-center gap-1 text-xs font-black bg-white/20 px-3 py-1 rounded-full mb-1">
                            {L('statusActive')}
                        </div>
                    </div>
                    <p className="mt-8 text-sm opacity-80">{L('statApprovedPending', { approved: fmt.number(products.filter(p => p.status === 'APPROVED').length), pending: fmt.number(products.filter(p => p.status === 'PENDING').length) })}</p>
                </div>

                <div className="bg-surface border border-border/50 rounded-[2.5rem] p-8 group hover:shadow-xl transition-shadow">
                    <p className="text-sm font-bold text-foreground/40 uppercase tracking-widest mb-2">{L('statActivePlacements')}</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-5xl font-black">{fmt.number(activePlacements)}</h3>
                    </div>
                    <p className="mt-8 text-sm text-foreground/60">{L('statPlacementsHint')}</p>
                </div>

                <div className="bg-surface border border-border/50 rounded-[2.5rem] p-8 group hover:shadow-xl transition-shadow">
                    <p className="text-sm font-bold text-foreground/40 uppercase tracking-widest mb-2">{L('statOpenOrders')}</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-5xl font-black">{fmt.number(openOrders)}</h3>
                    </div>
                    <p className="mt-8 text-sm text-foreground/60">{L('statOrdersHint')}</p>
                </div>
            </div>

            {/* Top 5 Best-Selling Products */}
            <div className="bg-surface border border-border/50 rounded-[2.5rem] overflow-hidden shadow-sm">
                <div className="p-8 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold">{L('topTitle')}</h2>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-start">
                        <thead>
                            <tr className="bg-muted/30">
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">{L('colProduct')}</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">{L('colTotalSold')}</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">{L('colRevenue')}</th>
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
                                        {L('noSalesData')}
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
                                            <span className="font-black text-primary">{fmt.number(product.totalSold)}</span>
                                            <span className="text-xs text-foreground/40 uppercase">{L('units')}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 font-bold text-green-500">
                                        {formatPrice(product.totalRevenue, undefined, meta.intl)}
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
                        <h2 className="text-xl font-bold">{L('inventoryTitle')}</h2>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                        <input
                            className="w-full h-12 rounded-full border border-border/50 ps-11 pe-6 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all bg-background"
                            placeholder={L('searchPlaceholder')}
                            aria-label={L('searchPlaceholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-start">
                        <thead>
                            <tr className="bg-muted/30">
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">{L('colProduct')}</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">{L('colStatus')}</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40 text-center">{L('colDataHealth')}</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">{L('colCategory')}</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">{L('colPrice')}</th>
                                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-foreground/40">{L('colStock')}</th>
                                <th className="px-8 py-4"><span className="sr-only">{L('colActions')}</span></th>
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
                                        {searchTerm ? L('noSearchMatch') : L('noProductsYet')}
                                    </td>
                                </tr>
                            )}
                            {paginatedProducts.map((product) => {
                                const missingFields: string[] = [];
                                if (!product.description || product.description.trim() === '' || product.description === 'No description') missingFields.push(L('fieldDescription'));
                                if (!product.images || product.images.length === 0) missingFields.push(L('fieldImage'));
                                if (!product.ean) missingFields.push('EAN');
                                if (!product.weight) missingFields.push(L('fieldWeight'));
                                if (!product.shelfLife) missingFields.push(L('fieldBbd'));
                                if (!product.origin) missingFields.push(L('fieldOrigin'));
                                if (!product.unitsPerPallet) missingFields.push(L('fieldPalletUnits'));

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
                                                            <AlertTriangle size={10} /> {L('missingList', { fields: listJoin(missingFields) })}
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
                                                {statusLabel(product.status)}
                                            </Badge>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex justify-center">
                                                {missingFields.length === 0 ? (
                                                    <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full">
                                                        <CheckCircle2 size={12} /> {L('healthComplete')}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                                                        <AlertTriangle size={12} /> {L('healthMissing', { count: fmt.number(missingFields.length) })}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-sm text-foreground/60">{categoryLabel(t, product.category)}</td>
                                        <td className="px-8 py-6 font-bold">{formatPrice(product.basePrice ?? product.price, undefined, meta.intl)}</td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black">{fmt.number(product.stock ?? 0)}</span>
                                                <span className="text-xs text-foreground/40 uppercase">{L('units')}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-end">
                                            <Button onClick={() => handleEditProduct(product)} aria-label={L('editProductAria', { name: product.name })} variant="ghost" size="sm" className="rounded-full w-10 h-10 p-0 text-foreground/40 hover:text-foreground">
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
                            {L('showingRange', { from: fmt.number(((currentPage - 1) * ITEMS_PER_PAGE) + 1), to: fmt.number(Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)), total: fmt.number(filteredProducts.length) })}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                aria-label={L('prevPage')}
                            >
                                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                            </Button>
                            <span className="flex items-center px-4 text-sm font-black text-foreground">
                                {L('pageOf', { page: fmt.number(currentPage), total: fmt.number(totalPages) })}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                aria-label={L('nextPage')}
                            >
                                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
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
