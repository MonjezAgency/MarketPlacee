import { decodeBarcode } from '../image-pipeline/barcode';
import { composeCutout, composeWhite, postCheck } from '../image-pipeline/compose';
import { gs1Country } from '../image-pipeline/gs1-prefixes';
import { parseGtin, sameCode, toGtin14 } from '../image-pipeline/gtin';
import { blockedDomain, domainClass, licenceOf, mayPublish } from '../image-pipeline/licensing';
import { cleanName } from '../image-pipeline/name';
import { domainPoints, identityTextPoints, resolutionPoints, total } from '../image-pipeline/scoring';
import { sharp } from '../image-pipeline/sharp';
import { judgeAnswer } from '../image-pipeline/vision';
import { checkDigit } from '../product-data-providers';
import { ean13Png, pack } from './image-pipeline-fixtures';

describe('barcodes in every form', () => {
    it('refuses a wrong check digit', () => {
        expect(parseGtin('5449000000438').problem).toBe('invalid_ean');
        expect(parseGtin('5449000000439').problem).toBeUndefined();
        expect(parseGtin('abc').problem).toBe('invalid_ean');
    });
    it('a 12-digit UPC is the same item as its padded EAN-13', () => {
        expect(parseGtin('810116128839')).toMatchObject({ canonical: '0810116128839', searchCodes: ['0810116128839'] });
        expect(sameCode('810116128839', '0810116128839')).toBe(true);
        expect(toGtin14('810116128839')).toBe('00810116128839');
    });
    it('a case code finds its inner item, with the check digit worked out again', () => {
        expect(parseGtin('10810116128836')).toMatchObject({ caseCode: '10810116128836', inner: '0810116128839', searchCodes: ['10810116128836', '0810116128839'] });
        expect(sameCode('10810116128836', '0810116128839')).toBe(false);
    });
    it('a leading zero on 14 digits is the retail item; indicator 9 is variable measure; store numbers mean nothing', () => {
        expect(parseGtin('05449000000439')).toMatchObject({ canonical: '5449000000439' });
        expect(parseGtin(`9081011612883${checkDigit('9081011612883')}`).problem).toBe('variable_measure');
        expect(parseGtin('2000000000015').problem).toBe('internal_code');
    });
    it('the GS1 prefix hints at a country and pack language', () => {
        expect(gs1Country('4008400401829')).toMatchObject({ language: 'de' });
        expect(gs1Country('8000500150245')).toMatchObject({ language: 'it' });
        expect(gs1Country('5941143028849')).toMatchObject({ language: 'ro' });
        expect(gs1Country('8710000000000')).toMatchObject({ language: 'nl' });
    });
});

describe('cleaning supplier names', () => {
    it('German: article codes, Stk and Gr. come out', () => {
        const n = cleanName('Art. 12345 Milka Alpenmilch Schokolade 100 Gr. 24 Stk', 'Milka');
        expect(n.brand).toBe('Milka');
        expect(n.size).toMatch(/100\s?g/);
        expect(n.clean.toLowerCase()).not.toContain('art.');
        expect(n.english.toLowerCase()).toContain('chocolate');
    });
    it('Romanian keeps the words and repeats the brand once', () => {
        const n = cleanName('Fairy Fairy Detergent lichid vase 900ml', 'Fairy');
        expect(n.clean.match(/fairy/gi)).toHaveLength(1);
        expect(n.size).toMatch(/900\s?ml/);
    });
    it('Dutch: wasmiddel and a size', () => {
        const n = cleanName('Ariel wasmiddel vloeibaar 1,5L', 'Ariel');
        expect(n.size.replace(',', '.')).toMatch(/1\.5\s?l/i);
        expect(n.variant.length).toBeGreaterThan(0);
    });
    it('"Gr. 4" on nappies is a clothing size, never grams', () => {
        expect(cleanName('Pampers Active Baby Gr. 4 76 Stk', 'Pampers').size).not.toMatch(/4\s?g\b/);
    });
});

