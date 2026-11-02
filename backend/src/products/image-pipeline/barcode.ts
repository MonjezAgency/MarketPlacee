import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { sharp } from './sharp';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const zxing = require('zxing-wasm/reader');
const RETAIL = ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E'];
const LONGEST = 2000;

let ready: Promise<unknown> | null = null;
/** The wasm ships in the package; by default the library would fetch it from a CDN at run time. */
function prepare() {
    if (!ready) {
        const entry = require.resolve('zxing-wasm/reader');
        const candidates = [join(dirname(entry), 'zxing_reader.wasm'), join(dirname(entry), '..', '..', 'reader', 'zxing_reader.wasm')];
        const file = candidates.find((f) => { try { readFileSync(f, { flag: 'r' }); return true; } catch { return false; } });
        if (!file) throw new Error('zxing wasm not found');
        const bytes = readFileSync(file);
        const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
        ready = zxing.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
    }
    return ready;
}

/** The retail barcode printed in a photo, or null. A signal only: most packshots show none. */
export async function decodeBarcode(input: Buffer): Promise<string | null> {
    await prepare();
    const { data, info } = await sharp(input, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
        .resize(LONGEST, LONGEST, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const image = { data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: 'srgb' };
    const found: { isValid: boolean; text: string }[] = await zxing.readBarcodesFromImageData(image, { formats: RETAIL, tryHarder: true, maxNumberOfSymbols: 1 });
    const hit = found.find((f) => f.isValid && /^\d{8,14}$/.test(f.text));
    return hit ? hit.text : null;
}
