'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, Clock3, FileWarning, Image as ImageIcon, Scale, ShoppingCart, Store, Users, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { adminApi } from '@/lib/admin-api';
import { Badge, Card, ErrorState, PageHeader, Skeleton, Stat, TONE, Thumb, type Tone } from '@/components/supplier/ui';
import { RangePicker, defaultCustom, rangeErrorKey, type CustomRange, type RangeId } from '@/components/dashboard/RangePicker';
import { Trans } from '@/components/i18n/Trans';
import DeveloperDashboard from './components/DeveloperDashboard';

/**
 * Founder Overview (/admin). Every figure comes from GET /dashboard/admin/overview
 * (definitions in backend/src/admin/admin-overview.ts); the page only formats
 * them. Current counts ("as of now") and period figures are kept apart.
 */
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
    const chart = (c?.series ?? []).map((b: any) => ({ ...b, label: monthly ? month(b.key) : day(b.key, false) }));
    const hasSales = chart.some((b: any) => b.orderValue > 0);
    const unit = tr(monthly ? 'unitMonth' : 'unitDay');

    const change = (v: number | null | undefined, prev: string) => v === null || v === undefined
        ? <span className="text-ink-3">{tr('noPrev')}</span>
        : <Trans text={tr('vsPrev', { change: pct(v), prev })} tags={{ b: (x) => <b dir="ltr" className={cn('font-semibold', TONE[(v > 0.005 ? 'success' : v < -0.005 ? 'danger' : 'neutral') as Tone].text)}>{x}</b> }} />;

    const split = (block: any, status: string) => tr('splitHint', { catalog: int(block?.catalog?.byStatus?.[status] ?? 0), submissions: int(block?.submissions?.byStatus?.[status] ?? 0) });
    const prodLink = (status: string) => `/admin/products?tab=submissions&status=${status}`;

    // Attention rows: only real, non-zero counts; severity reflects how directly money or a waiting person is affected.
    type Sev = 'high' | 'medium' | 'low';
    const attention: { key: string; count: number; href: string; sev: Sev }[] = s ? ([
        { key: 'attReady', count: s.orders.readyForApproval, href: '/admin/orders', sev: 'high' },
        { key: 'attDecision', count: s.orders.needsDecision, href: '/admin/orders', sev: 'high' },
        { key: 'attLegacy', count: s.orders.legacyPending, href: '/admin/orders', sev: 'medium' },
        { key: 'attPaymentFailed', count: s.paymentFailed, href: '/admin/orders', sev: 'high' },
        { key: 'attDisputes', count: s.disputesOpen, href: '/admin/disputes', sev: 'high' },
        { key: 'attSubmissions', count: s.products.submissions.byStatus?.PENDING ?? 0, href: prodLink('PENDING'), sev: 'medium' },
        { key: 'attOffers', count: s.offersPending, href: '/admin/wholesale-offers', sev: 'medium' },
        { key: 'attSupplierAccounts', count: s.people.suppliers.pendingApproval, href: '/admin/users?status=PENDING_APPROVAL', sev: 'medium' },
        { key: 'attBuyerAccounts', count: s.people.buyers.pendingApproval, href: '/admin/users?status=PENDING_APPROVAL', sev: 'medium' },
        { key: 'attKyc', count: s.kycPending, href: '/admin/kyc', sev: 'medium' },
        { key: 'attLiveIncomplete', count: s.products.catalog.liveIncomplete + s.products.submissions.liveIncomplete, href: '/admin/products?tab=submissions&status=APPROVED&attention=missing', sev: 'medium' },
        { key: 'attCatalogMissing', count: s.products.catalog.missingInfo, href: '/admin/products?tab=catalog&attention=missing', sev: 'low' },
        { key: 'attSubMissing', count: s.products.submissions.missingInfo, href: '/admin/products?tab=submissions&attention=missing', sev: 'low' },
        { key: 'attCatalogImages', count: s.products.catalog.missingImages, href: '/admin/products?tab=catalog&attention=images', sev: 'low' },
        { key: 'attSubImages', count: s.products.submissions.missingImages, href: '/admin/products?tab=submissions&attention=images', sev: 'low' },
    ] as { key: string; count: number; href: string; sev: Sev }[]).filter((a) => a.count > 0) : [];
    const SEV: Record<string, { tone: Tone; key: string }> = { high: { tone: 'danger', key: 'sevHigh' }, medium: { tone: 'warning', key: 'sevMedium' }, low: { tone: 'neutral', key: 'sevLow' } };

    return (
        <div data-no-translate className="text-start -mt-2">
            <PageHeader eyebrow={tr('eyebrow')} title={tr('title')} description={tr('desc')} />
            {error && <div className="mb-4"><ErrorState message={error} onRetry={load} /></div>}

            {!(error && !data) && <div aria-busy={loading} className={cn('space-y-6 transition-opacity', loading && data && 'opacity-60')}>
            {/* A — Marketplace snapshot (now) */}
            <Group id="ov-snap" title={tr('snapshotTitle')} description={data ? tr('asOf', { time: fmt.date(data.asOf, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : tr('snapshotDesc')}>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                    <Stat loading={first} label={tr('suppliers')} value={int(s?.people.suppliers.total)} icon={<Store size={17} />} href="/admin/suppliers" hint={s && tr('suppliersHint', { active: int(s.people.suppliers.active), pending: int(s.people.suppliers.pendingApproval) })} />
                    <Stat loading={first} label={tr('buyers')} value={int(s?.people.buyers.total)} icon={<Users size={17} />} href="/admin/buyers" hint={s && tr('buyersHint', { active: int(s.people.buyers.active), pending: int(s.people.buyers.pendingApproval) })} />
                    <Stat loading={first} label={tr('products')} value={int(s?.products.total)} icon={<Boxes size={17} />} href="/admin/products" hint={s && tr('productsHint', { catalog: int(s.products.catalog.total), submissions: int(s.products.submissions.total) })} />
                    <Stat loading={first} label={tr('orders')} value={int(s?.orders.total)} icon={<ShoppingCart size={17} />} href="/admin/orders" hint={s && <>{tr('ordersHint', { open: int(s.orders.open) })} · {tr('cancelledLine', { count: int(s.orders.cancelled) })}</>} />
                    <Stat loading={first} label={tr('ordersAction')} value={int(s?.orders.requiresAction)} icon={<Clock3 size={17} />} tone={s?.orders.requiresAction ? 'warning' : 'neutral'} href="/admin/orders" hint={s && tr('ordersActionHint', { ready: int(s.orders.readyForApproval), decision: int(s.orders.needsDecision), legacy: int(s.orders.legacyPending) })} />
                    <Stat loading={first} label={tr('disputes')} value={int(s?.disputesOpen)} icon={<Scale size={17} />} tone={s?.disputesOpen ? 'danger' : 'neutral'} href="/admin/disputes" />
                </div>
                <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-5">
                    <Stat loading={first} label={tr('live')} value={int(s?.products.byStatus?.APPROVED ?? 0)} tone="success" icon={<CheckCircle2 size={17} />} href={prodLink('APPROVED')} hint={s && split(s.products, 'APPROVED')} />
                    <Stat loading={first} label={tr('awaitingReview')} value={int(s?.products.byStatus?.PENDING ?? 0)} tone={s?.products.byStatus?.PENDING ? 'warning' : 'neutral'} icon={<Clock3 size={17} />} href={prodLink('PENDING')} hint={s && split(s.products, 'PENDING')} />
                    <Stat loading={first} label={tr('changesRequested')} value={int(s?.products.byStatus?.NEEDS_CHANGES ?? 0)} icon={<FileWarning size={17} />} href={prodLink('NEEDS_CHANGES')} hint={s && split(s.products, 'NEEDS_CHANGES')} />
                    <Stat loading={first} label={tr('rejected')} value={int(s?.products.byStatus?.REJECTED ?? 0)} icon={<XCircle size={17} />} href={prodLink('REJECTED')} hint={s && split(s.products, 'REJECTED')} />
                    <Stat loading={first} label={tr('drafts')} value={int(s?.products.byStatus?.DRAFT ?? 0)} icon={<Boxes size={17} />} href={prodLink('DRAFT')} hint={s && split(s.products, 'DRAFT')} />
                </div>
            </Group>

            {/* B — Commercial performance (period) */}
            <Group id="ov-com" title={tr('commercialTitle')} description={tr('commercialDesc')}
                aside={<RangePicker range={range} onRange={setRange} custom={custom} onCustom={setCustom} resolved={r ?? null} idPrefix="ov" />}>
                <div className="rounded-xl bg-surface ring-1 ring-line p-4 sm:p-5">
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                        <div>
                            <p className="text-[12.5px] font-medium text-ink-3">{tr('orderValue')} <span className="text-ink-4">· {tr('orderValueDef')}</span></p>
                            {first ? <Skeleton className="mt-2 h-9 w-44" /> : <p className="mt-1 text-[28px] leading-9 font-semibold text-heading tabular-nums">{eur(c?.current.orderValue)}</p>}
                            {c && !first && (
                                <div className="mt-1 space-y-0.5 text-[12.5px] text-ink-3">
                                    <p>{tr('approvedOrdersLine', { count: c.current.orders })}</p>
                                    <p>{change(c.change.orderValue, eur(c.previous.orderValue))}</p>
                                </div>
                            )}
                            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                                <Figure label={tr('aov')} value={c?.current.aov == null ? tr('aovNA') : eur(c.current.aov)} sub={c && c.change.aov != null ? change(c.change.aov, eur(c.previous.aov)) : null} loading={first} />
                                <Figure label={tr('supplierNet')} value={eur(c?.current.supplierNet)} sub={c && c.current.linesWithoutNet > 0 ? tr('supplierNetHint', { lines: c.current.linesWithoutNet }) : null} loading={first} />
                                <Figure label={tr('margin')} value={c?.current.margin == null ? (c?.current.orders ? tr('marginNA', { count: int(c.current.linesWithoutNet) }) : tr('marginNone')) : eur(c.current.margin)} loading={first} muted={c?.current.margin == null} />
                                <Figure label={tr('received')} value={eur(c?.payments.current.amount)} sub={c ? <>{tr('receivedHint', { count: c.payments.current.orders })} · {change(c.payments.change, eur(c.payments.previous.amount))}</> : null} loading={first} />
                                <Figure label={tr('outstanding')} value={eur(s?.outstanding.amount)} sub={s ? tr('outstandingHint', { count: s.outstanding.orders }) : null} loading={first} />
                                <Figure label={tr('refunds')} value={c?.refunds.current.count ? eur(c.refunds.current.amount) : int(c?.refunds.current.count)} sub={s ? tr('refundsHint', { marked: s.refundedOrders }) : null} loading={first} />
                                <Figure label={tr('cancelledPeriod')} value={int(c?.cancellations.current.count)} sub={s?.orders.cancelledUndated ? tr('cancelledUndated', { count: int(s.orders.cancelledUndated) }) : (c ? change(c.cancellations.change, int(c.cancellations.previous.count)) : null)} loading={first} />
                            </dl>
                            {c && c.payments.undated.orders > 0 && <p className="mt-3 text-[12px] text-amber-800">{tr('receivedUndated', { count: c.payments.undated.orders, amount: eur(c.payments.undated.amount) })}</p>}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[12.5px] font-medium text-ink-3">{tr('chartTitle', { unit })}</p>
                                {chart.some((b: any) => b.partial) && <p className="text-[12px] text-ink-4">{tr('chartPartial', { unit })}</p>}
                            </div>
                            {first ? <Skeleton className="mt-2 h-[200px]" /> : hasSales ? (
                                <figure className="mt-2 h-[200px]" role="img" aria-label={tr('chartAria', { from: r ? day(r.from) : '', to: r ? day(r.to) : '', total: eur(c?.current.orderValue) })}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={monthly ? '28%' : '35%'}>
                                            <CartesianGrid vertical={false} stroke="#E6E8EC" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} interval={monthly ? 0 : 'preserveStartEnd'} minTickGap={16} />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmt.number(v, { notation: 'compact', maximumFractionDigits: 1 })} />
                                            <Tooltip cursor={{ fill: '#F6F8FA' }} content={({ active, payload }) => active && payload?.[0] ? (
                                                <div className="rounded-lg bg-surface ring-1 ring-line shadow-float px-3 py-2 text-[12.5px]">
                                                    <p className="font-medium text-heading">{payload[0].payload.label}</p>
                                                    <p className="tabular-nums text-ink-2">{eur(payload[0].payload.orderValue)} · {tr('approvedOrdersLine', { count: payload[0].payload.orders })}</p>
                                                </div>
                                            ) : null} />
                                            <Bar dataKey="orderValue" fill="#0B1F3A" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </figure>
                            ) : (
                                <div className="mt-2 h-[200px] rounded-lg bg-surface-2 ring-1 ring-inset ring-line flex items-center justify-center text-[13px] text-ink-3 px-4 text-center">{tr('chartEmpty')}</div>
                            )}
                        </div>
                    </div>
                    <details className="mt-4 pt-3 border-t border-line text-[12.5px] text-ink-3">
                        <summary className="cursor-pointer font-medium text-ink-2 hover:text-heading">{tr('howTitle')}</summary>
                        <ul className="mt-2 space-y-1 list-disc ps-5 max-w-prose">
                            {['how1', 'how2', 'how3', 'how4', 'how5', 'how6'].map((k) => <li key={k}>{tr(k)}</li>)}
                        </ul>
                    </details>
                </div>
            </Group>

            {/* C — Attention required (now) */}
            <Group id="ov-att" title={tr('attentionTitle')} description={tr('attentionDesc')}>
                <Card bodyClassName="p-0">
                    {first ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                        : attention.length === 0 ? <p className="px-4 py-5 text-[13.5px] text-ink-3 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" />{tr('attentionNone')}</p>
                        : (
                            <ul className="divide-y divide-line">
                                {attention.map((a) => (
                                    <li key={a.key}>
                                        <Link href={a.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal">
                                            <AlertTriangle size={15} className={cn('shrink-0', TONE[SEV[a.sev].tone].text)} aria-hidden />
                                            <span className="flex-1 min-w-0 text-[13.5px] text-ink truncate">{tr(a.key)}</span>
                                            <Badge tone={SEV[a.sev].tone}>{tr(SEV[a.sev].key)}</Badge>
                                            <span className="w-12 text-end text-[14px] font-semibold text-heading tabular-nums">{int(a.count)}</span>
                                            <ArrowRight size={15} className="text-ink-4 rtl:rotate-180" aria-hidden />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                </Card>
            </Group>

            {/* D — Product & supplier insights (period) */}
            <Group id="ov-ins" title={tr('insightsTitle')} description={r ? tr('insightsDesc', { from: day(r.from), to: day(r.to) }) : ''}>
                <div className="grid gap-3 lg:grid-cols-2">
                    <Card title={tr('topProducts')} description={tr('topProductsDef')} bodyClassName="p-0">
                        {first ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
                            : !c?.topProducts?.length ? <p className="px-4 pb-4 text-[13px] text-ink-3">{tr('noSales')}</p> : (
                                <table className="w-full text-[13px]">
                                    <thead><tr className="text-[12px] text-ink-3"><th className="text-start font-medium px-4 py-2">{tr('productCol')}</th><th className="text-end font-medium px-2 py-2">{tr('unitsCol')}</th><th className="text-end font-medium px-2 py-2">{tr('ordersCol')}</th><th className="text-end font-medium px-4 py-2">{tr('valueCol')}</th></tr></thead>
                                    <tbody>{c.topProducts.map((p: any) => (
                                        <tr key={p.productId} className="border-t border-line">
                                            <td className="px-4 py-2"><Link href={`/admin/products/${p.productId}`} className="flex items-center gap-2 min-w-0 hover:underline"><Thumb src={p.image} size={28} /><span className="truncate max-w-[22ch]">{p.name}</span></Link></td>
                                            <td className="px-2 py-2 text-end tabular-nums">{int(p.units)}</td><td className="px-2 py-2 text-end tabular-nums">{int(p.orders)}</td><td className="px-4 py-2 text-end tabular-nums font-medium">{eur(p.orderValue)}</td>
                                        </tr>))}
                                    </tbody>
                                </table>
                            )}
                    </Card>
                    <Card title={tr('topSuppliers')} description={tr('topSuppliersDef')} bodyClassName="p-0">
                        {first ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
                            : !c?.topSuppliers?.length ? <p className="px-4 pb-4 text-[13px] text-ink-3">{tr('noSales')}</p> : (
                                <table className="w-full text-[13px]">
                                    <thead><tr className="text-[12px] text-ink-3"><th className="text-start font-medium px-4 py-2">{tr('supplierCol')}</th><th className="text-end font-medium px-2 py-2">{tr('ordersCol')}</th><th className="text-end font-medium px-2 py-2">{tr('netCol')}</th><th className="text-end font-medium px-4 py-2">{tr('valueCol')}</th></tr></thead>
                                    <tbody>{c.topSuppliers.map((x: any) => (
                                        <tr key={x.supplierId} className="border-t border-line">
                                            <td className="px-4 py-2 truncate max-w-[24ch]">{x.name || x.supplierId}</td>
                                            <td className="px-2 py-2 text-end tabular-nums">{int(x.orders)}</td><td className="px-2 py-2 text-end tabular-nums">{x.supplierNet == null ? <span className="text-ink-4">—</span> : eur(x.supplierNet)}</td><td className="px-4 py-2 text-end tabular-nums font-medium">{eur(x.orderValue)}</td>
                                        </tr>))}
                                    </tbody>
                                </table>
                            )}
                    </Card>
                    <Card title={tr('submissionsTitle')}>
                        {first ? <Skeleton className="h-16" /> : ins && (
                            <dl className="grid grid-cols-2 gap-3 text-[13px]">
                                <Figure label={tr('submissionsNew')} value={int(ins.submissions.current)} sub={<>{tr('submissionsSuppliers', { count: ins.submissions.suppliers })} · {tr('prevLabel', { n: int(ins.submissions.previous) })}</>} />
                                <Figure label={tr('newSuppliers')} value={int(ins.newSuppliers.current)} sub={tr('prevLabel', { n: int(ins.newSuppliers.previous) })} />
                                <Figure label={tr('decApproved')} value={int(ins.decisions.approved)} />
                                <Figure label={tr('decRejected')} value={int(ins.decisions.rejected)} />
                                <Figure label={tr('decChanges')} value={int(ins.decisions.changesRequested)} />
                                <Figure label={tr('decSubmitted')} value={int(ins.decisions.submitted)} />
                            </dl>
                        )}
                        {ins && !first && <p className="mt-3 text-[12px] text-ink-3">{ins.decisions.trackedSince ? tr('decTracked', { date: fmt.date(ins.decisions.trackedSince) }) : tr('decNotYet')}</p>}
                    </Card>
                    <Card title={tr('healthTitle')} description={tr('healthDesc')}>
                        {first ? <Skeleton className="h-16" /> : s && (
                            <ul className="space-y-2 text-[13.5px]">
                                <HealthRow icon={<FileWarning size={15} />} label={tr('healthLiveIncomplete')} count={s.products.catalog.liveIncomplete + s.products.submissions.liveIncomplete} href="/admin/products?tab=submissions&status=APPROVED&attention=missing" int={int} view={tr('view')} />
                                <HealthRow icon={<FileWarning size={15} />} label={tr('healthMissingInfo')} count={s.products.missingInfo} href="/admin/products?tab=submissions&attention=missing" int={int} view={tr('view')} />
                                <HealthRow icon={<ImageIcon size={15} />} label={tr('healthMissingImages')} count={s.products.missingImages} href="/admin/products?tab=submissions&attention=images" int={int} view={tr('view')} />
                            </ul>
                        )}
                    </Card>
                </div>
            </Group>
            </div>}
        </div>
    );
}

function Group({ id, title, description, aside, children }: { id: string; title: string; description?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section aria-labelledby={`${id}-h`}>
            <div className="mb-2.5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <h2 id={`${id}-h`} className="font-sans text-[16px] font-semibold text-heading">{title}</h2>
                    {description && <p className="text-[12.5px] text-ink-3">{description}</p>}
                </div>
                {aside}
            </div>
            {children}
        </section>
    );
}

function Figure({ label, value, sub, loading, muted }: { label: string; value: React.ReactNode; sub?: React.ReactNode; loading?: boolean; muted?: boolean }) {
    return (
        <div className="min-w-0">
            <dt className="text-[12px] text-ink-3">{label}</dt>
            {loading ? <Skeleton className="mt-1 h-5 w-20" /> : <dd className={cn('text-[15px] font-semibold tabular-nums', muted ? 'text-ink-3 font-medium text-[13px]' : 'text-heading')}>{value}</dd>}
            {sub && !loading && <dd className="text-[12px] text-ink-3">{sub}</dd>}
        </div>
    );
}

function HealthRow({ icon, label, count, href, int, view }: { icon: React.ReactNode; label: string; count: number; href: string; int: (n: number) => string; view: string }) {
    return (
        <li className="flex items-center gap-2">
            <span className={cn('shrink-0', count > 0 ? 'text-amber-700' : 'text-ink-4')}>{icon}</span>
            <span className="flex-1 min-w-0 truncate text-ink-2">{label}</span>
            <span className="font-semibold text-heading tabular-nums">{int(count)}</span>
            {count > 0 && <Link href={href} className="text-[12.5px] font-medium text-teal hover:underline">{view}</Link>}
        </li>
    );
}
