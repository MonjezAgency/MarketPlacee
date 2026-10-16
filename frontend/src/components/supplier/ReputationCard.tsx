'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { supplierApi } from '@/lib/supplier-api';
import { SettingsCard } from '@/components/account/AccountCards';
import { useLanguage } from '@/contexts/LanguageContext';

/** Average rating across the supplier's products, from real buyer reviews only. */
export function ReputationCard() {
    const [data, setData] = React.useState<any | null | undefined>(undefined);
    const { t, fmt } = useLanguage();
    const tr = (key: string, vars?: Record<string, string | number>) => t('supplierShell', key, vars);
    React.useEffect(() => { supplierApi.reputation().then(setData).catch(() => setData(null)); }, []);
    return (
        <SettingsCard icon={<Star size={17} />} title={tr('ratingsTitle')} desc={tr('ratingsDesc')}>
            {data === undefined ? <p className="text-[13px] text-ink-3">{tr('loading')}</p>
                : data === null ? <p className="text-[13px] text-ink-3">{tr('ratingsFailed')}</p>
                    : data.count === 0 ? <p className="text-[13.5px] text-ink-2">{tr('noReviews')}</p>
                        : (
                            <div className="space-y-3">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[28px] font-semibold text-heading tabular-nums">{fmt.number(data.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                                    <span className="text-[13px] text-ink-3">{tr('outOfFive', { count: Number(data.count) || 0 })}</span>
                                </div>
                                <ul className="space-y-1" aria-label={tr('ratingDistribution')}>
                                    {[5, 4, 3, 2, 1].map((r) => {
                                        const n = data.distribution[r] || 0;
                                        return (
                                            <li key={r} className="flex items-center gap-2 text-[12.5px]">
                                                <span className="w-6 tabular-nums text-ink-3">{fmt.number(r)}★</span>
                                                <span className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden"><span className="block h-full bg-amber-400" style={{ width: `${(n / data.count) * 100}%` }} /></span>
                                                <span className="w-6 text-end tabular-nums text-ink-3">{fmt.number(n)}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {data.recent?.length > 0 && (
                                    <ul className="pt-2 border-t border-line space-y-2">
                                        {data.recent.slice(0, 4).map((r: any) => (
                                            <li key={r.id} className="text-[12.5px]">
                                                <p className="text-ink"><span className="text-amber-600">{'★'.repeat(r.rating)}</span><span className="text-ink-4">{'★'.repeat(5 - r.rating)}</span> · {r.productName}</p>
                                                {r.comment && <p className="text-ink-2 line-clamp-2">“{r.comment}”</p>}
                                                <p className="text-ink-4">{fmt.date(r.createdAt)}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
        </SettingsCard>
    );
}
