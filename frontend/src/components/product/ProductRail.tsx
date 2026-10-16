'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Scrolling is native overflow-x: no wheel handlers, so trackpad and touch
 * gestures go straight to the browser and vertical page scroll is untouched.
 * Items inside must not create their own scroll containers (use
 * overflow-clip, not overflow-hidden), so a gesture that starts over an
 * image or name is never captured by a nested, non-scrollable box.
 *
 * Horizontal product row with discoverable navigation: visible arrows
 * (disabled at each end), native trackpad / touch scrolling, mouse drag,
 * and an optional "View all" action. Vertical page scrolling is untouched.
 */
export function ProductRail({ title, subtitle, viewAll, children, className, arrows = true, snap = true, trackClassName }: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    viewAll?: { label?: string; onClick?: () => void; href?: string };
    children: React.ReactNode;
    className?: string;
    /** Show left/right buttons (default). Off = trackpad, touch and drag only. */
    arrows?: boolean;
    /** Snap cards into place (default). Off = free, smooth scrolling. */
    snap?: boolean;
    trackClassName?: string;
}) {
    const { t, dir } = useLanguage();
    const ref = React.useRef<HTMLDivElement>(null);
    const [edges, setEdges] = React.useState({ start: true, end: true });
    const drag = React.useRef<{ x: number; left: number; moved: boolean } | null>(null);

    const update = React.useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // scrollLeft is 0 → negative in right-to-left layouts; measure distance from the start edge.
        const fromStart = Math.abs(el.scrollLeft);
        setEdges({ start: fromStart <= 2, end: fromStart + el.clientWidth >= el.scrollWidth - 2 });
    }, []);
    React.useEffect(() => {
        update();
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [update, children]);

    const rtl = dir === 'rtl';
    const page = (dir: 1 | -1) => {
        const el = ref.current;
        // In RTL "forward" is towards the left (negative scrollLeft).
        if (el) el.scrollBy({ left: (rtl ? -dir : dir) * Math.max(240, el.clientWidth * 0.85), behavior: 'smooth' });
    };

    // Mouse drag-to-scroll (touch and trackpads already scroll natively).
    const onPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        drag.current = { x: e.clientX, left: ref.current?.scrollLeft ?? 0, moved: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d || !ref.current) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 4) d.moved = true;
        if (d.moved) ref.current.scrollLeft = d.left - dx;
    };
    const endDrag = () => { setTimeout(() => { drag.current = null; }, 0); };
    // A drag must not also click the card underneath.
    const onClickCapture = (e: React.MouseEvent) => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); } };

    const arrow = 'w-8 h-8 rounded-full ring-1 ring-line bg-surface flex items-center justify-center text-ink-2 hover:ring-line-strong disabled:opacity-35 disabled:cursor-default transition-shadow';

    return (
        <section className={className}>
            <div className="flex items-end justify-between gap-4 mb-2">
                <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-heading">{title}</h3>
                    {subtitle && <p className="text-[12px] text-ink-3">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {viewAll && (viewAll.href
                        ? <a href={viewAll.href} className="text-[12.5px] font-semibold text-teal hover:underline me-1">{viewAll.label ?? t('landing', 'viewAll')}</a>
                        : <button type="button" onClick={viewAll.onClick} className="text-[12.5px] font-semibold text-teal hover:underline me-1">{viewAll.label ?? t('landing', 'viewAll')}</button>)}
                    {arrows && <>
                        <button type="button" aria-label={t('landing', 'railPrevious')} onClick={() => page(-1)} disabled={edges.start} className={arrow}><ChevronLeft size={16} className="rtl:rotate-180" /></button>
                        <button type="button" aria-label={t('landing', 'railNext')} onClick={() => page(1)} disabled={edges.end} className={arrow}><ChevronRight size={16} className="rtl:rotate-180" /></button>
                    </>}
                </div>
            </div>
            <div className="relative">
            {!arrows && !edges.start && <span aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-8 bg-gradient-to-r rtl:bg-gradient-to-l from-surface to-transparent z-10" />}
            {!arrows && !edges.end && <span aria-hidden className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l rtl:bg-gradient-to-r from-surface to-transparent z-10" />}
            <div
                ref={ref}
                onScroll={update}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerLeave={endDrag}
                onPointerCancel={endDrag}
                // Links and images are natively draggable; a native drag would
                // swallow the pointer stream and leave the rail stuck mid-drag.
                onDragStart={(e) => e.preventDefault()}
                onClickCapture={onClickCapture}
                className={cn('flex overflow-x-auto overscroll-x-contain select-none pb-1', snap ? 'gap-3 snap-x snap-proximity scrollbar-hide' : 'gap-2 mix-rail-scroll', trackClassName)}
                style={{ scrollPaddingInline: 2 }}
            >
                {children}
            </div>
            </div>
        </section>
    );
}
