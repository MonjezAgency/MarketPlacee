'use client';

import * as React from 'react';
import { Star, BadgeCheck, MessageSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * Ratings at a glance, next to the price data: average, distribution and how
 * many come from buyers with a delivered order. Only real reviews from the
 * database; links straight to the full list just below.
 */
export default function RatingSummary({ productId, refreshKey, onWrite }: { productId: string; refreshKey?: string | number; onWrite?: () => void }) {
    const [reviews, setReviews] = React.useState<{ rating: number; verifiedPurchase?: boolean }[] | null>(null);
    React.useEffect(() => {
        apiFetch(`/products/${productId}/reviews`).then((r) => (r.ok ? r.json() : [])).then((d) => setReviews(Array.isArray(d) ? d : [])).catch(() => setReviews([]));
    }, [productId, refreshKey]);

    const n = reviews?.length ?? 0;
    const avg = n ? reviews!.reduce((s, r) => s + r.rating, 0) / n : 0;
    const verified = reviews?.filter((r) => r.verifiedPurchase).length ?? 0;
    const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews?.filter((r) => r.rating === star).length ?? 0 }));
    const go = () => document.getElementById('pdp-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <aside aria-labelledby="rs-title" className="rounded-2xl ring-1 ring-line bg-surface p-5 h-fit">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">Buyer feedback</p>
            <h2 id="rs-title" className="mt-0.5 text-[19px] font-bold text-heading">Ratings</h2>
            {reviews === null ? <div className="mt-4 h-[150px] rounded-xl bg-surface-2 animate-pulse" /> : n === 0 ? (
                <div className="mt-4">
                    <p className="text-[14px] text-ink-2">No reviews yet.</p>
                    <p className="mt-1 text-[13px] text-ink-3">Bought this product? Your rating helps other buyers.</p>
                    {onWrite && <button type="button" onClick={onWrite} className="mt-3 h-9 px-4 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:ring-teal">Write a review</button>}
                </div>
            ) : (
                <>
                    <div className="mt-3 flex items-end gap-3">
                        <span className="text-[38px] leading-none font-bold text-heading tabular-nums">{avg.toFixed(1)}</span>
                        <div className="pb-1">
                            <span className="flex gap-0.5" aria-label={`${avg.toFixed(1)} out of 5`}>
                                {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={15} className={i < Math.round(avg) ? 'fill-[#F59E0B] text-[#F59E0B]' : 'text-[#E2E8F0]'} />)}
                            </span>
                            <span className="text-[12.5px] text-ink-3">{n} review{n === 1 ? '' : 's'}</span>
                        </div>
                    </div>
                    <ul className="mt-4 space-y-1.5">
                        {dist.map((d) => (
                            <li key={d.star} className="flex items-center gap-2 text-[12.5px] text-ink-3 tabular-nums">
                                <span className="w-7">{d.star}★</span>
                                <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden"><span className="block h-full rounded-full bg-[#F59E0B]" style={{ width: `${(d.count / n) * 100}%` }} /></span>
                                <span className="w-6 text-end">{d.count}</span>
                            </li>
                        ))}
                    </ul>
                    {verified > 0 && <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-[#047857]"><BadgeCheck size={14} /> {verified} from buyers with a delivered order</p>}
                    <button type="button" onClick={go} className="mt-4 w-full h-9 rounded-lg ring-1 ring-line-strong text-[13px] font-semibold text-ink hover:ring-teal inline-flex items-center justify-center gap-1.5"><MessageSquare size={14} /> Read all reviews</button>
                </>
            )}
        </aside>
    );
}
