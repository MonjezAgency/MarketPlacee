'use client';

import * as React from 'react';
import { Layers, Truck, Plus, Minus, Search, Package, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Dialog, Button, Notice } from '@/components/supplier/ui';
import { formatPrice } from '@/lib/currency';
import { cn, prettifyVariantSignature } from '@/lib/utils';
import { addToLoad, loadCandidates, loadLabel, ApiError, type LoadCandidate, type MixedLoad, type QuoteLine } from '@/lib/wholesale';

const WORD: Record<string, [string, string]> = { carton: ['case', 'cases'], case: ['case', 'cases'], pallet: ['pallet', 'pallets'], truck: ['truckload', 'truckloads'], piece: ['piece', 'pieces'] };
export const qtyText = (n: number, unit: string) => `${n.toLocaleString('en-GB')} ${(WORD[unit.toLowerCase()] ?? [unit, unit])[n === 1 ? 0 : 1]}`;

const fmtQty = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
const unitWord = (unit: string, n: number) => (WORD[unit.toLowerCase()] ?? [unit, `${unit}s`])[n === 1 ? 0 : 1];

/**
 * Minimum-order progress: "1 of 5 pallets · 4 to go", bar at 20%. Red while
 * below the minimum, green once it's met. All numbers come from the server.
 */
export function ProgressMeter({ have, required, unit, ok, note, remaining, percent }: { have: number; required: number; unit: string; ok: boolean; note?: React.ReactNode; remaining?: number; percent?: number }) {
    const pct = typeof percent === 'number' ? percent : required > 0 ? Math.min(100, (have / required) * 100) : 100;
    const left = typeof remaining === 'number' ? remaining : Math.max(0, required - have);
    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
                <span className="text-ink-2">Minimum order <b className="text-ink">{qtyText(required, unit)}</b></span>
                <span className={cn('font-semibold tabular-nums', ok ? 'text-[#047857]' : 'text-[#B91C1C]')}>
                    {fmtQty(have)} of {qtyText(required, unit)}{ok ? <span className="ms-1.5 inline-flex items-center gap-1"><CheckCircle2 size={14} /> Minimum reached</span> : <> · {fmtQty(left)} {unitWord(unit, left)} to go</>}
                </span>
            </div>
            <div className={cn('mt-1.5 h-2.5 rounded-full overflow-hidden', ok ? 'bg-[#D1FAE5] dark:bg-emerald-500/15' : 'bg-[#FEE2E2] dark:bg-red-500/15')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`Minimum order progress: ${fmtQty(have)} of ${required} ${unitWord(unit, required)}`}>
                <div className={cn('h-full rounded-full transition-all duration-300', ok ? 'bg-[#10B981]' : 'bg-[#DC2626]')} style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-ink-4 tabular-nums">{Math.round(pct)}% of the minimum</p>
            {note && <p className="mt-1 text-[12.5px] text-ink-3">{note}</p>}
        </div>
    );
}

/** Green (or red) progress under a line that has an MOQ — shown even once it's met. */
export function LineMinimumBar({ minimum }: { minimum: NonNullable<QuoteLine['minimum']> }) {
    return (
        <div className={cn('mt-3 rounded-xl p-3 ring-1', minimum.met ? 'ring-[#A7F3D0] bg-[#ECFDF5]/60 dark:bg-emerald-500/5' : 'ring-[#FECACA] bg-[#FEF2F2]/60')}>
            <ProgressMeter have={minimum.have} required={minimum.required} unit={minimum.unit} ok={minimum.met} remaining={minimum.remaining} percent={minimum.percent} />
        </div>
    );
}

