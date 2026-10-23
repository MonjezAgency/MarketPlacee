/**
 * What a candidate product photo looks like, measured from its pixels, and
 * how it ranks for the marketplace. Pure functions: the download happens in
 * ImageDiscoveryService.
 *
 * The reference for the main photo is a packshot: the exact product, whole
 * and centred, on a white or near-white background. Open Food Facts usually
 * crops a packshot to the pack itself, so a cut-out touching the frame with
 * white corners counts as whole ("tight"); our image frames add the margin. Identity always comes
 * first — a clean photo of another flavour or size is never offered (the
 * discovery drops it before ranking) — and the picture only orders photos of
 * the same product:
 *   tier 1  white background, nothing cut off (a margin, or a tight cut-out), sharp enough
 *   tier 2  plain light / neutral background (studio-like), or white but small / slightly cut
 *   tier 3  everything else (a photo taken in a shop or at home, a tight crop),
 *           and any photo whose pixels couldn't be read
 * Photos of a product whose identity isn't confirmed have no tier: they are
 * shown for a person to check, never ranked as a match.
 */
import * as jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export type Background = 'white' | 'light_neutral' | 'busy';
export interface VisualReport {
    analysed: true;
    /** Pixel size of the analysed file (OFF serves a 400 px preview). */
    width: number; height: number;
    background: Background;
    /** Share of border pixels that are near-white, 0–1. */
    whiteBorder: number;
    /** Share of border pixels that are light and colourless, 0–1. */
    lightBorder: number;
    /** Spread of the border's brightness (0 = perfectly even). */
    borderSpread: number;
    /** Corners (of 4) that are clean background: a packshot cut out on white has white corners even when the pack touches the frame. */
    cleanCorners: number;
    /** Sides where the product reaches the frame. */
    touches: ('top' | 'right' | 'bottom' | 'left')[];
    /**
     * margin = the whole product with background all round · tight = on a clean background and cropped to the pack (the usual
     * Open Food Facts crop, shown with a margin by our frames) · cut = runs off the frame on a busy background (part may be missing).
     */
    fit: 'margin' | 'tight' | 'cut';
    /** Share of the frame the product's bounding box covers, 0–1. */
    coverage: number;
}
export type Visual = VisualReport | { analysed: false; reason: 'download_failed' | 'decode_failed' | 'too_large' | 'not_an_image' };

export const MAX_ANALYSE_BYTES = 3 * 1024 * 1024;

/** Decode a JPEG or PNG into RGBA, or null. Bounded so a huge file can't exhaust memory. */
export function decodeImage(buf: Buffer): { width: number; height: number; data: Uint8Array } | null {
    try {
        if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
            const png = PNG.sync.read(buf);
            if (png.width * png.height > 16_000_000) return null;
            return { width: png.width, height: png.height, data: png.data };
        }
        if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) {
            const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 256, tolerantDecoding: true });
            return { width: img.width, height: img.height, data: img.data };
        }
    } catch { /* unreadable */ }
    return null;
}

