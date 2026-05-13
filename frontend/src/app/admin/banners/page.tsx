'use client';

/**
 * Homepage SKETCH — the entry point for the banner manager.
 *
 * This page draws a wireframe of the live homepage:
 *   1. Hero Slider           (full-width image carousel)
 *   2. Trusted by Brands     (logo marquee)
 *   3. Top Categories         (five image cards)
 *   4. Promo / Mid / Footer   (additional banner slots)
 *
 * Every clickable area routes to /admin/banners/<sectionId> where the
 * full editor for that section lives (add/remove/reorder/animated/delay).
 *
 * The thumbnails inside each block are the LIVE current images that the
 * homepage is actually rendering, so the admin can tell which slot is
 * which by sight — exactly like the operator asked for.
 */

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Layout, Pencil, Loader2, ChevronRight, ChevronLeft, Play, Pause } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { SECTIONS, BannerMap, BannerData, getSectionById } from './_sections';

export default function HomepageBannerSketchPage() {
    const [banners, setBanners] = React.useState<BannerMap>({});
    const [loading, setLoading] = React.useState(true);

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

    if (loading) {
        return (
            <div className="py-24 flex justify-center">
                <Loader2 className="animate-spin text-teal-500" size={28} />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 border border-teal-300/30 flex items-center justify-center">
                    <Layout className="text-teal-500" size={26} />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-teal-500">Homepage map</p>
                    <h1 className="text-3xl font-black tracking-tight">Atlantis Homepage Layout</h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                        This is the live sketch of your homepage. Click any section to manage its images —
                        add new ones, reorder them, delete, set static or animated, and control the rotation
                        delay. The thumbnails below are the actual images currently rendering on the live site.
                    </p>
                </div>
            </div>

            {/* Browser-chrome wrapper to make it feel like a real preview */}
            <div className="bg-gradient-to-b from-slate-50 to-white border border-slate-200 rounded-3xl p-5 shadow-sm">
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

                <div className="space-y-4">
                    {SECTIONS.map(section => (
                        <SectionPreview
                            key={section.id}
                            section={section}
                            envelope={banners[section.id]}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────
// One row in the homepage sketch. Renders differently depending on
// the section's `sketch` hint so the admin recognises hero vs brand
// strip vs category grid by sight.
// ────────────────────────────────────────────────────────────────────
function SectionPreview({
    section,
    envelope,
}: {
    section: ReturnType<typeof getSectionById> & {};
    envelope?: { items: BannerData[]; animated: boolean; intervalMs: number };
}) {
    const items = envelope?.items || [];
    const animated = envelope?.animated ?? section!.defaultAnimated;
    const count = items.length;

    return (
        <Link
            href={`/admin/banners/${section!.id}`}
            className="block relative group rounded-2xl border-2 border-slate-200 bg-white hover:border-teal-400 hover:shadow-md overflow-hidden transition-all"
        >
            {/* Section header strip */}
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <h3 className="text-[14px] font-black text-slate-900 truncate">{section!.label}</h3>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                        {section!.size}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        count === 0 ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                        {count} image{count === 1 ? '' : 's'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1 ${
                        animated ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500'
                    }`}>
                        {animated ? <><Play size={9} /> Animated</> : <><Pause size={9} /> Static</>}
                    </span>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-600 group-hover:text-teal-700 shrink-0">
                    <Pencil size={12} /> Manage
                    <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                </span>
            </div>

            {/* Sketch body — different layout per section sketch type */}
            <div className="p-5">
                {section!.sketch === 'hero' && <HeroSketch items={items} />}
                {section!.sketch === 'brand-strip' && <BrandStripSketch items={items} />}
                {section!.sketch === 'category-grid' && <CategoryGridSketch items={items} />}
                {section!.sketch === 'promo-pair' && <PromoPairSketch items={items} />}
                {section!.sketch === 'wide-banner' && <WideBannerSketch items={items} aspect="16/2" />}
                {section!.sketch === 'mid-pair' && <PromoPairSketch items={items} aspect="8/3" />}
                {section!.sketch === 'footer-strip' && <WideBannerSketch items={items} aspect="16/2" />}
            </div>

            {/* Empty-state overlay hint */}
            {count === 0 && (
                <div className="absolute inset-x-5 bottom-5 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-500 bg-white border border-dashed border-slate-300 px-3 py-1.5 rounded-full">
                        No images yet — click to add
                    </span>
                </div>
            )}
        </Link>
    );
}

// ─────────── Section sketches ────────────────────────────────────────

function HeroSketch({ items }: { items: BannerData[] }) {
    return (
        <div className="relative w-full rounded-xl overflow-hidden bg-[#0B1F3A] aspect-[16/6]">
            {items[0]?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={items[0].imageUrl} alt="" className="w-full h-full object-cover opacity-70" />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#0B1F3A] to-[#14B8A6]/40" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <p className="text-white text-3xl font-black drop-shadow-lg">
                    Direct Sourcing <span className="text-[#14B8A6]">No Middlemen</span>
                </p>
                <p className="text-white/80 text-[12px] mt-2 max-w-md">Sample headline from your live homepage</p>
            </div>
            {items.length > 1 && (
                <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5">
                    {items.slice(0, 6).map((_, i) => (
                        <span key={i} className={`h-1.5 rounded-full ${i === 0 ? 'w-6 bg-teal-300' : 'w-1.5 bg-white/60'}`} />
                    ))}
                    {items.length > 6 && <span className="text-[10px] text-white/70 ms-2 font-bold">+{items.length - 6}</span>}
                </div>
            )}
        </div>
    );
}

function BrandStripSketch({ items }: { items: BannerData[] }) {
    if (items.length === 0) {
        return (
            <div className="h-20 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                <span className="text-[11px] text-slate-400 font-bold">Trusted brand logos appear here</span>
            </div>
        );
    }
    return (
        <div className="h-20 rounded-xl border border-slate-200 bg-white flex items-center px-4 gap-6 overflow-hidden">
            {items.slice(0, 8).map((b, i) => (
                <div key={i} className="h-10 w-24 flex-shrink-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.imageUrl} alt={b.alt || ''} className="max-h-10 max-w-full object-contain grayscale opacity-80" />
                </div>
            ))}
            {items.length > 8 && (
                <span className="text-[10px] text-slate-400 font-bold shrink-0">+{items.length - 8} more</span>
            )}
        </div>
    );
}

function CategoryGridSketch({ items }: { items: BannerData[] }) {
    // Five-card layout that mirrors TOP_BUSINESS_CATEGORIES on the homepage.
    const slots = Array.from({ length: 5 }).map((_, i) => items[i]);
    return (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {slots.map((b, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[3/2] relative">
                    {b?.imageUrl ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.imageUrl} alt={b.alt || ''} className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                                <p className="text-white text-[10px] font-bold truncate">{b.alt || `Slot ${i + 1}`}</p>
                            </div>
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
                            Card {i + 1}
                        </div>
                    )}
                </div>
            ))}
            {items.length > 5 && (
                <div className="col-span-2 sm:col-span-5 text-end">
                    <span className="text-[10px] text-slate-400 font-bold">+{items.length - 5} extra image{items.length - 5 === 1 ? '' : 's'} available — managed in the editor</span>
                </div>
            )}
        </div>
    );
}

function PromoPairSketch({ items, aspect = '3/2' }: { items: BannerData[]; aspect?: string }) {
    const slots = Array.from({ length: 2 }).map((_, i) => items[i]);
    return (
        <div className="grid grid-cols-2 gap-3">
            {slots.map((b, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative" style={{ aspectRatio: aspect }}>
                    {b?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.imageUrl} alt={b.alt || ''} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
                            Banner {i + 1}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function WideBannerSketch({ items, aspect }: { items: BannerData[]; aspect: string }) {
    const b = items[0];
    return (
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative" style={{ aspectRatio: aspect }}>
            {b?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imageUrl} alt={b.alt || ''} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-slate-400">
                    Wide banner — click to add
                </div>
            )}
        </div>
    );
}