describe('the points', () => {
    it('resolution: 800 is 40%, 1000 is 70%, 1500 is all of it', () => {
        expect(resolutionPoints(799)).toBe(0);
        expect(resolutionPoints(800)).toBe(8);
        expect(resolutionPoints(1000)).toBe(14);
        expect(resolutionPoints(1500)).toBe(20);
        expect(resolutionPoints(4000)).toBe(20);
    });
    it('domain: brand, retailer, database, unknown', () => {
        expect(['brand', 'retailer', 'ean_database', 'unknown'].map((c) => domainPoints(c as any))).toEqual([10, 7, 5, 2]);
    });
    it('the barcode on a page is enough; a name is a signal, and 500 is never 600', () => {
        const id = { brand: 'Monster', size: '500ml', variant: ['aussie', 'lemonade'], name: '', english: '' };
        expect(identityTextPoints({ url: 'x', title: 'item 5060947546957' }, id, ['5060947546957'])).toBe(20);
        expect(identityTextPoints({ url: 'x', title: 'Monster Aussie Lemonade 500ml' }, id, [])).toBe(20);
        expect(identityTextPoints({ url: 'x', title: 'Monster Aussie Lemonade 600ml' }, id, [])).toBe(14);
        expect(identityTextPoints({ url: 'x', title: 'Red Bull' }, id, [])).toBe(0);
    });
    it('caps at 100', () => {
        expect(total({ white: 30, resolution: 20, identityText: 20, visual: 15, domain: 10, framing: 5, barcode: 15 })).toBe(100);
        expect(total({ white: 30, resolution: 14, identityText: 8, visual: 0, domain: 2, framing: 5, barcode: 0 })).toBe(59);
    });
});

describe('licences', () => {
    const sure = { confidence: 0.95, domain: 'retailer' as const };
    it('A sends every unknown licence to a person', () => {
        expect(mayPublish({ ...sure, licence: 'unknown' }, 'A')).toBe(false);
        expect(mayPublish({ ...sure, licence: 'cc_by_sa' }, 'A')).toBe(true);
        expect(mayPublish({ ...sure, licence: 'supplier' }, 'A')).toBe(true);
    });
    it('B allows unknown only at 0.9+, from a brand or major retailer, never editorial', () => {
        expect(mayPublish({ ...sure, licence: 'unknown' }, 'B')).toBe(true);
        expect(mayPublish({ ...sure, confidence: 0.89, licence: 'unknown' }, 'B')).toBe(false);
        expect(mayPublish({ ...sure, domain: 'unknown', licence: 'unknown' }, 'B')).toBe(false);
        expect(mayPublish({ ...sure, domain: 'ean_database', licence: 'unknown' }, 'B')).toBe(false);
        expect(mayPublish({ ...sure, licence: 'unknown', isEditorial: true }, 'B')).toBe(false);
    });
    it('editorial and unbought stock never publish, at any confidence', () => {
        expect(mayPublish({ ...sure, confidence: 1, licence: 'editorial' }, 'B')).toBe(false);
        expect(mayPublish({ ...sure, confidence: 1, licence: 'stock_licensed' }, 'B')).toBe(false);
    });
    it('knows brands, retailers and blocked hosts by the label, not by a substring', () => {
        expect(domainClass({ url: 'https://images.ctfassets.net/a.png', pageUrl: 'https://www.ferrero.com/nutella' }, 'Nutella')).toBe('brand');
        expect(domainClass({ url: 'https://x.tesco.com/a.png' }, 'Nutella')).toBe('retailer');
        expect(domainClass({ url: 'https://nutella-fans.example.com/a.png' }, 'Nutella')).toBe('unknown');
        expect(blockedDomain({ url: 'https://ae01.alicdn.com/a.png', source: 'serper' })).toBeTruthy();
        expect(licenceOf({ url: 'https://x', source: 'serper' }, 'brand')).toBe('manufacturer');
    });
});

