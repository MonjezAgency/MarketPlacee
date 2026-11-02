import { isStudioBackdrop } from '../image-pipeline/pixels';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { FileBudget, FREE_ALLOWANCE, MemoryBudget } from '../image-pipeline/budget';
import { MemoryCache, SourceHttp } from '../image-pipeline/http';
import { buildIdentity, searchQueries } from '../image-pipeline/identity';
import { barcodeSpider, eanDb, serper } from '../image-pipeline/sources';
import type { SourceCall } from '../image-pipeline/types';
import { decodeBarcode } from '../image-pipeline/barcode';
import { composeCutout, composeWhite, postCheck } from '../image-pipeline/compose';
import { gs1Country } from '../image-pipeline/gs1-prefixes';
import { parseGtin, sameCode, toGtin14 } from '../image-pipeline/gtin';
import { blockedDomain, domainClass, licenceOf, mayPublish } from '../image-pipeline/licensing';
import { cleanName } from '../image-pipeline/name';
import { domainPoints, flawsOf, identityTextPoints, isStudio, resolutionPoints, total } from '../image-pipeline/scoring';
import { fingerprint } from '../image-pipeline/pixels';
import { uploadedPhotos } from '../product-data-providers';
import { perImage } from '../image-pipeline/vision';
import { sharp } from '../image-pipeline/sharp';
import { judgeAnswer } from '../image-pipeline/vision';
import { checkDigit } from '../product-data-providers';
import { ean13Png, pack, shelf } from './image-pipeline-fixtures';

const studioBackdropCases: [number[], boolean][] = [[[255, 255, 255], true], [[136, 170, 204], true], [[200, 20, 30], false], [[25, 22, 20], false]];

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
        expect(total({ white: 30, resolution: 20, identityText: 20, visual: 15, domain: 10, framing: 5, barcode: 15, penalty: 0 })).toBe(100);
        expect(total({ white: 30, resolution: 14, identityText: 8, visual: 0, domain: 2, framing: 5, barcode: 0, penalty: 0 })).toBe(59);
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
    const good = { best_index: 1, read_text: 'Monster Energy Aussie Lemonade 500ml', same_product: true, same_variant: true, same_size_or_count: true, front_face: true, single_product: true, edges_clean: true, no_leftover_background: true, hand_fragments: false, pack_not_cut: true, text_readable: true, straight_on: true, watermark_or_overlay: false, confidence: 0.92, reason: '' };
    it('passes only when every rule holds', () => {
        expect(judgeAnswer(good, 5, 'Monster')).toMatchObject({ passed: true, index: 1 });
        expect(judgeAnswer({ ...good, same_variant: false }, 5, 'Monster').failed).toEqual(['same_variant']);
        expect(judgeAnswer({ ...good, watermark_or_overlay: true }, 5, 'Monster').passed).toBe(false);
    });
    it('0.9 is the floor; 0.89 is a no', () => {
        expect(judgeAnswer({ ...good, confidence: 0.9 }, 5, 'Monster').passed).toBe(true);
        expect(judgeAnswer({ ...good, confidence: 0.89 }, 5, 'Monster').passed).toBe(false);
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

describe('what speaks against a photo', () => {
    const good = { plain: true, studioBackdrop: true, ring: 1, fill: 0.8, sharpness: 900, contrast: 120, canvasAspect: 1.2 } as any;
    it('a clean packshot has no flaws', () => expect(flawsOf(good, {}, '')).toEqual([]));
    it('names each failure', () => {
        expect(flawsOf({ ...good, plain: false }, {}, '')).toEqual(['busy_background']);
        expect(flawsOf({ ...good, studioBackdrop: false }, {}, '')).toEqual(['busy_background']);
        expect(flawsOf({ ...good, ring: 0.45 }, {}, '')).toEqual(['close_up']);
        expect(flawsOf({ ...good, canvasAspect: 3.4 }, {}, '')).toEqual(['close_up']);
        expect(flawsOf({ ...good, fill: 0.4 }, {}, '')).toEqual(['small_in_frame']);
        expect(flawsOf({ ...good, sharpness: 100 }, {}, '')).toEqual(['blurry']);
        expect(flawsOf({ ...good, contrast: 20 }, {}, '')).toEqual(['low_contrast']);
        expect(flawsOf(good, { role: 'back' }, '')).toEqual(['back_of_pack']);
    });
    it('a multipack only counts when the row is not one', () => {
        expect(flawsOf(good, { title: 'Red Bull 24 x 250ml' }, '250 ml')).toEqual(['multipack']);
        expect(flawsOf(good, { title: 'Red Bull 24 x 250ml' }, '24 x 250 ml')).toEqual([]);
    });
    it('a barcode in shot alone does not rule a photo out', () => {
        expect(isStudio(['shows_barcode'])).toBe(true);
        expect(isStudio(['shows_barcode', 'blurry'])).toBe(false);
    });
    it('white, plain and scene read as they look', async () => {
        const white = await fingerprint(await pack());
        expect(white).toMatchObject({ plain: true, touchesEdge: false });
        expect((await fingerprint(await pack({ background: '#d8d4cc' }))).plain).toBe(true);
        expect((await fingerprint(await shelf())).plain).toBe(false);
    });
});

describe('every upload of a record', () => {
    const size = (w: number, h: number, t = 1) => ({ sizes: { full: { w, h } }, uploaded_t: t });
    it('takes the full file, skips small ones and marks the back', () => {
        const out = uploadedPhotos({ 1: size(2000, 1500), 2: size(400, 300), 3: size(1000, 1000), ingredients_en: { imgid: '3' }, front_en: { imgid: '1' } }, 'https://images.openfoodfacts.org', '3017620422003');
        expect(out.map((p) => p.url)).toEqual(['https://images.openfoodfacts.org/images/products/301/762/042/2003/3.jpg', 'https://images.openfoodfacts.org/images/products/301/762/042/2003/1.jpg']);
        expect(out[0].kind).toBe('back');
    });
    it('short codes keep one folder', () => expect(uploadedPhotos({ 1: size(900, 900) }, 'https://x', '80052760')[0].url).toBe('https://x/images/products/80052760/1.jpg'));
    it('a product with hundreds keeps the newest and a spread of the old', () => {
        const many = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [String(i + 1), size(1000, 1000, i)]));
        const out = uploadedPhotos(many, 'https://x', '3017620422003');
        expect(out).toHaveLength(24);
        expect(out[0].imgid).toBe('300');
        expect(Number(out[23].imgid)).toBeLessThan(60);
    });
});

