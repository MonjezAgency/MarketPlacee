/**
 * First-login dashboard tours — pure rules, no database access.
 *
 * Storage: `User.productTours` (Json?), shaped
 *   { "<tourId>": { status: 'started' | 'completed' | 'skipped', step: number, at: ISO string } }
 *
 * Which tours apply to a user depends only on the role:
 *   SUPPLIER → 'supplier-dashboard', CUSTOMER (the buyer role) → 'buyer-dashboard'.
 *   Any other role has no tours.
 *
 * Rollout rule (existing accounts must not suddenly get a tour):
 *   eligible = status is not 'completed'/'skipped'
 *              AND (status === 'started' OR user.createdAt >= rollout date)
 * The rollout date comes from env PRODUCT_TOUR_FROM (ISO 8601), default
 * 2026-10-16T23:30:00.000Z. A tour that was already started stays eligible
 * (so it resumes) even if the rollout date is later moved.
 *
 * Transitions: started → completed | skipped. Once completed or skipped the
 * state is final; a later 'started' (or any other change) returns the stored state.
 */

export const TOUR_STATUSES = ['started', 'completed', 'skipped'] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];
export interface TourState { status: TourStatus; step: number; at: string }
export type ToursJson = Record<string, TourState>;
export interface TourView { eligible: boolean; status: TourStatus | null; step: number }

export const MAX_TOUR_STEP = 20;
export const DEFAULT_TOUR_ROLLOUT = '2026-10-16T23:30:00.000Z';

const TOURS_BY_ROLE: Record<string, string[]> = {
    SUPPLIER: ['supplier-dashboard'],
    CUSTOMER: ['buyer-dashboard'],
};

export class TourInputError extends Error { }

/** The tour ids that apply to a role (empty for roles without tours). */
export function toursForRole(role: string | null | undefined): string[] {
    return TOURS_BY_ROLE[String(role || '').toUpperCase()] ?? [];
}

/** Rollout date from PRODUCT_TOUR_FROM; an invalid value falls back to the default. */
export function tourRolloutDate(env: string | undefined = process.env.PRODUCT_TOUR_FROM): Date {
    const d = env ? new Date(env) : null;
    return d && !isNaN(d.getTime()) ? d : new Date(DEFAULT_TOUR_ROLLOUT);
}

/** Reads one tour's stored state, ignoring malformed data. */
export function readTour(json: unknown, tourId: string): TourState | null {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
    const raw = (json as Record<string, any>)[tourId];
    if (!raw || typeof raw !== 'object' || !TOUR_STATUSES.includes(raw.status)) return null;
    const step = Number.isInteger(raw.step) && raw.step >= 0 && raw.step <= MAX_TOUR_STEP ? raw.step : 0;
    return { status: raw.status, step, at: typeof raw.at === 'string' ? raw.at : '' };
}

export function isTourEligible(state: TourState | null, createdAt: Date | string | null | undefined, rollout: Date = tourRolloutDate()): boolean {
    if (state?.status === 'completed' || state?.status === 'skipped') return false;
    if (state?.status === 'started') return true;
    const created = createdAt ? new Date(createdAt) : null;
    return !!created && !isNaN(created.getTime()) && created.getTime() >= rollout.getTime();
}

/** GET /users/me/tours payload for a user. */
export function toursView(user: { role?: string | null; createdAt?: Date | string | null; productTours?: unknown }, rollout: Date = tourRolloutDate()): Record<string, TourView> {
    const out: Record<string, TourView> = {};
    for (const id of toursForRole(user.role)) {
        const s = readTour(user.productTours, id);
        out[id] = { eligible: isTourEligible(s, user.createdAt, rollout), status: s?.status ?? null, step: s?.step ?? 0 };
    }
    return out;
}

/** Validates a PATCH body; throws TourInputError on bad input. */
export function parseTourUpdate(role: string | null | undefined, tourId: string, body: unknown): { status: TourStatus; step?: number } {
    if (!toursForRole(role).includes(tourId)) throw new TourInputError('Unknown tour for this account.');
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (typeof b.status !== 'string' || !TOUR_STATUSES.includes(b.status as TourStatus)) throw new TourInputError('status must be started, completed or skipped.');
    if (b.step !== undefined && b.step !== null) {
        if (typeof b.step !== 'number' || !Number.isInteger(b.step) || b.step < 0 || b.step > MAX_TOUR_STEP) throw new TourInputError(`step must be an integer from 0 to ${MAX_TOUR_STEP}.`);
        return { status: b.status as TourStatus, step: b.step };
    }
    return { status: b.status as TourStatus };
}

/**
 * Applies an update. Returns the new full JSON (other keys untouched) and the
 * tour's resulting state. A finished tour (completed/skipped) never changes.
 */
export function applyTourUpdate(json: unknown, tourId: string, update: { status: TourStatus; step?: number }, now: Date = new Date()): { json: ToursJson; state: TourState; changed: boolean } {
    const base: ToursJson = json && typeof json === 'object' && !Array.isArray(json) ? { ...(json as ToursJson) } : {};
    const current = readTour(base, tourId);
    if (current && current.status !== 'started') return { json: base, state: current, changed: false };
    const state: TourState = { status: update.status, step: update.step ?? current?.step ?? 0, at: now.toISOString() };
    return { json: { ...base, [tourId]: state }, state, changed: true };
}
