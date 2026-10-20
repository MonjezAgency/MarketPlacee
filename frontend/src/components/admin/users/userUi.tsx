'use client';

import * as React from 'react';
import toast from 'react-hot-toast';
import { Ban, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge, Button, useConfirm, type Tone } from '@/components/supplier/ui';
import { adminUsersApi, isMarketAccount, type AccountStatus } from '@/lib/admin-users-api';

/** Shared labels, badges and account actions for Admin → Users (dictionary section `adminUsers`). */

export function useTu() {
    const { t } = useLanguage();
    return React.useCallback((k: string, v?: Record<string, string | number>) => t('adminUsers', k, v), [t]);
}

export const STATUS_TONE: Record<string, Tone> = { PENDING_APPROVAL: 'warning', ACTIVE: 'success', REJECTED: 'danger', BLOCKED: 'danger', DELETED: 'neutral' };
export const KYC_TONE: Record<string, Tone> = { UNVERIFIED: 'neutral', PENDING: 'warning', VERIFIED: 'success', REJECTED: 'danger' };

/** Unknown server values are shown as sent. */
const known = (tu: (k: string) => string, key: string, raw: string) => tu(key) || raw;
export const roleLabel = (tu: (k: string) => string, role: string) => known(tu, `role_${role}`, role);
export const statusLabel = (tu: (k: string) => string, s: string) => known(tu, `status_${s}`, s);
export const kycLabel = (tu: (k: string) => string, s: string) => known(tu, `kyc_${s}`, s);

export function StatusBadge({ status }: { status: string }) {
    const tu = useTu();
    return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{statusLabel(tu, status)}</Badge>;
}
export function KycBadge({ status }: { status: string }) {
    const tu = useTu();
    return <Badge tone={KYC_TONE[status] ?? 'neutral'}>{tu('kycBadge', { status: kycLabel(tu, status) })}</Badge>;
}
export function RoleBadge({ role }: { role: string }) {
    const tu = useTu();
    return <Badge tone={role === 'SUPPLIER' ? 'brand' : role === 'CUSTOMER' ? 'info' : 'neutral'}>{roleLabel(tu, role)}</Badge>;
}

export type AccountAction = 'approve' | 'reject' | 'block' | 'unblock';
const TARGET: Record<AccountAction, 'ACTIVE' | 'REJECTED' | 'BLOCKED'> = { approve: 'ACTIVE', reject: 'REJECTED', block: 'BLOCKED', unblock: 'ACTIVE' };

/** What the existing status endpoint can do from each status (the same moves the earlier pages offered). */
export function actionsFor(role: string, status: AccountStatus | string): AccountAction[] {
    if (!isMarketAccount(role)) return [];
    switch (status) {
        case 'PENDING_APPROVAL': return ['approve', 'reject', 'block'];
        case 'ACTIVE': return ['block'];
        case 'REJECTED': return ['approve'];
        case 'BLOCKED': return ['unblock'];
        default: return [];
    }
}

/** Buttons for one account. Each action asks for confirmation and then calls POST /users/:id/status. */
export function AccountActions({ user, onDone, size = 'md' }: { user: { id: string; name: string; role: string; status: string }; onDone: () => void; size?: 'sm' | 'md' }) {
    const tu = useTu();
    const confirm = useConfirm();
    const [busy, setBusy] = React.useState<AccountAction | null>(null);
    const actions = actionsFor(user.role, user.status);
    if (!actions.length) return null;
    const fromPending = user.status === 'PENDING_APPROVAL';
    const run = async (a: AccountAction) => {
        const body = a === 'approve' ? tu(fromPending ? 'confirmApproveBodyPending' : 'confirmApproveBody')
            : a === 'reject' ? tu('confirmRejectBody')
            : a === 'block' ? tu('confirmBlockBody') : tu('confirmUnblockBody');
        if (!(await confirm({ title: tu(`confirm_${a}`, { name: user.name }), body, confirm: tu(`act_${a}`), tone: a === 'reject' || a === 'block' ? 'danger' : 'primary' }))) return;
        setBusy(a);
        try { await adminUsersApi.setStatus(user.id, TARGET[a]); toast.success(tu(`done_${a}`, { name: user.name })); onDone(); }
        catch (e: any) { toast.error(e?.message || tu('actionFailed')); }
        finally { setBusy(null); }
    };
    const icon: Record<AccountAction, React.ReactNode> = { approve: <CheckCircle2 size={14} />, reject: <XCircle size={14} />, block: <Ban size={14} />, unblock: <RotateCcw size={14} /> }; // i18n-ignore: icon map, not text
    return (
        <>
            {actions.map((a) => (
                <Button key={a} size={size} variant={a === 'approve' || a === 'unblock' ? 'primary' : a === 'reject' ? 'danger' : 'secondary'}
                    icon={icon[a]} loading={busy === a} disabled={!!busy && busy !== a} onClick={() => run(a)}>{tu(`act_${a}`)}</Button>
            ))}
        </>
    );
}

export function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
    const ok = src && /^(https?:|\/|data:image\/)/.test(src);
    return (
        <span aria-hidden className="shrink-0 rounded-full bg-surface-3 ring-1 ring-line overflow-hidden flex items-center justify-center text-[11.5px] font-semibold text-ink-2" style={{ width: size, height: size }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ok ? <img src={src!} alt="" className="w-full h-full object-cover" /> : initials(name)}
        </span>
    );
}
