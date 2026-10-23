import * as jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { analyseBuffer, rankScored, scoreCandidate, type Visual } from '../image-quality';

/** Paint a W×H image: background colour, then a product rectangle. */
function paint(w: number, h: number, bg: (x: number, y: number) => [number, number, number], box?: { x0: number; y0: number; x1: number; y1: number; c: [number, number, number] }) {
    const data = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const inBox = box && x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
        const [r, g, b] = inBox ? box!.c : bg(x, y);
        const i = (y * w + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return data;
}
const asJpeg = (w: number, h: number, data: Buffer) => jpeg.encode({ width: w, height: h, data }, 92).data;
const can: [number, number, number] = [30, 60, 160];   // a blue can

describe('measuring a photo from its pixels', () => {
    it('a can centred on white is a white-background packshot, not cropped', () => {
        const v = analyseBuffer(asJpeg(300, 400, paint(300, 400, () => [255, 255, 255], { x0: 100, y0: 60, x1: 200, y1: 340, c: can })));
        expect(v).toMatchObject({ analysed: true, background: 'white', touches: [] });
        if (v.analysed) { expect(v.whiteBorder).toBeGreaterThan(0.95); expect(v.coverage).toBeGreaterThan(0.2); expect(v.coverage).toBeLessThan(0.3); }
    });

    it('near-white (#F7F7F7) still counts as white; light grey studio counts as neutral', () => {
        expect(analyseBuffer(asJpeg(200, 200, paint(200, 200, () => [247, 247, 247], { x0: 60, y0: 40, x1: 140, y1: 160, c: can })))).toMatchObject({ background: 'white' });
        expect(analyseBuffer(asJpeg(200, 200, paint(200, 200, () => [205, 205, 208], { x0: 60, y0: 40, x1: 140, y1: 160, c: can })))).toMatchObject({ background: 'light_neutral', touches: [] });
    });

    it('a pack cut out on white and cropped to the pack is whole ("tight"), the usual Open Food Facts crop', () => {
        const v = analyseBuffer(asJpeg(200, 300, paint(200, 300, () => [255, 255, 255], { x0: 40, y0: 0, x1: 160, y1: 300, c: can })));
        expect(v).toMatchObject({ analysed: true, background: 'white', fit: 'tight', cleanCorners: 4 });
        if (v.analysed) expect(v.touches.sort()).toEqual(['bottom', 'top']);
    });

    it('a pack filling a phone photo, with no clean corners, is cut off', () => {
        const grey = (x: number, y: number): [number, number, number] => [150 + ((x + y) % 40), 140 + ((x * 3) % 30), 120];
        const v = analyseBuffer(asJpeg(200, 300, paint(200, 300, grey, { x0: 0, y0: 0, x1: 200, y1: 280, c: can })));
        expect(v).toMatchObject({ analysed: true, background: 'busy', fit: 'cut' });
    });

    it('a shelf / hand-held photo (busy background) is busy', () => {
        const noisy = (x: number, y: number): [number, number, number] => [(x * 37 + y * 11) % 256, (x * 13 + y * 29) % 256, (x * 7 + y * 53) % 256];
        expect(analyseBuffer(asJpeg(200, 200, paint(200, 200, noisy, { x0: 50, y0: 30, x1: 150, y1: 170, c: can })))).toMatchObject({ background: 'busy' });
    });

    it('a transparent PNG is judged as shown on white', () => {
        const png = new PNG({ width: 120, height: 160 });
        for (let i = 0; i < png.data.length; i += 4) { png.data[i + 3] = 0; }
        for (let y = 30; y < 130; y++) for (let x = 40; x < 80; x++) { const i = (y * 120 + x) * 4; png.data[i] = 30; png.data[i + 1] = 60; png.data[i + 2] = 160; png.data[i + 3] = 255; }
        expect(analyseBuffer(PNG.sync.write(png))).toMatchObject({ analysed: true, background: 'white', touches: [] });
    });

    it('unreadable bytes are "not checked", never guessed', () => {
        expect(analyseBuffer(Buffer.from('not an image at all'))).toEqual({ analysed: false, reason: 'decode_failed' });
        expect(analyseBuffer(Buffer.from([0xff, 0xd8, 0x00, 0x01, 0x02]))).toEqual({ analysed: false, reason: 'decode_failed' });
    });
});

describe('scoring and tiers', () => {
    const white: Visual = { analysed: true, width: 300, height: 400, background: 'white', whiteBorder: 1, lightBorder: 1, borderSpread: 0, cleanCorners: 4, touches: [], fit: 'margin', coverage: 0.3 };
    const busy: Visual = { ...white, background: 'busy', whiteBorder: 0.1, lightBorder: 0.2, borderSpread: 50, cleanCorners: 0, touches: ['left', 'bottom'], fit: 'cut' };
    const exact = { confidence: 'verified' as const, reasons: ['name_matches', 'size_matches'], kind: 'front', width: 1200, height: 1600, license: 'CC BY-SA 3.0' };

    it('tier 1 needs exact identity, white background, nothing cut off and enough pixels', () => {
        expect(scoreCandidate(exact, white).tier).toBe(1);
        expect(scoreCandidate({ ...exact, width: 160, height: 400 }, white).tier).toBe(2);            // too small for a main photo
        expect(scoreCandidate(exact, { ...white, touches: ['top', 'bottom'], fit: 'tight' }).tier).toBe(1);   // cut out to the pack: whole
        expect(scoreCandidate(exact, { ...white, touches: ['top'], fit: 'cut' }).tier).toBe(2);
        expect(scoreCandidate(exact, busy).tier).toBe(3);
        expect(scoreCandidate(exact, { analysed: false, reason: 'download_failed' }).tier).toBe(3);   // unknown is never promoted
    });

    it('identity outranks looks: an unconfirmed white packshot ranks after a confirmed shelf photo', () => {
        const unconfirmed = { ...scoreCandidate({ ...exact, confidence: 'needs_confirmation', reasons: ['nothing_to_compare'] }, white), id: 'u' };
        const shelf = { ...scoreCandidate(exact, busy), id: 's' };
        expect(unconfirmed.tier).toBeNull();
        expect(rankScored([unconfirmed, shelf]).map((x) => x.id)).toEqual(['s', 'u']);
    });

    it('explains every point', () => {
        const s = scoreCandidate(exact, white);
        expect(s.breakdown.map((l) => l.key)).toEqual(expect.arrayContaining(['barcode_exact', 'name_matches', 'size_matches', 'background_white', 'not_cropped', 'resolution_high', 'kind_front']));
        expect(s.score).toBe(s.breakdown.reduce((a, l) => a + l.points, 0));
    });
});
