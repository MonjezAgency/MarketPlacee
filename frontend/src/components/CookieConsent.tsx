'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Trans } from '@/components/i18n/Trans';

const STORAGE_KEY = 'atlantis-cookie-consent';

export function CookieConsent() {
    const { t } = useLanguage();
    const tc = (k: string) => t('cookieBanner', k);
    const reduce = useReducedMotion();
    const [visible, setVisible] = React.useState(false);

    // Storage can throw (private mode, blocked site data): show the notice, never crash.
    React.useEffect(() => {
        let val: string | null = null;
        try { val = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
        if (!val) setVisible(true);
    }, []);

    const choose = (value: 'accepted' | 'declined') => {
        try { localStorage.setItem(STORAGE_KEY, value); } catch { /* storage unavailable */ }
        setVisible(false);
    };
    const accept = () => choose('accepted');
    const decline = () => choose('declined');

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: reduce ? 0 : 80 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduce ? 0 : 80 }}
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 25 }}
                    role="region"
                    aria-label={tc('region')}
                    className="fixed bottom-4 start-4 end-4 md:start-auto md:end-6 md:bottom-6 md:max-w-md z-[9999] text-start"
                >
                    <div className="bg-[#0A1A2F] text-white rounded-2xl shadow-2xl p-5 border border-white/10">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-teal-soft flex items-center justify-center shrink-0 mt-0.5">
                                <Cookie size={18} className="text-teal" />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-white mb-1.5">{tc('title')}</p>
                                <p className="text-xs text-white/70 leading-relaxed">
                                    <Trans text={tc('body')} tags={{ link: (c) => <Link href="/cookie-policy" className="text-teal hover:underline font-bold">{c}</Link> }} />
                                </p>
                            </div>
                            <button
                                onClick={decline}
                                className="shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors ms-auto"
                                aria-label={tc('dismiss')}
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={decline}
                                className="flex-1 py-2.5 rounded-xl border border-white/20 text-xs font-bold text-white/70 hover:bg-white/10 transition-colors"
                            >
                                {tc('decline')}
                            </button>
                            <button
                                onClick={accept}
                                className="flex-1 py-2.5 rounded-xl bg-cta text-cta-fg text-xs font-bold hover:bg-cta-hover transition-colors"
                            >
                                {tc('accept')}
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
