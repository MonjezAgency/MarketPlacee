'use client';

import * as React from 'react';
import { 
    Package, Search, CheckCircle, XCircle, Trash2, 
    Clock, Tag, BarChart3, User, Hash, 
    Calendar, ImageIcon, Pencil, Save, AlertTriangle,
    Filter, Download, MoreVertical, Layers, Box,
    ChevronRight, ArrowRight, ExternalLink, X
} from 'lucide-react';
import { CATEGORIES_LIST } from '@/lib/products';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { formatPrice } from '@/lib/currency';
import { showIPhoneToast } from '@/components/ui/IPhoneToast';

interface AdminProduct {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    stock: number;
    images: string[];
    brand: string;
    status: string;
    ean?: string;
    adminNotes?: string;
    createdAt: string;
    supplier?: {
        id: string;
        name: string;
        email: string;
        companyName: string;
    };
}

function ProductDetailModal({ product, onClose, onApprove, onReject, onDelete, onUpdate, actionLoading, validationErrors = []
}: {
    product: AdminProduct;
    onClose: () => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, data: Partial<AdminProduct>) => Promise<void>;
    actionLoading: string | null;
    validationErrors?: string[];
}) {
    const { t } = useLanguage();
    const [activeImage, setActiveImage] = React.useState(0);
    const [isEditing, setIsEditing] = React.useState(false);
    const [editedData, setEditedData] = React.useState({
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        category: product.category,
        brand: product.brand,
    });

    const handleSave = async () => {
        try {
            await onUpdate(product.id, editedData);
            setIsEditing(false);
            showIPhoneToast(t('admin', 'productUpdated'), 'success');
        } catch (error) {
            console.error('Failed to update product:', error);
            showIPhoneToast(t('admin', 'failedToUpdate'), 'error');
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose} className="absolute inset-0 bg-background/80 backdrop-blur-2xl" />
            
            <motion.div 
                initial={{ scale: 0.9, y: 50, opacity: 0 }} 
                animate={{ scale: 1, y: 0, opacity: 1 }} 
                exit={{ scale: 0.9, y: 50, opacity: 0 }}
                className="glass-card-strong w-full max-w-5xl relative z-10 overflow-hidden flex flex-col md:flex-row h-[800px] shadow-[0_0_100px_rgba(0,0,0,0.5)] border-primary/20"
            >
                {/* Left Side: Product Visuals */}
                <div className="w-full md:w-[45%] bg-primary/5 p-12 flex flex-col space-y-8 border-e border-border/10 overflow-hidden">
                    <div className="relative aspect-square w-full">
                        <AnimatePresence mode="wait">
                            <motion.img 
                                key={activeImage}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.1 }}
                                src={product.images[activeImage] || 'https://via.placeholder.com/400'} 
                                className="w-full h-full object-cover rounded-[3rem] shadow-2xl border-4 border-card"
                            />
                        </AnimatePresence>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                        {product.images.map((img, i) => (
                            <button 
                                key={i} 
                                onClick={() => setActiveImage(i)}
                                className={cn(
                                    "w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all flex-shrink-0",
                                    activeImage === i ? "border-primary scale-110 shadow-lg shadow-primary/20" : "border-border/50 opacity-50 hover:opacity-100"
                                )}
                            >
                                <img src={img} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                    <div className="pt-8 border-t border-border/10">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-4">Quality Score</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 glass rounded-2xl">
                                <p className="text-xl font-black">94%</p>
                                <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Image Accuracy</p>
                            </div>
                            <div className="p-4 glass rounded-2xl">
                                <p className="text-xl font-black text-emerald-500">A+</p>
                                <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Data Health</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Data & Management */}
                <div className="flex-1 p-12 flex flex-col h-full bg-card/10 overflow-y-auto">
                    <div className="flex-1 space-y-10">
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <div className={cn(
                                    "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                    product.status === 'APPROVED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                )}>
                                    {product.status}
                                </div>
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                    SKU: PRD-{product.id.substring(0, 8).toUpperCase()}
                                </p>
                            </div>
                            {isEditing ? (
                                <input 
                                    className="text-4xl font-black uppercase tracking-tighter bg-transparent border-b-2 border-primary w-full outline-none pb-2 mb-6"
                                    value={editedData.name}
                                    onChange={e => setEditedData({...editedData, name: e.target.value})}
                                />
                            ) : (
                                <h2 className="text-4xl font-black uppercase tracking-tighter leading-none mb-6">{product.name}</h2>
                            )}
                            
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><Tag size={12}/> Valuation</p>
                                        {isEditing ? (
                                            <input 
                                                type="number"
                                                className="text-2xl font-black bg-muted p-2 rounded-xl w-full"
                                                value={editedData.price}
                                                onChange={e => setEditedData({...editedData, price: parseFloat(e.target.value)})}
                                            />
                                        ) : (
                                            <p className="text-3xl font-black tracking-tighter">{formatPrice(product.price)}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><Box size={12}/> Inventory</p>
                                        {isEditing ? (
                                            <input 
                                                type="number"
                                                className="text-2xl font-black bg-muted p-2 rounded-xl w-full"
                                                value={editedData.stock}
                                                onChange={e => setEditedData({...editedData, stock: parseInt(e.target.value)})}
                                            />
                                        ) : (
                                            <p className="text-3xl font-black tracking-tighter">{product.stock} Units</p>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><Layers size={12}/> Category</p>
                                        <p className="text-lg font-black">{product.category}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2"><User size={12}/> Supplier</p>
                                        <p className="text-lg font-black">{product.supplier?.companyName || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 glass p-8 rounded-[2rem]">
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-3">
                                <ExternalLink size={16} className="text-primary" /> Listing Description
                            </h3>
                            {isEditing ? (
                                <textarea 
                                    className="w-full h-32 bg-muted p-4 rounded-2xl text-sm font-medium resize-none border-none outline-none focus:ring-2 focus:ring-primary/20"
                                    value={editedData.description}
                                    onChange={e => setEditedData({...editedData, description: e.target.value})}
                                />
                            ) : (
                                <p className="text-sm text-foreground/70 leading-relaxed font-medium">
                                    {product.description || 'No detailed description provided by the supplier.'}
                                </p>
                            )}
                        </section>
                    </div>

                    <div className="pt-12 border-t border-border/20 grid grid-cols-2 md:grid-cols-3 gap-6">
                        <button onClick={() => onDelete(product.id)} className="h-16 flex items-center justify-center gap-3 rounded-3xl border-2 border-red-500/20 text-red-500 font-black uppercase text-[10px] tracking-widest hover:bg-red-500 hover:text-white transition-all">
                            <Trash2 size={18} /> Purge
                        </button>
                        
                        <button onClick={() => isEditing ? handleSave() : setIsEditing(true)} className="h-16 flex items-center justify-center gap-3 rounded-3xl bg-secondary text-white font-black uppercase text-[10px] tracking-widest hover:opacity-90 transition-all">
                            {isEditing ? <><Save size={18} /> Push Edits</> : <><Pencil size={18} /> Modify Field</>}
                        </button>

                        <button 
                            disabled={actionLoading === product.id}
                            onClick={() => product.status === 'APPROVED' ? onReject(product.id) : onApprove(product.id)} 
                            className={cn(
                                "h-16 col-span-2 md:col-span-1 flex items-center justify-center gap-3 rounded-3xl font-black uppercase text-[10px] tracking-widest transition-all shadow-xl",
                                actionLoading === product.id ? "bg-muted text-muted-foreground" : 
                                product.status === 'APPROVED' ? "bg-amber-500 text-white shadow-amber-500/20 hover:scale-105 active:scale-95" : "bg-primary text-white shadow-primary/20 hover:scale-105 active:scale-95"
                            )}
                        >
                            {actionLoading === product.id ? (
                                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : product.status === 'APPROVED' ? (
                                <><XCircle size={18} /> Rescind</>
                            ) : (
                                <><CheckCircle size={18} /> Final Approve</>
                            )}
                        </button>
                    </div>
                </div>
                
                <button onClick={onClose} className="absolute top-8 end-8 w-12 h-12 glass rounded-full flex items-center justify-center hover:rotate-90 transition-transform">
                    <X size={24} />
                </button>
            </motion.div>
        </div>
    );
}

export default function AdminProductsPage() {
    const { t } = useLanguage();
    const [products, setProducts] = React.useState<AdminProduct[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState('All');
    const [selectedProduct, setSelectedProduct] = React.useState<AdminProduct | null>(null);
    const [actionLoading, setActionLoading] = React.useState<string | null>(null);
    const [activeTab, setActiveTab] = React.useState<'needs_approval' | 'approved' | 'rejected'>('needs_approval');
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const [isBulkLoading, setIsBulkLoading] = React.useState(false);

    const fetchProducts = React.useCallback(async () => {
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/products/admin/all', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setProducts(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Failed to fetch products:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { fetchProducts(); }, [fetchProducts]);

    const handleApprove = async (id: string) => {
        setActionLoading(id);
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/products/${id}/approve`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showIPhoneToast('Product approved', 'success');
                fetchProducts();
                setSelectedProduct(null);
            } else {
                const errorData = await res.json();
                const msg = errorData.message || 'Approval failed';
                const details = Array.isArray(errorData.errors) ? `: ${errorData.errors.join(', ')}` : '';
                showIPhoneToast(`${msg}${details}`, 'error');
            }
        } catch (err) { 
            console.error(err); 
            showIPhoneToast('Network error during approval', 'error');
        } finally { setActionLoading(null); }
    };

    const handleReject = async (id: string) => {
        setActionLoading(id);
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/products/${id}/reject`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showIPhoneToast('Product rejected', 'info');
                fetchProducts();
                setSelectedProduct(null);
            } else {
                showIPhoneToast('Failed to reject product', 'error');
            }
        } catch (err) { 
            console.error(err); 
            showIPhoneToast('Network error during rejection', 'error');
        } finally { setActionLoading(null); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this product permanently?')) return;
        setActionLoading(id);
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/products/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                showIPhoneToast('Product deleted', 'info');
                fetchProducts();
                setSelectedProduct(null);
            } else {
                showIPhoneToast('Failed to delete product', 'error');
            }
        } catch (err) { 
            console.error(err); 
            showIPhoneToast('Network error during deletion', 'error');
        } finally { setActionLoading(null); }
    };

    const handleUpdate = async (id: string, data: Partial<AdminProduct>) => {
        setActionLoading(id);
        try {
            const token = localStorage.getItem('bev-token');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/products/${id}`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                showIPhoneToast('Product updated', 'success');
                fetchProducts();
            } else {
                const errorData = await res.json();
                showIPhoneToast(errorData.message || 'Update failed', 'error');
            }
        } catch (err) { 
            console.error(err); 
            showIPhoneToast('Network error during update', 'error');
        } finally { setActionLoading(null); }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
        const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
        const matchesTab = activeTab === 'needs_approval' ? p.status === 'PENDING' : activeTab === 'approved' ? p.status === 'APPROVED' : p.status === 'REJECTED';
        return matchesSearch && matchesCategory && matchesTab;
    });

    const stats = {
        total: products.length,
        pending: products.filter(p => p.status === 'PENDING').length,
        highValue: products.filter(p => p.price > 1000).length
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {/* High-Impact Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black text-foreground tracking-tighter uppercase leading-none">Catalog Hub</h1>
                    <p className="text-muted-foreground font-black text-[11px] uppercase tracking-[0.4em] opacity-70">Inventory Intelligence & Compliance</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute start-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Scan by product, brand, or SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-16 ps-16 pe-8 bg-card rounded-[2rem] border border-border/50 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground font-bold text-sm min-w-[350px] transition-all shadow-xl"
                        />
                    </div>
                </div>
            </div>

            {/* Elite Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card-strong p-8 overflow-hidden relative group">
                    <div className="absolute top-0 end-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><Package size={120} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Global Catalog</p>
                    <h2 className="text-5xl font-black tracking-tighter">{stats.total}</h2>
                    <div className="flex items-center gap-2 mt-4 text-primary font-black text-[10px] uppercase tracking-widest">
                        <ArrowRight size={14} /> Total SKUs Active
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-amber-500">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Approval Queue</p>
                    <h2 className="text-5xl font-black tracking-tighter text-amber-500">{stats.pending}</h2>
                    <div className="flex items-center gap-2 mt-4 text-amber-500 font-black text-[10px] uppercase tracking-widest">
                        <Clock size={14} /> Critical items pending
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-secondary">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">High-Value Items</p>
                    <h2 className="text-5xl font-black tracking-tighter text-secondary">{stats.highValue}</h2>
                    <div className="flex items-center gap-2 mt-4 text-secondary font-black text-[10px] uppercase tracking-widest">
                        <BarChart3 size={14} /> Premium Inventory
                    </div>
                </div>
            </div>

            {/* Advanced Navigation Tabs */}
            <div className="flex items-center gap-4 p-2 glass rounded-[2.5rem] w-fit shadow-2xl">
                {[
                    { id: 'needs_approval', label: 'Vetting Area', count: stats.pending, icon: Activity },
                    { id: 'approved', label: 'Verified Listing', count: products.filter(p => p.status === 'APPROVED').length, icon: ShieldCheck },
                    { id: 'rejected', label: 'Policy Void', count: products.filter(p => p.status === 'REJECTED').length, icon: ShieldAlert },
                ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as 'needs_approval' | 'approved' | 'rejected')}
                            className={cn(
                                "flex items-center gap-3 px-10 py-5 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.1em] transition-all",
                                activeTab === tab.id
                                    ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/40 scale-105"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            )}
                        >
                            {tab.label}
                            <span className={cn(
                                "flex items-center justify-center min-w-[24px] h-[24px] rounded-full px-2 text-[9px] font-black",
                                activeTab === tab.id ? "bg-white/20" : "bg-primary/10 text-primary"
                            )}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Performance Grid / Table */}
            <div className="glass-card-strong min-h-[500px] overflow-hidden">
                <table className="w-full text-start border-collapse">
                    <thead>
                        <tr className="border-b border-border/50">
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Entity & Data</th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Intelligence</th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">Compliance</th>
                            <th className="px-10 py-8 text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em] text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        <AnimatePresence mode="popLayout">
                            {filteredProducts.map((product) => (
                                <motion.tr
                                    key={product.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="group hover:bg-primary/5 transition-all cursor-pointer"
                                    onClick={() => setSelectedProduct(product)}
                                >
                                    <td className="px-10 py-10">
                                        <div className="flex items-center gap-6">
                                            <div className="relative group-hover:scale-110 transition-transform duration-500">
                                                <div className="absolute -inset-1 bg-primary blur opacity-20 group-hover:opacity-40 rounded-2xl" />
                                                <img src={product.images[0] || 'https://via.placeholder.com/100'} className="w-20 h-20 rounded-2xl object-cover relative z-10 border-2 border-border" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-lg font-black tracking-tight leading-tight">{product.name}</p>
                                                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                                                    {product.brand} • {product.category}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-10 py-10">
                                        <div className="space-y-1">
                                            <p className="text-xl font-black tracking-tighter">{formatPrice(product.price)}</p>
                                            <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">{product.stock} Units in stock</p>
                                        </div>
                                    </td>
                                    <td className="px-10 py-10">
                                        <div className={cn(
                                            "inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border",
                                            product.status === 'APPROVED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        )}>
                                            <div className={cn("w-2 h-2 rounded-full", product.status === 'APPROVED' ? "bg-emerald-500" : "bg-amber-500")} />
                                            {product.status}
                                        </div>
                                    </td>
                                    <td className="px-10 py-10 text-end">
                                        <button className="w-14 h-14 glass rounded-3xl flex items-center justify-center hover:bg-primary hover:text-white transition-all ms-auto hover:scale-110 active:scale-95 shadow-lg">
                                            <ChevronRight size={24} />
                                        </button>
                                    </td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Floating Bulk Intelligence Bar */}
            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div 
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-12 start-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-8"
                    >
                        <div className="glass-card-strong !bg-foreground !text-background p-6 flex items-center justify-between gap-8 shadow-[0_0_100px_rgba(0,0,0,0.4)] border-white/10">
                            <div className="flex items-center gap-4 ps-4">
                                <div className="bg-primary text-white w-12 h-12 rounded-[1.5rem] flex items-center justify-center font-black text-xl shadow-2xl">
                                    {selectedIds.length}
                                </div>
                                <div>
                                    <p className="font-black text-sm uppercase tracking-widest">Bulk Selection</p>
                                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Protocol Intelligence Active</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button onClick={() => setSelectedIds([])} className="h-14 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-colors">Abort</button>
                                <button className="h-14 px-10 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all">Execute Mass Approval</button>
                                <button className="h-14 px-10 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-red-500 text-white shadow-xl shadow-red-500/20 hover:scale-105 active:scale-95 transition-all">Mass Deletion</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {selectedProduct && (
                    <ProductDetailModal
                        product={selectedProduct}
                        onClose={() => setSelectedProduct(null)}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onDelete={handleDelete}
                        onUpdate={handleUpdate}
                        actionLoading={actionLoading}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// Helper icons needed by the tabs (already imported most but ensuring they align)
const ShieldCheck = (props: React.SVGProps<SVGSVGElement>) => <CheckCircle {...props} />;
const ShieldAlert = (props: React.SVGProps<SVGSVGElement>) => <XCircle {...props} />;
const Activity = (props: React.SVGProps<SVGSVGElement>) => <BarChart3 {...props} />;
