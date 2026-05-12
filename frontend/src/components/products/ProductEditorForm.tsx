'use client';

/**
 * ProductEditorForm — in-page Edit Product form used by both admin and
 * supplier. Renders inline (no modal/portal) so it lives inside the
 * page route's normal layout — the sidebar stays fixed, the user just
 * navigates from the products table to `/{role}/products/[id]/edit`.
 *
 * Two modes:
 *   • mode="supplier" — minimal field set (image · price · stock ·
 *     product details · logistics). No verification badge, no admin
 *     notes, no status override.
 *   • mode="admin" — adds the "Verified by Atlantis" status card with
 *     product ID + created date, an Admin Notes textarea, and a Status
 *     dropdown (APPROVED / PENDING / REJECTED / NEEDS_CHANGES).
 *
 * Pricing: the form displays `basePrice ?? price` converted from the
 * platform base currency. On save we convert back and send the raw
 * value as both `price` and `basePrice`; the backend stores `basePrice`
 * and re-applies the platform markup for the customer-facing `price`.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Upload,
    Save,
    Image as ImageIcon,
    Trash2,
    ShieldCheck,
    Euro,
    Box,
    Check,
    Loader2,
    Plus,
    FileText,
    Truck,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

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
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------
//  Props
// ---------------------------------------------------------------
interface ProductEditorFormProps {
    productId: string;
    mode?: 'admin' | 'supplier';
    /** Where to navigate back to (Cancel button + on success). */
    backHref: string;
}

