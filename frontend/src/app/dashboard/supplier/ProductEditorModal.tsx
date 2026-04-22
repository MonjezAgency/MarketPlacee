'use client';

import React, { useState, useEffect, useRef } from 'react';
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


interface ModalPortalContentProps {
    isOpen: boolean;
    onClose: () => void;
    formData: Product;
    setFormData: (data: any) => void;
    handleSubmit: (e: React.FormEvent) => void;
    symbol: string;
    removeImage: (index: number) => void;
    addImageUrl: (url: string) => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    eanLimit: number;
    setEanLimit: (val: number) => void;
    isFetchingEan: boolean;
    fetchEanImages: () => void;
    newVariantName: string;
    setNewVariantName: (val: string) => void;
    addVariantGroup: () => void;
    removeVariantGroup: (index: number) => void;
    newVariantValue: { [key: number]: string };
    setNewVariantValue: (val: any) => void;
    addVariantValue: (index: number) => void;
    removeVariantValue: (gi: number, vi: number) => void;
    product: Product | null | undefined;
}

function ModalPortalContent({
    isOpen, onClose, formData, setFormData, handleSubmit, symbol,
    removeImage, addImageUrl, fileInputRef, handleImageUpload,
    eanLimit, setEanLimit, isFetchingEan, fetchEanImages,
    newVariantName, setNewVariantName, addVariantGroup, removeVariantGroup,
    newVariantValue, setNewVariantValue, addVariantValue, removeVariantValue,
    product
}: ModalPortalContentProps) {
    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 w-screen h-screen overflow-hidden">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-background border border-border/50 rounded-[40px] premium-shadow z-10 overflow-hidden"
                    >
                        {/* Sticky Header */}
                        <div className="shrink-0 px-8 py-6 border-b border-border/50 flex items-center justify-between bg-background/80 backdrop-blur-md z-30">
                            <div>
                                <h2 className="text-2xl font-black text-foreground tracking-tight">{product ? 'Edit Product' : 'Create New Product'}</h2>
                                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">Design and configure your product presentation</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-12 h-12 bg-muted/50 hover:bg-muted rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-12">
                            <form id="product-editor-form" onSubmit={handleSubmit}>
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">

                                    {/* Left Column: Visuals */}
                                    <div className="lg:col-span-4 space-y-10">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Product Gallery</label>
                                            <div className="w-full bg-muted/20 border border-border/50 rounded-3xl p-6 space-y-6">
                                                <div className="grid grid-cols-2 gap-4">
                                                    {(formData.images || []).map((img, idx) => (
                                                        <div key={idx} className="relative group/img aspect-square bg-white rounded-2xl border border-border/50 overflow-hidden shadow-sm">
                                                            <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-contain p-2" />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeImage(idx)}
                                                                className="absolute top-2 end-2 w-8 h-8 bg-destructive/10 hover:bg-destructive text-destructive hover:text-white rounded-full flex items-center justify-center backdrop-blur-md opacity-0 group-hover/img:opacity-100 transition-all shadow-lg"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                            {idx === 0 && (
                                                                <div className="absolute bottom-2 start-2 bg-primary text-white text-[8px] font-black uppercase px-2 py-1 rounded-full shadow-lg">Main</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <button 
                                                        type="button"
                                                        onClick={() => fileInputRef.current?.click()}
                                                        className="aspect-square bg-muted/30 border-2 border-dashed border-border/50 rounded-2xl flex flex-col items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-all group"
                                                    >
                                                        <Plus size={24} className="group-hover:scale-110 transition-transform" />
                                                        <span className="text-[9px] font-black uppercase tracking-widest mt-2">{formData.images?.length ? 'Add More' : 'Upload'}</span>
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2 bg-background border border-border/50 rounded-xl p-1 shadow-inner focus-within:ring-2 ring-primary/10 transition-all">
                                                    <input
                                                        type="text"
                                                        placeholder="Paste image URL..."
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                addImageUrl((e.target as HTMLInputElement).value);
                                                                (e.target as HTMLInputElement).value = '';
                                                            }
                                                        }}
                                                        className="flex-1 bg-transparent px-3 py-2 outline-none text-xs font-bold"
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="secondary"
                                                        className="rounded-lg h-8 px-3"
                                                        onClick={() => fileInputRef.current?.click()}
                                                    >
                                                        <Upload size={14} />
                                                    </Button>
                                                </div>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    className="hidden"
                                                    onChange={handleImageUpload}
                                                />
                                            </div>
                                        </div>

                                        <div className="bg-card rounded-[32px] p-6 border border-border/50 space-y-4">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                                <Sparkles size={14} className="text-primary" /> Display Settings
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                <div className="bg-primary/10 text-primary text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest border border-primary/20">
                                                    New Arrival
                                                </div>
                                                <div className="bg-emerald-500/10 text-emerald-500 text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest border border-emerald-500/20">
                                                    Wholesale Verified
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-card rounded-[32px] p-6 border border-border/50 space-y-4 opacity-80 group hover:opacity-100 transition-opacity">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                                    <Package size={14} className="text-secondary" /> Customer Preview
                                                </h4>
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            </div>
                                            <div className="bg-background rounded-2xl border border-border shadow-sm group-hover:shadow-lg transition-all">
                                                <div className="aspect-[4/3] bg-muted/10 flex items-center justify-center">
                                                    {(formData.images || [])[0] ? (
                                                        <img src={formData.images?.[0]} alt="Preview" className="w-full h-full object-contain p-4" />
                                                    ) : (
                                                        <ImageIcon size={32} className="text-muted-foreground/20" />
                                                    )}
                                                </div>
                                                <div className="p-4 space-y-2">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-primary">{formData.brand || 'Your Brand'}</p>
                                                    <p className="font-black text-xs leading-tight line-clamp-1">{formData.name || 'Product Name...'}</p>
                                                    <div className="flex items-center justify-between pt-2">
                                                        <p className="font-black text-sm text-foreground">{symbol}{formData.price > 0 ? formData.price.toFixed(2) : '0.00'}</p>
                                                        <div className="h-4 px-1.5 bg-secondary/10 text-secondary text-[8px] font-black rounded uppercase flex items-center">MOQ {formData.minOrder || 1}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Configuration */}
                                    <div className="lg:col-span-8 space-y-10">
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Brand</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="e.g. Coca Cola"
                                                        value={formData.brand}
                                                        onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                                        className="w-full bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-bold transition-all"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Category</label>
                                                    <select
                                                        value={formData.category}
                                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                        className="w-full bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-bold transition-all appearance-none"
                                                    >
                                                        {ALL_CATEGORIES.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Full Public Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="e.g. Classic Cola 330ml Can (24 Pack)"
                                                    value={formData.name}
                                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                    className="w-full bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-black text-2xl transition-all"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">EAN / UPC / Barcode</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. 5449000000996"
                                                        value={formData.ean}
                                                        onChange={e => setFormData({ ...formData, ean: e.target.value })}
                                                        className="w-full bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-bold transition-all"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Image Auto-Match</label>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            type="button"
                                                            disabled={!formData.ean || isFetchingEan}
                                                            onClick={fetchEanImages}
                                                            className="h-14 rounded-2xl px-6 flex-1 gap-2 font-black uppercase tracking-widest shadow-lg shadow-primary/10"
                                                        >
                                                            {isFetchingEan ? (
                                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                            ) : (
                                                                <><Sparkles size={16} /> Fetch {eanLimit} Images</>
                                                            )}
                                                        </Button>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="10"
                                                            value={eanLimit}
                                                            onChange={e => setEanLimit(parseInt(e.target.value) || 1)}
                                                            className="w-20 bg-card border border-border/50 rounded-2xl px-2 py-4 outline-none focus:border-primary/50 text-foreground font-black text-center"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Description / Highlights</label>
                                                <textarea
                                                    placeholder="Focus on case size, expiration date, or origin..."
                                                    value={formData.description}
                                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                    className="w-full h-32 bg-card border border-border/50 rounded-2xl px-6 py-4 outline-none focus:border-primary/50 text-foreground font-medium resize-none transition-all"
                                                />
                                            </div>

                                            <div className="p-8 bg-muted/30 rounded-[32px] border border-border/50 space-y-8">
                                                <div className="grid grid-cols-2 gap-8">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Price Per Case ({symbol})</label>
                                                        <div className="relative">
                                                            <DollarSign className="absolute start-5 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                required
                                                                value={formData.price || ''}
                                                                onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                                                className="w-full bg-background border border-border/50 rounded-2xl ps-12 pe-6 py-4 outline-none focus:border-primary/50 text-foreground font-black text-2xl transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Stock Level (Cases)</label>
                                                        <div className="relative">
                                                            <Package className="absolute start-5 top-1/2 -translate-y-1/2 text-secondary w-5 h-5" />
                                                            <input
                                                                type="number"
                                                                required
                                                                value={formData.stock || ''}
                                                                onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                                                                className="w-full bg-background border border-border/50 rounded-2xl ps-12 pe-6 py-4 outline-none focus:border-primary/50 text-foreground font-black text-2xl transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Metric Type</label>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g. Case of 24"
                                                            value={formData.unit}
                                                            onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                                            className="w-full h-12 bg-background border border-border/50 rounded-xl px-4 outline-none focus:border-primary/50 text-sm font-bold"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ms-2">Minimum Order</label>
                                                        <input
                                                            type="number"
                                                            placeholder="min cases"
                                                            value={formData.minOrder || ''}
                                                            onChange={e => setFormData({ ...formData, minOrder: parseInt(e.target.value) || 1 })}
                                                            className="w-full h-12 bg-background border border-border/50 rounded-xl px-4 outline-none focus:border-primary/50 text-sm font-bold"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-card rounded-[32px] p-8 border border-border/50 space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                                        <Sparkles size={14} className="text-primary" /> Product Variants
                                                    </h4>
                                                </div>

                                                <div className="space-y-4">
                                                    {(formData.variants || []).map((group: any, gi: number) => (
                                                        <div key={gi} className="p-4 bg-muted/30 rounded-2xl border border-border/50 space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-black text-foreground uppercase tracking-widest">{group.name}</span>
                                                                <button type="button" onClick={() => removeVariantGroup(gi)} className="w-8 h-8 flex items-center justify-center bg-destructive/10 text-destructive rounded-lg hover:bg-destructive hover:text-white transition-all">
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {group.values.map((val: string, vi: number) => (
                                                                    <span key={vi} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-[10px] font-black px-3 py-1.5 rounded-full border border-primary/20 bg-background shadow-sm">
                                                                        {val}
                                                                        <button type="button" onClick={() => removeVariantValue(gi, vi)} className="hover:text-destructive">
                                                                            <X size={12} />
                                                                        </button>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder={`Add ${group.name}...`}
                                                                    value={newVariantValue[gi] || ''}
                                                                    onChange={e => setNewVariantValue({ ...newVariantValue, [gi]: e.target.value })}
                                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariantValue(gi); } }}
                                                                    className="flex-1 bg-background border border-border/50 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-primary/50"
                                                                />
                                                                <Button type="button" size="sm" variant="outline" className="rounded-xl h-10 w-10 p-0" onClick={() => addVariantValue(gi)}>
                                                                    <Plus size={14} />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="flex gap-2 p-2 bg-muted/20 rounded-2xl border border-border/50">
                                                    <input
                                                        type="text"
                                                        placeholder="Option name (e.g. Size, Flavor...)"
                                                        value={newVariantName}
                                                        onChange={e => setNewVariantName(e.target.value)}
                                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariantGroup(); } }}
                                                        className="flex-1 bg-transparent px-4 py-2 text-xs font-bold outline-none"
                                                    />
                                                    <Button type="button" variant="outline" size="sm" className="rounded-xl font-black uppercase text-[10px]" onClick={addVariantGroup}>
                                                        <Plus size={14} /> Add Option
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Sticky Footer */}
                        <div className="shrink-0 px-8 py-6 border-t border-border/50 flex items-center justify-end bg-background/80 backdrop-blur-md z-30">
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-8 h-14 rounded-2xl font-black text-xs uppercase tracking-widest text-muted-foreground hover:bg-muted transition-all"
                                >
                                    Discard Changes
                                </button>
                                <Button 
                                    form="product-editor-form"
                                    type="submit" 
                                    size="xl" 
                                    className="rounded-2xl px-12 font-black text-sm uppercase tracking-widest gap-3 shadow-xl shadow-primary/20"
                                >
                                    <Save size={20} />
                                    {product ? 'Update Product' : 'List on Atlantis'}
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

    );
}

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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const processFile = (file: File): Promise<string> => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const img = new globalThis.Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let { width, height } = img;
                        const maxDim = 1000; // Increased quality

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
                            resolve(canvas.toDataURL('image/webp', 0.8));
                        } else {
                            resolve(reader.result as string);
                        }
                    };
                    img.onerror = () => reject(new Error('Image load failed'));
                    img.src = reader.result as string;
                };
                reader.readAsDataURL(file);
            });
        };

        try {
            const results = await Promise.all(files.map(processFile));
            setFormData((prev: Product) => {
                const existing = prev.images || [];
                const newOnes = results.filter(r => !existing.includes(r));
                const combined = [...existing, ...newOnes];
                return { ...prev, images: combined, image: combined[0] };
            });
        } catch (err) {
            console.error('Image upload failed:', err);
        }
    };

    const [isFetchingEan, setIsFetchingEan] = useState(false);
    const [eanLimit, setEanLimit] = useState(3);

    const fetchEanImages = async () => {
        if (!formData.ean || isFetchingEan) return;
        setIsFetchingEan(true);
        try {
            const { fetchImagesByEan } = await import('@/lib/api');
            const images = await fetchImagesByEan(formData.ean, eanLimit);
            if (images.length > 0) {
                setFormData(prev => {
                    const existing = prev.images || [];
                    const combined = [...existing];
                    images.forEach(img => {
                        if (!combined.includes(img)) combined.push(img);
                    });
                    return { ...prev, images: combined, image: combined[0] };
                });
            }
        } catch (err) {
            console.error("EAN fetch failed:", err);
        } finally {
            setIsFetchingEan(false);
        }
    };

    const removeImage = (index: number) => {
        const newImages = (formData.images || []).filter((_, i) => i !== index);
        setFormData({ ...formData, images: newImages, image: newImages[0] || '' });
    };

    const addImageUrl = (url: string) => {
        if (!url.trim()) return;
        setFormData(prev => {
            const newImages = [...(prev.images || [])];
            if (!newImages.includes(url)) newImages.push(url);
            return { ...prev, images: newImages, image: newImages[0] };
        });
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
        <ModalPortalContent
            isOpen={isOpen}
            onClose={onClose}
            formData={formData}
            setFormData={setFormData}
            handleSubmit={handleSubmit}
            symbol={symbol}
            removeImage={removeImage}
            addImageUrl={addImageUrl}
            fileInputRef={fileInputRef}
            handleImageUpload={handleImageUpload}
            eanLimit={eanLimit}
            setEanLimit={setEanLimit}
            isFetchingEan={isFetchingEan}
            fetchEanImages={fetchEanImages}
            newVariantName={newVariantName}
            setNewVariantName={setNewVariantName}
            addVariantGroup={addVariantGroup}
            removeVariantGroup={removeVariantGroup}
            newVariantValue={newVariantValue}
            setNewVariantValue={setNewVariantValue}
            addVariantValue={addVariantValue}
            removeVariantValue={removeVariantValue}
            product={product}
        />,
        document.body
    );
}
