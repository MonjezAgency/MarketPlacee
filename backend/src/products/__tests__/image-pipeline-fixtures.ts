import { sharp } from '../image-pipeline/sharp';

/** Made-up pictures. No real product is in any of them. */

/** Fine lines over the pack, as printed text is on a real one, so a sharp picture measures sharp. */
async function print(width: number, height: number): Promise<Buffer> {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = (x >> 1) % 2 && (y >> 2) % 2 ? 120 : 0;
    return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export async function pack(o: { width?: number; height?: number; boxWidth?: number; boxHeight?: number; colour?: string; background?: string; stripe?: number } = {}): Promise<Buffer> {
    const { width = 1200, height = 1200, boxWidth = 600, boxHeight = 1000, colour = '#1a5fb4', background = '#ffffff', stripe = 0 } = o;
    const box = await sharp({ create: { width: boxWidth, height: boxHeight, channels: 3, background: colour } })
        .composite([{ input: await print(boxWidth, boxHeight) }, { input: await sharp({ create: { width: Math.round(boxWidth * 0.6), height: Math.round(boxHeight * 0.12), channels: 3, background: '#f5c211' } }).png().toBuffer(), left: Math.round(boxWidth * 0.2), top: Math.round(boxHeight * (0.1 + stripe * 0.15)) }]).png().toBuffer();
    return sharp({ create: { width, height, channels: 3, background } })
        .composite([{ input: box, left: Math.round((width - boxWidth) / 2), top: Math.round((height - boxHeight) / 2) }]).png().toBuffer();
}

/** A shelf: colour everywhere, right to the edge. */
export async function shelf(): Promise<Buffer> {
    const width = 1200, height = 1000;
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        data[i] = (x / 3 + y / 7) % 200;
        data[i + 1] = (x * y / 900) % 160;
        data[i + 2] = (y / 2) % 180;
    }
    return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((b) => [...b].map((c) => (c === '0' ? '1' : '0')).reverse().join(''));
const R = L.map((b) => [...b].map((c) => (c === '0' ? '1' : '0')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** An EAN-13 drawn bar by bar. */
export async function ean13Png(code: string, canvas?: { width: number; height: number }): Promise<Buffer> {
    const d = [...code].map(Number);
    const left = d.slice(1, 7).map((n, i) => (PARITY[d[0]][i] === 'L' ? L[n] : G[n])).join('');
    const right = d.slice(7).map((n) => R[n]).join('');
    const bits = `101${left}01010${right}101`;
    const unit = 6, quiet = 12 * unit, barHeight = 300;
    const width = bits.length * unit + quiet * 2, height = barHeight + 80;
    const data = Buffer.alloc(width * height, 255);
    for (let y = 40; y < 40 + barHeight; y++) for (let i = 0; i < bits.length; i++) if (bits[i] === '1') data.fill(0, y * width + quiet + i * unit, y * width + quiet + (i + 1) * unit);
    const barcode = await sharp(data, { raw: { width, height, channels: 1 } }).png().toBuffer();
    if (!canvas) return barcode;
    return sharp({ create: { width: canvas.width, height: canvas.height, channels: 3, background: '#ffffff' } })
        .composite([{ input: barcode, left: Math.round((canvas.width - width) / 2), top: Math.round((canvas.height - height) / 2) }]).png().toBuffer();
}
