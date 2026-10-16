import type { Locale } from '../config';

/**
 * A dictionary section that lives next to the area it translates (all seven
 * languages in one file). Sections merge into the same `translations` object
 * and are read with the same `t('section', 'key')` — one translation system.
 *
 * The type requires every language to have exactly the English keys, so a
 * missing or extra key is a compile error; scripts/check-i18n.ts applies the
 * same content rules as the main dictionaries (no empty, no untranslated
 * copies, matching {placeholders}, <tags> and plural forms) and scans `files`
 * for hard-coded English.
 */
export type SectionDict = Record<string, string>;
export interface Section<N extends string = string> {
    name: N; files: string[]; dict: Record<Locale, SectionDict>;
    /** Keys whose value is correctly identical to English in a language (brand, product or industry term), with the reason. */
    sameAsEnglish?: Partial<Record<Locale, Record<string, string>>>;
}

export function defineSection<N extends string, E extends SectionDict>(
    name: N,
    files: string[],
    dict: { en: E } & { [L in Exclude<Locale, 'en'>]: { [K in keyof E]: string } },
    sameAsEnglish?: Partial<Record<Exclude<Locale, 'en'>, Partial<Record<keyof E, string>>>>,
): Section<N> {
    return { name, files, dict: dict as Record<Locale, SectionDict>, sameAsEnglish: sameAsEnglish as Section['sameAsEnglish'] };
}
