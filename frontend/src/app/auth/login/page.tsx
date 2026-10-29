'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { AuthShell, authInput, authLabel, authPrimary, FormAlert } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';

const TEAM = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];
/** Only same-site paths may be used as a post-login destination. */
const safeRedirect = (r: string | null) => (r && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/auth') ? r : null);

function Login() {
    const router = useRouter();
    const sp = useSearchParams();
    const { login, verify2FALogin } = useAuth();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [showPw, setShowPw] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [slow, setSlow] = React.useState(false);
    const [error, setError] = React.useState('');
    const [unverified, setUnverified] = React.useState<string | null>(null);
    const [step, setStep] = React.useState<1 | 2>(1);
    const [partialToken, setPartialToken] = React.useState('');
    const [qrCodeUrl, setQrCodeUrl] = React.useState<string | null>(null);
    const [code2fa, setCode2fa] = React.useState('');

    // NextAuth sends cancelled/failed Google sign-ins back here with ?error=.
    const gErr = sp.get('error');
    const googleError = gErr ? (gErr === 'OAuthCallback' || gErr === 'Callback' || gErr === 'AccessDenied' ? 'Google sign-in was cancelled or didn’t complete. Try again, or sign in with email.' : 'Google sign-in didn’t work. Try again, or sign in with email.') : '';

    const go = (role: string) => {
        const upper = role.toUpperCase();
        const target = safeRedirect(sp.get('redirect'));
        if (TEAM.includes(upper)) window.location.href = '/admin';
        else if (target) window.location.href = target;
        else window.location.href = upper === 'SUPPLIER' ? '/supplier' : '/';
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setError(''); setUnverified(null);
        if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
        setBusy(true);
        const slowTimer = setTimeout(() => setSlow(true), 3000);
        try {
            const r = await login(email.trim(), password);
            if (r.requiresTwoFactor && r.partialToken) { setPartialToken(r.partialToken); setQrCodeUrl(r.qrCodeUrl ?? null); setStep(2); return; }
            if (!r.success) {
                if (r.code === 'EMAIL_NOT_VERIFIED') { setUnverified(r.email || email.trim()); return; }
                setError(r.message || 'Invalid email or password.');
                return;
            }
            if (!r.user?.role) { setError('Something went wrong. Please try again.'); return; }
            go(r.user.role);
        } catch { setError('We couldn’t reach Ali FMCG. Check your connection and try again.'); }
        finally { clearTimeout(slowTimer); setSlow(false); setBusy(false); }
    };

    const submit2fa = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!/^\d{6}$/.test(code2fa)) { setError('Enter the 6-digit code from your authenticator app.'); return; }
        setBusy(true); setError('');
        try {
            const r = await verify2FALogin(partialToken, code2fa);
            if (!r.success) { setError(r.message || 'That code isn’t right.'); setCode2fa(''); return; }
            go(r.user!.role);
        } catch { setError('We couldn’t reach Ali FMCG. Check your connection and try again.'); }
        finally { setBusy(false); }
    };

    return (
        <AuthShell>
            <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-6 sm:p-8">
                {step === 1 ? (<>
                    <h1 className="text-[22px] leading-tight font-semibold text-heading">Sign in</h1>
                    <p className="mt-1 text-[14px] text-ink-3">Welcome back. Sign in to see wholesale prices and order.</p>
                    {googleError && <div className="mt-4"><FormAlert>{googleError}</FormAlert></div>}
                    <GoogleButton className="mt-5" />
                    <div className="mt-5 flex items-center gap-3 text-[12px] text-ink-4" aria-hidden><span className="flex-1 h-px bg-line" />or with email<span className="flex-1 h-px bg-line" /></div>
                    <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
                        <div>
                            <label htmlFor="l-email" className={authLabel}>Work email</label>
                            <input id="l-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className={authInput} autoFocus />
                        </div>
                        <div>
                            <div className="flex items-center justify-between">
                                <label htmlFor="l-password" className={authLabel}>Password</label>
                                <Link href="/auth/forgot-password" className="mb-1.5 text-[13px] font-semibold text-teal hover:underline">Forgot password?</Link>
                            </div>
                            <div className="relative">
                                <input id="l-password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={cn(authInput, 'pe-11')} />
                                <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-ink-3 hover:text-ink">{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                            </div>
                        </div>
                        {error && <FormAlert>{error}</FormAlert>}
                        {unverified && (
                            <FormAlert tone="info">
                                Your email isn’t verified yet. <Link href={`/auth/verify-email?email=${encodeURIComponent(unverified)}`} className="font-semibold text-teal hover:underline">Enter your code or get a new one</Link>.
                            </FormAlert>
                        )}
                        <button type="submit" disabled={busy} className={authPrimary}>
                            {busy ? <><Loader2 size={16} className="animate-spin" /> {slow ? 'Waking up the server…' : 'Signing in…'}</> : 'Sign in'}
                        </button>
                    </form>
                    <p className="mt-6 text-[14px] text-ink-3">New to Ali FMCG? <Link href="/auth/register" className="font-semibold text-teal hover:underline">Create a business account</Link></p>
                </>) : (<>
                    <button type="button" onClick={() => { setStep(1); setError(''); setCode2fa(''); setPartialToken(''); setQrCodeUrl(null); }} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink"><ArrowLeft size={14} /> Back</button>
                    <span className="mt-4 w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><KeyRound size={22} /></span>
                    <h1 className="mt-4 text-[22px] leading-tight font-semibold text-heading">Two-step verification</h1>
                    <p className="mt-1 text-[14px] text-ink-3">Enter the 6-digit code from your authenticator app.</p>
                    {qrCodeUrl && (
                        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl ring-1 ring-line p-4">
                            <p className="text-[13px] text-ink-2">Scan with your authenticator app</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={qrCodeUrl} alt="Two-step verification QR code" className="w-40 h-40 rounded-lg bg-white p-2" />
                        </div>
                    )}
                    <form className="mt-5 space-y-4" onSubmit={submit2fa} noValidate>
                        <div>
                            <label htmlFor="l-2fa" className={authLabel}>Code</label>
                            <input id="l-2fa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code2fa} onChange={(e) => setCode2fa(e.target.value.replace(/\D/g, ''))} className={cn(authInput, 'h-12 text-center text-[20px] tracking-[0.4em] font-semibold')} />
                        </div>
                        {error && <FormAlert>{error}</FormAlert>}
                        <button type="submit" disabled={busy || code2fa.length < 6} className={authPrimary}>{busy ? <Loader2 size={16} className="animate-spin" /> : 'Verify and sign in'}</button>
                    </form>
                </>)}
            </div>
        </AuthShell>
    );
}

export default function LoginPage() {
    return <React.Suspense fallback={null}><Login /></React.Suspense>;
}