describe('one answer per photo', () => {
    it('reads each entry, and a flat answer counts only for the photo it names', () => {
        expect(perImage({ images: [{ index: 1, a: 1 }, { index: 9 }] }, 3)).toEqual([null, { index: 1, a: 1 }, null]);
        expect(perImage({ best_index: 2, a: 1 }, 3)).toEqual([null, null, { best_index: 2, a: 1 }]);
        expect(perImage(null, 2)).toEqual([null, null]);
    });
});

describe('brand disagreements', () => {
    const says = (rowBrand: string, sourceBrand: string) => buildIdentity(parseGtin('3017620422003')!, cleanName(`${rowBrand} spread 350g`, rowBrand), [
        { source: 'openfoodfacts', code: '3017620422003', name: null, brand: sourceBrand, quantity: null, imageUrls: [] },
    ]).conflicts;
    it('a company that owns the brand is no disagreement', () => expect(says('Nutella', 'Ferrero')).toEqual([]));
    it('another brand of the same company still is', () => expect(says('Pampers', 'Fairy')).toHaveLength(1));
    it('a stranger still is', () => expect(says('Nutella', 'Nocilla')).toHaveLength(1));
});

describe('spending limits', () => {
    const ok = (body: unknown) => ({ status: 200, text: async () => JSON.stringify(body) });
    const noWait = async () => undefined;
    const images = { images: [{ imageUrl: 'https://shop.tesco.com/a.jpg', title: 't', imageWidth: 1000, imageHeight: 1000 }], credits: 1 };
    const fresh = () => { delete process.env.SERPER_MONTHLY_CAP; process.env.SERPER_API_KEY = 'test'; };
    afterAll(() => { delete process.env.SERPER_API_KEY; delete process.env.SERPER_MONTHLY_CAP; });

    it('Serper stops at the cap, without an error, and warns once', async () => {
        fresh();
        process.env.SERPER_MONTHLY_CAP = '2';
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const fetcher = jest.fn(async () => ok(images)) as any;
        const source = serper(new SourceHttp(new MemoryCache(), fetcher, noWait), new MemoryBudget());
        const calls: SourceCall[] = [];
        for (const q of ['a', 'b', 'c', 'd']) await source.search(q, '1', 'en', calls);
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(calls.map((c) => c.status)).toEqual([200, 200, 'skipped', 'skipped']);
        expect(warn.mock.calls.filter(([m]) => /cap of 2/.test(String(m)))).toHaveLength(1);
        warn.mockRestore();
    });
    it('a cached search spends nothing, and is kept 90 days', async () => {
        fresh();
        const cache = new MemoryCache();
        const set = jest.spyOn(cache, 'set');
        const budget = new MemoryBudget();
        const fetcher = jest.fn(async () => ok(images)) as any;
        const source = serper(new SourceHttp(cache, fetcher, noWait), budget);
        await source.search('a', '1', 'en', []);
        const again = await source.search('a', '1', 'en', []);
        expect(again).toHaveLength(1);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(await budget.used('serper', 'month')).toBe(1);
        expect((set.mock.calls[0] as unknown[])[2]).toBe(90);
    });
    it('a failed search is not repeated by itself', async () => {
        fresh();
        const fetcher = jest.fn(async () => ({ status: 500, text: async () => '' })) as any;
        await serper(new SourceHttp(new MemoryCache(), fetcher, noWait), new MemoryBudget()).search('a', '1', 'en', []);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('a refused key is tried once, then left alone, and the allowance stops counting', async () => {
        fresh();
        const budget = new MemoryBudget();
        const fetcher = jest.fn(async () => ({ status: 403, text: async () => '{}' })) as any;
        const source = serper(new SourceHttp(new MemoryCache(), fetcher, noWait), budget);
        const calls: SourceCall[] = [];
        for (const q of ['a', 'b', 'c']) await source.search(q, '1', 'en', calls);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(calls.map((c) => c.status)).toEqual([403, 'skipped', 'skipped']);
        expect(await budget.used('serper', 'month')).toBe(1);
    });
    it('the count starts over on the 1st', async () => {
        let now = Date.UTC(2026, 10, 30, 23, 59);
        const budget = new MemoryBudget(() => now);
        expect(await budget.reserve('serper', 1, 'month')).toBe(true);
        expect(await budget.reserve('serper', 1, 'month')).toBe(false);
        now = Date.UTC(2026, 11, 1, 0, 1);
        expect(await budget.reserve('serper', 1, 'month')).toBe(true);
    });
    it('the file count survives a restart', async () => {
        const file = join(tmpdir(), `budget-${process.pid}-${Date.now()}.json`);
        await new FileBudget(file).reserve('serper', 200, 'month');
        expect(await new FileBudget(file).used('serper', 'month')).toBe(1);
        unlinkSync(file);
    });
    it('a barcode database past its free allowance is skipped, not called', async () => {
        process.env.EANDB_API_KEY = 'test';
        const budget = new MemoryBudget();
        for (let i = 0; i < FREE_ALLOWANCE['ean-db'].limit; i++) await budget.reserve('ean-db', FREE_ALLOWANCE['ean-db'].limit, 'ever');
        const fetcher = jest.fn() as any;
        const calls: SourceCall[] = [];
        await eanDb(new SourceHttp(new MemoryCache(), fetcher, noWait), budget).lookup('1', '1', calls, 'food');
        delete process.env.EANDB_API_KEY;
        expect(fetcher).not.toHaveBeenCalled();
        expect(calls[0].status).toBe('skipped');
    });
    it('Barcode Spider stays off without a trial date in the future', () => {
        process.env.BARCODESPIDER_API_KEY = 'test';
        const source = barcodeSpider(new SourceHttp(new MemoryCache()), new MemoryBudget());
        expect(source.enabled()).toBe(false);
        process.env.BARCODESPIDER_TRIAL_UNTIL = '2999-01-01';
        expect(source.enabled()).toBe(true);
        delete process.env.BARCODESPIDER_API_KEY; delete process.env.BARCODESPIDER_TRIAL_UNTIL;
    });
    it('the search words are the barcode in quotes, then brand, name and size once each', () => {
        const identity: any = { ean: '5449000000439', brand: 'Acme', name: 'Acme Lemon 500ml', size: '500ml', packLanguage: 'de' };
        expect(searchQueries(identity)).toEqual([{ query: '"5449000000439"', language: 'en' }, { query: 'Acme Lemon 500ml', language: 'de' }]);
    });
});

it.each(studioBackdropCases)('backdrop %j counts as studio: %s', (colour, expected) => expect(isStudioBackdrop(colour)).toBe(expected));
