/**
 * Supported interface languages — the one list every language selector,
 * the LanguageProvider and scripts/check-i18n.ts read.
 *
 * Adding a language means adding a complete dictionary (typed as Messages,
 * so a missing key fails the type check) and an entry here.
 */
export const LOCALES = ['en', 'ar', 'fr', 'ro', 'it', 'es', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export interface LocaleMeta {
    code: Locale;
    /** Name in its own language, as shown in selectors. */
    name: string;
    /** Short label for compact controls. */
    short: string;
    dir: 'ltr' | 'rtl';
    /** BCP 47 tag for Intl date/number/plural formatting (Latin digits everywhere so prices, EANs and order ids stay readable). */
    intl: string;
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
    en: { code: 'en', name: 'English', short: 'EN', dir: 'ltr', intl: 'en-GB' },
    ar: { code: 'ar', name: 'العربية', short: 'ع', dir: 'rtl', intl: 'ar-EG-u-nu-latn' },
    fr: { code: 'fr', name: 'Français', short: 'FR', dir: 'ltr', intl: 'fr-FR' },
    ro: { code: 'ro', name: 'Română', short: 'RO', dir: 'ltr', intl: 'ro-RO' },
    it: { code: 'it', name: 'Italiano', short: 'IT', dir: 'ltr', intl: 'it-IT' },
    es: { code: 'es', name: 'Español', short: 'ES', dir: 'ltr', intl: 'es-ES' },
    pt: { code: 'pt', name: 'Português (Portugal)', short: 'PT', dir: 'ltr', intl: 'pt-PT' },
};

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
