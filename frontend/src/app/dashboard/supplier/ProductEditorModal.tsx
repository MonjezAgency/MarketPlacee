'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Save, Image as ImageIcon, Sparkles, DollarSign, Package, Plus, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getCurrencyInfo } from '@/lib/currency';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { ProductStatus } from '@/lib/types';
import type { Product } from '@/lib/types';

interface VariantGroup {
    name: string;
    values: string[];
}

interface ProductEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    product?: Product | null;
    onSave: (data: Product) => void;
}

const ALL_CATEGORIES = [
    'Beverages', 'Soft Drinks', 'Energy Drinks', 'Water', 'Juices',
    'Snacks', 'Chips', 'Chocolate', 'Candy', 'Biscuits',
    'Dairy', 'Milk', 'Cheese', 'Yogurt',
    'Personal Care', 'Skincare', 'Haircare', 'Oral Care',
    'Cleaning', 'Household', 'Detergent',
    'Frozen Food', 'Ice Cream', 'Meat', 'Seafood',
    'Bakery', 'Bread', 'Pastries',
    'Tobacco', 'Coffee', 'Tea',
    'Baby Products', 'Pet Food', 'Other'
];

export default function ProductEditorModal({ isOpen, onClose, product, onSave }: ProductEditorModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { symbol } = getCurrencyInfo(false); // Dynamic for Supplier

    const defaultData: Product = {
        id: '',
        name: '', brand: '', price: 0, stock: 0, image: '', images: [],
        category: 'Beverages', description: '', unit: 'Case (24 units)',
        minOrder: 1, ean: '', variants: [], inStock: true,
        status: ProductStatus.PENDING,
        isNew: false, bulkSave: false
    };

    const [formData, setFormData] = useState<Product>(defaultData);
    const [newVariantName, setNewVariantName] = useState('');
    const [newVariantValue, setNewVariantValue] = useState<{ [key: number]: string }>({});

    useEffect(() => {
        if (product) {
            setFormData({
                ...defaultData,
                ...product,
                // Show supplier's original price (basePrice), not the customer-facing marked-up price
                price: product.basePrice ?? product.price,
                variants: product.variants || [],
                images: product.images || [],
            });
        } else {
            setFormData(defaultData);
        }
        setNewVariantName('');
        setNewVariantValue({});
    }, [product, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const img = new globalThis.Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;
                    const maxDim = 800;

                    if (width > height && width > maxDim) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else if (height > maxDim) {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        const compressedDataUrl = canvas.toDataURL('image/webp', 0.8);
                        // Use functional update to avoid stale closure overwriting other fields
                        setFormData((prev: Product) => ({ ...prev, image: compressedDataUrl }));
                    } else {
                        setFormData((prev: Product) => ({ ...prev, image: reader.result as string }));
                    }
                };
                img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const addVariantGroup = () => {
        if (!newVariantName.trim()) return;
        setFormData({
            ...formData,
            variants: [...(formData.variants || []), { name: newVariantName.trim(), values: [] }]
        });
        setNewVariantName('');
    };

    const removeVariantGroup = (index: number) => {
        setFormData({
            ...formData,
            variants: (formData.variants || []).filter((_: any, i: number) => i !== index)
        });
    };

    const addVariantValue = (groupIndex: number) => {
        const value = newVariantValue[groupIndex]?.trim();
        if (!value) return;
        const updated = [...(formData.variants || [])];
        const values = updated[groupIndex].values || [];
        if (!values.includes(value)) {
            updated[groupIndex] = {
                ...updated[groupIndex],
                values: [...values, value]
            };
            setFormData({ ...formData, variants: updated });
        }
        setNewVariantValue({ ...newVariantValue, [groupIndex]: '' });
    };

    const removeVariantValue = (groupIndex: number, valueIndex: number) => {
        const updated = [...(formData.variants || [])];
        const values = updated[groupIndex].values || [];
        updated[groupIndex] = {
            ...updated[groupIndex],
            values: values.filter((_: any, i: number) => i !== valueIndex)
        };
        setFormData({ ...formData, variants: updated });
    };

    if (typeof window === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 w-screen h-screen overflow-hidden">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-background border border-border/50 rounded-[40px] premium-shadow z-10"
                    style={{ scrollbarGutter: 'stable' }}
                >
                    <button
                        onClick={onClose}
                        className="absolute top-8 end-8 w-12 h-12 bg-muted/50 hover:bg-muted rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-all z-50"
                    >
                        <X size={24} />
                    </button>

                    <form onSubmit={handleSubmit} className="p-8 lg:p-12">
                        <div className="mb-10">
                            <h2 className="text-3xl font-heading font-black">{product ? 'Edit Product' : 'Create New Product'}</h2>
                            <p className="text-muted-foreground mt-2">Design and configure your product presentation.</p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">

                            {/* Left Column: Visuals */}
                            <div className="lg:col-span-5 space-y-8">
                                <div className="bg-card rounded-[40px] p-8 border border-border/50 flex flex-col items-center justify-center relative group min-h-[400px] overflow-hidden">
                                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                    {formData.image ? (
                                        <img src={formData.image} alt="Preview" className="max-w-full max-h-[300px] object-contain relative z-10" />
                                    ) : (
                                        <div className="text-muted-foreground flex flex-col items-center gap-4 relative z-10">
                                            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                                                <ImageIcon size={32} />
                                            </div>
                                            <span className="font-bold text-sm uppercase tracking-widest">No Image Selected</span>
                                        </div>
                                    )}

                                    <div className="absolute bottom-6 start-0 end-0 px-6 z-20">
                                        <div className="bg-background/80 backdrop-blur-md rounded-2xl p-2 flex items-center border border-border/50 shadow-xl">
                                            <input
                                                type="text"
                                                placeholder="Paste Image URL here..."
                                                value={formData.image}
                                                onChange={e => setFormData({ ...formData, image: e.target.value })}
                                                className="flex-1 bg-transparent px-4 py-2 outline-none text-sm font-medium min-w-0"
                                            />
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleImageUpload}
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                className="rounded-xl h-10 px-4"
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <Upload size={16} />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-card rounded-[32px] p-6 border border-border/50 space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Sparkles size={14} className="text-primary" /> Display Badges
                                    </h4>
                                    <div className="flex flex-wrap gap-3">
                                        <div className="bg-primary/10 text-primary text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest">
                                            New Arrival
                                        </div>
                                        <div className="bg-highlight/10 text-highlight text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest">
                                            Wholesale Verified
                                        </div>
                                    </div>
                                </div>

                                {/* Live Marketplace Preview */}
                                <div className="bg-card rounded-[32px] p-6 border border-border/50 space-y-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Package size={14} className="text-secondary" /> Customer Preview
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground">How buyers see your product card in the marketplace.</p>
                                    <div className="bg-background rounded-2xl border border-border/50 overflow-hidden shadow-sm">
                                        <div className="aspect-[4/3] bg-muted/30 flex items-center justify-center overflow-hidden">
                                            {formData.image ? (
                                                <img src={formData.image} alt="Preview" className="w-full h-full object-contain p-4" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                                                    <ImageIcon size={32} />
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">No Image</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 space-y-2">
                                            {formData.brand && (
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{formData.brand}</p>
                                            )}
                                            <p className="font-black text-sm leading-tight line-clamp-2">
                                                {formData.name || <span className="text-muted-foreground/40 font-normal italic">Product name...</span>}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">{formData.category}</p>
                                            <div className="flex items-center justify-between pt-1">
                                                <div>
                                                    <p className="font-black text-base text-primary">
                                                        {symbol}{formData.price > 0 ? formData.price.toFixed(2) : '—'}
                                                    </p>
                                                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest">your price</p>
                                                </div>
                                                {formData.minOrder > 0 && (
                                                    <div className="bg-secondary/10 text-secondary text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest">
                                                        MOQ {formData.minOrder}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-muted-foreground/60 text-center">* Marketplace price may include platform markup</p>
                                </div>
                            </div>

                            {/* Right Column: Details */}
                            <div className="lg:col-span-7 space-y-8">

                                {/* Basic Info */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Brand Name</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Coca Cola"
                                                value={formData.brand}
                                                onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                                className="w-full bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-bold transition-all"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Category</label>
                                            <select
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                className="w-full bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-bold transition-all appearance-none"
                                            >
                                                {ALL_CATEGORIES.map(cat => (
                                                    <option key={cat} value={cat} className="text-black bg-white dark:text-white dark:bg-gray-900">{cat}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Product Name</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Classic Cola 330ml Can (24 Pack)"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-black text-2xl transition-all"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">EAN / Barcode</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 5449000000996"
                                            value={formData.ean}
                                            onChange={e => setFormData({ ...formData, ean: e.target.value })}
                                            className="w-full bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-bold transition-all"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Sales Description</label>
                                        <textarea
                                            placeholder="Highlight key selling points..."
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full h-32 bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-medium resize-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Pricing & Inventory */}
                                <div className="p-8 bg-card rounded-[32px] border border-border/50 space-y-8">
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="space-y-2 relative">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Unit Price / Case ({symbol})</label>
                                            <div className="relative">
                                                <div className="absolute start-5 top-1/2 -translate-y-1/2 text-primary w-5 h-5 flex items-center justify-center font-bold">{symbol}</div>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    required
                                                    value={formData.price || ''}
                                                    onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                                    className="w-full bg-background border border-border/50 rounded-2xl ps-12 pe-6 py-4 outline-none focus:border-primary/50 text-foreground font-black text-2xl transition-all"
                                                />
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-2 ms-2 italic">Note: A 5% platform margin is automatically added.</p>
                                        </div>
                                        <div className="space-y-2 relative">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Available Stock (Units)</label>
                                            <div className="relative">
                                                <Package className="absolute start-5 top-1/2 -translate-y-1/2 text-accent w-5 h-5" />
                                                <input
                                                    type="number"
                                                    required
                                                    value={formData.stock || ''}
                                                    onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                                                    className="w-full bg-background border border-border/50 rounded-2xl ps-14 pe-6 py-4 outline-none focus:border-primary/50 text-foreground font-black text-2xl transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 pt-4 border-t border-border/50">
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Unit Metric</label>
                                            <input
                                                type="text"
                                                value={formData.unit}
                                                onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-bold"
                                            />
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Min. Order</label>
                                            <input
                                                type="number"
                                                value={formData.minOrder || ''}
                                                onChange={e => setFormData({ ...formData, minOrder: parseInt(e.target.value) || 1 })}
                                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 outline-none focus:border-primary/50 text-sm font-bold"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Variants Section (Shopify-like) */}
                                <div className="p-8 bg-card rounded-[32px] border border-border/50 space-y-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Package size={14} className="text-primary" /> Product Variants
                                    </h4>
                                    <p className="text-xs text-muted-foreground -mt-4">Add options like Size, Color, Material, Flavor, etc.</p>

                                    {/* Existing Variant Groups */}
                                    {(formData.variants || []).map((group: any, gi: number) => (
                                        <div key={gi} className="p-4 bg-background rounded-2xl border border-border/50 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-black text-foreground uppercase tracking-wider">{group.name}</span>
                                                <button type="button" onClick={() => removeVariantGroup(gi)} className="text-destructive hover:bg-destructive/10 rounded-lg p-1 transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {group.values.map((val: string, vi: number) => (
                                                    <span key={vi} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full">
                                                        {val}
                                                        <button type="button" onClick={() => removeVariantValue(gi, vi)} className="hover:text-destructive transition-colors">
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder={`Add ${group.name} value...`}
                                                    value={newVariantValue[gi] || ''}
                                                    onChange={e => setNewVariantValue({ ...newVariantValue, [gi]: e.target.value })}
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariantValue(gi); } }}
                                                    className="flex-1 bg-card border border-border/50 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary/50"
                                                />
                                                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => addVariantValue(gi)}>
                                                    <Plus size={14} />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Add New Variant Group */}
                                    <div className="flex gap-2 pt-2 border-t border-border/50">
                                        <input
                                            type="text"
                                            placeholder="New option name (e.g. Size, Color, Flavor...)"
                                            value={newVariantName}
                                            onChange={e => setNewVariantName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariantGroup(); } }}
                                            className="flex-1 bg-background border border-border/50 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary/50"
                                        />
                                        <Button type="button" variant="outline" className="rounded-xl gap-2" onClick={addVariantGroup}>
                                            <Plus size={16} /> Add Option
                                        </Button>
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <Button type="submit" size="xl" className="w-full rounded-2xl font-black text-lg gap-3">
                                        <Save size={24} />
                                        {product ? 'Save Changes' : 'Publish Product to Atlantis'}
                                    </Button>
                                </div>
                            </div>

                        </div>
                    </form>
                </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
