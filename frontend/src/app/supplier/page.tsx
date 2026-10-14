'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Euro, Package, ShoppingCart, Boxes, Plus, Upload, ArrowRight, CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supplierApi, isoDay } from '@/lib/supplier-api';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat, TONE, Thumb, eur, int, inputCls, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

const DAY = 86_400_000;
const RANGES = [
    { id: '7d', label: '7 days', days: 7 },
    { id: '30d', label: '30 days', days: 30 },
    { id: '12m', label: '12 months', days: 365 },
    { id: 'custom', label: 'Custom', days: 0 },
] as const;

function pctDelta(cur: number, prev: number) {
    if (!prev && !cur) return null;
    if (!prev) return <Badge tone="success">New</Badge>;
    const p = ((cur - prev) / prev) * 100;
    const tone: Tone = p > 0.5 ? 'success' : p < -0.5 ? 'danger' : 'neutral';
    return <span className={cn('font-medium', TONE[tone].text)}>{p > 0 ? '+' : ''}{p.toFixed(0)}%</span>;
}

const fmtBucket = (k: string, monthly: boolean) =>
    monthly ? new Date(k + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
        : new Date(k + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Business Overview — every number comes from the supplier's real order lines. */
export default function SupplierOverviewPage() {
    const { user } = useAuth();
    const [range, setRange] = React.useState<(typeof RANGES)[number]['id']>('30d');
    const today = isoDay(new Date());
    const [custom, setCustom] = React.useState({ from: isoDay(new Date(Date.now() - 29 * DAY)), to: today });
    const [data, setData] = React.useState<any | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    const { from, to } = React.useMemo(() => {
        if (range === 'custom') return custom;
        const r = RANGES.find((x) => x.id === range)!;
        return { from: isoDay(new Date(Date.now() - (r.days - 1) * DAY)), to: today };
    }, [range, custom, today]);

    const load = React.useCallback(() => {
        if (from > to) { setError('The start date must be on or before the end date.'); return; }
        setLoading(true); setError(null);
        supplierApi.overview(from, to).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }, [from, to]);
    React.useEffect(() => { load(); }, [load]);

    const t = data?.totals, p = data?.previous;
    const monthly = data?.range?.granularity === 'month';
    const chart = (data?.series ?? []).map((s: any) => ({ ...s, label: fmtBucket(s.date, monthly) }));
    const hasSales = chart.some((s: any) => s.sales > 0);
    const periodLabel = `${new Date(from + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} – ${new Date(to + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;

    return (
        <div>
            <PageHeader
                eyebrow={user?.companyName || user?.name}
                title="Business overview"
                description="Sales, orders and catalog health for your products."
                actions={<>
                    <Link href="/supplier/products?import=1"><Button icon={<Upload size={15} />}>Bulk upload</Button></Link>
                    <Link href="/supplier/products/new"><Button variant="primary" icon={<Plus size={15} />}>Add product</Button></Link>
                </>}
            />

            {/* Date range */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-lg bg-surface ring-1 ring-line p-0.5">
                    {RANGES.map((r) => (
                        <button key={r.id} role="radio" aria-checked={range === r.id} onClick={() => setRange(r.id)}
                            className={cn('h-8 px-3 rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                                range === r.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                            {r.label}
                        </button>
                    ))}
                </div>
                {range === 'custom' && (
                    <div className="flex items-center gap-2">
                        <label className="sr-only" htmlFor="ov-from">From</label>
                        <input id="ov-from" type="date" max={custom.to} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className={cn(inputCls, 'h-9 w-[150px]')} />
                        <span className="text-ink-3 text-[13px]">to</span>
                        <label className="sr-only" htmlFor="ov-to">To</label>
                        <input id="ov-to" type="date" min={custom.from} max={today} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className={cn(inputCls, 'h-9 w-[150px]')} />
                    </div>
                )}
                <span className="text-[12.5px] text-ink-3">{periodLabel} · UTC · compared with the previous {range === '12m' ? '12 months' : 'period of the same length'}</span>
            </div>

            {error && <div className="mb-4"><ErrorState message={error} onRetry={load} /></div>}

            {/* KPIs */}
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Sales (confirmed orders)" icon={<Euro size={17} />} tone="brand" loading={loading && !data}
                    value={eur(t?.sales)} delta={t && p ? pctDelta(t.sales, p.sales) : null} hint={t ? 'vs previous period' : undefined} />
                <Stat label="Orders received" icon={<ShoppingCart size={17} />} tone="neutral" loading={loading && !data}
                    value={int(t?.orders)} delta={t && p ? pctDelta(t.orders, p.orders) : null} hint={data ? `${data.awaitingConfirmation} awaiting your confirmation` : undefined} href="/supplier/orders" />
                <Stat label="Cases sold" icon={<Boxes size={17} />} tone="neutral" loading={loading && !data}
                    value={int(t?.cases)} delta={t && p ? pctDelta(t.cases, p.cases) : null} hint={t ? 'on confirmed orders' : undefined} />
                <Stat label="Live products" icon={<Package size={17} />} tone="success" loading={loading && !data}
                    value={int(data?.products?.active)} hint={data ? `${data.products.pending} in review · ${data.products.drafts} drafts` : undefined} href="/supplier/products" />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
                {/* Revenue trend */}
                <Card title="Sales over time" description={`Confirmed order value per ${monthly ? 'month' : 'day'}, EUR. Pending and cancelled orders aren’t counted.`}>
                    {loading && !data ? <Skeleton className="h-[260px] w-full" /> : !hasSales ? (
                        <EmptyState icon={<Euro size={20} />} title="No confirmed sales in this period">
                            Sales appear here once you confirm an order. Try a longer range to see earlier sales.
                        </EmptyState>
                    ) : (
                        <div className="h-[260px] -ms-2" role="img" aria-label={`Sales per ${monthly ? 'month' : 'day'}, ${periodLabel}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                    <CartesianGrid vertical={false} stroke="rgb(230 232 236)" />
                                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} interval="preserveStartEnd" minTickGap={16} />
                                    <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => (v >= 1000 ? `€${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `€${v}`)} />
                                    <Tooltip cursor={{ fill: 'rgba(14,124,116,0.06)' }}
                                        content={({ active, payload }) => active && payload?.length ? (
                                            <div className="rounded-lg bg-white ring-1 ring-line shadow-lg px-3 py-2 text-[12.5px]">
                                                <p className="font-semibold text-heading">{(payload[0].payload as any).label}</p>
                                                <p className="text-ink-2">{eur((payload[0].payload as any).sales)} · {(payload[0].payload as any).orders} order{(payload[0].payload as any).orders === 1 ? '' : 's'}</p>
                                            </div>
                                        ) : null} />
                                    <Bar dataKey="sales" fill="#0E7C74" radius={[3, 3, 0, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>

                {/* Needs attention */}
                <Card title="Needs attention" description="Only shown when something is actually waiting.">
                    {loading && !data ? <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
                        : data && data.attention.length === 0 ? (
                            <p className="flex items-center gap-2 text-[13.5px] text-ink-2"><CheckCircle2 size={16} className="text-emerald-600" /> All clear — nothing needs you right now.</p>
                        ) : (
                            <ul className="-mx-2 space-y-0.5">
                                {(data?.attention ?? []).map((a: any) => (
                                    <li key={a.id}>
                                        <Link href={a.href} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                                            <span className={cn('w-2 h-2 rounded-full shrink-0', TONE[a.tone as Tone]?.dot || 'bg-slate-400')} />
                                            <span className="flex-1 text-[13.5px] text-ink">{a.label}</span>
                                            <ChevronRight size={15} className="text-ink-4" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                </Card>
            </div>

            {/* Top products */}
            <Card className="mt-4" title="Top 5 products" description="Ranked by cases sold on confirmed orders in this period; ties by sales value."
                actions={<Link href="/supplier/orders" className="text-[13px] font-semibold text-teal hover:underline inline-flex items-center gap-1">All orders <ArrowRight size={14} /></Link>}
                bodyClassName="px-0 sm:px-0 py-0">
                {loading && !data ? <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                    : !data?.top?.length ? (
                        <EmptyState icon={<Boxes size={20} />} title="No product sales yet in this period">Once buyers’ orders are confirmed, your best sellers show up here.</EmptyState>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13.5px]">
                                <thead>
                                    <tr className="text-start text-[12px] font-medium text-ink-3 border-y border-line bg-surface-2/60">
                                        <th className="text-start font-medium px-5 py-2 w-8">#</th>
                                        <th className="text-start font-medium px-2 py-2">Product</th>
                                        <th className="text-end font-medium px-2 py-2">Cases sold</th>
                                        <th className="text-end font-medium px-2 py-2 hidden sm:table-cell">Orders</th>
                                        <th className="text-end font-medium px-5 py-2">Sales</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.top.map((r: any, i: number) => (
                                        <tr key={r.productId} className="border-b border-line last:border-0">
                                            <td className="px-5 py-2.5 text-ink-3 tabular-nums">{i + 1}</td>
                                            <td className="px-2 py-2.5">
                                                <Link href={`/supplier/products/${r.productId}/edit`} className="flex items-center gap-3 min-w-0 hover:underline">
                                                    <Thumb src={r.image} size={36} />
                                                    <span className="truncate font-medium text-ink max-w-[42ch]">{r.name}</span>
                                                </Link>
                                            </td>
                                            <td className="px-2 py-2.5 text-end tabular-nums font-medium">{int(r.cases)}</td>
                                            <td className="px-2 py-2.5 text-end tabular-nums hidden sm:table-cell">{int(r.orders)}</td>
                                            <td className="px-5 py-2.5 text-end tabular-nums">{eur(r.sales)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </Card>

            <p className="mt-4 flex items-start gap-2 text-[12.5px] text-ink-3 max-w-[90ch]">
                <Info size={14} className="mt-0.5 shrink-0" />
                Sales = value of your lines on orders that are paid, confirmed, shipped or delivered, at the price the buyer paid (EUR). Orders received = distinct orders with your products, excluding cancelled. Mixed pallets combining several products aren’t attributed per product.
            </p>
        </div>
    );
}
