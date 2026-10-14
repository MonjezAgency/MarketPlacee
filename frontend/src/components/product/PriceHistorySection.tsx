'use client';

import * as React from 'react';
import Link from 'next/link';
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Lock, LineChart as ChartIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatPrice } from '@/lib/currency';
import { cn } from '@/lib/utils';

const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Listed-price history for a product (buyer-facing case price, EUR). Shows
 * only recorded observations — no interpolation, no invented points — and an
 * honest empty state while history is still being collected.
 */
export default function PriceHistorySection({ productId, isLoggedIn }: { productId: string; isLoggedIn: boolean }) {
    const [months, setMonths] = React.useState<3 | 6 | 12>(12);
    const [data, setData] = React.useState<any | null>(null);
    const [error, setError] = React.useState(false);

    React.useEffect(() => {
        if (!isLoggedIn) return;
        setError(false);
        apiFetch(`/products/${productId}/price-history?months=${months}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true));
    }, [productId, months, isLoggedIn]);

    if (data?.ownerView) return null; // suppliers don't see buyer prices for their own listing

    const points = (data?.points ?? []).map((p: any) => ({ ...p, t: +new Date(p.at) }));
    // Step line: extend the last recorded price to today so the chart shows the price still in effect.
    const chart = points.length ? [...points, { price: points[points.length - 1].price, t: Date.now(), extended: true }] : [];
    const locked = !isLoggedIn || data?.locked;
    const enough = points.length >= 1;

    return (
        <section aria-labelledby="ph-title" className="mt-2 pt-8 border-t border-line">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="ph-title" className="text-[18px] font-bold text-heading">Price history</h2>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">Listed price per case (case tier), EUR, excluding delivery. Recorded each time the listed price changes.</p>
                </div>
                {!locked && (
                    <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg ring-1 ring-line p-0.5">
                        {([3, 6, 12] as const).map((m) => (
                            <button key={m} role="radio" aria-checked={months === m} onClick={() => setMonths(m)} className={cn('h-8 px-3 rounded-md text-[13px] font-medium', months === m ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>{m} months</button>
                        ))}
                    </div>
                )}
            </div>

            {locked ? (
                <div className="mt-4 relative rounded-2xl ring-1 ring-line bg-surface-2 h-[220px] overflow-hidden">
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
                <div className="mt-4 h-[220px] rounded-2xl bg-surface-2 animate-pulse" />
            ) : !enough ? (
                <div className="mt-4 rounded-2xl ring-1 ring-line px-5 py-8 text-center">
                    <ChartIcon size={20} className="mx-auto text-ink-3" />
                    <p className="mt-2 text-[14px] font-semibold text-heading">No price history yet</p>
                    <p className="text-[13px] text-ink-3">We record the listed price each time it changes; the chart appears once there’s data.</p>
                </div>
            ) : (
                <>
                    <div className="mt-4 h-[240px] -ms-2" role="img" aria-label={`Listed price per case over the last ${months} months`}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                                <CartesianGrid vertical={false} stroke="rgb(230 232 236)" />
                                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} minTickGap={24} />
                                <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: '#64748B' }} domain={['auto', 'auto']} tickFormatter={(v) => `€${Number(v).toFixed(2)}`} />
                                <Tooltip content={({ active, payload }) => active && payload?.length ? (
                                    <div className="rounded-lg bg-white ring-1 ring-line shadow-lg px-3 py-2 text-[12.5px]">
                                        <p className="font-semibold text-heading">{formatPrice((payload[0].payload as any).price)} / case</p>
                                        <p className="text-ink-3">{(payload[0].payload as any).extended ? 'In effect today' : (payload[0].payload as any).carried ? `In effect at ${fmtDate((payload[0].payload as any).t)}` : `Recorded ${fmtDate((payload[0].payload as any).t)}`}</p>
                                    </div>
                                ) : null} />
                                <Line type="stepAfter" dataKey="price" stroke="#0E7C74" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            ['Latest listed price', data.latest ? `${formatPrice(data.latest.price)}` : '—', data.latest ? `recorded ${fmtDate(data.latest.at)}` : ''],
                            ['12-month range', data.range12m ? `${formatPrice(data.range12m.min)} – ${formatPrice(data.range12m.max)}` : '—', data.range12m ? `since ${fmtDate(data.range12m.since)}` : ''],
                            ['3-month range', data.range3m ? `${formatPrice(data.range3m.min)} – ${formatPrice(data.range3m.max)}` : '—', data.range3m ? `since ${fmtDate(data.range3m.since)}` : ''],
                            ['Average (3 months)', data.range3m ? formatPrice(data.range3m.average) : '—', 'time-weighted, listed price'],
                        ].map(([label, value, note]) => (
                            <div key={label} className="rounded-xl ring-1 ring-line bg-surface p-4">
                                <p className="text-[18px] font-semibold text-heading tabular-nums">{value}</p>
                                <p className="text-[12.5px] text-ink-3">{label}{note ? ` · ${note}` : ''}</p>
                            </div>
                        ))}
                    </div>
                    {data.firstRecordedAt && <p className="mt-2 text-[12px] text-ink-4">History starts {fmtDate(data.firstRecordedAt)}; earlier prices weren’t recorded. These are listed prices, not completed sales.</p>}
                </>
            )}
        </section>
    );
}
