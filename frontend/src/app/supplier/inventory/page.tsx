'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Search, Boxes, Truck, Warehouse, PackageCheck, ChevronDown, Minus, Plus, SlidersHorizontal, Info } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { supplierApi } from '@/lib/supplier-api';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat, Thumb, inputCls, int, selectCls } from '@/components/supplier/ui';
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
            toast.error('Couldn’t save that variant stock.');
            setRows((rs) => rs!.map((r) => (r.id !== row.id ? r : { ...r, variantBreakdown: r.variantBreakdown.map((v) => (v.signature === signature ? { ...v, stock: prev } : v)) })));
        }
    };

    return (
        <div>
            <PageHeader title="Stock & reservations" description="Live products only. Everything is counted in cases." />

            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4 mb-4">
                <Stat label="Available to sell" value={rows ? int(sum('available')) : '—'} icon={<PackageCheck size={17} />} tone="success" loading={!rows && !error} hint="can be ordered now" />
                <Stat label="Reserved" value={rows ? int(sum('reserved')) : '—'} icon={<Boxes size={17} />} tone="warning" loading={!rows && !error} hint="on open orders, still with you" />
                <Stat label="On hand" value={rows ? int(sum('onHand')) : '—'} icon={<Warehouse size={17} />} loading={!rows && !error} hint="available + reserved" />
                <Stat label="In transit" value={rows ? int(sum('inTransit')) : '—'} icon={<Truck size={17} />} tone="info" loading={!rows && !error} hint="shipped, not yet delivered" />
            </div>

            <Card bodyClassName="p-0">
                <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4 border-b border-line">
                    <label className="relative flex-1 min-w-[220px] sm:max-w-[360px]">
                        <span className="sr-only">Search stock</span>
                        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, barcode or category" className={cn(inputCls, 'ps-9')} />
                    </label>
                    <select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as any)} className={cn(selectCls, 'w-[200px]')}>
                        <option value="all">All live products</option>
                        <option value="out">Out of stock</option>
                        <option value="reserved">With reservations</option>
                    </select>
                </div>

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}
                {!rows && !error ? <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
                    : rows && shown.length === 0 ? (
                        <EmptyState icon={<Warehouse size={20} />} title={rows.length ? 'No products match' : 'No live products yet'}>
                            {rows.length ? 'Try another search or filter.' : <>Stock is tracked here once Atlantis approves a product. Manage drafts and reviews in <Link className="text-teal hover:underline" href="/supplier/products">Inventory &amp; Products</Link>.</>}
                        </EmptyState>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13.5px]">
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                        <th className="text-start font-medium px-4 py-2">Product</th>
                                        <th className="text-end font-medium px-2 py-2">Available</th>
                                        <th className="text-end font-medium px-2 py-2">Reserved</th>
                                        <th className="text-end font-medium px-2 py-2 hidden md:table-cell">On hand</th>
                                        <th className="text-end font-medium px-2 py-2 hidden md:table-cell">In transit</th>
                                        <th className="text-end font-medium px-2 py-2 hidden lg:table-cell">Delivered</th>
                                        <th className="text-end font-medium px-2 py-2 hidden lg:table-cell">Cancelled</th>
                                        <th className="text-end font-medium px-2 py-2 hidden xl:table-cell">Ordered (all time)</th>
                                        <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.map((r) => (
                                        <React.Fragment key={r.id}>
                                            <tr className="border-b border-line last:border-0 align-middle">
                                                <td className="px-4 py-2.5 max-w-[340px]">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {r.hasVariants ? (
                                                            <button type="button" aria-expanded={open.has(r.id)} aria-label={`Show variants of ${r.name}`} onClick={() => setOpen((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} className="w-6 h-6 rounded flex items-center justify-center text-ink-3 hover:bg-surface-2"><ChevronDown size={15} className={cn('transition-transform', open.has(r.id) && 'rotate-180')} /></button>
                                                        ) : <span className="w-6" />}
                                                        <Thumb src={r.image} size={38} />
                                                        <Link href={`/supplier/products/${r.id}/edit`} className="min-w-0 hover:underline">
                                                            <span className="block truncate font-medium text-ink">{r.name}</span>
                                                            <span className="block truncate text-[12px] text-ink-3 font-mono">{r.ean || 'no barcode'}{r.casesPerPallet ? <span className="font-sans"> · {r.casesPerPallet} cases/pallet</span> : null}</span>
                                                        </Link>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2.5 text-end tabular-nums font-semibold">
                                                    {r.available <= 0 ? <Badge tone="danger">0</Badge> : int(r.available)}
                                                    {r.stockPallets ? <span className="block text-[11.5px] font-normal text-ink-3">≈ {int(r.stockPallets)} pallets</span> : null}
                                                </td>
                                                <td className={cn('px-2 py-2.5 text-end tabular-nums', r.reserved ? 'text-amber-800' : 'text-ink-4')}>{int(r.reserved)}</td>
                                                <td className="px-2 py-2.5 text-end tabular-nums hidden md:table-cell">{int(r.onHand)}</td>
                                                <td className={cn('px-2 py-2.5 text-end tabular-nums hidden md:table-cell', !r.inTransit && 'text-ink-4')}>{int(r.inTransit)}</td>
                                                <td className="px-2 py-2.5 text-end tabular-nums hidden lg:table-cell text-ink-2">{int(r.sold)}</td>
                                                <td className="px-2 py-2.5 text-end tabular-nums hidden lg:table-cell text-ink-2">{int(r.cancelled)}</td>
                                                <td className="px-2 py-2.5 text-end tabular-nums hidden xl:table-cell text-ink-2">{int(r.totalOrdered)}</td>
                                                <td className="px-4 py-2.5 text-end"><Button size="sm" icon={<SlidersHorizontal size={13} />} onClick={() => setAdjust(r)}>Adjust</Button></td>
                                            </tr>
                                            {open.has(r.id) && r.variantBreakdown.map((v) => (
                                                <tr key={v.signature} className="bg-surface-2/40 border-b border-line text-[12.5px]">
                                                    <td className="ps-[76px] pe-2 py-1.5 text-ink-2">{Object.entries(v.picks).map(([k, val]) => `${k}: ${val}`).join(' · ')}</td>
                                                    <td className="px-2 py-1.5 text-end" colSpan={1}>
                                                        <span className="inline-flex items-center gap-1">
                                                            <button type="button" aria-label="One case less" onClick={() => setVariant(r, v.signature, v.stock - 1)} className="w-6 h-6 rounded ring-1 ring-line flex items-center justify-center hover:bg-surface"><Minus size={12} /></button>
                                                            <span className="w-10 text-center tabular-nums">{v.stock}</span>
                                                            <button type="button" aria-label="One case more" onClick={() => setVariant(r, v.signature, v.stock + 1)} className="w-6 h-6 rounded ring-1 ring-line flex items-center justify-center hover:bg-surface"><Plus size={12} /></button>
                                                        </span>
                                                    </td>
                                                    <td colSpan={7} className="px-2 py-1.5 text-ink-4">variant stock (cases)</td>
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
                <p className="sm:col-span-2 flex items-center gap-1.5 font-semibold text-ink-2"><Info size={14} /> How these numbers work</p>
                <p><b className="text-ink-2">Available</b> — cases buyers can order now. Placing an order takes its cases off immediately, so nothing is sold twice.</p>
                <p><b className="text-ink-2">Reserved</b> — cases on orders that are placed, paid or being prepared. They’re still in your warehouse.</p>
                <p><b className="text-ink-2">On hand</b> — available + reserved: what should physically be in your warehouse.</p>
                <p><b className="text-ink-2">In transit</b> — shipped, not yet delivered.</p>
                <p><b className="text-ink-2">Cancelled</b> — cases on cancelled orders. They return to available only if the order was cancelled before shipping.</p>
                <p><b className="text-ink-2">Pallet / truck orders</b> count as their full number of cases.</p>
            </div>

            <StockAdjustDialog product={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); load(); }} />
        </div>
    );
}