/** A line asking for more than the supplier has: what's available, and the largest quantity that fits. */
export function StockShortPanel({ line, tier, onSetQuantity, busy }: { line: QuoteLine; tier: string; onSetQuantity: (n: number) => void; busy?: boolean }) {
    const e = line.error!;
    const unit = tier === 'carton' ? 'case' : tier;
    const max = e.maxUnits ?? 0;
    return (
        <div className="mt-3 rounded-xl ring-1 ring-[#FDE68A] bg-[#FFFBEB]/70 dark:bg-amber-500/5 p-4 space-y-2.5">
            <p className="text-[13.5px] font-medium text-ink">
                {(e.availableCases ?? 0) > 0 ? <>Only {qtyText(e.availableCases!, 'case')} in stock{max >= 1 ? <> — up to {qtyText(max, unit)}</> : null}.</> : 'This product is out of stock.'}
            </p>
            {e.minimum && <ProgressMeter have={e.minimum.have} required={e.minimum.required} unit={e.minimum.unit} ok={e.minimum.met} remaining={e.minimum.remaining} percent={e.minimum.percent} />}
            {max >= 1 ? (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => onSetQuantity(max)}>Set to {qtyText(max, unit)}</Button>
            ) : (e.availableCases ?? 0) > 0 ? (
                <p className="text-[12.5px] text-ink-3">That’s less than one {unitWord(unit, 1)}. Choose a smaller pack (pallet or case) on the product page.</p>
            ) : null}
        </div>
    );
}

/**
 * Shown under a single-product line that is below the product's minimum:
 * progress in the MOQ's own unit, then the two ways to complete the order.
 */
