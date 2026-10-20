'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/supplier/ui';

/**
 * "Filters" disclosure for the admin order toolbar: a button with the number of
 * active filters it holds, and a floating panel (full width on phones). Esc and a
 * click outside close it; focus moves into the panel on open and back to the
 * button on close. All text comes from the caller (adminOrders dictionary).
 */
export function FilterPopover({ label, count, title, doneLabel, clearLabel, onClear, icon, children }: {
    label: string; count: number; title: string; doneLabel: string; clearLabel: string;
    onClear?: () => void; icon?: React.ReactNode; children: React.ReactNode;
}) {
    const [open, setOpen] = React.useState(false);
    const wrap = React.useRef<HTMLDivElement>(null);
    const button = React.useRef<HTMLButtonElement>(null);
    const panel = React.useRef<HTMLDivElement>(null);
    const id = React.useId();

    const close = React.useCallback((restoreFocus = true) => {
        setOpen(false);
        if (restoreFocus) requestAnimationFrame(() => button.current?.focus());
    }, []);

    React.useEffect(() => {
        if (!open) return;
        const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>('select,input,button');
        first?.focus();
        const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open, close]);

    return (
        <div ref={wrap} className="relative">
            <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((x) => !x)}
                className={cn('inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-semibold ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]',
                    count > 0 || open ? 'bg-teal-soft text-ink ring-teal/30' : 'bg-surface text-ink ring-line-strong hover:bg-surface-2')}>
                {icon}{label}
                {count > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-heading text-white text-[11px] leading-[18px] text-center tabular-nums">{count}</span>}
                <ChevronDown size={14} aria-hidden className={cn('text-ink-3 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
            </button>
            {open && (
                <div ref={panel} id={id} role="dialog" aria-label={title}
                    className="fixed inset-x-4 top-24 z-40 sm:absolute sm:inset-x-auto sm:top-full sm:end-0 sm:mt-1.5 sm:w-[min(520px,calc(100vw-2rem))] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl bg-surface ring-1 ring-line shadow-float p-4 text-start">
                    <p className="mb-3 text-[13.5px] font-semibold text-heading">{title}</p>
                    {children}
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                        {onClear ? <Button size="sm" variant="ghost" onClick={onClear}>{clearLabel}</Button> : <span />}
                        <Button size="sm" variant="primary" onClick={() => close()}>{doneLabel}</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
