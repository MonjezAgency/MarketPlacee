'use client';

import * as React from 'react';
import { ArrowLeft, CheckCircle2, Mail, RotateCcw, Send } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button, Dialog, Field, Notice, inputCls, selectCls } from '@/components/supplier/ui';
import { teamApi, TeamApiError, type TeamInvitation } from '@/lib/admin-team-api';
import type { StaffRole } from '@/lib/admin-access';
import { RoleCapabilities, explainError, roleLabel, useTt } from './teamUi';

type Step = 'form' | 'review' | 'sent';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Add member: form → review (role and its permissions) → send. Success is shown only
 * after the server confirms the email was accepted by the provider; a failed email
 * leaves no active invitation and says so.
 */
export function InviteMemberDialog({ open, onClose, roles, onChanged }: { open: boolean; onClose: () => void; roles: StaffRole[]; onChanged: () => void }) {
    const tt = useTt();
    const { fmt } = useLanguage();
    const [step, setStep] = React.useState('form' as Step);
    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [role, setRole] = React.useState('');
    const [errors, setErrors] = React.useState({} as Record<string, string>);
    const [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState(null as null | { message: string; pendingId?: string });
    const [sent, setSent] = React.useState(null as TeamInvitation | null);

    React.useEffect(() => {
        if (!open) return;
        setStep('form'); setName(''); setEmail(''); setRole(''); setErrors({}); setFailure(null); setSent(null); setBusy(false);
    }, [open]);

    const validate = () => {
        const e: Record<string, string> = {};
        if (!name.trim()) e.name = tt('vName');
        if (!EMAIL_RE.test(email.trim())) e.email = tt('vEmail');
        if (!role) e.role = tt('vRole');
        setErrors(e);
        return !Object.keys(e).length;
    };

    const send = async () => {
        setBusy(true); setFailure(null);
        try {
            const r = await teamApi.invite({ name: name.trim(), email: email.trim(), role });
            setSent(r.invitation); setStep('sent'); onChanged();
        } catch (e) {
            if (e instanceof TeamApiError && e.code === 'INVALID_INVITATION' && e.body?.errors) {
                const fe: Record<string, string> = {};
                if (e.body.errors.name) fe.name = tt('vName');
                if (e.body.errors.email) fe.email = tt('vEmail');
                if (e.body.errors.role) fe.role = tt('vRole');
                setErrors(fe); setStep('form');
            }
            if (e instanceof TeamApiError && e.code === 'EMAIL_NOT_SENT') onChanged(); // the row exists, marked "email not sent"
            setFailure({ message: explainError(tt, e), pendingId: e instanceof TeamApiError && e.code === 'INVITE_PENDING' ? e.body?.invitationId : undefined });
        } finally { setBusy(false); }
    };

    const resendPending = async (id: string) => {
        setBusy(true); setFailure(null);
        try {
            const r = await teamApi.resend(id);
            setSent(r.invitation); setStep('sent'); onChanged();
        } catch (e) {
            if (e instanceof TeamApiError && e.code === 'EMAIL_NOT_SENT') onChanged();
            setFailure({ message: explainError(tt, e) });
        } finally { setBusy(false); }
    };

    const footer = step === 'form' ? (
        <>
            <Button variant="secondary" onClick={onClose}>{tt('cancel')}</Button>
            <Button variant="primary" onClick={() => { if (validate()) { setFailure(null); setStep('review'); } }}>{tt('reviewInvite')}</Button>
        </>
    ) : step === 'review' ? (
        <>
            <Button variant="secondary" icon={<ArrowLeft size={15} className="rtl:rotate-180" />} onClick={() => setStep('form')} disabled={busy}>{tt('back')}</Button>
            {failure?.pendingId
                ? <Button variant="primary" icon={<RotateCcw size={15} />} loading={busy} onClick={() => resendPending(failure.pendingId!)}>{tt('resendInstead')}</Button>
                : <Button variant="primary" icon={<Send size={15} />} loading={busy} onClick={send}>{tt('sendInvite')}</Button>}
        </>
    ) : (
        <Button variant="primary" onClick={onClose}>{tt('done')}</Button>
    );

    return (
        <Dialog open={open} onClose={busy ? () => undefined : onClose} title={step === 'sent' ? tt('sentTitle') : tt('inviteTitle')}
            description={step === 'form' ? tt('inviteDesc') : step === 'review' ? tt('reviewDesc') : undefined} footer={footer} dismissable={!busy}>
            {step === 'form' && (
                <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (validate()) setStep('review'); }}>
                    <Field label={tt('fName')} htmlFor="inv-name" required error={errors.name}>
                        <input id="inv-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={120} aria-invalid={!!errors.name} data-autofocus />
                    </Field>
                    <Field label={tt('fEmail')} htmlFor="inv-email" required error={errors.email} hint={tt('fEmailHint')}>
                        <input id="inv-email" type="email" dir="ltr" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" maxLength={254} aria-invalid={!!errors.email} />
                    </Field>
                    <Field label={tt('fRole')} htmlFor="inv-role" required error={errors.role}>
                        <select id="inv-role" className={selectCls} value={role} onChange={(e) => setRole(e.target.value)} aria-invalid={!!errors.role}>
                            <option value="">{tt('fRoleChoose')}</option>
                            {roles.map((r) => <option key={r} value={r}>{roleLabel(tt, r)}</option>)}
                        </select>
                    </Field>
                    {role && (
                        <div className="rounded-lg bg-surface-2 ring-1 ring-line p-3">
                            <p className="text-[12.5px] font-medium text-ink-3 mb-1.5">{tt('roleCanTitle', { role: roleLabel(tt, role) })}</p>
                            <RoleCapabilities role={role} compact />
                        </div>
                    )}
                    {failure && <Notice tone="danger">{failure.message}</Notice>}
                    <button type="submit" className="sr-only">{tt('reviewInvite')}</button>
                </form>
            )}
            {step === 'review' && (
                <div className="space-y-4">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13.5px]">
                        <dt className="text-ink-3">{tt('fName')}</dt><dd className="text-ink font-medium break-words">{name.trim()}</dd>
                        <dt className="text-ink-3">{tt('fEmail')}</dt><dd className="text-ink break-all"><bdi dir="ltr">{email.trim().toLowerCase()}</bdi></dd>
                        <dt className="text-ink-3">{tt('fRole')}</dt><dd className="text-ink font-medium">{roleLabel(tt, role)}</dd>
                    </dl>
                    <div className="rounded-lg ring-1 ring-line p-3">
                        <p className="text-[13px] font-semibold text-heading mb-2">{tt('effectivePermissions')}</p>
                        <RoleCapabilities role={role} />
                    </div>
                    <p className="flex items-start gap-2 text-[13px] text-ink-3"><Mail size={15} aria-hidden className="mt-0.5 shrink-0" />{tt('reviewNote')}</p>
                    {failure && <Notice tone="danger">{failure.message}</Notice>}
                </div>
            )}
            {step === 'sent' && sent && (
                <div className="text-center py-4" aria-live="polite">
                    <span className="mx-auto w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><CheckCircle2 size={24} aria-hidden /></span>
                    <p className="mt-3 text-[15px] font-semibold text-heading">{tt('sentBody', { email: sent.email, role: roleLabel(tt, sent.role) })}</p>
                    <p className="mt-1 text-[13.5px] text-ink-3">{tt('sentExpires', { date: fmt.date(sent.expiresAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
                </div>
            )}
        </Dialog>
    );
}
