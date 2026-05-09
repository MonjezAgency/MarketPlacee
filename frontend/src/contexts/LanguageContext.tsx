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
        const saved = localStorage.getItem('app-locale') as Locale;
        const initial = saved && translations[saved] ? saved : 'en';
        if (initial !== locale) setLocaleState(initial);
        // Fire the runtime auto-translator on initial mount so any
        // hardcoded English on the marketing pages is converted to
        // the user's saved locale immediately, without waiting for
        // them to re-pick the language.
        document.documentElement.dir = initial === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = initial;
        // Defer to next tick so React has a chance to mount the page.
        setTimeout(() => setAutoTranslateLocale(initial), 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setLocale = (newLocale: Locale) => {
        setLocaleState(newLocale);
        localStorage.setItem('app-locale', newLocale);
        document.documentElement.dir = newLocale === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = newLocale;
        // Trigger the DOM-walking translator. It will swap every
        // visible English string into the new locale (or restore
        // English if the user picked en).
        setAutoTranslateLocale(newLocale);
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
