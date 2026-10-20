'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, Layers, Package, Truck } from 'lucide-react';
import { cn, prettifyVariantSignature } from '@/lib/utils';
import { Badge, Card, Thumb } from '@/components/supplier/ui';
import type { AdminOrderDetail, AdminOrderLine, CompositionEntry, OrderLoad } from '@/lib/admin-orders-api';

/**
 * Admin order detail → "Products & loads". One entry per order line, typed by the
 * read model (backend admin-orders.ts buildLoads): a server-validated mixed pallet /
 * truck, a legacy variant mix, or a standard line. "Mixed" comes only from the
 * record (mixedLoadId / mixComposition), never from the order having several
 * products. Missing values read "Not recorded"; zero stays zero.
 */
type Tl = (k: string, v?: Record<string, string | number>) => string;
type Money = (n: number | null | undefined) => string;

const QTY_KEY: Record<string, string> = { case: 'qtyCase', carton: 'qtyCase', pallet: 'qtyPallet', truck: 'qtyTruck' };

export function qtyLabel(tl: Tl, quantity: number | null | undefined, unit: string | null | undefined) {
    if (quantity == null) return tl('notRecorded');
    const key = unit ? QTY_KEY[String(unit).toLowerCase()] : null;
    if (key) return tl(key, { count: quantity });
    return unit ? tl('qtyOther', { count: quantity, unit }) : tl('qtyNoUnit', { count: quantity });
}

function NotRecorded({ tl }: { tl: Tl }) {
    return <span className="text-ink-4">{tl('notRecorded')}</span>;
}

function loadTitle(tl: Tl, load: OrderLoad, line: AdminOrderLine) {
    if (load.type === 'MIXED_LOAD') return load.mixedKind === 'TRUCK' ? tl('loadMixedTruck') : load.mixedKind === 'PALLET' ? tl('loadMixedPallet') : tl('loadMixedUnknown');
    if (load.type === 'VARIANT_MIX') return tl('loadVariantMix');
    return line.name || tl('deletedProduct');
}

export function LoadsSection({ o, tl, eur }: { o: AdminOrderDetail; tl: Tl; eur: Money }) {
    const lineById = new Map(o.lines.map((l) => [l.id, l]));
    const t = o.loadTotals;
    const anyMix = o.loads.some((l) => l.type !== 'STANDARD');
    const standard = o.loads.filter((l) => l.type === 'STANDARD').length;
    return (
        <Card id="products" title={tl('productsLoadsTitle')} description={tl('productsLoadsDesc')} bodyClassName="p-0">
            <div className="flex flex-wrap gap-1.5 px-4 sm:px-5 pb-3">
                {t.mixedLoads > 0 && <Badge tone="brand">{tl('countMixedLoads', { count: t.mixedLoads })}</Badge>}
                {t.variantMixes > 0 && <Badge tone="brand">{tl('countVariantMixes', { count: t.variantMixes })}</Badge>}
                {t.standardLines > 0 && <Badge>{tl('countStandardLines', { count: t.standardLines })}</Badge>}
                <Badge>{tl('currencyEur')}</Badge>
            </div>
            <ul className="border-t border-line divide-y divide-line">
                {o.loads.map((load, i) => {
                    const line = lineById.get(load.lineId);
                    if (!line) return null;
                    return <LoadItem key={load.lineId} index={i + 1} load={load} line={line} netVisible={o.netVisible} tl={tl} eur={eur} />;
                })}
            </ul>
            <div className="border-t border-line bg-surface-2/50 px-4 sm:px-5 py-3">
                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-[13px]">
                    <div className="flex items-baseline justify-between gap-3"><dt className="text-ink-3">{tl('loadsBuyerTotal', { count: t.loads })}</dt><dd className="tabular-nums font-semibold text-heading">{eur(t.buyerTotal)}</dd></div>
                    <div className="flex items-baseline justify-between gap-3"><dt className="text-ink-3">{tl('goodsTotal')}</dt><dd className="tabular-nums font-semibold text-heading">{eur(o.money.goodsTotal)}</dd></div>
                    {o.netVisible && (
                        <div className="flex items-baseline justify-between gap-3"><dt className="text-ink-3">{tl('loadsSupplierNet')}</dt><dd className="tabular-nums text-ink">{t.supplierNet != null ? eur(t.supplierNet) : <NotRecorded tl={tl} />}</dd></div>
                    )}
                </dl>
                {o.netVisible && !!t.loadsWithoutNet && <p className="mt-1 text-[12.5px] text-amber-800">{tl('loadsWithoutNet', { count: t.loadsWithoutNet })}</p>}
                <p className="mt-2 text-[12.5px] text-ink-3">{tl('loadsTotalsNote')}</p>
                {standard > 1 && <p className="mt-1 text-[12.5px] text-ink-3">{tl('standardLinesNote')}</p>}
                {anyMix && <p className="mt-1 text-[12.5px] text-ink-3">{tl('mixPriceNote')}</p>}
            </div>
        </Card>
    );
}

