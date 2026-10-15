'use client';

import * as React from 'react';
import { Layers, Truck, Plus, Minus, Search, Package, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Dialog, Button, Notice } from '@/components/supplier/ui';
import { formatPrice } from '@/lib/currency';
import { cn, prettifyVariantSignature } from '@/lib/utils';
import { addToLoad, loadCandidates, loadLabel, ApiError, type LoadCandidate, type MixedLoad, type QuoteLine } from '@/lib/wholesale';

const WORD: Record<string, [string, string]> = { carton: ['case', 'cases'], case: ['case', 'cases'], pallet: ['pallet', 'pallets'], truck: ['truckload', 'truckloads'], piece: ['piece', 'pieces'] };
export const qtyText = (n: number, unit: string) => `${n.toLocaleString('en-GB')} ${(WORD[unit.toLowerCase()] ?? [unit, unit])[n === 1 ? 0 : 1]}`;

/** Red while below the minimum, green once it's met. Numbers are whatever the server reported. */
export function ProgressMeter({ have, required, unit, ok, note }: { have: number; required: number; unit: string; ok: boolean; note?: React.ReactNode }) {
    const pct = required > 0 ? Math.min(100, (have / required) * 100) : 100;
    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                <span className="text-ink-2">Minimum order <b className="text-ink">{qtyText(required, unit)}</b></span>
                <span className={cn('font-semibold tabular-nums', ok ? 'text-[#047857]' : 'text-[#B91C1C]')}>
                    {ok ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} /> Minimum reached</span> : <>{have.toLocaleString('en-GB')} of {required.toLocaleString('en-GB')} · {qtyText(Math.max(0, required - have), unit)} to go</>}
                </span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-[#FEE2E2] dark:bg-red-500/15 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={required} aria-valuenow={Math.min(have, required)} aria-label={`Minimum order progress: ${have} of ${required} ${unit}s`}>
                <div className={cn('h-full rounded-full transition-all duration-300', ok ? 'bg-[#10B981]' : 'bg-[#DC2626]')} style={{ width: `${Math.max(3, pct)}%` }} />
            </div>
            {note && <p className="mt-1.5 text-[12.5px] text-ink-3">{note}</p>}
        </div>
    );
}

/**
 * Shown under a single-product line that is below the product's minimum:
 * the progress, then the two ways to complete the order.
 */
export function BelowMinimumPanel({ line, tier, onSetMinimum, onStartMix, busy }: {
    line: QuoteLine; tier: string; onSetMinimum: (n: number) => void; onStartMix?: () => void; busy?: boolean;
}) {
    const e = line.error!;
    const min = e.minUnits ?? 1, have = e.quantity ?? line.quantity, remaining = e.remaining ?? Math.max(0, min - have);
    const unit = tier === 'carton' ? 'case' : tier;
    const moqNote = e.moq && e.moqUnit && e.moqUnit.toLowerCase() !== unit && !(e.moqUnit === 'CASE' && unit === 'case')
        ? `The supplier’s minimum is ${qtyText(e.moq, e.moqUnit)}, which is ${qtyText(min, unit)} at this pack size.` : undefined;
    const mix = e.mixable;
    return (
        <div className="mt-3 rounded-xl ring-1 ring-[#FECACA] bg-[#FEF2F2]/60 dark:bg-red-500/5 p-4 space-y-3">
            <ProgressMeter have={have} required={min} unit={unit} ok={false} note={moqNote} />
            <p className="text-[13.5px] font-medium text-ink">Minimum order: {qtyText(min, unit)}. Add {remaining.toLocaleString('en-GB')} more {(WORD[unit] ?? [unit, `${unit}s`])[remaining === 1 ? 0 : 1]}{mix ? ' or build a mixed load with eligible products' : ''} to continue.</p>
            <div className={cn('grid gap-2.5', mix && 'sm:grid-cols-2')}>
                <div className="rounded-lg bg-surface ring-1 ring-line p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Option 1 · More of this product</p>
                    <p className="mt-1 text-[13px] text-ink-2 tabular-nums">
                        {qtyText(min, unit)}{typeof e.unitPrice === 'number' && e.unitPrice > 0 ? <> × {formatPrice(e.unitPrice)} = <b className="text-ink">{formatPrice(e.minLineTotal ?? e.unitPrice * min)}</b></> : null}
                    </p>
                    <Button size="sm" variant="primary" className="mt-2.5" disabled={busy} onClick={() => onSetMinimum(min)}>Set to {qtyText(min, unit)}</Button>
                </div>
                {mix && onStartMix && (
                    <div className="rounded-lg bg-surface ring-1 ring-line p-3">
                        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Option 2 · Build a {mix.kind === 'TRUCK' ? 'mixed truckload' : 'mixed pallet'}</p>
                        <p className="mt-1 text-[13px] text-ink-2">
                            Keep {qtyText(mix.quantity, mix.kind === 'TRUCK' ? 'pallet' : 'case')} of this product and add other products from the same supplier.
                            Together they need {qtyText(mix.minUnits, mix.kind === 'TRUCK' ? 'pallet' : 'case')}; {mix.kind === 'TRUCK' ? 'a truck' : 'a pallet'} holds up to {qtyText(mix.capacity, mix.kind === 'TRUCK' ? 'pallet' : 'case')}.
                        </p>
                        <Button size="sm" variant="secondary" className="mt-2.5" icon={mix.kind === 'TRUCK' ? <Truck size={14} /> : <Layers size={14} />} disabled={busy} onClick={onStartMix}>
                            Start a {mix.kind === 'TRUCK' ? 'mixed truckload' : 'mixed pallet'}
                        </Button>
                    </div>
                )}
            </div>
            {!mix && (
                <p className="text-[12.5px] text-ink-3">
                    {tier === 'truck' ? 'Truckloads can’t be mixed, so only more of this product meets the minimum.' : 'This product can’t go in a mixed load (its pack data is incomplete, or its minimum is bigger than one load), so only more of it meets the minimum.'}
                </p>
            )}
        </div>
    );
}