describe('the vision answer', () => {
    const good = { best_index: 1, read_text: 'Monster Energy Aussie Lemonade 500ml', same_product: true, same_variant: true, same_size_or_count: true, front_face: true, single_product: true, studio_quality: true, hand_shelf_or_lifestyle: false, watermark_or_overlay: false, matches_reference_style: true, confidence: 0.92, reason: '' };
    it('passes only when every rule holds', () => {
        expect(judgeAnswer(good, 5, 'Monster')).toMatchObject({ passed: true, index: 1 });
        expect(judgeAnswer({ ...good, same_variant: false }, 5, 'Monster').failed).toEqual(['same_variant']);
        expect(judgeAnswer({ ...good, watermark_or_overlay: true }, 5, 'Monster').passed).toBe(false);
    });
    it('0.8 is the floor; 0.79 is a no', () => {
        expect(judgeAnswer({ ...good, confidence: 0.8 }, 5, 'Monster').passed).toBe(true);
        expect(judgeAnswer({ ...good, confidence: 0.79 }, 5, 'Monster').passed).toBe(false);
    });
    it('a brand it did not read, a bad index, or no answer are all failures', () => {
        expect(judgeAnswer({ ...good, read_text: 'energy drink' }, 5, 'Monster').failed).toContain('brand_not_read');
        expect(judgeAnswer({ ...good, best_index: 9 }, 5, 'Monster').failed).toContain('best_index');
        expect(judgeAnswer(null, 5, 'Monster').passed).toBe(false);
    });
});

describe('the printed barcode', () => {
    it('reads an EAN-13 from a photo, locally', async () => {
        expect(await decodeBarcode(await ean13Png('5449000000439'))).toBe('5449000000439');
    });
    it('a photo without one gives null', async () => {
        expect(await decodeBarcode(await pack({ colour: '#cc2222' }))).toBeNull();
    });
});

describe('the house layout', () => {
    it('on white: 1000x1000, 880 longest side, centred, corners exactly white', async () => {
        const out = await composeWhite(await pack({ width: 1200, height: 1500, boxWidth: 600, boxHeight: 1000 }));
        expect(out).toMatchObject({ status: 'ok', engine: 'sharp' });
        if (out.status !== 'ok') throw new Error('no');
        expect(out.checks).toMatchObject({ corners: true, centred: true });
        expect(Math.abs(out.checks.longestSide - 880)).toBeLessThanOrEqual(2);
        expect(await sharp(out.jpeg).metadata()).toMatchObject({ width: 1000, height: 1000, format: 'jpeg' });
        expect(await sharp(out.webp).metadata()).toMatchObject({ format: 'webp' });
    });
    it('would need more than 1.5x: low resolution, never enlarged', async () => {
        const out = await composeWhite(await pack({ width: 900, height: 900, boxWidth: 300, boxHeight: 400 }));
        expect(out).toMatchObject({ status: 'low_res' });
    });
    it('an off-centre or small picture fails the post-check', async () => {
        const bad = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#ffffff' } })
            .composite([{ input: await sharp({ create: { width: 500, height: 880, channels: 3, background: '#223344' } }).png().toBuffer(), left: 40, top: 60 }]).jpeg({ quality: 95 }).toBuffer();
        expect((await postCheck(bad)).ok).toBe(false);
    });
    it('a cut-out that eats the bottle neck goes to a person', async () => {
        const original = await pack({ width: 1200, height: 1200, boxWidth: 500, boxHeight: 1000, background: '#88aacc', colour: '#113355' });
        const eaten = async (image: Buffer) => {
            const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            for (let p = 0; p < info.width * info.height; p++) {
                const x = p % info.width, y = Math.floor(p / info.width);
                const body = x >= 350 && x < 850 && y >= 300 && y < 1100;
                data[p * 4 + 3] = body ? 255 : 0;
            }
            return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
        };
        const out = await composeCutout(original, eaten);
        expect(out).toMatchObject({ status: 'needs_review' });
        expect((out as any).reason).toMatch(/subject_loss/);
    });
    it('a clean cut-out passes', async () => {
        const original = await pack({ width: 1200, height: 1200, boxWidth: 500, boxHeight: 1000, background: '#88aacc', colour: '#113355' });
        const clean = async (image: Buffer) => {
            const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            for (let p = 0; p < info.width * info.height; p++) { const x = p % info.width, y = Math.floor(p / info.width); data[p * 4 + 3] = x >= 350 && x < 850 && y >= 100 && y < 1100 ? 255 : 0; }
            return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
        };
        expect(await composeCutout(original, clean)).toMatchObject({ status: 'ok', engine: 'photoroom' });
    });
});
