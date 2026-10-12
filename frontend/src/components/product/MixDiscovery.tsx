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

/** Compact card matching the "More in …" related-product cards, plus an explicit Select toggle. */
function MixCard({ p, variant, label, kind, sel, markups, badge }: {
    p: Product; variant: string | null; label: string | null; kind: LoadKind; sel: MixSelection; markups: Markups; badge?: string;
}) {
    const reason = mixIneligibility(p, kind);
    const on = sel.has(pickKey(p.id, variant));
    const img = p.images?.[0] || p.image;
    const price = computeCardPrice(p, markups, false);
    return (
        <div className={cn('snap-start shrink-0 w-[172px] sm:w-[188px] flex flex-col rounded-xl ring-1 bg-surface p-2.5 transition-shadow', on ? 'ring-2 ring-[#2EC4B6]' : 'ring-line hover:ring-line-strong')}>
            {/* Viewing = link to the product; selecting = the button below. */}
            <Link href={`/products/${p.id}`} className="group block" draggable={false}>
                <span className="relative block aspect-square rounded-lg bg-media overflow-hidden">
                    {img
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={img} alt={p.name} loading="lazy" draggable={false} className="absolute inset-0 m-auto max-w-[80%] max-h-[80%] object-contain mix-blend-multiply" />
                        : <span className="absolute inset-0 flex items-center justify-center text-ink-4"><Package size={26} strokeWidth={1.3} /></span>}
                    {badge && <span className="absolute top-1.5 start-1.5 h-5 px-1.5 rounded-md bg-surface/90 ring-1 ring-line text-[10.5px] font-semibold text-ink-2 flex items-center">{badge}</span>}
                    {on && <span className="absolute top-1.5 end-1.5 w-5 h-5 rounded-full bg-[#0E7C74] text-white flex items-center justify-center"><Check size={12} /></span>}
                </span>
                {p.brand && <span className="mt-2 block text-[12px] font-semibold text-ink-2 truncate">{p.brand}</span>}
                <span className="block text-[13px] leading-snug text-ink line-clamp-2 min-h-[2.5em] group-hover:text-teal">{p.name}</span>
                {label && <span className="block text-[12px] font-medium text-teal truncate">{label}</span>}
                {p.ean && <span className="block mt-0.5 text-[11.5px] text-ink-4 tabular-nums">{p.ean}</span>}
                <span className="block mt-1 text-[12.5px] text-ink-3">{price > 0 ? <><span className="font-semibold text-ink tabular-nums">{formatPrice(price)}</span> / case</> : 'Price on request'}</span>
            </Link>
            <button
                type="button"
                disabled={!!reason}
                aria-pressed={on}
                title={reason ?? undefined}
                onClick={() => sel.toggle({ productId: p.id, variant, name: p.name, label, image: img })}
                className={cn('mt-2 h-8 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-45 disabled:cursor-not-allowed',
                    on ? 'bg-teal-soft text-teal ring-1 ring-[#2EC4B6]' : 'ring-1 ring-line-strong text-ink hover:ring-ink')}
            >
                {on ? <><Check size={13} /> Selected</> : reason ? 'Not available' : <><Plus size={13} /> Select</>}
            </button>
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
        <div className="mt-4 rounded-2xl ring-1 ring-line bg-surface p-4 sm:p-5 space-y-6" aria-label={`${loadLabel(kind)} builder`}>
            {/* Flavours / variants */}
            <ProductRail
                title={ownVariants.length ? 'Choose flavours' : product.brand ? `More from ${product.brand}` : 'This product'}
                subtitle={ownVariants.length ? 'Each flavour is a separate line in your mix.' : product.brand ? 'Other flavours and sizes in this range.' : undefined}
            >
                {ownVariants.length
                    ? ownVariants.map((v) => <MixCard key={v.sig} p={product} variant={v.sig} label={v.label} kind={kind} sel={sel} markups={markups} />)
                    : <MixCard p={product} variant={null} label={null} kind={kind} sel={sel} markups={markups} badge="This product" />}
                {(family ?? []).map((p) => {
                    const vs = variantSignatures(p.variants);
                    return vs.length
                        ? vs.map((v) => <MixCard key={p.id + v.sig} p={p} variant={v.sig} label={v.label} kind={kind} sel={sel} markups={markups} />)
                        : <MixCard key={p.id} p={p} variant={null} label={null} kind={kind} sel={sel} markups={markups} />;
                })}
                {family === null && <p className="py-8 text-[13px] text-ink-4">Loading…</p>}
            </ProductRail>

            {/* Other products */}
            <ProductRail title="Add other products" subtitle="From across the catalog." viewAll={{ label: 'View all', onClick: onViewAll }}>
                {otherList.map((p) => {
                    const vs = variantSignatures(p.variants);
                    return vs.length
                        ? vs.map((v) => <MixCard key={p.id + v.sig} p={p} variant={v.sig} label={v.label} kind={kind} sel={sel} markups={markups} />)
                        : <MixCard key={p.id} p={p} variant={null} label={null} kind={kind} sel={sel} markups={markups} />;
                })}
                {others === null && <p className="py-8 text-[13px] text-ink-4">Loading…</p>}
                {others !== null && otherList.length === 0 && <p className="py-8 text-[13px] text-ink-3">No other products yet — use View all to search the catalog.</p>}
            </ProductRail>

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
                <div className="rounded-xl bg-surface-2 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[13.5px] font-semibold text-ink">{selected.length} selected <span className="font-normal text-ink-3">· quantities in {unitOf(kind)}</span></p>
                        {selected.length > 0 && <button type="button" onClick={sel.clear} className="text-[12.5px] font-medium text-ink-3 hover:text-[#DC2626]">Clear all</button>}
                    </div>
                    {selected.length > 0 ? (
                        <ul className="mt-2 max-h-[168px] overflow-y-auto space-y-1.5 pe-1">
                            {selected.map((s) => (
                                <li key={s.key} className="flex items-center gap-2 rounded-lg bg-surface ring-1 ring-line px-2.5 py-1.5">
                                    <span className="min-w-0 flex-1 text-[13px] text-ink truncate">{s.name}{s.label ? <span className="text-teal"> — {s.label}</span> : null}</span>
                                    <button type="button" aria-label="Decrease" onClick={() => sel.setQty(s.key, s.quantity - 1)} disabled={s.quantity <= 1} className="w-7 h-7 rounded-md ring-1 ring-line flex items-center justify-center text-ink-2 disabled:opacity-35"><Minus size={12} /></button>
                                    <input value={s.quantity} inputMode="numeric" aria-label={`Quantity in ${unitOf(kind)}`} onChange={(e) => sel.setQty(s.key, parseInt(e.target.value.replace(/\D/g, ''), 10))}
                                        className="w-12 h-7 rounded-md ring-1 ring-line bg-surface text-center text-[13px] font-semibold tabular-nums text-ink outline-none" />
                                    <button type="button" aria-label="Increase" onClick={() => sel.setQty(s.key, s.quantity + 1)} className="w-7 h-7 rounded-md ring-1 ring-line flex items-center justify-center text-ink-2"><Plus size={12} /></button>
                                    <button type="button" onClick={() => sel.remove(s.key)} aria-label={`Remove ${s.name}`} className="w-7 h-7 rounded-md flex items-center justify-center text-ink-4 hover:text-[#DC2626]"><X size={14} /></button>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-1 text-[12.5px] text-ink-3">Select products or flavours above — only what you select goes into the mix.</p>}
                    {sel.error && <p role="alert" className="mt-2 inline-flex items-start gap-1.5 text-[12.5px] text-[#DC2626]"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{sel.error}</p>}
                    <div className="mt-3 flex gap-2">
                        <button type="button" onClick={onViewAll} className="h-10 px-4 rounded-xl ring-1 ring-line-strong text-[13.5px] font-semibold text-ink">Review &amp; search all</button>
                        <button type="button" onClick={sel.submit} disabled={sel.submitting}
                            className="flex-1 h-10 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                            {sel.submitting ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : `Add mix${selected.length ? ` (${selected.length})` : ''}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