/** Measure background, cropping and coverage of a decoded image. */
export function analysePixels(img: { width: number; height: number; data: Uint8Array }): VisualReport {
    const { width: w, height: h, data } = img;
    const px = (x: number, y: number): [number, number, number] => {
        const i = (y * w + x) * 4;
        const a = data[i + 3] / 255;   // transparent = shown on white
        return [data[i] * a + 255 * (1 - a), data[i + 1] * a + 255 * (1 - a), data[i + 2] * a + 255 * (1 - a)];
    };
    const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const chroma = (c: number[]) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

    // Border band: 3 % of the short side, at least 2 px.
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const step = Math.max(1, Math.floor((2 * (w + h) * band) / 6000));
    const border: [number, number, number][] = [];
    let k = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Skip the inside of the frame in one jump.
            if (y >= band && y < h - band && x >= band && x < w - band) { x = w - band - 1; continue; }
            if (k++ % step === 0) border.push(px(x, y));
        }
    }
    const lums = border.map(lum);
    const mean = lums.reduce((s, v) => s + v, 0) / Math.max(1, lums.length);
    const spread = Math.sqrt(lums.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, lums.length));
    const isWhite = (c: number[]) => lum(c) >= 238 && chroma(c) <= 18;
    const isLight = (c: number[]) => lum(c) >= 170 && chroma(c) <= 30;
    const whiteBorder = border.filter(isWhite).length / Math.max(1, border.length);
    const lightBorder = border.filter(isLight).length / Math.max(1, border.length);

    // Corner patches (4 % of the short side): background in a cut-out, often the only background visible.
    const cs = Math.max(3, Math.round(Math.min(w, h) * 0.04));
    const patch = (x0: number, y0: number, test: (c: number[]) => boolean) => {
        let n = 0, ok = 0;
        for (let y = y0; y < y0 + cs; y++) for (let x = x0; x < x0 + cs; x++) { n++; if (test(px(x, y))) ok++; }
        return ok / Math.max(1, n) >= 0.9;
    };
    const corners = [[0, 0], [w - cs, 0], [0, h - cs], [w - cs, h - cs]] as const;
    const whiteCorners = corners.filter(([x, y]) => patch(x, y, isWhite)).length;
    const lightCorners = corners.filter(([x, y]) => patch(x, y, isLight)).length;

    // White: a margin of white all round, or a pack cut out onto white — white corners, or white making up most
    // of the border while the pack reaches the frame elsewhere (a phone photo has textured, not pure white, edges).
    const background: Background =
        (whiteBorder >= 0.9 && spread <= 14) || (whiteCorners >= 3 && whiteBorder >= 0.2) || whiteBorder >= 0.5 ? 'white'
            : (lightBorder >= 0.85 && spread <= 28) || (lightCorners >= 3 && lightBorder >= 0.2) || lightBorder >= 0.6 ? 'light_neutral'
                : 'busy';
    const clean = background === 'white' ? isWhite : background === 'light_neutral' ? isLight : null;
    const cleanCorners = background === 'white' ? whiteCorners : background === 'light_neutral' ? lightCorners : 0;

    // Background colour: the clean border pixels when there is a clean background, else the border's median.
    const ref = clean ? border.filter(clean) : border;
    const med = [0, 1, 2].map((ch) => { const v = ref.map((c) => c[ch]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? 255; });
    const isFg = (c: number[]) => Math.hypot(c[0] - med[0], c[1] - med[1], c[2] - med[2]) > 40;
    const gs = Math.max(1, Math.floor(Math.min(w, h) / 200));
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y += gs) for (let x = 0; x < w; x += gs) {
        if (isFg(px(x, y))) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    const coverage = maxX < 0 ? 0 : ((maxX - minX + 1) * (maxY - minY + 1)) / (w * h);

    // A side is "touched" when a real share of its outermost line is product, not background.
    const sideShare = (pts: [number, number][]) => pts.filter(([x, y]) => isFg(px(x, y))).length / Math.max(1, pts.length);
    const line = (n: number, f: (i: number) => [number, number]) => Array.from({ length: Math.ceil(n / Math.max(1, Math.floor(n / 300))) }, (_, i) => f(Math.min(n - 1, i * Math.max(1, Math.floor(n / 300)))));
    const touches: VisualReport['touches'] = [];
    if (sideShare(line(w, (i) => [i, 0])) > 0.06) touches.push('top');
    if (sideShare(line(h, (i) => [w - 1, i])) > 0.06) touches.push('right');
    if (sideShare(line(w, (i) => [i, h - 1])) > 0.06) touches.push('bottom');
    if (sideShare(line(h, (i) => [0, i])) > 0.06) touches.push('left');
    const fit: VisualReport['fit'] = !touches.length ? 'margin' : clean ? 'tight' : 'cut';

    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { analysed: true, width: w, height: h, background, whiteBorder: r2(whiteBorder), lightBorder: r2(lightBorder), borderSpread: Math.round(spread * 10) / 10, cleanCorners, touches, fit, coverage: r2(coverage) };
}

