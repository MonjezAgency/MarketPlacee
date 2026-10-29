'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
    Plus, Trash2, Send, CheckCircle2, BadgeCheck, ArrowRight, X,
    Loader2, Search, Repeat, MapPin, ShieldCheck, Clock3, Inbox, ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiFetch, fetchSearchSuggestions, fetchProductById } from '@/lib/api';
import { getDepartment, DEPARTMENTS } from '@/lib/departments';
import { cn } from '@/lib/utils';
import type { Product } from '@/lib/types';

type Unit = 'cartons' | 'pallets' | 'trucks';
type Frequency = 'One-off' | 'Weekly' | 'Monthly' | 'Quarterly';

interface Line {
    id: string;
    product: string;
    ean?: string;
    productId?: string;
    image?: string;
    brand?: string;
    quantity: string;
    /** Empty until the buyer picks one — never defaulted silently. */
    unit: Unit | '';
    targetPrice: string;
    /** Result of resolving an EAN or product link typed into this line. */
    lookup?: { state: 'resolving' | 'catalog' | 'external' | 'notfound' | 'unsupported'; message?: string };
}

/** Stored per browser so buyers can see what they sent (the desk replies by email / support inbox). */
interface SentRequest {
    ref: string;
    sentAt: string;
    lines: number;
    frequency?: Frequency;
    volumes?: { unit: Unit; n: number }[];
    brand?: string;
    image?: string;
    summary: string;
}

const UNITS: Unit[] = ['cartons', 'pallets', 'trucks'];
const FREQUENCIES: Frequency[] = ['One-off', 'Weekly', 'Monthly', 'Quarterly'];
const RECENT_KEY = 'atl_sourcing_requests';

const newLine = (patch: Partial<Line> = {}): Line => ({
    id: Math.random().toString(36).slice(2, 10),
    product: '',
    quantity: '',
    unit: '',
    targetPrice: '',
    ...patch,
});

function readRecent(): SentRequest[] {
    try {
        const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(v) ? v.slice(0, 12) : [];
    } catch { return []; }
}

const UNIT_ALIASES: Record<string, Unit> = {
    pallet: 'pallets', pallets: 'pallets', plt: 'pallets', plts: 'pallets', pal: 'pallets',
    carton: 'cartons', cartons: 'cartons', ctn: 'cartons', ctns: 'cartons', case: 'cartons', cases: 'cartons', box: 'cartons', boxes: 'cartons',
    truck: 'trucks', trucks: 'trucks', ftl: 'trucks', container: 'trucks', containers: 'trucks',
};

/**
 * Turns one pasted/typed line into a buying-list line. Understands
 * "33 pallets Red Bull 250ml", "Red Bull 250ml - 33 pallets",
 * "Red Bull 250ml x 10" and plain "Red Bull 250ml".
 */
function parseListLine(raw: string): Line | null {
    const text = raw.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const unitRe = '(pallets?|plts?|pal|cartons?|ctns?|cases?|box(?:es)?|trucks?|ftl|containers?)';
    let m = text.match(new RegExp(`^(\\d[\\d.,]*)\\s*${unitRe}?\\s*(?:x|of|-|:)?\\s+(.+)$`, 'i'));
    if (m) return newLine({ product: m[3].trim(), quantity: m[1].replace(/[.,](?=\d{3}\b)/g, ''), unit: m[2] ? UNIT_ALIASES[m[2].toLowerCase()] || '' : '' });
    // Trailing quantity needs a unit ("… 33 pallets") or an "x" ("… x 10") —
    // otherwise "Nutella 750" would read as 750 pallets.
    m = text.match(new RegExp(`^(.+?)\\s*[-–:,]?\\s+(\\d[\\d.,]*)\\s*${unitRe}$`, 'i'))
        || text.match(new RegExp(`^(.+?)\\s+[x×]\\s*(\\d[\\d.,]*)()$`, 'i'));
    if (m && m[1].trim().length > 1) return newLine({ product: m[1].trim(), quantity: m[2].replace(/[.,](?=\d{3}\b)/g, ''), unit: m[3] ? UNIT_ALIASES[m[3].toLowerCase()] || '' : '' });
    return newLine({ product: text });
}

/** GTIN/EAN: 8, 12, 13 or 14 digits. */
const isEan = (v: string) => /^(\d{8}|\d{12,14})$/.test(v.replace(/\s/g, ''));

