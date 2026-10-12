'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';

const STORAGE_KEY = 'atlantis-cookie-consent';

export function CookieConsent() {
    const [visible, setVisible] = React.useState(false);

    React.useEffect(() => {
        const val = localStorage.getItem(STORAGE_KEY);
        if (!val) setVisible(true);
    }, []);

    const accept = () => {
        localStorage.setItem(STORAGE_KEY, 'accepted');
        setVisible(false);
    };

    const decline = () => {
        localStorage.setItem(STORAGE_KEY, 'declined');
        setVisible(false);
    };

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: 80 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 80 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                    className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-md z-[9999]"
                >
                    <div className="bg-[#0A1A2F] text-white rounded-2xl shadow-2xl p-5 border border-white/10">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-teal-soft flex items-center justify-center shrink-0 mt-0.5">
                                <Cookie size={18} className="text-teal" />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-white mb-1.5">This website uses cookies</p>
                                <p className="text-xs text-white/70 leading-relaxed">
                                    We use cookies to improve platform functionality and your in-app experiences.
                                    You may review our{' '}
                                    <Link href="/cookie-policy" className="text-teal hover:underline font-bold">
                                        Cookie Policy
                                    </Link>{' '}
                                    and accept the default settings.
                                </p>
                            </div>
                            <button
                                onClick={decline}
                                className="shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors ml-auto"
                                aria-label="Dismiss"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={decline}
                                className="flex-1 py-2.5 rounded-xl border border-white/20 text-xs font-bold text-white/70 hover:bg-white/10 transition-colors"
                            >
                                Decline
                            </button>
                            <button
                                onClick={accept}
                                className="flex-1 py-2.5 rounded-xl bg-cta text-cta-fg text-xs font-bold hover:bg-cta-hover transition-colors"
                            >
                                Accept All Cookies
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
