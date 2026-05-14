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
    HelpCircle,
    ChevronDown,
    ChevronUp,
    Layers,
    X,
    Video,
    Play,
    DollarSign,
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

// ─────────────────────────────────────────────────────────────────────
//  VariantsEditor — Shopify-style options builder
// ─────────────────────────────────────────────────────────────────────
//
// Render contract:
//   value:    Array<{ name: string; values: string[] }>
//   onChange: (next) => void
//
// Behaviour:
//   • "Add another option" appends an empty group at the end.
//   • Each group has its own name input + value chips. Removing a chip
//     splices it out; pressing Enter or comma in the input appends.
//   • Removing the entire group drops it from the array.
//   • Empty groups are kept in state while the user types but get
//     filtered out at save time (handled by the parent's onChange
//     normaliser). For now we accept them in state — the cleanup
//     happens in handleSave's payload prep.
type VariantGroup = { name: string; values: string[] };

function VariantsEditor({
    value,
    onChange,
}: {
    value: VariantGroup[];
    onChange: (next: VariantGroup[]) => void;
}) {
    const [drafts, setDrafts] = React.useState<Record<number, string>>({});

    // Normalise legacy / loose shapes. Some products in the DB carry
    // variants in slightly different shapes (e.g. {name, value: "x"}
    // single-value, or extra translation entries with name starting
    // with "__"). Strip / fold those before rendering so the UI never
    // explodes on a malformed row.
    const groups: VariantGroup[] = React.useMemo(() => {
        if (!Array.isArray(value)) return [];
        return value
            .filter((v: any) => v && typeof v === 'object' && !String(v.name || '').startsWith('__'))
            .map((v: any) => ({
                name: String(v.name || ''),
                values: Array.isArray(v.values)
                    ? v.values.map((x: any) => String(x))
                    : v.value
                      ? [String(v.value)]
                      : [],
            }));
    }, [value]);

    const update = (idx: number, patch: Partial<VariantGroup>) => {
        const next = groups.map((g, i) => (i === idx ? { ...g, ...patch } : g));
        onChange(next);
    };

    const addGroup = () => onChange([...groups, { name: '', values: [] }]);
    const removeGroup = (idx: number) => onChange(groups.filter((_, i) => i !== idx));

    const addValue = (idx: number) => {
        const raw = (drafts[idx] || '').trim();
        if (!raw) return;
        // Split on comma so "Small, Medium, Large" adds three at once.
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
        const existing = groups[idx]?.values || [];
        const merged = [...existing, ...parts.filter((p) => !existing.includes(p))];
        update(idx, { values: merged });
        setDrafts((d) => ({ ...d, [idx]: '' }));
    };

    const removeValue = (idx: number, vIdx: number) => {
        const next = (groups[idx]?.values || []).filter((_, i) => i !== vIdx);
        update(idx, { values: next });
    };

    return (
        <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-violet-100 dark:ring-violet-500/20 flex items-center justify-center">
                        <Layers size={16} />
                    </div>
                    <div>
                        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
                            Variants &amp; Options
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
                            Add sizes, flavours, pack counts, or colours buyers can pick from.
                        </p>
                    </div>
                </div>
                {groups.length > 0 && (
                    <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 text-[11px] font-medium">
                        {groups.length} option{groups.length === 1 ? '' : 's'}
                    </span>
                )}
            </div>

            {groups.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/[0.10] bg-slate-50 dark:bg-white/[0.02] p-6 text-center">
                    <Layers size={20} className="mx-auto text-slate-400 dark:text-zinc-500 mb-2" />
                    <p className="text-[13px] font-medium text-slate-700 dark:text-zinc-300">
                        No options yet
                    </p>
                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1 mb-4 max-w-sm mx-auto leading-relaxed">
                        Skip this if your product comes in just one configuration. Add an option
                        when buyers need to pick (e.g. "Size: Small / Medium / Large").
                    </p>
                    <button
                        type="button"
                        onClick={addGroup}
                        className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                    >
                        <Plus size={14} /> Add an option
                    </button>
                </div>
            )}

            {groups.map((g, idx) => (
                <div
                    key={idx}
                    className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/60 dark:bg-white/[0.02] p-4 space-y-3"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                                Option name
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Size, Flavour, Pack, Colour"
                                value={g.name}
                                onChange={(e) => update(idx, { name: e.target.value })}
                                className="w-full h-10 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05]"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => removeGroup(idx)}
                            className="self-end h-10 w-10 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center transition-colors"
                            title="Remove this option"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                            Values
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[26px]">
                            {g.values.map((v, vIdx) => (
                                <span
                                    key={vIdx}
                                    className="inline-flex items-center gap-1 h-7 pl-3 pr-1 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-zinc-200 text-[12px] font-medium"
                                >
                                    {v}
                                    <button
                                        type="button"
                                        onClick={() => removeValue(idx, vIdx)}
                                        className="w-5 h-5 rounded-full hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 text-slate-400 dark:text-zinc-500 flex items-center justify-center transition-colors"
                                        title={`Remove "${v}"`}
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            ))}
                            {g.values.length === 0 && (
                                <span className="text-[11px] text-slate-400 dark:text-zinc-600 italic py-1.5">
                                    No values yet — add one below.
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Type a value (comma to add multiple) and press Enter"
                                value={drafts[idx] || ''}
                                onChange={(e) => setDrafts((d) => ({ ...d, [idx]: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addValue(idx);
                                    }
                                }}
                                className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3 text-xs text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05]"
                            />
                            <button
                                type="button"
                                onClick={() => addValue(idx)}
                                disabled={!(drafts[idx] || '').trim()}
                                className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            {groups.length > 0 && (
                <button
                    type="button"
                    onClick={addGroup}
                    className="w-full h-10 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.10] bg-transparent hover:bg-slate-50 dark:hover:bg-white/[0.04] text-slate-600 dark:text-zinc-400 text-[12px] font-medium flex items-center justify-center gap-2 transition-colors"
                >
                    <Plus size={14} /> Add another option
                </button>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────
// Mix-composer pricing editor — lets the supplier set a distinct
// image / label / price-per-case for every variant signature, so the
// PDP's "Mix this truck" composer has real data to show. The signatures
// are derived from the VariantsEditor's groups (Cartesian product) so
// the supplier doesn't have to keep two lists in sync.
// ────────────────────────────────────────────────────────────────────
type VariantMetaEntry = {
    image?: string;
    label?: string;
    // Per-variant pack sizes — each falls back to the parent product
    // value when missing. Lets the supplier model the case where Diet
    // ships in 12-packs while Regular ships in 24-packs.
    unitsPerCase?: number;
    casesPerPallet?: number;
    palletsPerShipment?: number;
};
type VariantPricesMap = Record<string, number>;
type VariantMetaMap = Record<string, VariantMetaEntry>;

function buildSignatures(groups: VariantGroup[]): string[] {
    const valid = groups.filter(g => g.name && g.values.length > 0);
    if (valid.length === 0) return [];
    // Cartesian product of value lists. Each leaf becomes a signature
    // like "Flavour=Diet|Size=Large" — group names sorted A→Z so the
    // signature is stable regardless of input order.
    const sorted = [...valid].sort((a, b) => a.name.localeCompare(b.name));
    const combos: Array<Record<string, string>> = [{}];
    for (const g of sorted) {
        const next: Array<Record<string, string>> = [];
        for (const c of combos) {
            for (const v of g.values) {
                next.push({ ...c, [g.name]: v });
            }
        }
        combos.splice(0, combos.length, ...next);
    }
    return combos.map(c =>
        Object.keys(c)
            .sort()
            .map(k => `${k}=${c[k]}`)
            .join('|'),
    );
}

function VariantPricingEditor({
    groups,
    prices,
    meta,
    parentImage,
    parentPrice,
    parentUnitsPerCase,
    parentCasesPerPallet,
    parentPalletsPerShipment,
    onPricesChange,
    onMetaChange,
}: {
    groups: VariantGroup[];
    prices: VariantPricesMap;
    meta: VariantMetaMap;
    parentImage?: string;
    parentPrice?: number;
    parentUnitsPerCase?: number;
    parentCasesPerPallet?: number;
    parentPalletsPerShipment?: number;
    onPricesChange: (next: VariantPricesMap) => void;
    onMetaChange: (next: VariantMetaMap) => void;
}) {
    const signatures = React.useMemo(() => buildSignatures(groups), [groups]);
    const uploadingRef = React.useRef<Record<string, boolean>>({});
    const [tick, setTick] = React.useState(0); // forces re-render after uploadingRef mutates

    const setPrice = (sig: string, val: number | '') => {
        const next = { ...prices };
        if (val === '' || isNaN(val as number)) delete next[sig];
        else next[sig] = Number(val);
        onPricesChange(next);
    };

    const setMeta = (sig: string, patch: Partial<VariantMetaEntry>) => {
        const next = { ...meta };
        next[sig] = { ...(next[sig] || {}), ...patch };
        onMetaChange(next);
    };

    const handleImagePick = async (sig: string, file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Only image files are allowed.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image too large (max 5 MB).');
            return;
        }
        uploadingRef.current[sig] = true;
        setTick(t => t + 1);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await apiFetch('/products/upload-image', { method: 'POST', body: fd });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                throw new Error(err?.message || `Upload failed (HTTP ${res.status})`);
            }
            const data = await res.json();
            if (!data?.url) throw new Error('Upload returned no URL');
            setMeta(sig, { image: data.url });
            toast.success('Variant image uploaded');
        } catch (e: any) {
            toast.error(e?.message || 'Upload failed');
        } finally {
            uploadingRef.current[sig] = false;
            setTick(t => t + 1);
        }
    };

    if (signatures.length === 0) {
        return null; // Nothing to price — VariantsEditor handles the empty state.
    }

    return (
        <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-1 ring-orange-100 dark:ring-orange-500/20 flex items-center justify-center">
                        <DollarSign size={16} />
                    </div>
                    <div>
                        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
                            Variant pricing &amp; images
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1 max-w-md leading-relaxed">
                            Each variant gets its own per-case price + (optional) image.
                            Used when the buyer mixes variants inside one truck/pallet
                            at checkout. Blank price falls back to the main product price.
                        </p>
                    </div>
                </div>
                <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 text-[11px] font-medium ring-1 ring-orange-100 dark:ring-orange-500/20">
                    {signatures.length} variant{signatures.length === 1 ? '' : 's'}
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {signatures.map(sig => {
                    const m = meta[sig] || {};
                    const price = prices[sig];
                    const isUploading = !!uploadingRef.current[sig];
                    const fallbackImg = m.image || parentImage || '';
                    return (
                        <div
                            key={sig}
                            className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50/60 dark:bg-white/[0.02] p-3 flex gap-3"
                        >
                            {/* Image slot */}
                            <label
                                className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-dashed border-slate-300 dark:border-white/[0.10] bg-white dark:bg-[#0F0F12] cursor-pointer flex items-center justify-center group"
                                title="Click to upload"
                            >
                                {fallbackImg ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={fallbackImg} alt={sig} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-slate-400 dark:text-zinc-500 text-[10px] font-bold text-center px-1">
                                        Upload<br />image
                                    </div>
                                )}
                                {isUploading && (
                                    <div className="absolute inset-0 bg-white/80 dark:bg-black/60 flex items-center justify-center">
                                        <Loader2 className="animate-spin text-slate-700 dark:text-zinc-300" size={18} />
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => {
                                        const f = e.target.files?.[0];
                                        if (f) handleImagePick(sig, f);
                                        e.target.value = '';
                                    }}
                                />
                            </label>

                            {/* Fields */}
                            <div className="flex-1 min-w-0 space-y-2">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 truncate">
                                        {sig}
                                    </p>
                                    <input
                                        type="text"
                                        value={m.label || ''}
                                        onChange={e => setMeta(sig, { label: e.target.value })}
                                        placeholder="Display name (optional)"
                                        className="mt-1 w-full h-8 px-2 rounded-md border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F0F12] text-[12px] focus:border-orange-400 focus:outline-none"
                                    />
                                </div>
                                <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">€</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={price ?? ''}
                                        onChange={e => setPrice(sig, e.target.value === '' ? '' : Number(e.target.value))}
                                        placeholder={parentPrice != null ? `${parentPrice.toFixed(2)} (fallback)` : 'Price per case'}
                                        className="w-full h-8 ps-6 pe-2 rounded-md border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F0F12] text-[12px] font-mono focus:border-orange-400 focus:outline-none"
                                    />
                                </div>

                                {/* Per-variant pack sizes. Blank = inherit
                                    the parent product's value (shown as the
                                    placeholder). Useful when one flavour
                                    ships in a different pack than the rest. */}
                                <div className="grid grid-cols-3 gap-1.5">
                                    <input
                                        type="number"
                                        min={0}
                                        value={m.unitsPerCase ?? ''}
                                        onChange={e => setMeta(sig, { unitsPerCase: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                                        placeholder={parentUnitsPerCase != null ? `${parentUnitsPerCase}/case` : 'pcs/case'}
                                        className="h-7 px-2 rounded-md border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F0F12] text-[11px] font-mono focus:border-orange-400 focus:outline-none"
                                        title="Pieces per case for this variant"
                                    />
                                    <input
                                        type="number"
                                        min={0}
                                        value={m.casesPerPallet ?? ''}
                                        onChange={e => setMeta(sig, { casesPerPallet: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                                        placeholder={parentCasesPerPallet != null ? `${parentCasesPerPallet}/pallet` : 'cs/pallet'}
                                        className="h-7 px-2 rounded-md border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F0F12] text-[11px] font-mono focus:border-orange-400 focus:outline-none"
                                        title="Cases per pallet for this variant"
                                    />
                                    <input
                                        type="number"
                                        min={0}
                                        value={m.palletsPerShipment ?? ''}
                                        onChange={e => setMeta(sig, { palletsPerShipment: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                                        placeholder={parentPalletsPerShipment != null ? `${parentPalletsPerShipment}/truck` : 'pl/truck'}
                                        className="h-7 px-2 rounded-md border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F0F12] text-[11px] font-mono focus:border-orange-400 focus:outline-none"
                                        title="Pallets per truck for this variant"
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed bg-slate-50 dark:bg-white/[0.02] rounded-lg px-3 py-2 border border-slate-100 dark:border-white/[0.04]">
                💡 Leave fields blank to inherit from the main product. Override only when a
                variant ships differently (e.g. <code className="font-mono text-orange-600">Pepsi 1L</code> = 12/case,
                <code className="font-mono text-orange-600 ms-1">Pepsi 330ml</code> = 24/case).
            </p>
        </div>
    );
}

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
    // Markup multipliers loaded from /config/markup. Admin uses these
    // to see "Case = €24, +10% = €26.40, etc." next to the supplier-
    // facing per-case preview. Defaults are sane multipliers (1.10 /
    // 1.05 / 1.02 = +10% / +5% / +2%) until the fetch resolves.
    const [markups, setMarkups] = useState<{ piece: number; pallet: number; container: number }>({
        piece: 1.10, pallet: 1.05, container: 1.02,
    });
    useEffect(() => {
        if (mode !== 'admin') return;
        (async () => {
            try {
                const { apiFetch } = await import('@/lib/api');
                const res = await apiFetch('/config/markup');
                if (res.ok) {
                    const data = await res.json();
                    if (data && typeof data === 'object') {
                        setMarkups((m) => ({
                            piece: Number(data.piece) || m.piece,
                            pallet: Number(data.pallet) || m.pallet,
                            container: Number(data.container) || m.container,
                        }));
                    }
                }
            } catch {}
        })();
    }, [mode]);
    // Image help drawer toggle. Operators report suppliers commonly
    // paste a Google Images RESULTS-PAGE URL (instead of the actual
    // image URL) and then complain "the image doesn't show up". A
    // collapsible "How to copy a real image link" walkthrough sits
    // next to the upload button and only opens when they click for it,
    // so it doesn't crowd the layout.
    const [showImageHelp, setShowImageHelp] = useState(false);
    // Videos — short demo clips. Capped to 60 s + 25 MB on upload,
    // YouTube/Vimeo URLs rejected because the operator's rule is
    // "short demo clips, not 10-minute YouTube videos". Kept as
    // its own state slice so the rest of the form stays untouched
    // when toggling videos.
    const [videoUrlInput, setVideoUrlInput] = useState('');
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const MAX_VIDEO_SECONDS = 60;
    const MAX_VIDEO_MB = 25;

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
        // Sanitise: suppliers occasionally paste a JSON-escaped URL
        // ("data:image/jpeg;base64,..." with the surrounding quotes
        // included). Browsers can't load that as <img src>, so the
        // image silently breaks. Strip leading/trailing quotes,
        // whitespace, and angle brackets before we accept the value.
        const cleaned = url
            .trim()
            .replace(/^["'<\s]+/, '')
            .replace(/["'>\s]+$/, '')
            .trim();
        if (!cleaned) return;
        // Reject obviously malformed: must be http(s) or a real
        // data:image URL. Anything else is probably a search-results
        // page URL that won't render — better to silently no-op than
        // to litter the gallery with broken tiles.
        const looksValid =
            /^https?:\/\//i.test(cleaned) ||
            /^data:image\/[a-z+]+;base64,/i.test(cleaned);
        if (!looksValid) {
            try {
                toast.error('That URL doesn\'t look like an image. Paste a direct image link.');
            } catch {}
            return;
        }
        const existing = formData.images || [];
        if (existing.includes(cleaned)) return;
        const combined = [...existing, cleaned];
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

    // ─────────────────────────────────────────────────────────────
    //  Video handlers
    // ─────────────────────────────────────────────────────────────
    //
    // The operator's rule is "short demo clips only — no 10-minute
    // YouTube videos". We enforce three guards client-side:
    //   1. File size  ≤ 25 MB  (cheap reject — size shown by the OS).
    //   2. Duration   ≤ 60 s   (we measure via HTMLVideoElement before
    //                            sending the file to the API).
    //   3. URL paste  rejects youtube.com / vimeo.com / tiktok.com
    //                  — those are embeds, not direct media files;
    //                  the <video> tag can't stream them anyway.
    //
    // Backend caps body size at 25 MB and validates mime type as a
    // server-side safety net.

    const probeVideoDuration = (file: File): Promise<number> =>
        new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
                resolve(v.duration);
            };
            v.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Could not read the video file.'));
            };
            v.src = url;
        });

    const handleVideoUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0 || !formData) return;

        setIsUploadingVideo(true);
        try {
            const uploaded: string[] = [];
            for (const file of files) {
                // 1) Size gate
                if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
                    toast.error(
                        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is ${MAX_VIDEO_MB} MB.`,
                    );
                    continue;
                }
                // 2) Duration gate
                let duration = 0;
                try {
                    duration = await probeVideoDuration(file);
                } catch {
                    toast.error(`Could not read ${file.name}. Try a different file.`);
                    continue;
                }
                if (duration > MAX_VIDEO_SECONDS) {
                    toast.error(
                        `${file.name} is ${duration.toFixed(0)} s long — max is ${MAX_VIDEO_SECONDS} s. Trim the clip first.`,
                    );
                    continue;
                }
                // 3) Upload
                const fd = new FormData();
                fd.append('file', file);
                const res = await apiFetch('/products/upload-video', {
                    method: 'POST',
                    body: fd,
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.url) uploaded.push(data.url);
                } else {
                    const err = await res.json().catch(() => ({}));
                    toast.error(err.message || `Failed to upload ${file.name}`);
                }
            }
            if (uploaded.length > 0) {
                const combined = [...(formData.videos || []), ...uploaded];
                setFormData({ ...formData, videos: combined });
                toast.success(`Added ${uploaded.length} video${uploaded.length > 1 ? 's' : ''}`);
            }
        } finally {
            setIsUploadingVideo(false);
            if (e.target) e.target.value = '';
        }
    };

    const addVideoUrl = (url: string) => {
        if (!formData) return;
        const cleaned = url
            .trim()
            .replace(/^["'<\s]+/, '')
            .replace(/["'>\s]+$/, '')
            .trim();
        if (!cleaned) return;
        // Reject embed-style URLs — they're long-form content and the
        // <video> tag can't stream them anyway.
        const BLOCKED_HOSTS = /(?:youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|facebook\.com\/watch)/i;
        if (BLOCKED_HOSTS.test(cleaned)) {
            toast.error('YouTube / Vimeo / TikTok links aren\'t allowed — upload a short MP4/WebM/MOV file instead.');
            return;
        }
        if (!/^https?:\/\//i.test(cleaned)) {
            toast.error('Paste a direct https URL to an MP4 / WebM / MOV file.');
            return;
        }
        // Hint to the operator if the URL doesn't look like a media file.
        if (!/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(cleaned)) {
            toast.error('That URL doesn\'t end in .mp4 / .webm / .mov. Use a direct media link.');
            return;
        }
        const existing = formData.videos || [];
        if (existing.includes(cleaned)) return;
        setFormData({ ...formData, videos: [...existing, cleaned] });
    };

    const removeVideo = (idx: number) => {
        if (!formData) return;
        setFormData({
            ...formData,
            videos: (formData.videos || []).filter((_, i) => i !== idx),
        });
    };

    /**
     * Move an image up (towards index 0) or down in the list.
     * The first image in the array is always the "main" — the one
     * the buyer sees on the catalog grid and on the PDP hero, so
     * reordering effectively lets the supplier pick which photo
     * leads the listing.
     */
    const moveImage = (idx: number, direction: -1 | 1) => {
        if (!formData) return;
        const images = [...(formData.images || [])];
        const target = idx + direction;
        if (target < 0 || target >= images.length) return;
        [images[idx], images[target]] = [images[target], images[idx]];
        setFormData({
            ...formData,
            images,
            image: images[0] || '',
        });
    };

    // ---------------- Save ----------------
    const handleSave = async () => {
        if (!formData) return;

        // ── Required-fields gate ─────────────────────────────────
        // Operator-mandated: every Atlantis listing MUST carry these
        // fields before it can be sent for approval. Saving with any
        // of them blank used to silently persist a half-product that
        // Atlantis would then reject — wasting a review round-trip.
        // Now we block the save up-front, list every missing field
        // in one toast, and never even POST the malformed payload.
        const missing: string[] = [];
        if (!formData.name?.trim()) missing.push('Product name');
        if (!formData.brand?.trim()) missing.push('Brand');
        if (!formData.category?.trim()) missing.push('Category');
        if (!formData.description?.trim() || formData.description.trim().length < 10) {
            missing.push('Description (≥ 10 chars)');
        }
        if (!(formData.images && formData.images.length > 0)) missing.push('Product image');
        const piecePriceNum = parseFloat(pricePerPieceInput.replace(',', '.'));
        if (!piecePriceNum || piecePriceNum <= 0) missing.push('Price per piece');
        if (!(Number(formData.stock) > 0)) missing.push('Stock level');
        if (!formData.unit) missing.push('Unit type');
        if (!Number(formData.unitsPerCase)) missing.push('Pieces per case');
        if (!Number(formData.casesPerPallet)) missing.push('Cases per pallet');
        if (!Number(formData.palletsPerShipment)) missing.push('Pallets per shipment');
        if (!String(formData.weight ?? '').trim()) missing.push('Weight per unit');
        if (!formData.shelfLife?.trim()) missing.push('BBD (Best Before Date)');
        if (!formData.origin?.trim()) missing.push('Country of origin');
        if (!formData.exwLocation?.trim()) missing.push('EXW location');

        if (missing.length > 0) {
            // Show the first 5 in the toast; if there are more, append
            // "+ N more" so the supplier can still scroll. Long toasts
            // get truncated by the toaster, this keeps it readable.
            const shown = missing.slice(0, 5).join(', ');
            const tail = missing.length > 5 ? ` + ${missing.length - 5} more` : '';
            toast.error(
                `Fill in every required field before saving: ${shown}${tail}.`,
                { duration: 6500 },
            );
            return;
        }

        // ── Quality gate — reject obviously-fake data ────────────
        // Operator's "make sure values are REAL, not random letters"
        // ask. We catch the obvious cases client-side:
        //   • single repeated character runs ("aaaaaa", "11111")
        //   • all-consonant gibberish ("zxcvbn", "qwertz")
        //   • name == brand (suppliers paste the brand twice)
        // Light heuristics — real review happens on the admin side.
        const looksFake = (v: string): boolean => {
            const s = v.trim().toLowerCase();
            if (s.length < 3) return false; // too short for a heuristic
            if (/^(.)\1{3,}$/.test(s)) return true;               // "aaaaaa"
            if (/^[bcdfghjklmnpqrstvwxz]{5,}$/.test(s)) return true; // all-consonants ≥ 5
            if (/^[qwerty]+$/i.test(s) && s.length >= 6) return true; // qwerty mash
            return false;
        };
        const fakeWarnings: string[] = [];
        if (formData.name && looksFake(formData.name)) fakeWarnings.push('Product name');
        if (formData.brand && looksFake(formData.brand)) fakeWarnings.push('Brand');
        if (fakeWarnings.length > 0) {
            toast.error(
                `These look like random characters: ${fakeWarnings.join(', ')}. Use the real value or Atlantis will reject the listing.`,
                { duration: 6500 },
            );
            return;
        }

        // EAN format gate (existing).
        if (formData.ean && !isValidEan(formData.ean)) {
            toast.error('Barcode must be 8, 12, 13, or 14 digits (EAN/UPC/ITF-14).');
            setEanError(
                'Barcode must be 8, 12, 13, or 14 digits (EAN/UPC/ITF-14).',
            );
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
                videos: formData.videos || [],
                // Variants — drop empty groups and groups with no values
                // before sending; suppliers often start typing then
                // abandon a row, no point persisting noise. We preserve
                // any pre-existing non-variant entries (e.g. the
                // legacy "__translations" object some old products
                // carry inside variants) so we don't strip translations
                // during a normal product save.
                variants: Array.isArray(formData.variants)
                    ? (formData.variants as any[]).filter((v: any) => {
                          if (!v || typeof v !== 'object') return false;
                          if (String(v.name || '').startsWith('__')) return true; // keep meta entries
                          const cleanName = String(v.name || '').trim();
                          const cleanValues = Array.isArray(v.values)
                              ? v.values.map((x: any) => String(x).trim()).filter(Boolean)
                              : [];
                          return cleanName.length > 0 && cleanValues.length > 0;
                      })
                    : [],
                // Variant pricing + metadata for the mix composer. Sent
                // as-is; backend stores in Product.variantPrices /
                // Product.variantMeta JSON columns.
                variantPrices: (formData as any).variantPrices || {},
                variantMeta: (formData as any).variantMeta || {},
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
                                                onError={(e) => {
                                                    // Image failed to load (malformed URL,
                                                    // 404, etc). Hide the broken <img> so
                                                    // the tile doesn't render the alt text
                                                    // or the URL as visible text.
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                    (e.target as HTMLImageElement).parentElement?.classList.add('broken-image');
                                                }}
                                                className="w-full h-full object-contain p-1"
                                            />
                                            {/* Reorder + remove controls. Up/down move
                                                the image one slot in the list so the
                                                supplier can pick exactly which photo is
                                                "main" (= first) and what order the rest
                                                follow on the PDP gallery. Buttons only
                                                fade in on hover so the strip stays clean. */}
                                            <div className="absolute top-0.5 left-0.5 flex flex-col gap-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        moveImage(idx, -1);
                                                    }}
                                                    disabled={idx === 0}
                                                    className="w-5 h-5 rounded-md bg-white/90 dark:bg-zinc-900/90 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shadow"
                                                    title="Move earlier"
                                                >
                                                    <ChevronUp size={11} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        moveImage(idx, 1);
                                                    }}
                                                    disabled={idx === (formData.images?.length ?? 0) - 1}
                                                    className="w-5 h-5 rounded-md bg-white/90 dark:bg-zinc-900/90 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shadow"
                                                    title="Move later"
                                                >
                                                    <ChevronDown size={11} />
                                                </button>
                                            </div>
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
                                            {idx === 0 && (
                                                <span className="absolute bottom-0.5 left-0.5 inline-flex items-center h-4 px-1.5 rounded-md bg-slate-900/85 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[9px] font-bold uppercase tracking-wider">
                                                    Main
                                                </span>
                                            )}
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

                            {/* ── How to copy an image URL (collapsible help) ──
                                Suppliers regularly paste a Google Images
                                results-page link and complain that the image
                                "doesn't show up". This drawer walks them
                                through the right-click → "Open image in new
                                tab" → copy URL workflow. Collapsed by
                                default so it doesn't dominate the card;
                                opens with a single click. */}
                            <button
                                type="button"
                                onClick={() => setShowImageHelp((s) => !s)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/[0.06] text-slate-700 dark:text-zinc-300 text-[12px] font-medium transition-colors"
                                aria-expanded={showImageHelp}
                                aria-controls="image-url-help"
                            >
                                <span className="flex items-center gap-2">
                                    <HelpCircle size={14} className="text-slate-500 dark:text-zinc-400" />
                                    How to copy an image URL from Google
                                </span>
                                {showImageHelp ? (
                                    <ChevronUp size={14} className="text-slate-500 dark:text-zinc-400" />
                                ) : (
                                    <ChevronDown size={14} className="text-slate-500 dark:text-zinc-400" />
                                )}
                            </button>

                            {showImageHelp && (
                                <div
                                    id="image-url-help"
                                    className="rounded-xl bg-blue-50 dark:bg-blue-500/[0.06] border border-blue-200 dark:border-blue-500/20 p-4 space-y-3"
                                >
                                    <p className="text-[12px] text-blue-900 dark:text-blue-100 font-semibold leading-snug">
                                        Use these steps if "Add URL" leaves the
                                        image broken — most often the URL points
                                        to a Google results page, not the actual
                                        image file.
                                    </p>
                                    <ol className="space-y-2.5 text-[12px] text-slate-700 dark:text-zinc-300 leading-relaxed">
                                        <li className="flex gap-2.5">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center">
                                                1
                                            </span>
                                            <span>
                                                Open{' '}
                                                <a
                                                    href="https://www.google.com/imghp"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-700 dark:text-blue-300 underline underline-offset-2 font-semibold"
                                                >
                                                    Google Images
                                                </a>{' '}
                                                and search for the product name (e.g.{' '}
                                                <em className="text-slate-900 dark:text-zinc-100 not-italic font-semibold">
                                                    "{formData.name || 'Lavazza Crema e Gusto 250g'}"
                                                </em>
                                                ).
                                            </span>
                                        </li>
                                        <li className="flex gap-2.5">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center">
                                                2
                                            </span>
                                            <span>
                                                Pick the image you want and{' '}
                                                <strong className="text-slate-900 dark:text-zinc-100">
                                                    right-click
                                                </strong>{' '}
                                                on it (on macOS:{' '}
                                                <kbd className="px-1 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-300 dark:border-white/10 text-[10px] font-mono">
                                                    Ctrl
                                                </kbd>{' '}
                                                +&nbsp;click).
                                            </span>
                                        </li>
                                        <li className="flex gap-2.5">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center">
                                                3
                                            </span>
                                            <span>
                                                In the menu, choose{' '}
                                                <strong className="text-slate-900 dark:text-zinc-100">
                                                    "Open image in new tab"
                                                </strong>
                                                . A new tab opens with just the image visible.
                                            </span>
                                        </li>
                                        <li className="flex gap-2.5">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center">
                                                4
                                            </span>
                                            <span>
                                                Copy the URL from that new tab — it should end in{' '}
                                                <code className="px-1 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-300 dark:border-white/10 text-[10px] font-mono">
                                                    .jpg
                                                </code>{' '}
                                                /{' '}
                                                <code className="px-1 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-300 dark:border-white/10 text-[10px] font-mono">
                                                    .png
                                                </code>{' '}
                                                /{' '}
                                                <code className="px-1 py-0.5 rounded bg-white dark:bg-zinc-800 border border-slate-300 dark:border-white/10 text-[10px] font-mono">
                                                    .webp
                                                </code>
                                                .
                                            </span>
                                        </li>
                                        <li className="flex gap-2.5">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center">
                                                5
                                            </span>
                                            <span>
                                                Paste it into the{' '}
                                                <strong className="text-slate-900 dark:text-zinc-100">
                                                    "Or paste an image URL"
                                                </strong>{' '}
                                                box above and press{' '}
                                                <strong className="text-slate-900 dark:text-zinc-100">
                                                    Add URL
                                                </strong>
                                                . The image will appear in the preview.
                                            </span>
                                        </li>
                                    </ol>
                                    <p className="text-[11px] text-slate-500 dark:text-zinc-500 leading-relaxed pt-1 border-t border-blue-200/60 dark:border-blue-500/20">
                                        <strong className="text-slate-700 dark:text-zinc-300">Easier option:</strong>{' '}
                                        download the image to your computer first, then click{' '}
                                        <em className="not-italic text-slate-700 dark:text-zinc-300 font-semibold">
                                            Upload Images
                                        </em>{' '}
                                        and pick the file. No URL needed.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── Product Videos card ──
                            Optional short demo clips. Same layout pattern
                            as the Images card: a vertical stack of upload
                            tile + URL input + thumbnail list, with the same
                            dark-mode palette. Each video thumbnail uses the
                            native <video preload="metadata"> so the browser
                            grabs a single frame and shows the duration
                            without burning bandwidth. Removing a video is
                            instant; the duration cap is enforced before
                            upload, so anything that lands here has already
                            passed the 60-second gate. */}
                        <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-white/[0.05] shadow-sm dark:shadow-xl dark:shadow-black/40 p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-100 dark:ring-rose-500/20 flex items-center justify-center">
                                        <Video size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50 tracking-tight">
                                            Demo Videos
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">
                                            Short product clips (≤ {MAX_VIDEO_SECONDS}s, ≤ {MAX_VIDEO_MB} MB each)
                                        </p>
                                    </div>
                                </div>
                                {(formData.videos?.length ?? 0) > 0 && (
                                    <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 text-[11px] font-medium">
                                        {formData.videos!.length} video
                                        {formData.videos!.length === 1 ? '' : 's'}
                                    </span>
                                )}
                            </div>

                            {/* Thumbnail strip */}
                            {(formData.videos || []).length > 0 && (
                                <div className="space-y-2">
                                    {formData.videos!.map((vid, idx) => (
                                        <div
                                            key={vid + idx}
                                            className="relative rounded-lg border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] overflow-hidden flex items-stretch gap-3 p-2 group/vid"
                                        >
                                            <video
                                                src={vid}
                                                preload="metadata"
                                                muted
                                                playsInline
                                                controls
                                                className="w-32 h-20 rounded-md bg-black object-contain flex-shrink-0"
                                            />
                                            <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                                                <p className="text-[11px] text-slate-500 dark:text-zinc-500 truncate font-mono">
                                                    {vid.split('/').pop()?.slice(0, 32) || vid}
                                                </p>
                                                <p className="text-[10px] text-slate-400 dark:text-zinc-600">
                                                    Position {idx + 1} of {formData.videos!.length}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeVideo(idx)}
                                                className="self-start h-7 w-7 rounded-md bg-white/90 dark:bg-zinc-900/90 hover:bg-red-50 dark:hover:bg-red-500/15 text-slate-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shadow-sm transition-colors"
                                                title="Remove video"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Empty state placeholder when no videos uploaded yet. */}
                            {(formData.videos || []).length === 0 && (
                                <button
                                    type="button"
                                    onClick={() => videoInputRef.current?.click()}
                                    disabled={isUploadingVideo}
                                    className="w-full aspect-[5/2] rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:border-slate-400 dark:hover:border-white/25 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 flex flex-col items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                                >
                                    <Play size={22} />
                                    <span className="text-xs font-semibold">
                                        Click to add a product video
                                    </span>
                                    <span className="text-[10px] text-slate-400 dark:text-zinc-600">
                                        Optional — buyers see it on the product page
                                    </span>
                                </button>
                            )}

                            {/* Upload button */}
                            <button
                                type="button"
                                onClick={() => videoInputRef.current?.click()}
                                disabled={isUploadingVideo}
                                className="w-full h-10 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:border-slate-300 dark:hover:border-white/[0.12] text-slate-700 dark:text-zinc-200 text-[13px] font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            >
                                <Upload size={15} />
                                {isUploadingVideo
                                    ? 'Uploading…'
                                    : (formData.videos?.length ?? 0) > 0
                                      ? 'Upload More Videos'
                                      : 'Upload Video'}
                            </button>

                            {/* Direct-URL paste */}
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    value={videoUrlInput}
                                    onChange={(e) => setVideoUrlInput(e.target.value)}
                                    placeholder="Or paste a direct .mp4 / .webm / .mov URL…"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addVideoUrl(videoUrlInput);
                                            setVideoUrlInput('');
                                        }
                                    }}
                                    className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-xs text-slate-700 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05]"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        addVideoUrl(videoUrlInput);
                                        setVideoUrlInput('');
                                    }}
                                    disabled={!videoUrlInput.trim()}
                                    className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                                >
                                    Add URL
                                </button>
                            </div>

                            <p className="text-[11px] text-slate-400 dark:text-zinc-600 text-center">
                                MP4 / WebM / MOV — short demo clips only. YouTube and Vimeo links aren't accepted.
                            </p>

                            <input
                                ref={videoInputRef}
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime"
                                multiple
                                className="hidden"
                                onChange={handleVideoUpload}
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

                                {/* ── Admin Pricing Formula ──
                                    Visible to ADMIN / OWNER only. Renders the
                                    live markup math per tier as PERCENTAGES
                                    (not the 1.10 / 1.05 multipliers — the
                                    operator wants %, not the raw float).

                                    Math:
                                       basePerCase = pricePerPiece × unitsPerCase
                                       customer    = basePerCase × (1 + markup%)

                                    Pulls markups from /config/markup (same
                                    AppConfig /admin/settings edits) so editing
                                    the markup there reflects here on next
                                    render. Bag-of-bands UI: 3 chips, each
                                    showing "Case → +10% → Customer €26.40".
                                */}
                                {mode === 'admin' && (
                                    <div className="rounded-xl bg-blue-50/40 dark:bg-blue-500/[0.06] border border-blue-200 dark:border-blue-500/20 px-3.5 py-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">
                                                Admin · Pricing Formula
                                            </p>
                                            <span className="text-[10px] text-blue-500 dark:text-blue-400 font-bold">
                                                base × (1 + markup%) = customer
                                            </span>
                                        </div>
                                        {(() => {
                                            const piecePrice = parseFloat(pricePerPieceInput.replace(',', '.')) || 0;
                                            const upc = Number(formData.unitsPerCase) || 0;
                                            const basePerCase = piecePrice * upc;
                                            const rows = [
                                                { label: 'Case',   m: markups.piece },
                                                { label: 'Pallet', m: markups.pallet },
                                                { label: 'Truck',  m: markups.container },
                                            ];
                                            return (
                                                <div className="grid grid-cols-3 gap-2">
                                                    {rows.map((r) => {
                                                        const pct = ((r.m - 1) * 100).toFixed(1);
                                                        const customer = basePerCase * r.m;
                                                        return (
                                                            <div key={r.label} className="bg-white dark:bg-[#131316] rounded-lg border border-blue-100 dark:border-blue-500/15 p-2.5">
                                                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500">{r.label}</p>
                                                                <p className="text-[15px] font-bold text-blue-700 dark:text-blue-300 tabular-nums mt-0.5">+{pct}%</p>
                                                                <div className="mt-1.5 text-[10px] text-slate-500 dark:text-zinc-500 leading-tight">
                                                                    <p>Base <span className="font-mono text-slate-700 dark:text-zinc-300">{symbol}{basePerCase.toFixed(2)}</span></p>
                                                                    <p>Cust <span className="font-mono font-bold text-slate-900 dark:text-zinc-100">{symbol}{customer.toFixed(2)}</span></p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                        <p className="text-[10px] text-slate-500 dark:text-zinc-500 leading-relaxed pt-1 border-t border-blue-200/60 dark:border-blue-500/20">
                                            Edit markups at{' '}
                                            <a href="/admin/settings" className="font-bold text-blue-700 dark:text-blue-300 underline">
                                                /admin/settings
                                            </a>
                                            . Suppliers don't see this — only Atlantis ops.
                                        </p>
                                    </div>
                                )}
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
                                        Weight per Unit <span className="text-red-500">*</span>
                                    </label>
                                    {/* Numeric value + unit dropdown composite.
                                        The DB column is a free-form string so a
                                        bag of pasta can be "500g" while a tin
                                        of paint is "5kg" and bottled water is
                                        "1.5L". We split the input into a
                                        number field and a unit picker, and
                                        concatenate them ("500g" / "1.5L") on
                                        every change so formData.weight always
                                        carries a renderable string.

                                        Parse-back on load: if the stored
                                        weight already has a unit suffix
                                        ("500g"), we pre-populate the picker
                                        with that unit. Pure numeric values
                                        default to "kg" (the old behaviour). */}
                                    {(() => {
                                        // Operator bug: picking a unit (ml / L / etc.)
                                        // before typing a number lost the choice because
                                        // we only persisted the unit when there was a
                                        // numeric prefix to concatenate. Fix: allow the
                                        // unit half to live in formData.weight on its
                                        // own — e.g. "ml" with no number. The regex
                                        // tolerates a missing number prefix. Save logic
                                        // also covers the inverse: typing a number
                                        // before picking a unit keeps the picker's last
                                        // pick (or the default 'kg').
                                        const WEIGHT_UNITS = ['g', 'kg', 'mg', 'ml', 'cl', 'L', 'oz', 'lb', 'tn'];
                                        const raw = String(formData.weight ?? '').trim();
                                        // Tolerant parse: number is optional, unit is
                                        // optional, but at least one of them must exist.
                                        const m = raw.match(/^(\d+(?:[.,]\d+)?)?\s*([a-zA-Z]+)?$/);
                                        const numPart = m?.[1] ?? '';
                                        let unitPart = (m?.[2] || 'kg').toLowerCase();
                                        if (unitPart === 'l') unitPart = 'L';
                                        if (unitPart === 't' || unitPart === 'ton' || unitPart === 'tonne') unitPart = 'tn';
                                        const safeUnit = WEIGHT_UNITS.includes(unitPart) ? unitPart : 'kg';
                                        return (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="e.g. 0.330"
                                                    value={numPart}
                                                    onChange={(e) => {
                                                        const cleaned = e.target.value.replace(/[^0-9.,]/g, '');
                                                        // Keep the current unit even when
                                                        // the number is being cleared/typed.
                                                        setFormData({
                                                            ...formData,
                                                            weight: (cleaned + safeUnit) as any,
                                                        });
                                                    }}
                                                    className="flex-1 h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-3.5 text-sm font-medium text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12]"
                                                />
                                                <select
                                                    value={safeUnit}
                                                    onChange={(e) => {
                                                        const next = e.target.value;
                                                        // Persist the unit choice even
                                                        // when there's no number yet.
                                                        // The string will be just "ml"
                                                        // until the supplier types a
                                                        // number, then it becomes "500ml".
                                                        setFormData({
                                                            ...formData,
                                                            weight: (numPart + next) as any,
                                                        });
                                                    }}
                                                    className="w-24 h-11 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#1c1c20] px-2.5 text-sm font-semibold text-slate-900 dark:text-zinc-100 outline-none transition-colors focus:border-slate-400 dark:focus:border-white/20 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/[0.05] hover:border-slate-300 dark:hover:border-white/[0.12] appearance-none"
                                                    title="Weight unit"
                                                >
                                                    {WEIGHT_UNITS.map((u) => (
                                                        <option key={u} value={u}>
                                                            {u}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    })()}
                                    <p className="text-[11px] text-slate-400 dark:text-zinc-600">
                                        Pick g / kg / ml / L / oz / lb / tn — whatever fits the product.
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

                        {/* ── Variants & Options card ──────────────────────
                            Shopify-style configurable products. Each variant
                            "group" has a name ("Size") and a list of values
                            ("Small", "Medium", "Large"). Buyers pick one
                            value per group on the PDP before they can add
                            the product to cart — their selection travels
                            with the order line so the admin sees exactly
                            what was ordered.

                            Storage: product.variants (Json) — array of
                            { name, values: string[] }. The existing schema
                            already has the column, so this is purely a UI
                            addition.

                            Examples:
                              Single group  → Size: Small / Medium / Large
                              Multi-group   → Size: S/M/L + Flavour: Vanilla/Cocoa
                              Pack variants → Pack: 6-pack / 12-pack / 24-pack
                        */}
                        <VariantsEditor
                            value={(formData.variants as any) || []}
                            onChange={(v) => setFormData({ ...formData, variants: v as any })}
                        />

                        {/* Mix-composer pricing — per-variant price + image.
                            Only meaningful once VariantsEditor has groups
                            defined; the component renders nothing otherwise. */}
                        <VariantPricingEditor
                            groups={(formData.variants as any) || []}
                            prices={((formData as any).variantPrices as Record<string, number>) || {}}
                            meta={((formData as any).variantMeta as VariantMetaMap) || {}}
                            parentImage={Array.isArray((formData as any).images) ? (formData as any).images[0] : undefined}
                            parentPrice={typeof (formData as any).basePrice === 'number'
                                ? (formData as any).basePrice
                                : typeof (formData as any).price === 'number'
                                    ? (formData as any).price
                                    : undefined}
                            parentUnitsPerCase={typeof (formData as any).unitsPerCase === 'number' ? (formData as any).unitsPerCase : undefined}
                            parentCasesPerPallet={typeof (formData as any).casesPerPallet === 'number' ? (formData as any).casesPerPallet : undefined}
                            parentPalletsPerShipment={typeof (formData as any).palletsPerShipment === 'number' ? (formData as any).palletsPerShipment : undefined}
                            onPricesChange={next => setFormData({ ...formData, variantPrices: next as any })}
                            onMetaChange={next => setFormData({ ...formData, variantMeta: next as any })}
                        />

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
