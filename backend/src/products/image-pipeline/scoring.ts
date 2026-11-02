import { sameCode } from './gtin';
import type { Fingerprint } from './pixels';
import { similarity } from './pixels';
import type { Candidate, DomainClass, Flaw, Identity, ScoreParts } from './types';

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

/**
 * A barcode without quotes brings back anything on the web. A result that names
 * neither the barcode nor the brand isn't worth a download, let alone a vision call.
 */
export function namesProduct(c: Pick<Candidate, 'title' | 'pageUrl' | 'url'>, brand: string, codes: string[]): boolean {
    const text = `${c.title ?? ''} ${c.pageUrl ?? ''}`;
    if ((text.match(/\d{8,14}/g) || []).some((d) => codes.some((code) => sameCode(d, code)))) return true;
    const words = tokens(brand);
    const pool = tokens(text);
    return words.length > 0 && words.every((w) => fuzzyHas(w, pool));
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
    return Math.max(0, Math.min(100, Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 10) / 10));
}

/**
 * What the pixels and the source can say against a photo. Thresholds come from
 * the 11 house-style references (2 Nov 2026): plain edge 0.92 and up, against 0.33
 * and under for phone photos; sharpness 668 and up, so half of that is soft;
 * contrast 77 and up; fill 0.65 and up.
 */
const MIN_FILL = 0.5;
const MIN_EDGE_CLEAR = 0.5;
const MIN_SHARPNESS = 330;
const MIN_CONTRAST = 40;
const MAX_CANVAS_ASPECT = 3;
export const PENALTY: Record<Flaw, number> = { busy_background: 25, close_up: 20, small_in_frame: 15, blurry: 20, low_contrast: 10, back_of_pack: 30, multipack: 15, shows_barcode: 20 };
const MULTIPACK = /\b\d+\s*[x×]\s*\d+|\b(pack|case|box|tray) of \d+|\bmulti-?pack\b/i;

export function flawsOf(print: Fingerprint, c: Pick<Candidate, 'role' | 'title'>, size: string): Flaw[] {
    const flaws: Flaw[] = [];
    if (!print.plain || !print.studioBackdrop) flaws.push('busy_background');
    if ((print.plain && print.ring < MIN_EDGE_CLEAR) || print.canvasAspect > MAX_CANVAS_ASPECT) flaws.push('close_up');
    if (print.plain && print.fill < MIN_FILL) flaws.push('small_in_frame');
    if (print.sharpness < MIN_SHARPNESS) flaws.push('blurry');
    if (print.plain && print.contrast < MIN_CONTRAST) flaws.push('low_contrast');
    if (c.role === 'back') flaws.push('back_of_pack');
    if (MULTIPACK.test(c.title ?? '') && !/x/i.test(size)) flaws.push('multipack');
    return flaws;
}

/** A barcode in shot proves the product and usually means the back: that one alone doesn't rule a photo out, vision does. */
export const isStudio = (flaws: Flaw[]) => flaws.every((f) => f === 'shows_barcode');
/** What no cut-out can repair. Hands, angle and cropping need eyes: the vision screen decides those before anything is paid for. */
const NOT_CUTTABLE: Flaw[] = ['blurry', 'back_of_pack', 'multipack', 'close_up', 'low_contrast', 'shows_barcode'];
export const MIN_CUTOUT_FILL = 0.4;
/** On a scene the pack can't be measured, so only a plain backdrop can rule a photo out here. */
export const cutoutFits = (print: Pick<Fingerprint, 'plain' | 'fill'>) => !print.plain || print.fill >= MIN_CUTOUT_FILL;
export const cuttable = (s: { flaws: Flaw[]; cutoutFits: boolean }) => s.cutoutFits && !s.flaws.some((f) => NOT_CUTTABLE.includes(f));
export const penaltyOf = (flaws: Flaw[]) => -flaws.reduce((sum, f) => sum + PENALTY[f], 0);
