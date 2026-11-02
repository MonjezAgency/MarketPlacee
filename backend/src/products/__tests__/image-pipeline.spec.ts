import { MemoryCache } from '../image-pipeline/http';
import { ImagePipeline, type PipelineDeps } from '../image-pipeline/image-pipeline';
import type { LookupSource, SearchSource } from '../image-pipeline/sources';
import type { Candidate, IdentityRecord, PipelineRow } from '../image-pipeline/types';
import { SHADOW_VISION_MODEL, VisionGate } from '../image-pipeline/vision';
import { ean13Png, pack, shelf } from './image-pipeline-fixtures';

/** Recorded-shape answers; no network anywhere in this file. */
const answer = (o: Record<string, unknown> = {}) => ({ best_index: 0, read_text: 'Acme Lemon 500ml', same_product: true, same_variant: true, same_size_or_count: true, front_face: true, single_product: true, studio_quality: true, hand_shelf_or_lifestyle: false, watermark_or_overlay: false, matches_reference_style: true, confidence: 0.93, reason: 'clear front', ...o });
const reply = (a: unknown, cost = 0.004) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(a) } }], usage: { cost } }) });

const ean = '5449000000439';
const row: PipelineRow = { ean, name: 'Acme Lemon Drink 500ml', brand: 'Acme', category: 'Beverages' };

function db(candidates: Candidate[], record: Partial<IdentityRecord> = {}): LookupSource {
    return {
        id: 'ean-db', enabled: () => true,
        lookup: jest.fn(async (code) => ({ record: { source: 'ean-db' as const, code, name: 'Acme Lemon Drink', brand: 'Acme', quantity: '500 ml', imageUrls: [], ...record }, candidates })),
    };
}
const search = (candidates: Candidate[]): SearchSource => ({ id: 'serper', keyEnv: 'X', enabled: () => true, search: jest.fn(async () => candidates) });

function build(images: Record<string, Buffer>, sources: Partial<PipelineDeps>, vision: (body: any) => any) {
    const cache = new MemoryCache();
    const fetcher = jest.fn(async (_: string, init: any) => vision(JSON.parse(init.body))) as any;
    const deps: PipelineDeps = {
        lookups: [], searches: [], cache, vision: new VisionGate(cache, fetcher),
        download: async (url) => (images[url] ? { ok: true, bytes: images[url] } : { ok: false, reason: 'download_http_404' }),
        ...sources,
    };
    return { pipeline: new ImagePipeline(deps), fetcher };
}
const c = (url: string, o: Partial<Candidate> = {}): Candidate => ({ url, source: 'serper', pageUrl: 'https://shop.tesco.com/p', title: 'Acme Lemon Drink 500ml', width: 1200, height: 1200, ...o });

beforeEach(() => { process.env.OPENROUTER_API_KEY = 'test'; });
afterAll(() => { delete process.env.OPENROUTER_API_KEY; });

