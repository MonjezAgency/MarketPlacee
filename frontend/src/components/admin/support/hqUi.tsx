'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge } from '@/components/supplier/ui';
import type { ThreadState } from '@/lib/admin-support-api';

/** Shared labels and small pieces for Admin → Support HQ (dictionary section `adminSupport`). */

export type Ts = (k: string, v?: Record<string, string | number>) => string;
export function useTs(): Ts {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminSupport', k, v), [t]);
}

/** Team names stored in assignedTeam. Unknown values are shown as stored. */
export const teamLabel = (ts: Ts, team: string) => (['SUPPORT', 'DEVELOPER', 'LOGISTICS'].includes(team) ? ts(`team_${team}`) : team);

/** Buyer / supplier / Ali FMCG staff, from the account role. */
export function roleKind(role: string | null | undefined, partyKind?: 'buyer' | 'supplier' | null): 'buyer' | 'supplier' | 'staff' | 'unknown' {
    if (partyKind) return partyKind;
    const r = String(role || '').toUpperCase();
    if (r === 'SUPPLIER') return 'supplier';
    if (r === 'CUSTOMER') return 'buyer';
    return r ? 'staff' : 'unknown';
}

export function RoleChip({ role, partyKind }: { role: string | null | undefined; partyKind?: 'buyer' | 'supplier' | null }) {
    const ts = useTs();
    const k = roleKind(role, partyKind);
    if (k === 'unknown') return null;
    return <Badge tone={k === 'supplier' ? 'brand' : k === 'buyer' ? 'info' : 'neutral'} className="h-5 px-1.5 text-[11.5px]">{ts(`kind_${k}`)}</Badge>;
}

/** Only the states the data records. "Resolved" is not recorded, so it never appears. */
export function StateChips({ state, team, takenOverBy, awaiting, compact }: { state: ThreadState; team: string | null; takenOverBy?: string | null; awaiting: boolean; compact?: boolean }) {
    const ts = useTs();
    const cls = compact ? 'h-5 px-1.5 text-[11.5px]' : undefined;
    return (
        <>
            {state === 'assistant' && <Badge tone="neutral" className={cls}>{ts('stateAssistant')}</Badge>}
            {state === 'assigned' && team && <Badge tone="info" className={cls}>{ts('stateAssigned', { team: teamLabel(ts, team) })}</Badge>}
            {state === 'taken_over' && <Badge tone="brand" className={cls}>{takenOverBy ? ts('stateTakenOverBy', { name: takenOverBy }) : ts('stateTakenOver')}</Badge>}
            {state === 'taken_over' && team && !compact && <Badge tone="info" className={cls}>{ts('stateAssigned', { team: teamLabel(ts, team) })}</Badge>}
            {awaiting && <Badge tone="warning" dot className={cls}>{ts('stateWaiting')}</Badge>}
        </>
    );
}

/** Small definition popover: shown on hover and on keyboard focus. */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    const id = React.useId();
    return (
        <span className={cn('relative inline-flex group', className)}>
            <button type="button" aria-label={label} aria-describedby={id} className="w-5 h-5 inline-flex items-center justify-center rounded text-ink-4 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6]">
                <Info size={14} aria-hidden />
            </button>
            <span id={id} role="tooltip" className="pointer-events-none absolute z-30 top-full mt-1 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 w-64 rounded-lg bg-heading px-3 py-2 text-[12.5px] leading-snug font-normal text-white shadow-float opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity duration-150 motion-reduce:transition-none">
                {children}
            </span>
        </span>
    );
}

/** Milliseconds → "4 min" / "2 h 5 min" / "3 d 4 h" in the interface language. */
export function useDuration() {
    const ts = useTs();
    return React.useCallback((ms: number) => {
        const m = Math.max(1, Math.round(ms / 60_000));
        if (m < 60) return ts('durMin', { m });
        const h = Math.floor(m / 60), rm = m % 60;
        if (h < 48) return rm ? ts('durHourMin', { h, m: rm }) : ts('durHour', { h });
        const d = Math.floor(h / 24), rh = h % 24;
        return rh ? ts('durDayHour', { d, h: rh }) : ts('durDay', { d });
    }, [ts]);
}

export const displayName = (p: { name?: string | null; companyName?: string | null; email?: string | null } | null | undefined, fallback: string) =>
    (p?.companyName || p?.name || p?.email || fallback);
