/**
 * GS1 prefix ranges: where a barcode was issued, not where the product was made.
 * A hint for the query language and the pack language, never a rule.
 */
export interface Gs1Country { country: string; language: string }

const RANGES: [number, number, string, string][] = [
    [0, 19, 'United States and Canada', 'en'], [30, 39, 'United States', 'en'], [60, 139, 'United States and Canada', 'en'],
    [300, 379, 'France', 'fr'], [380, 380, 'Bulgaria', 'bg'], [383, 383, 'Slovenia', 'sl'], [385, 385, 'Croatia', 'hr'], [387, 387, 'Bosnia and Herzegovina', 'bs'],
    [389, 389, 'Montenegro', 'sr'], [400, 440, 'Germany', 'de'], [450, 459, 'Japan', 'ja'], [460, 469, 'Russia', 'ru'], [470, 470, 'Kyrgyzstan', 'ru'], [471, 471, 'Taiwan', 'zh'],
    [474, 474, 'Estonia', 'et'], [475, 475, 'Latvia', 'lv'], [476, 476, 'Azerbaijan', 'az'], [477, 477, 'Lithuania', 'lt'], [478, 478, 'Uzbekistan', 'uz'], [479, 479, 'Sri Lanka', 'en'],
    [480, 480, 'Philippines', 'en'], [481, 481, 'Belarus', 'ru'], [482, 482, 'Ukraine', 'uk'], [484, 484, 'Moldova', 'ro'], [485, 485, 'Armenia', 'hy'], [486, 486, 'Georgia', 'ka'],
    [487, 487, 'Kazakhstan', 'ru'], [489, 489, 'Hong Kong', 'zh'], [490, 499, 'Japan', 'ja'], [500, 509, 'United Kingdom', 'en'], [520, 521, 'Greece', 'el'], [528, 528, 'Lebanon', 'ar'],
    [529, 529, 'Cyprus', 'el'], [530, 530, 'Albania', 'sq'], [531, 531, 'North Macedonia', 'mk'], [535, 535, 'Malta', 'en'], [539, 539, 'Ireland', 'en'], [540, 549, 'Belgium and Luxembourg', 'nl'],
    [560, 560, 'Portugal', 'pt'], [569, 569, 'Iceland', 'is'], [570, 579, 'Denmark', 'da'], [590, 590, 'Poland', 'pl'], [594, 594, 'Romania', 'ro'], [599, 599, 'Hungary', 'hu'],
    [600, 601, 'South Africa', 'en'], [603, 603, 'Ghana', 'en'], [608, 608, 'Bahrain', 'ar'], [609, 609, 'Mauritius', 'en'], [611, 611, 'Morocco', 'ar'], [613, 613, 'Algeria', 'ar'],
    [616, 616, 'Kenya', 'en'], [619, 619, 'Tunisia', 'ar'], [621, 621, 'Syria', 'ar'], [622, 622, 'Egypt', 'ar'], [624, 624, 'Libya', 'ar'], [625, 625, 'Jordan', 'ar'], [626, 626, 'Iran', 'fa'],
    [627, 627, 'Kuwait', 'ar'], [628, 628, 'Saudi Arabia', 'ar'], [629, 629, 'United Arab Emirates', 'ar'], [640, 649, 'Finland', 'fi'], [690, 699, 'China', 'zh'], [700, 709, 'Norway', 'no'],
    [729, 729, 'Israel', 'he'], [730, 739, 'Sweden', 'sv'], [750, 750, 'Mexico', 'es'], [754, 755, 'Canada', 'en'], [760, 769, 'Switzerland', 'de'], [770, 771, 'Colombia', 'es'], [773, 773, 'Uruguay', 'es'],
    [775, 775, 'Peru', 'es'], [778, 779, 'Argentina', 'es'], [780, 780, 'Chile', 'es'], [789, 790, 'Brazil', 'pt'], [800, 839, 'Italy', 'it'], [840, 849, 'Spain', 'es'], [850, 850, 'Cuba', 'es'],
    [858, 858, 'Slovakia', 'sk'], [859, 859, 'Czech Republic', 'cs'], [860, 860, 'Serbia', 'sr'], [865, 865, 'Mongolia', 'mn'], [867, 867, 'North Korea', 'ko'], [868, 869, 'Turkey', 'tr'],
    [870, 879, 'Netherlands', 'nl'], [880, 880, 'South Korea', 'ko'], [884, 884, 'Cambodia', 'km'], [885, 885, 'Thailand', 'th'], [888, 888, 'Singapore', 'en'], [890, 890, 'India', 'en'],
    [893, 893, 'Vietnam', 'vi'], [899, 899, 'Indonesia', 'id'], [900, 919, 'Austria', 'de'], [930, 939, 'Australia', 'en'], [940, 949, 'New Zealand', 'en'], [955, 955, 'Malaysia', 'ms'], [958, 958, 'Macau', 'zh'],
];

/** Country for a 13-digit code (shorter codes are padded first). */
export function gs1Country(code: string): Gs1Country | undefined {
    const prefix = Number(code.padStart(13, '0').slice(0, 3));
    const hit = RANGES.find(([from, to]) => prefix >= from && prefix <= to);
    return hit ? { country: hit[2], language: hit[3] } : undefined;
}
