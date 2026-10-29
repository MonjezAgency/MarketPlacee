/**
 * Delivery destinations — the backend source of truth for where Ali FMCG
 * delivers. Checkout asks this before the buyer gets to the order review,
 * and order creation re-checks it, so the rule can't be bypassed.
 *
 * The list lives in AppConfig (key DELIVERY_COUNTRIES, a JSON array of ISO
 * 3166-1 alpha-2 codes) and admins can change it. Until an admin sets it,
 * DEFAULT_DELIVERY_COUNTRIES applies: Europe and the Gulf (GCC), the area
 * the site itself declares it serves (app/layout.tsx areaServed). No
 * product- or supplier-level delivery restriction exists in the data yet.
 */

/** ISO code → English name (same list as the storefront's country picker). */
const PACKED =
    'AD:Andorra|AE:United Arab Emirates|AF:Afghanistan|AG:Antigua and Barbuda|AI:Anguilla|AL:Albania|AM:Armenia|' +
    'AO:Angola|AQ:Antarctica|AR:Argentina|AS:American Samoa|AT:Austria|AU:Australia|AW:Aruba|AX:Aland Islands|' +
    'AZ:Azerbaijan|BA:Bosnia and Herzegovina|BB:Barbados|BD:Bangladesh|BE:Belgium|BF:Burkina Faso|BG:Bulgaria|' +
    'BH:Bahrain|BI:Burundi|BJ:Benin|BL:Saint Barthelemy|BM:Bermuda|BN:Brunei|BO:Bolivia|' +
    'BQ:Bonaire, Saint Eustatius and Saba |BR:Brazil|BS:Bahamas|BT:Bhutan|BV:Bouvet Island|BW:Botswana|BY:Belarus|' +
    'BZ:Belize|CA:Canada|CC:Cocos Islands|CD:Democratic Republic of the Congo|CF:Central African Republic|' +
    'CG:Republic of the Congo|CH:Switzerland|CI:Ivory Coast|CK:Cook Islands|CL:Chile|CM:Cameroon|CN:China|' +
    'CO:Colombia|CR:Costa Rica|CU:Cuba|CV:Cape Verde|CW:Curacao|CX:Christmas Island|CY:Cyprus|CZ:Czech Republic|' +
    'DE:Germany|DJ:Djibouti|DK:Denmark|DM:Dominica|DO:Dominican Republic|DZ:Algeria|EC:Ecuador|EE:Estonia|EG:Egypt|' +
    'EH:Western Sahara|ER:Eritrea|ES:Spain|ET:Ethiopia|FI:Finland|FJ:Fiji|FK:Falkland Islands|FM:Micronesia|' +
    'FO:Faroe Islands|FR:France|GA:Gabon|GB:United Kingdom|GD:Grenada|GE:Georgia|GF:French Guiana|GG:Guernsey|' +
    'GH:Ghana|GI:Gibraltar|GL:Greenland|GM:Gambia|GN:Guinea|GP:Guadeloupe|GQ:Equatorial Guinea|GR:Greece|' +
    'GT:Guatemala|GU:Guam|GW:Guinea-Bissau|GY:Guyana|HK:Hong Kong|HN:Honduras|HR:Croatia|HT:Haiti|HU:Hungary|' +
    'ID:Indonesia|IE:Ireland|IL:Israel|IM:Isle of Man|IN:India|IO:British Indian Ocean Territory|IQ:Iraq|IR:Iran|' +
    'IS:Iceland|IT:Italy|JE:Jersey|JM:Jamaica|JO:Jordan|JP:Japan|KE:Kenya|KG:Kyrgyzstan|KH:Cambodia|KI:Kiribati|' +
    'KM:Comoros|KN:Saint Kitts and Nevis|KP:North Korea|KR:South Korea|KW:Kuwait|KY:Cayman Islands|KZ:Kazakhstan|' +
    'LA:Laos|LB:Lebanon|LC:Saint Lucia|LI:Liechtenstein|LK:Sri Lanka|LR:Liberia|LS:Lesotho|LT:Lithuania|' +
    'LU:Luxembourg|LV:Latvia|LY:Libya|MA:Morocco|MC:Monaco|MD:Moldova|ME:Montenegro|MF:Saint Martin|MG:Madagascar|' +
    'MH:Marshall Islands|MK:Macedonia|ML:Mali|MM:Myanmar|MN:Mongolia|MO:Macao|MP:Northern Mariana Islands|' +
    'MQ:Martinique|MR:Mauritania|MS:Montserrat|MT:Malta|MU:Mauritius|MV:Maldives|MW:Malawi|MX:Mexico|MY:Malaysia|' +
    'MZ:Mozambique|NA:Namibia|NC:New Caledonia|NE:Niger|NF:Norfolk Island|NG:Nigeria|NI:Nicaragua|NL:Netherlands|' +
    'NO:Norway|NP:Nepal|NR:Nauru|NU:Niue|NZ:New Zealand|OM:Oman|PA:Panama|PE:Peru|PF:French Polynesia|' +
    'PG:Papua New Guinea|PH:Philippines|PK:Pakistan|PL:Poland|PM:Saint Pierre and Miquelon|PN:Pitcairn|' +
    'PS:Palestinian Territory|PT:Portugal|PW:Palau|PY:Paraguay|QA:Qatar|RE:Reunion|RO:Romania|RS:Serbia|RU:Russia|' +
    'RW:Rwanda|SA:Saudi Arabia|SB:Solomon Islands|SC:Seychelles|SD:Sudan|SE:Sweden|SG:Singapore|SH:Saint Helena|' +
    'SI:Slovenia|SJ:Svalbard and Jan Mayen|SK:Slovakia|SL:Sierra Leone|SM:San Marino|SN:Senegal|SO:Somalia|' +
    'SR:Suriname|SS:South Sudan|ST:Sao Tome and Principe|SV:El Salvador|SX:Sint Maarten|SY:Syria|SZ:Swaziland|' +
    'TC:Turks and Caicos Islands|TD:Chad|TF:French Southern Territories|TG:Togo|TH:Thailand|TJ:Tajikistan|' +
    'TK:Tokelau|TL:East Timor|TM:Turkmenistan|TN:Tunisia|TO:Tonga|TR:Turkey|TT:Trinidad and Tobago|TV:Tuvalu|' +
    'TW:Taiwan|TZ:Tanzania|UA:Ukraine|UG:Uganda|US:United States|UY:Uruguay|UZ:Uzbekistan|VA:Vatican|' +
    'VC:Saint Vincent and the Grenadines|VE:Venezuela|VG:British Virgin Islands|VN:Vietnam|VU:Vanuatu|' +
    'WF:Wallis and Futuna|WS:Samoa|XK:Kosovo|YE:Yemen|YT:Mayotte|ZA:South Africa|ZM:Zambia|ZW:Zimbabwe';

