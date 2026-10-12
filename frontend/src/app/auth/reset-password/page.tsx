'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AuthShell, authInput, authLabel, authPrimary, FormAlert, PasswordChecklist, passwordOk } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';

function Reset() {
    const sp = useSearchParams();
    const token = sp.get('token') || '';
    const [state, setState] = React.useState<'checking' | 'invalid' | 'form' | 'done'>('checking');
    const [pw, setPw] = React.useState('');
    const [confirm, setConfirm] = React.useState('');
    const [show, setShow] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (!token) { setState('invalid'); return; }
        apiFetch('/auth/reset-password/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
            .then((r) => r.json().catch(() => ({})).then((b) => ({ ok: r.ok, b, status: r.status })))
            // Older backends without /check: fall through to the form; the reset call itself validates.
            .then(({ ok, b }) => setState(ok ? (b?.valid ? 'form' : 'invalid') : 'form'))
            .catch(() => setState('form'));
    }, [token]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!passwordOk(pw)) { setError('Your new password doesn’t meet all the requirements yet.'); return; }
        if (pw !== confirm) { setError('Passwords don’t match.'); return; }
        setBusy(true); setError('');
        try {
            const res = await apiFetch('/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: pw }) });
            if (res.ok) { setState('done'); return; }
            if (res.status === 400) { setState('invalid'); return; }
            setError('Something went wrong. Try again in a moment.');
        } catch { setError('We couldn’t reach Atlantis. Check your connection and try again.'); }
        finally { setBusy(false); }
    };

    return (
        <AuthShell>
            <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-6 sm:p-8">
                {state === 'checking' && <p className="flex items-center gap-2 text-[14px] text-ink-3"><Loader2 size={16} className="animate-spin" /> Checking your link…</p>}
                {state === 'invalid' && (<>
                    <span className="w-12 h-12 rounded-2xl bg-[#FFFBEB] dark:bg-amber-500/10 text-[#B45309] flex items-center justify-center"><AlertTriangle size={22} /></span>
                    <h1 className="mt-4 text-[22px] leading-tight font-semibold text-heading">This link has expired or was already used</h1>
                    <p className="mt-2 text-[14.5px] text-ink-2">Reset links work once and expire after 60 minutes. Request a new one to continue.</p>
                    <Link href="/auth/forgot-password" className={cn(authPrimary, 'mt-6')}>Request a new link</Link>
                </>)}
                {state === 'done' && (<>
                    <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><CheckCircle2 size={24} /></span>
                    <h1 className="mt-4 text-[22px] leading-tight font-semibold text-heading">Password updated</h1>
                    <p className="mt-2 text-[14.5px] text-ink-2">Sign in with your new password. For your security, other devices were signed out.</p>
                    <Link href="/auth/login" className={cn(authPrimary, 'mt-6')}>Sign in</Link>
                </>)}
                {state === 'form' && (<>
                    <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><LockKeyhole size={22} /></span>
                    <h1 className="mt-4 text-[22px] leading-tight font-semibold text-heading">Choose a new password</h1>
                    <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
                        <div>
                            <label htmlFor="rp-pw" className={authLabel}>New password</label>
                            <div className="relative">
                                <input id="rp-pw" type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus className={cn(authInput, 'pe-11')} />
                                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-ink-3 hover:text-ink">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                            </div>
                            <PasswordChecklist value={pw} />
                        </div>
                        <div>
                            <label htmlFor="rp-confirm" className={authLabel}>Confirm new password</label>
                            <input id="rp-confirm" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={authInput} />
                        </div>
                        {error && <FormAlert>{error}</FormAlert>}
                        <button type="submit" disabled={busy} className={authPrimary}>{busy ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Update password'}</button>
                    </form>
                </>)}
            </div>
        </AuthShell>
    );
}

export default function ResetPasswordPage() {
    return <React.Suspense fallback={null}><Reset /></React.Suspense>;
}
