'use client';

/**
 * Supplier workspace design system. One set of building blocks so every
 * supplier page shares spacing, type, radii and — above all — colour meaning:
 *   teal (brand)  primary actions, focus, selected state
 *   green         approved / confirmed / success
 *   amber         pending / attention / caution
 *   red           errors, rejected, destructive
 *   slate         everything else
 * Built on the site tokens (ink, heading, surface, line, cta, teal).
 */
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, RefreshCw, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const TONE: Record<Tone, { badge: string; soft: string; text: string; dot: string }> = {
    neutral: { badge: 'bg-slate-100 text-slate-700 ring-slate-200', soft: 'bg-slate-50 ring-slate-200', text: 'text-slate-700', dot: 'bg-slate-400' },
    brand: { badge: 'bg-teal-soft text-teal ring-teal/20', soft: 'bg-teal-soft ring-teal/20', text: 'text-teal', dot: 'bg-teal' },
    success: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', soft: 'bg-emerald-50 ring-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    warning: { badge: 'bg-amber-50 text-amber-800 ring-amber-200', soft: 'bg-amber-50 ring-amber-200', text: 'text-amber-800', dot: 'bg-amber-500' },
    danger: { badge: 'bg-red-50 text-red-700 ring-red-200', soft: 'bg-red-50 ring-red-200', text: 'text-red-700', dot: 'bg-red-500' },
    info: { badge: 'bg-sky-50 text-sky-800 ring-sky-200', soft: 'bg-sky-50 ring-sky-200', text: 'text-sky-800', dot: 'bg-sky-500' },
};

/** Product review status → label + colour, used everywhere a status is shown. */
export const PRODUCT_STATUS: Record<string, { label: string; tone: Tone }> = {
    DRAFT: { label: 'Draft', tone: 'neutral' },
    PENDING: { label: 'In review', tone: 'warning' },
    NEEDS_CHANGES: { label: 'Changes requested', tone: 'warning' },
    APPROVED: { label: 'Live', tone: 'success' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
    PENDING: { label: 'Awaiting your confirmation', tone: 'warning' },
    PAID: { label: 'Paid · awaiting confirmation', tone: 'warning' },
    PROCESSING: { label: 'Confirmed · preparing', tone: 'brand' },
    SHIPPED: { label: 'Shipped', tone: 'info' },
    DELIVERED: { label: 'Delivered', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-medium ring-1 ring-inset whitespace-nowrap', TONE[tone].badge, className)}>
            {dot && <span className={cn('w-1.5 h-1.5 rounded-full', TONE[tone].dot)} />}
            {children}
        </span>
    );
}

export function StatusBadge({ status, kind = 'product' }: { status: string; kind?: 'product' | 'order' }) {
    const m = (kind === 'order' ? ORDER_STATUS : PRODUCT_STATUS)[status] || { label: status, tone: 'neutral' as Tone };
    return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

// ─── Layout ────────────────────────────────────────────────────────────

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
    return (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
            <div className="min-w-0">
                {eyebrow && <div className="mb-1 text-[12.5px] font-medium text-ink-3">{eyebrow}</div>}
                <h1 className="text-[24px] leading-tight font-semibold text-heading tracking-tight">{title}</h1>
                {description && <p className="mt-1 text-[14px] text-ink-3 max-w-[70ch]">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
        </header>
    );
}

export function Card({ title, description, actions, children, className, bodyClassName, id }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; bodyClassName?: string; id?: string }) {
    return (
        <section id={id} className={cn('rounded-xl bg-surface ring-1 ring-line shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>
            {(title || actions) && (
                <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 pt-4">
                    <div className="min-w-0">
                        {title && <h2 className="text-[15px] font-semibold text-heading">{title}</h2>}
                        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
                    </div>
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            )}
            <div className={cn('px-4 sm:px-5 py-4', bodyClassName)}>{children}</div>
        </section>
    );
}

export function Stat({ label, value, hint, icon, tone = 'neutral', loading, href, delta }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: Tone; loading?: boolean; href?: string; delta?: React.ReactNode }) {
    const body = (
        <div className="flex items-start gap-3">
            {icon && <span className={cn('w-9 h-9 shrink-0 rounded-lg ring-1 ring-inset flex items-center justify-center', TONE[tone].soft, TONE[tone].text)}>{icon}</span>}
            <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
                {loading ? <div className="mt-1.5 h-7 w-20 rounded bg-surface-3 animate-pulse" /> : (
                    <p className="mt-0.5 text-[22px] leading-8 font-semibold text-heading tabular-nums">{value}</p>
                )}
                {(hint || delta) && !loading && <p className="mt-0.5 text-[12px] text-ink-3 flex flex-wrap items-center gap-x-1.5">{delta}{hint}</p>}
            </div>
        </div>
    );
    const cls = 'block rounded-xl bg-surface ring-1 ring-line p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
    return href ? <Link href={href} className={cn(cls, 'hover:ring-line-strong transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal')}>{body}</Link> : <div className={cls}>{body}</div>;
}

// ─── Buttons & inputs ──────────────────────────────────────────────────

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand'; size?: 'sm' | 'md'; loading?: boolean; icon?: React.ReactNode };
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
    return (
        <button ref={ref} disabled={disabled || loading} {...rest}
            className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-1 disabled:opacity-55 disabled:cursor-not-allowed',
                size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-10 px-4 text-[13.5px]',
                variant === 'primary' && 'bg-cta text-cta-fg hover:bg-cta-hover',
                variant === 'brand' && 'bg-teal text-white hover:brightness-110',
                variant === 'secondary' && 'bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2',
                variant === 'ghost' && 'text-ink-2 hover:bg-surface-2',
                variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
                className,
            )}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
            {children}
        </button>
    );
});

