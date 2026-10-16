'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translations, LOCALE_META, DEFAULT_LOCALE, isLocale, type Locale, type LocaleMeta, type Messages } from '../locales';
import { formatMessage, type Vars } from '../locales/format';
import { setAutoTranslateLocale } from '../lib/auto-translate';

/** Where the chosen language is kept (read again before first paint by the script in app/layout.tsx). */
export const LOCALE_STORAGE_KEY = 'app-locale';

type Section = keyof Messages;

interface LanguageContextType {
    locale: Locale;
    meta: LocaleMeta;
    setLocale: (locale: Locale) => void;
    /** t('orders', 'card.placed', { date }) — dictionary text for the current language, English if a key is ever missing. */
    t: (section: Section, key?: string, vars?: Vars) => string;
    dir: 'ltr' | 'rtl';
    /** Locale-aware formatting; values are never changed, only displayed. */
    fmt: {
        date: (d: string | number | Date, opts?: Intl.DateTimeFormatOptions) => string;
        number: (n: number, opts?: Intl.NumberFormatOptions) => string;
    };
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function resolve(dict: unknown, path: string): string | undefined {
    let cur: any = dict;
    for (const part of path.split('.')) {
        if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
        else return undefined;
    }
    return typeof cur === 'string' ? cur : undefined;
}

function applyDocument(locale: Locale) {
    try {
        document.documentElement.dir = LOCALE_META[locale].dir;
        document.documentElement.lang = locale;
    } catch { /* not in a browser */ }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

    useEffect(() => {
        const boot = (initial: Locale) => {
            setLocaleState(initial);
            applyDocument(initial);
            // Pages outside the dictionaries still use the runtime translator; dictionary-rendered
            // regions opt out with data-no-translate.
            setTimeout(() => { try { setAutoTranslateLocale(initial); } catch (err) { console.warn('[i18n] auto-translate boot failed:', err); } }, 0);
        };
        let initial: Locale = DEFAULT_LOCALE;
        try {
            const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
            if (isLocale(saved)) initial = saved;
            else if (saved) localStorage.removeItem(LOCALE_STORAGE_KEY); // a language we no longer offer
        } catch { /* storage blocked */ }
        boot(initial);
    }, []);

    const setLocale = useCallback((next: Locale) => {
        if (!isLocale(next)) return;
        setLocaleState(next);
        try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* storage blocked */ }
        applyDocument(next);
        try { setAutoTranslateLocale(next); } catch (err) { console.warn('[i18n] locale switch failed:', err); }
    }, []);

    const meta = LOCALE_META[locale];

    const t = useCallback((section: Section, key?: string, vars?: Vars) => {
        const dict = translations[locale];
        if (!key) return (dict[section] as unknown as string) || '';
        const msg = resolve(dict[section], key) ?? resolve(translations.en[section], key);
        if (msg === undefined) {
            if (process.env.NODE_ENV !== 'production') console.warn(`[i18n] missing key ${String(section)}.${key}`);
            return '';
        }
        return formatMessage(msg, vars, meta.intl);
    }, [locale, meta.intl]);

    const fmt = useMemo(() => ({
        date: (d: string | number | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => {
            const v = new Date(d);
            if (Number.isNaN(v.getTime())) return '';
            try { return new Intl.DateTimeFormat(meta.intl, opts).format(v); } catch { return v.toDateString(); }
        },
        number: (n: number, opts?: Intl.NumberFormatOptions) => {
            try { return new Intl.NumberFormat(meta.intl, opts).format(n); } catch { return String(n); }
        },
    }), [meta.intl]);

    useEffect(() => { applyDocument(locale); }, [locale]);

    const value = useMemo(() => ({ locale, meta, setLocale, t, dir: meta.dir, fmt }), [locale, meta, setLocale, t, fmt]);

    return (
        <LanguageContext.Provider value={value}>
            <div dir={meta.dir} lang={locale}>
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
