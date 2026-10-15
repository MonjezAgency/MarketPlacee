'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Euro, Package, ShoppingCart, Boxes, Plus, Upload, ArrowRight, CheckCircle2, ChevronRight, Info, BellRing, PackageX, History } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supplierApi, isoDay } from '@/lib/supplier-api';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat, StatusBadge, TONE, Thumb, eur, int, inputCls, shortDate, type Tone } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';

const DAY = 86_400_000;
const RANGES = [
    { id: '7d', label: 'Last 7 days', days: 7 },
    { id: '30d', label: 'Last 30 days', days: 30 },
    { id: '12m', label: 'Last 12 months', days: 365 },
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
const fmtDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Business Overview — every figure comes from the supplier's own orders and catalog, at the supplier's own prices. */
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
    const periodLabel = `${fmtDay(from)} – ${fmtDay(to)}`;
    const first = loading && !data;

    return (
        <div>
            <PageHeader
                eyebrow={user?.companyName || user?.name}
                title="Business overview"
                description="Your sales, orders and catalog health. Money figures are at your own prices (EUR), before the Atlantis margin."
                actions={<>
                    <Link href="/supplier/products/import"><Button icon={<Upload size={15} />}>Bulk upload</Button></Link>
                    <Link href="/supplier/products/new"><Button variant="primary" icon={<Plus size={15} />}>Add product</Button></Link>
                </>}
            />

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div role="radiogroup" aria-label="Date range" className="inline-flex flex-wrap rounded-lg bg-surface ring-1 ring-line p-0.5">
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
                <span className="text-[12.5px] text-ink-3">{periodLabel} (UTC) · compared with the previous period of the same length</span>
            </div>

            {error && <div className="mb-4"><ErrorState message={error} onRetry={load} /></div>}

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Sales · selected period" icon={<Euro size={17} />} tone="brand" loading={first}
                    value={eur(t?.sales)} delta={t && p ? pctDelta(t.sales, p.sales) : null} hint={t ? (t.estimated ? 'includes estimated older orders' : 'confirmed orders, your prices') : undefined} />
                <Stat label="Orders · selected period" icon={<ShoppingCart size={17} />} loading={first} href="/supplier/orders?view=all"
                    value={int(t?.orders)} delta={t && p ? pctDelta(t.orders, p.orders) : null} hint={t ? `${int(t.cases)} cases sold` : undefined} />
                <Stat label="Awaiting your confirmation" icon={<BellRing size={17} />} tone={data?.awaitingConfirmation ? 'warning' : 'neutral'} loading={first} href="/supplier/orders?view=action"
                    value={int(data?.awaitingConfirmation)} hint={data ? (data.awaitingConfirmation ? 'confirm or decline' : 'nothing waiting') : undefined} />
                <Stat label="Live products · now" icon={<Package size={17} />} tone="success" loading={first} href="/supplier/products?status=APPROVED"
                    value={int(data?.products?.active)} hint={data ? `${data.stockAlerts?.length ?? 0} stock alert${data.stockAlerts?.length === 1 ? '' : 's'} · ${data.products.pending} in review` : undefined} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
                <Card title="Sales over time" description={`Confirmed order value per ${monthly ? 'month' : 'day'} at your prices. Pending and cancelled orders aren’t counted.`}>
                    {first ? <Skeleton className="h-[240px] w-full" /> : !hasSales ? (
                        <EmptyState icon={<Euro size={20} />} title="No confirmed sales in this period">
                            Sales appear here once you confirm an order. Try a longer range to see earlier sales.
                        </EmptyState>
                    ) : (
                        <div className="h-[240px] -ms-2" role="img" aria-label={`Sales per ${monthly ? 'month' : 'day'}, ${periodLabel}`}>
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

                <Card title="Needs attention" description="Only shown when something is actually waiting.">
                    {first ? <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
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

            <div className="mt-4 grid gap-4 lg:grid-cols-2 items-start">
                <Card title="Top 5 products · selected period" description="By cases sold on confirmed orders; ties by sales." bodyClassName="px-0 sm:px-0 py-0"
                    actions={<Link href="/supplier/products" className="text-[13px] font-semibold text-teal hover:underline inline-flex items-center gap-1">Catalog <ArrowRight size={14} /></Link>}>
                    {first ? <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                        : !data?.top?.length ? <EmptyState icon={<Boxes size={20} />} title="No product sales in this period">Your best sellers show up once orders are confirmed.</EmptyState>
                            : (
                                <ul className="divide-y divide-line">
                                    {data.top.map((r: any, i: number) => (
                                        <li key={r.productId}>
                                            <Link href={`/supplier/products/${r.productId}/edit`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/50">
                                                <span className="w-4 text-[12px] text-ink-4 tabular-nums">{i + 1}</span>
                                                <Thumb src={r.image} size={34} />
                                                <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium text-ink">{r.name}</span>
                                                <span className="text-end text-[12.5px] tabular-nums"><b className="text-ink">{int(r.cases)}</b> <span className="text-ink-3">cases</span><span className="block text-ink-3">{eur(r.sales)}</span></span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </Card>

                <Card title="Recent orders" description="Latest orders with your products, any status." bodyClassName="px-0 sm:px-0 py-0"
                    actions={<Link href="/supplier/orders?view=all" className="text-[13px] font-semibold text-teal hover:underline inline-flex items-center gap-1">All orders <ArrowRight size={14} /></Link>}>
                    {first ? <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                        : !data?.recentOrders?.length ? <EmptyState icon={<ShoppingCart size={20} />} title="No orders yet">Orders for your products will appear here.</EmptyState>
                            : (
                                <ul className="divide-y divide-line">
                                    {data.recentOrders.map((o: any) => (
                                        <li key={o.id}>
                                            <Link href={`/supplier/orders?view=all&q=${o.id.slice(-8)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 hover:bg-surface-2/50">
                                                <span className="font-semibold text-[13.5px] text-heading tabular-nums">#{o.id.slice(-8).toUpperCase()}</span>
                                                <StatusBadge kind="order" status={o.status} />
                                                <span className="flex-1 text-[12.5px] text-ink-3">{shortDate(o.createdAt)} · {int(o.cases)} cases</span>
                                                <span className="text-[13.5px] tabular-nums text-ink">{eur(o.value)}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </Card>

                <Card title="Stock alerts · now" description="Live products with no stock, or less stock than one minimum order." bodyClassName="px-0 sm:px-0 py-0">
                    {first ? <div className="p-5"><Skeleton className="h-10" /></div>
                        : !data?.stockAlerts?.length ? <p className="px-5 py-4 flex items-center gap-2 text-[13.5px] text-ink-2"><CheckCircle2 size={16} className="text-emerald-600" /> Every live product can fill at least one minimum order.</p>
                            : (
                                <ul className="divide-y divide-line">
                                    {data.stockAlerts.map((a: any) => (
                                        <li key={a.id}>
                                            <Link href={`/supplier/products/${a.id}/edit`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/50">
                                                <Thumb src={a.image} size={34} />
                                                <span className="flex-1 min-w-0 truncate text-[13.5px] text-ink">{a.name}</span>
                                                {a.kind === 'out' ? <Badge tone="danger"><PackageX size={12} />Out of stock</Badge> : <Badge tone="warning">{int(a.stock)} cases · min. order {int(a.minOrderCases)}</Badge>}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </Card>

                <Card title="Products needing your input" description="Drafts, changes requested by Atlantis, rejected listings and items in review." bodyClassName="px-0 sm:px-0 py-0">
                    {first ? <div className="p-5"><Skeleton className="h-10" /></div>
                        : !data?.needsWork?.length ? <p className="px-5 py-4 flex items-center gap-2 text-[13.5px] text-ink-2"><CheckCircle2 size={16} className="text-emerald-600" /> Nothing waiting — all your listings are live.</p>
                            : (
                                <ul className="divide-y divide-line">
                                    {data.needsWork.map((p2: any) => (
                                        <li key={p2.id}>
                                            <Link href={`/supplier/products/${p2.id}/edit`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/50">
                                                <Thumb src={p2.image} size={34} />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block truncate text-[13.5px] text-ink">{p2.name}</span>
                                                    {p2.note && <span className="block truncate text-[12px] text-ink-3">{p2.note}</span>}
                                                </span>
                                                <StatusBadge status={p2.status} />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </Card>

                <Card title="Recent stock changes" description="From your product change history." bodyClassName="px-0 sm:px-0 py-0">
                    {first ? <div className="p-5"><Skeleton className="h-10" /></div>
                        : !data?.stockChanges?.length ? <p className="px-5 py-4 flex items-center gap-2 text-[13.5px] text-ink-3"><History size={15} /> No stock changes recorded yet. Changes you make are listed here from now on.</p>
                            : (
                                <ul className="divide-y divide-line">
                                    {data.stockChanges.map((c: any) => (
                                        <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                                            <Link href={`/supplier/products/${c.productId}/edit`} className="flex-1 min-w-0 truncate text-ink hover:underline">{c.name}</Link>
                                            <span className="tabular-nums text-ink-2">{c.from ?? '—'} → <b>{c.to ?? '—'}</b> cases</span>
                                            <span className="text-[12px] text-ink-4 w-[84px] text-end">{shortDate(c.at)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                </Card>

                <Card title="Sales by category · selected period" description="Confirmed orders, your prices.">
                    {first ? <Skeleton className="h-16" /> : !data?.byCategory?.length ? <p className="text-[13.5px] text-ink-3">No confirmed sales in this period.</p> : (
                        <ul className="space-y-2">
                            {data.byCategory.map((c: any) => {
                                const max = data.byCategory[0].sales || 1;
                                return (
                                    <li key={c.category} className="text-[13px]">
                                        <div className="flex justify-between gap-3"><span className="text-ink truncate">{c.category}</span><span className="tabular-nums text-ink-2">{eur(c.sales)}</span></div>
                                        <div className="mt-1 h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className="h-full bg-teal rounded-full" style={{ width: `${Math.max(3, (c.sales / max) * 100)}%` }} /></div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Card>
            </div>

            <p className="mt-4 flex items-start gap-2 text-[12.5px] text-ink-3 max-w-[95ch]">
                <Info size={14} className="mt-0.5 shrink-0" />
                Sales = value of your lines on paid, confirmed, shipped or delivered orders, at your own prices. Orders placed before your price was recorded on each order line are estimated from your current price and marked as estimated. Mixed pallets combining several products aren’t attributed per product.
            </p>
        </div>
    );
}
