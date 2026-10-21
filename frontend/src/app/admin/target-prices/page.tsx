'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search, Target } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { canDo } from '@/lib/admin-access';
import { formatPrice } from '@/lib/currency';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, EmptyState, ErrorState, Notice, PageHeader, Skeleton, inputCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import TargetDetailDialog, { StageBadge, qtyText } from './TargetDetailDialog';

/** Tabs: stored statuses plus "waiting for buyer" (a counter-offer the buyer hasn't answered). Counts come from the server. */
const TABS = [
    { id: 'OPEN', query: 'status=OPEN' }, { id: 'COUNTER_OFFERED', query: 'stage=COUNTER_OFFERED' }, { id: 'RESPONDED', query: 'status=RESPONDED' },
    { id: 'ACCEPTED', query: 'status=ACCEPTED' }, { id: 'DECLINED', query: 'status=DECLINED' }, { id: 'WITHDRAWN', query: 'status=WITHDRAWN' }, { id: 'ALL', query: '' },
] as const;

/**
 * Admin → Target prices (/admin/target-prices): the Atlantis sourcing desk's queue.
 * Data from GET /target-prices (OWNER/ADMIN/MODERATOR/SUPPORT read); answering is
 * PATCH /target-prices/:id/respond (OWNER/ADMIN). Buyer prices only — no supplier price.
 */
