'use client';

import * as React from 'react';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Lock, LineChart as ChartIcon, ArrowDownRight, ArrowUpRight, Minus, Tag } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

const fmtDate = (d: string | Date | number) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const TEAL = '#0E7C74';

/** Where the current price sits between the period's low and high. */
function RangeBar({ min, max, now, label }: { min: number; max: number; now: number; label: string }) {
    const pos = max > min ? ((now - min) / (max - min)) * 100 : 50;
    return (
        <div>
            <p className="text-[12px] font-medium text-ink-3">{label}</p>
            <div className="mt-2 relative h-1.5 rounded-full bg-gradient-to-r from-[#D1FAE5] via-[#E2E8F0] to-[#FEE2E2]" aria-hidden>
                <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-heading ring-2 ring-white shadow" style={{ left: `${Math.max(0, Math.min(100, pos))}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] tabular-nums text-ink-3">
                <span>Low {formatPrice(min)}</span><span>High {formatPrice(max)}</span>
            </div>
        </div>
    );
}

/**
 * Listed-price history (buyer case price, EUR, case tier). Only recorded
 * observations are drawn — no interpolation or invented points — and the
 * current listed price / live offer are kept visually apart from history.
 */
export default function PriceHistorySection({ productId, isLoggedIn, currentOffer }: {
    productId: string; isLoggedIn: boolean;
    /** A live approved offer on the product: shown as "now", never as history. */
    currentOffer?: { percent: number; casePrice: number } | null;
}) {
    const [months, setMonths] = React.useState<3 | 6 | 12>(12);
    const [data, setData] = React.useState<any | null>(null);
    const [error, setError] = React.useState(false);

    React.useEffect(() => {
        if (!isLoggedIn) return;
        setError(false);
        apiFetch(`/products/${productId}/price-history?months=${months}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true));
    }, [productId, months, isLoggedIn]);

    if (data?.ownerView || data?.supplierView) return null; // supplier accounts never see buyer-price history (enforced by the API)

    const points: { price: number; t: number; carried?: boolean }[] = (data?.points ?? []).map((p: any) => ({ ...p, t: +new Date(p.at) }));
    const chart = points.length ? [...points, { price: points[points.length - 1].price, t: Date.now(), extended: true }] : [];
    const locked = !isLoggedIn || data?.locked;
    const latest = data?.latest?.price as number | undefined;
    const startPrice = points[0]?.price;
    const change = latest !== undefined && startPrice ? (latest - startPrice) / startPrice : null;
    const recorded = points.filter((p) => !p.carried).length;
    const range = months === 3 ? data?.range3m : data?.range12m;
    const prices = points.map((p) => p.price);
    const lo = prices.length ? Math.min(...prices) : 0, hi = prices.length ? Math.max(...prices) : 0;

    return (
        <section aria-labelledby="ph-title" className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">Price intelligence</p>
                    <h2 id="ph-title" className="mt-0.5 text-[19px] font-bold text-heading">Price history</h2>
                </div>
                {!locked && (
                    <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg bg-surface-2 ring-1 ring-line p-0.5">
                        {([3, 6, 12] as const).map((m) => (
                            <button key={m} role="radio" aria-checked={months === m} onClick={() => setMonths(m)} className={cn('h-8 px-3 rounded-md text-[13px] font-medium transition-colors', months === m ? 'bg-surface text-heading shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink')}>{m}M</button>
                        ))}
                    </div>
                )}
            </div>

            {locked ? (
                <div className="mt-4 relative rounded-2xl ring-1 ring-line bg-surface-2 h-[240px] overflow-hidden">
                    <svg aria-hidden viewBox="0 0 600 200" preserveAspectRatio="none" className="absolute inset-0 w-full h-full blur-[6px] opacity-60"><path d="M0 140 H120 V90 H260 V60 H380 V110 H600" stroke="#94A3B8" strokeWidth="6" fill="none" /></svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                        <Lock size={20} className="text-ink-3" />
                        <p className="mt-2 text-[14px] font-semibold text-heading">Sign in to see price history</p>
                        <p className="text-[13px] text-ink-3">Wholesale prices are shown to signed-in business accounts.</p>
                        <Link href={`/auth/login?redirect=${encodeURIComponent(`/products/${productId}`)}`} className="mt-3 h-9 px-4 inline-flex items-center rounded-lg bg-cta text-cta-fg text-[13px] font-semibold">Sign in</Link>
                    </div>
                </div>
            ) : error ? (
                <p className="mt-4 text-[13.5px] text-ink-3">Price history couldn’t be loaded right now.</p>
            ) : !data ? (
                <div className="mt-4 h-[300px] rounded-2xl bg-surface-2 animate-pulse" />
            ) : !points.length ? (
                <div className="mt-4 rounded-2xl ring-1 ring-line px-5 py-8 text-center">
                    <ChartIcon size={20} className="mx-auto text-ink-3" />
                    <p className="mt-2 text-[14px] font-semibold text-heading">No price history yet</p>
                    <p className="text-[13px] text-ink-3">We record the listed price each time it changes; the chart appears once there’s data.</p>
                </div>
            ) : (
                <div className="mt-4 rounded-2xl ring-1 ring-line bg-surface overflow-hidden">
                    {/* Now — kept apart from history */}
                    <div className="grid gap-4 p-4 sm:p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center border-b border-line">
                        <div>
                            <p className="text-[12px] font-medium text-ink-3">Listed now · per case</p>
                            <p className="mt-0.5 text-[28px] leading-none font-bold text-heading tabular-nums">{latest !== undefined ? formatPrice(latest) : '—'}</p>
                            {change !== null && (
                                <p className={cn('mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium tabular-nums', change < -0.0005 ? 'text-[#047857]' : change > 0.0005 ? 'text-[#B91C1C]' : 'text-ink-3')}>
                                    {change < -0.0005 ? <ArrowDownRight size={14} /> : change > 0.0005 ? <ArrowUpRight size={14} /> : <Minus size={14} />}
                                    {Math.abs(change) < 0.0005 ? 'Unchanged' : `${change > 0 ? '+' : '−'}${Math.abs(change * 100).toFixed(1)}%`} over {months} months
                                </p>
                            )}
                            {currentOffer && currentOffer.percent > 0 && (
                                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#FEF2F2] px-2 py-1 text-[12px] font-medium text-[#B91C1C]">
                                    <Tag size={12} /> Live offer −{currentOffer.percent}%: {formatPrice(currentOffer.casePrice)} / case
                                </p>
                            )}
                        </div>
                        {hi > lo ? <RangeBar min={lo} max={hi} now={latest ?? lo} label={`${months}-month range`} /> : <p className="text-[13px] text-ink-3">The listed price hasn’t changed in this period.</p>}
                    </div>

                    {/* History */}
                    <div className="px-2 sm:px-3 pt-4 h-[230px]" role="img" aria-label={`Listed price per case over the last ${months} months: low ${formatPrice(lo)}, high ${formatPrice(hi)}, now ${latest !== undefined ? formatPrice(latest) : 'unknown'}`}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chart} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                                <defs>
                                    <linearGradient id="phFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={TEAL} stopOpacity={0.18} />
                                        <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke="rgb(230 232 236)" strokeDasharray="3 4" />
                                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} minTickGap={28} />
                                <YAxis tickLine={false} axisLine={false} width={66} tick={{ fontSize: 11, fill: '#64748B' }} domain={[(min: number) => min * 0.97, (max: number) => max * 1.03]} tickFormatter={(v) => `€${Number(v).toFixed(2)}`} />
                                {latest !== undefined && <ReferenceLine y={latest} stroke="#0B1F3A" strokeDasharray="4 4" strokeOpacity={0.45} label={{ value: 'Now', position: 'insideTopRight', fontSize: 11, fill: '#0B1F3A' }} />}
                                <Tooltip cursor={{ stroke: '#94A3B8', strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? (
                                    <div className="rounded-lg bg-white ring-1 ring-line shadow-lg px-3 py-2 text-[12.5px]">
                                        <p className="font-semibold text-heading tabular-nums">{formatPrice((payload[0].payload as any).price)} / case</p>
                                        <p className="text-ink-3">{(payload[0].payload as any).extended ? 'Listed today' : (payload[0].payload as any).carried ? `In effect on ${fmtDate((payload[0].payload as any).t)}` : `Changed on ${fmtDate((payload[0].payload as any).t)}`}</p>
                                    </div>
                                ) : null} />
                                <Area type="stepAfter" dataKey="price" stroke={TEAL} strokeWidth={2.25} fill="url(#phFill)" isAnimationActive={false}
                                    dot={(props: any) => (props.payload?.extended || props.payload?.carried ? <g key={props.key} /> : <circle key={props.key} cx={props.cx} cy={props.cy} r={3.5} fill="#fff" stroke={TEAL} strokeWidth={2} />)}
                                    activeDot={{ r: 5, fill: TEAL, stroke: '#fff', strokeWidth: 2 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <dl className="grid grid-cols-2 lg:grid-cols-4 border-t border-line text-[12.5px]">
                        {[
                            ['Recorded changes', `${recorded}`, `in ${months} months`],
                            [`${months === 3 ? '3' : '12'}-month low`, range ? formatPrice(range.min) : '—', range ? `since ${fmtDate(range.since)}` : ''],
                            [`${months === 3 ? '3' : '12'}-month high`, range ? formatPrice(range.max) : '—', range ? `since ${fmtDate(range.since)}` : ''],
                            ['3-month average', data.range3m ? formatPrice(data.range3m.average) : '—', 'time-weighted'],
                        ].map(([label, value, note], i) => (
                            <div key={label} className={cn('px-4 py-3', i > 0 && 'border-s border-line', i === 2 && 'max-lg:border-s-0 max-lg:border-t', i === 3 && 'max-lg:border-t')}>
                                <dt className="text-ink-3">{label}</dt>
                                <dd className="mt-0.5 text-[15px] font-semibold text-heading tabular-nums">{value}</dd>
                                {note && <dd className="text-ink-4">{note}</dd>}
                            </div>
                        ))}
                    </dl>
                    <p className="px-4 py-2.5 border-t border-line bg-surface-2 text-[12px] text-ink-3">
                        <span className="inline-flex items-center gap-1.5 me-3"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-[#0E7C74] bg-white" /> recorded price change</span>
                        Listed case price (case tier), EUR, excluding delivery and VAT — not completed sales.{data.firstRecordedAt ? ` History starts ${fmtDate(data.firstRecordedAt)}.` : ''}
                    </p>
                </div>
            )}
        </section>
    );
}
