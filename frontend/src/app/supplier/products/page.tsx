'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Upload, Search, Package, Pencil, Trash2, Send, SlidersHorizontal, Image as ImageIcon, ChevronLeft, ChevronRight, AlertCircle, Boxes, Tags, Clock3, CheckCircle2 } from 'lucide-react';
import { supplierApi, type ProductPage, type SupplierProduct } from '@/lib/supplier-api';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat, StatusBadge, Thumb, eur, int, inputCls, selectCls, useConfirm } from '@/components/supplier/ui';
import BulkImportDialog from '@/components/supplier/BulkImportDialog';
import StockAdjustDialog from '@/components/supplier/StockAdjustDialog';
import { cn } from '@/lib/utils';

const STATUS_TABS = [
    { id: '', label: 'All' },
    { id: 'APPROVED', label: 'Live' },
    { id: 'PENDING', label: 'In review' },
    { id: 'NEEDS_CHANGES', label: 'Changes requested' },
    { id: 'DRAFT', label: 'Drafts' },
    { id: 'REJECTED', label: 'Rejected' },
];
const SORTS = [
    { id: 'newest', label: 'Newest first' }, { id: 'updated', label: 'Recently updated' }, { id: 'name', label: 'Name A–Z' },
    { id: 'stock_asc', label: 'Stock: low to high' }, { id: 'stock_desc', label: 'Stock: high to low' },
    { id: 'price_asc', label: 'Price: low to high' }, { id: 'price_desc', label: 'Price: high to low' },
];

/** Inventory & Products — the supplier's own catalog, paginated on the server. */
export default function InventoryManagerPage() {
    return <React.Suspense fallback={null}><InventoryManager /></React.Suspense>;
}

