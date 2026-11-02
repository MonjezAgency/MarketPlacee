import { sharp } from './sharp';

/** The pure pixel work: background, subject box, fingerprint. No network. */

export const NEAR_WHITE = 245;
const WHITE_RING_SHARE = 0.98;
const RING = 0.02;
const SAMPLE = 500;

export interface Raw { data: Buffer; width: number; height: number; channels: number }

export async function rawRgb(input: Buffer, maxSide?: number): Promise<Raw> {
    let img = sharp(input, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).toColourspace('srgb').removeAlpha();
    if (maxSide) img = img.resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true });
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels };
}

const nearWhite = (r: Raw, i: number, level: number) => r.data[i] > level && r.data[i + 1] > level && r.data[i + 2] > level;

/** Share of the outer ring where every channel is near white. */
export function whiteRingShare(r: Raw): number {
    const band = Math.max(2, Math.round(Math.min(r.width, r.height) * RING));
    let white = 0, total = 0;
    for (let y = 0; y < r.height; y++) {
        for (let x = 0; x < r.width; x++) {
            if (x >= band && x < r.width - band && y >= band && y < r.height - band) continue;
            total++;
            if (nearWhite(r, (y * r.width + x) * r.channels, NEAR_WHITE)) white++;
        }
    }
    return total ? white / total : 0;
}

export const isWhiteBackground = (r: Raw) => whiteRingShare(r) >= WHITE_RING_SHARE;

/**
 * Background = near-white pixels joined to the edge. Returns the subject mask
 * (1 = subject). A white label inside the pack is not reached, so it stays.
 */
export function subjectMask(r: Raw, level = NEAR_WHITE): Uint8Array {
    const { width, height, channels } = r;
    const mask = new Uint8Array(width * height).fill(1);
    const stack: number[] = [];
    const visit = (p: number) => {
        if (mask[p] && nearWhite(r, p * channels, level)) { mask[p] = 0; stack.push(p); }
    };
    for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
    while (stack.length) {
        const p = stack.pop()!;
        const x = p % width;
        if (x > 0) visit(p - 1);
        if (x < width - 1) visit(p + 1);
        if (p >= width) visit(p - width);
        if (p + width < mask.length) visit(p + width);
    }
    return mask;
}

export interface Box { left: number; top: number; right: number; bottom: number }
export function boxOf(mask: Uint8Array, width: number, height: number): Box | null {
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!mask[y * width + x]) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }
    return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

export const areaOf = (mask: Uint8Array) => mask.reduce((n, v) => n + (v ? 1 : 0), 0);

/** How far a pixel may stray from the backdrop's colour and still be backdrop: soft studio shading stays in, a table's grain doesn't. */
const BACKDROP_TOLERANCE = 30;
const PLAIN_CORNERS = 3;
const PLAIN_RING_SHARE = 0.4;
/** A wide bar on a narrow canvas covers corners too; this much clear edge is a backdrop all the same. */
const CLEAR_RING_SHARE = 0.9;
/** A full-bleed red label and a dark floor are plain too, and neither is a packshot. A pale coloured backdrop still is one. */
const MIN_BACKDROP_LEVEL = 110;
const MAX_BACKDROP_SPREAD = 90;
export const isStudioBackdrop = (colour: number[]) => colour.reduce((a, b) => a + b, 0) / 3 >= MIN_BACKDROP_LEVEL && Math.max(...colour) - Math.min(...colour) <= MAX_BACKDROP_SPREAD;

function ringPixels(r: Raw): number[] {
    const band = Math.max(2, Math.round(Math.min(r.width, r.height) * RING));
    const out: number[] = [];
    for (let y = 0; y < r.height; y++) {
        for (let x = 0; x < r.width; x++) {
            if (x >= band && x < r.width - band && y >= band && y < r.height - band) continue;
            out.push((y * r.width + x) * r.channels);
        }
    }
    return out;
}

const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const near = (r: Raw, i: number, c: number[]) => Math.abs(r.data[i] - c[0]) <= BACKDROP_TOLERANCE && Math.abs(r.data[i + 1] - c[1]) <= BACKDROP_TOLERANCE && Math.abs(r.data[i + 2] - c[2]) <= BACKDROP_TOLERANCE;

const CORNER = 0.05;

/** Pixel offsets of each corner patch. A pack cropped tight still leaves the corners of the picture to the backdrop. */
function cornerPatches(r: Raw): number[][] {
    const side = Math.max(4, Math.round(Math.min(r.width, r.height) * CORNER));
    return [[0, 0], [r.width - side, 0], [0, r.height - side], [r.width - side, r.height - side]].map(([left, top]) => {
        const out: number[] = [];
        for (let y = top; y < top + side; y++) for (let x = left; x < left + side; x++) out.push((y * r.width + x) * r.channels);
        return out;
    });
}

/** The backdrop's colour and how much of the picture's edge it holds. A colour of null means a scene: a table, a shelf, a room. */
export function backdropOf(r: Raw): { colour: number[] | null; ring: number } {
    const patches = cornerPatches(r);
    const all = patches.flat();
    const colour = [0, 1, 2].map((c) => median(all.map((i) => r.data[i + c])));
    const corners = patches.filter((p) => p.filter((i) => near(r, i, colour)).length >= p.length * 0.9).length;
    const edge = ringPixels(r);
    const ring = edge.filter((i) => near(r, i, colour)).length / (edge.length || 1);
    return { colour: (corners >= PLAIN_CORNERS && ring >= PLAIN_RING_SHARE) || ring >= CLEAR_RING_SHARE ? colour : null, ring };
}

