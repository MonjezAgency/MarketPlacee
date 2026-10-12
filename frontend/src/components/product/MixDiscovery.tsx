'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Plus, Package, X, Minus, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fetchProductPage } from '@/lib/api';
import type { Product } from '@/lib/types';
import { formatPrice } from '@/lib/currency';
import { computeCardPrice, type Markups } from '@/lib/card-pricing';
import { variantSignatures, loadLabel, type LoadKind } from '@/lib/wholesale';
import { pickKey, type MixSelection } from '@/lib/useMixSelection';
import { ProductRail } from '@/components/product/ProductRail';
import { cn } from '@/lib/utils';
import { brandLogo } from '@/lib/brand-logos';

const unitOf = (k: LoadKind) => (k === 'PALLET' ? 'cases' : 'pallets');

/** A product can join a mix type only if its own pack data supports it (no new capacity rules). */
export function mixIneligibility(p: Product, kind: LoadKind): string | null {
    const miss = [
        !p.unitsPerCase && 'units per case',
        !p.casesPerPallet && 'cases per pallet',
        kind === 'TRUCK' && !p.palletsPerShipment && 'pallets per truckload',
    ].filter(Boolean);
    return miss.length ? `Missing ${miss.join(', ')}` : null;
}

/**
 * Compact selection row (same family as the flavour chips): round image,
 * name, and a +/✓ toggle inside one rounded container. Nothing here links
 * away — the whole row selects/deselects this exact product or variant.
 */
function MixRow({ p, variant, label, kind, sel, badge }: {
    p: Product; variant: string | null; label: string | null; kind: LoadKind; sel: MixSelection; markups?: Markups; badge?: string;
}) {
    const reason = mixIneligibility(p, kind);
    const on = sel.has(pickKey(p.id, variant));
    const img = p.images?.[0] || p.image;
    const logo = img ? null : brandLogo(p.brand);
    // Under the name: the supplier-entered EAN code, else the entered pack
    // size. The product has no separate free-text label field.
    const code = p.ean ? `EAN ${p.ean}` : p.weight ? String(p.weight) : '';
    const toggle = () => { if (!reason) sel.toggle({ productId: p.id, variant, name: p.name, label, image: img }); };
    return (
        <div
            role="button"
            tabIndex={reason ? -1 : 0}
            aria-pressed={on}
            aria-disabled={!!reason}
            title={reason ?? (on ? 'Selected — click to remove' : 'Click to add to your mix')}
            onClick={toggle}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
            className={cn(
                'shrink-0 w-[208px] flex items-center gap-2 rounded-full ps-1 pe-1 py-1 ring-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                reason ? 'opacity-50 cursor-not-allowed ring-line' : 'cursor-pointer',
                on ? 'ring-[#2EC4B6] bg-teal-soft/60' : !reason && 'ring-line hover:ring-line-strong hover:bg-surface-2',
            )}
        >
            <span className="relative w-8 h-8 shrink-0 rounded-full bg-media ring-1 ring-line overflow-clip">
                {img || logo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={(img || logo)!} alt="" draggable={false} loading="lazy" className="absolute inset-0 m-auto max-w-[78%] max-h-[78%] object-contain mix-blend-multiply" />
                    : <span className="absolute inset-0 flex items-center justify-center text-ink-4"><Package size={13} /></span>}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[12.5px] font-medium text-ink whitespace-nowrap text-ellipsis overflow-clip">{label ?? p.name}</span>
                {(badge || label || reason || code) && <span className="block text-[11px] text-ink-3 whitespace-nowrap text-ellipsis overflow-clip">{badge ?? (label ? p.name : reason ?? code)}</span>}
            </span>
            <span
                aria-hidden
                className={cn('w-7 h-7 shrink-0 rounded-full flex items-center justify-center transition-colors',
                    on ? 'bg-[#0E7C74] text-white' : 'ring-1 ring-line-strong text-ink-2')}
            >
                {on ? <Check size={13} strokeWidth={2.5} /> : <Plus size={13} />}
            </span>
        </div>
    );
}

/**
 * Inline mixed-order discovery under the purchase panel: flavours of the
 * current product (or the same brand's range), other catalog products, and
 * the pending selection. "View all" opens the full picker (sidebar).
 */
