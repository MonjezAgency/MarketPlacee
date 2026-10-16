'use client';

import * as React from 'react';
import { apiFetch } from '@/lib/api';

export type TourStatus = 'started' | 'completed' | 'skipped';
export interface TourServerState { eligible: boolean; status: TourStatus | null; step: number }

/** Tours started in this page load (guards against a double PATCH on remount). Not a source of truth. */
const startedThisLoad = new Set<string>();

/**
 * Server-persisted tour state for the signed-in user (GET/PATCH /users/me/tours).
 * Fails closed: if the state can't be loaded, `state` stays null and the tour never shows.
 */
export function useProductTour(tourId: string, enabled: boolean) {
    const [state, setState] = React.useState<TourServerState | null>(null);
    const pendingStep = React.useRef<number | null>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        if (!enabled) { setState(null); return; }
        let cancelled = false;
        apiFetch('/users/me/tours', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (cancelled) return;
                const s = d?.tours?.[tourId];
                setState(s && typeof s.eligible === 'boolean' ? { eligible: s.eligible, status: s.status ?? null, step: Number(s.step) || 0 } : null);
            })
            .catch(() => { if (!cancelled) setState(null); });
        return () => { cancelled = true; };
    }, [tourId, enabled]);

    const send = React.useCallback((status: TourStatus, step: number) => {
        apiFetch(`/users/me/tours/${encodeURIComponent(tourId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, step }),
            keepalive: status !== 'started',
        }).catch(() => undefined);
    }, [tourId]);

    const flush = React.useCallback(() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        if (pendingStep.current !== null) { send('started', pendingStep.current); pendingStep.current = null; }
    }, [send]);

    // Save a pending step if the page is closed or the component unmounts.
    React.useEffect(() => {
        window.addEventListener('pagehide', flush);
        return () => { window.removeEventListener('pagehide', flush); flush(); };
    }, [flush]);

    /** Marks the tour started (once). */
    const start = React.useCallback((step: number) => {
        setState((s) => (s ? { ...s, status: 'started', step } : s));
        if (startedThisLoad.has(tourId)) return;
        startedThisLoad.add(tourId);
        send('started', step);
    }, [tourId, send]);

    /** Remembers the current step (debounced). */
    const saveStep = React.useCallback((step: number) => {
        setState((s) => (s ? { ...s, step } : s));
        pendingStep.current = step;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 600);
    }, [flush]);

    /** Completed or skipped — final; the tour never shows again. */
    const finish = React.useCallback((status: 'completed' | 'skipped', step: number) => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        pendingStep.current = null;
        setState((s) => (s ? { ...s, eligible: false, status, step } : s));
        send(status, step);
    }, [send]);

    return { state, start, saveStep, finish };
}
