'use client';

import * as React from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Images, Loader2, RefreshCw, ScanBarcode, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { canDo } from '@/lib/admin-access';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { adminPhotosApi, PHOTO_BUCKETS, type DiscoveryCandidate, type PhotoBucket, type PhotoList, type PhotoRow, type PhotoScope } from '@/lib/admin-photos-api';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Notice, PageHeader, Skeleton, Thumb, inputCls } from '@/components/supplier/ui';
import PhotoCandidateCard from '@/components/supplier/PhotoCandidateCard';
import { useDiscoveryReason } from '@/components/supplier/ImageDiscoveryPanel';

/**
 * Admin → Products → Product photos (/admin/products/photos): products that
 * need a photo, or have photos found by barcode waiting for review, grouped by
 * the reason. Ali FMCG Catalog products can be searched again and — by an
 * owner or admin — given the photos found. Supplier products are listed for
 * their status only: the supplier chooses their own photos (server-enforced).
 */
const TONE: Record<PhotoBucket, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
    review: 'success', no_clean_background: 'info', searching: 'info', not_searched: 'neutral', no_barcode: 'warning', invalid_barcode: 'danger',
    not_in_database: 'warning', mismatch: 'danger', no_photo: 'warning', unavailable: 'danger', dismissed: 'neutral',
};

