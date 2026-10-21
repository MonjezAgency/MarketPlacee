'use client';

import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, type Tone } from '@/components/supplier/ui';
import { ROLE_CAPABILITY_KEYS, STAFF_ROLES, type StaffRole } from '@/lib/admin-access';
import { TeamApiError, type InvitationState } from '@/lib/admin-team-api';
import { cn } from '@/lib/utils';

/** Shared labels and pieces for Admin → Team (dictionary section `adminTeam`). */
export function useTt() {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminTeam', k, v), [t]);
}
type Tt = (k: string, v?: Record<string, string | number>) => string;

export const isKnownRole = (r: string): r is StaffRole => (STAFF_ROLES as string[]).includes(r);
export const roleLabel = (tt: Tt, role: string) => (isKnownRole(role) ? tt(`role_${role}`) : role);

export function RoleBadge({ role }: { role: string }) {
    const tt = useTt();
    const tone: Tone = role === 'OWNER' ? 'brand' : role === 'ADMIN' ? 'info' : 'neutral';
    return <Badge tone={tone}>{roleLabel(tt, role)}</Badge>;
}

export type RowStatus = 'ACTIVE' | 'BLOCKED' | 'OTHER' | 'SENT' | InvitationState;
const STATUS_TONE: Record<string, Tone> = { ACTIVE: 'success', BLOCKED: 'danger', PENDING: 'warning', EXPIRED: 'neutral', NOT_SENT: 'danger', REVOKED: 'neutral', ACCEPTED: 'success', SENT: 'success', OTHER: 'neutral' };
const STATUS_KEY: Record<string, string> = { ACTIVE: 'stActive', BLOCKED: 'stDeactivated', PENDING: 'stInvitePending', EXPIRED: 'stInviteExpired', NOT_SENT: 'stEmailNotSent', REVOKED: 'stRevoked', ACCEPTED: 'stAccepted', SENT: 'stSent' };

export function StatusBadge({ status, raw }: { status: RowStatus; raw?: string }) {
    const tt = useTt();
    return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{STATUS_KEY[status] ? tt(STATUS_KEY[status]) : (raw || status)}</Badge>;
}

/** What one role can and can't do, from lib/admin-access.ts. */
export function RoleCapabilities({ role, compact }: { role: string; compact?: boolean }) {
    const tt = useTt();
    if (!isKnownRole(role)) return null;
    const caps = ROLE_CAPABILITY_KEYS[role];
    return (
        <ul className={cn('space-y-1', compact ? 'text-[12.5px]' : 'text-[13px]')}>
            {caps.can.map((k) => (
                <li key={k} className="flex items-start gap-1.5 text-ink-2"><Check size={14} aria-hidden className="mt-0.5 shrink-0 text-teal" /><span><span className="sr-only">{tt('srCan')} </span>{tt(k)}</span></li>
            ))}
            {caps.cannot.map((k) => (
                <li key={k} className="flex items-start gap-1.5 text-ink-3"><Minus size={14} aria-hidden className="mt-0.5 shrink-0 text-ink-4" /><span><span className="sr-only">{tt('srCannot')} </span>{tt(k)}</span></li>
            ))}
        </ul>
    );
}

/** Readable message for a refused or failed request. */
export function explainError(tt: Tt, e: unknown): string {
    if (e instanceof TeamApiError) {
        const known: Record<string, string> = {
            NETWORK: 'errNetwork', SELF: 'errSelf', OWNER_PROTECTED: 'errOwnerProtected', ADMIN_PROTECTED: 'errAdminProtected',
            ROLE_NOT_GRANTABLE: 'errRoleNotGrantable', NOT_ALLOWED: 'errNotAllowed', ALREADY_MEMBER: 'errAlreadyMember',
            EMAIL_HAS_ACCOUNT: 'errEmailHasAccount', INVITE_PENDING: 'errInvitePending', ALREADY_ACCEPTED: 'errAlreadyAccepted',
            REVOKED: 'errRevokedResend', NOT_OPEN: 'errNotOpen', CHANGED: 'errChanged', NOT_FOUND: 'errNotFound', INVALID_INVITATION: 'errCheckFields',
        };
        if (e.code === 'EMAIL_NOT_SENT') return tt('errEmailNotSent', { reason: e.body?.reason || '—' });
        if (e.code && known[e.code]) return tt(known[e.code]);
        if (e.status === 401) return tt('errSession');
        if (e.status === 403) return tt('errNotAllowed');
    }
    return tt('errGeneric');
}
