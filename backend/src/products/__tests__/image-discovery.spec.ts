import { Prisma } from '@prisma/client';
import { ImageDiscoveryService, RETRY_COOLDOWN_MS } from '../image-discovery.service';
import { ImportEnrichmentService, pickPhotos } from '../import-enrichment.service';
import { HostQueue, buildProviders, lookupPlan, openFactsElsewhere, photoSize, type ProductDataProvider, type ProviderPhoto, type ProviderRecord, type ProviderResult } from '../product-data-providers';

const IMG = 'https://images.openfoodfacts.org/images/products';
const photo = (code: string, lang = 'en', rev = 3, extra: Partial<ProviderPhoto> = {}): ProviderPhoto => ({ url: `${IMG}/${code}/front_${lang}.${rev}.full.jpg`, previewUrl: `${IMG}/${code}/front_${lang}.${rev}.400.jpg`, kind: 'front', language: lang, ...extra });
const rec = (code: string, name: string, brands: string, quantity: string | null, photos: ProviderPhoto[] = [photo(code)], categories = ['en:snacks']): ProviderRecord => ({ code, name, brands, quantity, categories, photos, pageUrl: `https://world.openfoodfacts.org/product/${code}` });

/** A fake database: answers from `db`, counts calls, can be switched to failing. */
function provider(id: string, productType: string, db: Record<string, ProviderResult | (() => ProviderResult)>, opts: { covers?: string[]; verifies?: string[] } = {}) {
    const calls: string[] = [];
    const p: ProductDataProvider = {
        id, label: id, productType, imageHosts: ['images.openfoodfacts.org'],
        license: { images: 'CC BY-SA 3.0', imagesUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', data: 'ODbL 1.0', attribution: `${id} contributors` },
        covers: (k) => (opts.covers || ['food', 'other']).includes(k), canVerify: (k) => (opts.verifies || ['food', 'other']).includes(k),
        lookup: async (code) => { calls.push(code); const r = db[code]; return typeof r === 'function' ? r() : r || { status: 'not_found' }; },
    };
    return { p, calls };
}

/** Products in memory, with the Prisma calls the service uses. */
function fakeDb(rows: any[]) {
    const byId = new Map(rows.map((r) => [r.id, { images: [], brand: null, weight: null, category: 'Snacks & Biscuits', imageDiscovery: null, updatedAt: new Date(1000), ...r }]));
    const pick = (r: any) => (r ? { ...r, images: [...r.images] } : null);
    const prisma: any = {
        product: {
            findFirst: jest.fn(async ({ where }: any) => { const r = byId.get(where.id); return r && r.supplierId === where.supplierId ? pick(r) : null; }),
            findUnique: jest.fn(async ({ where }: any) => pick(byId.get(where.id))),
            findMany: jest.fn(async () => []),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const r = byId.get(where.id);
                if (!r || r.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
                r.imageDiscovery = data.imageDiscovery === Prisma.DbNull ? null : JSON.parse(JSON.stringify(data.imageDiscovery));
                r.updatedAt = data.updatedAt;
                return { count: 1 };
            }),
        },
    };
    /** A supplier save: changes fields and bumps updatedAt, like ProductsService.supplierUpdate. */
    const save = (id: string, patch: any) => { const r = byId.get(id)!; Object.assign(r, patch, { updatedAt: new Date(r.updatedAt.getTime() + 1000) }); return pick(r); };
    return { prisma, byId, save };
}

function setup(rows: any[], providers: ProductDataProvider[]) {
    const db = fakeDb(rows);
    const enrichment = new ImportEnrichmentService();
    enrichment.useProviders(providers);
    const products: any = {
        supplierUpdate: jest.fn(async (id: string, _s: string, patch: any) => ({ ...db.save(id, { images: patch.images }), status: 'DRAFT' })),
        setImageCredits: jest.fn(async () => undefined),
    };
    const imageLookup: any = { accept: jest.fn(async (url: string) => ({ url: `https://cdn.example.com/${url.split('/').pop()}` })) };
    const svc = new ImageDiscoveryService(db.prisma, products, enrichment, imageLookup);
    const settle = async () => { while (svc.running.size) await Promise.all([...svc.running.values()]); };
    return { svc, db, products, imageLookup, enrichment, settle };
}

const takis = '5941143028849';
const takisRow = { id: 'p1', supplierId: 's1', ean: takis, name: 'Takis FUEGO 55G', brand: 'Takis' };

