'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, MailCheck, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Privacy notice version recorded with each consent. Bump when the text changes. */
export const NEWSLETTER_POLICY_VERSION = '2026-10';

/**
 * Footer newsletter sign-up. Marketing consent is an explicit, unticked
 * checkbox; the address becomes active only after the confirmation email
 * (double opt-in). Order and account emails are a separate setting.
 */
export default function NewsletterSignup({ source = 'footer' }: { source?: string }) {
    const [email, setEmail] = React.useState('');
    const [consent, setConsent] = React.useState(false);
    const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [message, setMessage] = React.useState('');
    const [fieldError, setFieldError] = React.useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFieldError('');
        const v = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { setFieldError('Enter a valid business email address.'); return; }
        if (!consent) { setFieldError('Tick the box to agree to receive the newsletter.'); return; }
        setState('sending'); setMessage('');
        try {
            const res = await fetch('/api/newsletter/subscribe', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: v, source, consent: true, policyVersion: NEWSLETTER_POLICY_VERSION }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof data?.message === 'string' ? data.message : 'We couldn’t sign you up right now. Please try again.');
            setState('sent'); setMessage(data?.message || 'Check your inbox and click the link to confirm your subscription.');
        } catch (err: any) {
            setState('error'); setMessage(err?.message || 'We couldn’t sign you up right now. Please try again.');
        }
    };

    if (state === 'sent') {
        return (
            <div role="status" className="w-full lg:max-w-[500px] rounded-2xl bg-surface ring-1 ring-line p-5 flex gap-3">
                <MailCheck size={22} className="text-teal shrink-0 mt-0.5" />
                <div>
                    <p className="text-[15px] font-semibold text-heading">Confirm your email</p>
                    <p className="mt-1 text-[14px] text-ink-2">{message} You’re not subscribed until you confirm.</p>
                    <button type="button" className="mt-2 text-[13px] font-semibold text-teal hover:underline" onClick={() => { setState('idle'); setEmail(''); setConsent(false); }}>Use a different email</button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={submit} noValidate className="w-full lg:max-w-[500px]" aria-describedby="nl-privacy">
            <div className={cn('flex h-14 bg-surface rounded-2xl p-1.5 ring-1 focus-within:ring-2 focus-within:ring-[#2EC4B6] transition-shadow', fieldError && !consent ? 'ring-line' : fieldError ? 'ring-red-300' : 'ring-line')}>
                <label htmlFor="newsletter-email" className="sr-only">Business email</label>
                <input id="newsletter-email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setFieldError(''); }}
                    placeholder="Enter your business email" aria-invalid={!!fieldError}
                    className="flex-1 min-w-0 bg-transparent outline-none px-4 text-[15px] text-ink placeholder:text-ink-4" />
                <button type="submit" disabled={state === 'sending'} className="px-5 sm:px-6 rounded-xl text-[14px] font-semibold bg-cta hover:bg-cta-hover text-cta-fg disabled:opacity-60 flex items-center gap-2 shrink-0">
                    {state === 'sending' && <Loader2 size={15} className="animate-spin" />} Subscribe
                </button>
            </div>
            <label className="mt-3 flex items-start gap-2.5 text-[13.5px] text-ink-2 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setFieldError(''); }} className="mt-0.5 w-4 h-4 accent-[#0E7C74] shrink-0" />
                <span>Yes, send me the weekly Atlantis newsletter — fresh arrivals, new offers and live availability.</span>
            </label>
            <p id="nl-privacy" className="mt-2 text-[12.5px] text-ink-3">
                Choose which updates you want to receive. Unsubscribe from marketing emails at any time. Order and account emails are managed separately in your <Link href="/dashboard/customer/settings" className="underline hover:text-ink">account settings</Link>.
            </p>
            {(fieldError || state === 'error') && <p role="alert" className="mt-2 text-[13px] text-red-700 flex items-center gap-1.5"><AlertCircle size={14} />{fieldError || message}</p>}
        </form>
    );
}