export const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(PACKED.split('|').map((x) => x.split(':') as [string, string]));

const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const OTHER_EUROPE = ['IS', 'LI', 'NO', 'CH', 'GB', 'MD', 'RS', 'AL', 'BA', 'ME', 'MK'];
const GCC = ['AE', 'SA', 'KW', 'QA', 'BH', 'OM'];
export const DEFAULT_DELIVERY_COUNTRIES: readonly string[] = [...EU, ...OTHER_EUROPE, ...GCC];

const ALIASES: Record<string, string> = {
    uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
    usa: 'US', 'united states of america': 'US', america: 'US', uae: 'AE', emirates: 'AE', ksa: 'SA', 'saudi': 'SA',
    holland: 'NL', 'the netherlands': 'NL', 'czechia': 'CZ', 'czech republic': 'CZ', turkiye: 'TR', 'türkiye': 'TR',
    romania: 'RO', 'românia': 'RO', deutschland: 'DE', 'españa': 'ES', 'italia': 'IT', 'polska': 'PL', 'magyarország': 'HU',
    'مصر': 'EG', 'egypt': 'EG', 'السعودية': 'SA', 'الإمارات': 'AE', 'north macedonia': 'MK', 'macedonia': 'MK',
};
const norm = (s: string) => s.trim().toLowerCase().normalize('NFKC').replace(/\s+/g, ' ');
const BY_NAME = new Map<string, string>(Object.entries(COUNTRY_NAMES).map(([c, n]) => [norm(n), c]));

/** "Romania", "RO", "ro", "UK" → ISO code; null when it isn't a country we know. */
export function resolveCountry(input: unknown): string | null {
    const raw = typeof input === 'string' ? input : '';
    if (!raw.trim()) return null;
    const up = raw.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(up) && COUNTRY_NAMES[up]) return up;
    const n = norm(raw);
    return ALIASES[n] ?? BY_NAME.get(n) ?? null;
}

export function countryName(code: string): string {
    return COUNTRY_NAMES[code] ?? code;
}

/** Validate an admin-supplied list; unknown codes are rejected, duplicates removed. */
export function parseCountryList(value: unknown): string[] {
    const arr = Array.isArray(value) ? value : [];
    const out = new Set<string>();
    for (const v of arr) {
        const c = resolveCountry(String(v));
        if (!c) throw new Error(`Unknown country: ${String(v).slice(0, 40)}`);
        out.add(c);
    }
    return [...out].sort();
}

export interface DestinationCheck { supported: boolean; code: string | null; name: string | null; message: string | null }

export function checkDestination(input: unknown, allowed: readonly string[]): DestinationCheck {
    const code = resolveCountry(input);
    if (!code) return { supported: false, code: null, name: null, message: 'Choose your delivery country from the list.' };
    const name = countryName(code);
    if (!allowed.includes(code)) {
        return { supported: false, code, name, message: `Delivery to ${name} is not currently supported for this order. Please select an eligible destination, or contact us about delivery to ${name}.` };
    }
    return { supported: true, code, name, message: null };
}

export const DELIVERY_COUNTRIES_KEY = 'DELIVERY_COUNTRIES';

/** The active list: the admin-configured one, else the default. Never throws. */
export async function loadDeliveryCountries(prisma: any): Promise<{ countries: string[]; configured: boolean }> {
    const row = await prisma.appConfig.findUnique({ where: { key: DELIVERY_COUNTRIES_KEY } }).catch(() => null);
    if (row?.value) {
        try {
            const list = parseCountryList(JSON.parse(row.value));
            if (list.length) return { countries: list, configured: true };
        } catch { /* a broken value falls back to the default rather than blocking checkout */ }
    }
    return { countries: [...DEFAULT_DELIVERY_COUNTRIES].sort(), configured: false };
}
