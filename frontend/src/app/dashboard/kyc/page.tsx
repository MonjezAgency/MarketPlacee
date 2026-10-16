'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck, Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Identity verification. Online document/biometric checks aren't connected
 * (the previous screen simulated a result at random), so this page says so
 * plainly. The KYC API exists without a buyer/supplier screen — see the gap
 * register.
 */
export default function KycPage() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const role = (user?.role || '').toUpperCase();
    const dashboardHref = ['ADMIN', 'OWNER', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'].includes(role) ? '/admin'
        : role === 'SUPPLIER' ? '/supplier' : '/dashboard/customer';
    return (
        <main data-no-translate className="min-h-[70vh] bg-surface text-start">
            <div className="mx-auto max-w-xl px-4 sm:px-6 py-16">
                <span className="w-12 h-12 rounded-2xl bg-teal-soft text-teal flex items-center justify-center" aria-hidden><ShieldCheck size={22} /></span>
                <h1 className="mt-5 font-sans text-[26px] font-semibold text-heading">{t('kyc', 'title')}</h1>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{t('kyc', 'body')}</p>
                <div className="mt-8 flex flex-wrap gap-2">
                    <a href="mailto:Info@atlantisfmcg.com" className="h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-cta hover:bg-cta-hover text-cta-fg text-[14px] font-semibold"><Mail size={15} aria-hidden /> {t('kyc', 'contact')}</a>
                    <Link href={dashboardHref} className="h-11 px-5 inline-flex items-center gap-2 rounded-xl ring-1 ring-line-strong text-[14px] font-semibold text-ink hover:ring-ink"><ArrowLeft size={15} className="rtl:rotate-180" aria-hidden /> {t('kyc', 'back')}</Link>
                </div>
            </div>
        </main>
    );
}
