'use client';

import * as React from 'react';
import { Camera, Eye, EyeOff, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { checkPassword } from '@/lib/password-policy';
import { withStepUp } from '@/components/security/StepUp';
import { Button, Field, inputCls } from '@/components/supplier/ui';
import { cn } from '@/lib/utils';
import { FormFooter, SaveStatus, SectionHead, readError, useTs } from './shared';

type Status = { tone: 'success' | 'danger'; text: string } | null;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Your own staff profile: name, company name and photo (PATCH /users/me, whitelisted fields only). */
export function ProfileSection({ onDirty }: { onDirty: (d: boolean) => void }) {
    const ts = useTs();
    const { user, refreshUser } = useAuth();
    const initial = React.useMemo(() => ({ name: user?.name || '', companyName: user?.companyName || '', avatar: user?.avatar || null as string | null }), [user?.name, user?.companyName, user?.avatar]);
    const [f, setF] = React.useState(initial);
    const [errors, setErrors] = React.useState<{ name?: string; companyName?: string; avatar?: string }>({});
    const [saving, setSaving] = React.useState(false);
    const [status, setStatus] = React.useState<Status>(null);
    const fileRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => { setF(initial); }, [initial]);
    const dirty = f.name !== initial.name || f.companyName !== initial.companyName || f.avatar !== initial.avatar;
    React.useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

    const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { setErrors((x) => ({ ...x, avatar: ts('avatarType') })); return; }
        if (file.size > MAX_AVATAR_BYTES) { setErrors((x) => ({ ...x, avatar: ts('avatarSize') })); return; }
        const reader = new FileReader();
        reader.onloadend = () => { setF((x) => ({ ...x, avatar: String(reader.result) })); setErrors((x) => ({ ...x, avatar: undefined })); };
        reader.readAsDataURL(file);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        const errs: typeof errors = {};
        if (!f.name.trim()) errs.name = ts('nameRequired');
        if (!f.companyName.trim()) errs.companyName = ts('companyRequired');
        setErrors(errs);
        if (Object.keys(errs).length) return;
        setSaving(true); setStatus(null);
        try {
            const body: Record<string, unknown> = { name: f.name.trim(), companyName: f.companyName.trim() };
            if (f.avatar !== initial.avatar) body.avatar = f.avatar;
            const res = await apiFetch('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(await readError(res, ts('saveFailed')));
            await refreshUser();
            setStatus({ tone: 'success', text: ts('profileSaved') });
        } catch (err: any) {
            setStatus({ tone: 'danger', text: err?.message || ts('saveFailed') });
        } finally { setSaving(false); }
    };

    const initials = (f.name || user?.email || '?').trim().charAt(0).toUpperCase();
    return (
        <form onSubmit={save} noValidate aria-labelledby="sec-profile">
            <SectionHead id="sec-profile" title={ts('profileTitle')} lead={ts('profileLead')} />
            <div className="flex flex-wrap items-center gap-4">
                <span className="w-16 h-16 rounded-2xl bg-teal-soft text-teal ring-1 ring-line overflow-hidden flex items-center justify-center text-[22px] font-semibold">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {f.avatar ? <img src={f.avatar} alt={ts('avatarAlt')} className="w-full h-full object-cover" /> : initials}
                </span>
                <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink">{ts('avatarLabel')}</p>
                    <p className="text-[12.5px] text-ink-3">{ts('avatarHint')}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={pickFile} tabIndex={-1} aria-hidden />
                        <Button type="button" size="sm" icon={<Camera size={14} />} onClick={() => fileRef.current?.click()}>{ts('avatarUpload')}</Button>
                        {f.avatar && <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setF((x) => ({ ...x, avatar: null }))}>{ts('avatarRemove')}</Button>}
                    </div>
                    {errors.avatar && <p role="alert" className="mt-1 text-[12.5px] text-red-700">{errors.avatar}</p>}
                </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={ts('fieldName')} htmlFor="pf-name" required error={errors.name}>
                    <input id="pf-name" className={inputCls} value={f.name} maxLength={120} autoComplete="name" aria-invalid={!!errors.name || undefined} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
                </Field>
                <Field label={ts('fieldCompany')} htmlFor="pf-company" required error={errors.companyName} hint={ts('fieldCompanyHint')}>
                    <input id="pf-company" className={inputCls} value={f.companyName} maxLength={160} autoComplete="organization" aria-invalid={!!errors.companyName || undefined} onChange={(e) => setF((x) => ({ ...x, companyName: e.target.value }))} />
                </Field>
                <Field label={ts('fieldEmail')} htmlFor="pf-email" hint={ts('fieldEmailHint')}>
                    <input id="pf-email" className={inputCls} value={user?.email || ''} disabled dir="ltr" />
                </Field>
            </div>
            <SaveStatus state={status} />
            <FormFooter dirty={dirty}>
                <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setF(initial); setErrors({}); setStatus(null); }}>{ts('discard')}</Button>
                <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>{ts('saveProfile')}</Button>
            </FormFooter>
        </form>
    );
}

