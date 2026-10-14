'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, MailCheck, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

/** Double opt-in landing: activates the subscription only when the user presses Confirm. */
function Confirm() {
    const token = useSearchParams().get('token') || '';
    const [state, setState] = React.useState<'ready' | 'busy' | 'done' | 'error'>(token ? 'ready' : 'error');
    const [msg, setMsg] = React.useState(token ? '' : 'This confirmation link is incomplete.');
    const confirm = async () => {
        setState('busy');
        try {
            const res = await apiFetch('/newsletter/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(d?.message || 'We couldn’t confirm your subscription.');
            setState('done'); setMsg(`You’re subscribed${d?.email ? ` as ${d.email}` : ''}.`);
        } catch (e: any) { setState('error'); setMsg(e.message); }
    };
    return (
        <main className="min-h-[60vh] flex items-center justify-center px-4 py-16 text-start">
            <div className="w-full max-w-[460px] rounded-2xl bg-surface ring-1 ring-line p-6">
                {state === 'done' ? <MailCheck className="text-teal" size={26} /> : state === 'error' ? <AlertCircle className="text-red-700" size={26} /> : <MailCheck className="text-ink-3" size={26} />}
                <h1 className="mt-3 text-[20px] font-semibold text-heading">{state === 'done' ? 'Subscription confirmed' : state === 'error' ? 'Couldn’t confirm' : 'Confirm your newsletter subscription'}</h1>
                <p className="mt-1.5 text-[14px] text-ink-2">{state === 'ready' || state === 'busy' ? 'Press confirm to start receiving the weekly Atlantis newsletter. You can unsubscribe at any time.' : msg}</p>
                {(state === 'ready' || state === 'busy') && (
                    <button onClick={confirm} disabled={state === 'busy'} className="mt-5 h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:opacity-60">
                        {state === 'busy' && <Loader2 size={15} className="animate-spin" />} Confirm subscription
                    </button>
                )}
                <p className="mt-5 text-[13px]"><Link href="/" className="text-teal hover:underline">Back to Atlantis</Link></p>
            </div>
        </main>
    );
}
export default function Page() { return <React.Suspense fallback={null}><Confirm /></React.Suspense>; }
