'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Locale } from '../locales';
import { setAutoTranslateLocale } from '../lib/auto-translate';

interface LanguageContextType {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (section: keyof typeof translations['en'], key?: string) => string;
    dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>('en');

    useEffect(() => {
        const applyLocale = (initial: Locale) => {
            if (initial !== locale) setLocaleState(initial);
            try {
                document.documentElement.dir = initial === 'ar' ? 'rtl' : 'ltr';
                document.documentElement.lang = initial;
            } catch {}
            setTimeout(() => {
                try { setAutoTranslateLocale(initial); } catch (err) {
                    console.warn('[i18n] auto-translate boot failed:', err);
                }
            }, 0);
        };

        try {
            let initial: Locale = 'en';
            try {
                const saved = localStorage.getItem('app-locale') as Locale;
                if (saved && translations[saved]) initial = saved;
            } catch {}
            applyLocale(initial);
        } catch (err) {
            console.warn('[i18n] init failed:', err);
        }

        // Listen for the auth-change event the cart context already
        // dispatches. When a different user logs in we reset locale
        // to English so a previous browser session's choice doesn't
        // bleed into the new user's experience. The new user can
        // still pick their language from the navbar dropdown — and
        // their choice persists to localStorage from that point.
        const onAuthChanged = () => {
            try {
                const saved = localStorage.getItem('app-locale') as Locale;
                // We only reset when there's NO explicit pref saved.
                // Because the user picker writes to localStorage on
                // every change, "no saved value" effectively means
                // "fresh session / different user".
                if (!saved || !translations[saved]) {
                    applyLocale('en');
                }
            } catch {}
        };
        window.addEventListener('bev-auth-changed', onAuthChanged);
        return () => window.removeEventListener('bev-auth-changed', onAuthChanged);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setLocale = (newLocale: Locale) => {
        setLocaleState(newLocale);
        try { localStorage.setItem('app-locale', newLocale); } catch {}
        try {
            document.documentElement.dir = newLocale === 'ar' ? 'rtl' : 'ltr';
            document.documentElement.lang = newLocale;
        } catch {}
        try { setAutoTranslateLocale(newLocale); } catch (err) {
            console.warn('[i18n] locale switch failed:', err);
        }
    };

    const t = (section: keyof typeof translations['en'], key?: string) => {
        const dict = translations[locale] || translations['en'];
        const sectionDict = dict[section] as Record<string, unknown>;
        if (!key) return (sectionDict as unknown as string) || '';

        const resolveKey = (d: Record<string, unknown>, k: string): string | undefined => {
            const parts = k.split('.');
            let current: any = d;
            for (const part of parts) {
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    return undefined;
                }
            }
            return typeof current === 'string' ? current : undefined;
        };

        const result = resolveKey(sectionDict, key);
        if (result !== undefined) return result;

        const fallbackResult = resolveKey(translations['en'][section], key);
        return fallbackResult !== undefined ? fallbackResult : key;
    };

    const dir = locale === 'ar' ? 'rtl' : 'ltr';

    return (
        <LanguageContext.Provider value={{ locale, setLocale, t, dir }}>
            <div dir={dir} lang={locale}>
                {children}
            </div>
        </LanguageContext.Provider>
    );
}

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) throw new Error('useLanguage must be used within LanguageProvider');
    return context;
};
