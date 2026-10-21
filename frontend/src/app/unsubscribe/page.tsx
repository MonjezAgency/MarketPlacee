'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, MailX, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Unsubscribe from marketing emails (newsletter, campaigns and offer emails).
 * Order and account emails aren't affected. Marketing emails link here with a
 * random per-recipient token (no address in the link); the button press
 * records it, so link scanners can't unsubscribe anyone. Without a token the
 * person can enter their address. ?preview=1 comes from test emails.
 */
function Unsubscribe() {
    const { t } = useLanguage();
    const tu = (k: string, v?: Record<string, string | number>) => t('adminNewsletter', `pub_${k}`, v);
    const params = useSearchParams();
    const token = params.get('token') || '';
    const preview = params.get('preview') === '1';
    const [email, setEmail] = React.useState(params.get('email') || '');
    const [state, setState] = React.useState<'ready' | 'busy' | 'done' | 'error'>('ready');
    const [masked, setMasked] = React.useState<string | null>(null);
    const [msg, setMsg] = React.useState('');
    const submit = async (e: React.FormEvent) => {
        e.preventDefault(); setState('busy');
        try {
            const res = await apiFetch('/newsletter/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(token ? { token, method: 'LINK' } : { email: email.trim(), method: 'EMAIL_FORM' }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(res.status === 400 ? (token ? tu('invalidLink') : tu('invalidEmail')) : tu('failed'));
            setMasked(d?.email || null); setState('done');
        } catch (err: any) { setState('error'); setMsg(err?.message || tu('failed')); }
    };
    return (
        <main className="min-h-[60vh] flex items-center justify-center px-4 py-16 text-start">
            <form onSubmit={submit} className="w-full max-w-[460px] rounded-2xl bg-surface ring-1 ring-line p-6">
                {preview ? <Info size={26} className="text-ink-3" aria-hidden /> : state === 'done' ? <CheckCircle2 size={26} className="text-teal" aria-hidden /> : <MailX size={26} className="text-ink-3" aria-hidden />}
                <h1 className="mt-3 font-sans text-[20px] font-semibold text-heading">{preview ? tu('previewTitle') : state === 'done' ? tu('doneTitle') : tu('title')}</h1>
                {preview ? <p className="mt-1.5 text-[14px] text-ink-2">{tu('previewBody')}</p> : state === 'done' ? (
                    <div role="status" className="mt-1.5 space-y-2 text-[14px] text-ink-2">
                        <p>{masked ? tu('doneBodyEmail', { email: masked }) : tu('doneBody')}</p>
                        <p>{tu('doneTransactional')}</p>
                        <p className="text-[13px] text-ink-3">{tu('doneResubscribe')}</p>
                    </div>
                ) : (
                    <>
                        <p className="mt-1.5 text-[14px] text-ink-2">{tu('lead')}</p>
                        {!token && (
                            <div className="mt-4">
                                <label htmlFor="unsub-email" className="block mb-1.5 text-[13px] font-medium text-ink-2">{tu('emailLabel')}</label>
                                <input id="unsub-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-11 px-3 rounded-xl ring-1 ring-inset ring-line-strong bg-surface text-[14px] outline-none focus:ring-2 focus:ring-teal" />
                            </div>
                        )}
                        {state === 'error' && <p role="alert" className="mt-3 text-[13px] text-red-700 flex items-center gap-1.5"><AlertCircle size={14} aria-hidden />{msg}</p>}
                        <button type="submit" disabled={state === 'busy'} className="mt-5 h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2">
                            {state === 'busy' && <Loader2 size={15} className="animate-spin" aria-hidden />} {tu('button')}
                        </button>
                    </>
                )}
                <p className="mt-5 text-[13px]"><Link href="/" className="text-teal font-medium hover:underline">{tu('back')}</Link></p>
            </form>
        </main>
    );
}
export default function Page() { return <React.Suspense fallback={null}><Unsubscribe /></React.Suspense>; }