/** Ali FMCG product link → product id; null for anything else. */
function productIdFromUrl(v: string): string | null | 'external' {
    let u: URL;
    try { u = new URL(v.trim()); } catch { return null; }
    const ours = typeof window !== 'undefined' && (u.host === window.location.host || /(^|\.)atlantisfmcg\.com$/.test(u.hostname));
    const m = u.pathname.match(/^\/products\/([^/?#]+)/);
    return ours && m ? decodeURIComponent(m[1]) : 'external';
}

export type LineErrors = Partial<Record<'product' | 'quantity' | 'unit' | 'targetPrice', string>>;

/** Validate one line independently. Empty quantity is an error, never 0. */
function validateLine(l: Line): LineErrors {
    const e: LineErrors = {};
    if (!l.product.trim()) e.product = 'Add a product name, EAN or product link.';
    const q = l.quantity.trim();
    if (!q) e.quantity = 'Enter a quantity.';
    else if (!/^\d+$/.test(q) || Number(q) <= 0) e.quantity = 'Quantity must be a whole number above 0.';
    if (!l.unit) e.unit = 'Choose cartons, pallets or trucks.';
    const t = l.targetPrice.trim();
    if (t && (!/^\d+(\.\d{1,2})?$/.test(t) || Number(t) <= 0)) e.targetPrice = 'Use a price above 0, max 2 decimals.';
    return e;
}

function timeAgo(iso: string): string {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${mins || 1}m ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

/** Brand tile — product image when we have one, otherwise a monogram. */
function BrandTile({ name, image, size = 48 }: { name?: string; image?: string; size?: number }) {
    const [broken, setBroken] = React.useState(false);
    const initials = (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return (
        <span
            className="rounded-xl bg-surface border border-line overflow-hidden flex items-center justify-center shrink-0"
            style={{ width: size, height: size }}
        >
            {image && !broken ? (
                <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-full h-full object-contain p-1 mix-blend-multiply" />
            ) : (
                <span className="w-full h-full flex items-center justify-center bg-cta text-[#2EC4B6] text-[14px] font-bold">{initials}</span>
            )}
        </span>
    );
}

/** Parallel-style request card, in Ali FMCG colours. */
function RequestCard({ r }: { r: SentRequest }) {
    const vol = r.volumes && r.volumes.length ? r.volumes.map((v) => `${v.n.toLocaleString()} ${v.n === 1 ? v.unit.replace(/s$/, '') : v.unit}`).join(' · ') : r.summary;
    return (
        <article className="group bg-surface border border-line rounded-2xl hover:border-line-strong hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all">
            <div className="flex items-center gap-3 px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[15px] text-ink"><span className="font-bold tabular-nums">{r.lines}</span> {r.lines === 1 ? 'line' : 'lines'}</span>
                    {r.frequency && r.frequency !== 'One-off' && (
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-line text-[11px] font-medium text-ink-2">
                            <Repeat size={11} /> {r.frequency}
                        </span>
                    )}
                </div>
                <BrandTile name={r.brand} image={r.image} />
            </div>
            <div className="mx-5 border-t border-line" />
            <div className="flex items-center justify-between gap-3 px-5 py-4">
                <span className="text-[14px] font-semibold text-ink truncate">{vol}</span>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 shrink-0">
                    <Clock3 size={13} /> {timeAgo(r.sentAt)}
                </span>
            </div>
            <div className="px-5 pb-4 -mt-1 flex items-center justify-between">
                <span className="text-[11px] text-ink-4 tabular-nums">{r.ref}</span>
                <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-[#FFF7E6] text-[#B45309] text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" /> Awaiting quote
                </span>
            </div>
        </article>
    );
}

/** One line of the buying list, with live product suggestions. */
function LineRow({ line, index, canRemove, onChange, onRemove, onResolve, placeholder, errors }: {
    line: Line;
    index: number;
    canRemove: boolean;
    onChange: (patch: Partial<Line>) => void;
    onRemove: () => void;
    onResolve: () => void;
    placeholder: string;
    errors: LineErrors;
}) {
    const [suggestions, setSuggestions] = React.useState<Product[]>([]);
    const [open, setOpen] = React.useState(false);
    const boxRef = React.useRef<HTMLDivElement>(null);
    const err = (k: keyof LineErrors) => errors[k];
    const ring = (bad?: string) => (bad ? 'border-[#FCA5A5] bg-[#FFFBFB]' : 'border-line');

    React.useEffect(() => {
        const q = line.product.trim();
        if (q.length < 2 || line.productId || /^https?:\/\//i.test(q)) { setSuggestions([]); return; }
        const t = setTimeout(() => {
            fetchSearchSuggestions(q).then((r) => setSuggestions(r.slice(0, 6))).catch(() => setSuggestions([]));
        }, 250);
        return () => clearTimeout(t);
    }, [line.product, line.productId]);

    React.useEffect(() => {
        const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const lk = line.lookup;

    return (
        <div className="py-4 border-b border-line last:border-0">
            <div className="flex flex-wrap sm:flex-nowrap gap-3 items-start">
                <span className="hidden sm:flex w-7 shrink-0 h-11 items-center text-[13px] font-semibold text-ink-4 tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                </span>

                {/* Product: name, EAN or Ali FMCG product link */}
                <div ref={boxRef} className="relative w-full sm:w-auto sm:flex-1 min-w-0">
                    <label className="sr-only" htmlFor={`p-${line.id}`}>Product name, EAN or product link</label>
                    <div className={cn('flex items-center h-11 rounded-xl border bg-surface-2 focus-within:bg-surface focus-within:border-[#2EC4B6] focus-within:ring-4 focus-within:ring-[#2EC4B6]/10 transition-all', ring(err('product')))}>
                        {line.image ? (
                            <img src={line.image} alt="" referrerPolicy="no-referrer" className="ms-1.5 w-8 h-8 rounded-lg object-contain bg-surface mix-blend-multiply shrink-0" />
                        ) : (
                            <Search size={16} className="ms-3 text-ink-4 shrink-0" />
                        )}
                        <input
                            id={`p-${line.id}`}
                            value={line.product}
                            onChange={(e) => { onChange({ product: e.target.value, productId: undefined, ean: undefined, image: undefined, brand: undefined, lookup: undefined }); setOpen(true); }}
                            onFocus={() => setOpen(true)}
                            onBlur={() => { const v = line.product.trim(); if (!line.productId && (isEan(v) || /^https?:\/\//i.test(v))) onResolve(); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setOpen(false); onResolve(); } }}
                            placeholder={placeholder}
                            autoComplete="off"
                            aria-invalid={!!err('product')}
                            aria-describedby={`p-${line.id}-msg`}
                            className="flex-1 min-w-0 h-full px-2.5 bg-transparent outline-none text-[14px] text-ink placeholder:text-ink-4"
                        />
                        {lk?.state === 'resolving' && <Loader2 size={15} className="me-3 animate-spin text-ink-4 shrink-0" />}
                        {line.productId && (
                            <span className="me-2 inline-flex items-center gap-1 px-2 h-6 rounded-full bg-teal-soft text-teal text-[11px] font-semibold shrink-0">
                                <BadgeCheck size={12} /> In catalog
                            </span>
                        )}
                    </div>
                    <div id={`p-${line.id}-msg`} className="mt-1 ms-1 space-y-0.5">
                        {(line.ean || line.productId) && (
                            <p className="text-[11px] text-ink-3 tabular-nums flex items-center gap-2">
                                {line.ean && <span>EAN {line.ean}</span>}
                                {line.productId && (
                                    <Link href={`/products/${line.productId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-teal hover:underline">
                                        View product <ArrowUpRight size={11} />
                                    </Link>
                                )}
                            </p>
                        )}
                        {lk?.message && lk.state !== 'resolving' && (
                            <p className={cn('text-[12px] leading-snug', lk.state === 'external' ? 'text-ink-2' : 'text-[#B45309]')}>{lk.message}</p>
                        )}
                        {err('product') && <p className="text-[12px] text-[#DC2626]">{err('product')}</p>}
                    </div>

                    {open && suggestions.length > 0 && (
                        <div className="absolute z-20 top-11 mt-1.5 inset-x-0 bg-surface border border-line rounded-xl shadow-[0_16px_40px_rgba(15,23,42,0.12)] p-1.5 max-h-72 overflow-y-auto">
                            {suggestions.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => { onChange({ product: p.name, productId: p.id, ean: p.ean, brand: p.brand, image: p.image || p.images?.[0], lookup: { state: 'catalog' } }); setOpen(false); }}
                                    className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-surface-2 text-start"
                                >
                                    <span className="w-9 h-9 rounded-lg bg-surface border border-line overflow-hidden shrink-0 flex items-center justify-center">
                                        {(p.image || p.images?.[0]) && (
                                            <img src={p.image || p.images?.[0]} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain mix-blend-multiply" />
                                        )}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-medium text-ink truncate">{p.name}</span>
                                        <span className="block text-[11px] text-ink-3 tabular-nums">{[p.brand, p.ean].filter(Boolean).join(' · ')}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Quantity + unit */}
                <div className="flex-1 sm:flex-none sm:w-[270px]">
                    <div className={cn('flex items-center h-11 rounded-xl border bg-surface overflow-hidden focus-within:border-[#2EC4B6]', ring(err('quantity') || err('unit')))}>
                        <label className="sr-only" htmlFor={`q-${line.id}`}>Quantity</label>
                        <input
                            id={`q-${line.id}`}
                            type="text"
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(e) => onChange({ quantity: e.target.value.replace(/[^\d]/g, '') })}
                            placeholder="Qty"
                            aria-invalid={!!err('quantity')}
                            className="w-16 sm:w-20 h-full px-3 outline-none bg-transparent text-[14px] font-semibold text-ink tabular-nums placeholder:font-normal placeholder:text-ink-4"
                        />
                        <div role="radiogroup" aria-label="Unit" className="flex-1 flex h-full border-s border-line p-1 gap-1 bg-surface-2">
                            {UNITS.map((u) => (
                                <button
                                    key={u}
                                    type="button"
                                    role="radio"
                                    aria-checked={line.unit === u}
                                    onClick={() => onChange({ unit: u })}
                                    className={cn(
                                        'flex-1 rounded-lg text-[12px] font-semibold capitalize transition-colors',
                                        line.unit === u ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink'
                                    )}
                                >
                                    {u}
                                </button>
                            ))}
                        </div>
                    </div>
                    {(err('quantity') || err('unit')) && (
                        <p className="mt-1 ms-1 text-[12px] text-[#DC2626]">{err('quantity') || err('unit')}</p>
                    )}
                </div>

                {/* Target price */}
                <div className="w-[104px] shrink-0">
                    <div className="relative">
                        <label className="sr-only" htmlFor={`t-${line.id}`}>Target price per case in EUR (optional)</label>
                        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-4">€</span>
                        <input
                            id={`t-${line.id}`}
                            type="text"
                            inputMode="decimal"
                            value={line.targetPrice}
                            onChange={(e) => onChange({ targetPrice: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })}
                            placeholder="Target"
                            title="Optional target price per case (EUR)"
                            aria-invalid={!!err('targetPrice')}
                            className={cn('w-full h-11 ps-7 pe-2 rounded-xl border outline-none focus:border-[#2EC4B6] text-[14px] text-ink tabular-nums placeholder:text-ink-4', ring(err('targetPrice')))}
                        />
                    </div>
                    {err('targetPrice') && <p className="mt-1 text-[11px] leading-snug text-[#DC2626]">{err('targetPrice')}</p>}
                </div>

                <button
                    type="button"
                    onClick={onRemove}
                    disabled={!canRemove}
                    aria-label={`Remove line ${index + 1}`}
                    className="w-11 shrink-0 h-11 flex items-center justify-center rounded-xl text-ink-4 hover:text-[#DC2626] hover:bg-[#FEF2F2] dark:hover:bg-red-500/15 disabled:opacity-0 transition-colors"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}

/** Hero composer — "Search products, or paste your list". */
function Composer({ onAdd, placeholder }: { onAdd: (lines: Line[]) => void; placeholder: string }) {
    const [value, setValue] = React.useState('');
    const [suggestions, setSuggestions] = React.useState<Product[]>([]);
    const [open, setOpen] = React.useState(false);
    const [active, setActive] = React.useState(-1);
    const boxRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const q = value.trim();
        if (q.length < 2 || q.includes('\n')) { setSuggestions([]); return; }
        const t = setTimeout(() => {
            fetchSearchSuggestions(q).then((r) => { setSuggestions(r.slice(0, 6)); setActive(-1); }).catch(() => setSuggestions([]));
        }, 220);
        return () => clearTimeout(t);
    }, [value]);

    React.useEffect(() => {
        const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const addText = (text: string) => {
        const lines = text.split(/\r?\n|;/).map(parseListLine).filter(Boolean) as Line[];
        if (lines.length) { onAdd(lines); setValue(''); setSuggestions([]); setOpen(false); }
    };
    const addProduct = (p: Product) => {
        onAdd([newLine({ product: p.name, productId: p.id, ean: p.ean, brand: p.brand, image: p.image || p.images?.[0] })]);
        setValue(''); setSuggestions([]); setOpen(false);
    };

    return (
        <div ref={boxRef} className="relative w-full max-w-[720px] mx-auto">
            <form
                onSubmit={(e) => { e.preventDefault(); if (active >= 0 && suggestions[active]) addProduct(suggestions[active]); else addText(value); }}
                className="flex items-center h-16 ps-5 pe-2 rounded-full bg-surface border border-line shadow-[0_10px_30px_rgba(11,31,58,0.08)] focus-within:border-[#2EC4B6] focus-within:ring-4 focus-within:ring-[#2EC4B6]/10 transition-all"
            >
                <Plus size={20} className="text-ink-3 shrink-0" />
                <input
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onPaste={(e) => {
                        const text = e.clipboardData.getData('text');
                        if (/\r?\n/.test(text.trim())) { e.preventDefault(); addText(text); }
                    }}
                    onKeyDown={(e) => {
                        if (!suggestions.length) return;
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, suggestions.length - 1)); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
                        if (e.key === 'Escape') setOpen(false);
                    }}
                    placeholder={placeholder}
                    aria-label="Search products, or paste your list"
                    autoComplete="off"
                    className="flex-1 min-w-0 h-full px-4 bg-transparent outline-none text-[16px] text-ink placeholder:text-ink-4"
                />
                <button
                    type="submit"
                    aria-label="Add to list"
                    disabled={!value.trim()}
                    className="w-12 h-12 rounded-full bg-cta hover:bg-cta-hover disabled:bg-surface-3 disabled:text-ink-4 text-cta-fg flex items-center justify-center transition-colors shrink-0"
                >
                    <ArrowRight size={20} />
                </button>
            </form>

            {open && suggestions.length > 0 && (
                <div className="absolute z-30 top-full mt-2 inset-x-0 bg-surface border border-line rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.14)] p-2 text-start">
                    <p className="px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-4">From the Ali FMCG catalog</p>
                    {suggestions.map((p, i) => (
                        <button
                            key={p.id}
                            type="button"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => addProduct(p)}
                            className={cn('w-full flex items-center gap-3 px-3 py-2 rounded-xl text-start', active === i ? 'bg-surface-3' : 'hover:bg-surface-2')}
                        >
                            <BrandTile name={p.brand || p.name} image={p.image || p.images?.[0]} size={40} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-medium text-ink truncate">{p.name}</span>
                                <span className="block text-[12px] text-ink-3 tabular-nums">{[p.brand, p.ean].filter(Boolean).join(' · ')}</span>
                            </span>
                            <Plus size={16} className="text-ink-4" />
                        </button>
                    ))}
                    <button type="button" onClick={() => addText(value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-start text-[13px] text-ink-2 hover:bg-surface-2">
                        Add “<span className="font-semibold text-ink">{value.trim()}</span>” as written
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Soft mint spotlight that eases toward the cursor and glides back to the
 * centre on leave. One rAF loop writes `transform` directly — no React
 * re-renders, GPU-composited, and it stops once the glow settles.
 * Touch devices and prefers-reduced-motion keep the static centred glow.
 */
function HeroSpotlight({ containerRef }: { containerRef: React.RefObject<HTMLElement> }) {
    const glowRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const el = containerRef.current;
        const glow = glowRef.current;
        if (!el || !glow) return;

        // Default resting point: horizontally centred, just above the composer.
        const home = () => ({ x: el.clientWidth / 2, y: el.clientHeight * 0.42 });
        let pos = home();
        let target = { ...pos };
        let raf = 0;
        let last = 0;
        let following = false;

        const paint = () => { glow.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`; };
        paint();

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');

        const tick = (now: number) => {
            const dt = Math.min(64, last ? now - last : 16.7);
            last = now;
            // Frame-rate independent easing: slower drift when returning home.
            const k = 1 - Math.pow(1 - (following ? 0.09 : 0.05), dt / 16.7);
            pos = { x: pos.x + (target.x - pos.x) * k, y: pos.y + (target.y - pos.y) * k };
            paint();
            if (Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y) > 0.4) raf = requestAnimationFrame(tick);
            else { pos = { ...target }; paint(); raf = 0; last = 0; }
        };
        const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

        const onMove = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse' || reduced.matches || !canHover.matches) return;
            const r = el.getBoundingClientRect();
            following = true;
            target = { x: e.clientX - r.left, y: e.clientY - r.top };
            kick();
        };
        const onLeave = () => { following = false; target = home(); kick(); };
        const onResize = () => {
            if (following) return;
            pos = home(); target = { ...pos }; paint();
        };

        el.addEventListener('pointermove', onMove, { passive: true });
        el.addEventListener('pointerleave', onLeave);
        const ro = new ResizeObserver(onResize);
        ro.observe(el);
        return () => {
            cancelAnimationFrame(raf);
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerleave', onLeave);
            ro.disconnect();
        };
    }, [containerRef]);

    return (
        <div
            ref={glowRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 w-[min(760px,140vw)] h-[440px] will-change-transform"
            style={{
                transform: 'translate3d(50vw, 0, 0) translate(-50%, -50%)',
                background: 'radial-gradient(closest-side, rgba(46,196,182,0.16), rgba(46,196,182,0.07) 45%, rgba(46,196,182,0) 100%)',
            }}
        />
    );
}

function RequestsContent() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const dept = getDepartment(searchParams.get('dept'));

    const [lines, setLines] = React.useState<Line[]>([]);
    const [frequency, setFrequency] = React.useState<Frequency>('One-off');
    const [destination, setDestination] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [contact, setContact] = React.useState({ name: '', email: '', company: '' });
    const [status, setStatus] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [sentRef, setSentRef] = React.useState('');
    const [recent, setRecent] = React.useState<SentRequest[]>([]);
    const [touched, setTouched] = React.useState(false);
    const [skuCount, setSkuCount] = React.useState<number | null>(null);
    const builderRef = React.useRef<HTMLDivElement>(null);
    const heroRef = React.useRef<HTMLElement>(null);

    React.useEffect(() => {
        setRecent(readRecent());
        try { setDestination(localStorage.getItem('atl_delivery_address') || ''); } catch { /* noop */ }
        // Real catalog size for the stat chip — hidden if unavailable.
        apiFetch('/products?status=APPROVED&limit=1')
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (j && typeof j.total === 'number') setSkuCount(j.total); })
            .catch(() => { /* chip stays hidden */ });
    }, []);

    React.useEffect(() => {
        if (user) setContact((c) => ({ name: c.name || user.name || '', email: c.email || user.email || '', company: c.company || (user as any).companyName || (user as any).company || '' }));
    }, [user]);

    const addLines = (incoming: Line[]) => {
        setLines((ls) => [...ls, ...incoming]);
        setStatus((s) => (s === 'sent' ? 'idle' : s));
        setTimeout(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    // "Request a quote" from a product page: /requests?product=<id>&qty=<n>&unit=<cartons|pallets|trucks>
    // pre-fills one line with that real catalog product. Runs once.
    const prefilled = React.useRef(false);
    React.useEffect(() => {
        const pid = searchParams.get('product');
        if (!pid || prefilled.current) return;
        prefilled.current = true;
        const unit = searchParams.get('unit');
        const qty = searchParams.get('qty');
        fetchProductById(pid).then((p) => {
            if (!p) return;
            addLines([newLine({
                product: p.name, productId: p.id, ean: p.ean, brand: p.brand, image: p.image || p.images?.[0],
                quantity: qty && /^\d+$/.test(qty) ? qty : '',
                unit: (UNITS as string[]).includes(unit || '') ? (unit as Unit) : '',
            })]);
        }).catch(() => { /* leave the composer empty */ });
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

    /**
     * Resolve an EAN or product link typed into a line. Catalog first; for
     * EANs not in the catalog, the existing EAN lookup service (only a
     * confident match is accepted). Nothing is invented: unknown EANs stay
     * as written with an explanation.
     */
    const resolveLine = async (line: Line) => {
        const raw = line.product.trim();
        if (!raw || line.productId) return;
        const urlId = productIdFromUrl(raw);
        if (urlId === 'external') {
            update(line.id, { lookup: { state: 'unsupported', message: 'We can only read Ali FMCG product links. Add the product name or EAN instead.' } });
            return;
        }
        if (urlId) {
            update(line.id, { lookup: { state: 'resolving' } });
            const p = await fetchProductById(urlId).catch(() => null);
            if (p) update(line.id, { product: p.name, productId: p.id, ean: p.ean, brand: p.brand, image: p.image || p.images?.[0], lookup: { state: 'catalog' } });
            else update(line.id, { lookup: { state: 'notfound', message: 'This link doesn\u2019t match a product in the Ali FMCG catalog.' } });
            return;
        }
        const ean = raw.replace(/\s/g, '');
        if (!isEan(ean)) return;
        update(line.id, { lookup: { state: 'resolving' } });
        const hits = await fetchSearchSuggestions(ean).catch(() => [] as Product[]);
        const exact = hits.find((p) => (p.ean || '').replace(/\s/g, '') === ean);
        if (exact) {
            update(line.id, { product: exact.name, productId: exact.id, ean: exact.ean, brand: exact.brand, image: exact.image || exact.images?.[0], lookup: { state: 'catalog' } });
            return;
        }
        try {
            const r = await apiFetch('/products/ean-lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ean, image_count: 1 }) });
            const j = r.ok ? await r.json() : null;
            if (j?.matched && (j.confidence_score ?? 0) >= 0.8 && j.title) {
                update(line.id, {
                    product: j.title, ean, image: j.images?.[0],
                    lookup: { state: 'external', message: 'Identified from the EAN database — not currently listed on Ali FMCG. Our desk will source it.' },
                });
                return;
            }
        } catch { /* fall through */ }
        update(line.id, { ean, lookup: { state: 'notfound', message: `EAN ${ean} isn\u2019t in the Ali FMCG catalog and couldn\u2019t be identified. Add the product name so our desk can source it.` } });
    };

    // Resolve EANs / links that arrive via the composer.
    const addLinesResolved = (incoming: Line[]) => {
        addLines(incoming);
        incoming.forEach((l) => { const v = l.product.trim(); if (isEan(v) || /^https?:\/\//i.test(v)) resolveLine(l); });
    };

    const lineErrors = Object.fromEntries(lines.map((l) => [l.id, validateLine(l)])) as Record<string, LineErrors>;
    const linesValid = lines.length > 0 && lines.every((l) => Object.keys(lineErrors[l.id]).length === 0) && !lines.some((l) => l.lookup?.state === 'resolving');
    const filled = lines.filter((l) => Object.keys(lineErrors[l.id]).length === 0);
    const totals = UNITS.map((u) => ({ unit: u, n: filled.filter((l) => l.unit === u).reduce((s, l) => s + Number(l.quantity), 0) })).filter((x) => x.n > 0);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email);
    const destinationOk = destination.trim().length >= 2;
    const canSend = linesValid && destinationOk && !!contact.name.trim() && emailOk && status !== 'sending';
    const openCount = recent.length;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!canSend) {
            // Move focus to the first invalid field so the message is seen.
            setTimeout(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 0);
            return;
        }
        setStatus('sending');
        const ref = `ATL-REQ-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const body = [
            `Sourcing request ${ref}`,
            dept ? `Department: ${dept.label}` : '',
            `Frequency: ${frequency}`,
            destination ? `Deliver to: ${destination}` : '',
            '',
            ...filled.map((l, i) =>
                `${i + 1}. ${l.product}${l.ean ? ` (EAN ${l.ean})` : ''} — ${l.quantity} ${l.unit}${l.targetPrice ? ` — target €${l.targetPrice}/case` : ''}`),
            notes.trim() ? `\nNotes: ${notes.trim()}` : '',
        ].filter((x) => x !== '').join('\n');

        try {
            const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
            const res = await fetch(`${apiBase}/contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: contact.name.trim(),
                    email: contact.email.trim(),
                    company: contact.company.trim() || undefined,
                    topic: 'Sourcing Request',
                    message: body,
                }),
            });
            if (!res.ok) throw new Error('Failed');
            const lead = filled.find((l) => l.image) || filled[0];
            const entry: SentRequest = {
                ref,
                sentAt: new Date().toISOString(),
                lines: filled.length,
                frequency,
                volumes: totals,
                brand: lead.brand || lead.product,
                image: lead.image,
                summary: filled.slice(0, 2).map((l) => `${l.quantity} ${l.unit} ${l.product}`).join(' · '),
            };
            const next = [entry, ...readRecent()].slice(0, 12);
            try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
            setRecent(next);
            setSentRef(ref);
            setStatus('sent');
            setLines([]);
            setNotes('');
            setFrequency('One-off');
            setTouched(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
            setStatus('error');
        }
    };

    return (
        <div className="min-h-screen bg-background text-start">
            {/* ── Hero composer ──────────────────────────────────────── */}
            <section ref={heroRef} className="relative overflow-hidden bg-surface border-b border-line">
                <div
                    aria-hidden
                    className="absolute inset-0 opacity-[0.5]"
                    style={{
                        backgroundImage: 'radial-gradient(circle at 1px 1px, #D7DEE7 1px, transparent 0)',
                        backgroundSize: '22px 22px',
                        maskImage: 'radial-gradient(ellipse 60% 70% at 50% 45%, #000 30%, transparent 75%)',
                        WebkitMaskImage: 'radial-gradient(ellipse 60% 70% at 50% 45%, #000 30%, transparent 75%)',
                    }}
                />
                <HeroSpotlight containerRef={heroRef} />

                <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-14 sm:pt-24 sm:pb-20 text-center">
                    <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-cta text-[12px] font-semibold text-[#7FE3D9]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6] animate-pulse" /> Ali FMCG Sourcing Desk
                    </span>
                    <h1 className="font-sans mt-5 text-[30px] sm:text-[40px] font-bold tracking-tight text-heading leading-tight">
                        Tell Ali FMCG what you need{dept ? <> in <span className="text-[#0E9F92]">{dept.label}</span></> : null}
                    </h1>
                    <p className="mt-3 text-[15px] text-ink-3 max-w-xl mx-auto">
                        Search the catalog or paste your list — we price every line and send you a quote. Nothing is committed until you approve it.
                    </p>

                    <div className="mt-8">
                        <Composer onAdd={addLinesResolved} placeholder={dept ? `Search ${dept.label.toLowerCase()}, or paste your list` : 'Search products, or paste your list'} />
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-ink-3">
                        {skuCount !== null && (
                            <span className="inline-flex items-center gap-2">SKUs in catalog <span className="px-2 h-6 inline-flex items-center rounded-md bg-cta text-cta-fg text-[12px] font-semibold tabular-nums">{skuCount.toLocaleString()}</span></span>
                        )}
                        {skuCount !== null && <span className="w-px h-4 bg-surface-3" aria-hidden />}
                        <span className="inline-flex items-center gap-2">Your requests <span className="px-2 h-6 inline-flex items-center rounded-md bg-cta text-cta-fg text-[12px] font-semibold tabular-nums">{openCount}</span></span>
                        <span className="w-px h-4 bg-surface-3" aria-hidden />
                        <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#2EC4B6]" /> Confirmed before you pay</span>
                    </div>
                    <p className="mt-3 text-[12px] text-ink-4">Tip: paste lines like “33 pallets Red Bull 250ml” or “Ariel Pods – 200 cartons”.</p>

                    {status === 'sent' && (
                        <div className="mt-8 max-w-[720px] mx-auto flex items-center gap-3 p-4 rounded-2xl bg-[#ECFDF5] dark:bg-emerald-500/15 border border-[#BBF7D0] text-start">
                            <CheckCircle2 size={22} className="text-[#047857] shrink-0" />
                            <p className="text-[14px] text-[#065F46] flex-1">
                                <span className="font-semibold">Request {sentRef} sent.</span> We&apos;ll reply to {contact.email} with a quote
                                {user ? <> — also in your <Link href="/dashboard/support" className="underline font-semibold">support inbox</Link></> : null}.
                            </p>
                            <button onClick={() => setStatus('idle')} aria-label="Dismiss" className="text-[#047857] hover:text-[#065F46]"><X size={18} /></button>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Buying list (appears once something is added) ──────── */}
            {lines.length > 0 && (
                <div ref={builderRef} className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 scroll-mt-[150px]">
                    <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 items-start">
                        <div className="space-y-6 min-w-0">
                            <section className="bg-surface border border-line rounded-3xl p-5 sm:p-7">
                                <div className="flex flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <h2 className="font-sans text-[20px] font-bold text-ink">Your buying list</h2>
                                        <p className="text-[13px] text-ink-3 mt-0.5">How much of each — in cartons, pallets or full trucks. Target price per case is optional.</p>
                                    </div>
                                    <button type="button" onClick={() => setLines([])} className="text-[13px] font-medium text-ink-3 hover:text-[#DC2626]">Clear list</button>
                                </div>

                                <div className="hidden sm:flex gap-3 mt-6 pb-2 border-b border-line text-[11px] font-semibold uppercase tracking-wider text-ink-4">
                                    <span className="w-7 shrink-0">#</span>
                                    <span className="flex-1">Product</span>
                                    <span className="w-[270px]">Quantity</span>
                                    <span className="w-[104px]">Target / case</span>
                                    <span className="w-11" />
                                </div>

                                {lines.map((l, i) => (
                                    <LineRow
                                        key={l.id}
                                        line={l}
                                        index={i}
                                        errors={touched ? lineErrors[l.id] : {}}
                                        onResolve={() => resolveLine(l)}
                                        canRemove
                                        placeholder="Product name, EAN or Ali FMCG product link"
                                        onChange={(patch) => update(l.id, patch)}
                                        onRemove={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                                    />
                                ))}

                                <button
                                    type="button"
                                    onClick={() => setLines((ls) => [...ls, newLine()])}
                                    className="mt-4 w-full h-12 rounded-xl border-2 border-dashed border-line-strong hover:border-[#2EC4B6] hover:bg-teal-soft text-[14px] font-semibold text-ink-2 hover:text-teal flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Plus size={16} /> Add another product
                                </button>
                                {touched && !linesValid && (
                                    <p role="alert" className="mt-3 text-[13px] text-[#DC2626]">
                                        {lines.some((l) => l.lookup?.state === 'resolving') ? 'Still looking up a product — one moment.' : 'Fix the highlighted lines before sending.'}
                                    </p>
                                )}
                            </section>

                            <section className="bg-surface border border-line rounded-3xl p-5 sm:p-7 grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div>
                                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink mb-2"><Repeat size={14} className="text-ink-3" /> How often?</p>
                                    <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-surface-2 border border-line">
                                        {FREQUENCIES.map((f) => (
                                            <button key={f} type="button" onClick={() => setFrequency(f)}
                                                className={cn('h-9 rounded-lg text-[12px] font-semibold transition-colors', frequency === f ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink')}>
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="dest" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink mb-2"><MapPin size={14} className="text-ink-3" /> Deliver to <span className="text-[#DC2626]" aria-hidden>*</span></label>
                                    <input id="dest" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City, country" required
                                        aria-invalid={touched && !destinationOk}
                                        className={cn('w-full h-11 px-3.5 rounded-xl border outline-none focus:border-[#2EC4B6] text-[14px] text-ink placeholder:text-ink-4', touched && !destinationOk ? 'border-[#FCA5A5] bg-[#FFFBFB]' : 'border-line')} />
                                    {touched && !destinationOk && <p className="mt-1 ms-1 text-[12px] text-[#DC2626]">Enter a delivery city and country.</p>}
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="notes" className="block text-[13px] font-semibold text-ink mb-2">Anything else? <span className="font-normal text-ink-4">(optional)</span></label>
                                    <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                                        placeholder="Languages on pack, shelf-life minimum, delivery window, Incoterms…"
                                        className="w-full px-3.5 py-3 rounded-xl border border-line outline-none focus:border-[#2EC4B6] text-[14px] text-ink placeholder:text-ink-4 resize-y" />
                                </div>
                            </section>
                        </div>

                        <aside className="lg:sticky lg:top-[150px]">
                            <div className="bg-surface border border-line rounded-3xl overflow-hidden">
                                <div className="px-5 sm:px-6 py-5 bg-cta text-cta-fg">
                                    <p className="text-[12px] font-semibold uppercase tracking-wider text-white/60">Request summary</p>
                                    <p className="mt-1 text-[28px] font-bold tabular-nums leading-none">
                                        {filled.length} <span className="text-[15px] font-semibold text-white/60">{filled.length === 1 ? 'line' : 'lines'}</span>
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {totals.length === 0 ? (
                                            <span className="text-[12px] text-white/50">Add quantities to see volumes</span>
                                        ) : totals.map((x) => (
                                            <span key={x.unit} className="inline-flex items-center h-7 px-2.5 rounded-full bg-white/10 text-[12px] font-semibold tabular-nums">{x.n.toLocaleString()} {x.unit}</span>
                                        ))}
                                        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#2EC4B6]/20 text-[#7FE3D9] text-[12px] font-semibold"><Repeat size={11} /> {frequency}</span>
                                    </div>
                                </div>

                                <div className="p-5 sm:p-6 space-y-3">
                                    {[
                                        { k: 'name', label: 'Your name', type: 'text', auto: 'name', required: true },
                                        { k: 'email', label: 'Work email', type: 'email', auto: 'email', required: true },
                                        { k: 'company', label: 'Company (optional)', type: 'text', auto: 'organization', required: false },
                                    ].map((f) => (
                                        <div key={f.k}>
                                            <label htmlFor={`c-${f.k}`} className="block text-[12px] font-semibold text-ink-2 mb-1.5">{f.label}</label>
                                            <input id={`c-${f.k}`} type={f.type} autoComplete={f.auto} value={(contact as any)[f.k]}
                                                onChange={(e) => setContact((c) => ({ ...c, [f.k]: e.target.value }))}
                                                className={cn('w-full h-11 px-3.5 rounded-xl border outline-none focus:border-[#2EC4B6] text-[14px] text-ink',
                                                    touched && f.required && ((f.k === 'email' && !emailOk) || (f.k === 'name' && !contact.name.trim())) ? 'border-[#FCA5A5]' : 'border-line')} />
                                        </div>
                                    ))}

                                    {status === 'error' && (
                                        <p className="text-[13px] text-[#DC2626]">Couldn&apos;t send your request. Please try again or email Info@atlantisfmcg.com.</p>
                                    )}

                                    <button type="submit" disabled={status === 'sending'}
                                        className="w-full h-12 rounded-xl bg-[#2EC4B6] hover:bg-[#25AFA2] disabled:opacity-60 text-heading text-[14px] font-bold flex items-center justify-center gap-2 transition-colors">
                                        {status === 'sending' ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}
                                        Send to Ali FMCG
                                    </button>
                                    <p className="flex items-start gap-2 text-[12px] text-ink-3 leading-relaxed">
                                        <ShieldCheck size={14} className="text-[#2EC4B6] shrink-0 mt-0.5" />
                                        Nothing is committed until you approve the quote.
                                    </p>
                                </div>
                            </div>
                        </aside>
                    </form>
                </div>
            )}

            {/* ── Requests grid ─────────────────────────────────────── */}
            <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-12">
                <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
                    <div>
                        <h2 className="font-sans text-[20px] font-bold text-ink">Your requests</h2>
                        <p className="text-[13px] text-ink-3">Requests you&apos;ve sent from this browser. Quotes arrive by email{user ? ' and in your support inbox' : ''}.</p>
                    </div>
                    {!dept && (
                        <div className="flex flex-wrap gap-1.5">
                            {DEPARTMENTS.slice(0, 6).map((d) => (
                                <Link key={d.slug} href={`/requests?dept=${d.slug}`} className="h-8 px-3 inline-flex items-center rounded-full border border-line bg-surface text-[12px] font-medium text-ink-2 hover:border-ink hover:text-ink transition-colors">
                                    {d.label}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {recent.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recent.map((r) => <RequestCard key={r.ref} r={r} />)}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-3xl border border-dashed border-line-strong bg-surface">
                        <span className="w-12 h-12 rounded-2xl bg-teal-soft flex items-center justify-center"><Inbox size={22} className="text-teal" /></span>
                        <p className="mt-4 text-[15px] font-semibold text-ink">No requests yet</p>
                        <p className="mt-1 text-[13px] text-ink-3 max-w-sm">Add products above to build your first list. Every request you send shows up here.</p>
                    </div>
                )}
            </section>
        </div>
    );
}

export default function RequestsClient() {
    return (
        <React.Suspense fallback={<div className="min-h-screen bg-background" />}>
            <RequestsContent />
        </React.Suspense>
    );
}