/** Everything not joined to the edge by backdrop colour. */
function maskFrom(r: Raw, colour: number[]): Uint8Array {
    const { width, height, channels } = r;
    const mask = new Uint8Array(width * height).fill(1);
    const stack: number[] = [];
    const visit = (p: number) => {
        if (mask[p] && near(r, p * channels, colour)) { mask[p] = 0; stack.push(p); }
    };
    for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
    while (stack.length) {
        const p = stack.pop()!;
        const x = p % width;
        if (x > 0) visit(p - 1);
        if (x < width - 1) visit(p + 1);
        if (p >= width) visit(p - width);
        if (p + width < mask.length) visit(p + width);
    }
    return mask;
}

/** Laplacian variance over the product, on the sampled picture: low means soft. */
function sharpnessOf(r: Raw, box: Box): number {
    const grey = (x: number, y: number) => { const i = (y * r.width + x) * r.channels; return 0.299 * r.data[i] + 0.587 * r.data[i + 1] + 0.114 * r.data[i + 2]; };
    let sum = 0, squares = 0, n = 0;
    for (let y = Math.max(1, box.top); y < Math.min(r.height - 1, box.bottom); y++) {
        for (let x = Math.max(1, box.left); x < Math.min(r.width - 1, box.right); x++) {
            const v = grey(x - 1, y) + grey(x + 1, y) + grey(x, y - 1) + grey(x, y + 1) - 4 * grey(x, y);
            sum += v; squares += v * v; n++;
        }
    }
    return n ? squares / n - (sum / n) ** 2 : 0;
}

/** How far the product stands from the backdrop, mean colour against mean colour. 255 when there is no backdrop to compare. */
function contrastOf(r: Raw, mask: Uint8Array, colour: number[]): number {
    const sum = [0, 0, 0];
    let n = 0;
    for (let p = 0; p < mask.length; p++) {
        if (!mask[p]) continue;
        for (let c = 0; c < 3; c++) sum[c] += r.data[p * r.channels + c];
        n++;
    }
    return n ? Math.max(...sum.map((v, c) => Math.abs(v / n - colour[c]))) : 0;
}

export interface Fingerprint { hash: Uint8Array; histogram: Float32Array; aspect: number; fill: number; touchesEdge: boolean; plain: boolean; studioBackdrop: boolean; ring: number; sharpness: number; contrast: number; canvasAspect: number }

/** 64-bit DCT hash of a 32x32 grey image. */
function phash(grey: number[]): Uint8Array {
    const n = 32;
    const dct: number[] = [];
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;
            for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) sum += grey[x * n + y] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n)) * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * n));
            dct.push(sum);
        }
    }
    const sorted = dct.slice(1).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return Uint8Array.from(dct.map((d) => (d > median ? 1 : 0)));
}

/** Compared over the product area, so a studio shot and a phone shot of one pack can meet. */
export async function fingerprint(input: Buffer): Promise<Fingerprint> {
    const r = await rawRgb(input, SAMPLE);
    const { colour, ring } = backdropOf(r);
    const mask = colour ? maskFrom(r, colour) : null;
    const edge = { left: Math.round(r.width * 0.1), top: Math.round(r.height * 0.1), right: Math.round(r.width * 0.9), bottom: Math.round(r.height * 0.9) };
    const box = (mask && boxOf(mask, r.width, r.height)) || edge;
    const w = Math.max(1, box.right - box.left), h = Math.max(1, box.bottom - box.top);
    const histogram = new Float32Array(64);
    let count = 0;
    for (let y = box.top; y < box.bottom; y++) {
        for (let x = box.left; x < box.right; x++) {
            const i = (y * r.width + x) * r.channels;
            histogram[(r.data[i] >> 6) * 16 + (r.data[i + 1] >> 6) * 4 + (r.data[i + 2] >> 6)]++;
            count++;
        }
    }
    for (let i = 0; i < histogram.length; i++) histogram[i] /= count || 1;
    const small = await sharp(r.data, { raw: { width: r.width, height: r.height, channels: r.channels as 3 } })
        .extract({ left: box.left, top: box.top, width: w, height: h }).resize(32, 32, { fit: 'fill' }).greyscale().raw().toBuffer();
    return {
        hash: phash([...small]), histogram, aspect: w / h, fill: Math.max(w / r.width, h / r.height),
        touchesEdge: box.left <= 1 || box.top <= 1 || box.right >= r.width - 1 || box.bottom >= r.height - 1,
        plain: !!colour, studioBackdrop: !!colour && isStudioBackdrop(colour), ring, sharpness: sharpnessOf(r, box), contrast: mask && colour ? contrastOf(r, mask, colour) : 255, canvasAspect: Math.max(r.width / r.height, r.height / r.width),
    };
}

export const hashDistance = (a: Fingerprint, b: Fingerprint) => a.hash.reduce((n, v, i) => n + (v === b.hash[i] ? 0 : 1), 0);

/** 0 unrelated, 1 same picture. A guide only: vision decides identity. */
export function similarity(a: Fingerprint, b: Fingerprint): number {
    const shape = Math.max(0, 1 - hashDistance(a, b) / 32);
    let colour = 0;
    for (let i = 0; i < a.histogram.length; i++) colour += Math.min(a.histogram[i], b.histogram[i]);
    return (shape + colour) / 2;
}
