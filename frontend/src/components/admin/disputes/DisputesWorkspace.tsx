'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ExternalLink, FileText, MessageCircle, Paperclip, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Notice, Skeleton, Stat, StatusBadge, inputCls, type Tone } from '@/components/supplier/ui';
import { disputeReasonKey } from '@/lib/disputes';
import {
    DISPUTE_DECIDE_ROLES, ORDER_DETAIL_ROLES, disputeApi, orderRef,
    type Dispute, type DisputeDecision, type DisputeOrderFacts, type DisputePage, type DisputeStats, type DisputeStatus,
} from '@/lib/admin-support-api';

/**
 * Admin → Support HQ → Disputes (dictionary section `adminDisputes`).
 * Everything the former Dispute Center (/admin/disputes) did: the status
 * filters and counts, "mark under review", and the refund / no-refund
 * decision with its note. The server (backend/src/disputes) decides; this view
 * shows its answer. Payment facts come from GET /orders/admin/:id/detail, only
 * for the roles that endpoint allows.
 */

type Filter = 'ACTIVE' | 'ALL' | DisputeStatus;
const FILTERS: Filter[] = ['ACTIVE', 'ALL', 'OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_REFUND', 'CLOSED'];
const PAGE = 50;
const STATUS_TONE: Record<string, Tone> = { OPEN: 'warning', UNDER_REVIEW: 'info', RESOLVED_REFUND: 'success', RESOLVED_NO_REFUND: 'neutral', CLOSED: 'neutral' };
const CARD_STATUSES = ['HOLDING', 'CAPTURED', 'RELEASED', 'REFUNDED', 'DISPUTED'];
const PAY_STATUSES = ['UNPAID', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED'];
const DECIDABLE = ['OPEN', 'UNDER_REVIEW'];

function useTd() {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminDisputes', k, v), [t]);
}
const disputeRef = (id: string) => `#${id.slice(-6).toUpperCase()}`;

/** Dispute status in the reader's language (shared `disputes` dictionary). */
export function DisputeStatusBadge({ status, className }: { status: string; className?: string }) {
    const { t } = useLanguage();
    const label = t('disputes', `status${status}`);
    return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot className={className}>{label && label !== `status${status}` ? label : status}</Badge>;
}
function useReason() {
    const { t } = useLanguage();
    return React.useCallback((stored: string) => { const k = disputeReasonKey(stored); return k ? t('disputes', k) : stored; }, [t]);
}
const safeHref = (v: string) => (/^https?:\/\//i.test(v) ? v : null);

export function DisputesWorkspace({ role, selectedId, onSelect }: { role: string; selectedId: string | null; onSelect: (id: string | null) => void }) {
    const td = useTd();
    const { fmt } = useLanguage();
    const reasonOf = useReason();
    const [filter, setFilter] = React.useState('ACTIVE' as Filter);
    const [rows, setRows] = React.useState(null as Dispute[] | null);
    const [more, setMore] = React.useState(null as { page: number; total: number } | null);
    const [error, setError] = React.useState(null as string | null);
    const [stats, setStats] = React.useState(null as DisputeStats | null);
    const [loadingMore, setLoadingMore] = React.useState(false);

    const loadStats = React.useCallback(() => { disputeApi.stats().then(setStats).catch(() => setStats(null)); }, []);
    const load = React.useCallback(async () => {
        setError(null); setRows(null); setMore(null);
        try {
            if (filter === 'ACTIVE') {
                const [a, b] = await Promise.all([disputeApi.list('OPEN', 1, PAGE), disputeApi.list('UNDER_REVIEW', 1, PAGE)]);
                setRows([...a.data, ...b.data].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt)));
                setMore(a.total + b.total > a.data.length + b.data.length ? { page: 0, total: a.total + b.total } : null);
            } else {
                const p: DisputePage = await disputeApi.list(filter === 'ALL' ? null : filter, 1, PAGE);
                setRows(p.data);
                setMore(p.total > p.data.length ? { page: 1, total: p.total } : null);
            }
        } catch (e: any) { setError(e?.message || td('loadFailed')); }
    }, [filter, td]);
    React.useEffect(() => { load(); }, [load]);
    React.useEffect(() => { loadStats(); }, [loadStats]);

    const loadMore = async () => {
        if (!more || !more.page || filter === 'ACTIVE') return;
        setLoadingMore(true);
        try {
            const p = await disputeApi.list(filter === 'ALL' ? null : filter, more.page + 1, PAGE);
            setRows((r) => [...(r || []), ...p.data.filter((d) => !(r || []).some((x) => x.id === d.id))]);
            setMore(p.page < p.totalPages ? { page: p.page, total: p.total } : null);
        } catch (e: any) { setError(e?.message || td('loadFailed')); } finally { setLoadingMore(false); }
    };
    const changed = () => { load(); loadStats(); };

    const filterLabel = (f: Filter) => (f === 'ACTIVE' ? td('filterActive') : f === 'ALL' ? td('filterAll') : td(`filter_${f}`));
    const filterCount = (f: Filter) => !stats ? null : f === 'ACTIVE' ? stats.open + stats.underReview : f === 'ALL' ? null
        : f === 'OPEN' ? stats.open : f === 'UNDER_REVIEW' ? stats.underReview : f === 'RESOLVED_REFUND' ? stats.resolvedRefund : f === 'RESOLVED_NO_REFUND' ? stats.resolvedNoRefund : null;

    return (
        <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
                <Stat loading={!stats} tone={stats?.open ? 'warning' : 'neutral'} label={td('statOpen')} value={stats?.open ?? '—'} />
                <Stat loading={!stats} tone={stats?.underReview ? 'info' : 'neutral'} label={td('statReview')} value={stats?.underReview ?? '—'} />
                <Stat loading={!stats} label={td('statRefund')} value={stats?.resolvedRefund ?? '—'} hint={td('statRefundHint')} />
                <Stat loading={!stats} label={td('statNoRefund')} value={stats?.resolvedNoRefund ?? '—'} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,400px)_1fr] gap-3 items-start">
                {/* List */}
                <section aria-label={td('listAria')} className={cn('rounded-xl bg-surface ring-1 ring-line overflow-hidden', selectedId && 'hidden lg:block')}>
                    <div className="p-3 border-b border-line flex flex-wrap gap-1.5" role="group" aria-label={td('filterLabel')}>
                        {FILTERS.map((f) => {
                            const c = filterCount(f);
                            return (
                                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                                    className={cn('h-8 px-2.5 rounded-lg text-[12.5px] font-medium inline-flex items-center gap-1.5 ring-1 ring-inset transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                        filter === f ? 'bg-teal-soft text-teal ring-teal' : 'bg-surface text-ink-2 ring-line hover:bg-surface-2')}>
                                    {filterLabel(f)}{c ? <span className="tabular-nums text-ink-3">{c}</span> : null}
                                </button>
                            );
                        })}
                    </div>
                    {error ? <div className="p-4"><ErrorState message={error} onRetry={load} /></div>
                        : !rows ? <div className="p-3 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
                            : !rows.length ? <EmptyState icon={<AlertCircle size={20} />} title={td('emptyTitle')}>{td('emptyBody')}</EmptyState>
                                : (
                                    <ul className="divide-y divide-line max-h-[70dvh] overflow-y-auto">
                                        {rows.map((d) => (
                                            <li key={d.id}>
                                                <button type="button" onClick={() => onSelect(d.id)} aria-current={selectedId === d.id ? 'true' : undefined}
                                                    className={cn('w-full text-start px-4 py-2.5 flex flex-col gap-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6]', selectedId === d.id && 'bg-surface-2')}>
                                                    <span className="flex items-center gap-2">
                                                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-heading">{d.order?.customer?.name || td('unknownBuyer')}</span>
                                                        <time dateTime={d.createdAt} className="shrink-0 text-[12px] text-ink-4">{fmt.date(d.createdAt)}</time>
                                                    </span>
                                                    <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                                                        <DisputeStatusBadge status={d.status} className="h-5 px-1.5 text-[11.5px]" />
                                                        <bdi dir="ltr" className="font-mono">{orderRef(d.orderId)}</bdi>
                                                        <span className="truncate">{reasonOf(d.reason)}</span>
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                    {more && (
                        <div className="p-3 border-t border-line text-[12.5px] text-ink-3 flex flex-wrap items-center gap-2">
                            <span>{td('shownOf', { shown: rows?.length ?? 0, total: more.total })}</span>
                            {more.page ? <Button size="sm" variant="secondary" loading={loadingMore} onClick={loadMore}>{td('loadMore')}</Button> : <span>{td('activeTruncated')}</span>}
                        </div>
                    )}
                </section>

                {/* Detail */}
                <section className={cn('rounded-xl bg-surface ring-1 ring-line min-h-[320px]', !selectedId && 'hidden lg:block')}>
                    {selectedId ? <DisputeDetail key={selectedId} id={selectedId} role={role} onBack={() => onSelect(null)} onChanged={changed} />
                        : (
                            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center p-8">
                                <span className="w-11 h-11 rounded-xl bg-surface-2 ring-1 ring-line text-ink-3 flex items-center justify-center"><FileText size={20} aria-hidden /></span>
                                <p className="mt-3 text-[15px] font-semibold text-heading">{td('pickTitle')}</p>
                                <p className="mt-1 text-[13.5px] text-ink-3 max-w-[44ch]">{td('pickBody')}</p>
                            </div>
                        )}
                </section>
            </div>
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-x-4 gap-y-0.5 py-2 border-t border-line first:border-t-0">
            <dt className="text-[12.5px] text-ink-3">{label}</dt>
            <dd className="text-[13.5px] text-ink min-w-0">{children}</dd>
        </div>
    );
}

function DisputeDetail({ id, role, onBack, onChanged }: { id: string; role: string; onBack: () => void; onChanged: () => void }) {
    const td = useTd();
    const { fmt } = useLanguage();
    const reasonOf = useReason();
    const canDecide = DISPUTE_DECIDE_ROLES.includes(role);
    const canOrder = ORDER_DETAIL_ROLES.includes(role);
    const [d, setD] = React.useState(null as Dispute | null);
    const [error, setError] = React.useState(null as { message: string; status?: number } | null);
    const [facts, setFacts] = React.useState(null as DisputeOrderFacts | null | 'error');
    const [busy, setBusy] = React.useState(false);
    const [notice, setNotice] = React.useState(null as { tone: Tone; text: string } | null);
    const [decision, setDecision] = React.useState(null as DisputeDecision | null);
    const when = (s: string) => fmt.date(s, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const load = React.useCallback(async () => {
        setError(null);
        try {
            const x = await disputeApi.get(id);
            setD(x);
            if (canOrder) disputeApi.orderFacts(x.orderId).then(setFacts).catch(() => setFacts('error'));
        } catch (e: any) { setError({ message: e?.message || td('loadFailed'), status: e?.status }); }
    }, [id, canOrder, td]);
    React.useEffect(() => { load(); }, [load]);

    const markReview = async () => {
        if (!d) return;
        setBusy(true); setNotice(null);
        try {
            const r = await disputeApi.markUnderReview(d.id);
            setNotice({ tone: 'success', text: td('reviewDone', { status: r?.status === 'UNDER_REVIEW' ? td('filter_UNDER_REVIEW') : String(r?.status ?? '') }) });
            await load(); onChanged();
        } catch (e: any) { setNotice({ tone: 'danger', text: e?.message || td('actionFailed') }); } finally { setBusy(false); }
    };

    if (error) {
        return (
            <div className="p-4 space-y-3">
                <BackButton onBack={onBack} />
                {error.status === 404 ? <EmptyState icon={<AlertCircle size={20} />} title={td('notFound')}>{td('notFoundBody')}</EmptyState> : <ErrorState message={error.message} onRetry={load} />}
            </div>
        );
    }
    if (!d) return <div className="p-4 space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;

    const buyer = d.order?.customer || null;
    const card = facts && facts !== 'error' ? facts.payment?.card ?? null : null;
    const payLabel = (s: string | null | undefined) => (!s ? td('notRecorded') : PAY_STATUSES.includes(s) ? td(`pay_${s}`) : s);

    return (
        <div className="flex flex-col">
            <header className="px-4 sm:px-5 py-3 border-b border-line flex flex-wrap items-start gap-3">
                <BackButton onBack={onBack} className="lg:hidden" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-semibold text-heading flex flex-wrap items-center gap-2">
                        {td('detailTitle')} <bdi dir="ltr" className="font-mono text-[14px] text-ink-3">{disputeRef(d.id)}</bdi>
                        <DisputeStatusBadge status={d.status} />
                    </h2>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">{td('openedOn', { date: when(d.createdAt) })}</p>
                </div>
                <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={load} aria-label={td('refresh')}>{td('refresh')}</Button>
            </header>

            <div className="p-4 sm:p-5 space-y-4">
                {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

                {/* Decision actions */}
                {DECIDABLE.includes(d.status) && (canDecide ? (
                    <div className="rounded-lg bg-surface-2 ring-1 ring-line p-3 flex flex-wrap items-center gap-2">
                        <p className="text-[13px] text-ink-2 me-auto">{d.status === 'OPEN' ? td('actionsOpen') : td('actionsReview')}</p>
                        {d.status === 'OPEN' && <Button size="sm" variant="secondary" loading={busy} onClick={markReview}>{td('markReview')}</Button>}
                        <Button size="sm" variant="secondary" onClick={() => setDecision('RESOLVED_NO_REFUND')}>{td('decideNoRefund')}</Button>
                        <Button size="sm" variant="brand" onClick={() => setDecision('RESOLVED_REFUND')}>{td('decideRefund')}</Button>
                    </div>
                ) : (
                    // Support can mark a case under review; the refund / no-refund decision is OWNER/ADMIN (it moves money).
                    <div className="flex flex-col gap-2">
                        {d.status === 'OPEN' && (
                            <div className="rounded-lg bg-surface-2 ring-1 ring-line p-3 flex flex-wrap items-center gap-2">
                                <p className="text-[13px] text-ink-2 me-auto">{td('actionsOpen')}</p>
                                <Button size="sm" variant="secondary" loading={busy} onClick={markReview}>{td('markReview')}</Button>
                            </div>
                        )}
                        <Notice tone="info">{td('viewOnly')}</Notice>
                    </div>
                ))}
                {d.status === 'CLOSED' && <Notice tone="info">{td('closedNote')}</Notice>}

                <Card title={td('secCase')} bodyClassName="pt-1">
                    <dl>
                        <Row label={td('fOrder')}>
                            <span className="inline-flex flex-wrap items-center gap-2">
                                {canOrder ? <Link href={`/admin/orders/${encodeURIComponent(d.orderId)}`} className="text-teal font-medium hover:underline inline-flex items-center gap-1"><bdi dir="ltr" className="font-mono">{orderRef(d.orderId)}</bdi><ExternalLink size={12} aria-hidden /></Link>
                                    : <bdi dir="ltr" className="font-mono">{orderRef(d.orderId)}</bdi>}
                                {d.order?.status && <StatusBadge kind="order" status={d.order.status} />}
                            </span>
                        </Row>
                        <Row label={td('fBuyer')}>
                            {buyer ? (
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="font-medium text-heading">{buyer.name || td('unknownBuyer')}</span>
                                    {buyer.email && <bdi dir="ltr" className="text-ink-3">{buyer.email}</bdi>}
                                    <Link href={`/admin/support?view=orders&user=${encodeURIComponent(buyer.id)}&order=${encodeURIComponent(d.orderId)}`} className="inline-flex items-center gap-1 text-[12.5px] text-teal font-medium hover:underline"><MessageCircle size={13} aria-hidden />{td('messageBuyer')}</Link>
                                </span>
                            ) : td('notRecorded')}
                        </Row>
                        <Row label={td('fSuppliers')}>
                            {!canOrder ? <span className="text-ink-3">{td('suppliersRole')}</span>
                                : facts === null ? <Skeleton className="h-5 w-40" />
                                    : facts === 'error' ? <span className="text-ink-3">{td('factsFailed')}</span>
                                        : !facts.suppliers.length ? <span className="text-ink-3">{td('notRecorded')}</span>
                                            : (
                                                <ul className="space-y-1">
                                                    {facts.suppliers.map((s) => (
                                                        <li key={s.id} className="flex flex-wrap items-center gap-x-2">
                                                            <span className="font-medium text-heading">{s.companyName || s.name || td('unknownSupplier')}</span>
                                                            <Link href={`/admin/support?view=orders&user=${encodeURIComponent(s.id)}&order=${encodeURIComponent(d.orderId)}`} className="inline-flex items-center gap-1 text-[12.5px] text-teal font-medium hover:underline"><MessageCircle size={13} aria-hidden />{td('messageSupplier')}</Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                        </Row>
                        <Row label={td('fReason')}>{reasonOf(d.reason)}</Row>
                        <Row label={td('fDescription')}><p className="whitespace-pre-wrap break-words">{d.description || td('notRecorded')}</p></Row>
                        <Row label={td('fEvidence')}>
                            {!d.evidence.length ? <span className="text-ink-3">{td('noEvidence')}</span> : (
                                <ul className="space-y-1">
                                    {d.evidence.map((e, i) => {
                                        const href = safeHref(e);
                                        return (
                                            <li key={i} className="flex items-center gap-1.5 min-w-0">
                                                <Paperclip size={13} className="text-ink-4 shrink-0" aria-hidden />
                                                {href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-teal hover:underline truncate">{td('evidenceItem', { n: i + 1 })}</a>
                                                    : <span className="text-ink-3 truncate">{td('evidenceUnopenable', { n: i + 1 })}</span>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Row>
                    </dl>
                </Card>

                <Card title={td('secPayment')} description={td('secPaymentDesc')} bodyClassName="pt-1">
                    {!canOrder ? <p className="text-[13px] text-ink-3">{td('paymentRole')}</p>
                        : facts === null ? <Skeleton className="h-16" />
                            : facts === 'error' ? <ErrorState message={td('factsFailed')} onRetry={load} />
                                : (
                                    <div className="space-y-3">
                                        <dl>
                                            <Row label={td('fPayStatus')}>{payLabel(facts.payment?.status)}</Row>
                                            <Row label={td('fCard')}>{card ? (CARD_STATUSES.includes(card.status) ? td(`card_${card.status}`) : card.status) : <span className="text-ink-3">{td('cardNone')}</span>}</Row>
                                        </dl>
                                        {d.status === 'RESOLVED_REFUND' && !card && <Notice tone="warning">{td('refundNoCard')}</Notice>}
                                        {d.status === 'RESOLVED_REFUND' && card && card.status !== 'REFUNDED' && <Notice tone="warning">{td('refundNotShown')}</Notice>}
                                    </div>
                                )}
                </Card>

                <Card title={td('secTimeline')} bodyClassName="pt-1">
                    <ol className="space-y-2.5 text-[13px]">
                        <TimelineItem at={when(d.createdAt)} text={td('tlOpened')} />
                        {d.status === 'UNDER_REVIEW' && !d.resolvedAt && <TimelineItem at={null} text={td('tlReview')} />}
                        {d.resolvedAt && <TimelineItem at={when(d.resolvedAt)} text={td('tlDecided', { status: td(`filter_${d.status}`) })} />}
                        {d.status === 'CLOSED' && !d.resolvedAt && <TimelineItem at={null} text={td('tlClosed')} />}
                        <TimelineItem at={when(d.updatedAt)} text={td('tlUpdated')} muted />
                    </ol>
                    {d.resolution && (
                        <div className="mt-4 rounded-lg bg-surface-2 ring-1 ring-line p-3">
                            <p className="text-[12.5px] font-medium text-ink-3">{td('fResolution')}</p>
                            <p className="mt-1 text-[13.5px] text-ink whitespace-pre-wrap break-words">{d.resolution}</p>
                        </div>
                    )}
                </Card>
            </div>

            <DecisionDialog dispute={d} decision={decision} card={canOrder ? (facts === null ? 'loading' : facts === 'error' ? 'unknown' : card) : 'unknown'}
                onClose={() => setDecision(null)}
                onDone={async (text) => { setDecision(null); setNotice({ tone: 'success', text }); await load(); onChanged(); }} />
        </div>
    );
}

function TimelineItem({ at, text, muted }: { at: string | null; text: string; muted?: boolean }) {
    const td = useTd();
    return (
        <li className="flex gap-3">
            <span className={cn('mt-1.5 w-2 h-2 rounded-full shrink-0', muted ? 'bg-line-strong' : 'bg-teal')} aria-hidden />
            <span className="min-w-0">
                <span className={cn('block', muted ? 'text-ink-3' : 'text-ink')}>{text}</span>
                <span className="block text-[12px] text-ink-4">{at ?? td('timeNotRecorded')}</span>
            </span>
        </li>
    );
}

function BackButton({ onBack, className }: { onBack: () => void; className?: string }) {
    const td = useTd();
    return (
        <button type="button" onClick={onBack} className={cn('inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[13px] text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]', className)}>
            <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden />{td('backToList')}
        </button>
    );
}

/**
 * Confirm a decision. States what the server will do (disputes.service.ts
 * resolve): set the status, save the note, notify the buyer and, for a refund,
 * ask the escrow service to refund a card payment record if the order has one.
 * That refund runs after the reply, so its outcome is read from the payment record, never assumed.
 */
function DecisionDialog({ dispute, decision, card, onClose, onDone }: {
    dispute: Dispute; decision: DisputeDecision | null; card: { status: string } | null | 'loading' | 'unknown';
    onClose: () => void; onDone: (text: string) => void;
}) {
    const td = useTd();
    const { fmt } = useLanguage();
    const [note, setNote] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null as string | null);
    React.useEffect(() => { if (decision) { setNote(''); setError(null); } }, [decision]);
    if (!decision) return null;
    const refund = decision === 'RESOLVED_REFUND';
    const close = () => { if (!busy) onClose(); };

    const run = async () => {
        if (!note.trim()) { setError(td('noteRequired')); return; }
        setBusy(true); setError(null);
        try {
            const r = await disputeApi.resolve(dispute.id, decision, note.trim());
            const status = typeof r?.status === 'string' ? td(`filter_${r.status}`) : td(`filter_${decision}`);
            onDone(td('decisionDone', { status, date: r?.resolvedAt ? fmt.date(r.resolvedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '' }));
        } catch (e: any) { setError(e?.message || td('actionFailed')); } finally { setBusy(false); }
    };

    const cardLine = card === 'loading' ? td('cardChecking') : card === 'unknown' ? td('cardUnknown') : card ? (CARD_STATUSES.includes(card.status) ? td(`card_${card.status}`) : card.status) : td('cardNoneDialog');

    return (
        <Dialog open onClose={close} dismissable={!busy} size="md"
            title={refund ? td('dlgRefundTitle') : td('dlgNoRefundTitle')}
            description={td('dlgDesc', { ref: disputeRef(dispute.id), order: orderRef(dispute.orderId) })}
            footer={<>
                <Button variant="secondary" onClick={close} disabled={busy}>{td('cancel')}</Button>
                <Button variant={refund ? 'brand' : 'primary'} loading={busy} onClick={run}>{refund ? td('confirmRefund') : td('confirmNoRefund')}</Button>
            </>}>
            <div className="space-y-4">
                <div className="text-[13.5px] text-ink-2">
                    <p className="font-medium text-heading">{td('dlgWhat')}</p>
                    <ul className="mt-1.5 list-disc ps-5 space-y-1">
                        <li>{refund ? td('dlgRefund1') : td('dlgNoRefund1')}</li>
                        <li>{refund ? td('dlgRefund2') : td('dlgNoRefund2')}</li>
                        {refund && <li>{td('dlgRefund3')} <span className="font-medium text-heading">{cardLine}</span></li>}
                        <li>{td('dlgFinal')}</li>
                    </ul>
                </div>
                <Field label={td('noteLabel')} htmlFor="dispute-note" required hint={refund ? td('noteHintRefund') : td('noteHintNoRefund')} error={error}>
                    <textarea id="dispute-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000}
                        aria-invalid={!!error && !note.trim()} className={cn(inputCls, 'h-auto py-2 resize-y')} />
                </Field>
            </div>
        </Dialog>
    );
}