export default function ProductPhotosWorkspace() {
    const { user } = useAuth();
    const { t, fmt } = useLanguage();
    const tp = (k: string, v?: Record<string, string | number>) => t('productPhotos', k, v);
    const reason = useDiscoveryReason();
    const canApply = canDo(user?.role, 'applyCatalogPhotos');

    const [scope, setScope] = React.useState<PhotoScope>('catalog');
    const [bucket, setBucket] = React.useState<PhotoBucket | ''>('');
    const [q, setQ] = React.useState('');
    const [debouncedQ, setDebouncedQ] = React.useState('');
    const [page, setPage] = React.useState(1);
    const [data, setData] = React.useState<PhotoList | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [busy, setBusy] = React.useState<string | null>(null);
    const [open, setOpen] = React.useState<PhotoRow | null>(null);

    React.useEffect(() => { const h = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(h); }, [q]);
    React.useEffect(() => { setPage(1); setSelected(new Set()); }, [scope, bucket, debouncedQ]);

    const load = React.useCallback((quiet = false) => {
        if (!quiet) setLoading(true);
        return adminPhotosApi.list({ scope, bucket: bucket || undefined, q: debouncedQ || undefined, page })
            .then((d) => { setData(d); setError(null); })
            .catch((e) => setError(e?.message || String(e)))
            .finally(() => setLoading(false));
    }, [scope, bucket, debouncedQ, page]);
    React.useEffect(() => { load(); }, [load]);

    // While searches run, refresh quietly until they answer.
    const searching = !!data?.items.some((r) => r.bucket === 'searching');
    React.useEffect(() => {
        if (!searching) return;
        const h = setInterval(() => { load(true); }, 6000);
        return () => clearInterval(h);
    }, [searching, load]);

    const rows = data?.items || [];
    const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
    const retryable = (r: PhotoRow) => !!r.ean && r.bucket !== 'invalid_barcode' && r.bucket !== 'no_barcode' && r.bucket !== 'searching' && (scope === 'catalog' || !r.hasPhoto);
    const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    const retry = async (ids: string[]) => {
        setBusy(ids.length === 1 ? `r${ids[0]}` : 'bulk');
        try {
            const r = await adminPhotosApi.retry(ids);
            const recent = r.results.filter((x) => x.outcome === 'answered_recently').length;
            toast.success(tp('toastRetry', { started: fmt.number(r.started), recent: fmt.number(recent) }));
            setSelected(new Set());
            await load(true);
        } catch (e: any) { toast.error(e?.message || String(e)); }
        finally { setBusy(null); }
    };

    const bucketText = (r: PhotoRow) => {
        const d = r.discovery;
        if (r.bucket === 'review' && scope === 'submissions') return tp('waitingSupplier', { count: fmt.number(d?.found || 0) });
        const codes = d?.reasons?.length ? d.reasons : d?.reason ? [d.reason] : [];
        const txt = codes.map(reason).filter(Boolean) as string[];
        return txt[0] || tp(`bucketHelp_${r.bucket}`);
    };

    return (
        <div className="text-start -mt-2">
            <PageHeader eyebrow={t('adminProducts', 'title')} title={tp('title')} description={tp('description')}
                actions={<Link href={scope === 'catalog' ? '/admin/products/catalog' : '/admin/products/submissions'}><Button>{tp(scope === 'catalog' ? 'backCatalog' : 'backSubmissions')}</Button></Link>} />

            <Card bodyClassName="p-0">
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-line">
                    <div role="tablist" aria-label={tp('scopeAria')} className="flex gap-1">
                        {(['catalog', 'submissions'] as PhotoScope[]).map((s) => (
                            <button key={s} role="tab" type="button" aria-selected={scope === s} onClick={() => setScope(s)}
                                className={cn('h-9 px-3 rounded-lg text-[13px] font-medium', scope === s ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2')}>
                                {tp(s === 'catalog' ? 'scopeCatalog' : 'scopeSubmissions')}
                            </button>
                        ))}
                    </div>
                    {scope === 'submissions' && <Notice tone="info">{tp('submissionsNote')}</Notice>}
                    {scope === 'catalog' && !canApply && <Notice tone="info">{tp('readOnlyNote')}</Notice>}
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={tp('bucketAria')}>
                        <button type="button" aria-pressed={bucket === ''} onClick={() => setBucket('')}
                            className={cn('h-8 px-2.5 rounded-full text-[12.5px] ring-1 ring-inset', bucket === '' ? 'bg-teal-soft ring-teal text-ink' : 'ring-line text-ink-2 hover:bg-surface-2')}>
                            {tp('bucketAll')} <span className="tabular-nums text-ink-4">{data ? fmt.number(Object.values(data.counts).reduce((a, b) => a + b, 0)) : ''}</span>
                        </button>
                        {PHOTO_BUCKETS.filter((b) => (data?.counts[b] || 0) > 0 || bucket === b).map((b) => (
                            <button key={b} type="button" aria-pressed={bucket === b} onClick={() => setBucket(bucket === b ? '' : b)}
                                className={cn('h-8 px-2.5 rounded-full text-[12.5px] ring-1 ring-inset', bucket === b ? 'bg-teal-soft ring-teal text-ink' : 'ring-line text-ink-2 hover:bg-surface-2')}>
                                {tp(`bucket_${b}`)} <span className="tabular-nums text-ink-4">{fmt.number(data?.counts[b] || 0)}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[220px] max-w-md">
                            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
                            <label htmlFor="pp-q" className="sr-only">{tp('searchLabel')}</label>
                            <input id="pp-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tp('searchPlaceholder')} className={cn(inputCls, 'h-9 ps-9')} />
                        </div>
                        {selected.size > 0 && (
                            <Button size="sm" icon={<RefreshCw size={13} />} loading={busy === 'bulk'} disabled={!!busy} onClick={() => retry(Array.from(selected))}>{tp('retrySelected', { count: fmt.number(selected.size) })}</Button>
                        )}
                    </div>
                </div>

                {error ? <div className="p-4"><ErrorState message={error} onRetry={() => load()} /></div>
                    : loading && !data ? <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
                        : !rows.length ? <EmptyState icon={<Images size={20} />} title={tp(bucket ? 'emptyBucket' : 'emptyAll')}>{tp('emptyBody')}</EmptyState>
                            : (
                                <ul className="divide-y divide-line">
                                    {rows.map((r) => {
                                        const d = r.discovery;
                                        const found = scope === 'catalog' && d?.status === 'found_review' ? d.candidates : [];
                                        return (
                                            <li key={r.id} className={cn('flex flex-wrap items-center gap-3 px-3 sm:px-4 py-2.5', selected.has(r.id) && 'bg-teal-soft/50')}>
                                                <input type="checkbox" aria-label={tp('selectName', { name: r.name })} disabled={!retryable(r)} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="w-4 h-4 accent-[#0E7C74] disabled:opacity-40" />
                                                <Link href={`/admin/products/${r.id}`} className="flex items-center gap-3 min-w-0 flex-1 group">
                                                    <Thumb src={r.photo || found[0]?.previewUrl || null} size={44} />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-ink group-hover:underline">{r.name}</span>
                                                        <span className="block truncate text-[12px] text-ink-3">{r.brand || tp('noBrand')}{r.ean ? <> · <bdi dir="ltr" className="font-mono text-[11.5px]">{r.ean}</bdi></> : null}{r.supplier ? ` · ${r.supplier}` : ''}</span>
                                                    </span>
                                                </Link>
                                                <div className="min-w-[200px] max-w-[360px] flex-1 space-y-0.5">
                                                    <Badge tone={TONE[r.bucket]}>{r.bucket === 'searching' && <Loader2 size={11} className="animate-spin" aria-hidden />}{tp(`bucket_${r.bucket}`)}</Badge>
                                                    <p className="text-[12px] text-ink-3">{bucketText(r)}</p>
                                                    {d?.checkedAt && <p className="text-[11.5px] text-ink-4">{t('imageDiscovery', 'checkedOn', { date: fmt.date(d.checkedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>}
                                                </div>
                                                <div className="flex gap-1.5 ms-auto">
                                                    {found.length > 0 && <Button size="sm" variant="primary" icon={<Images size={13} />} onClick={() => setOpen(r)}>{tp('reviewPhotos')}</Button>}
                                                    {retryable(r) && <Button size="sm" variant="secondary" icon={<ScanBarcode size={13} />} loading={busy === `r${r.id}`} disabled={!!busy} onClick={() => retry([r.id])}>{t('imageDiscovery', 'retry')}</Button>}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                {data && pages > 1 && (
                    <div className="flex items-center justify-between gap-2 p-3 border-t border-line text-[12.5px] text-ink-3">
                        <span className="tabular-nums">{tp('pageOf', { page: fmt.number(page), pages: fmt.number(pages) })}</span>
                        <div className="flex gap-1">
                            <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} className="rtl:rotate-180" />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{tp('prev')}</Button>
                            <Button size="sm" variant="ghost" icon={<ChevronRight size={14} className="rtl:rotate-180" />} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{tp('next')}</Button>
                        </div>
                    </div>
                )}
            </Card>

            {open && <ReviewDialog row={open} canApply={canApply} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(true); }} />}
        </div>
    );
}

/** The photos found for one Ali FMCG Catalog product: ranked, with why; owner/admin can use or dismiss them. */
function ReviewDialog({ row, canApply, onClose, onChanged }: { row: PhotoRow; canApply: boolean; onClose: () => void; onChanged: () => void }) {
    const { t } = useLanguage();
    const tp = (k: string, v?: Record<string, string | number>) => t('productPhotos', k, v);
    const reason = useDiscoveryReason();
    const [state, setState] = React.useState(row.discovery);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    if (!state) return null;
    const run = async (key: string, fn: () => Promise<void>) => { // i18n-ignore (type, not text)
        setBusy(key); setError(null);
        try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(null); }
    };
    const whiten = (c: DiscoveryCandidate) => run(`w${c.url}`, async () => { const r = await adminPhotosApi.whiten(row.id, c.url); if (r.state) setState(r.state); });
    const use = (c: DiscoveryCandidate, also: string[] = [], clean = false) => run(also.length ? 'all' : clean ? `c${c.url}` : c.url, async () => {
        await adminPhotosApi.accept(row.id, c.url, also, clean);
        toast.success(t('imageDiscovery', 'toastAccepted'));
        onChanged();
    });
    const dismiss = (c: DiscoveryCandidate) => run(`x${c.url}`, async () => {
        const r = await adminPhotosApi.dismiss(row.id, c.url);
        if (!r.state || r.state.status !== 'found_review') { onChanged(); return; }
        setState({ ...state, ...r.state });
    });
    const primary = state.candidates.find((c) => c.role === 'primary');
    const gallery = state.candidates.filter((c) => c.role === 'gallery' && c.confidence === 'verified').map((c) => c.url);
    const why = (state.reasons || []).map(reason).filter(Boolean) as string[];
    return (
        <Dialog open onClose={onClose} size="xl" title={row.name} description={<>{state.mode === 'add' ? tp('dialogAddBody') : t('imageDiscovery', 'foundBody')}{why.map((w) => <span key={w} className="block text-amber-800">{w}</span>)}</>}
            footer={canApply && !row.hasPhoto && primary && primary.confidence === 'verified' && gallery.length > 0
                ? <Button variant="primary" icon={<Images size={14} />} loading={busy === 'all'} disabled={!!busy} onClick={() => use(primary, gallery)}>{tp('useWithGallery')}</Button>
                : undefined}>
            {error && <div className="mb-3"><Notice tone="danger">{error}</Notice></div>}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {state.candidates.map((c) => <PhotoCandidateCard key={c.url} c={c} barcode={state.barcode} busy={busy} canApply={canApply} onUse={(x, clean) => use(x, [], clean)} onDismiss={dismiss} onWhiten={whiten} dismissLabel={tp('notThisProduct')} />)}
            </ul>
            <p className="mt-3 text-[12px] text-ink-3">{t('imageDiscovery', 'licenseNote', { license: state.candidates[0]?.license || 'CC BY-SA 3.0' })}</p>
        </Dialog>
    );
}
