'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
    ChevronLeft, Plus, Image as ImageIcon, Sparkles, 
    DollarSign, Package, Save, Rocket, Eye, 
    AlertCircle, ChevronDown, CheckCircle2, MoreHorizontal, 
    Upload, Trash2, Info, Search, Store, Shield,
    FileSpreadsheet, ShieldCheck, Database
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { getCurrencyInfo, SUPPORTED_CURRENCIES, convertToBase } from '@/lib/currency';
import { Loader2 } from 'lucide-react';
import { CATEGORIES_LIST } from '@/lib/products';

export default function AdminAddProductWorkspace() {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCurrency, setActiveCurrencyState] = useState(() => {
        // Read from localStorage first (admin settings), then fallback to detection
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('platform-currency');
            if (saved) return saved;
        }
        return getCurrencyInfo().code;
    });
    const selectedCurrencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === activeCurrency) || SUPPORTED_CURRENCIES[0];

    // Sync currency when admin changes it in settings
    useEffect(() => {
        const handleCurrencyChange = () => {
            const saved = localStorage.getItem('platform-currency');
            if (saved) setActiveCurrencyState(saved);
        };
        window.addEventListener('currency-changed', handleCurrencyChange);
        window.addEventListener('storage', handleCurrencyChange);
        return () => {
            window.removeEventListener('currency-changed', handleCurrencyChange);
            window.removeEventListener('storage', handleCurrencyChange);
        };
    }, []);
    
    const [formData, setFormData] = useState({
        name: '',
        brand: '',
        category: 'Beverages',
        barcode: '',
        price: '',
        quantity: '',
        minOrder: '1',
        unitType: 'Piece',
        unitsPerPallet: '',
        palletsPerShipment: '',
        description: '',
        supplierId: '',
        isAdvancedOpen: false,
        images: [] as string[],
        // Logistics & Documentation Fields
        weight: '',
        shelfLife: '',
        origin: '',
        storageTemp: 'Ambient',
        docs: {
            coo: false, // Certificate of Origin
            health: false, // Health Certificate
            analysis: false, // Certificate of Analysis
            compliance: false, // Enterprise Compliance
        }
    });

    const [activeTab, setActiveTab] = useState<'manual' | 'bulk'>('manual');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const bulkInputRef = useRef<HTMLInputElement>(null);

    // Fetch suppliers for the admin to choose from
    useEffect(() => {
        const fetchSuppliers = async () => {
            try {
                const res = await apiFetch('/users?role=SUPPLIER');
                if (res.ok) {
                    const data = await res.json();
                    const suppliersList = Array.isArray(data) ? data : (data.users || []);
                    setSuppliers(suppliersList);
                    
                    // Auto-select if only one supplier exists (e.g. the admin's own team)
                    if (suppliersList.length === 1) {
                        setFormData(prev => ({ ...prev, supplierId: suppliersList[0].id }));
                    }
                }
            } catch (err) {
                console.error('Failed to fetch suppliers', err);
            }
        };
        fetchSuppliers();
    }, []);

    const handleAIDescription = async () => {
        if (!formData.name) return;
        setIsGeneratingAI(true);
        try {
            await new Promise(r => setTimeout(r, 1500));
            const existingDesc = formData.description?.trim() || '';
            const brandStr = formData.brand ? ` by ${formData.brand}` : '';
            const categoryStr = formData.category ? ` in the ${formData.category} category` : '';
            
            let generated: string;
            if (existingDesc.length > 10) {
                // Enhance existing description
                generated = `${existingDesc}\n\n${formData.name}${brandStr}${categoryStr} — professionally sourced and optimized for B2B wholesale distribution. Features verified quality documentation, standardized export-ready packaging, and full compliance with international food & safety regulations. Ideal for high-volume retailers and enterprise supply chains seeking consistent quality with reliable lead times.`;
            } else {
                // Generate from scratch
                generated = `${formData.name}${brandStr}${categoryStr} — a premium-grade product natively optimized for B2B procurement and wholesale distribution. Featuring verified documentation, standardized packaging for international export, and strict compliance with food & safety regulations. Designed for high-volume retailers and enterprise supply chains looking for consistent quality and reliable lead times across global markets.`;
            }
            setFormData(prev => ({ ...prev, description: generated }));
        } finally {
            setIsGeneratingAI(false);
        }
    };

    const categories = CATEGORIES_LIST;


    const completionItems = [
        { label: 'Basic Info', done: !!formData.name && !!formData.brand },
        { label: 'Pricing & Supply', done: !!formData.price && !!formData.supplierId },
        { label: 'Media', done: formData.images.length > 0 },
        { label: 'Description', done: formData.description.length > 20 }
    ];
    const progress = (completionItems.filter(i => i.done).length / completionItems.length) * 100;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            try {
                const fd = new FormData();
                fd.append('file', file);
                const res = await apiFetch('/products/upload-image', {
                    method: 'POST',
                    body: fd,
                });
                if (res.ok) {
                    const data = await res.json();
                    setFormData(prev => ({ ...prev, images: [...prev.images, data.url] }));
                }
            } catch (err) {
                console.error('Upload failed', err);
            }
        }
    };

    const [bulkReport, setBulkReport] = useState<any>(null);
    const [isBulkUploading, setIsBulkUploading] = useState(false);

    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsBulkUploading(true);
        setBulkReport(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('currency', activeCurrency);
            const res = await apiFetch('/products/bulk-upload', {
                method: 'POST',
                body: fd,
            });
            const report = await res.json();
            setBulkReport(report);
            if (report.createdCount > 0) {
                import('react-hot-toast').then(({ toast }) => {
                    toast.success(`${report.createdCount} products created successfully`);
                });
            }
            if (report.errorCount > 0) {
                import('react-hot-toast').then(({ toast }) => {
                    toast.error(`${report.errorCount} rows had errors — see report below`);
                });
            }
        } catch (err: any) {
            import('react-hot-toast').then(({ toast }) => {
                toast.error(err.message || 'Bulk upload failed');
            });
        } finally {
            setIsBulkUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleLaunch = async () => {
        if (!formData.name || !formData.price || !formData.supplierId) {
            alert('Please fill in required fields (Name, Price, and Supplier)');
            return;
        }

        setIsSaving(true);
        try {
            const priceInBase = convertToBase(Number(formData.price), activeCurrency);
            
            const payload: any = {
                name: formData.name,
                brand: formData.brand,
                category: formData.category,
                price: priceInBase,
                stock: parseInt(formData.quantity) || 0,
                moq: parseInt(formData.minOrder) || 1,
                unit: formData.unitType,
                description: formData.description,
                ean: formData.barcode,
                images: formData.images,
                supplierId: formData.supplierId,
                weight: formData.weight || undefined,
                shelfLife: formData.shelfLife || undefined,
                origin: formData.origin || undefined,
            };
            if (formData.unitType === 'Pallet' || formData.unitType === 'Shipment') {
                payload.unitsPerPallet = parseInt(formData.unitsPerPallet) || undefined;
            }
            if (formData.unitType === 'Shipment') {
                payload.palletsPerShipment = parseInt(formData.palletsPerShipment) || undefined;
            }

            const res = await apiFetch('/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                router.push('/admin/products');
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
                        <Link href="/admin/products" className="w-10 h-10 flex items-center justify-center rounded-xl border border-[#E5E7EB] hover:bg-[#F1F5F9] transition-all">
                            <ChevronLeft size={20} className="text-[#6B7280]" />
                        </Link>
                        <div>
                            <h1 className="text-[24px] font-semibold leading-[32px] tracking-tight text-teal-600">Admin Product Catalog</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="w-2 h-2 rounded-full bg-[#14B8A6] animate-pulse" />
                                <span className="text-[12px] font-medium text-[#6B7280] uppercase tracking-wider">Direct System Injection</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" className="h-10 rounded-[10px] px-6 text-[13px] font-bold border-[#E5E7EB]">
                            <Save size={16} className="me-2" /> Save Draft
                        </Button>
                        <Button 
                            onClick={handleLaunch}
                            disabled={isSaving}
                            className="h-12 rounded-[12px] px-8 text-[13px] font-black bg-[#1E293B] hover:bg-[#0F172A] text-white shadow-lg shadow-navy/20"
                        >
                            {isSaving ? 'Injecting...' : <><Rocket size={18} className="me-2" /> Launch Product</>}
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1440px] mx-auto p-6 lg:p-8">
                <div className="flex bg-[#F1F5F9] p-1.5 rounded-2xl w-fit mb-8 border border-[#E5E7EB]">
                    <button 
                        onClick={() => setActiveTab('manual')}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest transition-all",
                            activeTab === 'manual' ? "bg-white text-[#0F172A] shadow-md" : "text-slate-400 hover:text-slate-600"
                        )}
                    >
                        Single Entry
                    </button>
                    <button 
                        onClick={() => setActiveTab('bulk')}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-[13px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                            activeTab === 'bulk' ? "bg-white text-[#0F172A] shadow-md" : "text-slate-400 hover:text-slate-600"
                        )}
                    >
                        Bulk Injection
                        <div className="px-1.5 py-0.5 bg-teal-500 text-white text-[8px] rounded-full">Pro</div>
                    </button>
                </div>

                {activeTab === 'manual' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* LEFT COLUMN: 60% */}
                    <div className="lg:col-span-7 space-y-6">
                        
                        {/* CARD 1: PRODUCT MEDIA */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <h3 className="text-[16px] font-semibold mb-4">Product Media</h3>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    "relative w-full h-[200px] border-2 border-dashed border-[#E5E7EB] rounded-[12px] flex flex-col items-center justify-center cursor-pointer hover:border-[#14B8A6] hover:bg-[#14B8A6]/5 transition-all group overflow-hidden",
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
                                        <p className="text-[12px] text-[#6B7280] mt-1">PNG, JPG or SVG formats</p>
                                    </div>
                                ) : (
                                    <div className="w-full px-4">
                                        <div className="grid grid-cols-4 gap-2">
                                            {formData.images.map((img, i) => (
                                                <div key={i} className="relative aspect-square rounded-[8px] overflow-hidden border border-[#E5E7EB] bg-white">
                                                    <img src={img} className="w-full h-full object-contain" />
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
                                        placeholder="Full product title"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Brand</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Coca-Cola"
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
                                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Barcode (EAN)</label>
                                    <input 
                                        type="text" 
                                        placeholder="EAN13 Code"
                                        value={formData.barcode}
                                        onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Unit Type <span className="text-red-400">*</span></label>
                                    <select 
                                        value={formData.unitType}
                                        onChange={e => setFormData({ ...formData, unitType: e.target.value, unitsPerPallet: '', palletsPerShipment: '' })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] appearance-none font-medium"
                                    >
                                        <option value="Piece">📦 Piece</option>
                                        <option value="Pallet">🏗️ Pallet</option>
                                        <option value="Shipment">🚢 Shipment</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* CARD: SUPPLIER SELECTION (SHOW ONLY IF MULTIPLE SUPPLIERS EXIST) */}
                        {suppliers.length > 1 && (
                            <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                                <h3 className="text-[16px] font-semibold mb-4 flex items-center gap-2">
                                    <Store size={18} className="text-teal-600" /> Source Supplier
                                </h3>
                                <div className="space-y-4">
                                    <div className="relative">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
                                        <input 
                                            type="text" 
                                            placeholder="Search suppliers..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full h-[44px] bg-[#F8FAFC] border border-[#E5E7EB] rounded-[10px] ps-10 pe-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                        />
                                    </div>
                                    <div className="max-h-[160px] overflow-y-auto border border-[#E5E7EB] rounded-xl divide-y divide-[#E5E7EB]">
                                        {suppliers.filter(s => s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.email?.toLowerCase().includes(searchTerm.toLowerCase())).map((s) => (
                                            <button 
                                                key={s.id}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, supplierId: s.id })}
                                                className={cn(
                                                    "w-full px-4 py-3 flex items-center justify-between hover:bg-[#F1F5F9] transition-all text-left",
                                                    formData.supplierId === s.id && "bg-teal-50"
                                                )}
                                            >
                                                <div>
                                                    <p className="text-[13px] font-bold">{s.name}</p>
                                                    <p className="text-[11px] text-[#6B7280]">{s.email}</p>
                                                </div>
                                                {formData.supplierId === s.id && <CheckCircle2 size={16} className="text-teal-600" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* CARD 3: LOGISTICS & COMPLIANCE */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-5 shadow-sm space-y-5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[16px] font-semibold text-[#111827]">Logistics & Supply</h3>
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-100 rounded-lg text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                                    <Info size={10} /> Market: {activeCurrency} (Global)
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5 col-span-1">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Currency & Price</label>
                                    <div className="flex gap-2">
                                        <select 
                                            value={activeCurrency}
                                            onChange={(e) => setActiveCurrencyState(e.target.value)}
                                            className="h-[44px] bg-slate-50 border border-[#E5E7EB] rounded-[10px] px-2 text-[12px] font-black outline-none focus:border-[#14B8A6] transition-all"
                                        >
                                            {SUPPORTED_CURRENCIES.map(c => (
                                                <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                                            ))}
                                        </select>
                                        <div className="relative flex-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280] text-[12px] font-black">{selectedCurrencyInfo.symbol}</span>
                                            <input 
                                                type="number" 
                                                placeholder="0.00"
                                                value={formData.price}
                                                onChange={e => setFormData({ ...formData, price: e.target.value })}
                                                className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] ps-8 pe-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all font-bold"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Stock</label>
                                    <input 
                                        type="number" 
                                        placeholder="0"
                                        value={formData.quantity}
                                        onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Min. Order ({formData.unitType}s)</label>
                                    <input 
                                        type="number" 
                                        placeholder="1"
                                        value={formData.minOrder}
                                        onChange={e => setFormData({ ...formData, minOrder: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6] transition-all"
                                    />
                                    <p className="text-[10px] text-[#9CA3AF]">Minimum quantity a buyer must order in {formData.unitType.toLowerCase()}s</p>
                                </div>
                            </div>

                            {/* Conditional Unit Hierarchy Fields */}
                            {(formData.unitType === 'Pallet' || formData.unitType === 'Shipment') && (
                                <>
                                    <div className="h-px bg-[#F3F4F6]" />
                                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
                                        <p className="text-[11px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-1.5">
                                            <Info size={12} /> Unit Hierarchy Configuration
                                        </p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[12px] font-medium text-blue-600">Units per Pallet</label>
                                                <input 
                                                    type="number" 
                                                    placeholder="e.g. 48"
                                                    value={formData.unitsPerPallet}
                                                    onChange={e => setFormData({ ...formData, unitsPerPallet: e.target.value })}
                                                    className="w-full h-[44px] bg-white border border-blue-200 rounded-[10px] px-4 text-[14px] outline-none focus:border-blue-400 transition-all font-bold"
                                                />
                                                <p className="text-[10px] text-blue-500">How many pieces fit on one pallet</p>
                                            </div>
                                            {formData.unitType === 'Shipment' && (
                                                <div className="space-y-1.5">
                                                    <label className="text-[12px] font-medium text-blue-600">Pallets per Shipment</label>
                                                    <input 
                                                        type="number" 
                                                        placeholder="e.g. 20"
                                                        value={formData.palletsPerShipment}
                                                        onChange={e => setFormData({ ...formData, palletsPerShipment: e.target.value })}
                                                        className="w-full h-[44px] bg-white border border-blue-200 rounded-[10px] px-4 text-[14px] outline-none focus:border-blue-400 transition-all font-bold"
                                                    />
                                                    <p className="text-[10px] text-blue-500">How many pallets per shipment container</p>
                                                </div>
                                            )}
                                        </div>
                                        {formData.unitType === 'Shipment' && formData.unitsPerPallet && formData.palletsPerShipment && (
                                            <div className="p-3 bg-white border border-blue-100 rounded-lg text-[12px] text-blue-700 font-medium">
                                                📊 Total units per shipment: <span className="font-black">{parseInt(formData.unitsPerPallet) * parseInt(formData.palletsPerShipment) || '—'}</span> pieces
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            <div className="h-px bg-[#F3F4F6]" />

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Weight (kg)</label>
                                    <input 
                                        type="text" 
                                        placeholder="0.5kg"
                                        value={formData.weight}
                                        onChange={e => setFormData({ ...formData, weight: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Shelf Life</label>
                                    <input 
                                        type="text" 
                                        placeholder="12M"
                                        value={formData.shelfLife}
                                        onChange={e => setFormData({ ...formData, shelfLife: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#6B7280]">Origin</label>
                                    <input 
                                        type="text" 
                                        placeholder="EU/Asia"
                                        value={formData.origin}
                                        onChange={e => setFormData({ ...formData, origin: e.target.value })}
                                        className="w-full h-[44px] bg-white border border-[#E5E7EB] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#14B8A6]"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 pt-1">
                                <label className="text-[10px] font-black text-[#111827] uppercase tracking-widest flex items-center gap-2">
                                    <Shield size={14} className="text-[#14B8A6]" />
                                    B2B Compliance Verification
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { id: 'coo', label: 'Cert. of Origin' },
                                        { id: 'health', label: 'Health Cert.' },
                                        { id: 'analysis', label: 'CoA Analysis' },
                                        { id: 'compliance', label: 'Enterprise Std' },
                                    ].map(doc => (
                                        <button
                                            key={doc.id}
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                docs: { ...prev.docs, [doc.id]: !prev.docs[doc.id as keyof typeof prev.docs] }
                                            }))}
                                            className={cn(
                                                "h-9 px-3 rounded-xl border text-[10px] font-bold flex items-center justify-between transition-all",
                                                formData.docs[doc.id as keyof typeof formData.docs]
                                                    ? "bg-teal-50 border-teal-200 text-teal-600"
                                                    : "bg-white border-[#E5E7EB] text-[#6B7280] hover:border-teal-100"
                                            )}
                                        >
                                            {doc.label}
                                            {formData.docs[doc.id as keyof typeof formData.docs] ? <CheckCircle2 size={12} /> : <Plus size={12} className="opacity-30" />}
                                        </button>
                                    ))}
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
                                    AI Description
                                </button>
                            </div>
                            <textarea 
                                placeholder="Enterprise marketing description..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full h-[100px] bg-white border border-[#E5E7EB] rounded-[10px] p-[12px] text-[14px] outline-none focus:border-[#14B8A6] resize-none transition-all"
                            />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: 40% */}
                    <div className="lg:col-span-5 space-y-6">
                        
                        {/* CARD 1: PRODUCT SUMMARY */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <h3 className="text-[14px] font-black uppercase tracking-widest text-[#6B7280] mb-4">Injection Summary</h3>
                            <div className="flex items-center gap-4 p-3 bg-[#F8FAFC] rounded-[12px] border border-[#E5E7EB]">
                                <div className="w-16 h-16 bg-white border border-[#E5E7EB] rounded-lg flex items-center justify-center overflow-hidden">
                                    {formData.images[0] ? <img src={formData.images[0]} className="w-full h-full object-contain" /> : <ImageIcon size={20} className="text-[#E5E7EB]" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[16px] font-bold text-[#111827] truncate">{formData.name || 'Untitled Product'}</p>
                                    <p className="text-[12px] text-[#6B7280] font-medium">{formData.category} • {formData.brand || 'No Brand'}</p>
                                    <p className="text-[14px] font-black text-[#14B8A6] mt-1">{formData.price ? `${activeCurrency} ${formData.price}` : 'Price Pending'}</p>
                                </div>
                            </div>
                            {formData.supplierId && (
                                <div className="mt-3 p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center gap-2">
                                    <Store size={14} className="text-teal-600" />
                                    <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">
                                        Assigned to: {suppliers.find(s => s.id === formData.supplierId)?.name || 'Unknown'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* CARD 2: COMPLETION PROGRESS */}
                        <div className="bg-white border border-[#E5E7EB] rounded-[14px] p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[14px] font-semibold">Quality Score</h3>
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
                                        {!item.done && <span className="text-[10px] font-bold text-[#F59E0B] uppercase">Pending</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* CARD 4: ALERTS */}
                        <div className="space-y-2">
                            {!formData.supplierId && (
                                <div className="h-[40px] px-3 bg-red-50 border border-red-100 rounded-[10px] flex items-center gap-2 text-red-600">
                                    <AlertCircle size={16} />
                                    <span className="text-[13px] font-medium">Please assign a supplier to this product</span>
                                </div>
                            )}
                            <div className="h-[40px] px-3 bg-[#F59E0B]/5 border border-[#F59E0B]/10 rounded-[10px] flex items-center gap-2 text-[#F59E0B]">
                                <Info size={16} />
                                <span className="text-[13px] font-medium">Product will be visible to all enterprise buyers</span>
                            </div>
                        </div>

                    </div>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto space-y-8">
                        {/* BULK UPLOAD SPECIFICATION */}
                        <div className="bg-white border border-[#E5E7EB] rounded-3xl p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-xl font-bold text-[#111827]">Injection Specification</h3>
                                    <p className="text-sm text-[#6B7280] mt-1">Ensure your CSV/Excel follows these mandatory attributes</p>
                                </div>
                                <div className="px-4 py-2 bg-[#F1F5F9] rounded-xl flex items-center gap-2">
                                    <FileSpreadsheet size={18} className="text-[#14B8A6]" />
                                    <span className="text-xs font-black uppercase tracking-widest text-slate-600">Template v2.4</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Product Name', desc: 'Required', required: true },
                                    { label: 'Brand', desc: 'Required', required: true },
                                    { label: 'Category', desc: 'System Match', required: false },
                                    { label: 'Price (Base)', desc: 'Numeric', required: true },
                                    { label: 'Description', desc: 'Marketing', required: false },
                                    { label: 'Weight (kg)', desc: 'Logistics', required: false },
                                    { label: 'Shelf Life', desc: 'e.g. 12M', required: false },
                                    { label: 'Stock', desc: 'Total units', required: true },
                                    { label: 'MOQ', desc: 'Min order', required: false },
                                    { label: 'Unit Type', desc: 'Piece/Pallet/Shipment', required: false },
                                    { label: 'Units/Pallet', desc: 'Numeric', required: false },
                                    { label: 'Pallets/Shipment', desc: 'Numeric', required: false },
                                    { label: 'EAN', desc: 'Barcode', required: false },
                                    { label: 'Origin', desc: 'Country', required: false },
                                ].map((col) => (
                                    <div key={col.label} className={`p-3 border rounded-2xl ${col.required ? 'bg-teal-50/50 border-teal-200' : 'bg-[#F8FAFC] border-[#E5E7EB]'}`}>
                                        <p className="text-[10px] font-black text-[#111827] uppercase tracking-wider truncate flex items-center gap-1">
                                            {col.label}
                                            {col.required && <span className="text-red-400">*</span>}
                                        </p>
                                        <p className="text-[9px] text-[#6B7280] mt-1 font-medium">{col.desc}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 p-6 bg-teal-50 border border-teal-100 rounded-2xl flex items-start gap-4">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-teal-600 shrink-0">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-teal-900">Schema Validation Active</p>
                                    <p className="text-[13px] text-teal-700 mt-1 leading-relaxed">
                                        The system will automatically verify your file structure before ingestion. 
                                        Missing columns or invalid data types will be flagged for correction.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* BULK UPLOAD REPORT */}
                        {bulkReport && (
                            <div className="bg-white border border-[#E5E7EB] rounded-3xl p-6 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <FileSpreadsheet size={20} className="text-[#14B8A6]" />
                                        Upload Report
                                    </h3>
                                    <button onClick={() => setBulkReport(null)} className="text-[#6B7280] hover:text-[#111827]">
                                        <AlertCircle size={18} />
                                    </button>
                                </div>
                                <div className="flex gap-6 text-sm">
                                    <span className="font-bold">Total Rows: <span className="text-[#111827]">{bulkReport.totalRows}</span></span>
                                    <span className="font-bold text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} /> {bulkReport.successCount} Success</span>
                                    <span className="font-bold text-red-500 flex items-center gap-1"><AlertCircle size={14} /> {bulkReport.errorCount} Errors</span>
                                    <span className="font-bold text-blue-600">Created: {bulkReport.createdCount}</span>
                                </div>
                                {bulkReport.results?.filter((r: any) => !r.success).length > 0 && (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        <p className="text-[11px] font-black text-red-500 uppercase tracking-widest">Error Details — Fix these in your file and re-upload</p>
                                        {bulkReport.results.filter((r: any) => !r.success).map((r: any, i: number) => (
                                            <div key={i} className="flex items-start gap-2 text-xs bg-red-50 text-red-600 rounded-xl px-4 py-3 border border-red-100">
                                                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                                <span><strong>Row {r.rowNumber}:</strong> {r.errors?.join(', ') || 'Unknown error'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* UPLOAD ZONE */}
                        <div 
                            className={`h-[300px] bg-white border-4 border-dashed rounded-[40px] flex flex-col items-center justify-center cursor-pointer hover:border-[#14B8A6] hover:bg-[#14B8A6]/5 transition-all group ${isBulkUploading ? 'border-[#14B8A6] bg-[#14B8A6]/5 pointer-events-none' : 'border-[#F1F5F9]'}`}
                            onClick={() => !isBulkUploading && bulkInputRef.current?.click()}
                        >
                            <input 
                                type="file" 
                                ref={bulkInputRef} 
                                className="hidden" 
                                accept=".csv,.xlsx,.xls" 
                                onChange={handleBulkUpload}
                            />
                            <div className="w-20 h-20 bg-[#F1F5F9] rounded-[30px] flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                                {isBulkUploading ? (
                                    <Loader2 size={32} className="text-[#14B8A6] animate-spin" />
                                ) : (
                                    <Database size={32} className="text-[#6B7280] group-hover:text-[#14B8A6]" />
                                )}
                            </div>
                            <h4 className="text-xl font-black text-[#111827] uppercase tracking-tighter">
                                {isBulkUploading ? 'Processing Catalog...' : 'Inject Enterprise Catalog'}
                            </h4>
                            <p className="text-sm text-[#6B7280] mt-2">
                                {isBulkUploading ? 'Validating and creating products...' : 'Drop your .xlsx or .csv file here'}
                            </p>
                            
                            {!isBulkUploading && (
                                <button 
                                    type="button"
                                    className="mt-8 h-12 px-8 bg-[#0F172A] text-white rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center gap-2 hover:bg-black transition-all"
                                >
                                    <Plus size={16} /> Choose File
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
