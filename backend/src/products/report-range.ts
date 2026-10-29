/**
 * Reporting date ranges — calendar days in one IANA time zone, resolved on the
 * server so every figure and the labels the page shows agree.
 *
 *  • Presets: 3d / 7d / 30d = today and the previous 2 / 6 / 29 calendar days;
 *    12m = the current calendar month and the previous 11 months (up to today).
 *  • Custom: inclusive start and end dates (YYYY-MM-DD). The end may not be
 *    after today, start ≤ end, at most MAX_CUSTOM_DAYS days.
 *  • Every range becomes [start inclusive, end exclusive) instants: start =
 *    local midnight of the first day, end = local midnight after the last day.
 *    Boundaries come from the zone's real offset on that date, so days that
 *    switch to or from summer time are 23 or 25 hours long.
 *  • Buckets: days for ranges up to DAILY_MAX_DAYS days, calendar months
 *    otherwise (always months for 12m). A bucket that isn't a whole, finished
 *    day or month (the current one, or a month cut by a custom range) is
 *    marked `partial`.
 *  • Comparison: the same number of calendar days immediately before; for 12m
 *    the same calendar span one year earlier (equal length in months).
 *
 * The time zone is the supplier account's when the account has one (the User
 * model has none today), otherwise REPORT_TIME_ZONE — UTC, the calendar the
 * rest of Ali FMCG already uses for dates (ISO day keys, invoices, emails).
 */
export const REPORT_TIME_ZONE = 'UTC';
export const MAX_CUSTOM_DAYS = 366;
export const DAILY_MAX_DAYS = 62;
export const PRESETS = ['3d', '7d', '30d', '12m', 'custom'] as const;
export type RangePreset = (typeof PRESETS)[number];

export type RangeErrorCode = 'RANGE_INVALID' | 'RANGE_FUTURE' | 'RANGE_ORDER' | 'RANGE_TOO_LONG' | 'TZ_INVALID';
export class ReportRangeError extends Error {
    constructor(public readonly code: RangeErrorCode, message: string) { super(message); }
}

