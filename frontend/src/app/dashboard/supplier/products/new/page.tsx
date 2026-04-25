'use client';

import React, { useState, useRef } from 'react';
import { 
    ChevronLeft, Plus, Image as ImageIcon, Sparkles, 
    DollarSign, Package, Save, Rocket, Eye, 
    AlertCircle, ChevronDown, CheckCircle2, MoreHorizontal, 
    Upload, Trash2, Info
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { getCurrencyInfo } from '@/lib/currency';
import { Loader2 } from 'lucide-react';

export default function AddProductWorkspace() {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const { symbol, code: activeCurrency } = getCurrencyInfo();
    const [formData, setFormData] = useState({
        name: '',
        brand: '',
        category: 'Beverages',
        barcode: '',
        sku: '',
        price: '',
        quantity: '',
        minOrder: '',
        unitType: 'Case (24 units)',
        description: '',
        isAdvancedOpen: false,
        images: [] as string[]
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const completionItems = [
        { label: 'Basic Info', done: !!formData.name && !!formData.brand },
        { label: 'Pricing', done: !!formData.price && !!formData.minOrder },
        { label: 'Media', done: formData.images.length > 0 },
        { label: 'Description', done: formData.description.length > 50 }
    ];
    const handleAIDescription = async () => {
        if (!formData.name) return;
        setIsGeneratingAI(true);
        try {
            await new Promise(r => setTimeout(r, 1500));
            const generated = `Professional wholesale ${formData.name} ${formData.brand ? `from ${formData.brand}` : ''}. Optimized for enterprise supply chains, this product maintains strict B2B distribution standards, verified certifications, and consistent logistics parameters for high-volume procurement.`;
            setFormData(prev => ({ ...prev, description: generated }));
        } finally {
            setIsGeneratingAI(false);
        }
    };

    const progress = (completionItems.filter(i => i.done).length / completionItems.length) * 100;

    const handleLaunch = async () => {
        if (!formData.name || !formData.price) {
            alert('Please fill in required fields (Name and Price)');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                name: formData.name,
                brand: formData.brand,
                category: formData.category,
                price: parseFloat(formData.price),
                stock: parseInt(formData.quantity) || 0,
                minOrder: parseInt(formData.minOrder) || 1,
                unit: formData.unitType,
                description: formData.description,
                ean: formData.barcode,
                sku: formData.sku,
                images: formData.images
            };

            const res = await apiFetch('/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                router.push('/dashboard/supplier');
            } else {
                const err = await res.json();
                alert(`Error: ${err.message || 'Failed to create product'}`);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] text-[#111827] font-inter pb-20">
            {/* Top Navigation / Header */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#E5E7EB] px-6 py-4">
                <div className="max-w-[1440px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/supplier" className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#E5E7EB] hover:bg-[#F1F5F9] transition-all">
                            <ChevronLeft size={20} className="text-[#6B7280]" />
                        </Link>
                        <div>
                            <h1 className="text-[24px] font-semibold leading-[32px] tracking-tight">Product Creation Workspace</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-pulse" />
                                <span className="text-[12px] font-medium text-[#6B7280] uppercase tracking-wider">Draft Mode — Auto-saving</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" className="h-10 rounded-[10px] px-6 text-[13px] font-bold border-[#E5E7EB]">
                            <Eye size={16} className="me-2" /> Preview
                        </Button>
                        <Button variant="outline" className="h-10 rounded-[10px] px-6 text-[13px] font-bold border-[#E5E7EB]">
                            <Save size={16} className="me-2" /> Save Draft
                        </Button>
                        <Button 
                            onClick={handleLaunch}
                            disabled={isSaving}
                            className="h-12 rounded-[12px] px-8 text-[13px] font-black bg-[#1E293B] hover:bg-[#0F172A] text-white shadow-lg shadow-navy/20"
                        >
                            {isSaving ? 'Launching...' : <><Rocket size={18} className="me-2" /> Launch Product</>}
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1440px] mx-auto p-6 lg:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* LEFT COLUMN: 60% */}
                    <div className="lg:col-span-7 space-y-6">
                        
                        {/* CARD 1: PRODUCT MEDIA */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <h3 className="text-[16px] font-semibold mb-4">Product Media</h3>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    "relative w-full h-[280px] border-2 border-dashed border-[#E5E7EB] rounded-[12px] flex flex-col items-center justify-center cursor-pointer hover:border-[#14B8A6] hover:bg-[#14B8A6]/5 transition-all group overflow-hidden",
                                    formData.images.length > 0 && "h-auto py-8"
                                )}
                            >
                                <input 
                                    ref={fileInputRef}
                                    type="file" 
                                    multiple 
                                    className="hidden" 
                                    onChange={handleImageUpload}
                                />
                                {formData.images.length === 0 ? (
                                    <div className="text-center">
                                        <div className="w-12 h-12 bg-[#F1F5F9] rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                            <Upload size={24} className="text-[#6B7280] group-hover:text-[#14B8A6]" />
                                        </div>
                                        <p className="text-[14px] font-semibold text-[#111827]">Drag & drop images or upload</p>
                                        <p className="text-[12px] text-[#6B7280] mt-1">High-resolution PNG, JPG up to 10MB</p>
                                    </div>
                                ) : (
                                    <div className="w-full px-4">
                                        <div className="grid grid-cols-3 gap-2">
                                            {formData.images.map((img, i) => (
                                                <div key={i} className="relative aspect-square rounded-[8px] overflow-hidden border border-[#E5E7EB]">
                                                    <img src={img} className="w-full h-full object-cover" />
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setFormData(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }));
                                                        }}
                                                        className="absolute top-1 right-1 w-6 h-6 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                            <div className="aspect-square border-2 border-dashed border-[#E5E7EB] rounded-[8px] flex items-center justify-center text-[#6B7280] hover:border-[#14B8A6] transition-all">
                                                <Plus size={24} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* CARD 2: PRODUCT INFORMATION */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <h3 className="text-[16px] font-semibold mb-4">Product Information</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Product Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Classic Sparkling Water 500ml"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] focus:ring-4 focus:ring-[#14B8A6]/5 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Brand</label>
                                    <input 
                                        type="text" 
                                        placeholder="Brand Name"
                                        value={formData.brand}
                                        onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Category</label>
                                    <select 
                                        value={formData.category}
                                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] appearance-none"
                                    >
                                        <option>Beverages</option>
                                        <option>Snacks</option>
                                        <option>Dairy</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Barcode (EAN)</label>
                                    <input 
                                        type="text" 
                                        placeholder="0000000000000"
                                        value={formData.barcode}
                                        onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">SKU</label>
                                    <input 
                                        type="text" 
                                        placeholder="SKU-000"
                                        value={formData.sku}
                                        onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* CARD 3: PRICING & INVENTORY */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[16px] font-semibold">Pricing & Inventory</h3>
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-100 rounded-lg text-[10px] font-bold text-amber-700">
                                    <Info size={10} /> Product will be listed in {activeCurrency}
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Price</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280] text-[12px] font-black">{symbol}</div>
                                        <input 
                                            type="number" 
                                            placeholder="0.00"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                                            className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] ps-8 pe-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Quantity</label>
                                    <div className="relative">
                                        <Package size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                                        <input 
                                            type="number" 
                                            placeholder="0"
                                            value={formData.quantity}
                                            onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                            className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] ps-8 pe-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Min. Order</label>
                                    <input 
                                        type="number" 
                                        placeholder="1"
                                        value={formData.minOrder}
                                        onChange={e => setFormData({ ...formData, minOrder: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                    />
                                </div>
                                <div className="col-span-3 space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Unit Type</label>
                                    <input 
                                        type="text" 
                                        value={formData.unitType}
                                        onChange={e => setFormData({ ...formData, unitType: e.target.value })}
                                        className="w-full h-[44px] bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* CARD 4: DESCRIPTION */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[16px] font-semibold">Description</h3>
                                <button 
                                    onClick={handleAIDescription}
                                    disabled={isGeneratingAI || !formData.name}
                                    className="h-[36px] px-3 rounded-[8px] bg-[#F59E0B]/10 text-[#F59E0B] text-[12px] font-bold flex items-center gap-1.5 hover:bg-[#F59E0B]/20 transition-all disabled:opacity-50"
                                >
                                    {isGeneratingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} 
                                    Generate Description
                                </button>
                            </div>
                            <textarea 
                                placeholder="Describe the product features, ingredients, and wholesale benefits..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full h-[120px] bg-white border border-[#E5E7EB] rounded-[10px] p-[12px] text-[14px] outline-none focus:border-[#14B8A6] resize-none transition-all"
                            />
                        </div>

                        {/* CARD 5: ADVANCED (COLLAPSIBLE) */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] overflow-hidden shadow-sm">
                            <button 
                                onClick={() => setFormData(prev => ({ ...prev, isAdvancedOpen: !prev.isAdvancedOpen }))}
                                className="w-full h-[48px] px-4 flex items-center justify-between hover:bg-[#F8FAFC] transition-all"
                            >
                                <span className="text-[14px] font-semibold flex items-center gap-2">
                                    <Info size={16} className="text-[#6B7280]" /> Advanced Specifications
                                </span>
                                <ChevronDown size={16} className={cn("text-[#6B7280] transition-transform", formData.isAdvancedOpen && "rotate-180")} />
                            </button>
                            <AnimatePresence>
                                {formData.isAdvancedOpen && (
                                    <motion.div 
                                        initial={{ height: 0 }}
                                        animate={{ height: 'auto' }}
                                        exit={{ height: 0 }}
                                        className="px-4 pb-4 border-t border-[#E5E7EB] pt-4 grid grid-cols-2 gap-4"
                                    >
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-[#6B7280]">Weight per Unit (kg)</label>
                                            <input type="number" className="w-full h-[40px] bg-white border border-[#E5E7EB] rounded-[10px] px-3 text-[13px]" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-medium text-[#6B7280]">Units per Pallet</label>
                                            <input type="number" className="w-full h-[40px] bg-white border border-[#E5E7EB] rounded-[10px] px-3 text-[13px]" />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: 40% */}
                    <div className="lg:col-span-5 space-y-6">
                        
                        {/* CARD 1: PRODUCT SUMMARY */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[14px] font-black uppercase tracking-widest text-[#6B7280]">Live Preview</h3>
                                <div className="h-[20px] px-2.5 rounded-full bg-[#14B8A6]/10 text-[#14B8A6] text-[10px] font-black uppercase tracking-widest flex items-center border border-[#14B8A6]/20">
                                    New
                                </div>
                            </div>
                            <div className="flex items-center gap-4 p-3 bg-[#F8FAFC] rounded-[12px] border border-[#E5E7EB]">
                                <div className="w-16 h-16 bg-white border border-[#E5E7EB] rounded-lg flex items-center justify-center overflow-hidden">
                                    {formData.images[0] ? <img src={formData.images[0]} className="w-full h-full object-contain" /> : <ImageIcon size={20} className="text-[#E5E7EB]" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[16px] font-bold text-[#111827] truncate">{formData.name || 'Product Title'}</p>
                                    <p className="text-[12px] text-[#6B7280] font-medium">{formData.category} • {formData.brand || 'No Brand'}</p>
                                    <p className="text-[14px] font-black text-[#14B8A6] mt-1">{formData.price ? `${activeCurrency} ${formData.price}` : 'Price not set'}</p>
                                </div>
                            </div>
                        </div>

                        {/* CARD 2: COMPLETION PROGRESS */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[14px] font-semibold">Listing Completion</h3>
                                <span className="text-[14px] font-bold text-[#14B8A6]">{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full h-[8px] bg-[#F1F5F9] rounded-full overflow-hidden mb-4">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className="h-full bg-[#14B8A6]"
                                />
                            </div>
                            <div className="space-y-2">
                                {completionItems.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span className="text-[12px] text-[#6B7280] flex items-center gap-2">
                                            {item.done ? <CheckCircle2 size={14} className="text-emerald-500" /> : <div className="w-3.5 h-3.5 rounded-full border border-[#E5E7EB]" />}
                                            {item.label}
                                        </span>
                                        {!item.done && <span className="text-[10px] font-bold text-[#F59E0B] uppercase">Missing</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* CARD 4: ALERTS */}
                        <div className="space-y-2">
                            <div className="h-[40px] px-3 bg-red-50 border border-red-100 rounded-[10px] flex items-center gap-2 text-red-600">
                                <AlertCircle size={16} />
                                <span className="text-[13px] font-medium truncate">Price must be greater than zero</span>
                            </div>
                            <div className="h-[40px] px-3 bg-[#F59E0B]/5 border border-[#F59E0B]/10 rounded-[10px] flex items-center gap-2 text-[#F59E0B]">
                                <Info size={16} />
                                <span className="text-[13px] font-medium truncate">High-quality images increase trust</span>
                            </div>
                        </div>

                        {/* CARD 5: BULK TOOLS */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <h3 className="text-[14px] font-semibold mb-3">Bulk Operations</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <button className="h-[40px] rounded-[10px] border border-[#E5E7EB] text-[12px] font-bold hover:bg-[#F8FAFC] transition-all">
                                    Import via Excel
                                </button>
                                <button className="h-[40px] rounded-[10px] border border-[#E5E7EB] text-[12px] font-bold hover:bg-[#F8FAFC] transition-all">
                                    Scan Barcodes
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
