import { sameCode } from './gtin';
import type { Fingerprint } from './pixels';
import { similarity } from './pixels';
import type { Candidate, DomainClass, Identity, ScoreParts } from './types';

/** Longest side below this is thrown out. */
export const MIN_LONG_SIDE = 800;
export const WEIGHTS = { white: 30, resolution: 20, identityText: 20, visual: 15, domain: 10, framing: 5, barcode: 15 };

/** 800px 40%, 1000px 70%, 1500px and up 100%, straight lines between. */
export function resolutionPoints(longest: number): number {
    if (longest < MIN_LONG_SIDE) return 0;
    const share = longest >= 1500 ? 1 : longest >= 1000 ? 0.7 + ((longest - 1000) / 500) * 0.3 : 0.4 + ((longest - 800) / 200) * 0.3;
    return Math.round(WEIGHTS.resolution * share * 10) / 10;
}

export const domainPoints = (cls: DomainClass) => ({ brand: 10, retailer: 7, ean_database: 5, unknown: 2 }[cls]);

const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

function editDistance(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = i - 1;
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const now = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = now;
        }
    }
    return row[b.length];
}

/** One typo allowed in a long word, so "Windel" and "Windeln" meet. Never in a number: 500 is not 600. */
function fuzzyHas(word: string, pool: string[]): boolean {
    return pool.some((w) => w === word || (word.length >= 5 && !/\d/.test(word) && editDistance(w, word) <= 1) || (word.length >= 4 && w.includes(word)));
}

/**
 * Does the page say this is the product? The barcode on the page is enough on
 * its own. Otherwise brand, size and variant words each count, in any of the
 * languages the name was given in. A signal for ranking, never a gate.
 */
export function identityTextPoints(c: Pick<Candidate, 'title' | 'pageUrl' | 'url'>, identity: Pick<Identity, 'brand' | 'size' | 'variant' | 'name' | 'english'>, codes: string[]): number {
    const text = `${c.title ?? ''} ${c.pageUrl ?? ''}`;
    const digits = text.match(/\d{8,14}/g) || [];
    if (digits.some((d) => codes.some((code) => sameCode(d, code)))) return WEIGHTS.identityText;
    const pool = tokens(text);
    const joined = pool.join('');
    let points = 0;
    const brand = tokens(identity.brand);
    if (brand.length && brand.every((b) => fuzzyHas(b, pool))) points += 8;
    const size = identity.size.toLowerCase().replace(/\s/g, '');
    const firstSize = size.match(/\d+(?:\.\d+)?(?:ml|cl|l|kg|g|oz)/)?.[0];
    if (firstSize && joined.includes(firstSize)) points += 6;
    const words = identity.variant;
    if (words.length) points += (6 * words.filter((w) => fuzzyHas(w, pool)).length) / words.length;
    return Math.round(points * 10) / 10;
}

/** Best match against the photos a database links to this barcode. */
export function visualPoints(print: Fingerprint, references: Fingerprint[]): number {
    if (!references.length) return 0;
    return Math.round(WEIGHTS.visual * Math.max(...references.map((r) => similarity(print, r))) * 10) / 10;
}

/** The whole pack, clear of the edge, filling most of the frame. */
export function framingPoints(print: Fingerprint): number {
    if (print.touchesEdge) return 0;
    return print.fill >= 0.55 ? WEIGHTS.framing : Math.round(WEIGHTS.framing * (print.fill / 0.55) * 10) / 10;
}

export function total(parts: ScoreParts): number {
    return Math.min(100, Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 10) / 10);
}
