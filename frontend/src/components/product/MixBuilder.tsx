'use client';

import * as React from 'react';
import Link from 'next/link';
import { X, Search, Check, Minus, Plus, Package, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fetchProductPage } from '@/lib/api';
import type { Product } from '@/lib/types';
import { DEPARTMENTS } from '@/lib/departments';
import { cn } from '@/lib/utils';
import { createLoad, variantSignatures, loadLabel, ApiError, type LoadKind, type MixedLoad } from '@/lib/wholesale';

/** One explicitly selected sellable line (product, or product + flavour/variant). */
interface Picked { key: string; productId: string; variant: string | null; name: string; label: string | null; image?: string; quantity: number }

const keyOf = (productId: string, variant: string | null) => `${productId}::${variant ?? ''}`;
const unitOf = (k: LoadKind) => (k === 'PALLET' ? 'cases' : 'pallets');

/** Which mix types a product's own pack data supports (no new capacity rules). */
function eligible(p: Product, kind: LoadKind): string | null {
    const miss = [
        !p.unitsPerCase && 'units per case',
        !p.casesPerPallet && 'cases per pallet',
        kind === 'TRUCK' && !p.palletsPerShipment && 'pallets per truckload',
    ].filter(Boolean);
    return miss.length ? `Missing ${miss.join(', ')}` : null;
}