/** Minimum-order (or capacity) summary of a mixed load, from the server quote. */
export function loadProgress(load: MixedLoad) {
    const q = load.quote;
    if (!q) return null;
    const g = q.minimums?.find((m) => m.remaining > 0 || !m.satisfiable) ?? q.minimums?.[0];
    if (g) return { have: g.have, required: g.required, unit: g.unit, ok: q.ready && g.remaining === 0 && g.satisfiable, satisfiable: g.satisfiable };
    return null;
}

/**
 * "Add eligible products" for a mixed load: the server returns only products
 * that can genuinely count (same supplier, same verified dispatch site, pack
 * data present, in stock, room left). Selecting one opens a compact panel to
 * choose the quantity before anything is added.
 */
export function MixedLoadPicker({ open, onClose, load, onAdded }: { open: boolean; onClose: () => void; load: MixedLoad; onAdded: () => void }) {
    const [q, setQ] = React.useState('');
    const [data, setData] = React.useState<{ items: LoadCandidate[]; reason: string | null } | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [pick, setPick] = React.useState<LoadCandidate | null>(null);
    const [qty, setQty] = React.useState(1);
    const [variant, setVariant] = React.useState<string>('');
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        setLoading(true); setError(null);
        const t = setTimeout(() => {
            loadCandidates(load.id, q.trim() || undefined)
                .then(setData)
                .catch((e) => setError(e instanceof ApiError ? e.message : 'Couldn’t load products.'))
                .finally(() => setLoading(false));
        }, q ? 300 : 0);
        return () => clearTimeout(t);
    }, [open, q, load.id, load.version]);
    React.useEffect(() => { if (!open) { setPick(null); setQ(''); } }, [open]);

    const choose = (c: LoadCandidate) => { setPick(c); setQty(Math.min(c.maxQuantity, Math.max(1, c.minUnits > 1 ? 1 : 1))); setVariant(c.variants[0] ?? ''); setError(null); };
    const quote = load.quote;
    const prog = loadProgress(load);
    const unit = load.kind === 'PALLET' ? 'case' : 'pallet';
    const confirm = async () => {
        if (!pick) return;
        setSaving(true); setError(null);
        try { await addToLoad(load.kind, pick.id, qty, variant || null, load.id); onAdded(); setPick(null); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Couldn’t add that product.'); }
        finally { setSaving(false); }
    };

    // Preview of the result (the server re-prices and re-checks on confirm).
    const after = pick && prog ? { have: prog.have + qty, required: Math.max(prog.required, pick.minUnits) } : null;
    const fillAfter = pick && quote ? quote.fill + qty * pick.shareOfLoadPerUnit : null;

    return (
        <Dialog open={open} onClose={onClose} size="xl" title={`Add products to your ${loadLabel(load.kind).toLowerCase()}`}
            description="Only products that can ship together with this load are listed: same supplier, same dispatch location, in stock."
            footer={pick
                ? <><Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => setPick(null)}>Back to products</Button><span className="flex-1" /><Button variant="primary" loading={saving} disabled={qty < 1 || qty > pick.maxQuantity} onClick={confirm}>Add {qtyText(qty, unit)} · {formatPrice(pick.unitPrice * qty)}</Button></>
                : <Button variant="secondary" onClick={onClose}>Done</Button>}>
            <div className="space-y-4">
                {prog ? <ProgressMeter have={after?.have ?? prog.have} required={after?.required ?? prog.required} unit={prog.unit} ok={!!after ? after.have >= after.required : prog.ok}
                    note={quote ? `Capacity used: ${Math.round((fillAfter ?? quote.fill) * 100)}% of the ${load.kind === 'PALLET' ? 'pallet' : 'truck'}${pick ? ' after this addition' : ''}.` : undefined} />
                    : quote && <p className="text-[13px] text-ink-3">Capacity used: {Math.round((fillAfter ?? quote.fill) * 100)}% of the {load.kind === 'PALLET' ? 'pallet' : 'truck'}{pick ? ' after this addition' : ''}.</p>}
                {error && <Notice tone="danger">{error}</Notice>}

                {pick ? (
                    <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                        <div className="aspect-square rounded-xl bg-white ring-1 ring-line flex items-center justify-center overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {pick.image ? <img src={pick.image} alt={pick.name} className="max-w-[85%] max-h-[85%] object-contain" /> : <Package size={28} className="text-ink-4" />}
                        </div>
                        <div className="space-y-3 text-[13.5px]">
                            <div>
                                <p className="text-[15px] font-semibold text-heading">{pick.name}</p>
                                <p className="text-ink-3">{[pick.brand, pick.origin && `Origin: ${pick.origin}`, pick.ean].filter(Boolean).join(' · ')}</p>
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-2 ring-1 ring-line px-3 py-2.5">
                                <dt className="text-ink-3">Price per case</dt><dd className="text-end tabular-nums">{formatPrice(pick.casePrice)}</dd>
                                <dt className="text-ink-3">Pack</dt><dd className="text-end">{pick.unitsPerCase} pcs/case · {pick.casesPerPallet} cases/pallet</dd>
                                <dt className="text-ink-3">Price per {unit}</dt><dd className="text-end tabular-nums">{formatPrice(pick.unitPrice)}</dd>
                                <dt className="text-ink-3">You can add</dt><dd className="text-end">up to {qtyText(pick.maxQuantity, unit)}</dd>
                            </dl>
                            {pick.variants.length > 0 && (
                                <label className="block">
                                    <span className="text-[12.5px] text-ink-3">Variant</span>
                                    <select value={variant} onChange={(e) => setVariant(e.target.value)} className="mt-1 w-full h-10 rounded-lg ring-1 ring-line-strong bg-surface px-3 text-[13.5px]">
                                        {pick.variants.map((v) => <option key={v} value={v}>{prettifyVariantSignature(v) || v}</option>)}
                                    </select>
                                </label>
                            )}
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-ink-3">Quantity</span>
                                <div className="flex items-center gap-2">
                                    <button type="button" aria-label="Decrease" onClick={() => setQty((n) => Math.max(1, n - 1))} disabled={qty <= 1} className="w-9 h-9 rounded-lg ring-1 ring-line flex items-center justify-center disabled:opacity-35"><Minus size={14} /></button>
                                    <input aria-label={`Quantity in ${unit}s`} inputMode="numeric" value={qty} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setQty(Number.isFinite(n) ? Math.min(pick.maxQuantity, Math.max(1, n)) : 1); }} className="w-16 h-9 rounded-lg ring-1 ring-line text-center tabular-nums bg-surface" />
                                    <button type="button" aria-label="Increase" onClick={() => setQty((n) => Math.min(pick.maxQuantity, n + 1))} disabled={qty >= pick.maxQuantity} className="w-9 h-9 rounded-lg ring-1 ring-line flex items-center justify-center disabled:opacity-35"><Plus size={14} /></button>
                                </div>
                                <span className="text-ink-3">{unit}s = {(qty * pick.casesPerUnit).toLocaleString('en-GB')} cases</span>
                            </div>
                            <p className="text-[14px]">Cost: <b className="tabular-nums">{formatPrice(pick.unitPrice * qty)}</b> <span className="text-ink-3">(mixed-load price, excl. delivery and VAT)</span></p>
                            {pick.minUnits > (prog?.required ?? 1) && <p className="text-[12.5px] text-[#B45309] flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />This product’s own minimum is {qtyText(pick.minUnits, unit)}, so the load’s minimum rises to that.</p>}
                        </div>
                    </div>
                ) : (
                    <>
                        <label className="relative block">
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, brand or barcode" aria-label="Search eligible products" className="w-full h-10 rounded-lg ring-1 ring-line-strong bg-surface ps-9 pe-3 text-[13.5px]" />
                        </label>
                        {loading && !data ? (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-[210px] rounded-xl bg-surface-2 animate-pulse" />)}</div>
                        ) : data && data.items.length === 0 ? (
                            <p className="rounded-xl ring-1 ring-line px-4 py-6 text-center text-[13.5px] text-ink-3">{data.reason || 'No eligible products right now.'}</p>
                        ) : (
                            <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', loading && 'opacity-60')}>
                                {data?.items.map((c) => (
                                    <button key={c.id} type="button" onClick={() => choose(c)} className="text-start rounded-xl ring-1 ring-line hover:ring-teal bg-surface overflow-hidden flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                                        <span className="h-[120px] bg-white flex items-center justify-center border-b border-line">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            {c.image ? <img src={c.image} alt="" className="max-w-[80%] max-h-[100px] object-contain" /> : <Package size={24} className="text-ink-4" />}
                                        </span>
                                        <span className="p-3 flex-1 flex flex-col gap-0.5 text-[12.5px]">
                                            <span className="text-[13.5px] font-medium text-ink line-clamp-2">{c.name}</span>
                                            <span className="text-ink-3">{[c.brand, c.origin].filter(Boolean).join(' · ') || '—'}</span>
                                            <span className="mt-auto pt-1 text-ink-2 tabular-nums">{formatPrice(c.casePrice)} / case · {formatPrice(c.unitPrice)} / {c.unit}</span>
                                            <span className="text-ink-4">up to {qtyText(c.maxQuantity, c.unit)}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Dialog>
    );
}
