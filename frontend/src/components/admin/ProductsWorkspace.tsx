'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Boxes, CheckCircle2, ChevronLeft, ChevronRight, Euro, Eye, FileWarning, Image as ImageIcon, MessageSquare, Pencil, Plus, RefreshCw, Search, Trash2, Upload, XCircle } from 'lucide-react';
import UpdatePriceDialog from '@/components/admin/UpdatePriceDialog';
import BulkActionDialog from '@/components/admin/BulkActionDialog';
import { useAuth } from '@/lib/auth';
import PriceStockUpdateDialog from '@/components/supplier/PriceStockUpdateDialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { adminApi, type AdminProductPage, type AdminProductRow, type BulkAction, type CatalogScope } from '@/lib/admin-api';
import { Badge, Button, Card, ConfirmProvider, EmptyState, ErrorState, PRODUCT_STATUS, PageHeader, Skeleton, Thumb, inputCls, selectCls } from '@/components/supplier/ui';
import { categoryLabel, statusLabel } from '@/components/supplier/import/types';

/**
 * Admin → Products → Atlantis Catalog (/admin/products/catalog) or Supplier
 * Submissions (/admin/products/submissions). One workspace, a fixed scope per
 * route, never mixed: Atlantis Catalog = products owned by staff accounts,
 * Supplier Submissions = everything suppliers created. Counts, facets and pages
 * come from GET /products/admin/list (backend/src/products/catalog-scope.ts).
 * Supplier submissions are reviewed here, never edited (server-enforced).
 */