function InventoryManager() {
    const router = useRouter();
    const params = useSearchParams();
    const confirm = useConfirm();
    const [q, setQ] = React.useState(params.get('q') || '');
    const [debouncedQ, setDebouncedQ] = React.useState(q);
    const [status, setStatus] = React.useState(params.get('status') || '');
    const [category, setCategory] = React.useState(params.get('category') || '');
    const [stock, setStock] = React.useState(params.get('stock') || '');
    const [sort, setSort] = React.useState(params.get('sort') || 'newest');
    const [page, setPage] = React.useState(Number(params.get('page')) || 1);
    const [data, setData] = React.useState<ProductPage | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [busy, setBusy] = React.useState(false);
    const [importOpen, setImportOpen] = React.useState(params.get('import') === '1');
    const [adjust, setAdjust] = React.useState<SupplierProduct | null>(null);

    React.useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t); }, [q]);
    React.useEffect(() => { setPage(1); }, [debouncedQ, status, category, stock, sort]);

    // Keep the URL in sync so filters survive refresh and links from the overview work.
    React.useEffect(() => {
        const u = new URLSearchParams();
        if (debouncedQ) u.set('q', debouncedQ); if (status) u.set('status', status); if (category) u.set('category', category);
        if (stock) u.set('stock', stock); if (sort !== 'newest') u.set('sort', sort); if (page > 1) u.set('page', String(page));
        router.replace(`/supplier/products${u.toString() ? `?${u}` : ''}`, { scroll: false });
    }, [debouncedQ, status, category, stock, sort, page, router]);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        supplierApi.products({ q: debouncedQ, status, category, stock, sort, page, limit: 25 })
            .then((d) => { setData(d); setSelected(new Set()); })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [debouncedQ, status, category, stock, sort, page]);
    React.useEffect(() => { load(); }, [load]);

    const rows = data?.data ?? [];
    const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
    const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const chosen = rows.filter((r) => selected.has(r.id));
    const submittable = chosen.filter((r) => ['DRAFT', 'NEEDS_CHANGES'].includes(r.status) && r.missing.length === 0);

    const removeOne = async (p: SupplierProduct) => {
        if (!(await confirm({ title: `Delete “${p.name}”?`, body: 'The listing is removed from your catalog and the marketplace. Past orders keep their details. This can’t be undone.', confirm: 'Delete product', tone: 'danger' }))) return;
        try { await supplierApi.remove(p.id); toast.success('Product deleted'); load(); } catch (e: any) { toast.error(e.message); }
    };
    const removeSelected = async () => {
        if (!(await confirm({ title: `Delete ${chosen.length} product${chosen.length === 1 ? '' : 's'}?`, body: 'They are removed from your catalog and the marketplace. Past orders keep their details. This can’t be undone.', confirm: 'Delete', tone: 'danger' }))) return;
        setBusy(true);
        try { const r = await supplierApi.removeMany(chosen.map((c) => c.id)); toast.success(`${r.count} deleted`); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    const submitSelected = async () => {
        setBusy(true);
        const results = await Promise.allSettled(submittable.map((p) => supplierApi.resend(p.id)));
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - ok;
        failed ? toast.error(`${ok} submitted, ${failed} failed — open them to see what’s missing.`) : toast.success(`${ok} submitted for review`);
        setBusy(false); load();
    };

    const s = data?.summary;
    const needsWork = s ? (s.byStatus.DRAFT || 0) + (s.byStatus.NEEDS_CHANGES || 0) : undefined;

    return (
        <div>
            <PageHeader title="Inventory & products" description="Your catalog, your prices and your stock. Price and stock changes on live listings apply immediately; new products and identity changes go through Atlantis review."
                actions={<>
                    <Button icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>Bulk upload</Button>
                    <Link href="/supplier/products/new"><Button variant="primary" icon={<Plus size={15} />}>Add product</Button></Link>
                </>} />

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
                <Stat label="Total products" value={int(s?.total)} icon={<Package size={17} />} loading={!data && loading} />
                <Stat label="Live" value={int(s?.byStatus.APPROVED)} icon={<CheckCircle2 size={17} />} tone="success" loading={!data && loading} hint={s?.outOfStock ? `${s.outOfStock} out of stock` : undefined} />
                <Stat label="In review" value={int(s?.byStatus.PENDING)} icon={<Clock3 size={17} />} tone="warning" loading={!data && loading} hint={needsWork ? `${needsWork} need your input` : undefined} />
                <Stat label="Categories" value={int(s?.categories)} icon={<Tags size={17} />} loading={!data && loading} />
            </div>

            <Card bodyClassName="p-0">
                {/* Filters */}
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-line">
                    <div role="tablist" aria-label="Status" className="flex gap-1 overflow-x-auto -mx-1 px-1">
                        {STATUS_TABS.map((t) => {
                            const n = t.id ? s?.byStatus[t.id] : s?.total;
                            return (
                                <button key={t.id || 'all'} role="tab" aria-selected={status === t.id} onClick={() => setStatus(t.id)}
                                    className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                        status === t.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                                    {t.label}{n !== undefined && <span className={cn('ms-1.5 tabular-nums', status === t.id ? 'text-white/70' : 'text-ink-4')}>{n}</span>}
                                </button>
                            );
                        })}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_160px_190px]">
                        <label className="relative">
                            <span className="sr-only">Search products</span>
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand or barcode" className={cn(inputCls, 'ps-9')} />
                        </label>
                        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                            <option value="">All categories</option>
                            {(data?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select aria-label="Stock" value={stock} onChange={(e) => setStock(e.target.value)} className={selectCls}>
                            <option value="">Any stock</option>
                            <option value="out">Out of stock</option>
                        </select>
                        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className={selectCls}>
                            {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                {selected.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-teal-soft border-b border-line text-[13px]">
                        <span className="font-medium text-heading">{selected.size} selected</span>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                        <span className="flex-1" />
                        {submittable.length > 0 && <Button size="sm" variant="secondary" icon={<Send size={13} />} loading={busy} onClick={submitSelected}>Submit {submittable.length} for review</Button>}
                        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} loading={busy} onClick={removeSelected}>Delete</Button>
                    </div>
                )}

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}

                {/* Table (md+) / cards (mobile) */}
                {loading && !data ? (
                    <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : rows.length === 0 && !error ? (
                    data?.summary.total ? (
                        <EmptyState icon={<Search size={20} />} title="No products match these filters" action={<Button onClick={() => { setQ(''); setStatus(''); setCategory(''); setStock(''); }}>Clear filters</Button>}>Try another search or status.</EmptyState>
                    ) : (
                        <EmptyState icon={<Boxes size={20} />} title="Add your first product"
                            action={<><Button icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>Bulk upload</Button><Link href="/supplier/products/new"><Button variant="primary" icon={<Plus size={15} />}>Add product</Button></Link></>}>
                            Add products one by one, or upload a spreadsheet. Atlantis reviews each listing before buyers can see it.
                        </EmptyState>
                    )
                ) : (
                    <>
                        <div className="hidden md:block overflow-x-auto">
                            <table className={cn('w-full text-[13.5px]', loading && 'opacity-60')}>
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                        <th className="w-10 ps-4 py-2"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={toggleAll} className="w-4 h-4 accent-[#0E7C74]" /></th>
                                        <th className="text-start font-medium px-2 py-2">Product</th>
                                        <th className="text-start font-medium px-2 py-2 hidden xl:table-cell">Category</th>
                                        <th className="text-start font-medium px-2 py-2">Status</th>
                                        <th className="text-end font-medium px-2 py-2">Price / case</th>
                                        <th className="text-end font-medium px-2 py-2">Stock (cases)</th>
                                        <th className="text-start font-medium px-2 py-2 hidden lg:table-cell">Barcode</th>
                                        <th className="text-end font-medium pe-4 py-2"><span className="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((p) => (
                                        <tr key={p.id} className={cn('border-b border-line last:border-0 hover:bg-surface-2/40', selected.has(p.id) && 'bg-teal-soft/50')}>
                                            <td className="ps-4 py-2.5"><input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-[#0E7C74]" /></td>
                                            <td className="px-2 py-2.5 max-w-[360px]">
                                                <Link href={`/supplier/products/${p.id}/edit`} className="flex items-center gap-3 min-w-0 group">
                                                    <Thumb src={p.images?.[0]} size={40} />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-ink group-hover:underline">{p.name}</span>
                                                        <span className="block truncate text-[12px] text-ink-3">{p.brand || 'No brand'}{p.weight ? ` · ${p.weight}` : ''}{p.unitsPerCase ? ` · ${p.unitsPerCase}/case` : ''}</span>
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="px-2 py-2.5 hidden xl:table-cell text-ink-2 max-w-[160px] truncate">{p.category}</td>
                                            <td className="px-2 py-2.5">
                                                <div className="flex flex-col items-start gap-1" title={p.statusNote}>
                                                    <StatusBadge status={p.status} />
                                                    {p.missing.length > 0 && <span className="inline-flex items-center gap-1 text-[12px] text-amber-800"><AlertCircle size={12} />{p.missing.length} missing</span>}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2.5 text-end tabular-nums">{p.price && p.price > 0 ? eur(p.price) : <span className="text-ink-4">—</span>}</td>
                                            <td className="px-2 py-2.5 text-end tabular-nums">
                                                <span className={cn('font-medium', p.stock <= 0 && 'text-red-700')}>{int(p.stock)}</span>
                                                {!!p.reserved && <span className="block text-[12px] text-ink-3">{int(p.reserved)} reserved</span>}
                                            </td>
                                            <td className="px-2 py-2.5 hidden lg:table-cell font-mono text-[12.5px] text-ink-2">{p.ean || <span className="font-sans text-amber-800">Missing</span>}</td>
                                            <td className="pe-4 py-2.5">
                                                <div className="flex justify-end gap-1">
                                                    {p.status === 'APPROVED' && <button type="button" onClick={() => setAdjust(p)} aria-label={`Adjust stock of ${p.name}`} title="Adjust stock" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><SlidersHorizontal size={15} /></button>}
                                                    <Link href={`/supplier/products/${p.id}/edit#media`} aria-label={`Photos of ${p.name}`} title="Photos" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><ImageIcon size={15} /></Link>
                                                    <Link href={`/supplier/products/${p.id}/edit`} title="Edit" aria-label={`Edit ${p.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Pencil size={15} /></Link>
                                                    <button type="button" onClick={() => removeOne(p)} aria-label={`Delete ${p.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Trash2 size={15} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <ul className="md:hidden divide-y divide-line">
                            {rows.map((p) => (
                                <li key={p.id} className="flex gap-3 p-3">
                                    <input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="mt-3 w-4 h-4 accent-[#0E7C74]" />
                                    <Link href={`/supplier/products/${p.id}/edit`} className="flex gap-3 min-w-0 flex-1">
                                        <Thumb src={p.images?.[0]} size={48} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-medium text-ink truncate">{p.name}</span>
                                            <span className="block text-[12px] text-ink-3 truncate">{p.brand || 'No brand'} · {p.ean || 'no barcode'}</span>
                                            <span className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                                                <StatusBadge status={p.status} />
                                                <span className="tabular-nums">{p.price && p.price > 0 ? `${eur(p.price)}/case` : 'no price'}</span>
                                                <span className={cn('tabular-nums', p.stock <= 0 && 'text-red-700')}>{int(p.stock)} cases</span>
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {data && data.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line text-[13px] text-ink-3">
                        <span>{(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {int(data.total)}</span>
                        <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} />} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                            <span className="px-2 tabular-nums">Page {data.page} of {data.pages}</span>
                            <Button size="sm" variant="ghost" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={15} /></Button>
                        </div>
                    </div>
                )}
            </Card>

            <p className="mt-3 text-[12.5px] text-ink-3">Prices are your price per case (EUR), before the Atlantis margin. Stock is counted in cases; “reserved” cases are on orders not yet delivered and are already taken off stock. Per-product movement history is on <Link href="/supplier/inventory" className="text-teal hover:underline">Stock &amp; reservations</Link>.</p>

            <BulkImportDialog open={importOpen} onClose={() => { setImportOpen(false); load(); }} />
            <StockAdjustDialog product={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); load(); }} />
        </div>
    );
}
