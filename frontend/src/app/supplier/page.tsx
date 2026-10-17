'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Upload, ArrowRight, ChevronRight, BellRing, Info, HelpCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supplierApi, isoDay, ApiError } from '@/lib/supplier-api';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, Thumb, eur, inputCls, TONE, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trans } from '@/components/i18n/Trans';

/*
 * Supplier Business Overview. Every boundary, bucket and figure comes from
 * GET /supplier-catalog/overview (backend/src/products/supplier-overview.service.ts,
 * definitions in supplier-metrics.ts / report-range.ts); the page only formats them.
 */
const RANGES = [
    { id: '3d', labelKey: 'range3d' },
    { id: '7d', labelKey: 'range7d' },
    { id: '30d', labelKey: 'range30d' },
    { id: '12m', labelKey: 'range12m' },
    { id: 'custom', labelKey: 'rangeCustom' },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const RANGE_ERRORS: Record<string, string> = { RANGE_FUTURE: 'errRangeFuture', RANGE_ORDER: 'errRangeOrder', RANGE_TOO_LONG: 'errRangeTooLong', RANGE_INVALID: 'errRangeInvalid', TZ_INVALID: 'errRangeInvalid' };
const NEEDS_ATTENTION_STATUSES = 'DRAFT,NEEDS_CHANGES,REJECTED';
const DAY = 86_400_000;

export default function SupplierOverviewPage() {
    const { user } = useAuth();
    const { t, fmt } = useLanguage();
    const tr = (key: string, vars?: Record<string, string | number>) => t('supplierOverview', key, vars);
    const [range, setRange] = React.useState<RangeId>('30d');
    const today = isoDay(new Date());
    const [custom, setCustom] = React.useState({ from: isoDay(new Date(Date.now() - 29 * DAY)), to: today });
    const [data, setData] = React.useState<any | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    const load = React.useCallback(() => {
        setLoading(true); setError(null);
        supplierApi.overview(range === 'custom' ? { range, from: custom.from, to: custom.to } : { range })
            .then(setData)
            .catch((e) => {
                setData(null);
                const code = e instanceof ApiError ? e.body?.code : null;
                setError(code && RANGE_ERRORS[code] ? tr(RANGE_ERRORS[code], { max: 366 }) : tr('errLoad'));
            })
            .finally(() => setLoading(false));
    }, [range, custom.from, custom.to]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => { load(); }, [load]);

    // Calendar days from the server ("YYYY-MM-DD") are shown as dates, never re-computed here.
    const day = (d: string, withYear = true) => fmt.date(d + 'T12:00:00Z', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
    const month = (m: string) => fmt.date(m + '-15T12:00:00Z', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const pct = (n: number) => fmt.number(n, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
    const first = loading && !data;
    const r = data?.range;
    const g = data?.financial?.grossSales;
    const inv = data?.inventory;
    const monthly = r?.granularity === 'month';
    const chart = (data?.orders?.series ?? []).map((s: any) => ({ ...s, label: monthly ? month(s.key) : day(s.key, false) }));
    const hasSales = chart.some((s: any) => s.sales > 0);
    const hasPartial = chart.some((s: any) => s.partial);

    return (
        <div data-no-translate className="text-start">
            <PageHeader
                eyebrow={user?.companyName || user?.name}
                title={tr('pageTitle')}
                description={tr('pageDesc')}
                actions={<>
                    <Link href="/supplier/products/import"><Button icon={<Upload size={15} />}>{tr('bulkUpload')}</Button></Link>
                    <Link href="/supplier/products/new"><Button variant="primary" icon={<Plus size={15} />}>{tr('addProduct')}</Button></Link>
                </>}
            />

            {/* Period */}
            <div className="mb-5 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div role="radiogroup" aria-label={tr('rangeAria')} className="inline-flex flex-wrap rounded-lg bg-surface ring-1 ring-line p-0.5">
                        {RANGES.map((x) => (
                            <button key={x.id} type="button" role="radio" aria-checked={range === x.id} onClick={() => setRange(x.id)}
                                className={cn('h-9 px-3 rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                    range === x.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                                {tr(x.labelKey)}
                            </button>
                        ))}
                    </div>
                    {range === 'custom' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="sr-only" htmlFor="ov-from">{tr('fromLabel')}</label>
                            <input id="ov-from" type="date" max={custom.to} value={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className={cn(inputCls, 'h-9 w-[150px]')} />
                            <span className="text-ink-3 text-[13px]">{tr('rangeSeparator')}</span>
                            <label className="sr-only" htmlFor="ov-to">{tr('toLabel')}</label>
                            <input id="ov-to" type="date" min={custom.from} max={today} value={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className={cn(inputCls, 'h-9 w-[150px]')} />
                        </div>
                    )}
                </div>
                <p className="text-[12.5px] text-ink-3" aria-live="polite">
                    {r ? <>{tr('periodLine', { from: day(r.from), to: day(r.to), prevFrom: day(r.previous.from), prevTo: day(r.previous.to) })} {tr('tzNote', { tz: r.timeZone })}</> : <span>{"\u00a0"}</span>}
                </p>
            </div>

            {error && <div className="mb-4"><ErrorState message={error} onRetry={load} /></div>}

            {/* Figures from a previous period are never shown under a period that failed to load. */}
            {!(error && !data) && <div aria-busy={loading} className={cn('transition-opacity', loading && data && 'opacity-60')}>
            {/* 1 — Financial performance */}
            <Group id="ov-fin" title={tr('finTitle')} description={tr('finDesc')}>
                <div data-tour="supplier-overview" className="rounded-xl bg-surface ring-1 ring-line p-4 sm:p-5">
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                        <div>
                            <p className="text-[12.5px] font-medium text-ink-3">{tr('grossSales')} <span className="text-ink-4">· {tr('currencyNote')}</span></p>
                            {first ? <Skeleton className="mt-2 h-9 w-40" /> : (
                                <p className="mt-1 text-[28px] leading-9 font-semibold text-heading tabular-nums">{eur(g?.value)}</p>
                            )}
                            {g && !first && (
                                <div className="mt-1 space-y-0.5 text-[12.5px] text-ink-3">
                                    <p>{tr('grossSalesOrders', { count: Number(g.orders) || 0 })}</p>
                                    <p>{g.change === null || g.change === undefined
                                        ? tr('noPrevSales')
                                        : <Trans text={tr('vsPrev', { change: pct(g.change), prev: eur(g.previous) })} tags={{ b: (c) => <b dir="ltr" className={cn('font-semibold', TONE[(g.change > 0.005 ? 'success' : g.change < -0.005 ? 'danger' : 'neutral') as Tone].text)}>{c}</b> }} />}
                                    </p>
                                    {g.estimated && <p>{tr('estimatedNote')}</p>}
                                </div>
                            )}
                        </div>
                        <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                            {(['netEarnings', 'received', 'outstanding', 'refunds'] as const).map((k) => (
                                <div key={k} className="rounded-lg bg-surface-2 px-3 py-2.5">
                                    <dt className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-ink-2">
                                        {tr(k)}
                                        <Badge tone="neutral">{tr('notTracked')}</Badge>
                                    </dt>
                                    <dd className="mt-1 text-[12px] leading-5 text-ink-3">{tr(`${k}Why`)}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <details className="group mt-4 border-t border-line pt-3">
                        <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded text-[13px] font-medium text-teal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] list-none [&::-webkit-details-marker]:hidden">
                            <HelpCircle size={14} /> {tr('howTitle')}
                        </summary>
                        <div className="mt-2 space-y-1.5 max-w-prose text-[12.5px] leading-5 text-ink-2">
                            <p><Trans text={tr('howGross')} tags={{ b: (c) => <b>{c}</b> }} /></p>
                            <p>{tr('howLegacy')}</p>
                            <p>{tr('howCompare')}</p>
                            <p>{tr('howMoney')}</p>
                        </div>
                    </details>
                </div>
            </Group>

            {/* 2 — Orders & sales */}
            <Group id="ov-orders" title={tr('ordersTitle')} description={tr('ordersDesc')}>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
                    <Card title={tr('salesTitle')} description={tr(monthly ? 'salesDescMonth' : 'salesDescDay')}>
                        {first ? <Skeleton className="h-[240px] w-full" /> : !hasSales ? (
                            <EmptyState title={tr('noSalesTitle')}>{tr('noSalesBody')}</EmptyState>
                        ) : (
                            <>
                                <div className="h-[240px] -ms-2" role="img" aria-label={tr('chartAria', { from: day(r.from), to: day(r.to), total: eur(g?.value) })}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                            <CartesianGrid vertical={false} stroke="rgb(230 232 236)" />
                                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} interval="preserveStartEnd" minTickGap={16} />
                                            <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => fmt.number(v, { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: v >= 1000 && v < 10000 ? 1 : 0 })} />
                                            <Tooltip cursor={{ fill: 'rgba(14,124,116,0.06)' }}
                                                content={({ active, payload }) => {
                                                    const p: any = active && payload?.length ? payload[0].payload : null;
                                                    return p ? (
                                                        <div className="rounded-lg bg-surface ring-1 ring-line shadow-float px-3 py-2 text-[12.5px]">
                                                            <p className="font-semibold text-heading">{p.label}{p.partial ? ` · ${tr('soFar')}` : ''}</p>
                                                            <p className="text-ink-2">{tr('tooltipLine', { sales: eur(p.sales), count: Number(p.orders) || 0 })}</p>
                                                        </div>
                                                    ) : null;
                                                }} />
                                            <Bar dataKey="sales" radius={[3, 3, 0, 0]} maxBarSize={28}>
                                                {chart.map((s: any) => <Cell key={s.key} fill="#0E7C74" fillOpacity={s.partial ? 0.45 : 1} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                {hasPartial && <p className="mt-2 text-[12px] text-ink-3">{tr('partialLegend')}</p>}
                            </>
                        )}
                    </Card>

                    <div className="space-y-4">
                        <Link href="/supplier/orders?view=action" className="block rounded-xl bg-surface ring-1 ring-line p-4 hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                            <div className="flex items-start gap-3">
                                <span className={cn('w-9 h-9 shrink-0 rounded-lg ring-1 ring-inset flex items-center justify-center', TONE[data?.orders?.awaitingConfirmation ? 'warning' : 'neutral'].soft, TONE[data?.orders?.awaitingConfirmation ? 'warning' : 'neutral'].text)}><BellRing size={17} /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-ink-3">{tr('awaitingTitle')} <Badge tone="info">{tr('currentTag')}</Badge></p>
                                    {first ? <Skeleton className="mt-1.5 h-7 w-12" /> : <p className="mt-0.5 text-[22px] leading-8 font-semibold text-heading tabular-nums">{fmt.number(Number(data?.orders?.awaitingConfirmation) || 0)}</p>}
                                    {data && <p className="text-[12px] text-ink-3">{data.orders.awaitingConfirmation ? tr('awaitingSome', { count: data.orders.awaitingConfirmation }) : tr('awaitingNone')}</p>}
                                </div>
                                <ChevronRight size={16} className="mt-1 text-ink-4 rtl:rotate-180" />
                            </div>
                        </Link>

                        <Card title={tr('topTitle')} description={tr('topDesc')} bodyClassName="px-0 sm:px-0 py-0">
                            {first ? <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
                                : !data?.orders?.top?.length ? <p className="px-5 py-4 text-[13px] text-ink-3">{tr('noTop')}</p>
                                    : (
                                        <ol className="divide-y divide-line">
                                            {data.orders.top.map((p: any, i: number) => (
                                                <li key={p.productId}>
                                                    <Link href={`/supplier/products/${p.productId}/edit`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6]">
                                                        <span className="w-4 text-[12px] text-ink-4 tabular-nums">{fmt.number(i + 1)}</span>
                                                        <Thumb src={p.image} size={32} />
                                                        <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                                                        <span className="text-end text-[12.5px] tabular-nums">
                                                            <span className="block text-ink">{eur(p.sales)}</span>
                                                            <span className="block text-ink-3">{tr('topCases', { count: Number(p.cases) || 0 })}</span>
                                                        </span>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                        </Card>
                    </div>
                </div>

                <Card className="mt-4" title={tr('recentTitle')} description={data ? tr('recentDesc', { count: Number(data.orders.recent.count) || 0 }) : undefined} bodyClassName="px-0 sm:px-0 py-0"
                    actions={<Link href="/supplier/orders?view=all" className="text-[13px] font-semibold text-teal hover:underline inline-flex items-center gap-1">{tr('allOrders')} <ArrowRight size={14} className="rtl:rotate-180" /></Link>}>
                    {first ? <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
                        : !data?.orders?.recent?.items?.length ? <p className="px-5 py-4 text-[13px] text-ink-3">{tr('noRecent')}</p>
                            : (
                                <ul className="divide-y divide-line">
                                    {data.orders.recent.items.map((o: any) => (
                                        <li key={o.id}>
                                            <Link href={`/supplier/orders?view=all&q=${o.id.slice(-8)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2EC4B6]">
                                                <bdi dir="ltr" className="font-semibold text-[13.5px] text-heading tabular-nums">#{o.id.slice(-8).toUpperCase()}</bdi>
                                                <StatusBadge kind="order" status={o.status} />
                                                <span className="flex-1 text-[12.5px] text-ink-3">{tr('recentMeta', { date: fmt.date(o.createdAt), count: Number(o.cases) || 0 })}</span>
                                                <span className="text-[13.5px] tabular-nums text-ink">{eur(o.value)}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </Card>
            </Group>

            {/* 3 — Inventory & product health (current state) */}
            <Group id="ov-inv" title={tr('invTitle')} description={tr('invDesc')} tag={tr('currentTag')}>
                <ul className="grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                    <Tile label={tr('tDrafts')} hint={tr('tDraftsHint')} value={inv?.drafts} tone="neutral" loading={first} href="/supplier/products?status=DRAFT" fmt={fmt} />
                    <Tile label={tr('tChanges')} hint={tr('tChangesHint')} value={inv?.needsChanges} tone="warning" loading={first} href="/supplier/products?status=NEEDS_CHANGES" fmt={fmt} />
                    <Tile label={tr('tRejected')} hint={tr('tRejectedHint')} value={inv?.rejected} tone="danger" loading={first} href="/supplier/products?status=REJECTED" fmt={fmt} />
                    <Tile label={tr('tMissing')} hint={tr('tMissingHint')} value={inv?.missingInfo} tone="warning" loading={first} fmt={fmt} />
                    <Tile label={tr('tImages')} hint={tr('tImagesHint')} value={inv?.missingImages} tone="warning" loading={first} href="/supplier/products?attention=images" fmt={fmt} />
                    <Tile label={tr('tOut')} hint={tr('tOutHint')} value={inv?.outOfStock} tone="danger" loading={first} href="/supplier/products?status=APPROVED&stock=out" fmt={fmt} />
                    <Tile label={tr('tBelow')} hint={tr('tBelowHint')} value={inv?.belowMinOrder} tone="warning" loading={first} fmt={fmt} />
                    <li className="rounded-xl border border-dashed border-line px-4 py-3 text-[12px] leading-5 text-ink-3 flex gap-2">
                        <Info size={14} className="mt-0.5 shrink-0" />
                        <span>{tr('invOverlap')} <Link href={`/supplier/products?status=${NEEDS_ATTENTION_STATUSES}`} className="font-medium text-teal hover:underline">{tr('invAllAttention')}</Link></span>
                    </li>
                </ul>

                <Card className="mt-4" title={tr('stockTitle')} description={data ? tr('stockDesc', { count: Number(inv?.stockChanges?.count) || 0 }) : undefined} bodyClassName="px-0 sm:px-0 py-0">
                    {first ? <div className="p-5"><Skeleton className="h-9" /></div>
                        : !inv?.stockChanges?.items?.length ? <p className="px-5 py-4 text-[13px] text-ink-3">{tr('noStock')}</p>
                            : (
                                <ul className="divide-y divide-line">
                                    {inv.stockChanges.items.map((c: any) => (
                                        <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px]">
                                            <Link href={`/supplier/products/${c.productId}/edit`} className="flex-1 min-w-0 truncate text-ink hover:underline">{c.name}</Link>
                                            <span className="tabular-nums text-ink-2"><Trans text={tr('stockLine', { from: c.from ?? '—', to: c.to ?? '—' })} tags={{ b: (x) => <b>{x}</b> }} /></span>
                                            <span className="text-[12px] text-ink-3 text-end">{fmt.date(c.at)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </Card>
            </Group>
            </div>}
        </div>
    );
}

function Group({ id, title, description, tag, children }: { id: string; title: string; description: string; tag?: string; children: React.ReactNode }) {
    return (
        <section aria-labelledby={id} className="mb-8">
            <div className="mb-3">
                <h2 id={id} className="font-sans text-[16px] font-semibold text-heading flex flex-wrap items-center gap-2">
                    {title}{tag && <Badge tone="info">{tag}</Badge>}
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-3 max-w-prose">{description}</p>
            </div>
            {children}
        </section>
    );
}

function Tile({ label, hint, value, tone, loading, href, fmt }: { label: string; hint: string; value?: number; tone: Tone; loading: boolean; href?: string; fmt: ReturnType<typeof useLanguage>['fmt'] }) {
    const n = Number(value) || 0;
    const body = (
        <>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">{label}</span>
                <span className="block text-[12px] text-ink-3">{hint}</span>
            </span>
            {loading ? <Skeleton className="h-6 w-8" /> : (
                <span className={cn('text-[20px] font-semibold tabular-nums', n ? TONE[tone].text : 'text-ink-4')}>{fmt.number(n)}</span>
            )}
            {href && <ChevronRight size={15} className="text-ink-4 rtl:rotate-180" />}
        </>
    );
    const cls = 'flex items-center gap-3 rounded-xl bg-surface ring-1 ring-line px-4 py-3 min-h-[60px]';
    return (
        <li>
            {href ? <Link href={href} className={cn(cls, 'hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]')}>{body}</Link> : <div className={cls}>{body}</div>}
        </li>
    );
}