export const inputCls = 'w-full h-10 px-3 rounded-lg bg-surface ring-1 ring-inset ring-line-strong text-[14px] text-ink placeholder:text-ink-4 outline-none focus:ring-2 focus:ring-teal disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:ring-red-400';
export const selectCls = inputCls + ' pe-8 appearance-none bg-[length:16px] bg-no-repeat bg-[right_10px_center] bg-[url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2364748B%27 stroke-width=%272%27><path d=%27M4 6l4 4 4-4%27/></svg>")]';

export function Field({ label, htmlFor, required, optional, hint, error, children, className }: { label: string; htmlFor?: string; required?: boolean; optional?: boolean; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('min-w-0', className)}>
            <label htmlFor={htmlFor} className="flex items-baseline gap-1.5 mb-1.5 text-[13px] font-medium text-ink-2">
                {label}
                {required && <span className="text-red-600" aria-hidden>*</span>}
                {required && <span className="sr-only">(required)</span>}
                {optional && <span className="text-[12px] font-normal text-ink-4">Optional</span>}
            </label>
            {children}
            {error ? <p role="alert" className="mt-1 text-[12.5px] text-red-700">{error}</p> : hint ? <p className="mt-1 text-[12.5px] text-ink-3">{hint}</p> : null}
        </div>
    );
}

// ─── States ────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
    return <div aria-hidden className={cn('rounded-md bg-surface-3 animate-pulse', className)} />;
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="py-12 px-4 text-center">
            {icon && <span className="mx-auto w-11 h-11 rounded-xl bg-surface-2 ring-1 ring-line text-ink-3 flex items-center justify-center">{icon}</span>}
            <p className="mt-3 text-[15px] font-semibold text-heading">{title}</p>
            {children && <div className="mt-1 text-[13.5px] text-ink-3 max-w-[48ch] mx-auto">{children}</div>}
            {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
        </div>
    );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
    return (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 ring-1 ring-red-200 px-4 py-3 text-[13.5px] text-red-800">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="flex-1 min-w-[12rem]">{message || 'We couldn’t load this. Check your connection and try again.'}</span>
            {onRetry && <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={onRetry}>Try again</Button>}
        </div>
    );
}

