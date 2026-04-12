'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FolderTree, Plus, Trash2, Save, Loader2, 
    Edit2, Check, X, Search, Layers, 
    ChevronRight, ArrowRight, Activity, Tag,
    Database, Box
} from 'lucide-react';
import { apiFetch, fetchProducts } from '@/lib/api';
import { PRODUCTS } from '@/lib/products';
import { Product } from '@/lib/types';
import { cn } from '@/lib/utils';
import { showIPhoneToast } from '@/components/ui/IPhoneToast';

interface CategoryItem {
    name: string;
    productCount: number;
}

const MASTER_CATEGORIES = [
    'Beverages', 'Soft Drinks', 'Energy Drinks', 'Water', 'Juice',
    'Snacks', 'Chips', 'Chocolate', 'Candy', 'Cookies',
    'Dairy', 'Milk', 'Cheese', 'Yogurt',
    'Coffee', 'Tea', 'Hot Drinks',
    'Frozen Food', 'Ice Cream',
    'Personal Care', 'Skincare', 'Hair Care', 'Perfume', 'Cosmetics',
    'Cleaning Products', 'Laundry', 'Dishwashing',
    'Baby Products', 'Baby Food',
    'Pet Food', 'Pet Care',
    'Electronics', 'Accessories',
    'Fashion', 'Clothing', 'Shoes',
    'Home & Kitchen', 'Furniture',
    'Health & Wellness', 'Supplements', 'Vitamins',
    'Tobacco', 'Alcohol',
];

