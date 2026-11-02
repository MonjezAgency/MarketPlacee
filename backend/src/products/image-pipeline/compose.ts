import { sharp } from './sharp';
import type { Sharp } from 'sharp';
import { areaOf, boxOf, rawRgb, subjectMask, type Raw } from './pixels';

export const CANVAS = 1000;
export const SUBJECT = 880;
/** Never enlarge more than this: a soft photo is not a packshot. */
export const MAX_UPSCALE = 1.5;
const TOLERANCE = 2;
const MAX_AREA_LOSS = 0.03;
/** How far a pixel must stand from a plain backdrop to count as product. */
const BACKDROP_DISTANCE = 30;
const BUSY_BACKDROP = 0.25;

export type ComposeOutcome =
    | { status: 'ok'; jpeg: Buffer; webp: Buffer; engine: 'sharp' | 'photoroom'; checks: Checks }
    | { status: 'low_res' | 'needs_review' | 'failed'; reason: string; engine: 'sharp' | 'photoroom'; checks: Partial<Checks> };
export interface Checks { corners: boolean; centred: boolean; longestSide: number; areaLoss: number | null; upscale: number }

async function exportBoth(canvas: Sharp) {
    const png = await canvas.png().toBuffer();
    return {
        png,
        jpeg: await sharp(png).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).withMetadata({ icc: 'srgb' }).toBuffer(),
        webp: await sharp(png).webp({ quality: 90 }).withMetadata({ icc: 'srgb' }).toBuffer(),
    };
}

/**
 * Exactly white corners, read from the JPEG that will be published; centred within 2px and longest side 880 within 2px.
 * JPEG rings a few pixels round a hard edge, which is no part of the product, so the box comes from the lossless picture when there is one.
 */
export async function postCheck(jpeg: Buffer, lossless?: Buffer): Promise<{ ok: boolean; corners: boolean; centred: boolean; longestSide: number; reason: string }> {
    const r = await rawRgb(jpeg);
    const at = (x: number, y: number) => { const i = (y * r.width + x) * r.channels; return [r.data[i], r.data[i + 1], r.data[i + 2]]; };
    const last = CANVAS - 1;
    const corners = r.width === CANVAS && r.height === CANVAS && [at(0, 0), at(last, 0), at(0, last), at(last, last)].every((p) => p.every((v) => v === 255));
    const measured = lossless ? await rawRgb(lossless) : r;
    const box = boxOf(subjectMask(measured, 250), measured.width, measured.height);
    if (!box) return { ok: false, corners, centred: false, longestSide: 0, reason: 'no_subject' };
    const w = box.right - box.left, h = box.bottom - box.top;
    const centred = Math.abs(box.left - (CANVAS - box.right)) <= TOLERANCE * 2 && Math.abs(box.top - (CANVAS - box.bottom)) <= TOLERANCE * 2;
    const longestSide = Math.max(w, h);
    const sized = Math.abs(longestSide - SUBJECT) <= TOLERANCE;
    const reason = !corners ? 'corners_not_white' : !centred ? 'not_centred' : !sized ? 'wrong_size' : '';
    return { ok: !reason, corners, centred, longestSide, reason };
}

/** Put the product on the house canvas: scaled to 880px on its longest side, centred, on pure white. */
async function place(rgb: Raw, mask: Uint8Array): Promise<{ canvas: Sharp; upscale: number } | null> {
    const box = boxOf(mask, rgb.width, rgb.height);
    if (!box) return null;
    const w = box.right - box.left, h = box.bottom - box.top;
    const scale = SUBJECT / Math.max(w, h);
    // Background goes to pure white, so nothing shows round the pack on the canvas.
    const clean = Buffer.from(rgb.data);
    for (let p = 0; p < mask.length; p++) if (!mask[p]) { const i = p * rgb.channels; clean[i] = 255; clean[i + 1] = 255; clean[i + 2] = 255; }
    const cut = await sharp(clean, { raw: { width: rgb.width, height: rgb.height, channels: rgb.channels as 3 } })
        .extract({ left: box.left, top: box.top, width: w, height: h })
        .resize(Math.round(w * scale), Math.round(h * scale), { kernel: 'lanczos3' }).png().toBuffer();
    const meta = await sharp(cut).metadata();
    const left = Math.round((CANVAS - meta.width!) / 2), top = Math.round((CANVAS - meta.height!) / 2);
    return { upscale: scale, canvas: sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: '#ffffff' } }).composite([{ input: cut, left, top }]) };
}