export function analyseBuffer(buf: Buffer): Visual {
    if (buf.length > MAX_ANALYSE_BYTES) return { analysed: false, reason: 'too_large' };
    const img = decodeImage(buf);
    return img ? analysePixels(img) : { analysed: false, reason: 'decode_failed' };
}

// ─── Scoring ──────────────────────────────────────────────────────────

export type Tier = 1 | 2 | 3;
export interface ScoreLine { key: string; points: number }
export interface Scored { tier: Tier | null; score: number; breakdown: ScoreLine[]; visual: Visual | null }

/** Below this many pixels on the long side a photo is too small for a catalog card's main photo. */
export const MIN_PRIMARY_LONG_SIDE = 500;

/**
 * Score one candidate. `identity` = the record is this exact product (same
 * barcode, name or brand agrees, nothing contradicts size or variant).
 * Identity points dominate: an unconfirmed photo never outranks a confirmed one.
 */
export function scoreCandidate(c: { confidence: 'verified' | 'needs_confirmation'; reasons: string[]; kind?: string; width?: number; height?: number; license?: string }, visual: Visual | null): Scored {
    const lines: ScoreLine[] = [];
    const add = (key: string, points: number) => lines.push({ key, points });
    const identity = c.confidence === 'verified';
    if (!c.reasons.includes('barcode_differs')) add('barcode_exact', 40);
    if (c.reasons.includes('name_matches')) add('name_matches', 10);
    if (c.reasons.includes('brand_matches')) add('brand_matches', 10);
    if (c.reasons.includes('size_matches')) add('size_matches', 10);
    if (!identity) add('identity_unconfirmed', -100);

    if (visual?.analysed) {
        if (visual.background === 'white') add('background_white', 15);
        else if (visual.background === 'light_neutral') add('background_neutral', 8);
        else add('background_busy', 0);
        if (visual.fit === 'margin') add('not_cropped', 5);
        else if (visual.fit === 'tight') add('tight_crop', 2);
        else add('cropped', -3 * visual.touches.length);
        if (visual.coverage > 0 && visual.coverage < 0.12) add('product_small', -4);
    } else add('background_unchecked', 0);

    const long = Math.max(c.width || 0, c.height || 0);
    if (long >= 1000) add('resolution_high', 5);
    else if (long >= MIN_PRIMARY_LONG_SIDE) add('resolution_ok', 3);
    else if (long > 0) add('resolution_low', -5);
    else add('resolution_unknown', 0);

    if (c.kind === 'front') add('kind_front', 5);
    else if (c.kind === 'packaging') add('kind_packaging', 2);
    if (c.license) add('license_cc_by_sa', 0);

    const lowRes = long > 0 && long < MIN_PRIMARY_LONG_SIDE;
    let tier: Tier | null = null;
    if (identity) {
        if (!visual?.analysed) tier = 3;
        else if (visual.background === 'white' && visual.fit !== 'cut' && !lowRes && visual.coverage >= 0.12) tier = 1;
        else if ((visual.background === 'white' || visual.background === 'light_neutral') && (visual.fit !== 'cut' || visual.touches.length <= 1)) tier = 2;
        else tier = 3;
    }
    return { tier, score: lines.reduce((s, l) => s + l.points, 0), breakdown: lines, visual };
}

/** Best first: confirmed identity, then tier, then score; ties keep the source order. */
export function rankScored<T extends Scored>(items: T[]): T[] {
    return items.map((x, i) => ({ x, i })).sort((a, b) => {
        const ta = a.x.tier ?? 9, tb = b.x.tier ?? 9;
        return ta - tb || b.x.score - a.x.score || a.i - b.i;
    }).map((v) => v.x);
}