function LoadItem({ index, load, line, netVisible, tl, eur }: { index: number; load: OrderLoad; line: AdminOrderLine; netVisible: boolean; tl: Tl; eur: Money }) {
    const [open, setOpen] = React.useState(false);
    const id = React.useId();
    const mixed = load.type !== 'STANDARD';
    const entries = line.mixComposition ?? [];
    const Icon = load.type === 'STANDARD' ? Package : load.mixedKind === 'TRUCK' ? Truck : Layers;

    return (
        <li className="px-4 sm:px-5 py-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3 min-w-0">
                    {mixed
                        ? <span className="w-11 h-11 shrink-0 rounded-lg bg-teal-soft text-teal flex items-center justify-center" aria-hidden><Icon size={20} /></span>
                        : <Thumb src={line.image} alt={line.name || ''} size={44} />}
                    <div className="min-w-0">
                        <p className="text-[12px] text-ink-3">{tl('loadN', { n: index })}{mixed && <> · <span className="text-teal font-medium">{tl('mixedTag')}</span></>}</p>
                        <h3 className="text-[14px] font-semibold text-heading">
                            {!mixed && line.productId && line.productExists
                                ? <Link href={`/admin/products/${line.productId}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] rounded">{loadTitle(tl, load, line)}</Link>
                                : loadTitle(tl, load, line)}
                        </h3>
                        {load.type === 'VARIANT_MIX' && line.name && <p className="text-[13px] text-ink-2">{line.name}</p>}
                        <p className="mt-0.5 text-[12.5px] text-ink-2">
                            {qtyLabel(tl, load.quantity, load.tier)}
                            {!load.tier && <span className="text-ink-4"> · {tl('tierNotRecorded')}</span>}
                            {mixed && <> · {tl('loadProducts', { count: load.entries })}</>}
                            {line.stockCases != null && <span className="text-ink-3"> · {tl('stockCases', { count: line.stockCases })}</span>}
                        </p>
                        {!mixed && <ProductFacts l={line} tl={tl} />}
                        <p className="mt-0.5 text-[12.5px] text-ink-3">{line.supplier ? tl('supplierIs', { name: line.supplier.name || tl('unnamedSupplier') }) : tl('noSupplierRecorded')}</p>
                        {load.type === 'MIXED_LOAD' && load.loadRecordFound === false && <p className="mt-0.5 text-[12.5px] text-amber-800">{tl('loadRecordMissing')}</p>}
                        {!line.productExists && line.kind === 'product' && <p className="text-[12.5px] text-amber-800">{tl('productRemoved')}</p>}
                        {(line.selectedVariants || line.promotionPercent) && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {line.selectedVariants && Object.entries(line.selectedVariants).map(([k, v]) => <Badge key={k}><span className="text-ink-3">{k}:</span> {v}</Badge>)}
                                {line.promotionPercent ? <Badge tone="brand">{tl('specialOffer', { percent: line.promotionPercent })}</Badge> : null}
                            </div>
                        )}
                    </div>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-0.5 text-[13px] sm:text-end shrink-0 sm:min-w-[170px]">
                    {!mixed && (
                        <div><dt className="text-[12px] text-ink-3">{tl('colUnitPrice')}</dt><dd className="tabular-nums text-ink">{eur(line.unitPrice)}</dd></div>
                    )}
                    <div><dt className="text-[12px] text-ink-3">{mixed ? tl('loadTotal') : tl('colLineTotal')}</dt><dd className="tabular-nums font-semibold text-heading">{eur(load.buyerTotal)}</dd></div>
                    {netVisible && (
                        <div><dt className="text-[12px] text-ink-3">{tl('colNet')}</dt><dd className="tabular-nums text-ink-2">{load.supplierNet != null ? eur(load.supplierNet) : <NotRecorded tl={tl} />}</dd></div>
                    )}
                </dl>
            </div>

            {mixed && (
                <div className="mt-3">
                    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((x) => !x)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-semibold text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                        <ChevronDown size={14} aria-hidden className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
                        {open ? tl('hideLoadContents') : tl('viewLoadContents', { count: entries.length })}
                    </button>
                    <div id={id} hidden={!open} className="mt-2">
                        {entries.length === 0 ? <p className="text-[12.5px] text-ink-3">{tl('loadContentsMissing')}</p> : (
                            <div className="overflow-x-auto rounded-lg ring-1 ring-line">
                                <table className="w-full min-w-[760px] text-[12.5px]">
                                    <caption className="sr-only">{tl('loadContentsCaption', { n: index })}</caption>
                                    <thead>
                                        <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                            <th scope="col" className="text-start font-medium ps-3 pe-2 py-2">{tl('colProduct')}</th>
                                            <th scope="col" className="text-start font-medium px-2 py-2">{tl('colPackaging')}</th>
                                            <th scope="col" className="text-start font-medium px-2 py-2">{tl('colQuantity')}</th>
                                            <th scope="col" className="text-end font-medium px-2 py-2">{tl('colUnitPrice')}</th>
                                            <th scope="col" className="text-end font-medium px-2 py-2">{tl('colLineTotal')}</th>
                                            {netVisible && <th scope="col" className="text-end font-medium px-2 py-2">{tl('colNet')}</th>}
                                            <th scope="col" className="text-start font-medium px-2 pe-3 py-2">{tl('colSupplier')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.map((c, i) => <EntryRow key={i} c={c} netVisible={netVisible} tl={tl} eur={eur} />)}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </li>
    );
}

function ProductFacts({ l, tl }: { l: AdminOrderLine; tl: Tl }) {
    const pk = l.packaging;
    return (
        <p className="mt-0.5 text-[12.5px] text-ink-3 flex flex-wrap gap-x-2">
            {l.brand && <span>{tl('brandIs', { brand: l.brand })}</span>}
            <span>{tl('ean')} {l.ean ? <bdi dir="ltr" className="font-mono">{l.ean}</bdi> : <NotRecorded tl={tl} />}</span>
            {l.productUnit && <span>{tl('unitOfMeasure', { unit: l.productUnit })}</span>}
            {pk && <span>{tl('unitsPerCase')}: {pk.unitsPerCase != null ? pk.unitsPerCase : <NotRecorded tl={tl} />}</span>}
            {pk && <span>{tl('casesPerPallet')}: {pk.casesPerPallet != null ? pk.casesPerPallet : <NotRecorded tl={tl} />}</span>}
            {pk?.weight && <span>{tl('weightIs', { weight: pk.weight })}</span>}
        </p>
    );
}

function EntryRow({ c, netVisible, tl, eur }: { c: CompositionEntry; netVisible: boolean; tl: Tl; eur: Money }) {
    const variant = c.variant ? prettifyVariantSignature(c.variant) : null;
    const name = c.name || variant || tl('variant');
    return (
        <tr className="border-b border-line last:border-0 align-top">
            <td className="ps-3 pe-2 py-2">
                <div className="flex gap-2 min-w-0">
                    <Thumb src={c.image} alt={name} size={32} />
                    <div className="min-w-0">
                        {c.productId && c.productExists
                            ? <Link href={`/admin/products/${c.productId}`} className="font-medium text-ink hover:underline">{name}</Link>
                            : <span className="font-medium text-ink">{name}</span>}
                        {variant && c.name && <span className="block text-ink-2">{tl('variantIs', { variant })}</span>}
                        <span className="block text-ink-3">
                            {c.brand ? `${c.brand} · ` : ''}{tl('ean')} {c.ean ? <bdi dir="ltr" className="font-mono">{c.ean}</bdi> : tl('notRecorded')}
                        </span>
                        {c.discountPercent ? <Badge tone="brand" className="mt-1">{tl('specialOffer', { percent: c.discountPercent })}</Badge> : null}
                    </div>
                </div>
            </td>
            <td className="px-2 py-2 text-ink-2">
                <span className="block">{tl('unitsPerCase')}: {c.packaging.unitsPerCase ?? <NotRecorded tl={tl} />}</span>
                <span className="block">{tl('casesPerPallet')}: {c.packaging.casesPerPallet ?? <NotRecorded tl={tl} />}</span>
                {c.productUnit && <span className="block text-ink-3">{tl('unitOfMeasure', { unit: c.productUnit })}</span>}
            </td>
            <td className="px-2 py-2 whitespace-nowrap">
                <span className="text-ink">{qtyLabel(tl, c.quantity, c.unit)}</span>
                {c.cases != null && String(c.unit).toLowerCase() !== 'case' && <span className="block text-ink-3">{tl('qtyCase', { count: c.cases })}</span>}
                {c.stockCases != null && <span className="block text-ink-3">{tl('stockCases', { count: c.stockCases })}</span>}
            </td>
            <td className="px-2 py-2 text-end tabular-nums whitespace-nowrap">{c.unitPrice != null ? eur(c.unitPrice) : <NotRecorded tl={tl} />}</td>
            <td className="px-2 py-2 text-end tabular-nums whitespace-nowrap font-medium text-ink">{c.lineTotal != null ? eur(c.lineTotal) : <NotRecorded tl={tl} />}</td>
            {netVisible && (
                <td className="px-2 py-2 text-end tabular-nums whitespace-nowrap text-ink-2">
                    {c.supplierLineTotal != null ? <>{eur(c.supplierLineTotal)}{c.supplierUnitPrice != null && <span className="block text-ink-3">{tl('netEach', { price: eur(c.supplierUnitPrice) })}</span>}</> : <NotRecorded tl={tl} />}
                </td>
            )}
            <td className="px-2 pe-3 py-2 text-ink-2">{c.supplier ? c.supplier.name || tl('unnamedSupplier') : <NotRecorded tl={tl} />}</td>
        </tr>
    );
}