async function finish(placed: { canvas: Sharp; upscale: number }, engine: 'sharp' | 'photoroom', areaLoss: number | null): Promise<ComposeOutcome> {
    if (placed.upscale > MAX_UPSCALE) return { status: 'low_res', reason: `would need ${placed.upscale.toFixed(2)}x enlargement`, engine, checks: { upscale: placed.upscale } };
    const { jpeg, webp, png } = await exportBoth(placed.canvas);
    const c = await postCheck(jpeg, png);
    const checks: Checks = { corners: c.corners, centred: c.centred, longestSide: c.longestSide, areaLoss, upscale: placed.upscale };
    if (!c.ok) return { status: 'needs_review', reason: `layout_check_failed:${c.reason}`, engine, checks };
    // No plain backdrop to measure against: the vision gate looks at the finished picture for a cut pack.
    if (areaLoss !== null && areaLoss > MAX_AREA_LOSS) return { status: 'needs_review', reason: `subject_loss_${(areaLoss * 100).toFixed(1)}%`, engine, checks };
    return { status: 'ok', jpeg, webp, engine, checks };
}

/** Already on white: no paid call. */
export async function composeWhite(input: Buffer): Promise<ComposeOutcome> {
    const rgb = await rawRgb(input);
    const mask = subjectMask(rgb);
    // A white cap or a pale pack melts into the background at the lower level; the stricter one shows how much.
    const strict = subjectMask(rgb, 253);
    const loss = areaOf(strict) ? Math.max(0, 1 - areaOf(mask) / areaOf(strict)) : 0;
    const placed = await place(rgb, mask);
    if (!placed) return { status: 'failed', reason: 'no_subject', engine: 'sharp', checks: {} };
    return finish(placed, 'sharp', loss);
}

/** What the backdrop leaves when subtracted: the product as the original shows it, or null on a busy background. */
function backdropMask(rgb: Raw): Uint8Array | null {
    const { width, height, channels, data } = rgb;
    const band = Math.max(2, Math.round(Math.min(width, height) * 0.02));
    const border: number[][] = [[], [], []];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x >= band && x < width - band && y >= band && y < height - band) continue;
            const i = (y * width + x) * channels;
            for (let c = 0; c < 3; c++) border[c].push(data[i + c]);
        }
    }
    const median = border.map((b) => [...b].sort((m, n) => m - n)[Math.floor(b.length / 2)]);
    let stray = 0;
    for (let i = 0; i < border[0].length; i++) if (border.some((b, c) => Math.abs(b[i] - median[c]) > BACKDROP_DISTANCE)) stray++;
    if (stray / border[0].length > BUSY_BACKDROP) return null;
    const mask = new Uint8Array(width * height);
    for (let p = 0; p < mask.length; p++) {
        const i = p * channels;
        if ([0, 1, 2].some((c) => Math.abs(data[i + c] - median[c]) > BACKDROP_DISTANCE)) mask[p] = 1;
    }
    return mask;
}

/**
 * Off a coloured backdrop: the cut-out comes from Photoroom Basic, the layout
 * from here. The cut-out is compared with the original, because a transparent
 * bottle or a white cap is where a cut-out eats into the product.
 */
export async function composeCutout(original: Buffer, removeBackground: (image: Buffer) => Promise<Buffer>): Promise<ComposeOutcome> {
    const png = await removeBackground(original).catch(() => null);
    if (!png) return { status: 'failed', reason: 'photoroom_failed', engine: 'photoroom', checks: {} };
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = new Uint8Array(info.width * info.height);
    for (let p = 0; p < alpha.length; p++) alpha[p] = data[p * 4 + 3] > 16 ? 1 : 0;
    const rgb: Raw = { data: Buffer.alloc(alpha.length * 3), width: info.width, height: info.height, channels: 3 };
    for (let p = 0; p < alpha.length; p++) {
        const a = data[p * 4 + 3] / 255;
        for (let c = 0; c < 3; c++) rgb.data[p * 3 + c] = Math.round(data[p * 4 + c] * a + 255 * (1 - a));
    }
    const source = await rawRgb(original);
    const before = source.width === info.width && source.height === info.height ? backdropMask(source) : null;
    let loss: number | null = null;
    if (before) {
        let kept = 0, all = 0;
        for (let p = 0; p < before.length; p++) if (before[p]) { all++; if (alpha[p]) kept++; }
        loss = all ? 1 - kept / all : 0;
    }
    const placed = await place(rgb, alpha);
    if (!placed) return { status: 'failed', reason: 'no_subject', engine: 'photoroom', checks: {} };
    return finish(placed, 'photoroom', loss);
}