export function Notice({ tone = 'info', title, children, onClose, action }: { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; onClose?: () => void; action?: React.ReactNode }) {
    return (
        <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg ring-1 ring-inset px-4 py-3 text-[13.5px]', TONE[tone].soft)}>
            {tone === 'danger' || tone === 'warning' ? <AlertTriangle size={16} className={cn('mt-0.5 shrink-0', TONE[tone].text)} /> : <Info size={16} className={cn('mt-0.5 shrink-0', TONE[tone].text)} />}
            <div className="min-w-0 flex-1 text-ink-2">
                {title && <p className={cn('font-semibold', TONE[tone].text)}>{title}</p>}
                {children}
                {action && <div className="mt-2">{action}</div>}
            </div>
            {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="self-start text-ink-3 hover:text-ink"><X size={15} /></button>}
        </div>
    );
}

// ─── Dialogs ───────────────────────────────────────────────────────────

/** Accessible modal: focus moves in, Esc closes, background is inert to clicks. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', dismissable = true }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; dismissable?: boolean }) {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!open) return;
        const prev = document.activeElement as HTMLElement | null;
        const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus],input,select,textarea,button:not([aria-label="Close"])')?.focus(), 30);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && dismissable) onClose(); };
        document.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
    }, [open, onClose, dismissable]);
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4">
            <div className="absolute inset-0 bg-slate-900/45" onClick={dismissable ? onClose : undefined} />
            <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="dlg-title"
                className={cn('relative w-full bg-surface text-start shadow-2xl ring-1 ring-line flex flex-col max-h-[100dvh] sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl',
                    size === 'sm' && 'sm:max-w-[440px]', size === 'md' && 'sm:max-w-[560px]', size === 'lg' && 'sm:max-w-[820px]', size === 'xl' && 'sm:max-w-[1120px]')}>
                <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-line">
                    <div className="min-w-0 flex-1">
                        <h2 id="dlg-title" className="text-[17px] font-semibold text-heading">{title}</h2>
                        {description && <p className="mt-0.5 text-[13.5px] text-ink-3">{description}</p>}
                    </div>
                    {dismissable && <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 -me-1 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-2"><X size={17} /></button>}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-line bg-surface-2/50 rounded-b-2xl">{footer}</div>}
            </div>
        </div>
    );
}

type ConfirmOpts = { title: string; body?: React.ReactNode; confirm?: string; tone?: 'danger' | 'primary' };
const ConfirmCtx = React.createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = React.useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
    const ask = React.useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
    const done = (v: boolean) => { state?.resolve(v); setState(null); };
    return (
        <ConfirmCtx.Provider value={ask}>
            {children}
            <Dialog open={!!state} onClose={() => done(false)} title={state?.title} size="sm"
                footer={<><Button variant="secondary" onClick={() => done(false)}>Cancel</Button><Button data-autofocus variant={state?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => done(true)}>{state?.confirm || 'Confirm'}</Button></>}>
                {state?.body && <div className="text-[14px] text-ink-2">{state.body}</div>}
            </Dialog>
        </ConfirmCtx.Provider>
    );
}
export const useConfirm = () => React.useContext(ConfirmCtx);

// ─── Misc ──────────────────────────────────────────────────────────────

export function Thumb({ src, alt = '', size = 40 }: { src?: string | null; alt?: string; size?: number }) {
    const ok = src && /^(https?:|\/)/.test(src);
    return (
        <span className="relative shrink-0 rounded-lg bg-white ring-1 ring-line overflow-hidden flex items-center justify-center" style={{ width: size, height: size }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ok ? <img src={src!} alt={alt} loading="lazy" className="max-w-[88%] max-h-[88%] object-contain" /> : <span className="text-[10px] font-medium text-ink-4">No photo</span>}
        </span>
    );
}

export const eur = (n: number | null | undefined, digits = 2) =>
    n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n));
export const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-US').format(n));
export const shortDate = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Reads a failed response into a readable message (Nest error bodies included). */
export async function errorMessage(res: Response, fallback = 'Something went wrong. Please try again.') {
    const body = await res.json().catch(() => null);
    const m = body?.message;
    if (Array.isArray(m)) return m.join(' ');
    if (typeof m === 'string' && m) return m;
    if (res.status === 401) return 'Your session has expired — sign in again.';
    if (res.status === 403) return 'You don’t have access to this.';
    if (res.status >= 500) return 'The server had a problem. Please try again in a moment.';
    return fallback;
}
