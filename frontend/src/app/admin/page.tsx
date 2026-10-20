'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { adminApi } from '@/lib/admin-api';
import { Badge, Card, ErrorState, Skeleton, TONE, Thumb, type Tone } from '@/components/supplier/ui';
import { RangePicker, defaultCustom, rangeErrorKey, type CustomRange, type RangeId } from '@/components/dashboard/RangePicker';
import { Trans } from '@/components/i18n/Trans';
import DeveloperDashboard from './components/DeveloperDashboard';

/**
 * Founder Overview (/admin), organised around the founder's questions:
 * revenue, profit, orders, what is for sale, what sold, who is on the
 * platform, who performs best, and what needs attention. Every figure comes
 * from GET /dashboard/admin/overview (definitions in
 * backend/src/admin/admin-overview.ts). Each tile says whether it is a
 * current count ("Now"), an all-time total, or follows the selected period.
 */
type Scope = 'period' | 'now' | 'allTime';

export default function AdminOverviewPage() {
    const { user } = useAuth();
    const { t, fmt } = useLanguage();
    const tr = (k: string, v?: Record<string, string | number>) => t('adminOverview', k, v);
    const isDeveloper = (user?.role || '').toUpperCase() === 'DEVELOPER';
    const [range, setRange] = React.useState<RangeId>('30d');
    const [custom, setCustom] = React.useState<CustomRange>(defaultCustom);
    const [data, setData] = React.useState<any | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        adminApi.overview(range === 'custom' ? { range, from: custom.from, to: custom.to } : { range })
            .then(setData)
            .catch((e) => { setData(null); const k = rangeErrorKey(e); setError(k ? t('supplierOverview', k, { max: 366 }) : tr('errLoad')); })
            .finally(() => setLoading(false));
    }, [range, custom.from, custom.to]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { if (!isDeveloper) load(); }, [load, isDeveloper]);

    if (isDeveloper) return <DeveloperDashboard />;

    const eur = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n));
    const pct = (n: number) => fmt.number(n, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
    const day = (d: string, withYear = true) => fmt.date(d + 'T12:00:00Z', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
    const month = (m: string) => fmt.date(m + '-15T12:00:00Z', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const first = loading && !data;
    const s = data?.snapshot, c = data?.commercial, ins = data?.insights, r = data?.range;
    const monthly = r?.granularity === 'month';
    const buckets = (c?.series ?? []).map((b: any) => ({ ...b, label: monthly ? month(b.key) : day(b.key, false) }));
    const withSales = buckets.filter((b: any) => b.orderValue > 0);
    const unit = tr(monthly ? 'unitMonth' : 'unitDay');
    const change = (v: number | null | undefined, prev: string) => v === null || v === undefined
        ? <span>{tr('noPrev')}</span>
        : <Trans text={tr('vsPrevShort', { change: pct(v), prev })} tags={{ b: (x) => <b dir="ltr" className={cn('font-semibold', TONE[(v > 0.005 ? 'success' : v < -0.005 ? 'danger' : 'neutral') as Tone].text)}>{x}</b> }} />;

    const revenueComplete = c && c.current.linesWithoutNet === 0;
    const sub = 'submissions';
    const attention: { key: string; count: number; href: string; sev: 'high' | 'medium' | 'low' }[] = s ? ([
        { key: 'attReady', count: s.orders.readyForApproval, href: '/admin/orders', sev: 'high' },
        { key: 'attDecision', count: s.orders.needsDecision, href: '/admin/orders', sev: 'high' },
        { key: 'attLegacy', count: s.orders.legacyPending, href: '/admin/orders', sev: 'medium' },
        { key: 'attPaymentFailed', count: s.paymentFailed, href: '/admin/orders', sev: 'high' },
        { key: 'attDisputes', count: s.disputesOpen, href: '/admin/disputes', sev: 'high' },
        { key: 'attSubmissions', count: s.products.submissions.byStatus?.PENDING ?? 0, href: `/admin/products/${sub}?status=PENDING`, sev: 'medium' },
        { key: 'attOffers', count: s.offersPending, href: '/admin/wholesale-offers', sev: 'medium' },
        { key: 'attSupplierAccounts', count: s.people.suppliers.pendingApproval, href: '/admin/users?status=PENDING_APPROVAL', sev: 'medium' },
        { key: 'attBuyerAccounts', count: s.people.buyers.pendingApproval, href: '/admin/users?status=PENDING_APPROVAL', sev: 'medium' },
        { key: 'attKyc', count: s.kycPending, href: '/admin/kyc', sev: 'medium' },
        { key: 'attLiveIncompleteCatalog', count: s.products.catalog.liveIncomplete, href: '/admin/products/catalog?status=APPROVED&attention=missing', sev: 'medium' },
        { key: 'attLiveIncompleteSub', count: s.products.submissions.liveIncomplete, href: `/admin/products/${sub}?status=APPROVED&attention=missing`, sev: 'medium' },
        { key: 'attCatalogMissing', count: s.products.catalog.missingInfo, href: '/admin/products/catalog?attention=missing', sev: 'low' },
        { key: 'attCatalogImages', count: s.products.catalog.missingImages, href: '/admin/products/catalog?attention=images', sev: 'low' },
    ] as { key: string; count: number; href: string; sev: 'high' | 'medium' | 'low' }[]).filter((a) => a.count > 0) : [];
    const SEV: Record<string, { tone: Tone; key: string }> = { high: { tone: 'danger', key: 'sevHigh' }, medium: { tone: 'warning', key: 'sevMedium' }, low: { tone: 'neutral', key: 'sevLow' } };
    const PIPELINE: [string, string][] = [['APPROVED', 'live'], ['PENDING', 'awaitingReview'], ['NEEDS_CHANGES', 'changesRequested'], ['DRAFT', 'drafts'], ['REJECTED', 'rejected']];

    return (
        <div data-no-translate className="text-start space-y-5">
            <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                    <h1 className="font-sans text-[22px] leading-tight font-semibold text-heading">{tr('title')}</h1>
                    <p className="mt-0.5 text-[13px] text-ink-3">{data ? tr('asOf', { time: fmt.date(data.asOf, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : tr('desc')}</p>
                </div>
                <RangePicker range={range} onRange={setRange} custom={custom} onCustom={setCustom} resolved={r ?? null} idPrefix="ov" />
            </header>

            {error && <ErrorState message={error} onRetry={load} />}

            {!(error && !data) && <div aria-busy={loading} className={cn('space-y-5 transition-opacity', loading && data && 'opacity-60')}>
                {/* 1 — Money: what came in and what Atlantis earned (selected period) */}
                <section aria-labelledby="ov-money">
                    <SectionTitle id="ov-money" title={tr('moneyTitle')} hint={tr('moneyHint')} />
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                        <Kpi scope="period" loading={first} label={tr('orderValue')} value={eur(c?.current.orderValue)}
                            lines={c ? [tr('approvedOrdersLine', { count: c.current.orders }), change(c.change.orderValue, eur(c.previous.orderValue))] : []} def={tr('defOrderValue')} />
                        <Kpi scope="period" loading={first} label={tr('revenue')} value={c ? (c.current.linesWithNet || !c.current.lines ? eur(c.current.revenueRecorded) : tr('notAvailable')) : '—'} muted={!!c && !c.current.linesWithNet && !!c.current.lines}
                            lines={c ? [
                                !c.current.lines ? tr('revenueNone') : revenueComplete ? tr('revenueComplete') : <span key="p" className="text-amber-800">{tr('revenuePartial', { covered: int(c.current.linesWithNet), total: int(c.current.lines) })}</span>,
                                c.change.revenue != null ? change(c.change.revenue, '') : null,
                            ] : []} def={tr('defRevenue')} />
                        <Kpi scope="period" loading={first} label={tr('netProfit')} value={tr('notAvailable')} muted
                            lines={[tr('netProfitWhy')]} def={tr('defNetProfit')} />
                        <Kpi scope="period" loading={first} label={tr('received')} value={c ? (c.payments.recordsEver ? eur(c.payments.current.amount) : tr('notRecorded')) : '—'} muted={!!c && !c.payments.recordsEver}
                            lines={c ? [
                                c.payments.recordsEver ? tr('receivedLine', { count: c.payments.current.payments }) : tr('receivedNone'),
                                c.markedPaid.orders ? <span key="m" className="text-amber-800">{tr('markedPaid', { count: c.markedPaid.orders, amount: eur(c.markedPaid.amount) })}</span> : null,
                            ] : []} def={tr('defReceived')} />
                    </div>
                </section>

                {/* 2 — Marketplace: orders, products, people */}
                <section aria-labelledby="ov-market">
                    <SectionTitle id="ov-market" title={tr('marketTitle')} hint={tr('marketHint')} />
                    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                        <Kpi scope="allTime" loading={first} label={tr('orders')} value={int(s?.orders.total)} href="/admin/orders"
                            lines={s ? [tr('ordersPlaced', { count: s.orders.placedInPeriod }), tr('ordersOpen', { count: s.orders.open })] : []} def={tr('defOrders')} />
                        <Kpi scope="now" loading={first} label={tr('ordersAction')} value={int(s?.orders.requiresAction)} tone={s?.orders.requiresAction ? 'warning' : undefined} href="/admin/orders"
                            lines={s ? [tr('ordersActionHint', { ready: int(s.orders.readyForApproval), decision: int(s.orders.needsDecision), legacy: int(s.orders.legacyPending) })] : []} def={tr('defOrdersAction')} />
                        <Kpi scope="now" loading={first} label={tr('activeProducts')} value={int(s?.products.active)} href="/admin/products/catalog?status=APPROVED"
                            lines={s ? [tr('activeLine', { live: int(s.products.live), out: int(s.products.live - s.products.active) })] : []} def={tr('defActive')} />
                        <Kpi scope="period" loading={first} label={tr('productsSold')} value={c ? tr('casesValue', { count: c.current.casesSold, n: int(c.current.casesSold) }) : '—'}
                            lines={c && s ? [tr('soldDistinct', { count: c.current.productsSold }), tr('soldAllTime', { products: int(s.sold.products), cases: int(s.sold.cases) })] : []} def={tr('defSold')} />
                        <Kpi scope="now" loading={first} label={tr('suppliers')} value={int(s?.people.suppliers.total)} href="/admin/suppliers"
                            lines={s ? [tr('suppliersActive', { active: int(s.people.suppliers.active), live: int(s.people.suppliers.withLiveProducts) }), s.people.suppliers.pendingApproval ? tr('awaitingApproval', { count: s.people.suppliers.pendingApproval }) : null] : []} def={tr('defSuppliers')} />
                        <Kpi scope="now" loading={first} label={tr('buyers')} value={int(s?.people.buyers.total)} href="/admin/buyers"
                            lines={s ? [tr('buyersActive', { active: int(s.people.buyers.active) }), tr('buyersOrdering', { count: s.people.buyers.orderingInPeriod })] : []} def={tr('defBuyers')} />
                    </div>
                </section>

                {/* 3 — Sales trend + action center */}
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                    <Card title={tr('trendTitle', { unit })} description={r ? tr('trendDesc', { from: day(r.from), to: day(r.to) }) : undefined}>
                        {first ? <Skeleton className="h-[170px]" /> : withSales.length >= 2 ? (
                            <figure className="h-[170px]" role="img" aria-label={tr('chartAria', { from: r ? day(r.from) : '', to: r ? day(r.to) : '', total: eur(c?.current.orderValue) })}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={monthly ? '28%' : '35%'}>
                                        <CartesianGrid vertical={false} stroke="#E6E8EC" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} interval={monthly ? 0 : 'preserveStartEnd'} minTickGap={16} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => fmt.number(v, { notation: 'compact', maximumFractionDigits: 1 })} />
                                        <Tooltip cursor={{ fill: '#F6F8FA' }} content={({ active, payload }) => active && payload?.[0] ? (
                                            <div className="rounded-lg bg-surface ring-1 ring-line shadow-float px-3 py-2 text-[12.5px]">
                                                <p className="font-medium text-heading">{payload[0].payload.label}{payload[0].payload.partial ? ` · ${tr('partialShort')}` : ''}</p>
                                                <p className="tabular-nums text-ink-2">{eur(payload[0].payload.orderValue)} · {tr('approvedOrdersLine', { count: payload[0].payload.orders })}</p>
                                            </div>
                                        ) : null} />
                                        <Bar dataKey="orderValue" fill="#0B1F3A" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </figure>
                        ) : withSales.length === 1 ? (
                            <div className="text-[13px] text-ink-2">
                                <p className="text-ink-3 mb-2">{tr('trendSingle', { unit })}</p>
                                <dl className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"><dt>{withSales[0].label}</dt><dd className="tabular-nums font-semibold text-heading">{eur(withSales[0].orderValue)} · {tr('approvedOrdersLine', { count: withSales[0].orders })}</dd></dl>
                            </div>
                        ) : <p className="text-[13px] text-ink-3">{tr('chartEmpty')}</p>}
                        <details className="mt-3 pt-3 border-t border-line text-[12.5px] text-ink-3">
                            <summary className="cursor-pointer font-medium text-ink-2 hover:text-heading">{tr('howTitle')}</summary>
                            <ul className="mt-2 space-y-1 list-disc ps-5 max-w-prose">
                                {['how1', 'how2', 'how3', 'how4', 'how5', 'how6', 'how7'].map((k) => <li key={k}>{tr(k)}</li>)}
                            </ul>
                        </details>
                    </Card>

                    <Card title={tr('attentionTitle')} description={tr('attentionDesc')} bodyClassName="p-0 pb-1">
                        {first ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
                            : attention.length === 0 ? <p className="px-4 py-4 text-[13.5px] text-ink-3 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" />{tr('attentionNone')}</p>
                            : (
                                <ul className="divide-y divide-line">
                                    {attention.map((a) => (
                                        <li key={a.key}>
                                            <Link href={a.href} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal">
                                                <AlertTriangle size={14} className={cn('shrink-0', TONE[SEV[a.sev].tone].text)} aria-hidden />
                                                <span className="flex-1 min-w-0 text-[13px] text-ink leading-[18px]">{tr(a.key)}</span>
                                                <Badge tone={SEV[a.sev].tone}>{tr(SEV[a.sev].key)}</Badge>
                                                <span className="w-12 text-end text-[13.5px] font-semibold text-heading tabular-nums">{int(a.count)}</span>
                                                <ArrowRight size={14} className="text-ink-4 rtl:rotate-180" aria-hidden />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                    </Card>
                </div>

                {/* 4 — Who performs best (selected period) */}
                <div className="grid gap-3 lg:grid-cols-2">
                    <Card title={tr('topSuppliers')} description={tr('topSuppliersDef')} bodyClassName="p-0 pb-1">
                        {first ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
                            : !c?.topSuppliers?.length ? <p className="px-4 pb-3 text-[13px] text-ink-3">{tr('noSales')}</p> : (
                                <div className="overflow-x-auto"><table className="w-full text-[13px] min-w-[420px]">
                                    <thead><tr className="text-[12px] text-ink-3"><th className="text-start font-medium px-4 py-1.5">{tr('supplierCol')}</th><th className="text-end font-medium px-2 py-1.5">{tr('ordersCol')}</th><th className="text-end font-medium px-2 py-1.5">{tr('netCol')}</th><th className="text-end font-medium px-4 py-1.5">{tr('valueCol')}</th></tr></thead>
                                    <tbody>{c.topSuppliers.map((x: any) => (
                                        <tr key={x.supplierId} className="border-t border-line">
                                            <td className="px-4 py-2 max-w-[22ch]"><Link href={`/admin/products/${sub}?supplier=${x.supplierId}`} className="block truncate hover:underline">{x.name || x.supplierId}</Link></td>
                                            <td className="px-2 py-2 text-end tabular-nums">{int(x.orders)}</td>
                                            <td className="px-2 py-2 text-end tabular-nums">{x.supplierNet == null ? <span className="text-ink-4" title={tr('netMissingTitle')}>—</span> : eur(x.supplierNet)}</td>
                                            <td className="px-4 py-2 text-end tabular-nums font-medium">{eur(x.orderValue)}</td>
                                        </tr>))}
                                    </tbody>
                                </table></div>
                            )}
                    </Card>
                    <Card title={tr('topProducts')} description={tr('topProductsDef')} bodyClassName="p-0 pb-1">
                        {first ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
                            : !c?.topProducts?.length ? <p className="px-4 pb-3 text-[13px] text-ink-3">{tr('noSales')}</p> : (
                                <div className="overflow-x-auto"><table className="w-full text-[13px] min-w-[420px]">
                                    <thead><tr className="text-[12px] text-ink-3"><th className="text-start font-medium px-4 py-1.5">{tr('productCol')}</th><th className="text-end font-medium px-2 py-1.5">{tr('casesCol')}</th><th className="text-end font-medium px-2 py-1.5">{tr('ordersCol')}</th><th className="text-end font-medium px-4 py-1.5">{tr('valueCol')}</th></tr></thead>
                                    <tbody>{c.topProducts.map((p: any) => (
                                        <tr key={p.productId} className="border-t border-line">
                                            <td className="px-4 py-1.5"><Link href={`/admin/products/${p.productId}`} className="flex items-center gap-2 min-w-0 hover:underline"><Thumb src={p.image} size={26} /><span className="truncate max-w-[24ch]">{p.name}</span></Link></td>
                                            <td className="px-2 py-1.5 text-end tabular-nums">{int(p.units)}</td><td className="px-2 py-1.5 text-end tabular-nums">{int(p.orders)}</td><td className="px-4 py-1.5 text-end tabular-nums font-medium">{eur(p.orderValue)}</td>
                                        </tr>))}
                                    </tbody>
                                </table></div>
                            )}
                    </Card>
                </div>

                {/* 5 — Product pipeline (now) and supplier activity (period) */}
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <Card title={tr('pipelineTitle')} description={tr('pipelineDesc')} bodyClassName="p-0 pb-1">
                        {first ? <div className="p-4"><Skeleton className="h-28" /></div> : s && (
                            <div className="overflow-x-auto"><table className="w-full text-[13px] min-w-[380px]">
                                <thead><tr className="text-[12px] text-ink-3"><th className="text-start font-medium px-4 py-1.5">{tr('statusCol')}</th><th className="text-end font-medium px-2 py-1.5">{tr('catalogCol')}</th><th className="text-end font-medium px-4 py-1.5">{tr('submissionsCol')}</th></tr></thead>
                                <tbody>{PIPELINE.map(([st, key]) => (
                                    <tr key={st} className="border-t border-line">
                                        <td className="px-4 py-1.5 text-ink-2">{tr(key)}</td>
                                        <td className="px-2 py-1.5 text-end tabular-nums"><Link href={`/admin/products/catalog?status=${st}`} className="hover:underline">{int(s.products.catalog.byStatus?.[st] ?? 0)}</Link></td>
                                        <td className="px-4 py-1.5 text-end tabular-nums"><Link href={`/admin/products/${sub}?status=${st}`} className="hover:underline">{int(s.products.submissions.byStatus?.[st] ?? 0)}</Link></td>
                                    </tr>))}
                                    <tr className="border-t border-line font-semibold"><td className="px-4 py-1.5">{tr('totalRow')}</td><td className="px-2 py-1.5 text-end tabular-nums">{int(s.products.catalog.total)}</td><td className="px-4 py-1.5 text-end tabular-nums">{int(s.products.submissions.total)}</td></tr>
                                </tbody>
                            </table></div>
                        )}
                    </Card>
                    <Card title={tr('submissionsTitle')} description={r ? tr('insightsDesc', { from: day(r.from), to: day(r.to) }) : undefined}>
                        {first ? <Skeleton className="h-24" /> : ins && (
                            <dl className="grid grid-cols-3 gap-x-3 gap-y-3 text-[13px]">
                                <Fig label={tr('submissionsNew')} value={int(ins.submissions.current)} sub={tr('submissionsSuppliers', { count: ins.submissions.suppliers })} />
                                <Fig label={tr('newSuppliers')} value={int(ins.newSuppliers.current)} sub={tr('prevLabel', { n: int(ins.newSuppliers.previous) })} />
                                <Fig label={tr('decSubmitted')} value={int(ins.decisions.submitted)} />
                                <Fig label={tr('decApproved')} value={int(ins.decisions.approved)} />
                                <Fig label={tr('decChanges')} value={int(ins.decisions.changesRequested)} />
                                <Fig label={tr('decRejected')} value={int(ins.decisions.rejected)} />
                            </dl>
                        )}
                        {ins && !first && <p className="mt-3 text-[12px] text-ink-3">{ins.decisions.trackedSince ? tr('decTracked', { date: fmt.date(ins.decisions.trackedSince) }) : tr('decNotYet')}</p>}
                    </Card>
                </div>
            </div>}
        </div>
    );
}

function SectionTitle({ id, title, hint }: { id: string; title: string; hint?: string }) {
    return (
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <h2 id={id} className="font-sans text-[15px] font-semibold text-heading">{title}</h2>
            {hint && <p className="text-[12.5px] text-ink-3">{hint}</p>}
        </div>
    );
}

/** Compact KPI tile: label, value, up to two short lines, a scope tag and its definition (title + screen-reader text). */
function Kpi({ label, value, lines = [], scope, loading, href, tone, muted, def }: { label: string; value: React.ReactNode; lines?: React.ReactNode[]; scope: Scope; loading?: boolean; href?: string; tone?: Tone; muted?: boolean; def?: string }) {
    const { t } = useLanguage();
    const body = (
        <>
            <div className="flex items-start justify-between gap-2">
                <p className="text-[12.5px] font-medium text-ink-3 leading-5" title={def}>{label}</p>
                <span className={cn('shrink-0 text-[10.5px] font-medium px-1.5 h-5 leading-5 rounded', scope === 'period' ? 'bg-teal-soft text-teal' : 'bg-surface-2 text-ink-3')}>{t('adminOverview', scope === 'period' ? 'scopePeriod' : scope === 'now' ? 'scopeNow' : 'scopeAllTime')}</span>
            </div>
            {loading ? <Skeleton className="mt-1.5 h-7 w-24" /> : (
                <p className={cn('mt-0.5 font-semibold tabular-nums leading-8', muted ? 'text-[15px] text-ink-3' : 'text-[22px] text-heading', tone && TONE[tone].text)}>{value}</p>
            )}
            {!loading && lines.filter(Boolean).map((l, i) => <p key={i} className="text-[12px] leading-[18px] text-ink-3">{l}</p>)}
            {def && <span className="sr-only">{def}</span>}
        </>
    );
    const cls = 'block rounded-xl bg-surface ring-1 ring-line p-3.5 min-h-[112px]';
    return href ? <Link href={href} className={cn(cls, 'hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal')}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Fig({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[12px] text-ink-3 truncate">{label}</dt>
            <dd className="text-[16px] font-semibold text-heading tabular-nums">{value}</dd>
            {sub && <dd className="text-[11.5px] text-ink-3">{sub}</dd>}
        </div>
    );
}
