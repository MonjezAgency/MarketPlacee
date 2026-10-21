'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, type Tone } from '@/components/supplier/ui';
import type { CouponRow, CouponStatus, CouponType } from '@/lib/admin-coupons-api';

/** Text from the adminCoupons section. */
export function useTc() {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminCoupons', k, v), [t]);
}
export type Tc = ReturnType<typeof useTc>;

export const STATUS_TONE: Record<CouponStatus, Tone> = { ACTIVE: 'success', SCHEDULED: 'info', EXPIRED: 'neutral', DISABLED: 'neutral', EXHAUSTED: 'warning' };
export function CouponStatusBadge({ status }: { status: CouponStatus }) {
    const tc = useTc();
    return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{tc(`status_${status}`)}</Badge>;
}

/** EUR in the interface language. */
export function useMoney() {
    const { fmt } = useLanguage();
    return React.useCallback((n: number | null | undefined) => (n === null || n === undefined ? '—' : fmt.number(n, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })), [fmt]);
}

/** "10 %" or "€25.00" for a coupon or a draft. */
export function useDiscountLabel() {
    const { fmt } = useLanguage();
    const money = useMoney();
    return React.useCallback((type: CouponType, percent: number | null | undefined, amount: number | null | undefined) =>
        type === 'FIXED' ? money(amount ?? null) : percent == null ? '—' : fmt.number(percent / 100, { style: 'percent', maximumFractionDigits: 2 }), [fmt, money]);
}

/** Local date-time and the same instant in UTC (times are stored in UTC). */
export function useWhen() {
    const { fmt } = useLanguage();
    const local = React.useCallback((iso: string) => fmt.date(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), [fmt]);
    const utc = React.useCallback((iso: string) => fmt.date(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }), [fmt]);
    return { local, utc };
}
export const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'; } catch { return 'local'; } };

export function useCopy() {
    const tc = useTc();
    return React.useCallback(async (code: string) => {
        try { await navigator.clipboard.writeText(code); toast.success(tc('copied', { code })); }
        catch { toast.error(tc('copyFailed')); }
    }, [tc]);
}

/** What a coupon applies to, in words. */
export function scopeText(tc: Tc, row: Pick<CouponRow, 'scope' | 'categories' | 'products'>) {
    if (row.scope === 'ALL') return tc('scopeAllShort');
    if (row.scope === 'CATEGORY') return row.categories.length === 1 ? tc('scopeCategoryShort', { category: row.categories[0] }) : tc('scopeCategoriesShort', { count: row.categories.length });
    if (row.scope === 'LEGACY') return tc('scopeLegacyShort', { count: row.products.length });
    return tc('scopeProductsShort', { count: row.products.length });
}

/** Small info button with a tooltip that opens on hover and on keyboard focus. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
    const id = React.useId();
    const [open, setOpen] = React.useState(false);
    return (
        <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            <button type="button" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open}
                onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((v) => !v)}
                onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
                className="w-6 h-6 -m-1 rounded-md inline-flex items-center justify-center text-ink-4 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                <Info size={14} />
            </button>
            {open && (
                <span id={id} role="tooltip" className="absolute z-30 top-full mt-2 start-0 w-[min(18rem,80vw)] rounded-lg bg-heading text-white text-[12.5px] leading-snug font-normal p-3 shadow-float">
                    {children}
                </span>
            )}
        </span>
    );
}