const STATUS_TABS = [
    { id: '', key: 'stAll' }, { id: 'APPROVED', key: 'stLive' }, { id: 'PENDING', key: 'stPending' },
    { id: 'NEEDS_CHANGES', key: 'stChanges' }, { id: 'DRAFT', key: 'stDraft' }, { id: 'REJECTED', key: 'stRejected' },
];
const SORTS = ['newest', 'updated', 'oldest', 'name', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc'];

export default function ProductsWorkspace({ scope }: { scope: CatalogScope }) {
    return <React.Suspense fallback={null}><ConfirmProvider><Workspace scope={scope} /></ConfirmProvider></React.Suspense>;
}

function Workspace({ scope }: { scope: CatalogScope }) {
    const router = useRouter();
    const params = useSearchParams();
    const { user } = useAuth();
    const { t, fmt } = useLanguage();
    const tp = (k: string, v?: Record<string, string | number>) => t('adminProducts', k, v);
    const eur = (n: number | null | undefined) => (n === null || n === undefined || !(Number(n) > 0) ? null : fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n));

    const [q, setQ] = React.useState(params.get('q') || '');
    const [debouncedQ, setDebouncedQ] = React.useState(q);
    const [status, setStatus] = React.useState(params.get('status') || '');
    const [category, setCategory] = React.useState(params.get('category') || '');
    const [brand, setBrand] = React.useState(params.get('brand') || '');
    const [supplier, setSupplier] = React.useState(params.get('supplier') || '');
    const [attention, setAttention] = React.useState(['missing', 'images'].includes(params.get('attention') || '') ? (params.get('attention') as string) : '');
    const [sort, setSort] = React.useState(params.get('sort') || 'newest');
    const [page, setPage] = React.useState(Number(params.get('page')) || 1);
    const [data, setData] = React.useState<AdminProductPage | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [priceFor, setPriceFor] = React.useState<AdminProductRow | null>(null);
    const [bulkPriceOpen, setBulkPriceOpen] = React.useState(false);

    React.useEffect(() => { const h = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(h); }, [q]);
    React.useEffect(() => { setPage(1); }, [debouncedQ, status, category, brand, supplier, sort, attention, scope]);
    React.useEffect(() => {
        const u = new URLSearchParams();
        if (debouncedQ) u.set('q', debouncedQ); if (status) u.set('status', status); if (category) u.set('category', category); if (brand) u.set('brand', brand);
        if (supplier) u.set('supplier', supplier); if (attention) u.set('attention', attention); if (sort !== 'newest') u.set('sort', sort); if (page > 1) u.set('page', String(page));
        const base = `/admin/products/${scope}`;
        router.replace(u.toString() ? `${base}?${u}` : base, { scroll: false });
    }, [scope, debouncedQ, status, category, brand, supplier, attention, sort, page, router]);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        adminApi.products(scope, { q: debouncedQ, status, category, brand, supplier: scope === 'submissions' ? supplier : '', attention, sort, page, limit: 25 })
            .then((d) => { setData(d); setSelected(new Set()); })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [scope, debouncedQ, status, category, brand, supplier, attention, sort, page]);
    React.useEffect(() => { load(); }, [load]);

    const clearFilters = () => { setQ(''); setStatus(''); setCategory(''); setBrand(''); setSupplier(''); setAttention(''); };

    const rows = data?.data ?? [];
    const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
    const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const chosen = rows.filter((r) => selected.has(r.id));
    const [bulkAction, setBulkAction] = React.useState<BulkAction | null>(null);
    const canDelete = ['OWNER', 'ADMIN'].includes(String(user?.role || '').toUpperCase());
    const bulkButtons: { action: BulkAction; key: string; icon: React.ReactNode; variant?: 'primary' | 'danger' }[] = scope === 'catalog'
        ? [{ action: 'approve', key: 'bulkBtn_publish', icon: <CheckCircle2 size={13} />, variant: 'primary' }, ...(canDelete ? [{ action: 'delete' as const, key: 'bulkBtn_delete', icon: <Trash2 size={13} />, variant: 'danger' as const }] : [])]
        : [{ action: 'approve', key: 'bulkBtn_approve', icon: <CheckCircle2 size={13} />, variant: 'primary' }, { action: 'changes', key: 'bulkBtn_changes', icon: <MessageSquare size={13} /> }, { action: 'reject', key: 'bulkBtn_reject', icon: <XCircle size={13} />, variant: 'danger' }];

    const c = data?.counts;
    const isCatalog = scope === 'catalog';
    const statusBadge = (st: string) => <Badge tone={PRODUCT_STATUS[st]?.tone ?? 'neutral'} dot>{statusLabel(st, t)}</Badge>;
    const supplierName = (p: AdminProductRow) => p.supplier?.companyName || p.supplier?.name || '—';

    return (
        <div data-no-translate className="text-start -mt-2">
            <PageHeader eyebrow={tp('title')} title={tp(isCatalog ? 'tabCatalog' : 'tabSubmissions')} description={tp(isCatalog ? 'catalogExplain' : 'submissionsExplain')}
                actions={isCatalog ? <>
                    <Button icon={<RefreshCw size={15} />} onClick={() => setBulkPriceOpen(true)}>{t('supplierCatalog', 'updatePricesStock')}</Button>
                    <Link href="/admin/products/catalog/import"><Button icon={<Upload size={15} />}>{tp('importFile')}</Button></Link>
                    <Link href="/admin/products/new"><Button variant="primary" icon={<Plus size={15} />}>{tp('addCatalogProduct')}</Button></Link>
                </> : (c?.scopes.submissionsPending ? <Badge tone="warning">{tp('pendingBadge', { count: c.scopes.submissionsPending })}</Badge> : undefined)} />

            <Card bodyClassName="p-0">
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-line">
                    <div role="tablist" aria-label={tp('statusAria')} className="flex gap-1 overflow-x-auto -mx-1 px-1">
                        {STATUS_TABS.map((tab) => {
                            const n = tab.id ? c?.byStatus[tab.id] : c?.total;
                            return (
                                <button key={tab.id || 'all'} role="tab" aria-selected={status === tab.id} onClick={() => setStatus(tab.id)}
                                    className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                        status === tab.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                                    {tp(tab.key)}{n !== undefined && <span className={cn('ms-1.5 tabular-nums', status === tab.id ? 'text-white/70' : 'text-ink-4')}>{int(n)}</span>}
                                </button>
                            );
                        })}
                        <span className="w-px bg-line mx-1 shrink-0" aria-hidden />
                        {([['missing', 'attMissing', FileWarning, c?.missingInfo], ['images', 'attImages', ImageIcon, c?.missingImages]] as const).map(([id, key, Icon, n]) => (
                            <button key={id} type="button" aria-pressed={attention === id} onClick={() => setAttention((a) => (a === id ? '' : id))}
                                className={cn('h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                    attention === id ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' : 'text-ink-2 hover:bg-surface-2')}>
                                <Icon size={14} aria-hidden />{tp(key)}{n !== undefined && <span className="tabular-nums text-ink-4">{int(n)}</span>}
                            </button>
                        ))}
                    </div>
                    <div className={cn('grid gap-2 grid-cols-1 sm:grid-cols-2', isCatalog ? 'xl:grid-cols-[minmax(0,1fr)_180px_180px_170px]' : 'xl:grid-cols-[minmax(0,1fr)_170px_170px_190px_170px]')}>
                        <label className="relative sm:col-span-2 xl:col-span-1">
                            <span className="sr-only">{tp('search')}</span>
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tp(isCatalog ? 'searchCatalogPh' : 'searchSubmissionsPh')} className={cn(inputCls, 'ps-9')} />
                        </label>
                        <select aria-label={tp('category')} value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                            <option value="">{tp('allCategories')}</option>
                            {(data?.facets.categories ?? []).map((x) => <option key={x.value} value={x.value}>{categoryLabel(x.value, t)} ({int(x.count)})</option>)}
                        </select>
                        <select aria-label={tp('brand')} value={brand} onChange={(e) => setBrand(e.target.value)} className={selectCls}>
                            <option value="">{tp('allBrands')}</option>
                            {(data?.facets.brands ?? []).map((x) => <option key={x.value} value={x.value}>{x.value} ({int(x.count)})</option>)}
                        </select>
                        {!isCatalog && (
                            <select aria-label={tp('supplier')} value={supplier} onChange={(e) => setSupplier(e.target.value)} className={selectCls}>
                                <option value="">{tp('allSuppliers')}</option>
                                {(data?.facets.suppliers ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} ({int(x.count)})</option>)}
                            </select>
                        )}
                        <select aria-label={tp('sort')} value={sort} onChange={(e) => setSort(e.target.value)} className={selectCls}>
                            {SORTS.map((o) => <option key={o} value={o}>{tp(`sort_${o}`)}</option>)}
                        </select>
                    </div>
                </div>

                {selected.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-teal-soft border-b border-line text-[13px]">
                        <span className="font-medium text-heading">{tp('selectedCount', { count: selected.size })}</span>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{tp('clear')}</Button>
                        <span className="flex-1" />
                        {bulkButtons.map((b) => <Button key={b.action} size="sm" variant={b.variant} icon={b.icon} onClick={() => setBulkAction(b.action)}>{tp(b.key)}</Button>)}
                    </div>
                )}

                {error && <div className="p-4"><ErrorState message={error} onRetry={load} /></div>}

                {loading && !data ? (
                    <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                ) : rows.length === 0 && !error ? (
                    data?.counts.total ? (
                        <EmptyState icon={<Search size={20} />} title={tp('noMatchTitle')} action={<Button onClick={clearFilters}>{tp('clearFilters')}</Button>}>{tp('noMatchBody')}</EmptyState>
                    ) : (
                        <EmptyState icon={<Boxes size={20} />} title={tp(isCatalog ? 'emptyCatalogTitle' : 'emptySubmissionsTitle')}
                            action={isCatalog ? <Link href="/admin/products/new"><Button variant="primary" icon={<Plus size={15} />}>{tp('addCatalogProduct')}</Button></Link> : undefined}>
                            {tp(isCatalog ? 'emptyCatalogBody' : 'emptySubmissionsBody')}
                        </EmptyState>
                    )
                ) : (
                    <>
                        <div className="hidden lg:block overflow-x-auto">
                            <table className={cn('w-full text-[13.5px]', loading && 'opacity-60')}>
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60 border-b border-line">
                                        <th className="w-10 ps-4 py-2"><input type="checkbox" aria-label={tp('selectAllOnPage')} checked={allOnPage} onChange={toggleAll} className="w-4 h-4 accent-[#0E7C74]" /></th>
                                        <th className="text-start font-medium px-2 py-2">{tp('colProduct')}</th>
                                        {!isCatalog && <th className="text-start font-medium px-2 py-2">{tp('colSupplier')}</th>}
                                        <th className="text-start font-medium px-2 py-2 hidden xl:table-cell">{tp('category')}</th>
                                        <th className="text-start font-medium px-2 py-2">{tp('colStatus')}</th>
                                        <th className="text-end font-medium px-2 py-2">{tp('colNet')}</th>
                                        <th className="text-end font-medium px-2 py-2">{tp('colBuyer')}</th>
                                        <th className="text-end font-medium px-2 py-2">{tp('colStock')}</th>
                                        <th className="text-start font-medium px-2 py-2 hidden lg:table-cell">{tp('colUpdated')}</th>
                                        <th className="text-end font-medium pe-4 py-2"><span className="sr-only">{tp('actions')}</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((p) => (
                                        <tr key={p.id} className={cn('border-b border-line last:border-0 hover:bg-surface-2/40', selected.has(p.id) && 'bg-teal-soft/50')}>
                                            <td className="ps-4 py-2.5"><input type="checkbox" aria-label={tp('selectName', { name: p.name })} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-[#0E7C74]" /></td>
                                            <td className="px-2 py-2.5 max-w-[340px]">
                                                <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 min-w-0 group">
                                                    <Thumb src={p.image} size={40} />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-ink group-hover:underline">{p.name}</span>
                                                        <span className="block truncate text-[12px] text-ink-3">{p.brand || tp('noBrand')}{p.weight ? ` · ${p.weight}` : ''}{p.ean ? <> · <bdi dir="ltr" className="font-mono text-[11.5px]">{p.ean}</bdi></> : <> · <span className="text-amber-800">{tp('noBarcode')}</span></>}</span>
                                                    </span>
                                                </Link>
                                            </td>
                                            {!isCatalog && <td className="px-2 py-2.5 max-w-[180px]"><span className="block truncate text-ink-2">{supplierName(p)}</span><span className="block truncate text-[12px] text-ink-4">{p.supplier?.email}</span></td>}
                                            <td className="px-2 py-2.5 hidden xl:table-cell text-ink-2 max-w-[150px] truncate">{categoryLabel(p.category, t)}</td>
                                            <td className="px-2 py-2.5">
                                                <div className="flex flex-col items-start gap-1">
                                                    {statusBadge(p.status)}
                                                    {p.missing.length > 0 && <span className="inline-flex items-center gap-1 text-[12px] text-amber-800" title={p.missing.join(', ')}><AlertCircle size={12} />{tp('missingCount', { count: p.missing.length })}</span>}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2.5 text-end tabular-nums">{eur(p.basePrice) ?? <span className="text-ink-4">—</span>}</td>
                                            <td className="px-2 py-2.5 text-end tabular-nums">{eur(p.price) ?? <span className="text-ink-4">—</span>}</td>
                                            <td className={cn('px-2 py-2.5 text-end tabular-nums', p.status === 'APPROVED' && p.stock <= 0 && 'text-red-700 font-medium')}>{int(p.stock)}</td>
                                            <td className="px-2 py-2.5 hidden lg:table-cell text-[12.5px] text-ink-3 whitespace-nowrap">{fmt.date(p.updatedAt)}</td>
                                            <td className="pe-4 py-2.5">
                                                <div className="flex justify-end gap-1">
                                                    <Link href={`/admin/products/${p.id}`} title={tp('review')} aria-label={tp('reviewName', { name: p.name })} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Eye size={15} /></Link>
                                                    {isCatalog && p.status !== 'REJECTED' && <button type="button" onClick={() => setPriceFor(p)} title={tp('updatePrice')} aria-label={tp('updatePriceOf', { name: p.name })} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Euro size={15} /></button>}
                                                    {isCatalog && <Link href={`/admin/products/${p.id}/edit`} title={tp('edit')} aria-label={tp('editName', { name: p.name })} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Pencil size={15} /></Link>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <ul className="lg:hidden divide-y divide-line">
                            {rows.map((p) => (
                                <li key={p.id} className="flex gap-3 p-3">
                                    <input type="checkbox" aria-label={tp('selectName', { name: p.name })} checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="mt-3 w-4 h-4 accent-[#0E7C74]" />
                                    <Link href={`/admin/products/${p.id}`} className="flex gap-3 min-w-0 flex-1">
                                        <Thumb src={p.image} size={48} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-medium text-ink truncate">{p.name}</span>
                                            <span className="block text-[12px] text-ink-3 truncate">{p.brand || tp('noBrand')}{!isCatalog && ` · ${supplierName(p)}`}</span>
                                            <span className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                                                {statusBadge(p.status)}
                                                {p.missing.length > 0 && <span className="text-amber-800">{tp('missingCount', { count: p.missing.length })}</span>}
                                                <span className="tabular-nums text-ink-2">{eur(p.basePrice) ?? '—'}</span>
                                            </span>
                                        </span>
                                    </Link>
                                    {isCatalog && p.status !== 'REJECTED' && <button type="button" onClick={() => setPriceFor(p)} aria-label={tp('updatePriceOf', { name: p.name })} className="self-center w-9 h-9 shrink-0 rounded-lg ring-1 ring-line flex items-center justify-center text-ink-2 hover:bg-surface-2"><Euro size={15} /></button>}
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {data && data.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-line text-[13px] text-ink-3">
                        <span>{tp('rangeOf', { from: int((data.page - 1) * data.limit + 1), to: int(Math.min(data.page * data.limit, data.total)), total: int(data.total) })}</span>
                        <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} className="rtl:rotate-180" />} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>{tp('previous')}</Button>
                            <span className="px-2 tabular-nums">{tp('pageOf', { page: int(data.page), pages: int(data.pages) })}</span>
                            <Button size="sm" variant="ghost" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>{tp('next')} <ChevronRight size={15} className="rtl:rotate-180" /></Button>
                        </div>
                    </div>
                )}
            </Card>

            <BulkActionDialog action={bulkAction} scope={scope} rows={chosen} onClose={() => setBulkAction(null)} onDone={load} />
            <UpdatePriceDialog product={priceFor} onClose={() => setPriceFor(null)} onSaved={() => { setPriceFor(null); load(); }} />
            {isCatalog && <PriceStockUpdateDialog target="catalog" open={bulkPriceOpen} onClose={() => { setBulkPriceOpen(false); load(); }} />}
        </div>
    );
}
