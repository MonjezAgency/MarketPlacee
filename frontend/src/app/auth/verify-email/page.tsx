'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, MailCheck, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AuthShell, authInput, authLabel, authPrimary, FormAlert } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Enter the 6-digit code from the sign-up email. Success is shown only when
 * the server confirms it; nothing here marks an email as verified locally.
 */
function VerifyEmail() {
    const sp = useSearchParams();
    const [email, setEmail] = React.useState('');
    const [digits, setDigits] = React.useState<string[]>(Array(6).fill(''));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const [info, setInfo] = React.useState('');
    const [cooldown, setCooldown] = React.useState(0);
    const [verified, setVerified] = React.useState<{ role?: string } | null>(null);
    const refs = React.useRef<(HTMLInputElement | null)[]>([]);

    React.useEffect(() => {
        let e = sp.get('email') || '';
        try { e = e || sessionStorage.getItem('atl_verify_email') || ''; } catch { /* ignore */ }
        setEmail(e);
        // Honest + non-revealing: a new address gets a code; an address that already
        // has an account gets a sign-in notice instead (no code).
        if (sp.get('sent') === '1') { setInfo(`If ${e} is new to Atlantis, a 6-digit code is on its way (valid 15 minutes). If it already has an account, we emailed a sign-in reminder instead — no code is sent.`); setCooldown(60); }
        if (sp.get('sent') === 'failed') setError(`We couldn’t send the email to ${e} just now. Check the address, then use “Resend code”.`);
        refs.current[0]?.focus();
    }, [sp]);
    React.useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const code = digits.join('');
    const setDigit = (i: number, v: string) => {
        const clean = v.replace(/\D/g, '');
        if (clean.length > 1) { // paste of the whole code
            const arr = clean.slice(0, 6).split('');
            setDigits(Array.from({ length: 6 }, (_, k) => arr[k] ?? ''));
            refs.current[Math.min(5, arr.length)]?.focus();
            return;
        }
        setDigits((d) => d.map((x, k) => (k === i ? clean : x)));
        if (clean && i < 5) refs.current[i + 1]?.focus();
    };

    const submit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (busy) return;
        if (!EMAIL_RE.test(email.trim())) { setError('Enter the email you registered with.'); return; }
        if (!/^\d{6}$/.test(code)) { setError('Enter all 6 digits.'); return; }
        setBusy(true); setError(''); setInfo('');
        try {
            const res = await apiFetch('/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), code }) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(typeof body?.message === 'string' ? body.message : 'That code didn’t work. Try again.');
                if (body?.code === 'CODE_EXPIRED' || body?.code === 'TOO_MANY_ATTEMPTS') setDigits(Array(6).fill(''));
                return;
            }
            try { sessionStorage.removeItem('atl_verify_email'); } catch { /* ignore */ }
            setVerified({ role: body?.role });
        } catch { setError('We couldn’t reach Atlantis. Check your connection and try again.'); }
        finally { setBusy(false); }
    };

    const resend = async () => {
        if (cooldown > 0 || busy) return;
        if (!EMAIL_RE.test(email.trim())) { setError('Enter the email you registered with.'); return; }
        setError(''); setInfo('');
        try {
            const res = await apiFetch('/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
            const body = await res.json().catch(() => ({}));
            if (res.status === 429) { setError('Too many requests. Wait a minute and try again.'); setCooldown(60); return; }
            if (body?.deliveryFailed) { setError('We couldn’t send the email just now. Try again in a moment.'); setCooldown(0); return; }
            setCooldown(Number(body?.retryAfter) || 60);
            // Same message whether or not the address has an unverified account.
            setInfo(`If ${email.trim()} has an account waiting for verification, a new code is on its way. Codes expire after 15 minutes.`);
            setDigits(Array(6).fill('')); refs.current[0]?.focus();
        } catch { setError('We couldn’t reach Atlantis. Check your connection and try again.'); }
    };

    if (verified) {
        return (
            <AuthShell>
                <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-6 sm:p-8 motion-safe:animate-[atl-toast-in_220ms_ease-out]">
                    <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><CheckCircle2 size={24} /></span>
                    <h1 className="mt-5 text-[22px] leading-tight font-semibold text-heading">Email verified</h1>
                    <p className="mt-2 text-[14.5px] text-ink-2">Thanks — your email is confirmed. Our team now reviews new {verified.role === 'SUPPLIER' ? 'supplier' : 'business'} accounts; we’ll email you once yours is approved.</p>
                    <p className="mt-2 text-[13.5px] text-ink-3">You can sign in now to check your status.</p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-2">
                        <Link href="/auth/login" className={authPrimary}>Sign in</Link>
                        <Link href="/categories" className="h-11 px-4 inline-flex items-center justify-center rounded-xl ring-1 ring-line-strong text-[14.5px] font-semibold text-ink hover:bg-surface-2 sm:w-auto w-full">Browse the catalog</Link>
                    </div>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell>
            <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-6 sm:p-8">
                <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><MailCheck size={23} /></span>
                <h1 className="mt-5 text-[22px] leading-tight font-semibold text-heading">Check your inbox</h1>
                <p className="mt-1.5 text-[14px] text-ink-3">Enter the 6-digit code we emailed you. Can’t find it? Check spam or promotions.</p>

                <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
                    <div>
                        <label htmlFor="v-email" className={authLabel}>Email</label>
                        <input id="v-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={authInput} />
                    </div>
                    <fieldset>
                        <legend className={authLabel}>Verification code</legend>
                        <div className="flex gap-2 justify-between" onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/\d{6}/.test(t)) { e.preventDefault(); setDigit(0, t); } }}>
                            {digits.map((d, i) => (
                                <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6}
                                    aria-label={`Digit ${i + 1}`}
                                    onChange={(e) => setDigit(i, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }}
                                    className={cn(authInput, 'w-full max-w-[52px] h-12 px-0 text-center text-[20px] font-semibold tabular-nums')} />
                            ))}
                        </div>
                    </fieldset>
                    {error && <FormAlert>{error}</FormAlert>}
                    {info && !error && <FormAlert tone="info">{info}</FormAlert>}
                    <button type="submit" disabled={busy} className={authPrimary}>{busy ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : 'Verify email'}</button>
                </form>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
                    <button type="button" onClick={resend} disabled={cooldown > 0} className="font-semibold text-teal hover:underline disabled:text-ink-4 disabled:no-underline">
                        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                    </button>
                    <Link href="/auth/register" className="text-ink-3 hover:text-ink">Wrong email? Start again</Link>
                </div>
            </div>
        </AuthShell>
    );
}

export default function VerifyEmailPage() {
    return <React.Suspense fallback={null}><VerifyEmail /></React.Suspense>;
}
