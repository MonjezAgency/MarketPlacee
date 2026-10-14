'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldAlert, ShieldCheck, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Two-step status at a glance: red until it's on, green when it is. */
export function TwoStepCard() {
    const [on, setOn] = React.useState<boolean | null>(null);
    React.useEffect(() => {
        apiFetch('/auth/2fa/status').then((r) => (r.ok ? r.json() : null)).then((d) => setOn(d ? !!d.twoFactorEnabled : null)).catch(() => setOn(null));
    }, []);
    const off = on === false;
    return (
        <section className={cn('rounded-2xl ring-1 p-5 transition-colors',
            on ? 'ring-[#2EC4B6]/50 bg-teal-soft/50' : off ? 'ring-[#FCA5A5] bg-[#FEF2F2] dark:bg-red-500/10 dark:ring-red-500/40' : 'ring-line bg-surface')}>
            <div className="flex items-start gap-3">
                <span className={cn('w-10 h-10 shrink-0 rounded-xl flex items-center justify-center', on ? 'bg-[#0E7C74] text-white' : off ? 'bg-[#DC2626] text-white' : 'bg-teal-soft text-teal')}>
                    {off ? <ShieldAlert size={19} /> : <ShieldCheck size={19} />}
                </span>
                <div className="flex-1 min-w-0">
                    <h2 className="text-[16px] font-semibold text-heading flex flex-wrap items-center gap-2">
                        Two-step verification
                        {on !== null && <span className={cn('text-[11.5px] font-semibold px-2 py-0.5 rounded-md', on ? 'bg-[#0E7C74] text-white' : 'bg-[#DC2626] text-white')}>{on ? 'On' : 'Off'}</span>}
                    </h2>
                    <p className={cn('text-[13px]', off ? 'text-[#991B1B] dark:text-red-300' : 'text-ink-3')}>
                        {on ? 'Your account asks for an authenticator code at sign-in, and to confirm orders, password and email changes.'
                            : off ? 'Not protected yet. Turn it on so sign-ins, orders and account changes need a code from your phone.'
                                : 'Add a code from an authenticator app when you sign in.'}
                    </p>
                    <Link href="/dashboard/security" className={cn('mt-3 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold',
                        off ? 'bg-[#DC2626] hover:bg-[#B91C1C] text-white' : 'ring-1 ring-line-strong text-ink hover:bg-surface')}>
                        {off ? 'Turn on two-step verification' : 'Manage two-step verification'} <ArrowRight size={14} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
