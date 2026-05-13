'use client';

/**
 * Homepage Banner Manager — visual placement map.
 *
 * Renders the homepage as a wireframe-style map of every banner slot
 * with its recommended dimensions baked in. Admin can:
 *   • Hover any slot → see the dimensions in a tooltip
 *   • Click a slot → opens an upload sheet that:
 *       - re-states the dimensions
 *       - opens a file picker (image only, < 5 MB)
 *       - uploads via /products/upload-image (Supabase-backed)
 *       - lets admin add a target URL the banner clicks through to
 *       - lets admin add alt text for accessibility
 *   • Remove an existing image via the trash icon
 * All slots are saved together via /admin/config/homepage-banners.
 *
 * The slot definitions are intentionally hard-coded here so the map
 * mirrors the actual homepage layout (HomeClient.tsx); when the
 * homepage is redesigned, update SLOTS to match.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
    Layout, Upload, Trash2, Save, X, Image as ImageIcon, Maximize2,
    Info, Plus, ExternalLink, Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────────
// Slot definitions — must mirror what HomeClient.tsx actually renders.
// `size` is the recommended dimension shown in tooltips + upload sheet.
// `aspectRatio` controls how big the empty cell looks on the map.
// ────────────────────────────────────────────────────────────────────
interface Slot {
    id: string;
    label: string;
    size: string; // e.g. "1600 × 600"
    blurb: string;
    aspectRatio: string; // CSS aspect-ratio value e.g. "16/6"
    col?: number; // grid column span
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

type BannerMap = Record<string, BannerData>;

export default function AdminHomepageBannersPage() {
    const [banners, setBanners] = React.useState<BannerMap>({});
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [editingSlot, setEditingSlot] = React.useState<Slot | null>(null);

    // Initial load
    React.useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch('/admin/config/homepage-banners');
                if (res.ok) {
                    const data = await res.json();
                    if (data && typeof data === 'object') setBanners(data);
                }
            } catch { /* fall through to empty map */ }
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
            setBanners(saved && typeof saved === 'object' ? saved : next);
            toast.success('Homepage banners updated');
        } catch (e: any) {
            toast.error(e?.message || 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const removeSlot = async (slotId: string) => {
        const next = { ...banners };
        delete next[slotId];
        await persist(next);
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
                            This is the live wireframe of the homepage. Hover any slot to see its recommended dimensions,
                            click to upload a banner. Removing an image clears that slot on the live homepage immediately.
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
            <div className="bg-gradient-to-b from-slate-50 to-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                {loading ? (
                    <div className="py-24 flex justify-center">
                        <Loader2 className="animate-spin text-teal-500" size={28} />
                    </div>
                ) : (
                    <>
                        {/* Top label — looks like a browser chrome bar so the
                            admin understands "this is what the homepage looks like" */}
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                            <div className="flex gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-rose-300" />
                                <span className="w-3 h-3 rounded-full bg-amber-300" />
                                <span className="w-3 h-3 rounded-full bg-emerald-300" />
                            </div>
                            <div className="flex-1 mx-3">
                                <div className="h-6 rounded-md bg-white border border-slate-200 flex items-center px-3">
                                    <span className="text-[11px] font-mono text-slate-400">atlantisfmcg.com</span>
                                </div>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Live preview</span>
                        </div>

                        {/* The actual placement grid */}
                        <div className="grid grid-cols-12 gap-3">
                            {SLOTS.map(slot => {
                                const banner = banners[slot.id];
                                return (
                                    <SlotTile
                                        key={slot.id}
                                        slot={slot}
                                        banner={banner}
                                        onClick={() => setEditingSlot(slot)}
                                        onRemove={() => removeSlot(slot.id)}
                                    />
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
                <LegendCard
                    icon={Maximize2}
                    title="Dimensions matter"
                    body="Stick to the recommended size — larger images get compressed, smaller ones look fuzzy."
                />
                <LegendCard
                    icon={Info}
                    title="Hover to inspect"
                    body="Each empty slot shows its dimensions as a tooltip when you hover over it."
                />
                <LegendCard
                    icon={ExternalLink}
                    title="Click-through URL"
                    body="When you upload a banner you can also set the URL it links to (e.g. a category page)."
                />
            </div>

            {/* Upload sheet — Modal-style */}
            <AnimatePresence>
                {editingSlot && (
                    <UploadSheet
                        slot={editingSlot}
                        existing={banners[editingSlot.id]}
                        onCancel={() => setEditingSlot(null)}
                        onSave={async (data) => {
                            const next = { ...banners, [editingSlot.id]: data };
                            await persist(next);
                            setEditingSlot(null);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────
// Single slot tile on the visual map.
// ────────────────────────────────────────────────────────────────────
function SlotTile({
    slot, banner, onClick, onRemove,
}: {
    slot: Slot;
    banner?: BannerData;
    onClick: () => void;
    onRemove: () => void;
}) {
    return (
        <div
            className="relative group"
            style={{
                gridColumn: `span ${slot.col || 12} / span ${slot.col || 12}`,
            }}
        >
            <button
                type="button"
                onClick={onClick}
                style={{ aspectRatio: slot.aspectRatio }}
                className={cn(
                    'w-full rounded-2xl border-2 border-dashed transition-all overflow-hidden flex flex-col items-center justify-center',
                    banner
                        ? 'border-transparent bg-slate-900'
                        : 'border-slate-300 hover:border-teal-500 bg-white hover:bg-teal-50/40',
                )}
                title={`${slot.label} · Recommended ${slot.size}`}
            >
                {banner ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={banner.imageUrl}
                            alt={banner.alt || slot.label}
                            className="w-full h-full object-cover"
                        />
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                        <Plus size={20} />
                        <span className="text-[11px] font-black uppercase tracking-widest">
                            {slot.label}
                        </span>
                        <span className="text-[10px] font-mono">{slot.size}</span>
                    </div>
                )}
            </button>

            {/* Slot label badge on top — always visible */}
            <div className="absolute top-2 start-2 inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-slate-900/80 backdrop-blur text-white text-[9px] font-black uppercase tracking-wider">
                {slot.label}
                <span className="text-teal-300 font-mono normal-case tracking-normal">{slot.size}</span>
            </div>

            {/* Remove button when an image exists */}
            {banner && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute top-2 end-2 w-7 h-7 rounded-full bg-white/95 border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    title="Remove banner"
                >
                    <Trash2 size={13} />
                </button>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────
// Upload sheet — opens when admin clicks a slot.
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
        if (!file.type.startsWith('image/')) {
            toast.error('Only image files are allowed.');
            return;
        }
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
            toast.success('Image uploaded — click "Save banner" to publish.');
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
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500">Editing slot</p>
                        <h2 className="text-xl font-black text-slate-900 mt-0.5">{slot.label}</h2>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-sm">{slot.blurb}</p>
                        <p className="text-[12px] font-bold text-slate-700 mt-2">
                            Recommended size:&nbsp;
                            <span className="font-mono text-teal-600">{slot.size}</span>&nbsp;
                            <span className="text-slate-400 font-normal">· keep under 500 KB for fast load</span>
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

                {/* Body */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Preview / picker */}
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
                                <p className="text-[13px] font-bold">
                                    {uploading ? 'Uploading…' : 'Click to upload image'}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                    {slot.size} · ≤ 5 MB · JPG / PNG / WebP
                                </p>
                            </div>
                        )}
                    </button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePick}
                    />
                    {previewUrl && !uploading && (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="text-[11px] font-bold text-teal-600 hover:underline"
                        >
                            Replace image
                        </button>
                    )}

                    {/* Optional click-through URL */}
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

                    {/* Alt text */}
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

                {/* Footer */}
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
                        <Save size={15} /> Save banner
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