export interface Bucket { key: string; start: Date; end: Date; partial: boolean }
export interface ResolvedRange {
    preset: RangePreset;
    timeZone: string;
    /** Inclusive calendar days, in the time zone. */
    fromDay: string;
    toDay: string;
    days: number;
    /** [start, end) instants. */
    start: Date;
    end: Date;
    granularity: 'day' | 'month';
    buckets: Bucket[];
    previous: { fromDay: string; toDay: string; start: Date; end: Date; days: number };
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
    let f = fmtCache.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        fmtCache.set(tz, f);
    }
    return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
    if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
    try { formatter(tz); return true; } catch { return false; }
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(t: Date | number, tz: string) {
    const parts = formatter(tz).formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

/** The zone's UTC offset (ms, local − UTC) at an instant. */
export function offsetMs(t: number, tz: string): number {
    const whole = Math.floor(t / 1000) * 1000;
    const p = zonedParts(whole, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - whole;
}

/** Calendar day (YYYY-MM-DD) of an instant in a zone. */
export function dayKey(t: Date | number, tz: string): string {
    const p = zonedParts(t, tz);
    return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
export const monthKey = (t: Date | number, tz: string) => dayKey(t, tz).slice(0, 7);

const parseDay = (day: string) => { const [y, m, d] = day.split('-').map(Number); return { y, m, d }; };
export function addDays(day: string, n: number): string {
    const { y, m, d } = parseDay(day);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function addMonths(month: string, n: number): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
const daysInclusive = (from: string, to: string) => {
    const a = parseDay(from), b = parseDay(to);
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS) + 1;
};
const lastDayOfMonth = (month: string) => addDays(addMonths(month, 1) + '-01', -1);

/** First instant of a calendar day in a zone (DST-correct). */
export function startOfDay(day: string, tz: string): Date {
    const { y, m, d } = parseDay(day);
    const guess = Date.UTC(y, m - 1, d);
    const a = guess - offsetMs(guess, tz);
    const b = guess - offsetMs(a, tz);
    // Prefer the earliest candidate that falls on the requested day (covers zones whose midnight is skipped).
    const ok = [a, b].filter((t) => dayKey(t, tz) === day).sort((x, y2) => x - y2);
    if (ok.length) {
        // Step back while the previous minute is still the same day (midnight skipped by a DST jump).
        let t = ok[0];
        while (dayKey(t - 60_000, tz) === day) t -= 60_000;
        return new Date(t);
    }
    return new Date(Math.max(a, b));
}

const isDay = (s: unknown): s is string => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const { y, m, d } = parseDay(s);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

export function resolveRange(input: { range?: string; from?: string; to?: string; tz?: string }, now: Date = new Date()): ResolvedRange {
    const timeZone = input.tz ? String(input.tz) : REPORT_TIME_ZONE;
    if (!isValidTimeZone(timeZone)) throw new ReportRangeError('TZ_INVALID', `Unknown time zone “${String(input.tz).slice(0, 64)}”.`);
    const preset = (input.range || (input.from || input.to ? 'custom' : '30d')) as RangePreset;
    if (!PRESETS.includes(preset)) throw new ReportRangeError('RANGE_INVALID', 'Choose 3d, 7d, 30d, 12m or custom.');
    const today = dayKey(now, timeZone);

    let fromDay: string, toDay: string, granularity: 'day' | 'month', prevFrom: string, prevTo: string;
    if (preset === '12m') {
        const firstMonth = addMonths(today.slice(0, 7), -11);
        fromDay = `${firstMonth}-01`; toDay = today; granularity = 'month';
        prevFrom = `${addMonths(firstMonth, -12)}-01`;
        const sameDayLastYear = `${addMonths(today.slice(0, 7), -12)}-${today.slice(8)}`;
        const cap = lastDayOfMonth(addMonths(today.slice(0, 7), -12));
        prevTo = isDay(sameDayLastYear) ? sameDayLastYear : cap;
    } else {
        if (preset === 'custom') {
            if (!isDay(input.from) || !isDay(input.to)) throw new ReportRangeError('RANGE_INVALID', 'Give both dates as YYYY-MM-DD.');
            fromDay = input.from; toDay = input.to;
            if (toDay > today) throw new ReportRangeError('RANGE_FUTURE', 'The end date can’t be after today.');
            if (fromDay > toDay) throw new ReportRangeError('RANGE_ORDER', 'The start date must be on or before the end date.');
            if (daysInclusive(fromDay, toDay) > MAX_CUSTOM_DAYS) throw new ReportRangeError('RANGE_TOO_LONG', `Choose ${MAX_CUSTOM_DAYS} days or fewer.`);
        } else {
            const n = preset === '3d' ? 3 : preset === '7d' ? 7 : 30;
            toDay = today; fromDay = addDays(today, -(n - 1));
        }
        const n = daysInclusive(fromDay, toDay);
        granularity = n <= DAILY_MAX_DAYS ? 'day' : 'month';
        prevTo = addDays(fromDay, -1); prevFrom = addDays(fromDay, -n);
    }

    const start = startOfDay(fromDay, timeZone);
    const end = startOfDay(addDays(toDay, 1), timeZone);
    const buckets: Bucket[] = [];
    if (granularity === 'day') {
        for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
            buckets.push({ key: d, start: startOfDay(d, timeZone), end: startOfDay(addDays(d, 1), timeZone), partial: d === today });
        }
    } else {
        for (let mo = fromDay.slice(0, 7); mo <= toDay.slice(0, 7); mo = addMonths(mo, 1)) {
            const mStart = startOfDay(`${mo}-01`, timeZone), mEnd = startOfDay(`${addMonths(mo, 1)}-01`, timeZone);
            const bStart = mStart < start ? start : mStart, bEnd = mEnd > end ? end : mEnd;
            buckets.push({ key: mo, start: bStart, end: bEnd, partial: bStart > mStart || bEnd < mEnd || mo === today.slice(0, 7) });
        }
    }
    return {
        preset, timeZone, fromDay, toDay, days: daysInclusive(fromDay, toDay), start, end, granularity, buckets,
        previous: { fromDay: prevFrom, toDay: prevTo, start: startOfDay(prevFrom, timeZone), end: startOfDay(addDays(prevTo, 1), timeZone), days: daysInclusive(prevFrom, prevTo) },
    };
}

/** Index of the bucket an instant falls in, or -1 outside the range. */
export function bucketIndex(range: Pick<ResolvedRange, 'buckets'>, t: Date | number): number {
    const ms = new Date(t).getTime();
    // Buckets are contiguous and sorted; ranges are at most ~366 entries.
    for (let i = 0; i < range.buckets.length; i++) {
        const b = range.buckets[i];
        if (ms >= b.start.getTime() && ms < b.end.getTime()) return i;
    }
    return -1;
}

export const within = (t: Date | number | null | undefined, start: Date, end: Date) => {
    if (t === null || t === undefined) return false;
    const ms = new Date(t).getTime();
    return ms >= start.getTime() && ms < end.getTime();
};
