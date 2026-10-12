'use client';

import * as React from 'react';
import { Info, CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One place to tune notification toasts. */
export const TOAST_CONFIG = { durationMs: 6000, maxVisible: 3, exitMs: 200 };

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export interface NotifyToast {
    /** Stable id (e.g. the notification id): the same id is never shown twice in a tab. */
    id: string;
    title: string;
    message?: string;
    tone?: ToastTone;
    eyebrow?: string;
    action?: { label: string; onClick: () => void };
}

// Tiny module store: the queue is shared by every caller in this tab, so
// several hook instances (or a re-render / route change) can't duplicate a toast.
let queue: NotifyToast[] = [];
const seen = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function notifyToast(t: NotifyToast) {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    queue = [...queue, t];
    emit();
}
export function dismissToast(id: string) {
    queue = queue.filter((t) => t.id !== id);
    emit();
}
/** Maps a backend notification type to a toast tone. */
export const toneOf = (type?: string): ToastTone =>
    type === 'SUCCESS' ? 'success' : type === 'WARNING' ? 'warning' : type === 'ERROR' ? 'error' : 'info';

const TONE: Record<ToastTone, { icon: React.ElementType; tile: string; bar: string }> = {
    info: { icon: Info, tile: 'bg-teal-soft text-teal', bar: 'bg-[#2EC4B6]' },
    success: { icon: CheckCircle2, tile: 'bg-[#ECFDF5] dark:bg-emerald-500/15 text-[#059669]', bar: 'bg-[#10B981]' },
    warning: { icon: AlertTriangle, tile: 'bg-[#FFF7ED] dark:bg-amber-500/15 text-[#D97706]', bar: 'bg-[#F59E0B]' },
    error: { icon: AlertCircle, tile: 'bg-[#FEF2F2] dark:bg-red-500/15 text-[#DC2626]', bar: 'bg-[#EF4444]' },
};

function ToastCard({ t }: { t: NotifyToast }) {
    const [leaving, setLeaving] = React.useState(false);
    const [paused, setPaused] = React.useState(false);
    const remaining = React.useRef(TOAST_CONFIG.durationMs);
    const close = React.useCallback(() => setLeaving(true), []);

    // Own timer per toast; pausing keeps the time that was left.
    React.useEffect(() => {
        if (paused || leaving) return;
        const started = Date.now();
        const id = setTimeout(close, remaining.current);
        return () => { clearTimeout(id); remaining.current -= Date.now() - started; };
    }, [paused, leaving, close]);
    React.useEffect(() => {
        if (!leaving) return;
        const id = setTimeout(() => dismissToast(t.id), TOAST_CONFIG.exitMs);
        return () => clearTimeout(id);
    }, [leaving, t.id]);

    const tone = TONE[t.tone ?? 'info'];
    const Icon = tone.icon;
    return (
        // The grid-rows collapse lets the toasts below slide up smoothly.
        <div className={cn('grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-200', leaving ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')}>
            <div className="min-h-0 overflow-clip">
                <div
                    role={t.tone === 'error' ? 'alert' : 'status'}
                    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
                    onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
                    className="pointer-events-auto mb-2 relative flex gap-3 rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.12)] p-3 pe-2 motion-safe:animate-[atl-toast-in_220ms_ease-out]"
                >
                    <span aria-hidden className={cn('absolute start-0 inset-y-3 w-[3px] rounded-full', tone.bar)} />
                    <span className={cn('ms-1 w-8 h-8 rounded-xl flex items-center justify-center shrink-0', tone.tile)}><Icon size={16} /></span>
                    <div className="flex-1 min-w-0">
                        {t.eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wider text-teal">{t.eyebrow}</p>}
                        <p className="text-[13.5px] font-semibold text-ink truncate">{t.title}</p>
                        {t.message && <p className="text-[12.5px] text-ink-2 line-clamp-2">{t.message}</p>}
                        {t.action && (
                            <button type="button" onClick={() => { t.action!.onClick(); close(); }} className="mt-1 text-[12.5px] font-semibold text-heading hover:text-teal">
                                {t.action.label}
                            </button>
                        )}
                    </div>
                    <button type="button" onClick={close} aria-label="Dismiss notification" className="self-start w-7 h-7 rounded-lg flex items-center justify-center text-ink-4 hover:text-ink hover:bg-surface-2">
                        <X size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Mounted once in the root layout. Oldest on top; extras wait in the queue. */
export function NotifyToasts() {
    const items = React.useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => queue,
        () => queue,
    );
    const visible = items.slice(0, TOAST_CONFIG.maxVisible);
    if (!visible.length) return null;
    return (
        <div
            aria-live="polite"
            className="pointer-events-none fixed z-[300] text-start inset-x-3 sm:inset-x-auto sm:end-4 sm:w-[360px]"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 68px)' }}
        >
            {visible.map((t) => <ToastCard key={t.id} t={t} />)}
        </div>
    );
}

// Local development only: lets the queue be exercised from the console.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') (window as any).__atlNotifyToast = notifyToast;