export default function MixDiscovery({ product, sel, markups, onViewAll }: {
    product: Product; sel: MixSelection; markups: Markups; onViewAll: () => void;
}) {
    const kind = sel.kind!;
    const [family, setFamily] = React.useState<Product[] | null>(null);
    const [others, setOthers] = React.useState<Product[] | null>(null);
    // What to browse is the buyer's explicit choice; switching never touches the selection.
    const [browse, setBrowse] = React.useState<'flavours' | 'others' | 'both' | null>(null);
    const showFlavours = browse === 'flavours' || browse === 'both';
    const showOthers = browse === 'others' || browse === 'both';

    // Real catalog data: same brand (flavours sold as separate SKUs) and other products.
    React.useEffect(() => {
        const ctrl = new AbortController();
        const brand = product.brand || '';
        (brand ? fetchProductPage({ brand, limit: 24, sort: 'name_asc' }, ctrl.signal).then((r) => r.items) : Promise.resolve([] as Product[]))
            .then((items) => setFamily(items.filter((p) => p.id !== product.id)))
            .catch(() => setFamily([]));
        fetchProductPage({ category: product.category || undefined, limit: 24, sort: 'newest' }, ctrl.signal)
            .then(async (r) => {
                let items = r.items;
                if (items.length < 6) items = (await fetchProductPage({ limit: 24, sort: 'newest' }, ctrl.signal)).items;
                setOthers(items);
            })
            .catch(() => setOthers([]));
        return () => ctrl.abort();
    }, [product.id, product.brand, product.category]);

    const ownVariants = variantSignatures(product.variants);
    const familyIds = new Set((family ?? []).map((p) => p.id));
    // Each SKU appears once: "other products" excludes this product and anything already in the flavours row.
    const otherList = (others ?? []).filter((p) => p.id !== product.id && !familyIds.has(p.id));
    const selected = sel.selected;

    return (
        <div className="mt-4 rounded-2xl ring-1 ring-line bg-surface p-4 space-y-4" aria-label={`${loadLabel(kind)} builder`}>
            {/* Explicit choice of what to browse */}
            <div>
                <p className="text-[12.5px] font-semibold text-ink">What would you like to add?</p>
                <div role="radiogroup" aria-label="Browse" className="mt-1.5 flex flex-wrap gap-1.5">
                    {([['flavours', ownVariants.length ? 'Flavours / variants' : `Flavours${product.brand ? ` · ${product.brand}` : ''}`], ['others', 'Other products'], ['both', 'Both']] as const).map(([k, l]) => (
                        <button key={k} type="button" role="radio" aria-checked={browse === k} onClick={() => setBrowse(k)}
                            className={cn('h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-colors',
                                browse === k ? 'bg-[#0E7C74] text-white' : 'ring-1 ring-line-strong text-ink hover:ring-ink')}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Flavours / variants */}
            {showFlavours && <ProductRail arrows={false} snap={false}
                title={ownVariants.length ? 'Flavours' : product.brand ? `More from ${product.brand}` : 'This product'}
                subtitle={ownVariants.length ? 'Each flavour is a separate line in your mix.' : product.brand ? 'Other flavours and sizes in this range.' : undefined}
                viewAll={{ label: 'View all', onClick: onViewAll }}
            >
                {ownVariants.length
                    ? ownVariants.map((v) => <MixRow key={v.sig} p={product} variant={v.sig} label={v.label} kind={kind} sel={sel} markups={markups} />)
                    : <MixRow p={product} variant={null} label={null} kind={kind} sel={sel} markups={markups} badge="This product" />}
                {(family ?? []).map((p) => {
                    const vs = variantSignatures(p.variants);
                    return vs.length
                        ? vs.map((v) => <MixRow key={p.id + v.sig} p={p} variant={v.sig} label={v.label} kind={kind} sel={sel} markups={markups} />)
                        : <MixRow key={p.id} p={p} variant={null} label={null} kind={kind} sel={sel} markups={markups} />;
                })}
                {family === null && <p className="py-3 text-[13px] text-ink-4">Loading…</p>}
            </ProductRail>}

            {/* Other products */}
            {showOthers && <ProductRail arrows={false} snap={false} title="Other products" subtitle="From across the catalog." viewAll={{ label: 'View all', onClick: onViewAll }}>
                {otherList.map((p) => {
                    const vs = variantSignatures(p.variants);
                    return vs.length
                        ? vs.map((v) => <MixRow key={p.id + v.sig} p={p} variant={v.sig} label={v.label} kind={kind} sel={sel} markups={markups} />)
                        : <MixRow key={p.id} p={p} variant={null} label={null} kind={kind} sel={sel} markups={markups} />;
                })}
                {others === null && <p className="py-3 text-[13px] text-ink-4">Loading…</p>}
                {others !== null && otherList.length === 0 && <p className="py-3 text-[13px] text-ink-3">No other products yet — use View all to search the catalog.</p>}
            </ProductRail>}

            {/* Pending selection + confirm */}
            {sel.created ? (
                <div className="rounded-xl bg-surface-2 px-4 py-3 flex flex-wrap items-center gap-3" aria-live="polite">
                    <CheckCircle2 size={18} className="text-[#10B981]" />
                    <p className="text-[13.5px] text-ink flex-1 min-w-0">
                        {loadLabel(sel.created.kind)} created with {sel.created.quote?.lines.length ?? 0} {sel.created.quote?.lines.length === 1 ? 'product' : 'products'}.
                    </p>
                    <button type="button" onClick={() => sel.setCreated(null)} className="h-9 px-3 rounded-lg ring-1 ring-line-strong text-[13px] font-medium text-ink">Build another</button>
                    <Link href="/cart" className="h-9 px-4 inline-flex items-center rounded-lg bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold">View in cart</Link>
                </div>
            ) : (
                <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[12.5px] font-semibold text-ink">{selected.length} selected <span className="font-normal text-ink-3">· quantities in {unitOf(kind)}</span></p>
                        {selected.length > 0 && <button type="button" onClick={sel.clear} className="text-[12.5px] font-medium text-ink-3 hover:text-[#DC2626]">Clear all</button>}
                    </div>
                    {selected.length > 0 ? (
                        <ul className="mt-2 max-h-[168px] overflow-y-auto space-y-1.5 pe-1">
                            {selected.map((s) => (
                                <li key={s.key} className="flex items-center gap-1.5 rounded-lg bg-surface ring-1 ring-line ps-2.5 pe-1 py-1">
                                    <span className="min-w-0 flex-1 text-[12.5px] text-ink truncate">{s.name}{s.label ? <span className="text-teal"> — {s.label}</span> : null}</span>
                                    <button type="button" aria-label="Decrease" onClick={() => sel.setQty(s.key, s.quantity - 1)} disabled={s.quantity <= 1} className="w-6 h-6 rounded-md ring-1 ring-line flex items-center justify-center text-ink-2 disabled:opacity-35"><Minus size={12} /></button>
                                    <input value={s.quantity} inputMode="numeric" aria-label={`Quantity in ${unitOf(kind)}`} onChange={(e) => sel.setQty(s.key, parseInt(e.target.value.replace(/\D/g, ''), 10))}
                                        className="w-10 h-6 rounded-md ring-1 ring-line bg-surface text-center text-[12.5px] font-semibold tabular-nums text-ink outline-none" />
                                    <button type="button" aria-label="Increase" onClick={() => sel.setQty(s.key, s.quantity + 1)} className="w-6 h-6 rounded-md ring-1 ring-line flex items-center justify-center text-ink-2"><Plus size={12} /></button>
                                    <button type="button" onClick={() => sel.remove(s.key)} aria-label={`Remove ${s.name}`} className="w-6 h-6 rounded-md flex items-center justify-center text-ink-4 hover:text-[#DC2626]"><X size={13} /></button>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-1 text-[12.5px] text-ink-3">Select products or flavours above — only what you select goes into the mix.</p>}
                    {sel.error && <p role="alert" className="mt-2 inline-flex items-start gap-1.5 text-[12.5px] text-[#DC2626]"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{sel.error}</p>}
                    <div className="mt-2.5 flex gap-2">
                        <button type="button" onClick={onViewAll} className="h-9 px-3.5 rounded-lg ring-1 ring-line-strong text-[12.5px] font-semibold text-ink">Review &amp; search all</button>
                        <button type="button" onClick={sel.submit} disabled={sel.submitting}
                            className="flex-1 h-9 rounded-lg bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                            {sel.submitting ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : `Add mix${selected.length ? ` (${selected.length})` : ''}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
