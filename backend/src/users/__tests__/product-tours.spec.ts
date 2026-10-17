import { toursForRole, tourRolloutDate, isTourEligible, toursView, parseTourUpdate, applyTourUpdate, readTour, DEFAULT_TOUR_ROLLOUT } from '../product-tours';

const ROLLOUT = new Date('2026-10-16T23:30:00.000Z');
const NEW_USER = new Date('2026-10-18T09:00:00.000Z');
const OLD_USER = new Date('2025-01-01T00:00:00.000Z');

describe('product tours', () => {
    it('maps roles to tours', () => {
        expect(toursForRole('SUPPLIER')).toEqual(['supplier-dashboard']);
        expect(toursForRole('customer')).toEqual(['buyer-dashboard']);
        expect(toursForRole('ADMIN')).toEqual([]);
        expect(toursForRole('OWNER')).toEqual([]);
        expect(toursForRole(undefined)).toEqual([]);
    });

    it('reads the rollout date from env with a safe default', () => {
        expect(tourRolloutDate(undefined).toISOString()).toBe(DEFAULT_TOUR_ROLLOUT);
        expect(tourRolloutDate('not a date').toISOString()).toBe(DEFAULT_TOUR_ROLLOUT);
        expect(tourRolloutDate('2027-01-01T00:00:00Z').toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('applies the rollout rule', () => {
        expect(isTourEligible(null, NEW_USER, ROLLOUT)).toBe(true);
        expect(isTourEligible(null, ROLLOUT, ROLLOUT)).toBe(true); // created exactly at rollout
        expect(isTourEligible(null, OLD_USER, ROLLOUT)).toBe(false); // existing accounts don't get it
        expect(isTourEligible(null, null, ROLLOUT)).toBe(false);
        // A started tour resumes even for an account created before the rollout.
        expect(isTourEligible({ status: 'started', step: 2, at: '' }, OLD_USER, ROLLOUT)).toBe(true);
        expect(isTourEligible({ status: 'completed', step: 4, at: '' }, NEW_USER, ROLLOUT)).toBe(false);
        expect(isTourEligible({ status: 'skipped', step: 1, at: '' }, NEW_USER, ROLLOUT)).toBe(false);
    });

    it('builds the GET view per role', () => {
        expect(toursView({ role: 'SUPPLIER', createdAt: NEW_USER, productTours: null }, ROLLOUT)).toEqual({ 'supplier-dashboard': { eligible: true, status: null, step: 0 } });
        expect(toursView({ role: 'CUSTOMER', createdAt: OLD_USER, productTours: { 'buyer-dashboard': { status: 'started', step: 3, at: 'x' } } }, ROLLOUT))
            .toEqual({ 'buyer-dashboard': { eligible: true, status: 'started', step: 3 } });
        expect(toursView({ role: 'ADMIN', createdAt: NEW_USER }, ROLLOUT)).toEqual({});
    });

    it('ignores malformed stored data', () => {
        expect(readTour([], 'buyer-dashboard')).toBeNull();
        expect(readTour({ 'buyer-dashboard': { status: 'weird' } }, 'buyer-dashboard')).toBeNull();
        expect(readTour({ 'buyer-dashboard': { status: 'started', step: 99 } }, 'buyer-dashboard')?.step).toBe(0);
    });

    it('validates updates', () => {
        expect(parseTourUpdate('SUPPLIER', 'supplier-dashboard', { status: 'started', step: 0 })).toEqual({ status: 'started', step: 0 });
        expect(parseTourUpdate('CUSTOMER', 'buyer-dashboard', { status: 'completed' })).toEqual({ status: 'completed' });
        expect(() => parseTourUpdate('CUSTOMER', 'supplier-dashboard', { status: 'started' })).toThrow(); // not the caller's tour
        expect(() => parseTourUpdate('ADMIN', 'buyer-dashboard', { status: 'started' })).toThrow();
        expect(() => parseTourUpdate('SUPPLIER', 'supplier-dashboard', { status: 'done' })).toThrow();
        expect(() => parseTourUpdate('SUPPLIER', 'supplier-dashboard', { status: 'started', step: 21 })).toThrow();
        expect(() => parseTourUpdate('SUPPLIER', 'supplier-dashboard', { status: 'started', step: -1 })).toThrow();
        expect(() => parseTourUpdate('SUPPLIER', 'supplier-dashboard', { status: 'started', step: 1.5 })).toThrow();
        expect(() => parseTourUpdate('SUPPLIER', 'supplier-dashboard', { status: 'started', step: '2' })).toThrow();
        expect(() => parseTourUpdate('SUPPLIER', 'supplier-dashboard', null)).toThrow();
    });

    it('merges updates without touching other keys', () => {
        const now = new Date('2026-10-20T10:00:00.000Z');
        const other = { 'other-tour': { status: 'completed', step: 2, at: 'y' }, extra: 1 };
        const r = applyTourUpdate(other, 'supplier-dashboard', { status: 'started', step: 0 }, now);
        expect(r.changed).toBe(true);
        expect(r.json).toEqual({ ...other, 'supplier-dashboard': { status: 'started', step: 0, at: now.toISOString() } });
        // Step persists; status-only update keeps the step.
        const r2 = applyTourUpdate(r.json, 'supplier-dashboard', { status: 'started', step: 3 }, now);
        expect(r2.state.step).toBe(3);
        const r3 = applyTourUpdate(r2.json, 'supplier-dashboard', { status: 'completed' }, now);
        expect(r3.state).toEqual({ status: 'completed', step: 3, at: now.toISOString() });
        expect(applyTourUpdate(null, 'buyer-dashboard', { status: 'skipped' }, now).json).toEqual({ 'buyer-dashboard': { status: 'skipped', step: 0, at: now.toISOString() } });
    });

    it('never reopens a finished tour', () => {
        const done = { 'buyer-dashboard': { status: 'completed', step: 4, at: 'a' } };
        const r = applyTourUpdate(done, 'buyer-dashboard', { status: 'started', step: 0 });
        expect(r.changed).toBe(false);
        expect(r.state).toEqual({ status: 'completed', step: 4, at: 'a' });
        const skipped = { 'buyer-dashboard': { status: 'skipped', step: 1, at: 'b' } };
        expect(applyTourUpdate(skipped, 'buyer-dashboard', { status: 'completed' }).state.status).toBe('skipped');
    });
});