export default function AdminTargetPricesPage() {
    const { t, fmt, meta } = useLanguage();
    const tl = React.useCallback((k: string, v?: Record<string, string | number>) => t('adminTargets', k, v), [t]);
    const money = (n: number | null | undefined) => (n == null ? '—' : formatPrice(n, undefined, meta.intl));
    const { user } = useAuth();
    const mayAnswer = canDo(user?.role, 'answerTargetPrices');

    const [tab, setTab] = React.useState<string>('OPEN');
    const [q, setQ] = React.useState('');
    const [debounced, setDebounced] = React.useState('');
    const [page, setPage] = React.useState(1);
    const [data, setData] = React.useState<any | null>(null);
    const [error, setError] = React.useState<null | 'load' | 'forbidden'>(null);
    const [loading, setLoading] = React.useState(true);
    const [openId, setOpenId] = React.useState<string | null>(null);

    // Opened from a notification (?q=<ref>): show that request whatever its status.
    React.useEffect(() => {
        const ref = new URLSearchParams(window.location.search).get('q');
        if (ref) { setQ(ref.slice(0, 80)); setDebounced(ref.slice(0, 80)); setTab('ALL'); }
    }, []);
    React.useEffect(() => { const h = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(h); }, [q]);
    React.useEffect(() => { setPage(1); }, [tab, debounced]);

    const seq = React.useRef(0);
    const load = React.useCallback(() => {
        const mine = ++seq.current;
        setLoading(true); setError(null);
        const query = TABS.find((x) => x.id === tab)?.query || '';
        apiFetch(`/target-prices?${query}${query ? '&' : ''}q=${encodeURIComponent(debounced)}&page=${page}`, { cache: 'no-store' })
            .then(async (r) => {
                if (r.status === 401 || r.status === 403) throw new Error('forbidden');
                if (!r.ok) throw new Error('load');
                return r.json();
            })
            .then((d) => { if (mine === seq.current) setData(d); })
            .catch((e) => { if (mine === seq.current) setError(e.message === 'forbidden' ? 'forbidden' : 'load'); })
            .finally(() => { if (mine === seq.current) setLoading(false); });
    }, [tab, debounced, page]);
    React.useEffect(() => { load(); }, [load]);

    // A notification link with a single match opens it directly.
    const autoOpened = React.useRef(false);
    React.useEffect(() => {
        if (autoOpened.current || !data?.data) return;
        const ref = new URLSearchParams(window.location.search).get('q');
        if (ref && data.data.length === 1 && data.data[0].ref === ref) { autoOpened.current = true; setOpenId(data.data[0].id); }
    }, [data]);

    const counts = data?.counts || {};
    const rows: any[] = data?.data || [];
    const date = (d: string) => fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric' });

    return (
        <div className="max-w-[1400px] mx-auto text-start" data-no-translate>
            <PageHeader title={tl('title')} description={tl('lead')} />
            {!mayAnswer && <div className="mb-4"><Notice tone="info">{tl('readOnly')}</Notice></div>}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div role="tablist" aria-label={tl('tabsAria')} className="flex flex-wrap gap-1">
                    {TABS.map((x) => (
                        <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
                            className={cn('h-9 px-3 rounded-md text-[13px] font-medium inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal', tab === x.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                            {tl(`tab_${x.id}`)}
                            <span className={cn('tabular-nums text-[12px]', tab === x.id ? 'text-white/80' : 'text-ink-3')}>{counts[x.id] != null ? fmt.number(counts[x.id]) : ''}</span>
                        </button>
                    ))}
                </div>
                <label className="relative lg:ms-auto w-full lg:w-[320px]">
                    <span className="sr-only">{tl('searchLabel')}</span>
                    <Search size={15} aria-hidden className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-4" />
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tl('searchPh')} className={cn(inputCls, 'ps-9 h-9')} />
                </label>
            </div>

            <div className="mt-4">
                {error === 'forbidden' ? <Notice tone="warning">{tl('forbidden')}</Notice>
                    : error ? <ErrorState message={tl('loadError')} onRetry={load} />
                    : !data && loading ? (
                        <div className="rounded-xl ring-1 ring-line bg-surface p-4 space-y-3" aria-busy="true"><span className="sr-only">{tl('loading')}</span>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : !rows.length ? (
                        <div className="rounded-xl ring-1 ring-line bg-surface"><EmptyState icon={<Target size={20} />} title={tl('emptyTitle')}>{tl('emptyText')}</EmptyState></div>
                    ) : (
                        <div className={cn('rounded-xl ring-1 ring-line bg-surface overflow-x-auto', loading && 'opacity-70')} aria-busy={loading}>
                            <table className="w-full min-w-[1080px] text-[13px]">
                                <thead>
                                    <tr className="text-[12px] text-ink-3 bg-surface-2/60">
                                        {['colRef', 'colProduct', 'colBuyer', 'colSupplier', 'colTarget', 'colListed', 'colQty', 'colStatus', 'colUpdated', 'colActions'].map((h) => (
                                            <th key={h} scope="col" className={cn('font-medium px-3 py-2', ['colTarget', 'colListed', 'colQty'].includes(h) ? 'text-end' : 'text-start')}>{h === 'colActions' ? <span className="sr-only">{tl(h)}</span> : tl(h)}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => {
                                        const gap = r.listedCasePrice ? ((r.targetCasePrice - r.listedCasePrice) / r.listedCasePrice) * 100 : null;
                                        return (
                                            <tr key={r.id} className="border-t border-line align-top hover:bg-surface-2/40">
                                                <td className="px-3 py-2.5 whitespace-nowrap"><bdi dir="ltr" className="font-mono text-[12.5px] text-ink">{r.ref}</bdi><span className="block text-[12px] text-ink-3">{date(r.createdAt)}</span></td>
                                                <td className="px-3 py-2.5 max-w-[240px]">
                                                    {r.product ? <Link href={`/admin/products/${r.product.id}`} className="text-ink hover:underline">{r.product.name}</Link> : '—'}
                                                    {r.product?.ean && <bdi dir="ltr" className="block text-[12px] text-ink-3 font-mono">{r.product.ean}</bdi>}
                                                </td>
                                                <td className="px-3 py-2.5 max-w-[200px]">
                                                    {r.buyer ? <Link href={`/admin/users/${r.buyer.id}`} className="text-ink hover:underline">{r.buyer.companyName || r.buyer.name || r.buyer.email}</Link> : '—'}
                                                    {r.buyer?.email && <bdi dir="ltr" className="block text-[12px] text-ink-3 truncate">{r.buyer.email}</bdi>}
                                                </td>
                                                <td className="px-3 py-2.5 max-w-[180px]">{r.supplier ? <Link href={`/admin/users/${r.supplier.id}`} className="text-ink-2 hover:underline">{r.supplier.companyName || r.supplier.name}</Link> : '—'}</td>
                                                <td className="px-3 py-2.5 text-end tabular-nums font-semibold text-ink whitespace-nowrap">{money(r.targetCasePrice)}{r.originalTargetCasePrice != null && <span className="block text-[12px] font-normal text-ink-3 line-through">{money(r.originalTargetCasePrice)}</span>}</td>
                                                <td className="px-3 py-2.5 text-end tabular-nums whitespace-nowrap">{money(r.listedCasePrice)}{gap !== null && <span className={cn('block text-[12px]', gap < 0 ? 'text-amber-800' : 'text-emerald-700')}>{tl(gap < 0 ? 'gapBelow' : 'gapAbove', { pct: fmt.number(Math.abs(gap), { maximumFractionDigits: 1 }) })}</span>}</td>
                                                <td className="px-3 py-2.5 text-end tabular-nums whitespace-nowrap">{qtyText(tl, r.quantity, r.quantityUnit)}{r.quantityUnit !== 'CASE' && <span className="block text-[12px] text-ink-3">{tl('cases', { count: r.quantityCases })}</span>}</td>
                                                <td className="px-3 py-2.5"><StageBadge stage={r.stage} tl={tl} /></td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-ink-3">{date(r.updatedAt)}</td>
                                                <td className="px-3 py-2.5 text-end">
                                                    <Button size="sm" variant={mayAnswer && r.actions?.deskMayAnswer ? 'primary' : 'secondary'} onClick={() => setOpenId(r.id)}>
                                                        {mayAnswer && r.actions?.deskMayAnswer ? tl('answer') : tl('view')}
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>

            {data && data.pages > 1 && (
                <nav className="mt-3 flex items-center justify-end gap-2 text-[13px] text-ink-3" aria-label={tl('pageOf', { page: data.page, pages: data.pages })}>
                    <span>{tl('pageOf', { page: data.page, pages: data.pages })}</span>
                    <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft size={14} className="rtl:rotate-180" />}>{tl('prev')}</Button>
                    <Button size="sm" variant="secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} icon={<ChevronRight size={14} className="rtl:rotate-180" />}>{tl('next')}</Button>
                </nav>
            )}

            <TargetDetailDialog id={openId} mayAnswer={mayAnswer} onClose={() => setOpenId(null)} onChanged={load} />
        </div>
    );
}
