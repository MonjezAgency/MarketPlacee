'use client';

/**
 * Section editor — manages every image in one homepage section.
 *
 * Reached from /admin/banners (the sketch) when the admin clicks any
 * section block. Reads + writes the same HOMEPAGE_BANNERS config but
 * scopes everything to one section so the UI stays focused.
 *
 * Controls offered:
 *   • Static vs Animated toggle
 *   • Rotation delay slider (1 – 15 s, only enabled when animated)
 *   • Banner list with: thumb, alt, link, ↑↓ reorder, edit, remove
 *   • "+ Add banner" upload sheet (image + optional link + alt)
 *   • Back arrow → returns to /admin/banners
 */

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft, Upload, Trash2, Save, X, Plus, ArrowUp, ArrowDown,
    Pencil, Loader2, Play, Pause, ExternalLink, Image as ImageIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
    SECTIONS, BannerMap, BannerData, SectionEnvelope, getSectionById,
} from '../_sections';

export default function SectionEditorPage() {
    const params = useParams<{ section: string }>();
    const router = useRouter();
    const sectionId = String(params?.section || '');
    const section = getSectionById(sectionId);

    const [banners, setBanners] = React.useState<BannerMap>({});
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [editing, setEditing] = React.useState<number | null | 'new'>(null);

    React.useEffect(() => {
        (async () => {
            try {
                const res = await apiFetch('/admin/config/homepage-banners');
                if (res.ok) {
                    const data = await res.json();
                    if (data && typeof data === 'object') setBanners(data);
                }
            } catch { /* leave empty */ }
            finally { setLoading(false); }
        })();
    }, []);

    if (!section) {
        return (
            <div className="max-w-3xl mx-auto py-20 text-center">
                <p className="text-sm text-muted-foreground">Unknown section: <code>{sectionId}</code></p>
                <Link href="/admin/banners" className="mt-4 inline-flex items-center gap-2 text-teal-600 font-bold hover:underline">
                    <ArrowLeft size={14} /> Back to homepage map
                </Link>
            </div>
        );
    }

    const envelope: SectionEnvelope = banners[section.id] || {
        items: [],
        animated: section.defaultAnimated,
        intervalMs: section.defaultIntervalMs,
    };

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
            toast.success('Saved');
        } catch (e: any) {
            toast.error(e?.message || 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const writeEnvelope = (next: SectionEnvelope) => {
        const map: BannerMap = { ...banners };
        if (next.items.length === 0) delete map[section.id];
        else map[section.id] = next;
        return persist(map);
    };

    const setAnimated = (animated: boolean) =>
        writeEnvelope({ ...envelope, animated });

    const setInterval = (intervalMs: number) =>
        writeEnvelope({ ...envelope, intervalMs });

    const removeAt = (index: number) =>
        writeEnvelope({ ...envelope, items: envelope.items.filter((_, i) => i !== index) });

    const move = (index: number, dir: -1 | 1) => {
        const list = [...envelope.items];
        const target = index + dir;
        if (target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        writeEnvelope({ ...envelope, items: list });
    };

    const upsertItem = async (data: BannerData, index: number | 'new') => {
        const list = [...envelope.items];
        if (index === 'new') list.push(data);
        else list[index] = { ...list[index], ...data };
        await writeEnvelope({ ...envelope, items: list });
        setEditing(null);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
            {/* Header with back button */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => router.push('/admin/banners')}
                        className="h-10 px-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-bold inline-flex items-center gap-2 shadow-sm"
                    >
                        <ArrowLeft size={14} /> Back to map
                    </button>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-teal-500">Editing section</p>
                        <h1 className="text-2xl font-black tracking-tight">{section.label}</h1>
                        <p className="text-[12px] text-muted-foreground mt-1 max-w-2xl">{section.blurb}</p>
                    </div>
                </div>
                {saving && (
                    <div className="flex items-center gap-2 text-[12px] font-bold text-teal-600">
                        <Loader2 size={14} className="animate-spin" /> Saving…
                    </div>
                )}
            </div>

            {/* Behaviour panel */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">Behaviour</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Static vs Animated */}
                    <div>
                        <p className="text-[12px] font-bold text-slate-700 mb-2">Display mode</p>
                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                            <button
                                type="button"
                                onClick={() => setAnimated(false)}
                                className={cn(
                                    'h-9 px-4 rounded-lg text-[12px] font-black inline-flex items-center gap-2 transition-colors',
                                    !envelope.animated ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-700',
                                )}
                            >
                                <Pause size={13} /> Static
                            </button>
                            <button
                                type="button"
                                onClick={() => setAnimated(true)}
                                className={cn(
                                    'h-9 px-4 rounded-lg text-[12px] font-black inline-flex items-center gap-2 transition-colors',
                                    envelope.animated ? 'bg-teal-600 text-white shadow' : 'text-slate-500 hover:text-slate-700',
                                )}
                            >
                                <Play size={13} /> Animated
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                            {envelope.animated
                                ? 'Banners rotate automatically. Only the FIRST image shows on each load until the interval elapses.'
                                : 'Only the first image is shown. Reorder the list to change which one that is.'}
                        </p>
                    </div>

                    {/* Rotation delay */}
                    <div className={cn(envelope.animated ? '' : 'opacity-50 pointer-events-none')}>
                        <p className="text-[12px] font-bold text-slate-700 mb-2">
                            Rotation delay&nbsp;
                            <span className="text-teal-600 font-mono">{(envelope.intervalMs / 1000).toFixed(1)}s</span>
                        </p>
                        <input
                            type="range"
                            min={1000}
                            max={15000}
                            step={500}
                            value={envelope.intervalMs}
                            onChange={(e) => setInterval(Number(e.target.value))}
                            disabled={!envelope.animated}
                            className="w-full accent-teal-600"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                            <span>1s (fast)</span>
                            <span>15s (slow)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Banner list */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Banners in this section</p>
                        <p className="text-[12px] text-slate-500 mt-0.5">
                            {envelope.items.length} of {section.maxItems ?? '∞'} max · recommended {section.size}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setEditing('new')}
                        disabled={!!section.maxItems && envelope.items.length >= section.maxItems}
                        className="h-10 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[12px] font-black inline-flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Plus size={14} /> Add banner
                    </button>
                </div>

                {loading ? (
                    <div className="py-16 flex justify-center">
                        <Loader2 className="animate-spin text-teal-500" />
                    </div>
                ) : envelope.items.length === 0 ? (
                    <button
                        type="button"
                        onClick={() => setEditing('new')}
                        style={{ aspectRatio: section.aspectRatio }}
                        className="w-full rounded-2xl border-2 border-dashed border-slate-300 hover:border-teal-500 bg-slate-50 hover:bg-teal-50/40 transition-all flex flex-col items-center justify-center gap-2 text-slate-400"
                    >
                        <ImageIcon size={28} />
                        <p className="text-[13px] font-bold">No banners yet — click to add your first one</p>
                        <p className="text-[10px] font-mono">{section.size}</p>
                    </button>
                ) : (
                    <div className="space-y-3">
                        {envelope.items.map((b, i) => (
                            <BannerRow
                                key={`${section.id}-${i}`}
                                section={section}
                                banner={b}
                                index={i}
                                total={envelope.items.length}
                                onEdit={() => setEditing(i)}
                                onRemove={() => removeAt(i)}
                                onMoveUp={() => move(i, -1)}
                                onMoveDown={() => move(i, 1)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Upload sheet */}
            <AnimatePresence>
                {editing !== null && (
                    <UploadSheet
                        sectionAspectRatio={section.aspectRatio}
                        sectionSize={section.size}
                        sectionLabel={section.label}
                        sectionBlurb={section.blurb}
                        existing={editing === 'new' ? undefined : envelope.items[editing as number]}
                        onCancel={() => setEditing(null)}
                        onSave={(data) => upsertItem(data, editing)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────

function BannerRow({
    section, banner, index, total, onEdit, onRemove, onMoveUp, onMoveDown,
}: {
    section: ReturnType<typeof getSectionById> & {};
    banner: BannerData;
    index: number;
    total: number;
    onEdit: () => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}) {
    return (
        <div className="flex items-center gap-4 p-3 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-colors">
            <div className="flex flex-col items-center gap-1 shrink-0">
                <button
                    type="button"
                    onClick={onMoveUp}
                    disabled={index === 0}
                    title="Move up"
                    className="w-7 h-7 rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ArrowUp size={12} />
                </button>
                <span className="text-[10px] font-black text-slate-500 tabular-nums">{index + 1}/{total}</span>
                <button
                    type="button"
                    onClick={onMoveDown}
                    disabled={index >= total - 1}
                    title="Move down"
                    className="w-7 h-7 rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center justify-center shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ArrowDown size={12} />
                </button>
            </div>

            <div
                className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shrink-0"
                style={{ width: 180, aspectRatio: section!.aspectRatio }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banner.imageUrl} alt={banner.alt || section!.label} className="w-full h-full object-cover" />
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-900 truncate">{banner.alt || <span className="text-slate-400 italic">No alt text</span>}</p>
                {banner.linkUrl ? (
                    <p className="text-[11px] text-slate-500 font-mono truncate inline-flex items-center gap-1.5 mt-1">
                        <ExternalLink size={11} /> {banner.linkUrl}
                    </p>
                ) : (
                    <p className="text-[11px] text-slate-400 mt-1">No click-through URL</p>
                )}
                {banner.updatedAt && (
                    <p className="text-[10px] text-slate-400 mt-1">
                        Last updated {new Date(banner.updatedAt).toLocaleString()}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={onEdit}
                    className="h-9 px-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1.5"
                >
                    <Pencil size={12} /> Edit
                </button>
                <button
                    type="button"
                    onClick={onRemove}
                    className="h-9 px-3 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-[11px] font-bold inline-flex items-center gap-1.5"
                >
                    <Trash2 size={12} /> Remove
                </button>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────

function UploadSheet({
    sectionAspectRatio, sectionSize, sectionLabel, sectionBlurb,
    existing, onCancel, onSave,
}: {
    sectionAspectRatio: string;
    sectionSize: string;
    sectionLabel: string;
    sectionBlurb: string;
    existing?: BannerData;
    onCancel: () => void;
    onSave: (data: BannerData) => void;
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
                        <h2 className="text-xl font-black text-slate-900 mt-0.5">{sectionLabel}</h2>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-sm">{sectionBlurb}</p>
                        <p className="text-[12px] font-bold text-slate-700 mt-2">
                            Recommended size:&nbsp;
                            <span className="font-mono text-teal-600">{sectionSize}</span>
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
                        style={{ aspectRatio: sectionAspectRatio }}
                        className={cn(
                            'w-full rounded-2xl border-2 border-dashed transition-all overflow-hidden flex flex-col items-center justify-center',
                            previewUrl ? 'border-slate-200 bg-slate-900' : 'border-slate-300 hover:border-teal-500 bg-slate-50',
                        )}
                    >
                        {previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={previewUrl} alt={alt || sectionLabel} className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-500">
                                {uploading ? <Loader2 className="animate-spin" /> : <Upload size={22} />}
                                <p className="text-[13px] font-bold">{uploading ? 'Uploading…' : 'Click to upload image'}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                    {sectionSize} · ≤ 5 MB · JPG / PNG / WebP
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
                            placeholder="/categories?category=Beverages"
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
                        <Save size={15} /> {existing ? 'Save changes' : 'Add to section'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
