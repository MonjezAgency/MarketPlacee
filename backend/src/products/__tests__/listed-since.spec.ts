import { listedSince } from '../listed-since';

describe('listedSince (UTC)', () => {
    const now = new Date('2026-10-14T15:30:00Z'); // a Wednesday
    it('today starts at UTC midnight', () => expect(listedSince('today', now)!.toISOString()).toBe('2026-10-14T00:00:00.000Z'));
    it('this week starts on Monday', () => expect(listedSince('week', now)!.toISOString()).toBe('2026-10-12T00:00:00.000Z'));
    it('a Sunday belongs to the week that started the previous Monday', () =>
        expect(listedSince('week', new Date('2026-10-18T23:59:00Z'))!.toISOString()).toBe('2026-10-12T00:00:00.000Z'));
    it('this month starts on the 1st', () => expect(listedSince('month', now)!.toISOString()).toBe('2026-10-01T00:00:00.000Z'));
    it('all / unknown means no bound', () => { expect(listedSince(undefined, now)).toBeNull(); expect(listedSince('all', now)).toBeNull(); });
});
