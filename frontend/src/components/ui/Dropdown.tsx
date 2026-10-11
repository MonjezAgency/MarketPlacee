'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DropdownOption<T extends string> { value: T; label: string }

/**
 * Compact listbox dropdown.
 *  • Opens downward, or upward when there isn't room below (viewport-aware).
 *  • Long lists scroll (max height capped to available space).
 *  • Keyboard: ↑/↓ to move, Enter/Space to pick, Esc to close, Tab leaves.
 *  • Closes on outside click; selected option is marked.
 */
export function Dropdown<T extends string>({ label, value, options, onChange, align = 'end', className, inline, suffix }: {
    label: string;
    value: T;
    options: DropdownOption<T>[];
    onChange: (v: T) => void;
    align?: 'start' | 'end';
    className?: string;
    /** Render the label inside the button: "Sort by: Newest". */
    inline?: boolean;
    /** Text after the button, e.g. "per page". */
    suffix?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const [up, setUp] = React.useState(false);
    const [maxH, setMaxH] = React.useState(280);
    const [active, setActive] = React.useState(0);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const listId = React.useId();
    const current = options.find((o) => o.value === value) ?? options[0];

    const openMenu = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) {
            const below = window.innerHeight - r.bottom - 12;
            const above = r.top - 12;
            const wantUp = below < 200 && above > below;
            setUp(wantUp);
            setMaxH(Math.max(140, Math.min(320, wantUp ? above : below)));
        }
        setActive(Math.max(0, options.findIndex((o) => o.value === value)));
        setOpen(true);
    };

    React.useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent | TouchEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const onScroll = () => setOpen(false);
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('touchstart', onDoc);
        window.addEventListener('resize', onScroll);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('touchstart', onDoc);
            window.removeEventListener('resize', onScroll);
        };
    }, [open]);

    const pick = (v: T) => { onChange(v); setOpen(false); btnRef.current?.focus(); };

    const onKey = (e: React.KeyboardEvent) => {
        if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openMenu(); return; }
        if (!open) return;
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[active].value); }
        else if (e.key === 'Tab') setOpen(false);
    };

    return (
        <div ref={rootRef} className={cn('relative inline-flex items-center gap-2', className)} onKeyDown={onKey}>
            {!inline && <span className="text-[12.5px] text-ink-3 whitespace-nowrap">{label}</span>}
            <button
                ref={btnRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => (open ? setOpen(false) : openMenu())}
                className="inline-flex items-center gap-1 h-8 ps-2.5 pe-2 rounded-md ring-1 ring-line bg-surface hover:ring-line-strong text-[12.5px] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] transition-shadow"
            >
                {inline && <span className="font-normal text-ink-3">{label}:</span>}
                {current.label}
                <ChevronDown size={14} className={cn('text-ink-4 transition-transform', open && 'rotate-180')} />
            </button>
            {suffix && <span className="text-[12.5px] text-ink-3 whitespace-nowrap">{suffix}</span>}
            {open && (
                <ul
                    id={listId}
                    role="listbox"
                    aria-label={label}
                    style={{ maxHeight: maxH }}
                    className={cn(
                        'absolute z-[60] min-w-[10rem] w-max overflow-y-auto bg-surface rounded-xl ring-1 ring-line shadow-[0_16px_40px_rgba(15,23,42,0.14)] p-1',
                        up ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
                        align === 'end' ? 'right-0' : 'left-0'
                    )}
                >
                    {options.map((o, i) => (
                        <li
                            key={o.value}
                            role="option"
                            aria-selected={o.value === value}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => pick(o.value)}
                            className={cn(
                                'flex items-center justify-between gap-6 px-3 py-2 rounded-lg text-[13px] cursor-pointer',
                                i === active ? 'bg-surface-3' : '',
                                o.value === value ? 'text-teal font-semibold' : 'text-ink-2'
                            )}
                        >
                            {o.label}
                            {o.value === value && <Check size={14} />}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