/** Change your own password (POST /auth/change-password; accounts with 2FA confirm with a code). */
export function PasswordSection({ onDirty }: { onDirty: (d: boolean) => void }) {
    const ts = useTs();
    const { user } = useAuth();
    const [cur, setCur] = React.useState('');
    const [next, setNext] = React.useState('');
    const [confirm, setConfirm] = React.useState('');
    const [show, setShow] = React.useState(false);
    const [touched, setTouched] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [status, setStatus] = React.useState<Status>(null);
    const dirty = !!(cur || next || confirm);
    React.useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

    const check = checkPassword(next, { email: user?.email, name: user?.name });
    const errCur = touched && !cur ? ts('pwCurrentRequired') : null;
    const errNext = touched && next && !check.ok ? ts('pwPolicy') : touched && !next ? ts('pwNewRequired') : null;
    const errConfirm = touched && confirm !== next ? ts('pwMismatch') : null;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        setTouched(true);
        if (!cur || !next || !check.ok || confirm !== next) return;
        setSaving(true); setStatus(null);
        try {
            const res = await withStepUp((h) => apiFetch('/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) }));
            if (!res.ok) throw new Error(await readError(res, ts('pwFailed')));
            setCur(''); setNext(''); setConfirm(''); setTouched(false);
            setStatus({ tone: 'success', text: ts('pwChanged') });
        } catch (err: any) {
            setStatus({ tone: 'danger', text: err?.message || ts('pwFailed') });
        } finally { setSaving(false); }
    };

    const type = show ? 'text' : 'password';
    return (
        <form onSubmit={submit} noValidate aria-labelledby="sec-password">
            <SectionHead id="sec-password" title={ts('passwordTitle')} lead={ts('passwordLead')} />
            <div className="grid gap-4 max-w-xl">
                <Field label={ts('pwCurrent')} htmlFor="pw-cur" required error={errCur}>
                    <input id="pw-cur" type={type} className={inputCls} value={cur} autoComplete="current-password" aria-invalid={!!errCur || undefined} onChange={(e) => setCur(e.target.value)} />
                </Field>
                <Field label={ts('pwNew')} htmlFor="pw-new" required error={errNext} hint={ts('pwHint')}>
                    <input id="pw-new" type={type} className={inputCls} value={next} autoComplete="new-password" aria-invalid={!!errNext || undefined} onChange={(e) => setNext(e.target.value)} />
                </Field>
                <Field label={ts('pwConfirm')} htmlFor="pw-confirm" required error={errConfirm}>
                    <input id="pw-confirm" type={type} className={inputCls} value={confirm} autoComplete="new-password" aria-invalid={!!errConfirm || undefined} onChange={(e) => setConfirm(e.target.value)} />
                </Field>
                <label className="inline-flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer w-fit">
                    <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-4 h-4 accent-[#0E7C74]" />
                    {show ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}{ts('pwShow')}
                </label>
            </div>
            <SaveStatus state={status} />
            <FormFooter dirty={dirty}>
                <Button type="submit" variant="primary" loading={saving} disabled={!dirty} className={cn(saving && 'pointer-events-none')}>{ts('pwSubmit')}</Button>
            </FormFooter>
        </form>
    );
}