const UNIT_TYPES = [
    { value: 'Piece', label: 'Piece', icon: '📦' },
    { value: 'Case', label: 'Case', icon: '📦' },
    { value: 'Pallet', label: 'Pallet', icon: '🏗️' },
    { value: 'Truck', label: 'Truck', icon: '🚛' },
];

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
    { value: 'PENDING', label: 'Pending Review', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { value: 'APPROVED', label: 'Approved', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { value: 'REJECTED', label: 'Rejected', color: 'text-red-700 bg-red-50 border-red-200' },
    { value: 'NEEDS_CHANGES', label: 'Needs Changes', color: 'text-orange-700 bg-orange-50 border-orange-200' },
];

// ---------------------------------------------------------------
//  Component
// ---------------------------------------------------------------
export default function ProductEditorForm({
    productId,
    mode = 'supplier',
    backHref,
}: ProductEditorFormProps) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [originalProduct, setOriginalProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<Product | null>(null);
    const [urlInputValue, setUrlInputValue] = useState('');

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
        return () => window.removeEventListener('currency-changed', onCurrencyChanged);
    }, []);

    const symbol =
        SUPPORTED_CURRENCIES.find((c) => c.code === activeCurrency)?.symbol || '€';

    // ---------------- Fetch product ----------------
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            try {
                const res = await apiFetch(`/products/${productId}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: Product = await res.json();
                if (cancelled) return;
                const rawPrice = data.basePrice ?? data.price ?? 0;
                setOriginalProduct(data);
                setFormData({
                    ...data,
                    price: convertFromBase(rawPrice, activeCurrency),
                    images:
                        data.images && data.images.length > 0
                            ? data.images
                            : data.image
                              ? [data.image]
                              : [],
                });
            } catch (err) {
                console.error('Failed to load product:', err);
                toast.error('Could not load product.');
                router.push(backHref);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productId]);

    // Re-convert price if the user flips the display currency mid-edit
    useEffect(() => {
        if (!originalProduct || !formData) return;
        const baseRaw = originalProduct.basePrice ?? originalProduct.price ?? 0;
        setFormData((prev) =>
            prev ? { ...prev, price: convertFromBase(baseRaw, activeCurrency) } : prev,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCurrency]);

    // ---------------- Image handlers ----------------
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0 || !formData) return;

        setIsUploading(true);
        try {
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
                setFormData({ ...formData, images: combined, image: combined[0] });
                toast.success(`Uploaded ${uploaded.length} image${uploaded.length > 1 ? 's' : ''}`);
            }
        } catch (err) {
            console.error('Image upload failed:', err);
            toast.error('Upload failed');
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const addImageUrl = (url: string) => {
        if (!formData) return;
        const trimmed = url.trim();
        if (!trimmed) return;
        const existing = formData.images || [];
        if (existing.includes(trimmed)) return;
        const combined = [...existing, trimmed];
        setFormData({ ...formData, images: combined, image: combined[0] });
    };

    const removeImage = (idx: number) => {
        if (!formData) return;
        const remaining = (formData.images || []).filter((_, i) => i !== idx);
        setFormData({
            ...formData,
            images: remaining,
            image: remaining[0] || '',
        });
    };

    // ---------------- Save ----------------
    const handleSave = async () => {
        if (!formData) return;
        setIsSaving(true);
        const tid = toast.loading('Saving changes…');
        try {
            const displayPrice = formData.price || 0;
            const newBasePrice = convertToBase(displayPrice, activeCurrency);

            // Stability rule: only send `price` to PATCH when the
            // supplier-raw price actually changed. Otherwise the
            // backend re-runs basePrice × markup on every save and
            // the customer-facing price drifts.
            const oldBase = originalProduct?.basePrice ?? originalProduct?.price ?? 0;
            const basePriceChanged = Math.abs(newBasePrice - oldBase) > 0.005;

            const payload: any = {
                name: formData.name,
                description: formData.description,
                brand: formData.brand,
                ean: formData.ean,
                category: formData.category,
                stock: formData.stock,
                unit: formData.unit,
                moq: formData.moq ?? formData.minOrder,
                moqUnit: formData.moqUnit,
                unitsPerCase: formData.unitsPerCase,
                casesPerPallet: formData.casesPerPallet,
                unitsPerPallet: formData.unitsPerPallet,
                palletsPerShipment: formData.palletsPerShipment,
                weight: formData.weight,
                shelfLife: formData.shelfLife,
                origin: formData.origin,
                exwLocation: formData.exwLocation,
                leadTime: formData.leadTime,
                readyForDispatch: formData.readyForDispatch,
                images: formData.images,
            };

            if (basePriceChanged) {
                payload.price = newBasePrice;
            }

            // Admin-only fields — never let suppliers send these.
            if (mode === 'admin') {
                payload.status = formData.status;
                payload.adminNotes = formData.adminNotes;
            }

            const res = await apiFetch(`/products/${productId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Save failed');
            }
            toast.success('Product saved', { id: tid });
            router.push(backHref);
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Save failed', { id: tid });
        } finally {
            setIsSaving(false);
        }
    };

    // ---------------- Delete (admin only) ----------------
    const handleDelete = async () => {
        if (mode !== 'admin') return;
        if (!confirm('Delete this product? This cannot be undone.')) return;
        const tid = toast.loading('Deleting…');
        try {
            const res = await apiFetch(`/products/${productId}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Delete failed');
            }
            toast.success('Product deleted', { id: tid });
            router.push(backHref);
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Delete failed', { id: tid });
        }
    };

    // ---------------- Render ----------------
    if (isLoading || !formData) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-500">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="text-sm font-medium">Loading product…</span>
                </div>
            </div>
        );
    }

    const verifiedDate = originalProduct?.createdAt
        ? new Date(originalProduct.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          })
        : '—';
    const shortId = originalProduct?.id
        ? `MOD ${originalProduct.id.slice(0, 6).toUpperCase()}`
        : 'NEW';

    return (
        <div className="bg-slate-50 min-h-full">
            {/* ── Page header ── */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
                <div className="px-6 lg:px-10 py-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <button
                            type="button"
                            onClick={() => router.push(backHref)}
                            className="w-10 h-10 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors flex-shrink-0"
                            title="Back to products"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight truncate">
                                Edit Product
                            </h1>
                            <p className="text-sm text-slate-500 mt-0.5">
                                Update your product details and settings
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => router.push(backHref)}
                            className="h-11 px-5 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="h-11 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-slate-900/20 disabled:opacity-60"
                        >
                            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="p-6 lg:p-10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1400px] mx-auto">
                    {/* ─── Left column ─── */}
                    <div className="lg:col-span-4 space-y-6">
                        {/* Product Images card — supports MULTIPLE uploads & URLs.
                            The user explicitly asked for this: "ما بيقدرش يرفع
                            أو يضيف كذا رابط للصورة أو يرفع كذا صورة" — the
                            previous single-image UX confused suppliers. Now the
                            file picker has `multiple` on, the URL field has an
                            explicit Add button (not just Enter), and every
                            uploaded image renders as a thumbnail tile with a
                            "Main" badge on the first one. */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">
                                        Product Images
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Upload one or more product photos. First image is shown as the main.
                                    </p>
                                </div>
                                {(formData.images?.length ?? 0) > 0 && (
                                    <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                                        {formData.images!.length} image
                                        {formData.images!.length === 1 ? '' : 's'}
                                    </span>
                                )}
                            </div>

                            {/* Main image (largest tile) */}
                            <div className="aspect-square rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center relative group">
                                {formData.images?.[0] ? (
                                    <>
                                        <img
                                            src={formData.images[0]}
                                            alt={formData.name || 'Product'}
                                            referrerPolicy="no-referrer"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                            className="w-full h-full object-contain p-4"
                                        />
                                        <span className="absolute top-2 left-2 inline-flex items-center h-6 px-2.5 rounded-full bg-slate-900/85 text-white text-[10px] font-bold uppercase tracking-wider">
                                            Main
                                        </span>
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
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex flex-col items-center text-slate-400 hover:text-slate-600 transition-colors w-full h-full justify-center"
                                    >
                                        <ImageIcon size={36} strokeWidth={1.5} />
                                        <span className="text-xs mt-2 font-semibold">
                                            Click to add images
                                        </span>
                                    </button>
                                )}
                            </div>

                            {/* Thumbnail strip — every uploaded image, including the
                                first one so the user always sees the full set.
                                Click a thumb to promote it to "main" position. */}
                            {(formData.images || []).length > 0 && (
                                <div className="grid grid-cols-4 gap-2">
                                    {formData.images!.map((img, idx) => (
                                        <div
                                            key={img + idx}
                                            className={
                                                'relative aspect-square rounded-lg border bg-white overflow-hidden group/thumb cursor-pointer transition-all ' +
                                                (idx === 0
                                                    ? 'border-slate-900 ring-2 ring-slate-900/10'
                                                    : 'border-slate-200 hover:border-slate-400')
                                            }
                                            onClick={() => {
                                                if (idx === 0 || !formData) return;
                                                const reordered = [
                                                    img,
                                                    ...formData.images!.filter((_, i) => i !== idx),
                                                ];
                                                setFormData({
                                                    ...formData,
                                                    images: reordered,
                                                    image: reordered[0],
                                                });
                                            }}
                                            title={
                                                idx === 0
                                                    ? 'Main image'
                                                    : 'Click to set as main image'
                                            }
                                        >
                                            <img
                                                src={img}
                                                alt=""
                                                referrerPolicy="no-referrer"
                                                className="w-full h-full object-contain p-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeImage(idx);
                                                }}
                                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white/90 hover:bg-red-50 text-slate-500 hover:text-red-600 flex items-center justify-center shadow opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                                title="Remove image"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    ))}
                                    {/* "Add more" tile — gives a visual hint that you
                                        can keep adding without finding the button. */}
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="aspect-square rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 text-slate-400 hover:text-slate-600 flex flex-col items-center justify-center transition-colors disabled:opacity-50"
                                        title="Add more images"
                                    >
                                        <Plus size={18} />
                                        <span className="text-[9px] font-semibold mt-0.5">
                                            Add
                                        </span>
                                    </button>
                                </div>
                            )}

                            {/* Upload button — explicitly says "Upload Images" so
                                suppliers know they can pick multiple files at once. */}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="w-full h-11 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            >
                                <Upload size={15} />
                                {isUploading
                                    ? 'Uploading…'
                                    : (formData.images?.length ?? 0) > 0
                                      ? 'Upload More Images'
                                      : 'Upload Images'}
                            </button>

                            {/* URL input + explicit Add button. Pressing Enter
                                still works, but the button makes it obvious that
                                the URL doesn't auto-add when you tab away. */}
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    value={urlInputValue}
                                    onChange={(e) => setUrlInputValue(e.target.value)}
                                    placeholder="Or paste an image URL…"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addImageUrl(urlInputValue);
                                            setUrlInputValue('');
                                        }
                                    }}
                                    className="flex-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        addImageUrl(urlInputValue);
                                        setUrlInputValue('');
                                    }}
                                    disabled={!urlInputValue.trim()}
                                    className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Add URL
                                </button>
                            </div>

                            <p className="text-[11px] text-slate-400 text-center">
                                JPG, PNG or WEBP. You can upload multiple files at once. Max 5MB each.
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

                        {/* Product Status card — admin only */}
                        {mode === 'admin' && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-bold text-slate-900">
                                        Product Status
                                    </h3>
                                    {formData.status === 'APPROVED' && (
                                        <div className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                                            <ShieldCheck size={13} />
                                            Verified
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500">
                                    This product is reviewed and verified by Atlantis.
                                </p>

                                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        Status
                                    </label>
                                    <select
                                        value={formData.status as string}
                                        onChange={(e) =>
                                            setFormData({ ...formData, status: e.target.value as any })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 appearance-none"
                                    >
                                        {STATUS_OPTIONS.map((s) => (
                                            <option key={s.value} value={s.value}>
                                                {s.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-100">
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

                                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                    <label className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                                        <FileText size={11} /> Admin Notes (internal)
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Internal notes — not visible to the supplier."
                                        value={formData.adminNotes || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, adminNotes: e.target.value })
                                        }
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 resize-none"
                                    />
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
                                            onChange={(e) => setActiveCurrency(e.target.value)}
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
                                            className="w-28 h-11 rounded-xl border border-slate-200 bg-white px-3 text-2xl font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                        />
                                        <span className="text-sm text-slate-500 pb-2.5">cases</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Product Details */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                            <h3 className="text-base font-bold text-slate-900">Product Details</h3>

                            {/* Name — full width */}
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

                            {/* Brand + EAN */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        Brand
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Lavazza"
                                        value={formData.brand || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, brand: e.target.value })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        EAN / Barcode
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="13-digit barcode"
                                        value={formData.ean || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, ean: e.target.value })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-slate-500">
                                    Description
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Brief description shown to buyers…"
                                    value={formData.description || ''}
                                    onChange={(e) =>
                                        setFormData({ ...formData, description: e.target.value })
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 resize-none"
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
                                        Minimum Order ({formData.unit || 'Cases'}){' '}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        required
                                        value={formData.minOrder || formData.moq || ''}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value) || 1;
                                            setFormData({ ...formData, minOrder: v, moq: v });
                                        }}
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
                                    <p className="text-[11px] text-slate-400">Enter weight per single unit</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        BBD (Best Before Date) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="YYYY-MM-DD"
                                        value={formData.shelfLife || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, shelfLife: e.target.value })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                    />
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
                                </div>
                            </div>
                        </div>

                        {/* Logistics card — pieces/case, cases/pallet, pallets/shipment, EXW */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                    <Truck size={18} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">
                                        Logistics & Packaging
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Used to quote shipping costs from origin to the buyer.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        Pieces per Case <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.unitsPerCase ?? ''}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                unitsPerCase: parseInt(e.target.value) || 0,
                                            })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        Cases per Pallet <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.casesPerPallet ?? ''}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                casesPerPallet: parseInt(e.target.value) || 0,
                                            })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        Pallets per Shipment <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.palletsPerShipment ?? ''}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                palletsPerShipment: parseInt(e.target.value) || 0,
                                            })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        Currently In (EXW Location) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Netherlands warehouse"
                                        value={formData.exwLocation || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, exwLocation: e.target.value })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                    />
                                    <p className="text-[11px] text-slate-400">
                                        Where the goods physically sit today
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500">
                                        Lead Time (days)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={formData.leadTime ?? ''}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                leadTime: parseInt(e.target.value) || 0,
                                            })
                                        }
                                        className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Delete (admin only — footer of right col) */}
                        {mode === 'admin' && (
                            <div className="flex justify-start">
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    className="h-11 px-5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold flex items-center gap-2 transition-colors"
                                >
                                    <Trash2 size={15} /> Delete Product
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
