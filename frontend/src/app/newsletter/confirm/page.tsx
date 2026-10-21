'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, MailCheck, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';

/** Double opt-in landing: activates the subscription only when the user presses Confirm. */
function Confirm() {
    const { t } = useLanguage();
    const tu = (k: string, v?: Record<string, string | number>) => t('adminNewsletter', `pub_${k}`, v);
    const token = useSearchParams().get('token') || '';
    const [state, setState] = React.useState<'ready' | 'busy' | 'done' | 'error'>(token ? 'ready' : 'error');
    const [msg, setMsg] = React.useState(token ? '' : tu('confirmIncomplete'));
    const [masked, setMasked] = React.useState<string | null>(null);
    const confirm = async () => {
        setState('busy');
        try {
            const res = await apiFetch('/newsletter/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(res.status === 400 ? tu('confirmInvalid') : tu('confirmFailed'));
            setMasked(d?.email || null); setState('done');
        } catch (e: any) { setState('error'); setMsg(e?.message || tu('confirmFailed')); }
    };
    return (
        <main className="min-h-[60vh] flex items-center justify-center px-4 py-16 text-start">
            <div className="w-full max-w-[460px] rounded-2xl bg-surface ring-1 ring-line p-6">
                {state === 'done' ? <MailCheck className="text-teal" size={26} aria-hidden /> : state === 'error' ? <AlertCircle className="text-red-700" size={26} aria-hidden /> : <MailCheck className="text-ink-3" size={26} aria-hidden />}
                <h1 className="mt-3 font-sans text-[20px] font-semibold text-heading">{state === 'done' ? tu('confirmDoneTitle') : state === 'error' ? tu('confirmErrorTitle') : tu('confirmTitle')}</h1>
                <p className="mt-1.5 text-[14px] text-ink-2" role={state === 'done' || state === 'error' ? 'status' : undefined}>
                    {state === 'ready' || state === 'busy' ? tu('confirmLead') : state === 'done' ? (masked ? tu('confirmDoneEmail', { email: masked }) : tu('confirmDone')) : msg}
                </p>
                {(state === 'ready' || state === 'busy') && (
                    <button onClick={confirm} disabled={state === 'busy'} className="mt-5 h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2EC4B6] focus-visible:ring-offset-2">
                        {state === 'busy' && <Loader2 size={15} className="animate-spin" aria-hidden />} {tu('confirmButton')}
                    </button>
                )}
                <p className="mt-5 text-[13px]"><Link href="/" className="text-teal font-medium hover:underline">{tu('back')}</Link></p>
            </div>
        </main>
    );
}
export default function Page() { return <React.Suspense fallback={null}><Confirm /></React.Suspense>; }
