import { barcodeProblem, normaliseBarcode } from '../catalog-rules';
import { checkDigit } from '../product-data-providers';
import { gs1Country, type Gs1Country } from './gs1-prefixes';

/**
 * One barcode in every form a source may know it by. Sources are asked with
 * `searchCodes`, and every comparison goes through `sameCode`, so a 12-digit UPC
 * and its padded EAN-13 are one product, and a case code finds its inner item.
 */
export interface Gtin {
    /** As the supplier wrote it. */
    original: string;
    digits: string;
    /** EAN-13 form (or EAN-8, which has no padded form sources understand), the key jobs and caches use. */
    canonical: string;
    /** The case code, when the row has one with indicator 1 to 8. */
    caseCode?: string;
    /** The retail unit inside that case. */
    inner?: string;
    /** Case code first, then the inner item. */
    searchCodes: string[];
    problem?: 'invalid_ean' | 'internal_code' | 'variable_measure';
    /** Where the code was issued: a hint for language, never a rule. */
    gs1?: Gs1Country;
}

/** The 14-digit form of any valid code, padded with zeros. */
export function toGtin14(code: string): string {
    return code.padStart(14, '0');
}

/** Same trade item, whatever the padding. A case and its inner item are not the same code. */
export function sameCode(a: string, b: string): boolean {
    const x = normaliseBarcode(a), y = normaliseBarcode(b);
    return !!x && !!y && toGtin14(x) === toGtin14(y);
}

export function parseGtin(raw: unknown): Gtin {
    const original = String(raw ?? '').trim();
    const digits = normaliseBarcode(raw);
    const bad: Gtin = { original, digits, canonical: digits, searchCodes: [], problem: 'invalid_ean' };
    if (barcodeProblem(digits)) return bad;
    // A leading zero on 14 digits is no indicator at all: it is the retail item, padded.
    const code = digits.length === 14 && digits[0] === '0' ? digits.slice(1) : digits;
    if (code.length === 14) {
        if (code[0] === '9') return { original, digits, canonical: code, searchCodes: [], problem: 'variable_measure' };
        const body = code.slice(1, 13);
        const inner = body + checkDigit(body);
        return { original, digits, canonical: inner, caseCode: code, inner, searchCodes: [code, inner], gs1: gs1Country(inner) };
    }
    // Store-internal numbers mean nothing to a database.
    if ((code.length === 8 && code[0] === '2') || (code.length === 12 && /^[24]/.test(code)) || (code.length === 13 && (/^2/.test(code) || /^0[24]/.test(code)))) {
        return { original, digits, canonical: code, searchCodes: [], problem: 'internal_code' };
    }
    const canonical = code.length === 12 ? `0${code}` : code;
    return { original, digits, canonical, searchCodes: [canonical], gs1: gs1Country(canonical) };
}