export default function MixBuilder({ open, onClose, initialKind, kinds }: {
    open: boolean;
    onClose: () => void;
    initialKind: LoadKind;
    /** Mix types to offer (both by default). */
    kinds?: LoadKind[];
}) {
    const available = kinds?.length ? kinds : (['PALLET', 'TRUCK'] as LoadKind[]);
    const [kind, setKind] = React.useState<LoadKind>(initialKind);
    const [pendingKind, setPendingKind] = React.useState<LoadKind | null>(null);
    const [q, setQ] = React.useState('');
    const [qDebounced, setQDebounced] = React.useState('');
    const [brand, setBrand] = React.useState('');
    const [dept, setDept] = React.useState('');
    const [items, setItems] = React.useState<Product[]>([]);
    const [brands, setBrands] = React.useState<string[]>([]);
    const [total, setTotal] = React.useState(0);
    const [page, setPage] = React.useState(1);
    const [loading, setLoading] = React.useState(false);
    const [listError, setListError] = React.useState('');
    const [picked, setPicked] = React.useState<Map<string, Picked>>(new Map());
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState('');
    const [created, setCreated] = React.useState<MixedLoad | null>(null);

    // Each opening starts a fresh, empty mix of the chosen type (no stale selections).
    React.useEffect(() => {
        if (!open) return;
        setKind(initialKind); setPicked(new Map()); setCreated(null); setError(''); setPendingKind(null);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
    }, [open, initialKind]); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);

    // Real catalog, server-filtered. Filters never touch the selection.
    React.useEffect(() => {
        if (!open) return;
        const ctrl = new AbortController();
        const d = DEPARTMENTS.find((x) => x.slug === dept);
        setLoading(true); setListError('');
        fetchProductPage({
            q: qDebounced || undefined, brand: brand || undefined,
            categoryAny: d ? d.include.join(',') : undefined, categoryNone: d?.exclude?.length ? d.exclude.join(',') : undefined,
            sort: qDebounced ? 'relevance' : 'name_asc', page, limit: 24,
        }, ctrl.signal)
            .then((r) => {
                setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items]));
                setTotal(r.total);
                if (r.brands && !brand) setBrands(r.brands.map((b) => b.value));
            })
            .catch((e) => { if (e?.name !== 'AbortError') setListError(e?.status === 401 ? 'Sign in to browse the catalog.' : 'Could not load products.'); })
            .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
        return () => ctrl.abort();
    }, [open, qDebounced, brand, dept, page]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { setPage(1); }, [qDebounced, brand, dept]);

    const toggle = (p: Product, variant: string | null, label: string | null) => {
        setError('');
        setPicked((prev) => {
            const next = new Map(prev);
            const k = keyOf(p.id, variant);
            if (next.has(k)) next.delete(k);
            else next.set(k, { key: k, productId: p.id, variant, name: p.name, label, image: p.images?.[0] || p.image, quantity: 1 });
            return next;
        });
    };
    const setQty = (k: string, n: number) => setPicked((prev) => {
        const next = new Map(prev);
        const it = next.get(k);
        if (it) next.set(k, { ...it, quantity: Math.max(1, Math.min(10000, Math.floor(n) || 1)) });
        return next;
    });
    const remove = (k: string) => setPicked((prev) => { const next = new Map(prev); next.delete(k); return next; });

    const switchKind = (k: LoadKind) => {
        if (k === kind) return;
        if (picked.size) { setPendingKind(k); return; }
        setKind(k);
    };

    const submit = async () => {
        if (submitting) return;
        if (picked.size === 0) { setError('Select at least one product to create a mix.'); return; }
        setSubmitting(true); setError('');
        try {
            const res = await createLoad(kind, Array.from(picked.values()).map((p) => ({ productId: p.productId, variant: p.variant, quantity: p.quantity })));
            setCreated(res);               // confirmation reflects the SERVER's saved load
            setPicked(new Map());          // cleared only after success
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not create the mix. Your selection is kept — try again.');
        } finally { setSubmitting(false); }
    };

    if (!open) return null;
    const selected = Array.from(picked.values());

    return (
        <div className="fixed inset-0 z-[150]" role="dialog" aria-modal="true" aria-label={`Build a ${loadLabel(kind).toLowerCase()}`}>
            <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#0B1F3A]/40" />
            <div className="absolute inset-y-0 end-0 w-full sm:w-[600px] bg-surface shadow-2xl flex flex-col text-start">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-line shrink-0">
                    <h2 className="text-[16px] font-semibold text-heading">Build a mix</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-3"><X size={18} /></button>
                </div>

                {created ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                        <CheckCircle2 size={40} className="text-[#10B981]" />
                        <h3 className="mt-4 text-[18px] font-semibold text-heading">{loadLabel(created.kind)} created</h3>
                        <p className="mt-1.5 text-[14px] text-ink-3">{created.quote?.lines.length ?? 0} {created.quote?.lines.length === 1 ? 'product' : 'products'} saved{created.quote ? ` · ${Math.round(created.quote.fill * 100)}% of capacity` : ''}.</p>
                        <ul className="mt-4 w-full max-w-sm text-start text-[13.5px] text-ink-2 space-y-1">
                            {created.quote?.lines.map((l) => <li key={l.productId + (l.variant || '')} className="flex justify-between gap-3"><span className="truncate">{l.name}{l.variant ? ` — ${l.variant.split('|').map((x) => x.split('=')[1]).join(' · ')}` : ''}</span><span className="tabular-nums text-ink-3">{l.quantity} {l.unit}{l.quantity === 1 ? '' : 's'}</span></li>)}
                        </ul>
                        <div className="mt-6 flex gap-2">
                            <button type="button" onClick={() => setCreated(null)} className="h-10 px-4 rounded-xl ring-1 ring-line-strong text-[14px] font-medium text-ink">Build another</button>
                            <Link href="/cart" className="h-10 px-5 inline-flex items-center rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold">View in cart</Link>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Type + search + filters */}
                        <div className="px-5 pt-4 pb-3 border-b border-line space-y-3 shrink-0">
                            {available.length > 1 && (
                                <div role="radiogroup" aria-label="Mix type" className="inline-flex p-1 rounded-lg bg-surface-3">
                                    {available.map((k) => (
                                        <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => switchKind(k)}
                                            className={cn('h-8 px-3.5 rounded-md text-[13px] font-medium', kind === k ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink')}>
                                            {loadLabel(k)}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {pendingKind && (
                                <div className="rounded-lg ring-1 ring-[#FCD34D] bg-[#FFFBEB] dark:bg-amber-500/10 px-3 py-2.5 text-[13px] text-[#92400E] dark:text-amber-200">
                                    Switching to {loadLabel(pendingKind).toLowerCase()} clears your {picked.size} selected {picked.size === 1 ? 'item' : 'items'} (quantities are in {unitOf(pendingKind)} instead of {unitOf(kind)}).
                                    <div className="mt-2 flex gap-2">
                                        <button type="button" onClick={() => { setPicked(new Map()); setKind(pendingKind); setPendingKind(null); }} className="h-8 px-3 rounded-md bg-[#F59E0B] text-white text-[12.5px] font-semibold">Clear and switch</button>
                                        <button type="button" onClick={() => setPendingKind(null)} className="h-8 px-3 rounded-md ring-1 ring-[#FCD34D] text-[12.5px] font-semibold">Keep {loadLabel(kind).toLowerCase()}</button>
                                    </div>
                                </div>
                            )}
                            <label className="flex items-center h-10 rounded-lg ring-1 ring-line bg-surface focus-within:ring-2 focus-within:ring-[#2EC4B6]">
                                <Search size={15} className="ms-3 text-ink-4" />
                                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, flavour or EAN" aria-label="Search products"
                                    className="flex-1 min-w-0 h-full px-2.5 bg-transparent outline-none text-[13.5px] text-ink placeholder:text-ink-4" />
                                {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="me-2 text-ink-4 hover:text-ink"><X size={14} /></button>}
                            </label>
                            <div className="flex gap-2">
                                <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand" className="flex-1 min-w-0 h-9 px-2.5 rounded-lg ring-1 ring-line bg-surface text-[13px] text-ink outline-none">
                                    <option value="">All brands</option>
                                    {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                                </select>
                                <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" className="flex-1 min-w-0 h-9 px-2.5 rounded-lg ring-1 ring-line bg-surface text-[13px] text-ink outline-none">
                                    <option value="">All departments</option>
                                    {DEPARTMENTS.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
                                </select>
                            </div>
                            <p className="text-[12px] text-ink-4">{loading && page === 1 ? 'Loading…' : `${total.toLocaleString()} products`} · quantities in {unitOf(kind)}</p>
                        </div>

                        {/* Catalog list */}
                        <div className="flex-1 overflow-y-auto">
                            {listError && <p className="px-5 py-6 text-[13.5px] text-[#DC2626]">{listError}</p>}
                            {!listError && !loading && items.length === 0 && <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">No products match. Try another search or filter.</p>}
                            <ul className="divide-y divide-line">
                                {items.map((p) => {
                                    const reason = eligible(p, kind);
                                    const variants = variantSignatures(p.variants);
                                    const rows = variants.length ? variants.map((v) => ({ variant: v.sig, label: v.label })) : [{ variant: null as string | null, label: null as string | null }];
                                    return (
                                        <li key={p.id} className={cn('px-5 py-3', reason && 'opacity-60')}>
                                            <div className="flex items-start gap-3">
                                                <span className="relative w-12 h-12 shrink-0 rounded-lg bg-media ring-1 ring-line overflow-hidden">
                                                    {(p.images?.[0] || p.image)
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        ? <img src={p.images?.[0] || p.image} alt="" className="absolute inset-0 m-auto max-w-[80%] max-h-[80%] object-contain mix-blend-multiply" />
                                                        : <span className="absolute inset-0 flex items-center justify-center text-ink-4"><Package size={16} /></span>}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[13.5px] font-medium text-ink line-clamp-2">{p.name}</p>
                                                    <p className="text-[12px] text-ink-3 tabular-nums">{[p.brand, p.ean].filter(Boolean).join(' · ')}{reason ? ` · ${reason}` : ''}</p>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {rows.map((r) => {
                                                            const k = keyOf(p.id, r.variant);
                                                            const on = picked.has(k);
                                                            return (
                                                                <button key={k} type="button" disabled={!!reason} aria-pressed={on} onClick={() => toggle(p, r.variant, r.label)}
                                                                    className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] ring-1 transition-shadow disabled:cursor-not-allowed',
                                                                        on ? 'ring-2 ring-[#2EC4B6] bg-teal-soft text-ink font-semibold' : 'ring-line text-ink-2 hover:ring-line-strong')}>
                                                                    {on ? <Check size={13} className="text-teal" /> : <Plus size={13} />}
                                                                    {r.label ?? (on ? 'Selected' : 'Select')}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                            {items.length < total && !listError && (
                                <div className="p-4 text-center">
                                    <button type="button" disabled={loading} onClick={() => setPage((n) => n + 1)} className="h-9 px-4 rounded-lg ring-1 ring-line-strong text-[13px] font-medium text-ink disabled:opacity-50">
                                        {loading ? 'Loading…' : `Show more (${(total - items.length).toLocaleString()} left)`}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Selection summary + confirm */}
                        <div className="border-t border-line bg-surface-2 px-5 py-3 shrink-0">
                            <div className="flex items-center justify-between">
                                <p className="text-[13.5px] font-semibold text-ink">{selected.length} selected</p>
                                {selected.length > 0 && <button type="button" onClick={() => setPicked(new Map())} className="text-[12.5px] font-medium text-ink-3 hover:text-[#DC2626]">Clear all</button>}
                            </div>
                            {selected.length > 0 ? (
                                <ul className="mt-2 max-h-[176px] overflow-y-auto space-y-1.5 pe-1">
                                    {selected.map((s) => (
                                        <li key={s.key} className="flex items-center gap-2 rounded-lg bg-surface ring-1 ring-line px-2.5 py-1.5">
                                            <span className="min-w-0 flex-1 text-[13px] text-ink truncate">{s.name}{s.label ? <span className="text-ink-3"> — {s.label}</span> : null}</span>
                                            <div className="flex items-center gap-1">
                                                <button type="button" aria-label="Decrease" onClick={() => setQty(s.key, s.quantity - 1)} disabled={s.quantity <= 1} className="w-7 h-7 rounded-md ring-1 ring-line flex items-center justify-center text-ink-2 disabled:opacity-35"><Minus size={12} /></button>
                                                <input value={s.quantity} inputMode="numeric" aria-label={`Quantity in ${unitOf(kind)}`} onChange={(e) => setQty(s.key, parseInt(e.target.value.replace(/\D/g, ''), 10))}
                                                    className="w-12 h-7 rounded-md ring-1 ring-line bg-surface text-center text-[13px] font-semibold tabular-nums text-ink outline-none" />
                                                <button type="button" aria-label="Increase" onClick={() => setQty(s.key, s.quantity + 1)} className="w-7 h-7 rounded-md ring-1 ring-line flex items-center justify-center text-ink-2"><Plus size={12} /></button>
                                                <span className="w-12 text-[11.5px] text-ink-4">{unitOf(kind)}</span>
                                            </div>
                                            <button type="button" onClick={() => remove(s.key)} aria-label={`Remove ${s.name}`} className="w-7 h-7 rounded-md flex items-center justify-center text-ink-4 hover:text-[#DC2626]"><X size={14} /></button>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="mt-1 text-[12.5px] text-ink-3">Select products or flavours above — only what you select goes into the mix.</p>}
                            {error && <p role="alert" className="mt-2 inline-flex items-start gap-1.5 text-[12.5px] text-[#DC2626]"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{error}</p>}
                            <button type="button" onClick={submit} disabled={submitting}
                                className="mt-3 w-full h-11 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                                {submitting ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : `Add mix${selected.length ? ` (${selected.length})` : ''}`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
