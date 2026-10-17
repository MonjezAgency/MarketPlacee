import { ReportRangeError, bucketIndex, resolveRange, startOfDay, within } from '../report-range';

/** Reporting ranges: presets, inclusive custom ends, [start, end) boundaries, DST and month/year edges. */
const NOW = new Date('2026-10-17T10:00:00Z'); // Saturday 17 Oct 2026
const BUC = 'Europe/Bucharest'; // EET +2 / EEST +3; DST 29 Mar 2026 and 25 Oct 2026
const H = 3_600_000;
const iso = (d: Date) => d.toISOString();

function code(fn: () => unknown): string | null {
    try { fn(); return null; } catch (e) { return e instanceof ReportRangeError ? e.code : 'OTHER'; }
}

describe('presets (UTC, the default zone)', () => {
    it('Last 3 days = today and the previous 2 calendar days', () => {
        const r = resolveRange({ range: '3d' }, NOW);
        expect([r.fromDay, r.toDay, r.days, r.timeZone]).toEqual(['2026-10-15', '2026-10-17', 3, 'UTC']);
        expect(iso(r.start)).toBe('2026-10-15T00:00:00.000Z');
        expect(iso(r.end)).toBe('2026-10-18T00:00:00.000Z');
        expect(r.granularity).toBe('day');
        expect(r.buckets.map((b) => b.key)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
        expect(r.buckets.map((b) => b.partial)).toEqual([false, false, true]);
        expect([r.previous.fromDay, r.previous.toDay]).toEqual(['2026-10-12', '2026-10-14']);
        expect(iso(r.previous.end)).toBe(iso(r.start));
    });

    it('Last 7 days and Last 30 days', () => {
        const w = resolveRange({ range: '7d' }, NOW);
        expect([w.fromDay, w.toDay, w.days, w.buckets.length]).toEqual(['2026-10-11', '2026-10-17', 7, 7]);
        expect([w.previous.fromDay, w.previous.toDay]).toEqual(['2026-10-04', '2026-10-10']);
        const m = resolveRange({ range: '30d' }, NOW);
        expect([m.fromDay, m.toDay, m.days, m.buckets.length, m.granularity]).toEqual(['2026-09-18', '2026-10-17', 30, 30, 'day']);
        expect([m.previous.fromDay, m.previous.toDay, m.previous.days]).toEqual(['2026-08-19', '2026-09-17', 30]);
    });

    it('defaults to Last 30 days', () => {
        expect(resolveRange({}, NOW).preset).toBe('30d');
    });

    it('Last 12 months = current calendar month + previous 11, current month partial', () => {
        const r = resolveRange({ range: '12m' }, NOW);
        expect([r.fromDay, r.toDay, r.granularity]).toEqual(['2025-11-01', '2026-10-17', 'month']);
        expect(r.buckets.map((b) => b.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
        expect(r.buckets.filter((b) => b.partial).map((b) => b.key)).toEqual(['2026-10']);
        expect(iso(r.buckets[11].end)).toBe('2026-10-18T00:00:00.000Z'); // up to the end of today
        expect(iso(r.buckets[1].start)).toBe('2025-12-01T00:00:00.000Z');
        expect(iso(r.buckets[1].end)).toBe('2026-01-01T00:00:00.000Z'); // year boundary
        expect([r.previous.fromDay, r.previous.toDay]).toEqual(['2024-11-01', '2025-10-17']);
    });

    it('12 months on 29 Feb compares with 28 Feb a year earlier', () => {
        const r = resolveRange({ range: '12m' }, new Date('2028-02-29T12:00:00Z'));
        expect([r.fromDay, r.previous.fromDay, r.previous.toDay]).toEqual(['2027-03-01', '2026-03-01', '2027-02-28']);
    });
});

describe('custom ranges', () => {
    it('includes the whole end day: [start, end) with end = midnight after 7 Oct', () => {
        const r = resolveRange({ range: 'custom', from: '2026-10-01', to: '2026-10-07' }, NOW);
        expect(iso(r.start)).toBe('2026-10-01T00:00:00.000Z');
        expect(iso(r.end)).toBe('2026-10-08T00:00:00.000Z');
        expect(within(new Date('2026-10-01T00:00:00.000Z'), r.start, r.end)).toBe(true); // exact start included
        expect(within(new Date('2026-09-30T23:59:59.999Z'), r.start, r.end)).toBe(false);
        expect(within(new Date('2026-10-07T23:59:59.999Z'), r.start, r.end)).toBe(true); // just before the exclusive end
        expect(within(new Date('2026-10-08T00:00:00.000Z'), r.start, r.end)).toBe(false); // at end: excluded
        expect([r.previous.fromDay, r.previous.toDay]).toEqual(['2026-09-24', '2026-09-30']);
    });

    it('from/to without range means custom; a single day works', () => {
        const r = resolveRange({ from: '2026-10-17', to: '2026-10-17' }, NOW);
        expect([r.preset, r.days, r.buckets.length]).toEqual(['custom', 1, 1]);
    });

    it('long custom ranges use month buckets, cut months marked partial', () => {
        const r = resolveRange({ range: 'custom', from: '2026-01-15', to: '2026-04-10' }, NOW);
        expect(r.granularity).toBe('month');
        expect(r.buckets.map((b) => [b.key, b.partial])).toEqual([['2026-01', true], ['2026-02', false], ['2026-03', false], ['2026-04', true]]);
        expect(iso(r.buckets[0].start)).toBe('2026-01-15T00:00:00.000Z');
        expect(iso(r.buckets[3].end)).toBe('2026-04-11T00:00:00.000Z');
    });

    it('year boundary with day buckets', () => {
        const r = resolveRange({ range: 'custom', from: '2025-12-30', to: '2026-01-02' }, NOW);
        expect(r.buckets.map((b) => b.key)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
    });

    it('rejects invalid input', () => {
        expect(code(() => resolveRange({ range: 'custom', from: '2026-10-01', to: '2026-10-18' }, NOW))).toBe('RANGE_FUTURE');
        expect(code(() => resolveRange({ range: 'custom', from: '2026-10-08', to: '2026-10-07' }, NOW))).toBe('RANGE_ORDER');
        expect(code(() => resolveRange({ range: 'custom', from: '2026-10-01' }, NOW))).toBe('RANGE_INVALID');
        expect(code(() => resolveRange({ range: 'custom', from: '2026-02-30', to: '2026-03-01' }, NOW))).toBe('RANGE_INVALID');
        expect(code(() => resolveRange({ range: 'custom', from: '2025-10-16', to: '2026-10-17' }, NOW))).toBe('RANGE_TOO_LONG'); // 367 days
        expect(code(() => resolveRange({ range: 'custom', from: '2025-10-17', to: '2026-10-17' }, NOW))).toBeNull(); // 366 days
        expect(code(() => resolveRange({ range: '90d' }, NOW))).toBe('RANGE_INVALID');
        expect(code(() => resolveRange({ range: '7d', tz: 'Mars/Olympus' }, NOW))).toBe('TZ_INVALID');
    });
});

describe('time zones and DST (Europe/Bucharest)', () => {
    it('“today” follows the zone: 22:30 UTC on 16 Oct is already 17 Oct in Bucharest', () => {
        const now = new Date('2026-10-16T22:30:00Z');
        expect(resolveRange({ range: '3d' }, now).toDay).toBe('2026-10-16');
        const r = resolveRange({ range: '3d', tz: BUC }, now);
        expect([r.fromDay, r.toDay]).toEqual(['2026-10-15', '2026-10-17']);
        expect(iso(r.start)).toBe('2026-10-14T21:00:00.000Z'); // local midnight, EEST (+3)
    });

    it('spring-forward day (29 Mar 2026) is 23 hours', () => {
        const r = resolveRange({ range: 'custom', from: '2026-03-29', to: '2026-03-29', tz: BUC }, NOW);
        expect(iso(r.start)).toBe('2026-03-28T22:00:00.000Z');
        expect(iso(r.end)).toBe('2026-03-29T21:00:00.000Z');
        expect(r.end.getTime() - r.start.getTime()).toBe(23 * H);
    });

    it('fall-back day (25 Oct 2026) is 25 hours', () => {
        const day = startOfDay('2026-10-25', BUC), next = startOfDay('2026-10-26', BUC);
        expect(iso(day)).toBe('2026-10-24T21:00:00.000Z');
        expect(iso(next)).toBe('2026-10-25T22:00:00.000Z');
        expect(next.getTime() - day.getTime()).toBe(25 * H);
    });

    it('day buckets across the DST change are contiguous and DST-correct', () => {
        const r = resolveRange({ range: 'custom', from: '2026-03-28', to: '2026-03-30', tz: BUC }, NOW);
        expect(r.buckets.map((b) => (b.end.getTime() - b.start.getTime()) / H)).toEqual([24, 23, 24]);
        for (let i = 1; i < r.buckets.length; i++) expect(r.buckets[i].start.getTime()).toBe(r.buckets[i - 1].end.getTime());
        // 23:30 local on 29 Mar (20:30 UTC, EEST) belongs to 29 Mar, 00:30 local on 30 Mar to 30 Mar.
        expect(r.buckets[bucketIndex(r, new Date('2026-03-29T20:30:00Z'))].key).toBe('2026-03-29');
        expect(r.buckets[bucketIndex(r, new Date('2026-03-29T21:30:00Z'))].key).toBe('2026-03-30');
        expect(bucketIndex(r, new Date('2026-03-27T21:59:59Z'))).toBe(-1);
    });

    it('month buckets start at local midnight on the 1st', () => {
        const r = resolveRange({ range: '12m', tz: BUC }, NOW);
        expect(iso(r.start)).toBe('2025-10-31T22:00:00.000Z'); // 1 Nov 2025 00:00 EET
        const apr = r.buckets.find((b) => b.key === '2026-04')!;
        expect(iso(apr.start)).toBe('2026-03-31T21:00:00.000Z'); // 1 Apr 00:00 EEST
        expect(r.buckets.filter((b) => b.partial).map((b) => b.key)).toEqual(['2026-10']);
    });
});