export function BelowMinimumPanel({ line, tier, onSetMinimum, onStartMix, busy }: {
    line: QuoteLine; tier: string; onSetMinimum: (n: number) => void; onStartMix?: () => void; busy?: boolean;
}) {
    const e = line.error!;
    const min = e.minUnits ?? 1;
    const unit = tier === 'carton' ? 'case' : tier;
    const m = e.minimum;
    const mix = e.mixable;
    const mixUnit = mix?.kind === 'TRUCK' ? 'pallet' : 'case';
    return (
        <div className="mt-3 rounded-xl ring-1 ring-[#FECACA] bg-[#FEF2F2]/60 dark:bg-red-500/5 p-4 space-y-3">
            {m ? <ProgressMeter have={m.have} required={m.required} unit={m.unit} ok={false} remaining={m.remaining} percent={m.percent} />
                : <ProgressMeter have={e.quantity ?? line.quantity} required={min} unit={unit} ok={false} />}
            <p className="text-[13.5px] font-medium text-ink">
                {m ? <>Minimum order: {qtyText(m.required, m.unit)}. Add {fmtQty(m.remaining)} more {unitWord(m.unit, m.remaining)} to continue.</>
                    : <>Minimum order: {qtyText(min, unit)}. Add {fmtQty(e.remaining ?? 0)} more {unitWord(unit, e.remaining ?? 0)} to continue.</>}
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-lg bg-surface ring-1 ring-line p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Option 1 · More of this product</p>
                    <p className="mt-1 text-[13px] text-ink-2 tabular-nums">
                        {qtyText(min, unit)}{typeof e.unitPrice === 'number' && e.unitPrice > 0 ? <> × {formatPrice(e.unitPrice)} = <b className="text-ink">{formatPrice(e.minLineTotal ?? e.unitPrice * min)}</b></> : null}
                    </p>
                    <Button size="sm" variant="primary" className="mt-2.5" disabled={busy} onClick={() => onSetMinimum(min)}>Set to {qtyText(min, unit)}</Button>
                </div>
                <div className={cn('rounded-lg ring-1 ring-line p-3', mix ? 'bg-surface' : 'bg-surface-2')}>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Option 2 · Add Mix</p>
                    {mix && onStartMix ? (
                        <>
                            <p className="mt-1 text-[13px] text-ink-2">
                                Combine other variants of this same product (same SKU) in one {mix.kind === 'TRUCK' ? 'truck' : 'pallet'}. Together they count toward the minimum of {qtyText(mix.minUnits, mixUnit)}.
                            </p>
                            <Button size="sm" variant="secondary" className="mt-2.5" icon={mix.kind === 'TRUCK' ? <Truck size={14} /> : <Layers size={14} />} disabled={busy} onClick={onStartMix}>Add Mix</Button>
                        </>
                    ) : (
                        <>
                            <p className="mt-1 text-[13px] text-ink-3">No eligible mix options are currently available: {tier === 'truck' ? 'truckloads can’t be mixed.' : 'mixing is only between variants of the same product, and this product has no other variant that fits one load.'}</p>
                            <Button size="sm" variant="secondary" className="mt-2.5" disabled icon={<Layers size={14} />}>Add Mix</Button>
                        </>
                    )}
                </div>
            </div>
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

    const choose = (c: LoadCandidate) => { setPick(c); setQty(Math.min(c.maxQuantity, 1)); setVariant(c.variant ?? ''); setError(null); };
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
        <Dialog open={open} onClose={onClose} size="xl" title={`Add Mix to your ${loadLabel(load.kind).toLowerCase()}`}
            description="Only other variants of the same product (same SKU, same supplier) are listed — with stock and room left in this load."
            footer={pick
                ? <><Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => setPick(null)}>Back to variants</Button><span className="flex-1" /><Button variant="primary" loading={saving} disabled={qty < 1 || qty > pick.maxQuantity} onClick={confirm}>Add {qtyText(qty, unit)} · {formatPrice(pick.unitPrice * qty)}</Button></>
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
                                <p className="text-[15px] font-semibold text-heading">{pick.name}{pick.variantLabel ? <span className="text-teal"> — {pick.variantLabel}</span> : null}</p>
                                <p className="text-ink-3">{[pick.sku && `SKU ${pick.sku}`, pick.brand, pick.origin && `Origin: ${pick.origin}`, pick.supplier].filter(Boolean).join(' · ')}</p>
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-2 ring-1 ring-line px-3 py-2.5">
                                <dt className="text-ink-3">Price per case</dt><dd className="text-end tabular-nums">{formatPrice(pick.casePrice)}</dd>
                                <dt className="text-ink-3">Pack</dt><dd className="text-end">{pick.unitsPerCase} pcs/case · {pick.casesPerPallet} cases/pallet</dd>
                                <dt className="text-ink-3">Price per {unit}</dt><dd className="text-end tabular-nums">{formatPrice(pick.unitPrice)}</dd>
                                <dt className="text-ink-3">You can add</dt><dd className="text-end">up to {qtyText(pick.maxQuantity, unit)}</dd>
                            </dl>
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
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search variants" aria-label="Search variants of this product" className="w-full h-10 rounded-lg ring-1 ring-line-strong bg-surface ps-9 pe-3 text-[13.5px]" />
                        </label>
                        {loading && !data ? (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-[210px] rounded-xl bg-surface-2 animate-pulse" />)}</div>
                        ) : data && data.items.length === 0 ? (
                            <p className="rounded-xl ring-1 ring-line px-4 py-6 text-center text-[13.5px] text-ink-3">{data.reason || 'No eligible products right now.'}</p>
                        ) : (
                            <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', loading && 'opacity-60')}>
                                {data?.items.map((c) => (
                                    <button key={`${c.id}:${c.variant ?? ''}`} type="button" onClick={() => choose(c)} className="text-start rounded-xl ring-1 ring-line hover:ring-teal bg-surface overflow-hidden flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                                        <span className="h-[120px] bg-white flex items-center justify-center border-b border-line">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            {c.image ? <img src={c.image} alt="" className="max-w-[80%] max-h-[100px] object-contain" /> : <Package size={24} className="text-ink-4" />}
                                        </span>
                                        <span className="p-3 flex-1 flex flex-col gap-0.5 text-[12.5px]">
                                            <span className="text-[13.5px] font-medium text-ink line-clamp-2">{c.variantLabel || c.name}</span>
                                            <span className="text-ink-3 truncate">{[c.sku, c.brand].filter(Boolean).join(' · ') || '—'}</span>
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
