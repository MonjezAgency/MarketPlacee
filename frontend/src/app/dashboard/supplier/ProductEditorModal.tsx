'use client';

/**
 * ProductEditorModal — clean, focused product editor used by both
 * the supplier (`/supplier/products`) and the admin
 * (`/admin/products`) pages.
 *
 * The previous version (KitKat-era) tried to be a single mega-modal
 * with AI-boost, EAN image scraping, variant builders, and a live
 * customer preview pane. Suppliers found it overwhelming and the
 * admin team kept asking why a tool labelled "supplier editor"
 * exposed catalog-curation features. We replaced it with the
 * minimal layout the operator drew up: image · price · stock ·
 * product details · save. Nothing else.
 *
 * Two modes:
 *   • mode="supplier" (default) — no verification badge, no admin
 *     metadata. Supplier types raw price; backend stores it as
 *     `basePrice` and re-applies markup for `price`.
 *   • mode="admin" — shows the "Verified by Atlantis" status card
 *     with product ID + created date.
 *
 * Currency conversion: the modal works in `activeCurrency` (read
 * from localStorage). On open we display `basePrice ?? price`
 * converted FROM the platform base; on save we convert back so
 * the API always receives base-currency values.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    X,
    Upload,
    Save,
    Image as ImageIcon,
    Package,
    Trash2,
    ShieldCheck,
    Euro,
    Box,
    Check,
} from 'lucide-react';

import {
    getCurrencyInfo,
    SUPPORTED_CURRENCIES,
    convertFromBase,
    convertToBase,
} from '@/lib/currency';
import { COUNTRIES } from '@/lib/countries';
import { CATEGORIES_LIST } from '@/lib/products';
import { ProductStatus } from '@/lib/types';
import type { Product } from '@/lib/types';

// ---------------------------------------------------------------
//  Public props
// ---------------------------------------------------------------
interface ProductEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    product?: Product | null;
    onSave: (data: Product) => void;
    /**
     * When "admin" the modal shows the Verified-by-Atlantis status
     * card and the product ID / created date. Defaults to "supplier".
     */
    mode?: 'admin' | 'supplier';
    /**
     * Optional delete handler. When provided, the footer renders a
     * red "Delete Product" button on the left. Admin pages pass this;
     * supplier pages leave it undefined (deletion happens from the
     * table row menu, with an extra confirm).
     */
    onDelete?: (id: string) => void;
}

const UNIT_TYPES = [
    { value: 'Piece', label: 'Piece', icon: '📦' },
    { value: 'Case', label: 'Case', icon: '📦' },
    { value: 'Pallet', label: 'Pallet', icon: '🏗️' },
    { value: 'Truck', label: 'Truck', icon: '🚛' },
];

