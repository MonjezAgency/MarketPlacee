'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { useProductTour } from './useProductTour';
import type { TourDef } from './tours';

/*
 * First-login dashboard tour. State lives on the server (GET/PATCH /users/me/tours);
 * the tour shows only when the server says it is eligible, on the dashboard home,
 * once the first step's element has rendered. It fails closed: no server state, no tour.
 *
 * Geometry comes from getBoundingClientRect, so card/arrow coordinates are physical
 * (left/top) — that is correct in both directions; the side preference flips in RTL.
 */

const GAP = 14;          // between the spotlight and the card
const MARGIN = 12;       // minimum distance from the viewport edge
const PAD = 6;           // spotlight padding around the target
const CARD_W = 360;
const WAIT_MS = 10_000;  // give up waiting for the page after this
const SETTLE_MS = 400;   // let the page settle after the first target appears

type Side = 'below' | 'above' | 'right' | 'left';
interface Rect { top: number; left: number; width: number; height: number }
interface Layout {
    mode: 'anchored' | 'center' | 'sheet';
    spot: Rect | null;
    card?: { top: number; left: number };
    arrow?: { side: Side; offset: number };
}

/** The first visible element with this data-tour value (hidden copies, e.g. a collapsed mobile menu, are skipped). */
function findTarget(name: string): HTMLElement | null {
    const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
    return all.find((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = window.getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none';
    }) ?? null;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function computeLayout(el: HTMLElement | null, cardH: number, prefer: 'side' | 'below', rtl: boolean): Layout {
    const vw = window.innerWidth, vh = window.innerHeight;
    let spot: Rect | null = null;
    if (el) {
        const r = el.getBoundingClientRect();
        // Clip to the viewport so a very tall target doesn't push the cut-out off screen.
        const top = Math.max(r.top - PAD, 4), bottom = Math.min(r.bottom + PAD, vh - 4);
        const left = Math.max(r.left - PAD, 4), right = Math.min(r.right + PAD, vw - 4);
        if (bottom > top && right > left) spot = { top, left, width: right - left, height: bottom - top };
    }
    if (vw < 640) return { mode: 'sheet', spot };
    if (!spot) return { mode: 'center', spot: null };

    const w = Math.min(CARD_W, vw - MARGIN * 2), h = cardH;
    // "Beside" only suits vertical navigation; a horizontal tab row (buyer tabs below lg) gets the card below.
    const nav = el?.closest('nav')?.getBoundingClientRect();
    if (prefer === 'side' && nav && nav.width > nav.height) prefer = 'below';
    const sides: Side[] = prefer === 'side'
        ? (rtl ? ['left', 'right', 'below', 'above'] : ['right', 'left', 'below', 'above'])
        : (rtl ? ['below', 'above', 'left', 'right'] : ['below', 'above', 'right', 'left']);
    const cx = spot.left + spot.width / 2, cy = spot.top + spot.height / 2;
    for (const side of sides) {
        if (side === 'below' || side === 'above') {
            const top = side === 'below' ? spot.top + spot.height + GAP : spot.top - GAP - h;
            if (top < MARGIN || top + h > vh - MARGIN) continue;
            const left = clamp(cx - w / 2, MARGIN, vw - MARGIN - w);
            return { mode: 'anchored', spot, card: { top, left }, arrow: { side, offset: clamp(cx - left, 20, w - 20) } };
        }
        const left = side === 'right' ? spot.left + spot.width + GAP : spot.left - GAP - w;
        if (left < MARGIN || left + w > vw - MARGIN) continue;
        const top = clamp(cy - h / 2, MARGIN, vh - MARGIN - h);
        return { mode: 'anchored', spot, card: { top, left }, arrow: { side, offset: clamp(cy - top, 20, h - 20) } };
    }
    // Nowhere fits next to the target: keep the spotlight, centre the card.
    return { mode: 'center', spot };
}

export function ProductTour({ tour }: { tour: TourDef }) {
    const { user, isAuthReady } = useAuth();
    const pathname = (usePathname() || '').replace(/\/+$/, '') || '/';
    const { t, dir } = useLanguage();
    const tr = (key: string, vars?: Record<string, string | number>) => t('productTour', key, vars);
    const { state, start, saveStep, finish } = useProductTour(tour.id, isAuthReady && !!user);

    const onHome = pathname === tour.home;
    const eligible = !!state?.eligible;
    const [ready, setReady] = React.useState(false);
    const [index, setIndex] = React.useState<number | null>(null);

    // Wait for the dashboard to render its first step's element (and settle) before starting.
    React.useEffect(() => {
        setReady(false);
        if (!eligible || !onHome) return;
        let settle: ReturnType<typeof setTimeout> | undefined;
        const began = Date.now();
        const poll = setInterval(() => {
            if (findTarget(tour.steps[0].target)) {
                clearInterval(poll);
                settle = setTimeout(() => setReady(true), SETTLE_MS);
            } else if (Date.now() - began > WAIT_MS) clearInterval(poll);
        }, 150);
        return () => { clearInterval(poll); if (settle) clearTimeout(settle); };
    }, [eligible, onHome, tour.steps]);

    // Start, or resume at the saved step (never back to step 1 once started).
    React.useEffect(() => {
        if (!ready || !state?.eligible || index !== null) return;
        if (state.status === 'started') setIndex(clamp(state.step, 0, tour.steps.length - 1));
        else { setIndex(0); start(0); }
    }, [ready, state, index, start, tour.steps.length]);

    const active = ready && eligible && onHome && index !== null;
    if (!active || typeof document === 'undefined') return null;
    return createPortal(
        <TourCard
            key={tour.id}
            tour={tour}
            index={index!}
            rtl={dir === 'rtl'}
            tr={tr}
            onStep={(i) => { setIndex(i); saveStep(i); }}
            onFinish={(status) => finish(status, index!)}
        />,
        document.body,
    );
}

function TourCard({ tour, index, rtl, tr, onStep, onFinish }: {
    tour: TourDef; index: number; rtl: boolean;
    tr: (key: string, vars?: Record<string, string | number>) => string;
    onStep: (i: number) => void; onFinish: (status: 'completed' | 'skipped') => void;
}) {
    const step = tour.steps[index];
    const total = tour.steps.length;
    const last = index === total - 1;
    const cardRef = React.useRef<HTMLDivElement>(null);
    const returnFocus = React.useRef<HTMLElement | null>(null);
    const [layout, setLayout] = React.useState<Layout | null>(null);
    const [shown, setShown] = React.useState(false);
    const titleId = `tour-${tour.id}-title`, bodyId = `tour-${tour.id}-body`;

    const update = React.useCallback(() => {
        const h = cardRef.current?.offsetHeight || 240;
        setLayout(computeLayout(findTarget(step.target), h, step.prefer ?? 'below', rtl));
    }, [step, rtl]);

    // Bring the step's element into view, then position (again after a smooth scroll ends).
    React.useLayoutEffect(() => {
        const el = findTarget(step.target);
        if (el) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        update();
        const later = setTimeout(update, 350);
        return () => clearTimeout(later);
    }, [step, update]);

    // Follow scrolling, resizing and layout shifts.
    React.useEffect(() => {
        let frame = 0;
        const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
        window.addEventListener('resize', schedule);
        window.addEventListener('scroll', schedule, true);
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
        ro?.observe(document.body);
        const el = findTarget(step.target);
        if (el) ro?.observe(el);
        if (cardRef.current) ro?.observe(cardRef.current);
        return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); ro?.disconnect(); };
    }, [step, update]);

    // Focus: move into the card on open, keep it there, give it back when the tour closes or hides.
    React.useEffect(() => {
        returnFocus.current = document.activeElement as HTMLElement | null;
        const raf = requestAnimationFrame(() => setShown(true));
        return () => {
            cancelAnimationFrame(raf);
            const back = returnFocus.current;
            if (back && document.contains(back)) back.focus({ preventScroll: true });
        };
    }, []);
    React.useEffect(() => {
        const card = cardRef.current;
        if (card && !card.contains(document.activeElement)) card.focus({ preventScroll: true });
    }, [index]);

    const go = React.useCallback((i: number) => { if (i >= 0 && i < total) onStep(i); }, [onStep, total]);

    // Keyboard: Esc skips; arrows go back/next (mirrored in RTL); Tab stays inside the card.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tgt = e.target as HTMLElement | null;
            if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return;
            if (e.key === 'Escape') { e.preventDefault(); onFinish('skipped'); return; }
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const forward = (e.key === 'ArrowRight') !== rtl;
                e.preventDefault();
                if (forward) { if (last) onFinish('completed'); else go(index + 1); } else go(index - 1);
                return;
            }
            if (e.key === 'Tab' && cardRef.current) {
                const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
                if (!items.length) return;
                const first = items[0], end = items[items.length - 1];
                const cur = document.activeElement;
                if (e.shiftKey && (cur === first || cur === cardRef.current)) { e.preventDefault(); end.focus(); }
                else if (!e.shiftKey && (cur === end || !cardRef.current.contains(cur))) { e.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [index, last, rtl, go, onFinish]);

    const spot = layout?.spot ?? null;
    const mode = layout?.mode ?? 'center';
    const pct = ((index + 1) / total) * 100;

    const cardStyle: React.CSSProperties = mode === 'anchored' && layout?.card
        ? { top: layout.card.top, left: layout.card.left, width: Math.min(CARD_W, window.innerWidth - MARGIN * 2) }
        : mode === 'center'
            ? { top: '50%', left: '50%', width: Math.min(CARD_W, window.innerWidth - MARGIN * 2), transform: `translate(-50%, -50%)${shown ? '' : ' translateY(8px)'}` }
            : {};

    return (
        <div data-no-translate dir={rtl ? 'rtl' : 'ltr'} className="fixed inset-0 z-[120] text-start">
            {/* Blocks the page while the tour is open; clicking it does nothing (use Skip). */}
            <div aria-hidden className={cn('absolute inset-0', !spot && 'bg-[rgba(11,31,58,0.55)]')} />
            {spot && (
                <div aria-hidden
                    className={cn('absolute rounded-xl ring-2 ring-[#2EC4B6] pointer-events-none transition-[top,left,width,height] duration-[250ms] ease-atl motion-reduce:transition-none')}
                    style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, boxShadow: '0 0 0 9999px rgba(11,31,58,0.55)' }} />
            )}

            <div
                ref={cardRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                tabIndex={-1}
                style={cardStyle}
                className={cn(
                    'absolute bg-surface text-ink ring-1 ring-line shadow-float outline-none',
                    'transition-[opacity,transform,top,left] duration-[250ms] ease-atl motion-reduce:transition-none',
                    mode === 'sheet'
                        ? 'inset-x-0 bottom-0 rounded-t-2xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]'
                        : 'rounded-2xl p-5',
                    shown ? 'opacity-100' : 'opacity-0',
                    mode === 'sheet' && (shown ? 'translate-y-0' : 'translate-y-4'),
                    mode === 'anchored' && (shown ? 'translate-y-0' : 'translate-y-2'),
                )}
            >
                {mode === 'anchored' && layout?.arrow && <Arrow side={layout.arrow.side} offset={layout.arrow.offset} />}
                {mode === 'sheet' && <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong" />}

                <div className="flex items-center justify-between gap-3">
                    <p className="text-[12.5px] font-semibold text-teal tabular-nums" aria-live="polite">{tr('stepOf', { current: index + 1, total })}</p>
                    <button type="button" onClick={() => onFinish('skipped')}
                        className="-me-1.5 h-8 px-1.5 rounded-lg text-[12.5px] font-medium text-ink-3 hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                        {tr('skip')}
                    </button>
                </div>
                <div aria-hidden className="mt-2 h-1 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full bg-[#2EC4B6] transition-[width] duration-[250ms] ease-atl motion-reduce:transition-none" style={{ width: `${pct}%` }} />
                </div>

                <h2 id={titleId} className="mt-4 font-sans text-[16px] leading-snug font-semibold text-heading">{tr(step.titleKey)}</h2>
                <p id={bodyId} className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{tr(step.bodyKey)}</p>

                <div className="mt-5 flex items-center justify-end gap-2">
                    {index > 0 && (
                        <button type="button" onClick={() => go(index - 1)}
                            className="h-10 px-3.5 inline-flex items-center gap-1 rounded-xl ring-1 ring-inset ring-line-strong text-[13.5px] font-semibold text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                            <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden /> {tr('back')}
                        </button>
                    )}
                    <button type="button" onClick={() => (last ? onFinish('completed') : go(index + 1))}
                        className="h-10 px-4 inline-flex items-center gap-1 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[13.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
                        {last ? tr('finish') : <>{tr('next')} <ChevronRight size={16} className="rtl:rotate-180" aria-hidden /></>}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** A small rotated square on the card edge facing the target (physical sides — see the note at the top). */
function Arrow({ side, offset }: { side: Side; offset: number }) {
    const base = 'absolute w-3 h-3 rotate-45 bg-surface border-line';
    const pos: Record<Side, { cls: string; style: React.CSSProperties }> = {
        below: { cls: 'border-t border-l', style: { top: -6.5, left: offset - 6 } },
        above: { cls: 'border-b border-r', style: { bottom: -6.5, left: offset - 6 } },
        right: { cls: 'border-b border-l', style: { left: -6.5, top: offset - 6 } },
        left: { cls: 'border-t border-r', style: { right: -6.5, top: offset - 6 } },
    };
    return <span aria-hidden className={cn(base, pos[side].cls)} style={pos[side].style} />;
}

export default ProductTour;
