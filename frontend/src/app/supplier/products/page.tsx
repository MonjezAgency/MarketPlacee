'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Upload, Search, Package, Pencil, Trash2, Send, SlidersHorizontal, Image as ImageIcon, RefreshCw, ScanBarcode, ChevronLeft, ChevronRight, AlertCircle, Boxes, Tags, Clock3, CheckCircle2 } from 'lucide-react';
import { supplierApi, type ProductPage, type SupplierProduct } from '@/lib/supplier-api';
import { Badge, Button, Card, EmptyState, ErrorState, PRODUCT_STATUS, PageHeader, Skeleton, Stat, Thumb, inputCls, selectCls, useConfirm } from '@/components/supplier/ui';
import { categoryLabel, statusLabel } from '@/components/supplier/import/types';
import { useLanguage } from '@/contexts/LanguageContext';
import StockAdjustDialog from '@/components/supplier/StockAdjustDialog';
import PriceStockUpdateDialog from '@/components/supplier/PriceStockUpdateDialog';
import ImageDiscoveryBadge from '@/components/supplier/ImageDiscoveryBadge';
import { Trans } from '@/components/i18n/Trans';
import { cn } from '@/lib/utils';
import { isRealImage } from '@/lib/catalog-rules';

const FIND_PER_CLICK = 15; // the server allows 20 searches a minute per person

/** `label` values are supplierCatalog dictionary keys. */
const STATUS_TABS = [
    { id: '', label: 'tabAll' },
    { id: 'APPROVED', label: 'tabLive' },
    { id: 'PENDING', label: 'tabInReview' },
    { id: 'NEEDS_CHANGES', label: 'tabChangesRequested' },
    { id: 'DRAFT', label: 'tabDrafts' },
    { id: 'REJECTED', label: 'tabRejected' },
];
const SORTS = [
    { id: 'newest', label: 'sortNewest' }, { id: 'updated', label: 'sortUpdated' }, { id: 'name', label: 'sortName' },
    { id: 'stock_asc', label: 'sortStockAsc' }, { id: 'stock_desc', label: 'sortStockDesc' },
    { id: 'price_asc', label: 'sortPriceAsc' }, { id: 'price_desc', label: 'sortPriceDesc' },
];

/** Inventory & Products — the supplier's own catalog, paginated on the server. */
export default function InventoryManagerPage() {
    return <React.Suspense fallback={null}><InventoryManager /></React.Suspense>;
}