// ---------------------------------------------------------------
//  Component
// ---------------------------------------------------------------
export default function ProductEditorModal({
    isOpen,
    onClose,
    product,
    onSave,
    mode = 'supplier',
    onDelete,
}: ProductEditorModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    // active display currency — synced with the rest of the app
    const [activeCurrency, setActiveCurrency] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('platform-currency');
            if (saved) return saved;
        }
        return getCurrencyInfo().code;
    });

    useEffect(() => {
        const onCurrencyChanged = () => {
            const saved = localStorage.getItem('platform-currency');
            if (saved) setActiveCurrency(saved);
        };
        window.addEventListener('currency-changed', onCurrencyChanged);
        window.addEventListener('storage', onCurrencyChanged);
        return () => {
            window.removeEventListener('currency-changed', onCurrencyChanged);
            window.removeEventListener('storage', onCurrencyChanged);
        };
    }, []);

    const symbol =
        SUPPORTED_CURRENCIES.find((c) => c.code === activeCurrency)?.symbol ||
        '€';

    // ---------- form state ----------
    const defaultData: Product = {
        id: '',
        name: '',
        brand: '',
        price: 0,
        stock: 0,
        image: '',
        images: [],
        category: 'Beverages',
        description: '',
        unit: 'Piece',
        minOrder: 1,
        ean: '',
        variants: [],
        inStock: true,
        unitsPerPallet: 0,
        palletsPerShipment: 0,
        weight: 0,
        shelfLife: '',
        origin: '',
        status: ProductStatus.PENDING,
        isNew: false,
        bulkSave: false,
    };

    const [formData, setFormData] = useState<Product>(defaultData);
    const [isUploading, setIsUploading] = useState(false);

    // Hydrate form when a product is passed in (or reset on close).
    useEffect(() => {
        if (product) {
            const rawPrice = product.basePrice ?? product.price ?? 0;
            const displayPrice = convertFromBase(rawPrice, activeCurrency);
            setFormData({
                ...defaultData,
                ...product,
                price: displayPrice,
                images: product.images || (product.image ? [product.image] : []),
            });
        } else {
            setFormData(defaultData);
        }
        // We deliberately exclude defaultData from deps — it's a fresh
        // object each render and would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product, isOpen, activeCurrency]);

    // ---------- image upload ----------
    const handleImageUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsUploading(true);
        try {
            const { apiFetch } = await import('@/lib/api');
            const uploaded: string[] = [];
            for (const file of files) {
                const fd = new FormData();
                fd.append('file', file);
                const res = await apiFetch('/products/upload-image', {
                    method: 'POST',
                    body: fd,
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.url) uploaded.push(data.url);
                }
            }
            if (uploaded.length > 0) {
                const combined = [...(formData.images || []), ...uploaded];
                setFormData({
                    ...formData,
                    images: combined,
                    image: combined[0],
                });
            }
        } catch (err) {
            console.error('Image upload failed:', err);
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const addImageUrl = (url: string) => {
        const trimmed = url.trim();
        if (!trimmed) return;
        const existing = formData.images || [];
        if (existing.includes(trimmed)) return;
        const combined = [...existing, trimmed];
        setFormData({ ...formData, images: combined, image: combined[0] });
    };

    const removeImage = (idx: number) => {
        const remaining = (formData.images || []).filter((_, i) => i !== idx);
        setFormData({
            ...formData,
            images: remaining,
            image: remaining[0] || '',
        });
    };

    // ---------- submit ----------
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Convert the typed display price back to base currency before
        // sending to the API. The backend stores `basePrice` and applies
        // the platform markup for the customer-facing `price`.
        const basePrice = convertToBase(formData.price || 0, activeCurrency);
        const payload: Product = {
            ...formData,
            price: basePrice,
            basePrice,
        };
        if (!payload.id) {
            delete (payload as any).id;
        }
        onSave(payload);
        onClose();
    };

    // ---------- render ----------
    if (typeof window === 'undefined') return null;
    if (!isOpen) return null;

    const verifiedDate = product?.createdAt
        ? new Date(product.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          })
        : '—';
    const shortId = product?.id ? `MOD ${product.id.slice(0, 6)}` : 'NEW';

    const modal = (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 20 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                        className="relative w-full max-w-6xl max-h-[94vh] flex flex-col bg-slate-50 rounded-3xl shadow-2xl ring-1 ring-slate-200/80 overflow-hidden z-10"
                    >
                        {/* Header */}
                        <div className="shrink-0 px-8 py-6 bg-white border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                                    {product ? 'Edit Product' : 'Add Product'}
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">
                                    Update your product details and settings
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close"
                                className="w-10 h-10 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        {/* Body */}
                        <form
                            id="product-editor-form"
                            onSubmit={handleSubmit}
                            className="flex-1 overflow-y-auto p-6 sm:p-8"
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                {/* ─── Left column ─── */}
                                <div className="lg:col-span-4 space-y-6">
                                    {/* Product Image card */}
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900">
                                                Product Image
                                            </h3>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                Upload a clear image of your product
                                            </p>
                                        </div>

                                        <div className="aspect-square rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center relative group">
                                            {formData.images?.[0] ? (
                                                <>
                                                    <img
                                                        src={formData.images[0]}
                                                        alt={formData.name || 'Product image'}
                                                        referrerPolicy="no-referrer"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                        className="w-full h-full object-contain p-4"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeImage(0)}
                                                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-red-50 text-slate-500 hover:text-red-600 flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remove image"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center text-slate-400">
                                                    <ImageIcon size={36} strokeWidth={1.5} />
                                                    <span className="text-xs mt-2">
                                                        No image yet
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isUploading}
                                            className="w-full h-11 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                        >
                                            <Upload size={15} />
                                            {isUploading ? 'Uploading…' : 'Change Image'}
                                        </button>

                                        <div className="flex items-center gap-2">
                                            <input
                                                type="url"
                                                placeholder="Or paste an image URL…"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        addImageUrl((e.target as HTMLInputElement).value);
                                                        (e.target as HTMLInputElement).value = '';
                                                    }
                                                }}
                                                className="flex-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                            />
                                        </div>

                                        <p className="text-[11px] text-slate-400 text-center">
                                            JPG, PNG or WEBP. Max size 5MB.
                                        </p>

                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={handleImageUpload}
                                        />
                                    </div>

                                    {/* Product Status — admin only */}
                                    {mode === 'admin' && (
                                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-base font-bold text-slate-900">
                                                    Product Status
                                                </h3>
                                                <div className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                                                    <ShieldCheck size={13} />
                                                    Verified
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500">
                                                This product is verified by Atlantis
                                            </p>
                                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                                <div>
                                                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                                                        Product ID
                                                    </p>
                                                    <p className="text-sm font-bold text-slate-900 mt-1">
                                                        {shortId}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                                                        Added on
                                                    </p>
                                                    <p className="text-sm font-semibold text-slate-700 mt-1">
                                                        {verifiedDate}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ─── Right column ─── */}
                                <div className="lg:col-span-8 space-y-6">
                                    {/* Top stats: Price + Stock */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        {/* Price card */}
                                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                                    <Euro size={18} />
                                                </div>
                                                <h3 className="text-sm font-bold text-slate-900">
                                                    Currency & Price per Case
                                                </h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-medium text-slate-500">
                                                        Currency
                                                    </label>
                                                    <select
                                                        value={activeCurrency}
                                                        onChange={(e) =>
                                                            setActiveCurrency(e.target.value)
                                                        }
                                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 appearance-none"
                                                    >
                                                        {SUPPORTED_CURRENCIES.map((c) => (
                                                            <option key={c.code} value={c.code}>
                                                                {c.code}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-medium text-slate-500">
                                                        Price per Case
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">
                                                            {symbol}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            required
                                                            value={formData.price || ''}
                                                            onChange={(e) =>
                                                                setFormData({
                                                                    ...formData,
                                                                    price: parseFloat(e.target.value) || 0,
                                                                })
                                                            }
                                                            className="w-full h-11 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-base font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stock card */}
                                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                                                        <Box size={18} />
                                                    </div>
                                                    <h3 className="text-sm font-bold text-slate-900">
                                                        Stock Level (Cases)
                                                    </h3>
                                                </div>
                                                {(formData.stock ?? 0) > 0 && (
                                                    <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                                                        <Check size={11} />
                                                        In Stock
                                                    </span>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium text-slate-500">
                                                    Available Stock
                                                </label>
                                                <div className="flex items-end gap-2">
                                                    <input
                                                        type="number"
                                                        required
                                                        min={0}
                                                        value={formData.stock ?? ''}
                                                        onChange={(e) =>
                                                            setFormData({
                                                                ...formData,
                                                                stock: parseInt(e.target.value) || 0,
                                                            })
                                                        }
                                                        className="w-24 h-11 rounded-xl border border-slate-200 bg-white px-3 text-2xl font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                                    />
                                                    <span className="text-sm text-slate-500 pb-2.5">
                                                        cases
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Product Details */}
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                                        <h3 className="text-base font-bold text-slate-900">
                                            Product Details
                                        </h3>

                                        {/* Product name — full width */}
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-slate-500">
                                                Product Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Lavazza Crema e Gusto Espresso 250g"
                                                value={formData.name || ''}
                                                onChange={(e) =>
                                                    setFormData({ ...formData, name: e.target.value })
                                                }
                                                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium text-slate-500">
                                                    Unit Type <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    value={formData.unit || 'Piece'}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, unit: e.target.value })
                                                    }
                                                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 appearance-none"
                                                >
                                                    {UNIT_TYPES.map((u) => (
                                                        <option key={u.value} value={u.value}>
                                                            {u.icon} {u.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium text-slate-500">
                                                    Minimum Order ({formData.unit || 'Cases'}) <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    required
                                                    value={formData.minOrder || formData.moq || ''}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            minOrder: parseInt(e.target.value) || 1,
                                                            moq: parseInt(e.target.value) || 1,
                                                        })
                                                    }
                                                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium text-slate-500">
                                                    Weight per Unit (kg) <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.001"
                                                    placeholder="e.g. 0.330"
                                                    value={formData.weight || ''}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            weight: parseFloat(e.target.value) || 0,
                                                        })
                                                    }
                                                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                                />
                                                <p className="text-[11px] text-slate-400">
                                                    Enter weight per single unit
                                                </p>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium text-slate-500">
                                                    BBD (Best Before Date) <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="YYYYMMDD"
                                                    value={formData.shelfLife || ''}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            shelfLife: e.target.value,
                                                        })
                                                    }
                                                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                                />
                                                <p className="text-[11px] text-slate-400">
                                                    Format: YYYYMMDD
                                                </p>
                                            </div>
                                        </div>

                                        {/* Category + Country of Origin */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium text-slate-500">
                                                    Category <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    value={formData.category || ''}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, category: e.target.value })
                                                    }
                                                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 appearance-none"
                                                >
                                                    {CATEGORIES_LIST.map((c) => (
                                                        <option key={c} value={c}>
                                                            {c}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-medium text-slate-500">
                                                    Country of Origin <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    value={formData.origin || ''}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, origin: e.target.value })
                                                    }
                                                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 appearance-none"
                                                >
                                                    <option value="">Select country…</option>
                                                    {COUNTRIES.map((c) => (
                                                        <option key={c.iso} value={c.name}>
                                                            {c.flag} {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-[11px] text-slate-400">
                                                    Where the product is manufactured
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>

                        {/* Footer */}
                        <div className="shrink-0 bg-white border-t border-slate-200 px-6 sm:px-8 py-4 flex items-center justify-between gap-4">
                            <div>
                                {onDelete && product?.id && (
                                    <button
                                        type="button"
                                        onClick={() => onDelete(product.id)}
                                        className="h-11 px-5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold flex items-center gap-2 transition-colors"
                                    >
                                        <Trash2 size={15} /> Delete Product
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="h-11 px-6 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    form="product-editor-form"
                                    className="h-11 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-slate-900/20"
                                >
                                    <Save size={15} /> Save Changes
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    return createPortal(modal, document.body);
}
