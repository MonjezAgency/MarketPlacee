'use client';

import * as React from 'react';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Ban, Boxes, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardCheck,
    FileWarning, Image as ImageIcon, Info, Package, PackagePlus, Receipt, Scale, ShoppingCart, Store, TrendingUp, Upload, UserPlus, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { adminApi } from '@/lib/admin-api';
import { ErrorState, Skeleton, StatusBadge, TONE, Thumb, inputCls, selectCls, type Tone } from '@/components/supplier/ui';
import { RANGES, defaultCustom, rangeErrorKey, type CustomRange, type RangeId } from '@/components/dashboard/RangePicker';
import DeveloperDashboard from './components/DeveloperDashboard';

/**
 * Founder Overview (/admin) — the marketplace command center. Every number comes
 * from GET /dashboard/admin/overview (definitions and tests in
 * backend/src/admin/admin-overview.ts); nothing on this page is computed from
 * guesses. Figures that the records can't support (net profit, payments before
 * any Stripe confirmation) are shown as unavailable, never as zero.
 */
const STATUS_COLOR: Record<string, string> = { PENDING: '#F59E0B', PAID: '#38BDF8', PROCESSING: '#0E7C74', SHIPPED: '#2563EB', DELIVERED: '#10B981', CANCELLED: '#EF4444' };

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

    const eur = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? '—' : fmt.number(n, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }));
    const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n));
    const day = (d: string, withYear = true) => fmt.date(d + 'T12:00:00Z', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
    const month = (m: string) => fmt.date(m + '-15T12:00:00Z', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const ago = (iso: string) => {
        const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        let rtf: Intl.RelativeTimeFormat;
        try { rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' }); } catch { rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }); }
        return mins < 60 ? rtf.format(-mins, 'minute') : mins < 1440 ? rtf.format(-Math.round(mins / 60), 'hour') : rtf.format(-Math.round(mins / 1440), 'day');
    };

    const first = loading && !data;
    const s = data?.snapshot, c = data?.commercial, r = data?.range, ins = data?.insights;
    const monthly = r?.granularity === 'month';
    const series = (c?.series ?? []).map((b: any) => ({ ...b, label: monthly ? month(b.key) : day(b.key, false) }));
    const withSales = series.filter((b: any) => b.orderValue > 0).length;
    const onlyPoint = withSales === 1 ? series.find((b: any) => b.orderValue > 0) : null;
    const revenueComplete = !!c && c.current.lines > 0 && c.current.linesWithoutNet === 0;
    const prevLabel = r ? tr('vsRange', { from: day(r.previous.from, false), to: day(r.previous.to) }) : '';

    // Shown in place of the trend when nothing was approved in the period: the real work that moves the marketplace forward.
    const quiet: { key: string; value: number; of?: number; href: string; icon: React.ElementType }[] = s ? [
        { key: 'qOrdersPlaced', value: s.orders.placedInPeriod ?? 0, href: '/admin/orders', icon: ShoppingCart },
        { key: 'qOrdersOpen', value: s.orders.open ?? 0, href: '/admin/orders', icon: ClipboardCheck },
        { key: 'qToReview', value: s.products.submissions.byStatus?.PENDING ?? 0, href: '/admin/products/submissions?status=PENDING', icon: ClipboardCheck },
        { key: 'qSubmitted', value: ins?.submissions?.current ?? 0, href: '/admin/products/submissions', icon: Package },
        { key: 'qLive', value: s.products.live ?? 0, href: '/admin/products/catalog?status=APPROVED', icon: Package },
        { key: 'qSuppliersLive', value: s.people.suppliers.withLiveProducts ?? 0, of: s.people.suppliers.total ?? 0, href: '/admin/users?role=SUPPLIER', icon: Store },
        { key: 'qNewSuppliers', value: ins?.newSuppliers?.current ?? 0, href: '/admin/users?role=SUPPLIER&sort=newest', icon: UserPlus },
        { key: 'qCatalogMissing', value: s.products.catalog.missingInfo ?? 0, href: '/admin/products/catalog?attention=missing', icon: FileWarning },
    ] : [];
    const attention: { key: string; count: number; href: string; icon: React.ElementType; tone: Tone }[] = s ? ([
        { key: 'attSubmissions', count: s.products.submissions.byStatus?.PENDING ?? 0, href: '/admin/products/submissions?status=PENDING', icon: ClipboardCheck, tone: 'warning' },
        { key: 'attReady', count: s.orders.readyForApproval, href: '/admin/orders', icon: ShoppingCart, tone: 'danger' },
        { key: 'attDecision', count: s.orders.needsDecision, href: '/admin/orders', icon: ShoppingCart, tone: 'danger' },
        { key: 'attLegacy', count: s.orders.legacyPending, href: '/admin/orders', icon: ShoppingCart, tone: 'warning' },
        { key: 'attDisputes', count: s.disputesOpen, href: '/admin/support?view=disputes', icon: Scale, tone: 'danger' },
        { key: 'attPaymentFailed', count: s.paymentFailed, href: '/admin/orders', icon: Receipt, tone: 'danger' },
        { key: 'attOffers', count: s.offersPending, href: '/admin/offers/supplier', icon: CheckCircle2, tone: 'warning' },
        { key: 'attSupplierAccounts', count: s.people.suppliers.pendingApproval, href: '/admin/users?status=PENDING_APPROVAL', icon: UserPlus, tone: 'warning' },
        { key: 'attBuyerAccounts', count: s.people.buyers.pendingApproval, href: '/admin/users?status=PENDING_APPROVAL', icon: UserPlus, tone: 'warning' },
        { key: 'attKyc', count: s.kycPending, href: '/admin/support?view=kyc', icon: ClipboardCheck, tone: 'warning' },
        { key: 'attLiveIncompleteSub', count: s.products.submissions.liveIncomplete, href: '/admin/products/submissions?status=APPROVED&attention=missing', icon: FileWarning, tone: 'warning' },
        { key: 'attLiveIncompleteCatalog', count: s.products.catalog.liveIncomplete, href: '/admin/products/catalog?status=APPROVED&attention=missing', icon: FileWarning, tone: 'warning' },
        { key: 'attCatalogMissing', count: s.products.catalog.missingInfo, href: '/admin/products/catalog?attention=missing', icon: FileWarning, tone: 'neutral' },
        { key: 'attCatalogImages', count: s.products.catalog.missingImages, href: '/admin/products/catalog?attention=images', icon: ImageIcon, tone: 'neutral' },
    ] as { key: string; count: number; href: string; icon: React.ElementType; tone: Tone }[]).filter((a) => a.count > 0) : [];

    return (
        <div data-no-translate className="text-start space-y-4">
            {/* Header */}
            <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <h1 className="font-sans text-[22px] leading-tight font-semibold text-heading">{tr('pageTitle')}</h1>
                    <p className="mt-0.5 text-[13px] text-ink-3">{tr('pageDesc')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {data && (
                        <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-surface ring-1 ring-line text-[12px] text-ink-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />{tr('updatedAt', { time: fmt.date(data.asOf, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}
                        </span>
                    )}
                    <RangeControl range={range} setRange={setRange} custom={custom} setCustom={setCustom} />
                </div>
            </header>
            {r && <p className="-mt-2 text-[12px] text-ink-3" aria-live="polite">{tr('periodLine', { from: day(r.from), to: day(r.to), prev: prevLabel })}</p>}

            {error && <ErrorState message={error} onRetry={load} />}

            {!(error && !data) && <div aria-busy={loading} className={cn('space-y-4 transition-opacity', loading && data && 'opacity-60')}>
                {/* Row 1 — founder KPIs */}
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <Kpi icon={CircleDollarSign} tone="success" loading={first} label={tr('kpiRevenue')} info={tr('defRevenue')}
                        value={c ? (c.current.lines && !c.current.linesWithNet ? tr('notAvailable') : eur(c.current.revenueRecorded)) : '—'} muted={!!c && !!c.current.lines && !c.current.linesWithNet}
                        delta={c && revenueComplete ? c.change.revenue : undefined}
                        foot={c ? [revenueComplete || !c.current.lines ? tr('gmvLine', { gmv: eur(c.current.orderValue) }) : <span key="p" className="text-amber-800">{tr('revenuePartialShort', { covered: int(c.current.linesWithNet), total: int(c.current.lines) })}</span>, revenueComplete ? null : tr('gmvLine', { gmv: eur(c.current.orderValue) })] : []} />
                    <Kpi icon={Receipt} tone="neutral" loading={first} label={tr('netProfit')} info={tr('defNetProfit')} value={tr('notAvailable')} muted foot={[tr('netProfitShort')]} />
                    <Kpi icon={ShoppingCart} tone="info" loading={first} label={tr('kpiOrders')} info={tr('defOrders')} href="/admin/orders"
                        value={int(s?.orders.total)} foot={s ? [tr('ordersPlaced', { count: s.orders.placedInPeriod }), tr('approvedOrdersLine', { count: c?.current.orders ?? 0 })] : []}
                        delta={s && s.orders.placedPrevious > 0 ? (s.orders.placedInPeriod - s.orders.placedPrevious) / s.orders.placedPrevious : undefined} deltaLabel={tr('deltaPlaced')} />
                    <Kpi icon={AlertTriangle} tone={s?.orders.requiresAction ? 'warning' : 'neutral'} loading={first} label={tr('ordersAction')} info={tr('defOrdersAction')} href="/admin/orders"
                        value={int(s?.orders.requiresAction)} foot={s ? [tr('ordersActionHint', { ready: int(s.orders.readyForApproval), decision: int(s.orders.needsDecision), legacy: int(s.orders.legacyPending) })] : []} />
                </div>

                {/* Row 2 — catalog and people */}
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                    <Kpi small icon={Package} tone="brand" loading={first} label={tr('activeProducts')} info={tr('defActive')} href="/admin/products/catalog?status=APPROVED"
                        value={int(s?.products.active)} foot={s ? [tr('activeLine', { live: int(s.products.live), out: int(s.products.live - s.products.active) })] : []} />
                    <Kpi small icon={Boxes} tone="info" loading={first} label={tr('productsSold')} info={tr('defSold')}
                        value={c ? tr('casesValue', { count: c.current.casesSold, n: int(c.current.casesSold) }) : '—'} delta={c?.change.casesSold}
                        foot={c ? [tr('soldDistinct', { count: c.current.productsSold })] : []} />
                    <Kpi small icon={Store} tone="brand" loading={first} label={tr('suppliers')} info={tr('defSuppliers')} href="/admin/users?role=SUPPLIER"
                        value={int(s?.people.suppliers.total)} foot={s ? [tr('suppliersActive', { active: int(s.people.suppliers.active), live: int(s.people.suppliers.withLiveProducts) })] : []} />
                    <Kpi small icon={Users} tone="info" loading={first} label={tr('buyers')} info={tr('defBuyers')} href="/admin/users?role=CUSTOMER"
                        value={int(s?.people.buyers.total)} foot={s ? [tr('buyersActive', { active: int(s.people.buyers.active) }), tr('buyersOrdering', { count: s.people.buyers.orderingInPeriod })] : []} />
                    <Kpi small icon={Scale} tone={s?.disputesOpen ? 'danger' : 'neutral'} loading={first} label={tr('openDisputes')} info={tr('defDisputes')} href="/admin/support?view=disputes"
                        value={int(s?.disputesOpen)} foot={s ? [tr('cancelledLine', { count: int(s.orders.cancelled) })] : []} />
                </div>

                {/* Row 3 — trend · order status · needs attention */}
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    {!first && withSales === 0 && s ? (
                        <Panel title={tr('quietTitle')} sub={tr('quietSub')}>
                            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {quiet.map((q) => (
                                    <li key={q.key}>
                                        <Link href={q.href} className="block h-full rounded-lg bg-surface-2 ring-1 ring-inset ring-line px-3 py-2.5 hover:ring-teal/50 hover:bg-teal-soft/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal/60">
                                            <span className="flex items-center gap-1.5 text-[12px] text-ink-3"><q.icon size={13} aria-hidden />{tr(q.key)}</span>
                                            <span className="mt-1 block text-[18px] font-semibold text-heading tabular-nums">{int(q.value)}{q.of != null && <span className="text-[12.5px] font-normal text-ink-3"> / {int(q.of)}</span>}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-3"><TrendingUp size={14} aria-hidden />{tr('quietNote')}</p>
                        </Panel>
                    ) : (
                    <Panel title={tr('trendTitle2')} sub={r ? tr('trendSub', { unit: tr(monthly ? 'unitMonth' : 'unitDay') }) : undefined}
                        aside={<div className="flex items-center gap-3 text-[12px] text-ink-3"><Legend color="#0E7C74" label={tr('legendGmv')} /><Legend color="#0B1F3A" label={tr('legendRevenue')} /></div>}>
                        {first ? <Skeleton className="h-[220px]" /> : withSales >= 2 ? (
                            <figure className="h-[220px]" role="img" aria-label={tr('chartAria', { from: r ? day(r.from) : '', to: r ? day(r.to) : '', total: eur(c?.current.orderValue) })}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                                        <defs>
                                            <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0E7C74" stopOpacity={0.22} /><stop offset="100%" stopColor="#0E7C74" stopOpacity={0} /></linearGradient>
                                        </defs>
                                        <CartesianGrid vertical={false} stroke="#E6E8EC" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={54} tickFormatter={(v: number) => fmt.number(v, { notation: 'compact', maximumFractionDigits: 1 })} />
                                        <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
                                            <div className="rounded-lg bg-surface ring-1 ring-line shadow-float px-3 py-2 text-[12.5px] space-y-0.5">
                                                <p className="font-medium text-heading">{payload[0].payload.label}{payload[0].payload.partial ? ` · ${tr('partialShort')}` : ''}</p>
                                                <p className="tabular-nums text-ink-2">{tr('legendGmv')}: {eur(payload[0].payload.orderValue)} · {tr('approvedOrdersLine', { count: payload[0].payload.orders })}</p>
                                                <p className="tabular-nums text-ink-2">{tr('legendRevenue')}: {eur(payload[0].payload.revenue)}{payload[0].payload.linesWithoutNet ? ` · ${tr('linesMissingNet', { count: payload[0].payload.linesWithoutNet })}` : ''}</p>
                                            </div>
                                        ) : null} />
                                        <Area type="monotone" dataKey="orderValue" stroke="#0E7C74" strokeWidth={2} fill="url(#gmvFill)" isAnimationActive={false} />
                                        <Area type="monotone" dataKey="revenue" stroke="#0B1F3A" strokeWidth={2} fill="transparent" isAnimationActive={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </figure>
                        ) : (
                            <div className="h-[220px] rounded-lg bg-surface-2 ring-1 ring-inset ring-line flex flex-col items-center justify-center gap-2 px-6 text-center">
                                <TrendingUp size={20} className="text-ink-4" aria-hidden />
                                <p className="text-[13px] text-ink-2">{withSales === 1 ? tr('trendOnePoint') : tr('chartEmpty')}</p>
                                {onlyPoint && <p className="text-[12.5px] text-ink-3 tabular-nums">{onlyPoint.label}: {eur(onlyPoint.orderValue)} · {tr('approvedOrdersLine', { count: onlyPoint.orders })}</p>}
                            </div>
                        )}
                    </Panel>
                    )}

                    <Panel title={tr('statusTitle')} sub={tr('statusSub')}>
                        {first ? <Skeleton className="h-[220px]" /> : !data?.ordersByStatus?.total ? (
                            <p className="h-[220px] flex items-center justify-center text-[13px] text-ink-3 text-center">{tr('statusEmpty')}</p>
                        ) : (
                            <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-4">
                                <div className="relative w-[136px] h-[136px] shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={data.ordersByStatus.rows.filter((x: any) => x.count > 0)} dataKey="count" nameKey="status" innerRadius={46} outerRadius={64} paddingAngle={1.5} stroke="none" isAnimationActive={false}>
                                                {data.ordersByStatus.rows.filter((x: any) => x.count > 0).map((x: any) => <Cell key={x.status} fill={STATUS_COLOR[x.status]} />)}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[20px] font-semibold text-heading tabular-nums">{int(data.ordersByStatus.total)}</span>
                                        <span className="text-[11px] text-ink-3">{tr('ordersWord')}</span>
                                    </div>
                                </div>
                                <ul className="w-full space-y-1.5 text-[12.5px]">
                                    {data.ordersByStatus.rows.map((x: any) => (
                                        <li key={x.status} className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[x.status] }} aria-hidden />
                                            <span className="flex-1 min-w-0 truncate text-ink-2">{t('supplierShell', ORDER_LABEL[x.status])}</span>
                                            <span className="tabular-nums font-medium text-heading">{int(x.count)}</span>
                                            <span className="w-12 text-end tabular-nums text-ink-4">{fmt.number(x.share, { style: 'percent', maximumFractionDigits: 1 })}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </Panel>

                    <Panel title={tr('attentionTitle')} sub={tr('attentionSub')} flush>
                        {first ? <div className="px-4 pb-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div>
                            : attention.length === 0 ? <p className="px-4 pb-4 text-[13px] text-ink-3 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" />{tr('attentionNone')}</p>
                            : (
                                <ul className="divide-y divide-line max-h-[236px] overflow-y-auto">
                                    {attention.map((a) => {
                                        const Icon = a.icon;
                                        return (
                                            <li key={a.key}>
                                                <Link href={a.href} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal">
                                                    <span className={cn('w-7 h-7 rounded-lg ring-1 ring-inset flex items-center justify-center shrink-0', TONE[a.tone].soft, TONE[a.tone].text)}><Icon size={14} /></span>
                                                    <span className="flex-1 min-w-0 text-[12.5px] leading-[17px] text-ink">{tr(a.key)}</span>
                                                    <span className="text-[13px] font-semibold text-heading tabular-nums">{int(a.count)}</span>
                                                    <ArrowRight size={13} className="text-ink-4 rtl:rotate-180 shrink-0" aria-hidden />
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                    </Panel>
                </div>

                {/* Row 4 — suppliers · products · activity */}
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
                    <Panel title={tr('topSuppliers')} sub={tr('topSuppliersSub')} flush action={<Link href="/admin/users?role=SUPPLIER" className="text-[12.5px] font-medium text-teal hover:underline">{tr('viewAll')}</Link>}>
                        {first ? <ListSkeleton /> : !c?.topSuppliers?.length ? <Empty text={tr('noSales')} /> : (
                            <table className="w-full text-[12.5px]">
                                <thead><tr className="text-[11.5px] text-ink-3"><th className="text-start font-medium ps-4 py-1.5 w-8">#</th><th className="text-start font-medium px-2 py-1.5">{tr('supplierCol')}</th><th className="text-end font-medium px-2 py-1.5">{tr('valueCol')}</th><th className="text-end font-medium pe-4 py-1.5">{tr('ordersCol')}</th></tr></thead>
                                <tbody>{c.topSuppliers.map((x: any, i: number) => (
                                    <tr key={x.supplierId} className="border-t border-line">
                                        <td className="ps-4 py-2 text-ink-4 tabular-nums">{i + 1}</td>
                                        <td className="px-2 py-2 max-w-0 w-full"><Link href={`/admin/products/submissions?supplier=${x.supplierId}`} className="block truncate font-medium text-ink hover:underline">{x.name || '—'}</Link></td>
                                        <td className="px-2 py-2 text-end tabular-nums whitespace-nowrap">{eur(x.orderValue)}</td>
                                        <td className="pe-4 py-2 text-end tabular-nums">{int(x.orders)}</td>
                                    </tr>))}
                                </tbody>
                            </table>
                        )}
                    </Panel>

                    <Panel title={tr('topProducts')} sub={tr('topProductsSub')} flush action={<Link href="/admin/products/catalog?status=APPROVED" className="text-[12.5px] font-medium text-teal hover:underline">{tr('viewAll')}</Link>}>
                        {first ? <ListSkeleton /> : !c?.topProducts?.length ? <Empty text={tr('noSales')} /> : (
                            <table className="w-full text-[12.5px]">
                                <thead><tr className="text-[11.5px] text-ink-3"><th className="text-start font-medium ps-4 py-1.5 w-8">#</th><th className="text-start font-medium px-2 py-1.5">{tr('productCol')}</th><th className="text-end font-medium px-2 py-1.5">{tr('casesCol')}</th><th className="text-end font-medium pe-4 py-1.5">{tr('valueCol')}</th></tr></thead>
                                <tbody>{c.topProducts.map((p: any, i: number) => (
                                    <tr key={p.productId} className="border-t border-line">
                                        <td className="ps-4 py-1.5 text-ink-4 tabular-nums">{i + 1}</td>
                                        <td className="px-2 py-1.5 max-w-0 w-full"><Link href={`/admin/products/${p.productId}`} className="flex items-center gap-2 min-w-0 hover:underline"><Thumb src={p.image} size={28} /><span className="truncate font-medium text-ink">{p.name}</span></Link></td>
                                        <td className="px-2 py-1.5 text-end tabular-nums">{int(p.units)}</td>
                                        <td className="pe-4 py-1.5 text-end tabular-nums whitespace-nowrap">{eur(p.orderValue)}</td>
                                    </tr>))}
                                </tbody>
                            </table>
                        )}
                    </Panel>

                    <Panel title={tr('activityTitle')} sub={tr('activitySub')} flush className="lg:col-span-2 xl:col-span-1">
                        {first ? <ListSkeleton /> : !data?.activity?.length ? <Empty text={tr('activityEmpty')} /> : (
                            <ul className="divide-y divide-line">
                                {data.activity.slice(0, 6).map((a: any, i: number) => {
                                    const m = ACTIVITY[a.kind] || ACTIVITY.ORDER_PLACED;
                                    const Icon = m.icon;
                                    return (
                                        <li key={i}>
                                            <Link href={a.href} className="flex items-start gap-2.5 px-4 py-2 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal">
                                                <span className={cn('mt-0.5 w-7 h-7 rounded-lg ring-1 ring-inset flex items-center justify-center shrink-0', TONE[m.tone].soft, TONE[m.tone].text)}><Icon size={14} /></span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-[12.5px] text-ink leading-[17px] truncate">{activityTitle(a, tr)}</span>
                                                    <span className="block text-[11.5px] text-ink-3 truncate">{activityDetail(a, tr)}</span>
                                                </span>
                                                <span className="text-[11px] text-ink-4 whitespace-nowrap">{ago(a.at)}</span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Panel>
                </div>

                {/* Row 5 — recent orders · money definitions · quick actions */}
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Panel title={tr('recentOrders')} sub={tr('recentOrdersSub')} flush action={<Link href="/admin/orders" className="text-[12.5px] font-medium text-teal hover:underline">{tr('viewAll')}</Link>}>
                        {first ? <ListSkeleton /> : !data?.recentOrders?.length ? <Empty text={tr('ordersEmpty')} /> : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px] min-w-[520px]">
                                    <thead><tr className="text-[11.5px] text-ink-3"><th className="text-start font-medium ps-4 py-1.5">{tr('orderCol')}</th><th className="text-start font-medium px-2 py-1.5">{tr('buyerCol')}</th><th className="text-start font-medium px-2 py-1.5">{tr('statusCol')}</th><th className="text-end font-medium px-2 py-1.5">{tr('totalCol')}</th><th className="text-end font-medium pe-4 py-1.5">{tr('placedCol')}</th></tr></thead>
                                    <tbody>{data.recentOrders.map((o: any) => (
                                        <tr key={o.id} className="border-t border-line">
                                            <td className="ps-4 py-2"><Link href={`/admin/orders/${o.id}`} className="font-mono text-[12px] font-medium text-teal hover:underline">#{o.ref}</Link></td>
                                            <td className="px-2 py-2 max-w-[18ch] truncate text-ink-2">{o.buyer || '—'}</td>
                                            <td className="px-2 py-2"><StatusBadge status={o.status} kind="order" /></td>
                                            <td className="px-2 py-2 text-end tabular-nums whitespace-nowrap">{eur(o.total)}</td>
                                            <td className="pe-4 py-2 text-end text-ink-3 whitespace-nowrap">{ago(o.createdAt)}</td>
                                        </tr>))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>

                    <Panel title={tr('moneyTitle2')} sub={tr('moneySub')}>
                        {first ? <Skeleton className="h-40" /> : c && (
                            <dl className="space-y-2 text-[12.5px]">
                                <Money label={tr('orderValue')} value={eur(c.current.orderValue)} hint={tr('defOrderValueShort')} />
                                <Money label={tr('legendRevenue')} value={c.current.lines && !c.current.linesWithNet ? tr('notAvailable') : eur(c.current.revenueRecorded)} hint={revenueComplete ? tr('revenueComplete') : c.current.lines ? tr('revenuePartialShort', { covered: int(c.current.linesWithNet), total: int(c.current.lines) }) : tr('revenueNone')} />
                                <Money label={tr('received')} value={c.payments.recordsEver ? eur(c.payments.current.amount) : tr('notRecorded')} hint={c.payments.recordsEver ? tr('receivedLine', { count: c.payments.current.payments }) : tr('receivedNone')} />
                                {c.markedPaid.orders > 0 && <Money label={tr('markedPaidLabel')} value={eur(c.markedPaid.amount)} hint={tr('markedPaidHint', { count: c.markedPaid.orders })} warn />}
                                <Money label={tr('refunds')} value={c.refunds.current.count ? eur(c.refunds.current.amount) : int(0)} hint={tr('refundsHintShort')} />
                                <Money label={tr('aov')} value={c.current.aov == null ? '—' : eur(c.current.aov)} hint={tr('aovHint')} />
                            </dl>
                        )}
                    </Panel>

                    <Panel title={tr('quickActions')} sub={tr('quickActionsSub')}>
                        <div className="grid grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-2">
                            {QUICK.map((q) => {
                                const Icon = q.icon;
                                return (
                                    <Link key={q.href} href={q.href} className="flex items-center gap-2.5 h-11 px-3 rounded-lg ring-1 ring-line bg-surface hover:bg-surface-2 hover:ring-line-strong text-[12.5px] font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                                        <span className="w-7 h-7 rounded-md bg-teal-soft text-teal flex items-center justify-center shrink-0"><Icon size={14} /></span>
                                        <span className="truncate">{tr(q.key)}</span>
                                    </Link>
                                );
                            })}
                        </div>
                        {ins && <p className="mt-3 text-[11.5px] text-ink-3">{tr('submissionsFoot', { count: ins.submissions.current, suppliers: ins.submissions.suppliers })}</p>}
                    </Panel>
                </div>
            </div>}
        </div>
    );
}

const ORDER_LABEL: Record<string, string> = { PENDING: 'orderAwaiting', PAID: 'orderPaidAwaiting', PROCESSING: 'orderPreparing', SHIPPED: 'orderShipped', DELIVERED: 'orderDelivered', CANCELLED: 'orderCancelled' };
const ACTIVITY: Record<string, { icon: React.ElementType; tone: Tone }> = {
    ORDER_PLACED: { icon: ShoppingCart, tone: 'info' },
    DISPUTE_OPENED: { icon: Scale, tone: 'danger' },
    ACCOUNT_REGISTERED: { icon: UserPlus, tone: 'brand' },
    PRODUCT_REVIEW: { icon: ClipboardCheck, tone: 'warning' },
};
const QUICK: { href: string; key: string; icon: React.ElementType }[] = [
    { href: '/admin/products/submissions?status=PENDING', key: 'qaReview', icon: ClipboardCheck },
    { href: '/admin/orders', key: 'qaOrders', icon: ShoppingCart },
    { href: '/admin/products/new', key: 'qaAddProduct', icon: PackagePlus },
    { href: '/admin/products/catalog/import', key: 'qaImport', icon: Upload },
    { href: '/admin/users?status=PENDING_APPROVAL', key: 'qaAccounts', icon: UserPlus },
    { href: '/admin/support?view=disputes', key: 'qaDisputes', icon: Ban },
];

function activityTitle(a: any, tr: (k: string, v?: Record<string, string | number>) => string) {
    switch (a.kind) {
        case 'ORDER_PLACED': return tr('actOrder', { ref: a.subject });
        case 'DISPUTE_OPENED': return tr('actDispute', { ref: a.subject });
        case 'ACCOUNT_REGISTERED': return tr(a.detail === 'SUPPLIER' ? 'actSupplier' : 'actBuyer', { name: a.subject || '—' });
        default: return tr(`actReview_${a.detail}`, { name: a.subject });
    }
}
function activityDetail(a: any, tr: (k: string, v?: Record<string, string | number>) => string) {
    switch (a.kind) {
        case 'ORDER_PLACED': return a.detail || '—';
        case 'DISPUTE_OPENED': return a.detail || '—';
        case 'ACCOUNT_REGISTERED': return tr(a.detail === 'SUPPLIER' ? 'roleSupplier' : 'roleBuyer');
        default: return tr('actReviewDetail');
    }
}

function RangeControl({ range, setRange, custom, setCustom }: { range: RangeId; setRange: (r: RangeId) => void; custom: CustomRange; setCustom: (c: CustomRange) => void }) {
    const { t } = useLanguage();
    const today = new Date().toISOString().slice(0, 10);
    return (
        <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
                <span className="sr-only">{t('supplierOverview', 'rangeAria')}</span>
                <CalendarDays size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
                <select value={range} onChange={(e) => setRange(e.target.value as RangeId)} className={cn(selectCls, 'h-8 ps-8 text-[13px] w-[11.5rem]')}>
                    {RANGES.map((x) => <option key={x.id} value={x.id}>{t('supplierOverview', x.labelKey)}</option>)}
                </select>
            </label>
            {range === 'custom' && (
                <span className="flex items-center gap-1.5">
                    <label className="sr-only" htmlFor="ov-from">{t('supplierOverview', 'fromLabel')}</label>
                    <input id="ov-from" type="date" max={custom.to} value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} className={cn(inputCls, 'h-8 w-[9.5rem] text-[12.5px]')} />
                    <span className="text-ink-3 text-[12px]">{t('supplierOverview', 'rangeSeparator')}</span>
                    <label className="sr-only" htmlFor="ov-to">{t('supplierOverview', 'toLabel')}</label>
                    <input id="ov-to" type="date" min={custom.from} max={today} value={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} className={cn(inputCls, 'h-8 w-[9.5rem] text-[12.5px]')} />
                </span>
            )}
        </div>
    );
}

/** KPI card: tinted icon, label with its definition, value, a real comparison when one exists, short footnotes. */
function Kpi({ icon: Icon, tone, label, info, value, foot = [], delta, deltaLabel, loading, href, muted, small }: {
    icon: React.ElementType; tone: Tone; label: string; info: string; value: React.ReactNode; foot?: React.ReactNode[];
    delta?: number | null; deltaLabel?: string; loading?: boolean; href?: string; muted?: boolean; small?: boolean;
}) {
    const { fmt, t } = useLanguage();
    const up = (delta ?? 0) > 0.0005, down = (delta ?? 0) < -0.0005;
    const body = (
        <div className="flex items-start gap-3">
            <span className={cn('rounded-xl ring-1 ring-inset flex items-center justify-center shrink-0', small ? 'w-9 h-9' : 'w-10 h-10', TONE[tone].soft, TONE[tone].text)}><Icon size={small ? 17 : 19} aria-hidden /></span>
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[12.5px] font-medium text-ink-3 leading-5">
                    <span className="truncate">{label}</span>
                    <span title={info} className="text-ink-4 shrink-0" aria-hidden><Info size={12} /></span>
                    <span className="sr-only">{info}</span>
                </p>
                {loading ? <Skeleton className="mt-1.5 h-7 w-24" /> : (
                    <p className={cn('font-semibold tabular-nums leading-tight', muted ? 'mt-1 text-[15px] text-ink-3' : small ? 'mt-0.5 text-[20px] text-heading' : 'mt-0.5 text-[24px] text-heading')}>{value}</p>
                )}
                {!loading && delta != null && Number.isFinite(delta) && (
                    <p className={cn('mt-0.5 inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums', up ? 'text-emerald-700' : down ? 'text-red-700' : 'text-ink-3')} dir="ltr">
                        {up ? <ArrowUpRight size={13} /> : down ? <ArrowDownRight size={13} /> : null}
                        {fmt.number(delta, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })}
                        <span className="ms-1 font-normal text-ink-3">{deltaLabel || t('adminOverview', 'deltaPrev')}</span>
                    </p>
                )}
                {!loading && foot.filter(Boolean).map((f, i) => <p key={i} className="text-[11.5px] leading-[16px] text-ink-3 mt-0.5">{f}</p>)}
            </div>
        </div>
    );
    const cls = cn('block rounded-xl bg-surface ring-1 ring-line shadow-[0_1px_2px_rgba(15,23,42,0.04)]', small ? 'p-3' : 'p-3.5', 'min-h-[104px]');
    return href ? <Link href={href} className={cn(cls, 'hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal')}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Panel({ title, sub, aside, action, children, flush, className }: { title: string; sub?: string; aside?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; flush?: boolean; className?: string }) {
    return (
        <section className={cn('rounded-xl bg-surface ring-1 ring-line shadow-[0_1px_2px_rgba(15,23,42,0.04)] min-w-0', className)}>
            <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3.5 pb-2.5">
                <div className="min-w-0">
                    <h2 className="font-sans text-[14px] font-semibold text-heading">{title}</h2>
                    {sub && <p className="text-[11.5px] text-ink-3">{sub}</p>}
                </div>
                {aside}{action}
            </div>
            <div className={flush ? 'pb-1.5' : 'px-4 pb-4'}>{children}</div>
        </section>
    );
}

function Legend({ color, label }: { color: string; label: string }) {
    return <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[3px] rounded-full" style={{ backgroundColor: color }} aria-hidden />{label}</span>;
}
function Money({ label, value, hint, warn }: { label: string; value: React.ReactNode; hint?: string; warn?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><dt className="text-ink-2 font-medium">{label}</dt>{hint && <dd className={cn('text-[11.5px]', warn ? 'text-amber-800' : 'text-ink-3')}>{hint}</dd>}</div>
            <dd className="tabular-nums font-semibold text-heading whitespace-nowrap">{value}</dd>
        </div>
    );
}
function ListSkeleton() { return <div className="px-4 pb-3 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>; }
function Empty({ text }: { text: string }) { return <p className="px-4 pb-3 text-[12.5px] text-ink-3">{text}</p>; }
