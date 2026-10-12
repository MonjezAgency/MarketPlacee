'use client';

import * as React from 'react';
import { createLoad, listLoads, updateLoad, ApiError, type LoadKind, type MixedLoad } from '@/lib/wholesale';

/** One explicitly selected sellable line (product, or product + flavour/variant). */
export interface Picked { key: string; productId: string; variant: string | null; name: string; label: string | null; image?: string; quantity: number }

const STORE_KEY = 'atl_mix_pending_v1';

export const pickKey = (productId: string, variant: string | null) => `${productId}::${variant ?? ''}`;

/**
 * Pending mixed-load selection shared by the product-page carousels and the
 * full "View all" picker, so nothing is lost while the buyer moves between
 * them. Nothing is ever added implicitly: only toggle() puts a line in.
 */
export function useMixSelection() {
    const [kind, setKindRaw] = React.useState<LoadKind | null>(null);
    const [picked, setPicked] = React.useState<Map<string, Picked>>(new Map());
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState('');
    const [created, setCreated] = React.useState<MixedLoad | null>(null);
    const [note, setNote] = React.useState('');

    // Keep the pending mix for this browser tab, so viewing another product
    // page (or reloading) never silently drops what the buyer selected.
    React.useEffect(() => {
        try {
            const raw = sessionStorage.getItem(STORE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw) as { kind: LoadKind | null; picked: Picked[] };
            if (saved.kind === 'PALLET' || saved.kind === 'TRUCK') setKindRaw(saved.kind);
            if (Array.isArray(saved.picked)) setPicked(new Map(saved.picked.map((p) => [p.key, p])));
        } catch { /* ignore */ }
    }, []);
    const hydrated = React.useRef(false);
    React.useEffect(() => {
        if (!hydrated.current) { hydrated.current = true; return; }
        // Images are left out: they can be large inline data URLs.
        try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ kind, picked: Array.from(picked.values()).map(({ image, ...rest }) => rest) })); } catch { /* ignore */ }
    }, [kind, picked]);

    const has = (k: string) => picked.has(k);
    const toggle = (line: Omit<Picked, 'key' | 'quantity'>) => {
        setError(''); setCreated(null);
        setPicked((prev) => {
            const next = new Map(prev);
            const k = pickKey(line.productId, line.variant);
            if (next.has(k)) next.delete(k); else next.set(k, { ...line, key: k, quantity: 1 });
            return next;
        });
    };
    const setQty = (k: string, n: number) => setPicked((prev) => {
        const next = new Map(prev);
        const it = next.get(k);
        if (it) next.set(k, { ...it, quantity: Math.max(1, Math.min(10000, Math.floor(n) || 1)) });
        return next;
    });
    const remove = (k: string) => setPicked((prev) => { const next = new Map(prev); next.delete(k); return next; });
    const clear = () => setPicked(new Map());

    /** Switching mode clears the selection (quantities change unit); callers confirm first when non-empty. */
    const setKind = (k: LoadKind | null) => { if (k !== kind) { setPicked(new Map()); setError(''); setCreated(null); } setKindRaw(k); };

    const submit = async () => {
        if (submitting || !kind) return;
        if (picked.size === 0) { setError('Select at least one product to create a mix.'); return; }
        setSubmitting(true); setError(''); setNote('');
        const lines = Array.from(picked.values()).map((p) => ({ productId: p.productId, variant: p.variant, quantity: p.quantity }));
        try {
            // One open draft per kind is ONE order: new picks join it instead of
            // starting a separate card. The server re-checks capacity and origin.
            const open = (await listLoads().catch(() => [] as MixedLoad[])).filter((l) => l.kind === kind && l.status === 'DRAFT').pop();
            let res: MixedLoad;
            if (open) {
                const existing = (open.quote?.lines ?? []).map((l) => ({ productId: l.productId, variant: l.variant ?? null, quantity: l.quantity }));
                try {
                    res = await updateLoad(open.id, [...existing, ...lines], open.version);
                    setNote('Added to your open order.');
                } catch (e) {
                    // A different dispatch country can't share that order: keep it separate.
                    if (!(e instanceof ApiError && e.code === 'ORIGIN_MISMATCH')) throw e;
                    res = await createLoad(kind, lines);
                    setNote(`Started a separate order — ${e.message}`);
                }
            } else res = await createLoad(kind, lines);
            setCreated(res);       // confirmation shows the SERVER's saved load
            setPicked(new Map());  // cleared only after success
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not create the mix. Your selection is kept — try again.');
        } finally { setSubmitting(false); }
    };

    return { kind, setKind, picked, selected: Array.from(picked.values()), has, toggle, setQty, remove, clear, submit, submitting, error, setError, created, setCreated, note };
}
export type MixSelection = ReturnType<typeof useMixSelection>;
