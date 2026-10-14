'use client';

import * as React from 'react';
import { ShieldCheck, Loader2, Mail, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Step-up confirmation for sensitive actions. When the server answers
 * 403 { code: 'STEP_UP_REQUIRED', required: ['totp', 'email'?] }, a dialog asks
 * for the authenticator code (or a backup code) and, for money actions, an
 * email code — then the same request is retried with x-2fa-code / x-email-code.
 */
type Ask = { required: string[]; message: string; resolve: (c: { totp: string; email?: string } | null) => void };
let open: ((a: Ask) => void) | null = null;

function ask(required: string[], message: string) {
    return new Promise<{ totp: string; email?: string } | null>((resolve) => {
        if (!open) { resolve(null); return; }
        open({ required, message, resolve });
    });
}

export async function withStepUp(doFetch: (headers: Record<string, string>) => Promise<Response>): Promise<Response> {
    let res = await doFetch({});
    for (let attempt = 0; attempt < 4 && res.status === 403; attempt++) {
        const body = await res.clone().json().catch(() => null);
        if (body?.code !== 'STEP_UP_REQUIRED') return res;
        const codes = await ask(body.required || ['totp'], body.message || 'Confirm this action.');
        if (!codes) return res;
        res = await doFetch({ 'x-2fa-code': codes.totp, ...(codes.email ? { 'x-email-code': codes.email } : {}) });
    }
    return res;
}

/** Mounted once in the root layout. */
export function StepUpDialog() {
    const [a, setA] = React.useState<Ask | null>(null);
    const [totp, setTotp] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [sending, setSending] = React.useState(false);
    const [sent, setSent] = React.useState('');
    React.useEffect(() => { open = (x) => { setA(x); setTotp(''); setEmail(''); setSent(''); }; return () => { open = null; }; }, []);
    if (!a) return null;
    const needEmail = a.required.includes('email');
    const close = (v: { totp: string; email?: string } | null) => { a.resolve(v); setA(null); };
    const sendEmail = async () => {
        setSending(true); setSent('');
        const r = await apiFetch('/auth/email-otp/send', { method: 'POST' }).catch(() => null);
        setSent(r?.ok ? 'Code sent — check your inbox.' : 'Couldn’t send the code. Try again in a minute.');
        setSending(false);
    };
    const ready = totp.trim().length >= 6 && (!needEmail || /^\d{6}$/.test(email.trim()));
    const input = 'w-full h-11 px-3.5 rounded-xl ring-1 ring-line bg-surface text-[16px] tracking-[0.25em] font-semibold text-ink outline-none focus:ring-2 focus:ring-[#2EC4B6] text-center';
    return (
        <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-4 text-start" role="dialog" aria-modal="true" aria-labelledby="stepup-title">
            <button type="button" aria-label="Cancel" onClick={() => close(null)} className="absolute inset-0 bg-[rgba(15,23,42,0.5)]" />
            <form onSubmit={(e) => { e.preventDefault(); if (ready) close({ totp: totp.trim(), email: needEmail ? email.trim() : undefined }); }}
                className="relative w-full sm:max-w-[420px] rounded-t-2xl sm:rounded-2xl bg-surface ring-1 ring-line shadow-[0_24px_60px_rgba(15,23,42,0.25)] p-5">
                <div className="flex items-start gap-3">
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-teal-soft text-teal flex items-center justify-center"><ShieldCheck size={19} /></span>
                    <div className="flex-1 min-w-0">
                        <h2 id="stepup-title" className="text-[16px] font-semibold text-heading">Confirm it’s you</h2>
                        <p className="text-[13px] text-ink-3">{a.message}</p>
                    </div>
                    <button type="button" onClick={() => close(null)} aria-label="Cancel" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:bg-surface-2"><X size={16} /></button>
                </div>
                <div className="mt-4 space-y-3">
                    <label className="block">
                        <span className="block text-[13px] font-medium text-ink-2 mb-1.5">Authenticator app code</span>
                        <input autoFocus value={totp} onChange={(e) => setTotp(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={input} />
                        <span className="block mt-1 text-[11.5px] text-ink-4">Or one of your 8-character backup codes.</span>
                    </label>
                    {needEmail && (
                        <label className="block">
                            <span className="flex items-center justify-between text-[13px] font-medium text-ink-2 mb-1.5">Email code
                                <button type="button" onClick={sendEmail} disabled={sending} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-teal hover:underline disabled:opacity-50">
                                    {sending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Send code
                                </button>
                            </span>
                            <input value={email} onChange={(e) => setEmail(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="123456" className={input} />
                            {sent && <span className="block mt-1 text-[12px] text-ink-3">{sent}</span>}
                        </label>
                    )}
                </div>
                <div className="mt-5 flex gap-2">
                    <button type="button" onClick={() => close(null)} className="h-11 px-4 rounded-xl ring-1 ring-line-strong text-[14px] font-semibold text-ink hover:bg-surface-2">Cancel</button>
                    <button type="submit" disabled={!ready} className={cn('flex-1 h-11 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:opacity-50')}>Confirm</button>
                </div>
            </form>
        </div>
    );
}
