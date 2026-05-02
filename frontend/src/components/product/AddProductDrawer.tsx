'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Plus, Upload, Sparkles, ChevronDown, CheckCircle2,
    Package, DollarSign, Image as ImageIcon, Save, Rocket,
    Loader2, AlertCircle, Store, Shield, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { getCurrencyInfo, SUPPORTED_CURRENCIES, convertToBase } from '@/lib/currency';
import { CATEGORIES_LIST } from '@/lib/products';
import { toast } from 'react-hot-toast';

interface AddProductDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    /** 'admin' → product goes live immediately after approval toggle
     *  'supplier' → product saved as PENDING for admin review */
    role: 'admin' | 'supplier';
}

const UNIT_TYPES = ['Piece', 'Case', 'Pallet', 'Shipment', 'Carton', 'Box', 'Kg', 'Litre'];

export default function AddProductDrawer({ isOpen, onClose, onCreated, role }: AddProductDrawerProps) {
    const [isSaving, setIsSaving] = React.useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = React.useState(false);
    const [suppliers, setSuppliers] = React.useState<any[]>([]);
    const [supplierSearch, setSupplierSearch] = React.useState('');
    const [isUploadingImage, setIsUploadingImage] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [activeCurrency, setActiveCurrency] = React.useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('platform-currency');
            if (saved) return saved;
        }
        return getCurrencyInfo().code;
    });

    // Sync currency changes
    React.useEffect(() => {
        const sync = () => {
            const saved = localStorage.getItem('platform-currency');
            if (saved) setActiveCurrency(saved);
        };
        window.addEventListener('currency-changed', sync);
        return () => window.removeEventListener('currency-changed', sync);
    }, []);

    const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === activeCurrency) || SUPPORTED_CURRENCIES[0];

    const defaultForm = {
        name: '', brand: '', category: 'Beverages', ean: '',
        price: '', stock: '', moq: '1', unit: 'Case',
        unitsPerCase: '', casesPerPallet: '', unitsPerPallet: '', palletsPerShipment: '',
        description: '', supplierId: '', images: [] as string[],
        weight: '', shelfLife: '', origin: '',
        autoApprove: role === 'admin',
    };

    const [form, setForm] = React.useState(defaultForm);
    const set = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

    // Reset form when drawer opens
    React.useEffect(() => {
        if (isOpen) {
            setForm({ ...defaultForm, autoApprove: role === 'admin' });
            setSupplierSearch('');
        }
    }, [isOpen, role]);

    // Fetch suppliers (admin only)
    React.useEffect(() => {
        if (!isOpen || role !== 'admin') return;
        apiFetch('/users?role=SUPPLIER').then(async res => {
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.users || []);
                setSuppliers(list);
                if (list.length === 1) set('supplierId', list[0].id);
            }
        }).catch(() => {});
    }, [isOpen, role]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setIsUploadingImage(true);
        for (const file of files) {
            try {
                const fd = new FormData();
                fd.append('file', file);
                const res = await apiFetch('/products/upload-image', { method: 'POST', body: fd });
                if (res.ok) {
                    const data = await res.json();
                    setForm(prev => ({ ...prev, images: [...prev.images, data.url] }));
                }
            } catch { /* ignore single file error */ }
        }
        setIsUploadingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleAIDescription = async () => {
        if (!form.name) { toast.error('Enter a product name first'); return; }
        setIsGeneratingAI(true);
        await new Promise(r => setTimeout(r, 1200));
        const brandStr = form.brand ? ` by ${form.brand}` : '';
        const catStr = form.category ? ` in the ${form.category} category` : '';
        const generated = form.description.trim().length > 10
            ? `${form.description.trim()}\n\n${form.name}${brandStr}${catStr} — professionally sourced and optimized for B2B wholesale distribution. Features verified quality documentation, standardized export-ready packaging, and full compliance with international food & safety regulations.`
            : `${form.name}${brandStr}${catStr} — a premium-grade product natively optimized for B2B procurement and wholesale distribution. Featuring verified documentation, standardized packaging for international export, and strict compliance with food & safety regulations.`;
        set('description', generated);
        setIsGeneratingAI(false);
    };

    const completionItems = [
        { label: 'Basic Info', done: !!form.name && !!form.brand },
        { label: 'Pricing & Stock', done: !!form.price && !!form.stock },
        { label: 'Image', done: form.images.length > 0 },
        { label: 'Description', done: form.description.length > 20 },
    ];
    if (role === 'admin') {
        completionItems.push({ label: 'Supplier', done: !!form.supplierId });
    }
    const progress = (completionItems.filter(i => i.done).length / completionItems.length) * 100;

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Product name is required'); return; }
        if (!form.price) { toast.error('Price is required'); return; }
        if (role === 'admin' && !form.supplierId) { toast.error('Please select a supplier'); return; }

        setIsSaving(true);
        try {
            const priceEGP = convertToBase(Number(form.price), activeCurrency);
            const payload: any = {
                name: form.name.trim(),
                brand: form.brand || undefined,
                category: form.category,
                ean: form.ean || undefined,
                price: priceEGP,
                stock: parseInt(form.stock) || 0,
                moq: parseInt(form.moq) || 1,
                unit: form.unit,
                description: form.description,
                images: form.images,
                supplierId: form.supplierId || undefined,
                weight: form.weight || undefined,
                shelfLife: form.shelfLife || undefined,
                origin: form.origin || undefined,
                status: (role === 'admin' && form.autoApprove) ? 'APPROVED' : 'PENDING',
            };
            if (form.unitsPerCase) payload.unitsPerCase = parseInt(form.unitsPerCase);
            if (form.casesPerPallet) payload.casesPerPallet = parseInt(form.casesPerPallet);
            if (form.unitsPerPallet) payload.unitsPerPallet = parseInt(form.unitsPerPallet);
            if (form.palletsPerShipment) payload.palletsPerShipment = parseInt(form.palletsPerShipment);

            const res = await apiFetch('/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                toast.success(
                    role === 'admin' && form.autoApprove
                        ? 'Product published to marketplace!'
                        : 'Product submitted for review!'
                );
                onCreated();
                onClose();
            } else {
                const err = await res.json();
                toast.error(err.message || 'Failed to create product');
            }
        } catch (err: any) {
            toast.error(err.message || 'Connection error');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredSuppliers = suppliers.filter(s =>
        !supplierSearch || s.name?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        s.email?.toLowerCase().includes(supplierSearch.toLowerCase())
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[560px] bg-white shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* ── Header ─────────────────────────────────────────── */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                                    {role === 'admin' ? 'Add New Product' : 'Submit New Product'}
                                </h2>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">
                                    {role === 'admin'
                                        ? 'Publish directly or send for review'
                                        : 'Your product will be reviewed before going live'}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* ── Progress bar ────────────────────────────────────── */}
                        <div className="px-6 py-3 border-b border-slate-50 bg-slate-50/50 shrink-0">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Completion</span>
                                <span className="text-[11px] font-black text-teal-600">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-teal-500 rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.3 }}
                                />
                            </div>
                            <div className="flex gap-3 mt-2">
                                {completionItems.map((item, i) => (
                                    <div key={i} className={cn(
                                        "flex items-center gap-1 text-[10px] font-bold",
                                        item.done ? "text-teal-600" : "text-slate-300"
                                    )}>
                                        <CheckCircle2 size={10} />
                                        {item.label}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Scrollable form ─────────────────────────────────── */}
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                            {/* Basic Info */}
                            <section>
                                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <Package size={12} /> Basic Info
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Product Name <span className="text-red-400">*</span></label>
                                        <input
                                            value={form.name}
                                            onChange={e => set('name', e.target.value)}
                                            placeholder="e.g. KitKat Chunky 40g"
                                            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Brand</label>
                                            <input
                                                value={form.brand}
                                                onChange={e => set('brand', e.target.value)}
                                                placeholder="e.g. Nestlé"
                                                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Category</label>
                                            <select
                                                value={form.category}
                                                onChange={e => set('category', e.target.value)}
                                                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none bg-white"
                                            >
                                                {CATEGORIES_LIST.map(c => <option key={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Barcode / EAN / SKU</label>
                                        <input
                                            value={form.ean}
                                            onChange={e => set('ean', e.target.value)}
                                            placeholder="e.g. 17194"
                                            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Pricing & Stock */}
                            <section>
                                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <DollarSign size={12} /> Pricing & Stock
                                </h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-600 mb-1 block">
                                                Price <span className="text-red-400">*</span>
                                                <span className="text-slate-400 font-normal ml-1">({activeCurrency})</span>
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">{currencyInfo.symbol}</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={form.price}
                                                    onChange={e => set('price', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full h-10 pl-7 pr-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Available Stock (cases)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={form.stock}
                                                onChange={e => set('stock', e.target.value)}
                                                placeholder="e.g. 1054"
                                                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Min Order (MOQ)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={form.moq}
                                                onChange={e => set('moq', e.target.value)}
                                                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-600 mb-1 block">Unit Type</label>
                                            <select
                                                value={form.unit}
                                                onChange={e => set('unit', e.target.value)}
                                                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none bg-white"
                                            >
                                                {UNIT_TYPES.map(u => <option key={u}>{u}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Logistics */}
                            <section>
                                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <Package size={12} /> Logistics
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Pcs / Case</label>
                                        <input
                                            type="number" min="0"
                                            value={form.unitsPerCase}
                                            onChange={e => set('unitsPerCase', e.target.value)}
                                            placeholder="e.g. 24"
                                            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Cases / Pallet</label>
                                        <input
                                            type="number" min="0"
                                            value={form.casesPerPallet}
                                            onChange={e => set('casesPerPallet', e.target.value)}
                                            placeholder="e.g. 403"
                                            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Units / Pallet</label>
                                        <input
                                            type="number" min="0"
                                            value={form.unitsPerPallet ||
                                                (form.unitsPerCase && form.casesPerPallet
                                                    ? String(parseInt(form.unitsPerCase) * parseInt(form.casesPerPallet))
                                                    : '')}
                                            onChange={e => set('unitsPerPallet', e.target.value)}
                                            placeholder="auto-calculated"
                                            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none bg-slate-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Pallets / Shipment</label>
                                        <input
                                            type="number" min="0"
                                            value={form.palletsPerShipment}
                                            onChange={e => set('palletsPerShipment', e.target.value)}
                                            placeholder="e.g. 20"
                                            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Origin</label>
                                        <input
                                            value={form.origin}
                                            onChange={e => set('origin', e.target.value)}
                                            placeholder="e.g. Germany"
                                            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 mb-1 block">Shelf Life / Expiry</label>
                                        <input
                                            value={form.shelfLife}
                                            onChange={e => set('shelfLife', e.target.value)}
                                            placeholder="e.g. 20260731"
                                            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* Images */}
                            <section>
                                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <ImageIcon size={12} /> Product Images
                                </h3>
                                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-all group"
                                >
                                    {isUploadingImage ? (
                                        <Loader2 size={24} className="text-teal-500 animate-spin mb-2" />
                                    ) : (
                                        <Upload size={24} className="text-slate-300 group-hover:text-teal-500 mb-2 transition-colors" />
                                    )}
                                    <p className="text-sm font-bold text-slate-500 group-hover:text-teal-600">
                                        {isUploadingImage ? 'Uploading...' : 'Click to upload images'}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">PNG, JPG, WebP — multiple allowed</p>
                                </div>
                                {form.images.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {form.images.map((url, i) => (
                                            <div key={i} className="relative group">
                                                <img src={url} alt="" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                                                <button
                                                    onClick={() => setForm(prev => ({ ...prev, images: prev.images.filter((_, idx) => idx !== i) }))}
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            {/* Description */}
                            <section>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Info size={12} /> Description
                                    </h3>
                                    <button
                                        onClick={handleAIDescription}
                                        disabled={isGeneratingAI}
                                        className="flex items-center gap-1.5 text-[11px] font-bold text-purple-600 hover:text-purple-700 disabled:opacity-50 transition-colors"
                                    >
                                        {isGeneratingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                        AI Generate
                                    </button>
                                </div>
                                <textarea
                                    value={form.description}
                                    onChange={e => set('description', e.target.value)}
                                    rows={4}
                                    placeholder="Describe the product — quality, packaging, certifications…"
                                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none resize-none transition-all"
                                />
                            </section>

                            {/* Supplier picker (admin only) */}
                            {role === 'admin' && (
                                <section>
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                        <Store size={12} /> Assign Supplier <span className="text-red-400">*</span>
                                    </h3>
                                    <input
                                        value={supplierSearch}
                                        onChange={e => setSupplierSearch(e.target.value)}
                                        placeholder="Search suppliers…"
                                        className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm focus:border-teal-500 outline-none mb-2"
                                    />
                                    <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-slate-100 bg-slate-50/50 p-2">
                                        {filteredSuppliers.length === 0 ? (
                                            <p className="text-xs text-slate-400 text-center py-3">No suppliers found</p>
                                        ) : filteredSuppliers.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => set('supplierId', s.id)}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                                                    form.supplierId === s.id
                                                        ? "bg-teal-500 text-white"
                                                        : "hover:bg-slate-100 text-slate-700"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                                                    form.supplierId === s.id ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                                                )}>
                                                    {(s.name || s.email || '?')[0].toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={cn("text-xs font-bold truncate", form.supplierId === s.id ? "text-white" : "text-slate-800")}>
                                                        {s.name || 'Unnamed'}
                                                    </p>
                                                    <p className={cn("text-[10px] truncate", form.supplierId === s.id ? "text-white/70" : "text-slate-400")}>
                                                        {s.email}
                                                    </p>
                                                </div>
                                                {form.supplierId === s.id && <CheckCircle2 size={14} />}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Admin-only: publish toggle */}
                            {role === 'admin' && (
                                <section>
                                    <button
                                        onClick={() => set('autoApprove', !form.autoApprove)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all",
                                            form.autoApprove
                                                ? "border-teal-500 bg-teal-50"
                                                : "border-slate-200 bg-white hover:border-slate-300"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                                            form.autoApprove ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-400"
                                        )}>
                                            {form.autoApprove ? <Rocket size={16} /> : <Shield size={16} />}
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className={cn("text-sm font-black", form.autoApprove ? "text-teal-700" : "text-slate-700")}>
                                                {form.autoApprove ? 'Publish to Marketplace' : 'Save as Pending Review'}
                                            </p>
                                            <p className="text-[11px] text-slate-400">
                                                {form.autoApprove
                                                    ? 'Product will be live immediately after saving'
                                                    : 'Product needs approval before going live'}
                                            </p>
                                        </div>
                                        <div className={cn(
                                            "w-11 h-6 rounded-full transition-colors relative",
                                            form.autoApprove ? "bg-teal-500" : "bg-slate-200"
                                        )}>
                                            <div className={cn(
                                                "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                                                form.autoApprove ? "translate-x-5" : "translate-x-0.5"
                                            )} />
                                        </div>
                                    </button>
                                </section>
                            )}

                            {/* Supplier-only note */}
                            {role === 'supplier' && (
                                <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                    <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-700 font-medium">
                                        Your product will be reviewed by the admin before it appears on the marketplace.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── Footer ─────────────────────────────────────────── */}
                        <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0 flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className={cn(
                                    "flex-1 h-11 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all",
                                    isSaving
                                        ? "bg-slate-400 cursor-not-allowed"
                                        : role === 'admin' && form.autoApprove
                                            ? "bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-600/20"
                                            : "bg-slate-800 hover:bg-slate-900"
                                )}
                            >
                                {isSaving ? (
                                    <><Loader2 size={16} className="animate-spin" /> Saving…</>
                                ) : role === 'admin' && form.autoApprove ? (
                                    <><Rocket size={16} /> Publish Product</>
                                ) : (
                                    <><Save size={16} /> Submit for Review</>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
