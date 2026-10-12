'use client';

import { Clock3, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AuthShell, authPrimary } from '@/components/auth/AuthShell';

/** Signed in, email verified, waiting for the Atlantis team to approve the account. */
export default function PendingPage() {
    const { user, logout } = useAuth();
    const rejected = user?.status === 'REJECTED' || user?.status === 'BLOCKED';
    return (
        <AuthShell>
            <div className="rounded-2xl bg-surface ring-1 ring-line shadow-[0_12px_32px_rgba(15,23,42,0.06)] p-6 sm:p-8">
                <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center"><Clock3 size={23} /></span>
                <h1 className="mt-4 text-[22px] leading-tight font-semibold text-heading">{rejected ? 'Account not active' : 'Your account is being reviewed'}</h1>
                <p className="mt-2 text-[14.5px] text-ink-2">
                    {rejected
                        ? 'This account can’t trade on Atlantis right now. Contact us if you think this is a mistake.'
                        : `Thanks${user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Our team reviews every new business account before trading starts — we’ll email ${user?.email || 'you'} when it’s approved.`}
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-2">
                    <a href="mailto:Info@atlantisfmcg.com" className={authPrimary}>Contact Atlantis</a>
                </div>
                <button type="button" onClick={async () => { await logout(); window.location.href = '/auth/login'; }} className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink"><LogOut size={14} /> Sign out</button>
            </div>
        </AuthShell>
    );
}
