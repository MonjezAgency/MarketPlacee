'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputCls } from '@/components/supplier/ui';
import { useLanguage } from '@/contexts/LanguageContext';
import { ApiError, isoDay } from '@/lib/supplier-api';

/**
 * Reporting-period control shared by the supplier and founder overviews.
 * Presets and custom dates are sent to the server as-is; the server resolves
 * the calendar days (report-range.ts) and the page shows what came back.
 * Labels come from the `supplierOverview` dictionary (one wording everywhere).
 */
export const RANGES = [
    { id: '3d', labelKey: 'range3d' },
    { id: '7d', labelKey: 'range7d' },
    { id: '30d', labelKey: 'range30d' },
    { id: '12m', labelKey: 'range12m' },
    { id: 'custom', labelKey: 'rangeCustom' },
] as const;
export type RangeId = (typeof RANGES)[number]['id'];
export type CustomRange = { from: string; to: string };

const RANGE_ERRORS: Record<string, string> = { RANGE_FUTURE: 'errRangeFuture', RANGE_ORDER: 'errRangeOrder', RANGE_TOO_LONG: 'errRangeTooLong', RANGE_INVALID: 'errRangeInvalid', TZ_INVALID: 'errRangeInvalid' };
const DAY = 86_400_000;

export const defaultCustom = (): CustomRange => ({ from: isoDay(new Date(Date.now() - 29 * DAY)), to: isoDay(new Date()) });

/** The dictionary key for a server range error, or null when it is something else. */
export function rangeErrorKey(e: unknown): string | null {
    const code = e instanceof ApiError ? e.body?.code : null;
    return code && RANGE_ERRORS[code] ? RANGE_ERRORS[code] : null;
}

export function RangePicker({ range, onRange, custom, onCustom, resolved, idPrefix = 'rp' }: {
    range: RangeId; onRange: (r: RangeId) => void;
    custom: CustomRange; onCustom: (c: CustomRange) => void;
    /** Range echoed by the server: calendar days and the comparison period. */
    resolved?: { from: string; to: string; timeZone: string; previous: { from: string; to: string } } | null;
    idPrefix?: string;
}) {
    const { t, fmt } = useLanguage();
    const tr = (k: string, v?: Record<string, string | number>) => t('supplierOverview', k, v);
    const today = isoDay(new Date());
    const day = (d: string) => fmt.date(d + 'T12:00:00Z', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
                <div role="radiogroup" aria-label={tr('rangeAria')} className="inline-flex flex-wrap rounded-lg bg-surface ring-1 ring-line p-0.5">
                    {RANGES.map((x) => (
                        <button key={x.id} type="button" role="radio" aria-checked={range === x.id} onClick={() => onRange(x.id)}
                            className={cn('h-8 px-3 rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                                range === x.id ? 'bg-heading text-white' : 'text-ink-2 hover:bg-surface-2')}>
                            {tr(x.labelKey)}
                        </button>
                    ))}
                </div>
                {range === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`${idPrefix}-from`}>{tr('fromLabel')}</label>
                        <input id={`${idPrefix}-from`} type="date" max={custom.to} value={custom.from} onChange={(e) => e.target.value && onCustom({ ...custom, from: e.target.value })} className={cn(inputCls, 'h-8 w-[150px] text-[13px]')} />
                        <span className="text-ink-3 text-[13px]">{tr('rangeSeparator')}</span>
                        <label className="sr-only" htmlFor={`${idPrefix}-to`}>{tr('toLabel')}</label>
                        <input id={`${idPrefix}-to`} type="date" min={custom.from} max={today} value={custom.to} onChange={(e) => e.target.value && onCustom({ ...custom, to: e.target.value })} className={cn(inputCls, 'h-8 w-[150px] text-[13px]')} />
                    </div>
                )}
            </div>
            <p className="text-[12.5px] text-ink-3" aria-live="polite">
                {resolved ? <>{tr('periodLine', { from: day(resolved.from), to: day(resolved.to), prevFrom: day(resolved.previous.from), prevTo: day(resolved.previous.to) })} {tr('tzNote', { tz: resolved.timeZone })}</> : <span>{' '}</span>}
            </p>
        </div>
    );
}
