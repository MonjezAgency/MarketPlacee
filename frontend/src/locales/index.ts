import { en } from './en';
import { ar } from './ar';
import { fr } from './fr';
import { ro } from './ro';
import { it } from './it';
import { es } from './es';
import { pt } from './pt';
import { LOCALES, type Locale } from './config';
import { SECTIONS } from './sections';

export { LOCALE_META, DEFAULT_LOCALE, isLocale } from './config';
export { LOCALES };
export type { Locale, LocaleMeta } from './config';

/**
 * Every dictionary has exactly the English shape. Each locale file is typed
 * `Messages`, so a missing section or key is a type error, and
 * scripts/check-i18n.ts additionally rejects empty values, untranslated
 * copies of the English text, mismatched {placeholders} and missing plural
 * forms.
 */
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type Messages = DeepStrings<typeof en>;

export const translations: Record<Locale, Messages> = { en, ar, fr, ro, it, es, pt };

// Area sections (locales/sections/*) join the same dictionaries.
for (const s of SECTIONS) for (const l of LOCALES) (translations[l] as unknown as Record<string, unknown>)[s.name] = s.dict[l];
export type { SectionName } from './sections';

export type TranslationKey = keyof Messages;
