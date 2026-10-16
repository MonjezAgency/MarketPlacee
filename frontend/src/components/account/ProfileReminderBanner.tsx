'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { needsProfile, missingProfileFields } from '@/lib/profile-completion';
import { useLanguage } from '@/contexts/LanguageContext';

/** Persistent, dismissible (per tab session) nudge for accounts with an unfinished business profile. Never redirects. */
export function ProfileReminderBanner() {
    const { user } = useAuth();
    const pathname = usePathname() || '';
    const { t } = useLanguage();
    const [hidden, setHidden] = React.useState(true);
    React.useEffect(() => { try { setHidden(sessionStorage.getItem('atl_profile_banner_hidden') === '1'); } catch { setHidden(false); } }, []);
    if (!needsProfile(user) || hidden || pathname.startsWith('/auth')) return null;
    const n = missingProfileFields(user).length;
    return (
        <div role="region" data-no-translate aria-label={t('profileBanner', 'title')} className="bg-teal-soft border-b border-line">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 text-start">
                <ClipboardList size={17} className="text-teal shrink-0" />
                <p className="flex-1 min-w-0 text-[13.5px] text-ink">
                    <span className="font-semibold">{t('profileBanner', 'title')}</span>
                    <span className="text-ink-2"> — {t('profileBanner', 'left', { count: n })}</span>
                </p>
                <Link href="/auth/complete-profile" className="shrink-0 h-8 px-3 inline-flex items-center rounded-lg bg-cta hover:bg-cta-hover text-cta-fg text-[13px] font-semibold">{t('profileBanner', 'complete')}</Link>
                <button type="button" aria-label={t('profileBanner', 'dismiss')} onClick={() => { setHidden(true); try { sessionStorage.setItem('atl_profile_banner_hidden', '1'); } catch { /* ignore */ } }} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-ink"><X size={16} /></button>
            </div>
        </div>
    );
}
