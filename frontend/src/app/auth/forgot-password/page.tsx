'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, KeyRound, MailCheck, ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AuthShell, authInput, authLabel, authPrimary, FormAlert } from '@/components/auth/AuthShell';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForgotPasswordPage() {
    const [email, setEmail] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const [sent, setSent] = React.useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!EMAIL_RE.test(email.trim())) { setError('Enter a valid email address.'); return; }
        setBusy(true); setError('');
        try {
            const res = await apiFetch('/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
            if (res.status === 429) { setError('Too many requests. Wait a minute and try again.'); return; }
            if (!res.ok && res.status >= 500) { setError('Something went wrong on our side. Try again in a moment.'); return; }
            setSent(true); // same outcome whether or not the address has an account
        } catch { setError('We couldn’t reach Ali FMCG. Check your connection and try again.'); }
        finally { setBusy(false); }
    };

    return (
        <AuthShell>
            <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-6 sm:p-8">
                <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink"><ArrowLeft size={14} /> Back to sign in</Link>
                {sent ? (<>
                    <span className="mt-4 w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><MailCheck size={23} /></span>
                    <h1 className="mt-4 text-[22px] leading-tight font-semibold text-heading">Check your email</h1>
                    <p className="mt-2 text-[14.5px] text-ink-2">If an Ali FMCG account uses <strong className="text-ink">{email.trim()}</strong>, we’ve sent a link to reset the password. It works once and expires in 60 minutes.</p>
                    <p className="mt-2 text-[13.5px] text-ink-3">Nothing arrived after a few minutes? Check spam, or <button type="button" onClick={() => setSent(false)} className="font-semibold text-teal hover:underline">try again</button>.</p>
                </>) : (<>
                    <span className="mt-4 w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><KeyRound size={22} /></span>
                    <h1 className="mt-4 text-[22px] leading-tight font-semibold text-heading">Reset your password</h1>
                    <p className="mt-1 text-[14px] text-ink-3">Enter your account email and we’ll send you a reset link.</p>
                    <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
                        <div>
                            <label htmlFor="fp-email" className={authLabel}>Email</label>
                            <input id="fp-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus className={authInput} />
                        </div>
                        {error && <FormAlert>{error}</FormAlert>}
                        <button type="submit" disabled={busy} className={authPrimary}>{busy ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : 'Send reset link'}</button>
                    </form>
                </>)}
            </div>
        </AuthShell>
    );
}
