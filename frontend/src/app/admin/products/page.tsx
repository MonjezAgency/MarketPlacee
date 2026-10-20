'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { AlertCircle, Boxes, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileWarning, Image as ImageIcon, Pencil, Plus, Search, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { adminApi, type AdminProductPage, type AdminProductRow, type CatalogScope } from '@/lib/admin-api';
import { apiFetch } from '@/lib/api';
import { Badge, Button, Card, ConfirmProvider, Dialog, EmptyState, ErrorState, Field, Notice, PRODUCT_STATUS, PageHeader, Skeleton, Thumb, inputCls, selectCls, useConfirm } from '@/components/supplier/ui';
import { categoryLabel, statusLabel } from '@/components/supplier/import/types';

/**
 * Admin → Products. Two datasets, never mixed: Atlantis Catalog (products owned
 * by staff accounts) and Supplier Submissions (everything suppliers created).
 * The split, counts, filters and pages come from GET /products/admin/list
 * (backend/src/products/catalog-scope.ts); this page only shows them.
 */
const STATUS_TABS = [
    { id: '', key: 'stAll' }, { id: 'APPROVED', key: 'stLive' }, { id: 'PENDING', key: 'stPending' },
    { id: 'NEEDS_CHANGES', key: 'stChanges' }, { id: 'DRAFT', key: 'stDraft' }, { id: 'REJECTED', key: 'stRejected' },
];
const SORTS = ['newest', 'updated', 'oldest', 'name', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc'];

export default function AdminProductsPage() {
    return <React.Suspense fallback={null}><ConfirmProvider><ProductsWorkspace /></ConfirmProvider></React.Suspense>;
}

function ProductsWorkspace() {
    const router = useRouter();
    const params = useSearchParams();
    const confirm = useConfirm();
    const { t, fmt } = useLanguage();
    const tp = (k: string, v?: Record<string, string | number>) => t('adminProducts', k, v);
    const eur = (n: number | null | undefined) => (n === null || n === undefined || !(Number(n) > 0) ? null : fmt.number(Number(n), { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n));

    const scope: CatalogScope = params.get('tab') === 'catalog' ? 'catalog' : 'submissions';
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
    const [busy, setBusy] = React.useState(false);
    const [rejectOpen, setRejectOpen] = React.useState(false);
    const [rejectReason, setRejectReason] = React.useState('');
    const [importOpen, setImportOpen] = React.useState(false);

    React.useEffect(() => { const h = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(h); }, [q]);
    React.useEffect(() => { setPage(1); }, [debouncedQ, status, category, brand, supplier, sort, attention, scope]);
    React.useEffect(() => {
        const u = new URLSearchParams();
        u.set('tab', scope);
        if (debouncedQ) u.set('q', debouncedQ); if (status) u.set('status', status); if (category) u.set('category', category); if (brand) u.set('brand', brand);
        if (supplier) u.set('supplier', supplier); if (attention) u.set('attention', attention); if (sort !== 'newest') u.set('sort', sort); if (page > 1) u.set('page', String(page));
        router.replace(`/admin/products?${u}`, { scroll: false });
    }, [scope, debouncedQ, status, category, brand, supplier, attention, sort, page, router]);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        adminApi.products(scope, { q: debouncedQ, status, category, brand, supplier: scope === 'submissions' ? supplier : '', attention, sort, page, limit: 25 })
            .then((d) => { setData(d); setSelected(new Set()); })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [scope, debouncedQ, status, category, brand, supplier, attention, sort, page]);
    React.useEffect(() => { load(); }, [load]);

    const switchTab = (tab: CatalogScope) => { if (tab !== scope) { setStatus(''); setCategory(''); setBrand(''); setSupplier(''); setAttention(''); setQ(''); router.replace(`/admin/products?tab=${tab}`, { scroll: false }); } };
    const clearFilters = () => { setQ(''); setStatus(''); setCategory(''); setBrand(''); setSupplier(''); setAttention(''); };

    const rows = data?.data ?? [];
    const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
    const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const chosen = rows.filter((r) => selected.has(r.id));
    const approvable = chosen.filter((r) => r.status !== 'APPROVED' && r.status !== 'REJECTED' && r.missing.length === 0);
    const rejectable = chosen.filter((r) => r.status !== 'REJECTED');

    const approveSelected = async () => {
        if (!(await confirm({ title: tp('bulkApproveTitle', { count: approvable.length }), body: tp(scope === 'catalog' ? 'bulkPublishBody' : 'bulkApproveBody'), confirm: tp(scope === 'catalog' ? 'publish' : 'approve') }))) return;
        setBusy(true);
        try {
            const r = await adminApi.bulkApprove(approvable.map((p) => p.id));
            toast.success(tp('toastApproved', { count: r.count }));
            if (r.skipped?.length) toast(tp('toastSkipped', { count: r.skipped.length }));
            load();
        } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    const rejectSelected = async () => {
        const reason = rejectReason.trim();
        if (reason.length < 10) { toast.error(tp('reasonTooShort')); return; }
        setBusy(true);
        try { await adminApi.bulkReject(rejectable.map((p) => p.id), reason); toast.success(tp('toastRejected', { count: rejectable.length })); setRejectOpen(false); setRejectReason(''); load(); }
        catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };

    const c = data?.counts;
    const isCatalog = scope === 'catalog';
    const statusBadge = (st: string) => <Badge tone={PRODUCT_STATUS[st]?.tone ?? 'neutral'} dot>{statusLabel(st, t)}</Badge>;
    const supplierName = (p: AdminProductRow) => p.supplier?.companyName || p.supplier?.name || '—';

    return (
        <div data-no-translate className="text-start -mt-2">
            <PageHeader title={tp('title')} description={tp('desc')}
                actions={isCatalog ? <>
                    <Button icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>{tp('importFile')}</Button>
                    <Link href="/admin/products/new"><Button variant="primary" icon={<Plus size={15} />}>{tp('addCatalogProduct')}</Button></Link>
                </> : undefined} />

            {/* Scope tabs */}
            <div role="tablist" aria-label={tp('scopeAria')} className="mb-4 flex gap-1 border-b border-line">
                {(['catalog', 'submissions'] as CatalogScope[]).map((tab) => {
                    const n = tab === 'catalog' ? c?.scopes.catalog : c?.scopes.submissions;
                    const pending = tab === 'submissions' ? c?.scopes.submissionsPending : 0;
                    return (
                        <button key={tab} role="tab" aria-selected={scope === tab} onClick={() => switchTab(tab)}
                            className={cn('relative -mb-px h-10 px-3 text-[13.5px] font-medium inline-flex items-center gap-2 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded-t-md',
                                scope === tab ? 'border-heading text-heading' : 'border-transparent text-ink-3 hover:text-ink')}>
                            {tp(tab === 'catalog' ? 'tabCatalog' : 'tabSubmissions')}
                            {n !== undefined && <span className="tabular-nums text-[12px] text-ink-4">{int(n)}</span>}
                            {!!pending && <Badge tone="warning">{tp('pendingBadge', { count: pending })}</Badge>}
                        </button>
                    );
                })}
            </div>
            <p className="mb-3 text-[13px] text-ink-3 max-w-[90ch]">{tp(isCatalog ? 'catalogExplain' : 'submissionsExplain')}</p>

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
                    <div className={cn('grid gap-2', isCatalog ? 'sm:grid-cols-[minmax(0,1fr)_180px_180px_170px]' : 'sm:grid-cols-[minmax(0,1fr)_170px_170px_190px_170px]')}>
                        <label className="relative">
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
                        {approvable.length > 0 && <Button size="sm" variant="primary" icon={<CheckCircle2 size={13} />} loading={busy} onClick={approveSelected}>{tp(isCatalog ? 'publishN' : 'approveN', { count: approvable.length })}</Button>}
                        {rejectable.length > 0 && !isCatalog && <Button size="sm" variant="danger" icon={<XCircle size={13} />} disabled={busy} onClick={() => setRejectOpen(true)}>{tp('rejectN', { count: rejectable.length })}</Button>}
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
                        <div className="hidden md:block overflow-x-auto">
                            <table className={cn('w-full text-[13.5px] min-w-[880px]', loading && 'opacity-60')}>
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
                                                    <Link href={`/admin/products/${p.id}/edit`} title={tp('edit')} aria-label={tp('editName', { name: p.name })} className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><Pencil size={15} /></Link>
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

            <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title={tp('rejectDialogTitle', { count: rejectable.length })} description={tp('rejectDialogDesc')} size="sm"
                footer={<><Button onClick={() => setRejectOpen(false)}>{tp('cancel')}</Button><Button variant="danger" loading={busy} onClick={rejectSelected}>{tp('rejectN', { count: rejectable.length })}</Button></>}>
                <Field label={tp('reasonLabel')} htmlFor="bulk-reject-reason" required hint={tp('reasonHint')}>
                    <textarea id="bulk-reject-reason" data-autofocus value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} className={cn(inputCls, 'h-auto py-2')} />
                </Field>
            </Dialog>

            <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
        </div>
    );
}

/** Admin file import → Atlantis Catalog only (POST /products/bulk-upload attributes rows to the platform account). */
function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
    const { t } = useLanguage();
    const tp = (k: string, v?: Record<string, string | number>) => t('adminProducts', k, v);
    const [file, setFile] = React.useState<File | null>(null);
    const [currency, setCurrency] = React.useState('EUR');
    const [busy, setBusy] = React.useState(false);
    const [result, setResult] = React.useState<{ created: number; failed: number; errors: string[] } | null>(null);
    const close = () => { if (busy) return; setFile(null); setResult(null); onClose(); };
    const run = async () => {
        if (!file) return;
        setBusy(true);
        try {
            const fd = new FormData(); fd.append('file', file); fd.append('currency', currency);
            const res = await apiFetch('/products/bulk-upload', { method: 'POST', body: fd });
            const body = await res.json().catch(() => null);
            if (!res.ok || body?.error) throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
            // Response of POST /products/bulk-upload: { totalRows, successCount, errorCount, createdCount, results: [{ success, errors }] }.
            const created = Number(body?.createdCount ?? 0);
            const errors: string[] = (Array.isArray(body?.results) ? body.results : []).filter((r: any) => !r?.success).flatMap((r: any) => (Array.isArray(r?.errors) ? r.errors : []).map((e: any) => (typeof e === 'string' ? e : e?.message || JSON.stringify(e))));
            setResult({ created, failed: Number(body?.errorCount ?? 0), errors: errors.slice(0, 8) });
            if (created > 0) onDone();
        } catch (e: any) { toast.error(e.message || tp('importFailed')); } finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onClose={close} title={tp('importTitle')} description={tp('importDesc')} size="md" dismissable={!busy}
            footer={result ? <Button variant="primary" onClick={close}>{tp('done')}</Button> : <><Button onClick={close} disabled={busy}>{tp('cancel')}</Button><Button variant="primary" loading={busy} disabled={!file} onClick={run}>{tp('importRun')}</Button></>}>
            {result ? (
                <div className="space-y-3 text-[13.5px]">
                    <Notice tone={result.created > 0 ? 'success' : 'warning'} title={tp('importResult', { created: result.created, failed: result.failed })} />
                    {result.errors.length > 0 && <ul className="list-disc ps-5 text-ink-2 space-y-0.5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                </div>
            ) : (
                <div className="space-y-4">
                    <Notice tone="info" title={tp('importDestination')}>{tp('importBehaviour')}</Notice>
                    <Field label={tp('importFileLabel')} htmlFor="admin-import-file" required hint={tp('importFileHint')}>
                        <input id="admin-import-file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-[13.5px] text-ink-2 file:me-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-surface-2 file:text-ink file:font-medium" />
                    </Field>
                    <Field label={tp('importCurrency')} htmlFor="admin-import-currency" hint={tp('importCurrencyHint')}>
                        <select id="admin-import-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectCls}>
                            {['EUR', 'USD', 'GBP', 'RON', 'EGP', 'AED', 'SAR', 'TRY'].map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </Field>
                </div>
            )}
        </Dialog>
    );
}