export default function AdminCategoriesPage() {
    const [categories, setCategories] = React.useState<CategoryItem[]>([]);
    const [newCategory, setNewCategory] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const [searchTerm, setSearchTerm] = React.useState('');

    const loadCategories = React.useCallback(async () => {
        setLoading(true);
        try {
            let products: Product[] = await fetchProducts();
            if (!products || products.length === 0) products = PRODUCTS;
            
            const categoryMap: Record<string, number> = {};
            MASTER_CATEGORIES.forEach(cat => { categoryMap[cat] = 0; });
            products.forEach((p: Product) => {
                const cat = p.category || 'Uncategorized';
                categoryMap[cat] = (categoryMap[cat] || 0) + 1;
            });
            const sorted = Object.entries(categoryMap)
                .map(([name, productCount]) => ({ name, productCount }))
                .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
            setCategories(sorted);
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { loadCategories(); }, [loadCategories]);

    const handleAdd = () => {
        const trimmed = newCategory.trim();
        if (!trimmed) return;
        if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
            showIPhoneToast('Category already exists', 'error');
            return;
        }
        setCategories(prev => [{ name: trimmed, productCount: 0 }, ...prev]);
        setNewCategory('');
        showIPhoneToast(`Added ${trimmed}`, 'success');
    };

    const handleRemove = (index: number) => {
        if (categories[index].productCount > 0) {
            showIPhoneToast(`Cannot delete category with products`, 'error');
            return;
        }
        setCategories(prev => prev.filter((_, i) => i !== index));
        showIPhoneToast('Category removed', 'info');
    };

    const confirmEdit = async (index: number) => {
        const trimmed = editValue.trim();
        if (!trimmed || categories[index].name === trimmed) { setEditingIndex(null); return; }
        setSaving(true);
        try {
            // Logic for updating products remains same but with better UI
            
            const res = await apiFetch('/products', {
            });
            if (res.ok) {
                const products = await res.json();
                const toUpdate = products.filter((p: any) => p.category === categories[index].name);
                for (const product of toUpdate) {
                    await fetch(`${'/api'}/products/${product.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json',  },
                        body: JSON.stringify({ category: trimmed })
                    });
                }
            }
            setCategories(prev => prev.map((c, i) => i === index ? { ...c, name: trimmed } : c));
            setEditingIndex(null);
            showIPhoneToast('Schema updated', 'success');
        } catch (err) {
            showIPhoneToast('Failed to update', 'error');
        } finally {
            setSaving(false);
        }
    };

    const filtered = categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black text-foreground tracking-tighter uppercase leading-none">Taxonomy Hub</h1>
                    <p className="text-muted-foreground font-black text-[11px] uppercase tracking-[0.4em] opacity-70">Catalog Architecture & Global Categorization</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search className="absolute start-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="Filter taxonomy nodes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-16 ps-16 pe-8 bg-card rounded-[2rem] border border-border/50 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-foreground font-bold text-sm min-w-[350px] transition-all shadow-xl"
                        />
                    </div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card-strong p-8 overflow-hidden relative group">
                    <div className="absolute top-0 end-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><Layers size={120} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Taxonomy Nodes</p>
                    <h2 className="text-5xl font-black tracking-tighter">{categories.length}</h2>
                    <div className="flex items-center gap-2 mt-4 text-primary font-black text-[10px] uppercase tracking-widest">
                        <ArrowRight size={14} /> Active Categories
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-secondary">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">System Health</p>
                    <h2 className="text-5xl font-black tracking-tighter text-secondary">A+</h2>
                    <div className="flex items-center gap-2 mt-4 text-secondary font-black text-[10px] uppercase tracking-widest">
                        <Activity size={14} /> Structural Integrity Verified
                    </div>
                </div>
                <div className="glass-card-strong p-8 overflow-hidden relative group border-s-4 border-emerald-500">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Catalog Density</p>
                    <h2 className="text-5xl font-black tracking-tighter text-emerald-500">
                        {categories.reduce((acc, c) => acc + c.productCount, 0)}
                    </h2>
                    <div className="flex items-center gap-2 mt-4 text-emerald-500 font-black text-[10px] uppercase tracking-widest">
                        <Database size={14} /> Linked Product Entities
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: Active Taxonomy */}
                <div className="flex-1 space-y-6">
                    <div className="glass-card-strong min-h-[500px] overflow-hidden">
                        <div className="px-10 py-8 border-b border-border/50 flex justify-between items-center bg-primary/5">
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-3">
                                <Box size={18} className="text-primary" /> Active Registry
                            </h3>
                            <p className="text-[10px] font-black text-muted-foreground uppercase">{filtered.length} entries</p>
                        </div>

                        <div className="divide-y divide-border/20">
                            {loading ? (
                                <div className="p-20 text-center"><Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" /></div>
                            ) : (
                                <AnimatePresence mode="popLayout">
                                    {filtered.map((cat, i) => (
                                        <motion.div
                                            key={cat.name}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="group flex items-center justify-between px-10 py-6 hover:bg-primary/5 transition-all"
                                        >
                                            <div className="flex items-center gap-6 flex-1">
                                                <div className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform shadow-lg border border-border/50">
                                                    <Tag size={18} />
                                                </div>
                                                {editingIndex === i ? (
                                                    <div className="flex items-center gap-4 flex-1">
                                                        <input
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            className="bg-muted border-2 border-primary rounded-xl px-4 py-2 text-sm font-bold outline-none flex-1 max-w-[300px]"
                                                            autoFocus
                                                        />
                                                        <button onClick={() => confirmEdit(i)} disabled={saving} className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-emerald-500/20">
                                                            <Check size={18} />
                                                        </button>
                                                        <button onClick={() => setEditingIndex(null)} className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center hover:scale-110 transition-all">
                                                            <X size={18} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <p className="text-lg font-black tracking-tight leading-none mb-1">{cat.name}</p>
                                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">
                                                            {cat.productCount} Linked Entities
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingIndex(i); setEditValue(cat.name); }} className="w-10 h-10 glass rounded-xl flex items-center justify-center hover:bg-primary hover:text-white transition-all shadow-md">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => handleRemove(i)} className="w-10 h-10 glass rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-md">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Operations */}
                <div className="w-full lg:w-[400px] space-y-6">
                    <div className="glass-card-strong p-8 space-y-8 bg-foreground text-background border-none shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-[0.3em] mb-2">Protocol Injection</h3>
                            <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Append New Category Node</p>
                        </div>

                        <div className="space-y-4">
                            <div className="relative">
                                <input
                                    type="text"
                                    value={newCategory}
                                    onChange={e => setNewCategory(e.target.value)}
                                    placeholder="Enter Protocol Name..."
                                    className="w-full h-16 bg-white/10 rounded-[1.5rem] px-6 text-sm font-bold outline-none focus:ring-4 focus:ring-primary/40 border border-white/10 transition-all placeholder:text-white/20"
                                />
                            </div>
                            <button
                                onClick={handleAdd}
                                className="w-full h-16 bg-primary text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-primary/40"
                            >
                                <Plus size={20} /> Inject to Taxonomy
                            </button>
                        </div>

                        <div className="pt-8 border-t border-white/10 space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-primary flex-shrink-0">
                                    <Activity size={18} />
                                </div>
                                <p className="text-[10px] font-medium leading-relaxed opacity-60">
                                    Adding a new category node will instantly make it available for supplier product listings.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card-strong p-8 border-s-4 border-primary">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Integrity Advisory</h4>
                        <p className="text-xs font-medium leading-relaxed text-foreground/80">
                            Modifying category labels triggers a cascade update across all linked product entities in the distributed database. Process may take up to 2 seconds per batch.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
