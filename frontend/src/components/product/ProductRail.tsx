'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Horizontal product row with discoverable navigation: visible arrows
 * (disabled at each end), native trackpad / touch scrolling, mouse drag,
 * and an optional "View all" action. Vertical page scrolling is untouched.
 */
export function ProductRail({ title, subtitle, viewAll, children, className }: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    viewAll?: { label?: string; onClick?: () => void; href?: string };
    children: React.ReactNode;
    className?: string;
}) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [edges, setEdges] = React.useState({ start: true, end: true });
    const drag = React.useRef<{ x: number; left: number; moved: boolean } | null>(null);

    const update = React.useCallback(() => {
        const el = ref.current;
        if (!el) return;
        setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
    }, []);
    React.useEffect(() => {
        update();
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [update, children]);

    const page = (dir: 1 | -1) => {
        const el = ref.current;
        if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.85), behavior: 'smooth' });
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
            <div className="flex items-end justify-between gap-4 mb-3">
                <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-heading">{title}</h3>
                    {subtitle && <p className="text-[12.5px] text-ink-3">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {viewAll && (viewAll.href
                        ? <a href={viewAll.href} className="text-[13px] font-semibold text-teal hover:underline me-1">{viewAll.label ?? 'View all'}</a>
                        : <button type="button" onClick={viewAll.onClick} className="text-[13px] font-semibold text-teal hover:underline me-1">{viewAll.label ?? 'View all'}</button>)}
                    <button type="button" aria-label="Scroll left" onClick={() => page(-1)} disabled={edges.start} className={arrow}><ChevronLeft size={16} /></button>
                    <button type="button" aria-label="Scroll right" onClick={() => page(1)} disabled={edges.end} className={arrow}><ChevronRight size={16} /></button>
                </div>
            </div>
            <div
                ref={ref}
                onScroll={update}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerLeave={endDrag}
                onClickCapture={onClickCapture}
                className={cn('flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory overscroll-x-contain select-none pb-1')}
                style={{ scrollPaddingInline: 2 }}
            >
                {children}
            </div>
        </section>
    );
}