function InventoryManager() {
    const router = useRouter();
    const params = useSearchParams();
    const confirm = useConfirm();
    const { t, fmt } = useLanguage();
    const tc = (k: string, v?: Record<string, string | number>) => t('supplierCatalog', k, v);
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n));
    const money = (n: number) => fmt.number(n, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const status_ = (st: string) => <Badge tone={PRODUCT_STATUS[st]?.tone ?? 'neutral'} dot>{statusLabel(st, t)}</Badge>;
    const [q, setQ] = React.useState(params.get('q') || '');
    const [debouncedQ, setDebouncedQ] = React.useState(q);
    const [status, setStatus] = React.useState(params.get('status') || '');
    const [category, setCategory] = React.useState(params.get('category') || '');
    const [stock, setStock] = React.useState(params.get('stock') || '');
    // ?attention=images (linked from the overview): products without a photo.
    const [attention, setAttention] = React.useState(params.get('attention') === 'images' ? 'images' : '');
    const [sort, setSort] = React.useState(params.get('sort') || 'newest');
    const [page, setPage] = React.useState(Number(params.get('page')) || 1);
    const [data, setData] = React.useState<ProductPage | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [busy, setBusy] = React.useState(false);
    const [adjust, setAdjust] = React.useState<SupplierProduct | null>(null);
    const [updateOpen, setUpdateOpen] = React.useState(false);

    React.useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t); }, [q]);
    React.useEffect(() => { setPage(1); }, [debouncedQ, status, category, stock, sort, attention]);

    // Keep the URL in sync so filters survive refresh and links from the overview work.
    React.useEffect(() => {
        const u = new URLSearchParams();
        if (debouncedQ) u.set('q', debouncedQ); if (status) u.set('status', status); if (category) u.set('category', category);
        if (stock) u.set('stock', stock); if (attention) u.set('attention', attention); if (sort !== 'newest') u.set('sort', sort); if (page > 1) u.set('page', String(page));
        router.replace(`/supplier/products${u.toString() ? `?${u}` : ''}`, { scroll: false });
    }, [debouncedQ, status, category, stock, attention, sort, page, router]);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        supplierApi.products({ q: debouncedQ, status, category, stock, attention, sort, page, limit: 25 })
            .then((d) => { setData(d); setSelected(new Set()); })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [debouncedQ, status, category, stock, attention, sort, page]);
    React.useEffect(() => { load(); }, [load]);

    const rows = data?.data ?? [];
    const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
    const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    // Products saved before the photo search existed were never searched: start it for the ones on this page.
    const unsearched = rows.filter((r) => r.ean && !r.imageDiscovery && !(r.images || []).some(isRealImage)).slice(0, FIND_PER_CLICK);
    const [finding, setFinding] = React.useState(false);
    const findPage = async () => {
        setFinding(true);
        const results = await Promise.allSettled(unsearched.map((r) => supplierApi.retryImageDiscovery(r.id)));
        setFinding(false);
        toast.success(t('imageDiscovery', 'findPageDone', { count: results.filter((r) => r.status === 'fulfilled').length }));
        load();
    };
    const chosen = rows.filter((r) => selected.has(r.id));
    const submittable = chosen.filter((r) => ['DRAFT', 'NEEDS_CHANGES'].includes(r.status) && r.missing.length === 0);

    const removeOne = async (p: SupplierProduct) => {
        if (!(await confirm({ title: tc('deleteOneTitle', { name: p.name }), body: tc('deleteOneBody'), confirm: tc('deleteProduct'), tone: 'danger' }))) return;
        try { await supplierApi.remove(p.id); toast.success(tc('toastProductDeleted')); load(); } catch (e: any) { toast.error(e.message); }
    };
    const removeSelected = async () => {
        if (!(await confirm({ title: tc('deleteManyTitle', { count: chosen.length }), body: tc('deleteManyBody'), confirm: tc('delete'), tone: 'danger' }))) return;
        setBusy(true);
        try { const r = await supplierApi.removeMany(chosen.map((c) => c.id)); toast.success(tc('toastDeletedCount', { count: r.count })); load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    const submitSelected = async () => {
        setBusy(true);
        const results = await Promise.allSettled(submittable.map((p) => supplierApi.resend(p.id)));
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - ok;
        failed ? toast.error(tc('toastSubmitPartial', { ok, failed })) : toast.success(tc('toastSubmitted', { count: ok }));
        setBusy(false); load();
    };

    const s = data?.summary;
    const needsWork = s ? (s.byStatus.DRAFT || 0) + (s.byStatus.NEEDS_CHANGES || 0) : undefined;

    return (
        <div data-no-translate>
            <PageHeader title={tc('inventoryAndProducts')} description={tc('productsPageDesc')}
                actions={<>
                    <Button icon={<RefreshCw size={15} />} onClick={() => setUpdateOpen(true)}>{tc('updatePricesStock')}</Button>
                    <Link href="/supplier/products/import"><Button icon={<Upload size={15} />}>{tc('bulkUpload')}</Button></Link>
                    <Link href="/supplier/products/new"><Button variant="primary" icon={<Plus size={15} />}>{tc('addProduct')}</Button></Link>
                </>} />

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
                <Stat label={tc('statTotalProducts')} value={int(s?.total)} icon={<Package size={17} />} loading={!data && loading} />
                <Stat label={tc('tabLive')} value={int(s?.byStatus.APPROVED)} icon={<CheckCircle2 size={17} />} tone="success" loading={!data && loading} hint={s?.outOfStock ? tc('statOutOfStock', { count: s.outOfStock }) : undefined} />
                <Stat label={tc('tabInReview')} value={int(s?.byStatus.PENDING)} icon={<Clock3 size={17} />} tone="warning" loading={!data && loading} hint={needsWork ? tc('statNeedInput', { count: needsWork }) : undefined} />
                <Stat label={tc('statCategories')} value={int(s?.categories)} icon={<Tags size={17} />} loading={!data && loading} />
            </div>

            <Card bodyClassName="p-0">
                {/* Filters */}
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-line">
                    <div role="tablist" aria-label={tc('status')} className="flex gap-1 overflow-x-auto -mx-1 px-1">
                        {STATUS_TABS.map((tab) => {
                            const n = tab.id ? s?.byStatus[tab.id] : s?.total;
                            return (
                                <button key={tab.id || 'all'} role="tab" aria-selected={status === tab.id} onClick={() => setStatus(tab.id)}
                                    className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                        status === tab.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                                    {tc(tab.label)}{n !== undefined && <span className={cn('ms-1.5 tabular-nums', status === tab.id ? 'text-white/70' : 'text-ink-4')}>{fmt.number(n)}</span>}
                                </button>
                            );
                        })}
                        <span className="w-px bg-line mx-1 shrink-0" aria-hidden />
                        <button type="button" aria-pressed={attention === 'images'} aria-label={t('imageDiscovery', 'filterImageNeededAria')} onClick={() => setAttention((a) => (a ? '' : 'images'))}
                            className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                attention === 'images' ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' : 'text-ink-2 hover:bg-surface-2')}>
                            <ImageIcon size={14} aria-hidden />{t('imageDiscovery', 'filterImageNeeded')}{s?.imageNeeded !== undefined && <span className="tabular-nums text-ink-4">{fmt.number(s.imageNeeded)}</span>}
                        </button>
                        {attention === 'images' && unsearched.length > 0 && <Button size="sm" variant="secondary" icon={<ScanBarcode size={13} />} loading={finding} onClick={findPage}>{t('imageDiscovery', 'findPageBtn')}</Button>}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_160px_190px]">
                        <label className="relative">
                            <span className="sr-only">{tc('searchProducts')}</span>
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tc('searchProductsPlaceholder')} className={cn(inputCls, 'ps-9')} />
                        </label>
                        <select aria-label={tc('category')} value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                            <option value="">{tc('allCategories')}</option>
                            {(data?.categories ?? []).map((c) => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
                        </select>
                        <select aria-label={tc('stock')} value={stock} onChange={(e) => setStock(e.target.value)} className={selectCls}>
                            <option value="">{tc('anyStock')}</option>
                            <option value="out">{tc('outOfStock')}</option>
                        </select>
                        <select aria-label={tc('sort')} value={sort} onChange={(e) => setSort(e.target.value)} className={selectCls}>
                            {SORTS.map((o) => <option key={o.id} value={o.id}>{tc(o.label)}</option>)}
                        </select>
                    </div>
                </div>

                {selected.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-teal-soft border-b border-line text-[13px]">
                        <span className="font-medium text-heading">{tc('selectedCount', { count: selected.size })}</span>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{tc('clear')}</Button>
                        <span className="flex-1" />
                        {submittable.length > 0 && <Button size="sm" variant="secondary" icon={<Send size={13} />} loading={busy} onClick={submitSelected}>{tc('submitNForReview', { count: submittable.length })}</Button>}
                        <Button size="sm" variant="danger" icon={<Trash2 size={13} />} loading={busy} onClick={removeSelected}>{tc('delete')}</Button>
                    </div>
                )}

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}

                {/* Table (md+) / cards (mobile) */}
                {loading && !data ? (
                    <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : rows.length === 0 && !error ? (
                    data?.summary.total ? (
                        <EmptyState icon={<Search size={20} />} title={tc('noMatchTitle')} action={<Button onClick={() => { setQ(''); setStatus(''); setCategory(''); setStock(''); setAttention(''); }}>{tc('clearFilters')}</Button>}>{tc('noMatchBody')}</EmptyState>
                    ) : (
                        <EmptyState icon={<Boxes size={20} />} title={tc('emptyTitle')}
                            action={<><Link href="/supplier/products/import"><Button icon={<Upload size={15} />}>{tc('bulkUpload')}</Button></Link><Link href="/supplier/products/new"><Button variant="primary" icon={<Plus size={15} />}>{tc('addProduct')}</Button></Link></>}>
                            {tc('emptyBody')}
                        </EmptyState>
                    )
                ) : (
                    <>
                        <div className="hidden md:block overflow-x-auto">
                            <table className={cn('w-full text-[13.5px]', loading && 'opacity-60')}>
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                        <th className="w-10 ps-4 py-2"><input type="checkbox" aria-label={tc('selectAllOnPage')} checked={allOnPage} onChange={toggleAll} className="w-4 h-4 accent-[#0E7C74]" /></th>
                                        <th className="text-start font-medium px-2 py-2">{tc('colProduct')}</th>
                                        <th className="text-start font-medium px-2 py-2 hidden xl:table-cell">{tc('category')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tc('status')}</th>
                                        <th className="text-end font-medium px-2 py-2">{tc('colPricePerCase')}</th>
                                        <th className="text-end font-medium px-2 py-2">{tc('colStockCases')}</th>
                                        <th className="text-start font-medium px-2 py-2 hidden lg:table-cell">{tc('colBarcode')}</th>
                                        <th className="text-end font-medium pe-4 py-2"><span className="sr-only">{tc('actions')}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((p) => (
                                        <tr key={p.id} className={cn('border-b border-line last:border-0 hover:bg-surface-2/40', selected.has(p.id) && 'bg-teal-soft/50')}>
                                            <td className="ps-4 py-2.5"><input type="checkbox" aria-label={tc('selectName', { name: p.name })} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-[#0E7C74]" /></td>
                                            <td className="px-2 py-2.5 max-w-[360px]">
                                                <Link href={`/supplier/products/${p.id}/edit`} className="flex items-center gap-3 min-w-0 group">
                                                    <Thumb src={p.images?.[0]} size={40} />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-ink group-hover:underline">{p.name}</span>
                                                        <span className="block truncate text-[12px] text-ink-3">{p.brand || tc('noBrand')}{p.weight ? ` · ${p.weight}` : ''}{p.unitsPerCase ? ` · ${tc('perCaseCount', { count: p.unitsPerCase })}` : ''}</span>
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="px-2 py-2.5 hidden xl:table-cell text-ink-2 max-w-[160px] truncate">{categoryLabel(p.category, t)}</td>
                                            <td className="px-2 py-2.5">
                                                <div className="flex flex-col items-start gap-1" title={p.statusNote}>
                                                    {status_(p.status)}
                                                    {p.missing.length > 0 && <span className="inline-flex items-center gap-1 text-[12px] text-amber-800"><AlertCircle size={12} />{tc('missingCount', { count: p.missing.length })}</span>}
                                                    <ImageDiscoveryBadge product={p} onAccepted={load} />
                                                </div>
                                            </td>
                                            <td className="px-2 py-2.5 text-end tabular-nums">{p.price && p.price > 0 ? money(p.price) : <span className="text-ink-4">—</span>}</td>
                                            <td className="px-2 py-2.5 text-end tabular-nums">
                                                <span className={cn('font-medium', p.stock <= 0 && 'text-red-700')}>{int(p.stock)}</span>
                                                {!!p.reserved && <span className="block text-[12px] text-ink-3">{tc('reservedCount', { count: p.reserved })}</span>}
                                            </td>
                                            <td className="px-2 py-2.5 hidden lg:table-cell font-mono text-[12.5px] text-ink-2">{p.ean || <span className="font-sans text-amber-800">{tc('missing')}</span>}</td>
                                            <td className="pe-4 py-2.5">
                                                <div className="flex justify-end gap-1">
                                                    {p.status === 'APPROVED' && <button type="button" onClick={() => setAdjust(p)} aria-label={tc('adjustStockOf', { name: p.name })} title={tc('adjustStock')} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><SlidersHorizontal size={15} /></button>}
                                                    <Link href={`/supplier/products/${p.id}/edit#media`} aria-label={tc('photosOf', { name: p.name })} title={tc('photosTitle')} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><ImageIcon size={15} /></Link>
                                                    <Link href={`/supplier/products/${p.id}/edit`} title={tc('edit')} aria-label={tc('editName', { name: p.name })} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Pencil size={15} /></Link>
                                                    <button type="button" onClick={() => removeOne(p)} aria-label={tc('deleteName', { name: p.name })} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Trash2 size={15} /></button>
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
                                    <input type="checkbox" aria-label={tc('selectName', { name: p.name })} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="mt-3 w-4 h-4 accent-[#0E7C74]" />
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                    <Link href={`/supplier/products/${p.id}/edit`} className="flex gap-3 min-w-0">
                                        <Thumb src={p.images?.[0]} size={48} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-medium text-ink truncate">{p.name}</span>
                                            <span className="block text-[12px] text-ink-3 truncate">{p.brand || tc('noBrand')} · {p.ean ? <bdi dir="ltr">{p.ean}</bdi> : tc('noBarcode')}</span>
                                            <span className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                                                {status_(p.status)}
                                                <span className="tabular-nums">{p.price && p.price > 0 ? tc('pricePerCaseValue', { price: money(p.price) }) : tc('noPrice')}</span>
                                                <span className={cn('tabular-nums', p.stock <= 0 && 'text-red-700')}>{tc('casesCount', { count: p.stock })}</span>
                                            </span>
                                        </span>
                                    </Link>
                                    <div className="ps-14"><ImageDiscoveryBadge product={p} onAccepted={load} /></div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {data && data.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line text-[13px] text-ink-3">
                        <span>{tc('rangeOf', { from: fmt.number((data.page - 1) * data.limit + 1), to: fmt.number(Math.min(data.page * data.limit, data.total)), total: int(data.total) })}</span>
                        <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} className="rtl:rotate-180" />} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>{tc('previous')}</Button>
                            <span className="px-2 tabular-nums">{tc('pageOf', { page: fmt.number(data.page), pages: fmt.number(data.pages) })}</span>
                            <Button size="sm" variant="ghost" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>{tc('next')} <ChevronRight size={15} className="rtl:rotate-180" /></Button>
                        </div>
                    </div>
                )}
            </Card>

            <p className="mt-3 text-[12.5px] text-ink-3"><Trans text={tc('productsFootnote')} tags={{ link: (c) => <Link href="/supplier/inventory" className="text-teal hover:underline">{c}</Link> }} /></p>

            <PriceStockUpdateDialog open={updateOpen} onClose={() => { setUpdateOpen(false); load(); }} />
            <StockAdjustDialog product={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); load(); }} />
        </div>
    );
}