describe('background photo search for saved products', () => {
    it('finds a verified photo, stores it for review, and never applies it by itself', async () => {
        const off = provider('off', 'food', { [takis]: { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') } });
        const { svc, db, products, settle } = setup([takisRow], [off.p]);
        expect((await svc.enqueue('p1'))?.status).toBe('searching');
        expect(db.byId.get('p1')!.imageDiscovery.status).toBe('searching');
        await settle();
        const st = db.byId.get('p1')!.imageDiscovery;
        expect(st).toMatchObject({ status: 'found_review', barcode: takis, candidates: [expect.objectContaining({ confidence: 'verified', source: 'off', license: 'CC BY-SA 3.0', url: `${IMG}/${takis}/front_en.3.full.jpg`, reasons: expect.arrayContaining(['name_matches', 'size_matches']) })] });
        expect(db.byId.get('p1')!.images).toEqual([]);              // nothing assigned
        expect(products.supplierUpdate).not.toHaveBeenCalled();
        expect(db.byId.get('p1')!.updatedAt.getTime()).toBe(1000);   // a background hint is not an edit
    });

    it('dedupes: saving again or retrying while a search runs starts nothing new; an answered barcode is not searched again', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const off = provider('off', 'food', {});
        off.p.lookup = async (code) => { off.calls.push(code); await gate; return { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') }; };
        const { svc, settle } = setup([takisRow], [off.p]);
        await svc.enqueue('p1');
        await svc.enqueue('p1');
        await svc.retry('s1', 'p1');
        release();
        await settle();
        expect(off.calls).toEqual([takis]);
        await svc.enqueue('p1');                                       // next save: already answered
        await settle();
        expect(off.calls).toEqual([takis]);
    });

    it('never touches a product that has a photo, and clears a stale suggestion when one is added', async () => {
        const off = provider('off', 'food', { [takis]: { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') } });
        const { svc, db, settle } = setup([{ ...takisRow, images: ['https://cdn.example.com/own.jpg'] }, { ...takisRow, id: 'p2', images: [] }], [off.p]);
        expect(await svc.enqueue('p1')).toBeNull();
        expect(off.calls).toEqual([]);
        expect(db.prisma.product.updateMany).not.toHaveBeenCalled();
        await svc.enqueue('p2');
        await settle();
        expect(db.byId.get('p2')!.imageDiscovery.status).toBe('found_review');
        db.save('p2', { images: ['https://cdn.example.com/mine.jpg'] });
        await svc.enqueue('p2');
        expect(db.byId.get('p2')!.imageDiscovery).toBeNull();
        expect(db.byId.get('p2')!.images).toEqual(['https://cdn.example.com/mine.jpg']);
    });

    it('a photo added while the search was running wins: the result is dropped', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const off = provider('off', 'food', {});
        off.p.lookup = async () => { await gate; return { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') }; };
        const { svc, db, settle } = setup([takisRow], [off.p]);
        await svc.enqueue('p1');
        db.save('p1', { images: ['https://cdn.example.com/mine.jpg'] });
        release();
        await settle();
        expect(db.byId.get('p1')!.images).toEqual(['https://cdn.example.com/mine.jpg']);
        expect(db.byId.get('p1')!.imageDiscovery).toBeNull();
    });

    it('accepts only a stored candidate of the supplier’s own product, credits it, and refuses when a photo exists', async () => {
        const off = provider('off', 'food', { [takis]: { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') } });
        const { svc, db, products, imageLookup, settle } = setup([takisRow, { ...takisRow, id: 'p9', supplierId: 's2' }], [off.p]);
        await svc.enqueue('p1');
        await settle();
        const url = `${IMG}/${takis}/front_en.3.full.jpg`;
        await expect(svc.accept('s1', 'p1', `${IMG}/${takis}/front_en.9.full.jpg`)).rejects.toThrow(/Only a photo found/);
        await expect(svc.accept('s2', 'p1', url)).rejects.toThrow(/not found/i);          // another supplier
        await expect(svc.get('s2', 'p1')).rejects.toThrow(/not found/i);
        const out: any = await svc.accept('s1', 'p1', url);
        expect(imageLookup.accept).toHaveBeenCalledWith(url, expect.any(Function));
        expect(products.supplierUpdate).toHaveBeenCalledWith('p1', 's1', expect.objectContaining({ images: ['https://cdn.example.com/front_en.3.full.jpg'] }));
        expect(products.setImageCredits).toHaveBeenCalledWith('p1', { 'https://cdn.example.com/front_en.3.full.jpg': expect.objectContaining({ source: 'off', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', attribution: 'off contributors', barcode: takis, chosenBy: 'supplier' }) });
        expect(out.imageDiscovery).toBeNull();
        expect(db.byId.get('p1')!.imageDiscovery).toBeNull();
        // Now it has a photo: a second accept can't overwrite it.
        db.byId.get('p1')!.imageDiscovery = { status: 'found_review', barcode: takis, candidates: [{ url, previewUrl: url }] };
        await expect(svc.accept('s1', 'p1', url)).rejects.toThrow(/already has a photo/);
        expect(products.supplierUpdate).toHaveBeenCalledTimes(1);
    });

    it('refuses to accept when the supplier added a photo during the download', async () => {
        const off = provider('off', 'food', { [takis]: { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') } });
        const { svc, db, products, imageLookup, settle } = setup([takisRow], [off.p]);
        await svc.enqueue('p1');
        await settle();
        imageLookup.accept.mockImplementationOnce(async () => { db.save('p1', { images: ['https://cdn.example.com/mine.jpg'] }); return { url: 'https://cdn.example.com/x.jpg' }; });
        await expect(svc.accept('s1', 'p1', `${IMG}/${takis}/front_en.3.full.jpg`)).rejects.toThrow(/in the meantime/);
        expect(products.supplierUpdate).not.toHaveBeenCalled();
        expect(db.byId.get('p1')!.images).toEqual(['https://cdn.example.com/mine.jpg']);
    });

    it('stores actionable failures: invalid barcode, not found, outage (with one retry), store-internal code', async () => {
        const fails: string[] = [];
        const off = provider('off', 'food', {
            '4000512363378': () => { fails.push('x'); return { status: 'unavailable', reason: 'rate_limited' }; },
        });
        const { svc, db, settle } = setup([
            { ...takisRow, id: 'bad', ean: '5941143028848' },
            { ...takisRow, id: 'none', ean: '8720181920790' },
            { ...takisRow, id: 'down', ean: '4000512363378' },
            { ...takisRow, id: 'store', ean: '2000000000015' },
            { ...takisRow, id: 'nocode', ean: null },
        ], [off.p]);
        for (const id of ['bad', 'none', 'down', 'store', 'nocode']) await svc.enqueue(id);
        await settle();
        expect(db.byId.get('bad')!.imageDiscovery).toMatchObject({ status: 'invalid_barcode', reason: 'invalid_barcode' });
        expect(db.byId.get('none')!.imageDiscovery).toMatchObject({ status: 'not_found', reason: 'not_in_database' });
        expect(db.byId.get('down')!.imageDiscovery).toMatchObject({ status: 'unavailable', reason: 'source_unavailable' });
        expect(fails).toHaveLength(2);                                 // first try + one retry
        expect(db.byId.get('store')!.imageDiscovery).toMatchObject({ status: 'not_found', reason: 'internal_code' });
        expect(off.calls).not.toContain('2000000000015');
        expect(db.byId.get('nocode')!.imageDiscovery).toBeNull();
        expect(off.calls).not.toContain('5941143028848');
    });

    it('retry skips the cached "not found", respects a cooldown, and a provider that throws is an outage', async () => {
        let present = false;
        const off = provider('off', 'food', { '8720181920790': () => (present ? { status: 'found', record: rec('8720181920790', 'Coccolino Celeste 750ml', 'Coccolino', '750 ml') } : { status: 'not_found' }) });
        const { svc, db, settle } = setup([{ ...takisRow, ean: '8720181920790', name: 'Coccolino Celeste 750 ml', brand: 'Coccolino' }], [off.p]);
        let t = 1_000_000;
        svc.now = () => t;
        await svc.enqueue('p1');
        await settle();
        expect(db.byId.get('p1')!.imageDiscovery.status).toBe('not_found');
        present = true;
        await svc.retry('s1', 'p1');                                   // within the cooldown: nothing
        await settle();
        expect(off.calls).toHaveLength(1);
        t += RETRY_COOLDOWN_MS + 1;
        await svc.retry('s1', 'p1');
        await settle();
        expect(off.calls).toHaveLength(2);
        expect(db.byId.get('p1')!.imageDiscovery).toMatchObject({ status: 'found_review', attempts: 2 });

        const boom = provider('off', 'food', {});
        boom.p.lookup = async () => { throw new Error('socket hang up'); };
        const b = setup([takisRow], [boom.p]);
        await b.svc.enqueue('p1');
        await b.settle();
        expect(b.db.byId.get('p1')!.imageDiscovery).toMatchObject({ status: 'unavailable' });
    });

    it('"not my product" removes a photo for good, also from later searches', async () => {
        const two = rec(takis, 'Takis Fuego 55g', 'Takis', '55 g', [photo(takis, 'en'), photo(takis, 'ro', 4)]);
        const off = provider('off', 'food', { [takis]: { status: 'found', record: two } });
        const { svc, db, settle } = setup([takisRow], [off.p]);
        let t = 5_000_000;
        svc.now = () => t;
        await svc.enqueue('p1');
        await settle();
        const [a, b] = db.byId.get('p1')!.imageDiscovery.candidates.map((c: any) => c.url);
        expect((await svc.dismiss('s1', 'p1', a))?.candidates.map((c) => c.url)).toEqual([b]);
        await expect(svc.dismiss('s1', 'p1', 'https://elsewhere.example/x.jpg')).rejects.toThrow(/isn’t one of/);
        expect(await svc.dismiss('s1', 'p1')).toMatchObject({ status: 'not_found', reason: 'dismissed', candidates: [] });
        t += RETRY_COOLDOWN_MS + 1;
        await svc.retry('s1', 'p1');
        await settle();
        expect(db.byId.get('p1')!.imageDiscovery).toMatchObject({ status: 'not_found', reason: 'dismissed' });
    });

    it('the import review and the background search share one cache and never ask twice at once', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const off = provider('off', 'food', {});
        off.p.lookup = async (code) => { off.calls.push(code); await gate; return { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') }; };
        const { svc, enrichment, settle } = setup([takisRow], [off.p]);
        const job = enrichment.start('s1', [{ key: 'r', ean: takis, name: 'Takis Fuego 55g' }]);
        await svc.enqueue('p1');
        release();
        await settle();
        for (let i = 0; i < 50 && !enrichment.status('s1', job.jobId).done; i++) await new Promise((r) => setTimeout(r, 5));
        expect(enrichment.status('s1', job.jobId).results[0].status).toBe('verified');
        expect(off.calls).toEqual([takis]);
        expect(enrichment.candidateFor(takis, `${IMG}/${takis}/front_en.3.full.jpg`)).toBeTruthy();
    });
});

describe('lookup engine: barcode forms, databases, photo choice', () => {
    it('plans lookups safely for GTIN-14, UPC, store and variable-measure codes', () => {
        expect(lookupPlan('05941143028849')).toEqual({ code: '5941143028849' });               // indicator 0 = the EAN-13
        expect(lookupPlan('10810116128836')).toEqual({ code: '10810116128836', inner: '0810116128839' }); // case of Prime Collector (UPC 810116128839)
        expect(lookupPlan('90810116128833').skip).toBe('variable_measure');
        expect(lookupPlan('2000000000015').skip).toBe('internal_code');
        expect(lookupPlan('0400000000004').skip).toBe('internal_code');
        expect(lookupPlan('212345678906').skip).toBe('internal_code');
        expect(lookupPlan('20123451').skip).toBe('internal_code');
        expect(lookupPlan('810116128839')).toEqual({ code: '810116128839' });
        expect(lookupPlan('50985098')).toEqual({ code: '50985098' });
    });

    it('a case code nobody has falls back to the inner item, never as verified', async () => {
        const inner = '0810116128839';
        const off = provider('off', 'food', { [inner]: { status: 'found', record: rec(inner, 'Prime Hydration Collector 500ml', 'Prime', '500 ml', [photo(inner)], ['en:beverages']) } });
        const e = new ImportEnrichmentService();
        e.useProviders([off.p]);
        const out = await e.lookupOne({ ean: '10810116128836', name: 'Prime Hydration Drink Collector Series 500ml', brand: 'Prime', category: 'Beverages' });
        expect(off.calls).toEqual(['10810116128836', inner]);
        expect(out.candidates[0]).toMatchObject({ confidence: 'needs_confirmation', reasons: expect.arrayContaining(['case_code']) });
        // The piece's own UPC-A is verified even though the database stores it as the EAN-13 0810116128839.
        const upc = provider('off', 'food', { '810116128839': { status: 'found', record: rec(inner, 'Prime Hydration Collector 500ml', 'Prime', '500 ml', [photo(inner)], ['en:beverages']) } });
        e.useProviders([upc.p]);
        const piece = await e.lookupOne({ ean: '810116128839', name: 'Prime Hydration Collector 500ml', brand: 'Prime', category: 'Beverages' });
        expect(piece.candidates[0]).toMatchObject({ confidence: 'verified' });
    });

    it('follows "found in another database" instead of reporting not found', async () => {
        const coke = '5449000000996';
        const obf = provider('obf', 'beauty', { [coke]: { status: 'elsewhere', productType: 'food' } }, { covers: ['beauty'], verifies: [] });
        const off = provider('off', 'food', { [coke]: { status: 'found', record: rec(coke, 'Coca-Cola', 'Coca-Cola', '330 ml', [photo(coke)], ['en:beverages']) } });
        const e = new ImportEnrichmentService();
        e.useProviders([off.p, obf.p]);
        const out = await e.lookupOne({ ean: coke, name: 'Coca-Cola 330ml can', brand: 'Coca-Cola', category: 'Skincare' });
        expect(obf.calls).toEqual([coke]);
        expect(off.calls).toEqual([coke]);
        expect(out.status).toBe('found');
        expect(out.candidates[0].source).toBe('off');
        expect(openFactsElsewhere({ result: { id: 'product_found_with_a_different_product_type' }, errors: [{ field: { id: 'product_type', value: 'food' } }] })).toBe('food');
        expect(openFactsElsewhere({ result: { id: 'product_not_found' } })).toBeNull();
    });

    it('rejects other variants, sizes and multipacks; brand-only agreement is enough only without contradictions', async () => {
        const kit = '8445291524606';
        const off = provider('off', 'food', {
            [kit]: { status: 'found', record: rec(kit, 'KitKat 4 Finger 41.5g', 'Nestlé', '41.5 g') },
            '5060335634870': { status: 'found', record: rec('5060335634870', 'The doctor', 'Monster Energy', '500 μλ', [photo('5060335634870')], ['en:energy-drinks']) },
            '8000500461051': { status: 'found', record: rec('8000500461051', 'Ferrero Rocher Ice Cream Stick', 'Ferrero', '3 x 90 ml', [photo('8000500461051')], ['en:frozen-desserts']) },
        });
        const e = new ImportEnrichmentService();
        e.useProviders([off.p]);
        expect((await e.lookupOne({ ean: kit, name: 'KitKat 2 Finger 6 x 20.7g', brand: 'Nestlé', category: 'Chocolates & Sweets' })).candidates[0].reasons).toContain('size_differs');
        const monster = await e.lookupOne({ ean: '5060335634870', name: 'MONSTER DOCTOR (yellow) 500ml', brand: 'Monster', category: 'Energy Drinks' });
        expect(monster.candidates[0]).toMatchObject({ confidence: 'verified' });
        const single = await e.lookupOne({ ean: '8000500461051', name: 'Ferrero Rocher Ice Cream Stick 90ml', brand: 'Ferrero', category: 'Frozen Food' });
        expect(single.candidates[0]).toMatchObject({ confidence: 'needs_confirmation', reasons: expect.arrayContaining(['size_differs']) });
    });

    it('reads the v3 API: sizes from images metadata, full-size URLs, "elsewhere" 404s, outages', async () => {
        const bodies: Record<string, [number, any]> = {
            '9002490100070': [200, { status: 'success', product: { code: '9002490100070', product_name: 'Energy Drink', brands: 'Red Bull GmbH', quantity: '250ml', categories_tags: ['en:beverages'],
                selected_images: { front: { display: { en: `${IMG}/900/249/010/0070/front_en.245.400.jpg`, fr: `${IMG}/900/249/010/0070/front_fr.166.400.jpg` } } },
                image_front_url: `${IMG}/900/249/010/0070/front_en.245.400.jpg`,
                images: { front_en: { rev: '245', sizes: { full: { w: 160, h: 400 } } }, front_fr: { rev: '166', sizes: { full: { w: 3024, h: 4032 } } } } } }],
            '5449000000996': [404, { status: 'failure', result: { id: 'product_found_with_a_different_product_type' }, errors: [{ field: { id: 'product_type', value: 'food' } }] }],
            '8720181920790': [404, { status: 'failure', result: { id: 'product_not_found' } }],
            '4000512363378': [503, {}],
        };
        const urls: string[] = [];
        const fetcher: any = async (url: string) => { urls.push(url); const code = /product\/(\d+)\.json/.exec(url)![1]; const [status, body] = bodies[code]; return { status, ok: status < 300, headers: { get: () => null }, json: async () => body }; };
        const [off, obf] = buildProviders(new HostQueue(6000, fetcher, () => 0, async () => undefined));
        const r: any = await off.lookup('9002490100070');
        expect(urls[0]).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v3\/product\/9002490100070\.json\?fields=.*images/);
        expect(r.status).toBe('found');
        expect(r.record.photos).toEqual(expect.arrayContaining([expect.objectContaining({ url: `${IMG}/900/249/010/0070/front_fr.166.full.jpg`, width: 3024, height: 4032, language: 'fr' })]));
        expect(pickPhotos(r.record.photos)[0].language).toBe('fr');
        expect(await obf.lookup('5449000000996')).toEqual({ status: 'elsewhere', productType: 'food' });
        expect(await off.lookup('5449000000996')).toEqual({ status: 'not_found' });   // "elsewhere" pointing at itself is not a loop
        expect(await off.lookup('8720181920790')).toEqual({ status: 'not_found' });
        expect(await off.lookup('4000512363378')).toEqual({ status: 'unavailable', reason: 'rate_limited' });
    });

    it('prefers front packshots, then sharp before low resolution, then English, then the largest', () => {
        const code = '9002490100070';
        const photos = [
            { ...photo(code, 'en', 245), width: 160, height: 400 },
            { ...photo(code, 'fr', 166), width: 3024, height: 4032 },
            { ...photo(code, 'de', 104), width: 750, height: 999 },
            { ...photo(code, 'it', 75), width: 1831, height: 3967 },
            { ...photo(code, 'es', 2), width: 800, height: 900, kind: 'packaging' as const },
            { ...photo(code, 'pl', 3), width: 1728, height: 3264 },
        ];
        const picked = pickPhotos(photos);
        expect(picked.map((p) => p.language)).toEqual(['fr', 'it', 'pl', 'es']);
        const en = pickPhotos([{ ...photo(code, 'de', 1), width: 900, height: 1200 }, { ...photo(code, 'en', 2), width: 800, height: 1000 }]);
        expect(en[0].language).toBe('en');
        expect(photoSize({ front_en: { rev: '14', sizes: { full: { w: 2094, h: 4000 } } } }, `${IMG}/594/114/302/8849/front_en.14.400.jpg`)).toEqual({ width: 2094, height: 4000 });
        expect(photoSize({ front_en: { rev: '13', sizes: { full: { w: 1, h: 1 } } } }, `${IMG}/594/114/302/8849/front_en.14.400.jpg`)).toEqual({});
    });
});

describe('choosing the best photos: identity first, then the white-background packshot', () => {
    const redbull = '9002490100070';
    const rbRow = { id: 'rb', supplierId: 's1', ean: redbull, name: 'Red Bull Energy Drink 250ml', brand: 'Red Bull', category: 'Energy Drinks' };
    const sized = (code: string, lang: string, rev: number, w: number, h: number, extra: Partial<ProviderPhoto> = {}) => photo(code, lang, rev, { width: w, height: h, ...extra });
    const white = { analysed: true as const, width: 300, height: 400, background: 'white' as const, whiteBorder: 1, lightBorder: 1, borderSpread: 0, cleanCorners: 4, touches: [], fit: 'margin' as const, coverage: 0.3 };
    const shelf = { ...white, background: 'busy' as const, whiteBorder: 0.05, lightBorder: 0.1, borderSpread: 60, cleanCorners: 0, touches: ['left' as const], fit: 'cut' as const };
    /** Fake pixels: the visual answer per preview URL. */
    const looks = (svc: ImageDiscoveryService, byUrl: Record<string, any>) => { svc.inspectImage = async (u) => byUrl[u] ?? { analysed: false, reason: 'download_failed' }; };

    it('exact product with a white-background photo: it is the main photo (tier 1), shelf photos go to the gallery', async () => {
        const a = sized(redbull, 'ro', 5, 1200, 1600), b = sized(redbull, 'en', 7, 3024, 4032);
        const off = provider('off', 'food', { [redbull]: { status: 'found', record: rec(redbull, 'Red Bull Energy Drink 250 ml', 'Red Bull', '250 ml', [b, a], ['en:energy-drinks']) } });
        const { svc, db, settle } = setup([rbRow], [off.p]);
        looks(svc, { [a.previewUrl]: white, [b.previewUrl]: shelf });
        await svc.enqueue('rb');
        await settle();
        const st = db.byId.get('rb')!.imageDiscovery;
        expect(st.status).toBe('found_review');
        expect(st.reasons).toEqual([]);
        expect(st.candidates.map((c: any) => [c.url, c.tier, c.role])).toEqual([[a.url, 1, 'primary'], [b.url, 3, 'gallery']]);
        expect(st.candidates[0].breakdown).toEqual(expect.arrayContaining([{ key: 'background_white', points: 15 }, { key: 'barcode_exact', points: 40 }]));
        expect(db.byId.get('rb')!.images).toEqual([]);                    // still nothing applied
    });

    it('only natural photos of the exact product: offered, but marked "no clean background"', async () => {
        const b = sized(redbull, 'en', 7, 3024, 4032);
        const off = provider('off', 'food', { [redbull]: { status: 'found', record: rec(redbull, 'Red Bull Energy Drink 250 ml', 'Red Bull', '250 ml', [b], ['en:energy-drinks']) } });
        const { svc, db, settle } = setup([rbRow], [off.p]);
        looks(svc, { [b.previewUrl]: shelf });
        await svc.enqueue('rb');
        await settle();
        expect(db.byId.get('rb')!.imageDiscovery).toMatchObject({ status: 'found_review', reasons: ['no_clean_background'], candidates: [expect.objectContaining({ tier: 3, role: 'primary' })] });
    });

    it('another flavour or size under the barcode: never offered, however clean the photo; the reason says why', async () => {
        const a = sized(redbull, 'en', 5, 1200, 1600);
        const off = provider('off', 'food', { [redbull]: { status: 'found', record: rec(redbull, 'Red Bull Sugarfree 473 ml', 'Red Bull', '473 ml', [a], ['en:energy-drinks']) } });
        const { svc, db, settle } = setup([rbRow], [off.p]);
        looks(svc, { [a.previewUrl]: white });
        await svc.enqueue('rb');
        await settle();
        expect(db.byId.get('rb')!.imageDiscovery).toMatchObject({
            status: 'not_found', reason: 'record_mismatch', candidates: [],
            reasons: expect.arrayContaining(['record_mismatch', 'size_differs']),
            record: { productName: 'Red Bull Sugarfree 473 ml', brand: 'Red Bull', quantity: '473 ml' },
        });
    });

    it('identity rules from live data: a variant word rules out; other wording, a brand in the name and a "4-pack 160g" total do not', async () => {
        const e = new ImportEnrichmentService();
        const db: Record<string, ProviderResult> = {
            '5449000131805': { status: 'found', record: rec('5449000131805', 'Coca-Cola Zero', 'Coca-Cola', '330 ml', [photo('5449000131805')], ['en:sodas']) },
            '7613038529929': { status: 'found', record: rec('7613038529929', 'Lion Wildcrush', 'Nestlé', '360 g', [photo('7613038529929')], ['en:snacks']) },
            '8000500224281': { status: 'found', record: rec('8000500224281', 'Nutella B-ready 22g', 'Ferrero', '22 g', [photo('8000500224281')], ['en:snacks']) },
            '7613038427782': { status: 'found', record: rec('7613038427782', 'KitKat Chunky White', 'Nestlé', '160 g', [photo('7613038427782')], ['en:snacks']) },
        };
        e.useProviders([provider('off', 'food', db).p]);
        const coke = await e.lookupOne({ ean: '5449000131805', name: 'Coca-Cola Original 330ml', brand: 'Coca-Cola', category: 'Soft Drinks' });
        expect(coke.candidates[0].reasons).toEqual(expect.arrayContaining(['name_differs', 'variant_differs']));
        const lion = await e.lookupOne({ ean: '7613038529929', name: 'Nestlé Lion Wild Crush 360g', brand: 'Nestlé', category: 'Chocolates & Sweets' });
        expect(lion.candidates[0].reasons).not.toContain('variant_differs');
        const nutella = await e.lookupOne({ ean: '8000500224281', name: 'Nutella B-ready T1 22g', brand: 'Nutella', category: 'Chocolates & Sweets' });
        expect(nutella.candidates[0]).toMatchObject({ confidence: 'verified' });
        const kit = await e.lookupOne({ ean: '7613038427782', name: 'KitKat Chunky White 4-pack 160g', brand: 'KitKat', category: 'Chocolates & Sweets' });
        expect(kit.candidates[0].reasons).not.toContain('size_differs');
    });

    it('the same upload selected for two languages is one photo', async () => {
        const images = { front_en: { rev: '5', imgid: '3', sizes: { full: { w: 1200, h: 1600 } } }, front_ro: { rev: '6', imgid: '3', sizes: { full: { w: 1200, h: 1600 } } } };
        const fetcher: any = async () => new Response(JSON.stringify({ status: 'success', product: { code: redbull, product_name: 'Red Bull', brands: 'Red Bull', images,
            selected_images: { front: { display: { en: `${IMG}/${redbull}/front_en.5.400.jpg`, ro: `${IMG}/${redbull}/front_ro.6.400.jpg` } } } } }), { status: 200 });
        const [off] = buildProviders(new HostQueue(1000, fetcher, () => 0, async () => {}));
        const r: any = await off.lookup(redbull);
        expect(r.record.photos).toHaveLength(1);
        expect(r.record.photos[0]).toMatchObject({ imgid: '3', width: 1200, height: 1600 });
    });

    it('a photo that can’t be downloaded is "not checked" (tier 3), and the search still answers', async () => {
        const a = sized(redbull, 'en', 5, 1200, 1600);
        const off = provider('off', 'food', { [redbull]: { status: 'found', record: rec(redbull, 'Red Bull Energy Drink 250 ml', 'Red Bull', '250 ml', [a], ['en:energy-drinks']) } });
        const { svc, db, settle } = setup([rbRow], [off.p]);
        svc.inspectImage = async () => { throw new Error('socket hang up'); };
        await svc.enqueue('rb');
        await settle();
        expect(db.byId.get('rb')!.imageDiscovery.candidates[0]).toMatchObject({ tier: 3, visual: { analysed: false, reason: 'download_failed' } });
    });

    it('gallery: main photo plus confirmed extras in one step, credited as found and approved; unconfirmed extras refused', async () => {
        const a = sized(redbull, 'ro', 5, 1200, 1600), b = sized(redbull, 'en', 7, 3024, 4032);
        const off = provider('off', 'food', { [redbull]: { status: 'found', record: rec(redbull, 'Red Bull Energy Drink 250 ml', 'Red Bull', '250 ml', [b, a], ['en:energy-drinks']) } });
        const { svc, db, products, settle } = setup([rbRow], [off.p]);
        looks(svc, { [a.previewUrl]: white, [b.previewUrl]: shelf });
        await svc.enqueue('rb');
        await settle();
        await expect(svc.accept('s1', 'rb', a.url, ['https://elsewhere.example/x.jpg'])).rejects.toThrow(/Only a photo found/);
        const out: any = await svc.accept('s1', 'rb', a.url, [b.url]);
        expect(products.supplierUpdate).toHaveBeenCalledWith('rb', 's1', expect.objectContaining({ images: ['https://cdn.example.com/front_ro.5.full.jpg', 'https://cdn.example.com/front_en.7.full.jpg'] }));
        const credits = products.setImageCredits.mock.calls[0][1];
        expect(credits['https://cdn.example.com/front_ro.5.full.jpg']).toMatchObject({ origin: 'discovery', chosenBy: 'supplier', approvedBy: 's1', approvedByRole: 'SUPPLIER', tier: 1, originalUrl: a.url });
        expect(credits['https://cdn.example.com/front_en.7.full.jpg']).toMatchObject({ origin: 'discovery', tier: 3 });
        expect(out.imageDiscovery).toBeNull();

        // An unconfirmed photo can only be chosen on its own.
        const c = sized(takis, 'en', 3, 800, 800);
        const off2 = provider('off', 'food', { [takis]: { status: 'found', record: rec(takis, null as any, null as any, null, [c, sized(takis, 'ro', 4, 800, 800)], []) } });
        const t = setup([{ ...takisRow, name: 'Hot chips', brand: null, category: 'Other' }], [off2.p]);
        await t.svc.enqueue('p1');
        await t.settle();
        const cands = t.db.byId.get('p1')!.imageDiscovery.candidates;
        expect(cands.every((x: any) => x.tier === null && x.role === 'review')).toBe(true);
        await expect(t.svc.accept('s1', 'p1', cands[0].url, [cands[1].url])).rejects.toThrow(/confirmed as this exact product/);
    });

    it('a product with photos (supplier upload or approved) is never searched by itself; "look for more" only adds after them', async () => {
        const a = sized(redbull, 'ro', 5, 1200, 1600);
        const off = provider('off', 'food', { [redbull]: { status: 'found', record: rec(redbull, 'Red Bull Energy Drink 250 ml', 'Red Bull', '250 ml', [a], ['en:energy-drinks']) } });
        const own = 'https://cdn.example.com/supplier-own.jpg';
        const { svc, db, products, settle } = setup([{ ...rbRow, images: [own], imageCredits: null }], [off.p]);
        looks(svc, { [a.previewUrl]: white });
        expect(await svc.enqueue('rb')).toBeNull();                       // a save never searches
        expect(off.calls).toEqual([]);
        const st = await svc.retry('s1', 'rb');                            // the supplier asks for more
        expect(st).toMatchObject({ status: 'searching', mode: 'add' });
        await settle();
        expect(db.byId.get('rb')!.imageDiscovery).toMatchObject({ status: 'found_review', mode: 'add', candidates: [expect.objectContaining({ role: 'gallery', tier: 1 })] });
        await svc.enqueue('rb');                                           // a later save keeps the suggestion
        expect(db.byId.get('rb')!.imageDiscovery.status).toBe('found_review');
        await svc.accept('s1', 'rb', a.url);
        expect(products.supplierUpdate).toHaveBeenLastCalledWith('rb', 's1', expect.objectContaining({ images: [own, 'https://cdn.example.com/front_ro.5.full.jpg'] }));
        expect(db.byId.get('rb')!.images[0]).toBe(own);                    // the supplier's photo stays first
    });

    it('staff: list with reasons for everyone, but only Atlantis Catalog products get photos applied', async () => {
        const a = sized(redbull, 'ro', 5, 1200, 1600);
        const off = provider('off', 'food', { [redbull]: { status: 'found', record: rec(redbull, 'Red Bull Energy Drink 250 ml', 'Red Bull', '250 ml', [a], ['en:energy-drinks']) } });
        const { svc, db, products, settle } = setup([{ ...rbRow, id: 'cat', supplierId: 'staff1' }, { ...rbRow, id: 'sup', supplierId: 's1' }, { ...takisRow, id: 'bad', ean: '5941143028848', supplierId: 'staff1' }], [off.p]);
        const roles: Record<string, string> = { staff1: 'ADMIN', s1: 'SUPPLIER' };
        db.prisma.user = { findUnique: jest.fn(async ({ where }: any) => ({ role: roles[where.id] })), findMany: jest.fn(async () => [{ id: 'staff1' }]) };
        db.prisma.product.findMany = jest.fn(async ({ where }: any) => [...db.byId.values()].filter((r: any) => (where.supplierId?.in ? where.supplierId.in.includes(r.supplierId) : !where.supplierId.notIn.includes(r.supplierId))).map((r: any) => ({ ...r, supplier: { companyName: 'X' } })));
        looks(svc, { [a.previewUrl]: white });
        const retried = await svc.staffRetry({ id: 'staff1', role: 'MODERATOR' }, ['cat', 'sup', 'bad', 'nope']);
        expect(retried.results.map((r) => [r.id, r.outcome])).toEqual([['cat', 'started'], ['sup', 'started'], ['bad', 'answered_recently'], ['nope', 'not_found']]);
        await settle();
        const cat = await svc.staffList({ scope: 'catalog' });
        expect(cat.counts).toMatchObject({ review: 1, invalid_barcode: 1 });
        expect(cat.items.find((i) => i.id === 'cat')!.discovery!.candidates).toHaveLength(1);
        const sup = await svc.staffList({ scope: 'submissions' });
        expect(sup.canApply).toBe(false);
        expect(sup.items[0].discovery).toMatchObject({ status: 'found_review', candidates: [], found: 1, bestTier: 1 });   // status only
        await expect(svc.staffAccept({ id: 'staff1', role: 'ADMIN' }, 'sup', a.url)).rejects.toThrow(/belongs to a supplier/);
        await expect(svc.staffDismiss('sup', a.url)).rejects.toThrow(/belongs to a supplier/);
        await svc.staffAccept({ id: 'staff1', role: 'ADMIN' }, 'cat', a.url);
        expect(products.supplierUpdate).toHaveBeenCalledWith('cat', 'staff1', expect.objectContaining({ images: ['https://cdn.example.com/front_ro.5.full.jpg'] }));
        expect(products.setImageCredits.mock.calls[0][1]['https://cdn.example.com/front_ro.5.full.jpg']).toMatchObject({ chosenBy: 'staff', approvedBy: 'staff1', approvedByRole: 'ADMIN', origin: 'discovery' });
    });
});

describe('rate-limited queue', () => {
    it('a lookup’s timeout starts when it is sent, not while it waits its turn (bulk imports queue many)', async () => {
        const seen: boolean[] = [];
        const fetcher: any = async (_u: string, init: any) => { seen.push(!!init.signal?.aborted); return new Response('{}', { status: 200 }); };
        const q = new HostQueue(600, fetcher);   // one request per 100 ms
        const res = await Promise.all([0, 1, 2].map(() => q.fetch('https://world.openfoodfacts.org/api/v3/product/1.json', { timeoutMs: 60 })));
        expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
        expect(seen).toEqual([false, false, false]);   // the third waited ~200 ms but was not aborted
    });
});
