'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, MailX, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/**
 * Unsubscribe from marketing emails (newsletter + offer emails). Order and
 * account emails aren't affected. Works with the per-subscriber token in
 * newsletters, or the address in older emails.
 */
function Unsubscribe() {
    const params = useSearchParams();
    const token = params.get('token') || '';
    const [email, setEmail] = React.useState(params.get('email') || '');
    const [state, setState] = React.useState<'ready' | 'busy' | 'done' | 'error'>('ready');
    const [msg, setMsg] = React.useState('');
    const submit = async (e: React.FormEvent) => {
        e.preventDefault(); setState('busy');
        try {
            const res = await apiFetch('/newsletter/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(token ? { token } : { email: email.trim() }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d?.message || 'We couldn’t unsubscribe you. Please try again.');
            setState('done'); setMsg(d?.email ? `${d.email} won’t receive marketing emails from Atlantis any more.` : 'You won’t receive marketing emails from Atlantis any more.');
        } catch (err: any) { setState('error'); setMsg(err.message); }
    };
    return (
        <main className="min-h-[60vh] flex items-center justify-center px-4 py-16 text-start">
            <form onSubmit={submit} className="w-full max-w-[460px] rounded-2xl bg-surface ring-1 ring-line p-6">
                {state === 'done' ? <CheckCircle2 size={26} className="text-teal" /> : <MailX size={26} className="text-ink-3" />}
                <h1 className="mt-3 text-[20px] font-semibold text-heading">{state === 'done' ? 'You’re unsubscribed' : 'Unsubscribe from marketing emails'}</h1>
                {state === 'done' ? <p className="mt-1.5 text-[14px] text-ink-2">{msg} Order and account emails still reach you; manage them in your account settings.</p> : (
                    <>
                        <p className="mt-1.5 text-[14px] text-ink-2">Stop the Atlantis newsletter and offer emails. Order and account emails aren’t affected.</p>
                        {!token && (
                            <div className="mt-4">
                                <label htmlFor="unsub-email" className="block mb-1.5 text-[13px] font-medium text-ink-2">Email address</label>
                                <input id="unsub-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-11 px-3 rounded-xl ring-1 ring-inset ring-line-strong bg-surface text-[14px] outline-none focus:ring-2 focus:ring-teal" />
                            </div>
                        )}
                        {state === 'error' && <p role="alert" className="mt-3 text-[13px] text-red-700 flex items-center gap-1.5"><AlertCircle size={14} />{msg}</p>}
                        <button type="submit" disabled={state === 'busy'} className="mt-5 h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:opacity-60">
                            {state === 'busy' && <Loader2 size={15} className="animate-spin" />} Unsubscribe
                        </button>
                    </>
                )}
                <p className="mt-5 text-[13px]"><Link href="/" className="text-teal hover:underline">Back to Atlantis</Link></p>
            </form>
        </main>
    );
}
export default function Page() { return <React.Suspense fallback={null}><Unsubscribe /></React.Suspense>; }
