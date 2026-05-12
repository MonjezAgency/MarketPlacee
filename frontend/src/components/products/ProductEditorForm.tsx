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

// Unit Type intentionally lists Case first — Atlantis is a wholesale
// B2B platform and 90% of supplier listings are case-level, not piece.
// Operator-requested: don't default to "Piece" — force a deliberate
// pick or land on Case as the safer default.
const UNIT_TYPES = [
    { value: '', label: 'Select unit type…', icon: '' },
    { value: 'Case', label: 'Case', icon: '📦' },
    { value: 'Piece', label: 'Piece', icon: '🧩' },
    { value: 'Pallet', label: 'Pallet', icon: '🏗️' },
    { value: 'Truck', label: 'Truck', icon: '🚛' },
];

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
    { value: 'PENDING', label: 'Pending Review', color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { value: 'APPROVED', label: 'Approved', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { value: 'REJECTED', label: 'Rejected', color: 'text-red-700 bg-red-50 border-red-200' },
    { value: 'NEEDS_CHANGES', label: 'Needs Changes', color: 'text-orange-700 bg-orange-50 border-orange-200' },
];

// Valid EAN/UPC formats. Backend ExcelService accepts the same set.
const VALID_EAN_LENGTHS = [8, 12, 13, 14];
const isValidEan = (ean: string): boolean => {
    const digits = (ean || '').replace(/[^0-9X]/gi, '');
    return digits.length === 0 || VALID_EAN_LENGTHS.includes(digits.length);
};

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
    // Per-piece price the supplier types — separate from the form-data
    // `price` (which is per-case, persisted as basePrice). We multiply
    // by unitsPerCase to compute the case price on save.
    const [pricePerPieceInput, setPricePerPieceInput] = useState('');
    // EAN validation message (live, shown under the field).
    const [eanError, setEanError] = useState<string | null>(null);

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
                const rawCasePrice = data.basePrice ?? data.price ?? 0;
                const displayCasePrice = convertFromBase(rawCasePrice, activeCurrency);
                setOriginalProduct(data);
                setFormData({
                    ...data,
                    price: displayCasePrice,
                    images:
                        data.images && data.images.length > 0
                            ? data.images
                            : data.image
                              ? [data.image]
                              : [],
                });
                // Derive per-piece price from the stored case price.
                // If unitsPerCase is missing we fall back to the case
                // price itself so the field is never empty.
                const upc = Number(data.unitsPerCase) || 0;
                const piecePrice = upc > 0 ? displayCasePrice / upc : displayCasePrice;
                setPricePerPieceInput(piecePrice ? piecePrice.toFixed(2) : '');
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

        // Client-side EAN format gate. Backend strips invalid EANs but
        // we want to tell the supplier immediately instead of letting
        // them save and find out later that the field went blank.
        if (formData.ean && !isValidEan(formData.ean)) {
            toast.error('Barcode must be 8, 12, 13, or 14 digits (EAN/UPC/ITF-14).');
            setEanError(
                'Barcode must be 8, 12, 13, or 14 digits (EAN/UPC/ITF-14).',
            );
            return;
        }
        if (!formData.unit) {
            toast.error('Pick a Unit Type before saving.');
            return;
        }

        setIsSaving(true);
        const tid = toast.loading('Saving changes…');
        try {
            // Compute the case price the backend persists as basePrice.
            // Pricing model: supplier types per-piece, system multiplies
            // by unitsPerCase. If unitsPerCase isn't set yet, we treat
            // the typed value as already-per-case so the legacy path
            // (admin who just wants to set the case price directly)
            // still works.
            const piecePrice =
                parseFloat(pricePerPieceInput.replace(',', '.')) || 0;
            const upc = Number(formData.unitsPerCase) || 0;
            const displayPrice = upc > 0 ? piecePrice * upc : piecePrice;
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
            <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 dark:bg-[#0a0a0b]">
                <div className="flex items-center gap-3 text-slate-500 dark:text-zinc-500">
                    <Loader2 className="animate-spin" size={18} />
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
        // ─────────────────────────────────────────────────────────────
        // Premium B2B-SaaS palette inspired by Linear / Stripe / Vercel.
        //
        // Light mode keeps the same slate scale. Dark mode uses a tight,
        // layered set of neutral zinc surfaces — page < section < card <
        // input — so depth comes from background contrast, not borders.
        // Borders, when used, are tiny white-alpha rings (≤8% opacity)
        // and accent colours sit on subtle 10–20% tints rather than
        // solid blocks.
        //
        // Spacing rhythm: the page has wide breathing room (p-8 lg:p-10)
        // and each card uses p-6/p-7 to create distinct focus areas.
        // Headers use a thin top border + backdrop blur so the page
        // doesn't feel boxed-in.
        // ─────────────────────────────────────────────────────────────
        <div className="min-h-full bg-slate-50 dark:bg-[#0a0a0b]">
            {/* ── Page header ── */}
            <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-[#0a0a0b]/85 border-b border-slate-200 dark:border-white/[0.06]">
                <div className="px-6 lg:px-10 py-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <button
                            type="button"
                            onClick={() => router.push(backHref)}
                            className="w-10 h-10 rounded-xl text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center justify-center transition-colors flex-shrink-0"
                            title="Back to products"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-[22px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight truncate leading-none">
                                Edit Product
                            </h1>
                            <p className="text-[13px] text-slate-500 dark:text-zinc-500 mt-1.5">
                                Update your product details and settings
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => router.push(backHref)}
                            className="h-10 px-4 rounded-lg bg-transparent text-slate-700 dark:text-zinc-300 text-[13px] font-medium hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="h-10 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-zinc-50 dark:hover:bg-white text-white dark:text-zinc-900 text-[13px] font-semibold flex items-center gap-2 transition-all shadow-sm hover:shadow disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="px-6 lg:px-10 py-8 lg:py-10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 max-w-[1320px] mx-auto">
                    {/* ─── Left column ─── */}
                    <div className="lg:col-span-4 space-y-5">
                        {/* Product Images card — supports MULTIPLE uploads & URLs.
                            The user explicitly asked for this: "ما بيقدرش يرفع
                            أو يضيف كذا رابط للصورة أو يرفع كذا صورة" — the
                            previous single-image UX confused suppliers. Now the
                            file picker has `multiple` on, the URL field has an
                            explicit Add button (not just Enter), and every
                            uploaded image renders as a thumbnail tile with a
                            "Main" badge on the first one. */}
                        <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
                                        Product Images
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
                                        Upload one or more product photos. First image is shown as the main.
                                    </p>
                                </div>
                                {(formData.images?.length ?? 0) > 0 && (
                                    <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 text-[11px] font-medium">
                                        {formData.images!.length} image
                                        {formData.images!.length === 1 ? '' : 's'}
                                    </span>
                                )}
                            </div>

                            {/* Main image (largest tile) */}
                            <div className="aspect-square rounded-xl bg-slate-100 dark:bg-[#1c1c20] border border-slate-200 dark:border-white/[0.06] overflow-hidden flex items-center justify-center relative group">
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
                                        <span className="absolute top-2 left-2 inline-flex items-center h-6 px-2.5 rounded-full bg-slate-900/85 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-bold uppercase tracking-wider">
                                            Main
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeImage(0)}
                                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 dark:bg-zinc-900/90 hover:bg-red-50 dark:hover:bg-red-500/15 text-slate-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Remove image"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex flex-col items-center text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors w-full h-full justify-center"
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
                                                'relative aspect-square rounded-lg border bg-white dark:bg-[#1c1c20] overflow-hidden group/thumb cursor-pointer transition-all ' +
                                                (idx === 0
                                                    ? 'border-slate-900 dark:border-zinc-100 ring-2 ring-slate-900/10 dark:ring-zinc-100/15'
                                                    : 'border-slate-200 dark:border-white/[0.06] hover:border-slate-400 dark:hover:border-white/20')
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
                                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white/90 dark:bg-zinc-900/90 hover:bg-red-50 dark:hover:bg-red-500/15 text-slate-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shadow opacity-0 group-hover/thumb:opacity-100 transition-opacity"
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
                                        className="aspect-square rounded-lg border border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:border-slate-400 dark:hover:border-white/25 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 flex flex-col items-center justify-center transition-colors disabled:opacity-50"
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
                                className="w-full h-10 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:border-slate-300 dark:hover:border-white/[0.12] text-slate-700 dark:text-zinc-200 text-[13px] font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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
                                    className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-xs text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05]"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        addImageUrl(urlInputValue);
                                        setUrlInputValue('');
                                    }}
                                    disabled={!urlInputValue.trim()}
                                    className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                >
                                    Add URL
                                </button>
                            </div>

                            <p className="text-[11px] text-slate-400 dark:text-zinc-600 text-center">
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
                            <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
                                        Product Status
                                    </h3>
                                    {formData.status === 'APPROVED' && (
                                        <div className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                                            <ShieldCheck size={13} />
                                            Verified
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-zinc-500 leading-relaxed">
                                    This product is reviewed and verified by Atlantis.
                                </p>

                                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Status
                                    </label>
                                    <select
                                        value={formData.status as string}
                                        onChange={(e) =>
                                            setFormData({ ...formData, status: e.target.value as any })
                                        }
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12] appearance-none"
                                    >
                                        {STATUS_OPTIONS.map((s) => (
                                            <option key={s.value} value={s.value}>
                                                {s.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-zinc-600 font-semibold">
                                            Product ID
                                        </p>
                                        <p className="text-[14px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight mt-1">
                                            {shortId}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-zinc-600 font-semibold">
                                            Added on
                                        </p>
                                        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mt-1">
                                            {verifiedDate}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <FileText size={11} /> Admin Notes (internal)
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Internal notes — not visible to the supplier."
                                        value={formData.adminNotes || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, adminNotes: e.target.value })
                                        }
                                        className="w-full rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] resize-none leading-relaxed"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ─── Right column ─── */}
                    <div className="lg:col-span-8 space-y-6">
                        {/* Top stats: Price + Stock
                            ───────────────────────────────────────────
                            Pricing model:
                            The supplier types the PER-PIECE price (not
                            per-case). We multiply by `unitsPerCase` to
                            derive the per-case price that the backend
                            stores as `basePrice` (and the platform
                            markup is applied on top of that for the
                            customer-facing `price`).

                            Why this UX flip: when suppliers list a
                            wholesale offer they think in piece prices
                            ("my Glucerna shake costs me €1.20"). They
                            then declare "case has 24 pieces" → we do
                            the math. Asking them to pre-multiply was
                            error-prone.

                            All number inputs use `inputMode="decimal"`
                            with `type="text"` so the browser doesn't
                            render the up/down spinner arrows the
                            operator complained about ("بيقعد يعلي
                            لحد ما يوصل الوزن"). Pure typing UX. */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {/* Price card */}
                            <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-100 dark:ring-blue-500/20 flex items-center justify-center">
                                        <Euro size={16} />
                                    </div>
                                    <h3 className="text-[14px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
                                        Currency & Price per Piece
                                    </h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                            Currency
                                        </label>
                                        <select
                                            value={activeCurrency}
                                            onChange={(e) => setActiveCurrency(e.target.value)}
                                            className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12] appearance-none"
                                        >
                                            {SUPPORTED_CURRENCIES.map((c) => (
                                                <option key={c.code} value={c.code}>
                                                    {c.code}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                            Price per Piece
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 font-semibold text-sm pointer-events-none">
                                                {symbol}
                                            </span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                required
                                                placeholder="0.00"
                                                value={pricePerPieceInput}
                                                onChange={(e) =>
                                                    setPricePerPieceInput(e.target.value)
                                                }
                                                onBlur={() => {
                                                    const v = parseFloat(
                                                        pricePerPieceInput.replace(',', '.'),
                                                    );
                                                    if (!isNaN(v)) {
                                                        setPricePerPieceInput(v.toFixed(2));
                                                    }
                                                }}
                                                className="w-full h-10 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] pl-8 pr-3 text-sm font-semibold text-slate-900 dark:text-zinc-100 tabular-nums outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                            />
                                        </div>
                                    </div>
                                </div>
                                {/* Live case-price preview */}
                                <div className="rounded-lg bg-slate-50 dark:bg-white/[0.025] border border-slate-200/70 dark:border-white/[0.05] px-3.5 py-2.5 flex items-center justify-between">
                                    <div className="text-[11px] text-slate-500 dark:text-zinc-500">
                                        {(formData.unitsPerCase ?? 0) > 0
                                            ? `${formData.unitsPerCase} pieces per case`
                                            : 'Set "Pieces per Case" below to compute the case price'}
                                    </div>
                                    <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100 tabular-nums">
                                        {symbol}
                                        {(
                                            (parseFloat(pricePerPieceInput.replace(',', '.')) || 0) *
                                            (formData.unitsPerCase ?? 0)
                                        ).toFixed(2)}
                                        <span className="text-[10px] text-slate-400 dark:text-zinc-600 font-medium ml-1">
                                            / case
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Stock card */}
                            <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 ring-1 ring-teal-100 dark:ring-teal-500/20 flex items-center justify-center">
                                            <Box size={16} />
                                        </div>
                                        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
                                            Stock Level (Cases)
                                        </h3>
                                    </div>
                                    {(formData.stock ?? 0) > 0 && (
                                        <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
                                            <Check size={11} />
                                            In Stock
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Available Stock
                                    </label>
                                    <div className="flex items-end gap-2">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            required
                                            value={formData.stock ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value.replace(/[^0-9]/g, '');
                                                setFormData({
                                                    ...formData,
                                                    stock: v === '' ? 0 : parseInt(v, 10),
                                                });
                                            }}
                                            className="w-24 h-10 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3 text-2xl font-semibold text-slate-900 dark:text-zinc-50 tabular-nums outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05]"
                                        />
                                        <span className="text-xs text-slate-500 dark:text-zinc-500 pb-2.5">cases</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Product Details */}
                        <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-5">
                            <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">Product Details</h3>

                            {/* Name — full width */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
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
                                    className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-[15px] font-medium text-slate-900 dark:text-zinc-100 placeholder:font-normal placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                />
                            </div>

                            {/* Brand + EAN */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Brand
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Lavazza"
                                        value={formData.brand || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, brand: e.target.value })
                                        }
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        EAN / Barcode
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="13-digit barcode"
                                        maxLength={14}
                                        value={formData.ean || ''}
                                        onChange={(e) => {
                                            // Strip everything but digits (EAN/UPC/ITF). Cap
                                            // at 14 chars (longest valid format, ITF-14).
                                            const digits = e.target.value
                                                .replace(/[^0-9]/g, '')
                                                .slice(0, 14);
                                            setFormData({ ...formData, ean: digits });
                                            // Live validation: anything non-empty must be
                                            // one of the accepted lengths.
                                            if (digits && !isValidEan(digits)) {
                                                setEanError(
                                                    `Barcode must be 8, 12, 13, or 14 digits. You entered ${digits.length}.`,
                                                );
                                            } else {
                                                setEanError(null);
                                            }
                                        }}
                                        className={
                                            'w-full h-11 rounded-lg border bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium tracking-wide text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:ring-2 ' +
                                            (eanError
                                                ? 'border-red-300 dark:border-red-500/40 focus:border-red-400 dark:focus:border-red-400 focus:ring-red-100 dark:focus:ring-red-500/15'
                                                : 'border-slate-200 dark:border-white/[0.07] focus:border-slate-400 dark:focus:border-white/20 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]')
                                        }
                                    />
                                    {eanError ? (
                                        <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                                            {eanError}
                                        </p>
                                    ) : (
                                        <p className="text-[11px] text-slate-400 dark:text-zinc-600">
                                            EAN-13 / EAN-8 / UPC-A / ITF-14 accepted
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                    Description
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Brief description shown to buyers…"
                                    value={formData.description || ''}
                                    onChange={(e) =>
                                        setFormData({ ...formData, description: e.target.value })
                                    }
                                    className="w-full rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] resize-none leading-relaxed"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Unit Type <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={formData.unit || 'Piece'}
                                        onChange={(e) =>
                                            setFormData({ ...formData, unit: e.target.value })
                                        }
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12] appearance-none"
                                    >
                                        {UNIT_TYPES.map((u) => (
                                            <option key={u.value} value={u.value}>
                                                {u.icon} {u.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Minimum Order ({formData.unit || 'Cases'}){' '}
                                        <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        required
                                        value={formData.minOrder || formData.moq || ''}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 1;
                                            setFormData({ ...formData, minOrder: v, moq: v });
                                        }}
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Weight per Unit (kg) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="e.g. 0.330"
                                        value={formData.weight ?? ''}
                                        onChange={(e) => {
                                            // Allow only digits + one decimal separator
                                            // (. or ,). No spinner arrows.
                                            const v = e.target.value.replace(/[^0-9.,]/g, '');
                                            setFormData({
                                                ...formData,
                                                weight: v as any,
                                            });
                                        }}
                                        onBlur={(e) => {
                                            const v = parseFloat(
                                                e.target.value.replace(',', '.'),
                                            );
                                            setFormData({
                                                ...formData,
                                                weight: isNaN(v) ? 0 : v,
                                            });
                                        }}
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                    />
                                    <p className="text-[11px] text-slate-400 dark:text-zinc-600">
                                        Auto-extracted from product name if left blank (e.g. "250g" → 0.250)
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        BBD (Best Before Date) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="YYYY-MM-DD"
                                        value={formData.shelfLife || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, shelfLife: e.target.value })
                                        }
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                    />
                                </div>
                            </div>

                            {/* Category + Country of Origin */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Category <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={formData.category || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, category: e.target.value })
                                        }
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12] appearance-none"
                                    >
                                        {CATEGORIES_LIST.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Country of Origin <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={formData.origin || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, origin: e.target.value })
                                        }
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12] appearance-none"
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
                        <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-5">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-100 dark:ring-amber-500/20 flex items-center justify-center">
                                    <Truck size={16} />
                                </div>
                                <div>
                                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
                                        Logistics & Packaging
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
                                        Used to quote shipping costs from origin to the buyer.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Pieces per Case <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formData.unitsPerCase ?? ''}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value.replace(/[^0-9]/g, ''));
                                            setFormData({
                                                ...formData,
                                                unitsPerCase: isNaN(v) ? 0 : v,
                                            });
                                        }}
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Cases per Pallet <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formData.casesPerPallet ?? ''}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value.replace(/[^0-9]/g, ''));
                                            setFormData({
                                                ...formData,
                                                casesPerPallet: isNaN(v) ? 0 : v,
                                            });
                                        }}
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Pallets per Shipment <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formData.palletsPerShipment ?? ''}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value.replace(/[^0-9]/g, ''));
                                            setFormData({
                                                ...formData,
                                                palletsPerShipment: isNaN(v) ? 0 : v,
                                            });
                                        }}
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Currently In (EXW Location) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Netherlands warehouse"
                                        value={formData.exwLocation || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, exwLocation: e.target.value })
                                        }
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                    />
                                    <p className="text-[11px] text-slate-400 dark:text-zinc-600">
                                        Where the goods physically sit today
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                                        Lead Time (days)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={formData.leadTime ?? ''}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value.replace(/[^0-9]/g, ''));
                                            setFormData({
                                                ...formData,
                                                leadTime: isNaN(v) ? 0 : v,
                                            });
                                        }}
                                        className="w-full h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
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
                                    className="h-10 px-4 rounded-lg bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/15 text-red-600 dark:text-red-400 text-[13px] font-medium ring-1 ring-red-100 dark:ring-red-500/20 flex items-center gap-2 transition-colors"
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
