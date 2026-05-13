'use client';

/**
 * Homepage Banner Manager — visual placement map with ordered carousels.
 *
 * Every slot on the homepage can now hold MULTIPLE banners that rotate
 * in the order saved here. The page shows:
 *   • The live order of banners in each slot (1, 2, 3, …)
 *   • A "+" tile to append a new banner
 *   • Per-banner controls: ↑ / ↓ to reorder, ✏️ to edit, 🗑️ to remove
 *   • Recommended dimensions baked into each slot
 * Uploads go through /products/upload-image (Supabase) and the
 * resulting URL is appended to the slot's banner array. All slots
 * persist together via /admin/config/homepage-banners.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
    Layout, Upload, Trash2, Save, X, Image as ImageIcon, Maximize2,
    Info, Plus, ExternalLink, Loader2, ArrowUp, ArrowDown, Pencil,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Slot {
    id: string;
    label: string;
    size: string;
    blurb: string;
    aspectRatio: string;
    col?: number;
}

const SLOTS: Slot[] = [
    { id: 'hero',        label: 'Hero Banner',         size: '1600 × 600',  blurb: 'Top of the homepage. Renders at full width above the fold.',                aspectRatio: '16/6', col: 12 },
    { id: 'promo-1',     label: 'Promo Tile 1',        size: '600 × 400',   blurb: 'Left column of the dual-promo strip below the hero.',                       aspectRatio: '3/2',  col: 6 },
    { id: 'promo-2',     label: 'Promo Tile 2',        size: '600 × 400',   blurb: 'Right column of the dual-promo strip below the hero.',                      aspectRatio: '3/2',  col: 6 },
    { id: 'category-strip', label: 'Category Strip',   size: '1600 × 220',  blurb: 'Wide banner above the "Browse by Business Category" section.',              aspectRatio: '16/2', col: 12 },
    { id: 'mid-1',       label: 'Mid-Page Banner A',   size: '800 × 300',   blurb: 'First half of the mid-page split banner — e.g. featured supplier.',         aspectRatio: '8/3',  col: 6 },
    { id: 'mid-2',       label: 'Mid-Page Banner B',   size: '800 × 300',   blurb: 'Second half of the mid-page split banner — e.g. seasonal callout.',         aspectRatio: '8/3',  col: 6 },
    { id: 'footer',      label: 'Footer Strip',        size: '1600 × 200',  blurb: 'Last banner before the global footer. Best for newsletter / sign-up CTA.',  aspectRatio: '16/2', col: 12 },
];

interface BannerData {
    imageUrl: string;
    linkUrl?: string | null;
    alt?: string;
    updatedAt?: string;
}

// `slotId` → ordered banner list. Order in the array IS display order.
type BannerMap = Record<string, BannerData[]>;

export default function AdminHomepageBannersPage() {
    const [banners, setBanners] = React.useState<BannerMap>({});
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [editing, setEditing] = React.useState<{ slot: Slot; index: number | null } | null>(null);

    React.useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch('/admin/config/homepage-banners');
                if (res.ok) {
                    const data = await res.json();
                    // Backend normalizes to arrays on read — but be defensive
                    // for legacy responses that still ship objects.
                    if (data && typeof data === 'object') {
                        const norm: BannerMap = {};
                        for (const [k, v] of Object.entries(data)) {
                            if (Array.isArray(v)) norm[k] = v as BannerData[];
                            else if (v && typeof v === 'object') norm[k] = [v as BannerData];
                        }
                        setBanners(norm);
                    }
                }
            } catch { /* leave empty */ }
            finally { setLoading(false); }
        })();
    }, []);

    const persist = async (next: BannerMap) => {
        setSaving(true);
        try {
            const res = await apiFetch('/admin/config/homepage-banners', {
                method: 'POST',
                body: JSON.stringify(next),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                throw new Error(err?.message || `Save failed (HTTP ${res.status})`);
            }
            const saved = await res.json();
            // Normalize the saved response too
            const norm: BannerMap = {};
            for (const [k, v] of Object.entries(saved || {})) {
                if (Array.isArray(v)) norm[k] = v as BannerData[];
                else if (v && typeof v === 'object') norm[k] = [v as BannerData];
            }
            setBanners(norm);
            toast.success('Homepage banners saved');
        } catch (e: any) {
            toast.error(e?.message || 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const removeBanner = (slotId: string, index: number) => {
        const list = banners[slotId] || [];
        const next = { ...banners, [slotId]: list.filter((_, i) => i !== index) };
        if (next[slotId].length === 0) delete next[slotId];
        persist(next);
    };

    const moveBanner = (slotId: string, index: number, dir: -1 | 1) => {
        const list = [...(banners[slotId] || [])];
        const target = index + dir;
        if (target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        persist({ ...banners, [slotId]: list });
    };

    const saveBanner = (slotId: string, index: number | null, data: BannerData) => {
        const list = [...(banners[slotId] || [])];
        if (index === null) list.push(data);
        else list[index] = { ...list[index], ...data };
        return persist({ ...banners, [slotId]: list });
    };

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 border border-teal-300/30 flex items-center justify-center">
                        <Layout className="text-teal-500" size={26} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-teal-500">Visual placement map</p>
                        <h1 className="text-3xl font-black tracking-tight">Homepage Banners</h1>
                        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                            Each slot below can hold one OR multiple banners. The order of
                            the thumbnails IS the order shown on the live homepage. Use ↑ /
                            ↓ to reorder, ✏️ to edit, 🗑 to remove, or "+ Add" to append.
                        </p>
                    </div>
                </div>
                {saving && (
                    <div className="flex items-center gap-2 text-[12px] font-bold text-teal-600">
                        <Loader2 size={14} className="animate-spin" />
                        Saving…
                    </div>
                )}
            </div>

            {/* Map */}
            {loading ? (
                <div className="py-24 flex justify-center">
                    <Loader2 className="animate-spin text-teal-500" size={28} />
                </div>
            ) : (
                <div className="space-y-6">
                    {SLOTS.map(slot => {
                        const slotBanners = banners[slot.id] || [];
                        return (
                            <div key={slot.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                                {/* Slot header */}
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-[15px] font-black text-slate-900">{slot.label}</h2>
                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                                                {slot.size}
                                            </span>
                                            <span className={cn(
                                                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                                                slotBanners.length === 0
                                                    ? 'bg-slate-100 text-slate-500'
                                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                                            )}>
                                                {slotBanners.length} banner{slotBanners.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-1 max-w-2xl">{slot.blurb}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEditing({ slot, index: null })}
                                        className="h-10 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[12px] font-black flex items-center gap-2 shadow-sm shrink-0"
                                    >
                                        <Plus size={14} /> Add banner
                                    </button>
                                </div>

                                {slotBanners.length === 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setEditing({ slot, index: null })}
                                        style={{ aspectRatio: slot.aspectRatio }}
                                        className="w-full rounded-2xl border-2 border-dashed border-slate-300 hover:border-teal-500 bg-slate-50 hover:bg-teal-50/40 transition-all flex flex-col items-center justify-center text-slate-400"
                                    >
                                        <Plus size={22} className="mb-1.5" />
                                        <span className="text-[12px] font-bold">Click to add your first banner here</span>
                                        <span className="text-[10px] font-mono mt-1">Recommended {slot.size}</span>
                                    </button>
                                ) : (
                                    <div className={cn(
                                        'grid gap-3',
                                        slot.col && slot.col >= 12 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1',
                                    )}>
                                        {slotBanners.map((b, i) => (
                                            <BannerCard
                                                key={`${slot.id}-${i}`}
                                                slot={slot}
                                                banner={b}
                                                index={i}
                                                total={slotBanners.length}
                                                onEdit={() => setEditing({ slot, index: i })}
                                                onRemove={() => removeBanner(slot.id, i)}
                                                onMoveUp={() => moveBanner(slot.id, i, -1)}
                                                onMoveDown={() => moveBanner(slot.id, i, +1)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Legend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
                <LegendCard icon={Maximize2} title="Dimensions matter" body="Stick to the recommended size — larger images get compressed, smaller ones look fuzzy." />
                <LegendCard icon={ArrowUp}   title="Order = position"  body="Banner #1 in the list shows first on the live homepage. Use ↑ / ↓ to reorder." />
                <LegendCard icon={ExternalLink} title="Click-through URL" body="Each banner can carry an optional URL it links to (a category page, an offer, …)." />
            </div>

            {/* Upload / Edit sheet */}
            <AnimatePresence>
                {editing && (
                    <UploadSheet
                        slot={editing.slot}
                        existing={editing.index !== null ? banners[editing.slot.id]?.[editing.index] : undefined}
                        onCancel={() => setEditing(null)}
                        onSave={async (data) => {
                            await saveBanner(editing.slot.id, editing.index, data);
                            setEditing(null);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────
// Single banner thumbnail with reorder + edit + remove controls.
// ────────────────────────────────────────────────────────────────────
function BannerCard({
    slot, banner, index, total, onEdit, onRemove, onMoveUp, onMoveDown,
}: {
    slot: Slot;
    banner: BannerData;
    index: number;
    total: number;
    onEdit: () => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}) {
    return (
        <div
            className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 group"
            style={{ aspectRatio: slot.aspectRatio }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={banner.imageUrl}
                alt={banner.alt || slot.label}
                className="w-full h-full object-cover"
            />

            {/* Order badge — top-left, always visible */}
            <div className="absolute top-2 start-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-slate-900/85 backdrop-blur text-white text-[10px] font-black">
                <span className="w-5 h-5 rounded-full bg-teal-500 text-white text-[11px] flex items-center justify-center">
                    {index + 1}
                </span>
                <span className="uppercase tracking-wider">of {total}</span>
            </div>

            {/* Link badge if set */}
            {banner.linkUrl && (
                <div className="absolute bottom-2 start-2 inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-white/90 backdrop-blur text-slate-700 text-[10px] font-mono max-w-[200px]">
                    <ExternalLink size={10} />
                    <span className="truncate">{banner.linkUrl}</span>
                </div>
            )}

            {/* Action toolbar — top-right */}
            <div className="absolute top-2 end-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={index === 0}
                    title="Move up"
                    className="w-7 h-7 rounded-full bg-white/95 hover:bg-white text-slate-700 flex items-center justify-center shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ArrowUp size={13} />
                </button>
                <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={index >= total - 1}
                    title="Move down"
                    className="w-7 h-7 rounded-full bg-white/95 hover:bg-white text-slate-700 flex items-center justify-center shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ArrowDown size={13} />
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    title="Edit banner"
                    className="w-7 h-7 rounded-full bg-white/95 hover:bg-white text-slate-700 flex items-center justify-center shadow-sm"
                >
                    <Pencil size={13} />
                </button>
                <button
                    type="button"
                    onClick={onRemove}
                    title="Remove banner"
                    className="w-7 h-7 rounded-full bg-white/95 hover:bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shadow-sm"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────
// Upload / edit sheet.
// ────────────────────────────────────────────────────────────────────
function UploadSheet({
    slot, existing, onCancel, onSave,
}: {
    slot: Slot;
    existing?: BannerData;
    onCancel: () => void;
    onSave: (data: BannerData) => Promise<void>;
}) {
    const fileRef = React.useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string>(existing?.imageUrl || '');
    const [linkUrl, setLinkUrl] = React.useState(existing?.linkUrl || '');
    const [alt, setAlt] = React.useState(existing?.alt || '');
    const [uploading, setUploading] = React.useState(false);

    const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast.error('Only image files are allowed.'); return; }
        if (file.size > 5 * 1024 * 1024) {
            toast.error(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 5 MB.`);
            return;
        }
        setUploading(true);
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
            setPreviewUrl(data.url);
            toast.success('Image uploaded — click Save to publish.');
        } catch (e: any) {
            toast.error(e?.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const canSave = !!previewUrl && !uploading;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
            >
                <div className="flex items-start justify-between p-6 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500">
                            {existing ? 'Editing banner' : 'Adding banner'}
                        </p>
                        <h2 className="text-xl font-black text-slate-900 mt-0.5">{slot.label}</h2>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-sm">{slot.blurb}</p>
                        <p className="text-[12px] font-bold text-slate-700 mt-2">
                            Recommended size:&nbsp;
                            <span className="font-mono text-teal-600">{slot.size}</span>&nbsp;
                            <span className="text-slate-400 font-normal">· keep under 500 KB</span>
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 flex items-center justify-center"
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        style={{ aspectRatio: slot.aspectRatio }}
                        className={cn(
                            'w-full rounded-2xl border-2 border-dashed transition-all overflow-hidden flex flex-col items-center justify-center',
                            previewUrl ? 'border-slate-200 bg-slate-900' : 'border-slate-300 hover:border-teal-500 bg-slate-50',
                        )}
                    >
                        {previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={previewUrl} alt={alt || slot.label} className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-500">
                                {uploading ? <Loader2 className="animate-spin" /> : <Upload size={22} />}
                                <p className="text-[13px] font-bold">{uploading ? 'Uploading…' : 'Click to upload image'}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                    {slot.size} · ≤ 5 MB · JPG / PNG / WebP
                                </p>
                            </div>
                        )}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
                    {previewUrl && !uploading && (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="text-[11px] font-bold text-teal-600 hover:underline"
                        >
                            Replace image
                        </button>
                    )}

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                            Click-through URL <span className="text-slate-400 font-normal normal-case">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={linkUrl}
                            onChange={e => setLinkUrl(e.target.value)}
                            placeholder="/categories?category=Beverages — or full https URL"
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px] focus:border-teal-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                            Alt text <span className="text-slate-400 font-normal normal-case">(for screen readers)</span>
                        </label>
                        <input
                            type="text"
                            value={alt}
                            onChange={e => setAlt(e.target.value)}
                            placeholder="e.g. 'Summer FMCG promotion — up to 30% off'"
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-[13px] focus:border-teal-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="h-11 px-5 rounded-xl border border-slate-300 bg-white text-slate-700 text-[13px] font-bold hover:bg-slate-100 inline-flex items-center gap-2"
                    >
                        <X size={15} /> Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canSave}
                        onClick={() => onSave({
                            imageUrl: previewUrl,
                            linkUrl: linkUrl.trim() || null,
                            alt: alt.trim(),
                        })}
                        className="h-11 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[13px] font-black inline-flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Save size={15} /> {existing ? 'Save changes' : 'Add to slot'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

function LegendCard({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
    return (
        <div className="p-4 rounded-2xl border border-slate-200 bg-white flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Icon size={16} />
            </div>
            <div className="min-w-0">
                <p className="text-[13px] font-black text-slate-900">{title}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{body}</p>
            </div>
        </div>
    );
}
