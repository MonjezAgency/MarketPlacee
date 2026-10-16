'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Search, Boxes, Truck, Warehouse, PackageCheck, ChevronDown, Minus, Plus, SlidersHorizontal, Info } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat, Thumb, inputCls, selectCls } from '@/components/supplier/ui';
import { Trans } from '@/components/i18n/Trans';
import { useLanguage } from '@/contexts/LanguageContext';
import StockAdjustDialog from '@/components/supplier/StockAdjustDialog';
import { cn } from '@/lib/utils';

type Row = {
    id: string; name: string; image: string | null; ean: string | null; category: string; exwLocation: string | null;
    unitsPerCase: number | null; casesPerPallet: number | null; palletsPerShipment: number | null;
    stock: number; available: number; reserved: number; onHand: number; inTransit: number; sold: number; cancelled: number; totalOrdered: number;
    stockPallets: number | null; variantBreakdown: { signature: string; picks: Record<string, string>; stock: number }[]; hasVariants: boolean;
};

/**
 * Stock & Reservations — live products only, everything in cases:
 *  available (can be sold now) · reserved (on open orders, still in your
 *  warehouse) · on hand (available + reserved) · in transit (shipped) ·
 *  delivered / cancelled / ordered (all time).
 */
export default function StockPage() {
    const { t, fmt } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n));
    const [rows, setRows] = React.useState<Row[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [q, setQ] = React.useState('');
    const [filter, setFilter] = React.useState<'all' | 'out' | 'reserved'>('all');
    const [open, setOpen] = React.useState<Set<string>>(new Set());
    const [adjust, setAdjust] = React.useState<Row | null>(null);

    const load = React.useCallback(() => { setError(null); supplierApi.inventory().then((d) => setRows(d as Row[])).catch((e) => setError(e.message)); }, []);
    React.useEffect(() => { load(); }, [load]);

    const term = q.trim().toLowerCase();
    const shown = (rows ?? []).filter((r) => (!term || `${r.name} ${r.ean || ''} ${r.category}`.toLowerCase().includes(term))
        && (filter === 'all' || (filter === 'out' ? r.available <= 0 : r.reserved > 0)));
    const sum = (k: keyof Row) => (rows ?? []).reduce((s, r) => s + (Number(r[k]) || 0), 0);

    const setVariant = async (row: Row, signature: string, next: number) => {
        if (next < 0) return;
        const prev = row.variantBreakdown.find((v) => v.signature === signature)?.stock ?? 0;
        setRows((rs) => rs!.map((r) => (r.id !== row.id ? r : { ...r, variantBreakdown: r.variantBreakdown.map((v) => (v.signature === signature ? { ...v, stock: next } : v)) })));
        const res = await apiFetch(`/products/${row.id}/variant-stock`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature, stock: next }) }).catch(() => null);
        if (!res?.ok) {
            toast.error(tc('toastVariantStockFailed'));
            setRows((rs) => rs!.map((r) => (r.id !== row.id ? r : { ...r, variantBreakdown: r.variantBreakdown.map((v) => (v.signature === signature ? { ...v, stock: prev } : v)) })));
        }
    };

    return (
        <div data-no-translate>
            <PageHeader title={tc('stockPageTitle')} description={tc('stockPageDesc')} />

            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4 mb-4">
                <Stat label={tc('statAvailable')} value={rows ? int(sum('available')) : '—'} icon={<PackageCheck size={17} />} tone="success" loading={!rows && !error} hint={tc('statAvailableHint')} />
                <Stat label={tc('reserved')} value={rows ? int(sum('reserved')) : '—'} icon={<Boxes size={17} />} tone="warning" loading={!rows && !error} hint={tc('statReservedHint')} />
                <Stat label={tc('onHand')} value={rows ? int(sum('onHand')) : '—'} icon={<Warehouse size={17} />} loading={!rows && !error} hint={tc('statOnHandHint')} />
                <Stat label={tc('inTransit')} value={rows ? int(sum('inTransit')) : '—'} icon={<Truck size={17} />} tone="info" loading={!rows && !error} hint={tc('statInTransitHint')} />
            </div>

            <Card bodyClassName="p-0">
                <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4 border-b border-line">
                    <label className="relative flex-1 min-w-[220px] sm:max-w-[360px]">
                        <span className="sr-only">{tc('searchStock')}</span>
                        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tc('searchStockPlaceholder')} className={cn(inputCls, 'ps-9')} />
                    </label>
                    <select aria-label={tc('show')} value={filter} onChange={(e) => setFilter(e.target.value as any)} className={cn(selectCls, 'w-[200px]')}>
                        <option value="all">{tc('filterAllLive')}</option>
                        <option value="out">{tc('outOfStock')}</option>
                        <option value="reserved">{tc('filterWithReservations')}</option>
                    </select>
                </div>

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}
                {!rows && !error ? <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
                    : rows && shown.length === 0 ? (
                        <EmptyState icon={<Warehouse size={20} />} title={rows.length ? tc('stockNoMatch') : tc('stockNoLive')}>
                            {rows.length ? tc('stockNoMatchBody') : <Trans text={tc('stockNoLiveBody')} tags={{ link: (c) => <Link className="text-teal hover:underline" href="/supplier/products">{c}</Link> }} />}
                        </EmptyState>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13.5px]">
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                        <th className="text-start font-medium px-4 py-2">{tc('colProduct')}</th>
                                        <th className="text-end font-medium px-2 py-2">{tc('available')}</th>
                                        <th className="text-end font-medium px-2 py-2">{tc('reserved')}</th>
                                        <th className="text-end font-medium px-2 py-2 hidden md:table-cell">{tc('onHand')}</th>
                                        <th className="text-end font-medium px-2 py-2 hidden md:table-cell">{tc('inTransit')}</th>
                                        <th className="text-end font-medium px-2 py-2 hidden lg:table-cell">{tc('delivered')}</th>
                                        <th className="text-end font-medium px-2 py-2 hidden lg:table-cell">{tc('cancelled')}</th>
                                        <th className="text-end font-medium px-2 py-2 hidden xl:table-cell">{tc('orderedAllTime')}</th>
                                        <th className="px-4 py-2"><span className="sr-only">{tc('actions')}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.map((r) => (
                                        <React.Fragment key={r.id}>
                                            <tr className="border-b border-line last:border-0 align-middle">
                                                <td className="px-4 py-2.5 max-w-[340px]">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {r.hasVariants ? (
                                                            <button type="button" aria-expanded={open.has(r.id)} aria-label={tc('showVariantsOf', { name: r.name })} onClick={() => setOpen((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} className="w-6 h-6 rounded flex items-center justify-center text-ink-3 hover:bg-surface-2"><ChevronDown size={15} className={cn('transition-transform', open.has(r.id) && 'rotate-180')} /></button>
                                                        ) : <span className="w-6" />}
                                                        <Thumb src={r.image} size={38} />
                                                        <Link href={`/supplier/products/${r.id}/edit`} className="min-w-0 hover:underline">
                                                            <span className="block truncate font-medium text-ink">{r.name}</span>
                                                            <span className="block truncate text-[12px] text-ink-3 font-mono">{r.ean ? <bdi dir="ltr">{r.ean}</bdi> : <span className="font-sans">{tc('noBarcode')}</span>}{r.casesPerPallet ? <span className="font-sans"> · {tc('casesPerPalletCount', { count: r.casesPerPallet })}</span> : null}</span>
                                                        </Link>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2.5 text-end tabular-nums font-semibold">
                                                    {r.available <= 0 ? <Badge tone="danger">0</Badge> : int(r.available)}
                                                    {r.stockPallets ? <span className="block text-[11.5px] font-normal text-ink-3">{tc('palletsApprox', { count: r.stockPallets })}</span> : null}
                                                </td>
                                                <td className={cn('px-2 py-2.5 text-end tabular-nums', r.reserved ? 'text-amber-800' : 'text-ink-4')}>{int(r.reserved)}</td>
                                                <td className="px-2 py-2.5 text-end tabular-nums hidden md:table-cell">{int(r.onHand)}</td>
                                                <td className={cn('px-2 py-2.5 text-end tabular-nums hidden md:table-cell', !r.inTransit && 'text-ink-4')}>{int(r.inTransit)}</td>
                                                <td className="px-2 py-2.5 text-end tabular-nums hidden lg:table-cell text-ink-2">{int(r.sold)}</td>
                                                <td className="px-2 py-2.5 text-end tabular-nums hidden lg:table-cell text-ink-2">{int(r.cancelled)}</td>
                                                <td className="px-2 py-2.5 text-end tabular-nums hidden xl:table-cell text-ink-2">{int(r.totalOrdered)}</td>
                                                <td className="px-4 py-2.5 text-end"><Button size="sm" icon={<SlidersHorizontal size={13} />} onClick={() => setAdjust(r)}>{tc('adjust')}</Button></td>
                                            </tr>
                                            {open.has(r.id) && r.variantBreakdown.map((v) => (
                                                <tr key={v.signature} className="bg-surface-2/40 border-b border-line text-[12.5px]">
                                                    <td className="ps-[76px] pe-2 py-1.5 text-ink-2">{Object.entries(v.picks).map(([k, val]) => `${k}: ${val}`).join(' · ')}</td>
                                                    <td className="px-2 py-1.5 text-end" colSpan={1}>
                                                        <span className="inline-flex items-center gap-1">
                                                            <button type="button" aria-label={tc('oneCaseLess')} onClick={() => setVariant(r, v.signature, v.stock - 1)} className="w-6 h-6 rounded ring-1 ring-line flex items-center justify-center hover:bg-surface"><Minus size={12} /></button>
                                                            <span className="w-10 text-center tabular-nums">{fmt.number(v.stock)}</span>
                                                            <button type="button" aria-label={tc('oneCaseMore')} onClick={() => setVariant(r, v.signature, v.stock + 1)} className="w-6 h-6 rounded ring-1 ring-line flex items-center justify-center hover:bg-surface"><Plus size={12} /></button>
                                                        </span>
                                                    </td>
                                                    <td colSpan={7} className="px-2 py-1.5 text-ink-4">{tc('variantStockCases')}</td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </Card>

            <div className="mt-4 rounded-xl ring-1 ring-line bg-surface p-4 text-[12.5px] text-ink-3 grid gap-1.5 sm:grid-cols-2">
                <p className="sm:col-span-2 flex items-center gap-1.5 font-semibold text-ink-2"><Info size={14} /> {tc('howNumbersWork')}</p>
                {['explainAvailable', 'explainReserved', 'explainOnHand', 'explainInTransit', 'explainCancelled', 'explainPalletTruck'].map((k) => (
                    <p key={k}><Trans text={tc(k)} tags={{ b: (c) => <b className="text-ink-2">{c}</b> }} /></p>
                ))}
            </div>

            <StockAdjustDialog product={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); load(); }} />
        </div>
    );
}