describe('a row through the pipeline', () => {
    it('a white studio shot from an open database is approved and laid out', async () => {
        const url = 'https://images.openfoodfacts.org/a.jpg';
        const { pipeline } = build({ [url]: await pack() }, { lookups: [db([c(url, { source: 'openfoodfacts', pageUrl: 'https://world.openfoodfacts.org/p', licence: 'cc_by_sa' })])] }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(r.status).toBe('approved');
        expect(r.publishable).toEqual({ A: true, B: true });
        expect(r.output?.jpeg.length).toBeGreaterThan(0);
        expect(r.trace.compose?.engine).toBe('sharp');
        expect(r.trace.calls.filter((x) => x.source === 'photoroom')).toEqual([]);
        expect(r.trace.cost.total).toBeCloseTo(0.004);
    });

    it('a shelf photo is stopped at vision', async () => {
        const url = 'https://shop.tesco.com/shelf.jpg';
        const { pipeline } = build({ [url]: await shelf() }, { searches: [search([c(url)])] }, () => reply(answer({ hand_shelf_or_lifestyle: true, studio_quality: false, confidence: 0.9, reason: 'on a shelf' })));
        const r = await pipeline.run(row);
        expect(r.status).toBe('needs_review');
        expect(r.reason).toMatch(/vision_failed.*hand_shelf_or_lifestyle/);
        expect(r.output).toBeUndefined();
    });

    it.each([
        ['Pampers Active Baby', 'Pampers', 'Pampers Pants 4'],
        ['Monster Aussie Lemonade 500ml', 'Monster', 'Monster Mango Loco'],
    ])('wrong variant for %s stops at vision', async (name, brand, read) => {
        const url = 'https://shop.tesco.com/v.jpg';
        const { pipeline } = build({ [url]: await pack() }, { searches: [search([c(url)])] }, () => reply(answer({ same_variant: false, read_text: read, confidence: 0.95, reason: `this is ${read}` })));
        const r = await pipeline.run({ ...row, name, brand });
        expect(r.status).toBe('needs_review');
        expect(r.reason).toMatch(/same_variant/);
        expect(r.publishable).toEqual({ A: false, B: false });
    });

    it('a printed barcode that differs throws the photo out before anyone pays to look', async () => {
        const url = 'https://shop.tesco.com/other.jpg';
        const { pipeline, fetcher } = build({ [url]: await ean13Png('5449000000996', { width: 1200, height: 1200 }) }, { searches: [search([c(url)])] }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(r.status).toBe('not_found');
        expect(r.trace.rejects[0].reason).toBe('barcode_differs:5449000000996');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('a printed barcode that matches adds its points', async () => {
        const url = 'https://images.openfoodfacts.org/same.jpg';
        const { pipeline } = build({ [url]: await ean13Png(ean, { width: 1200, height: 1200 }) }, { lookups: [db([c(url, { licence: 'cc_by_sa' })])] }, () => reply(answer({ studio_quality: false })));
        const r = await pipeline.run(row);
        expect(r.trace.barcode).toMatchObject({ decoded: 1, matched: 1 });
        expect(r.trace.scored[0].parts.barcode).toBe(15);
    });

    it('a transparent bottle whose neck the cut-out ate goes to a person', async () => {
        const url = 'https://images.openfoodfacts.org/bottle.jpg';
        const sharpMod = require('../image-pipeline/sharp').sharp;
        const original = await pack({ boxWidth: 500, boxHeight: 1000, background: '#88aacc', colour: '#113355' });
        const eaten = async (image: Buffer) => {
            const { data, info } = await sharpMod(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            for (let p = 0; p < info.width * info.height; p++) { const x = p % info.width, y = Math.floor(p / info.width); data[p * 4 + 3] = x >= 350 && x < 850 && y >= 300 && y < 1100 ? 255 : 0; }
            return sharpMod(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
        };
        const { pipeline } = build({ [url]: original }, { lookups: [db([c(url, { licence: 'cc_by_sa' })])], removeBackground: eaten }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(r.status).toBe('needs_review');
        expect(r.reason).toMatch(/subject_loss/);
        expect(r.trace.cost.bySource.photoroom).toBeCloseTo(0.02);
    });

    it('a sandbox Photoroom key is refused and said so', async () => {
        const url = 'https://images.openfoodfacts.org/c.jpg';
        const { pipeline } = build({ [url]: await pack({ background: '#88aacc' }) }, { lookups: [db([c(url, { licence: 'cc_by_sa' })])], removeBackground: async (b) => b, cutoutBlocked: () => 'photoroom_sandbox_key' }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(r).toMatchObject({ status: 'needs_review', reason: 'compose: photoroom_sandbox_key' });
    });

    it('an editorial Shutterstock photo is never published or even sent to vision', async () => {
        const url = 'https://image.shutterstock.com/e.jpg';
        const { pipeline, fetcher } = build({ [url]: await pack() }, { searches: [search([c(url, { source: 'shutterstock', pageUrl: undefined, isEditorial: true, licence: 'editorial' })])] }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(r.status).toBe('needs_review');
        expect(r.reason).toMatch(/editorial/);
        expect(r.publishable).toEqual({ A: false, B: false });
        expect(fetcher).not.toHaveBeenCalled();
    });
});

describe('licence settings', () => {
    it('an unknown licence on a major retailer: review under A, publishable under B', async () => {
        const url = 'https://shop.tesco.com/a.jpg';
        const { pipeline } = build({ [url]: await pack() }, { searches: [search([c(url)])] }, () => reply(answer({ confidence: 0.95 })));
        const r = await pipeline.run(row);
        expect(r.status).toBe('needs_review');
        expect(r.reason).toMatch(/licence_unknown/);
        expect(r.publishable).toEqual({ A: false, B: true });
        expect(r.output).toBeDefined();
        expect((await pipeline.run(row, { policy: 'B' })).status).toBe('approved');
    });
    it('a brand conflict blocks both', async () => {
        const url = 'https://images.openfoodfacts.org/a.jpg';
        const { pipeline } = build({ [url]: await pack() }, { lookups: [db([c(url, { licence: 'cc_by_sa' })], { brand: 'Other Co' })] }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(r.status).toBe('needs_review');
        expect(r.reason).toMatch(/brand_conflict/);
    });
});

describe('the vision service failing', () => {
    it('no key: nothing approved, and the reason says so', async () => {
        delete process.env.OPENROUTER_API_KEY;
        const url = 'https://images.openfoodfacts.org/a.jpg';
        const { pipeline } = build({ [url]: await pack() }, { lookups: [db([c(url, { licence: 'cc_by_sa' })])] }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(r.status).toBe('needs_review');
        expect(r.reason).toMatch(/^vision_unavailable/);
        expect(r.top).toHaveLength(1);
    });
    it('sixteen rows on a dead key: one alert, none approved', async () => {
        const url = 'https://images.openfoodfacts.org/a.jpg';
        const rows = new Map<string, string>();
        const alerts = { appConfig: {
            findUnique: async ({ where }: any) => (rows.has(where.key) ? { value: rows.get(where.key)! } : null),
            upsert: jest.fn(async ({ where, create }: any) => { rows.set(where.key, create.value); }),
            deleteMany: async () => undefined,
        } };
        const { pipeline } = build({ [url]: await pack() }, { lookups: [db([c(url, { licence: 'cc_by_sa' })])], alerts }, () => ({ ok: false, status: 401, json: async () => ({}) }));
        const out = [];
        for (let i = 0; i < 16; i++) out.push(await pipeline.run({ ...row, ean }, { upload: 'u1' }));
        expect(out.every((r) => r.status === 'needs_review' && /vision_unavailable: http_401/.test(r.reason))).toBe(true);
        expect(alerts.appConfig.upsert).toHaveBeenCalledTimes(1);
    });
});

describe('barcodes and sources', () => {
    it('an invalid barcode costs nothing and says so', async () => {
        const source = db([]);
        const { pipeline } = build({}, { lookups: [source] }, () => reply(answer()));
        expect(await pipeline.run({ ...row, ean: '123' })).toMatchObject({ status: 'invalid_ean', reason: 'invalid_ean' });
        expect(source.lookup).not.toHaveBeenCalled();
    });
    it('a case code asks both codes and records which answered', async () => {
        const source: LookupSource = { id: 'ean-db', enabled: () => true, lookup: jest.fn(async (code: string) => (code === '0810116128839' ? { record: { source: 'ean-db' as const, code, name: 'Prime', brand: 'Prime', quantity: null, imageUrls: [] }, candidates: [] } : { record: null, candidates: [] })) };
        const { pipeline } = build({}, { lookups: [source] }, () => reply(answer()));
        const r = await pipeline.run({ ean: '10810116128836', name: 'Prime Hydration', brand: 'Prime' });
        expect((source.lookup as jest.Mock).mock.calls.map((x) => x[0])).toEqual(['10810116128836', '0810116128839']);
        expect(r.trace.identity?.matchedBy).toBe('inner');
    });
    it('nothing anywhere: the reason names who was asked', async () => {
        const { pipeline } = build({}, { lookups: [db([])] }, () => reply(answer()));
        expect((await pipeline.run(row)).reason).toMatch(/no_candidates: asked ean-db/);
    });
    it('every photo too small is low_res, not "no image"', async () => {
        const { pipeline } = build({}, { searches: [search([c('https://x.example/s.jpg', { width: 500, height: 500 })])] }, () => reply(answer()));
        expect((await pipeline.run(row)).status).toBe('low_res');
    });
    it('blocked domains never reach a download', async () => {
        const download = jest.fn();
        const { pipeline } = build({}, { searches: [search([c('https://ae01.alicdn.com/a.jpg', { pageUrl: undefined })])], download: download as any }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(download).not.toHaveBeenCalled();
        expect(r.trace.rejects[0].reason).toMatch(/blocked_domain/);
    });
    it('duplicates keep the sharper copy', async () => {
        const big = await shelf();
        const small = await require('../image-pipeline/sharp').sharp(big).resize(900).png().toBuffer();
        const { pipeline } = build({ 'https://shop.tesco.com/big.jpg': big, 'https://shop.tesco.com/small.jpg': small }, { searches: [search([c('https://shop.tesco.com/small.jpg'), c('https://shop.tesco.com/big.jpg')])] }, () => reply(answer()));
        const r = await pipeline.run(row);
        expect(r.trace.scored.map((s) => s.url)).toEqual(['https://shop.tesco.com/big.jpg']);
        expect(r.trace.rejects.map((x) => x.reason)).toContain('duplicate');
    });
    it('a re-run spends nothing on vision: the answer is cached', async () => {
        const url = 'https://images.openfoodfacts.org/a.jpg';
        const { pipeline, fetcher } = build({ [url]: await pack() }, { lookups: [db([c(url, { licence: 'cc_by_sa' })])] }, () => reply(answer()));
        await pipeline.run(row);
        const again = await pipeline.run(row);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(again.trace.cost.total).toBe(0);
    });
});

describe('the shadow model', () => {
    it('answers on the same pictures and changes nothing', async () => {
        const url = 'https://images.openfoodfacts.org/a.jpg';
        const { pipeline, fetcher } = build({ [url]: await pack() }, { lookups: [db([c(url, { licence: 'cc_by_sa' })])] }, (body) => reply(body.model === SHADOW_VISION_MODEL ? answer({ same_variant: false }) : answer(), body.model === SHADOW_VISION_MODEL ? 0.001 : 0.004));
        const r = await pipeline.run(row, { shadow: true });
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(r.status).toBe('approved');
        expect(r.trace.vision.map((v) => v.passed)).toEqual([true, false]);
    });
});
