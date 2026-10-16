import { ImportEnrichmentService } from '../import-enrichment.service';
import { HostQueue, sameGtin, type ProductDataProvider, type ProviderRecord, type ProviderResult } from '../product-data-providers';
import { fakes } from './import-fakes';

const rec = (code: string, name: string, brands: string, quantity: string | null, photo = true, categories = ['en:snacks']): ProviderRecord => ({
    code, name, brands, quantity, categories, pageUrl: `https://world.openfoodfacts.org/product/${code}`,
    photos: photo ? [{ url: `https://images.openfoodfacts.org/images/products/${code}/front_en.3.full.jpg`, previewUrl: `https://images.openfoodfacts.org/images/products/${code}/front_en.3.400.jpg`, kind: 'front', language: 'en' }] : [],
});

function provider(id: string, db: Record<string, ProviderResult>, opts: { covers?: string[]; verifies?: string[] } = {}) {
    const calls: string[] = [];
    const p: ProductDataProvider = {
        id, label: id === 'off' ? 'Open Food Facts' : id, imageHosts: ['images.openfoodfacts.org'],
        license: { images: 'CC BY-SA 3.0', imagesUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', data: 'ODbL 1.0', attribution: 'Open Food Facts contributors' },
        covers: (k) => (opts.covers || ['food', 'other']).includes(k), canVerify: (k) => (opts.verifies || ['food', 'other']).includes(k),
        lookup: async (code) => { calls.push(code); return db[code] || { status: 'not_found' }; },
    };
    return { p, calls };
}

async function finished(svc: ImportEnrichmentService, sup: string, jobId: string) {
    for (let i = 0; i < 200; i++) { const s = svc.status(sup, jobId); if (s.done) return s; await new Promise((r) => setTimeout(r, 5)); }
    throw new Error('job did not finish');
}
const by = (s: any, key: string) => s.results.find((r: any) => r.key === key);

describe('photo search for import rows', () => {
    const takis = '5941143028849', kit = '8445291524606', mints = '50985098', softener = '8720181920790';
    const off = provider('off', {
        [takis]: { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') },
        [kit]: { status: 'found', record: rec(kit, 'KitKat 4 Finger 41.5g', 'Nestlé', '41.5 g') },
        [mints]: { status: 'found', record: rec(mints, 'Halls Extra Strong', 'Halls', '33.5 g', false) },
        '4000512363378': { status: 'unavailable', reason: 'rate_limited' },
    });
    const opf = provider('opf', { [softener]: { status: 'found', record: rec(softener, 'Coccolino Botanical Parfum Celeste 750ml', 'Coccolino', '750 ml', true, []) } }, { covers: ['household'], verifies: [] });

    it('verifies only clean matches; flags variants, missing photos, bad barcodes, outages; one lookup per barcode', async () => {
        const svc = new ImportEnrichmentService();
        svc.useProviders([off.p, opf.p]);
        const { jobId } = svc.start('s1', [
            { key: 'a', ean: takis, name: 'Takis FUEGO 55G', brand: 'Takis', category: 'Snacks & Biscuits' },
            { key: 'a2', ean: takis, name: 'Takis FUEGO 55G', brand: 'Takis', category: 'Snacks & Biscuits' },        // same barcode twice
            { key: 'b', ean: kit, name: 'KitKat 2 Finger 6 x 20.7g', brand: 'Nestlé', category: 'Chocolates & Sweets' }, // different pack
            { key: 'c', ean: mints, name: 'HALLS Extra Strong', weight: '33.5 g' },                                     // record without a photo
            { key: 'd', ean: '1234', name: 'Bad code' },
            { key: 'e', ean: '0000000000000', name: 'Unknown' },
            { key: 'f', ean: '4000512363378', name: 'Trolli All in One 1kg' },                                         // provider rate-limited
            { key: 'g', ean: softener, name: 'COCCOLINO AMMORBIDENTE 750ML. BOTANICAL PARFUM CELEST', brand: 'Coccolino', category: 'Laundry & Detergents' },
        ]);
        const s = await finished(svc, 's1', jobId);
        expect(by(s, 'a')).toMatchObject({ status: 'verified', reasons: expect.arrayContaining(['name_matches', 'size_matches']), candidate: { source: 'Open Food Facts', license: 'CC BY-SA 3.0', barcode: takis } });
        expect(by(s, 'a2').status).toBe('verified');
        expect(off.calls.filter((c) => c === takis)).toHaveLength(1);
        expect(by(s, 'b')).toMatchObject({ status: 'needs_confirmation', reasons: expect.arrayContaining(['size_differs']) });
        expect(by(s, 'c')).toMatchObject({ status: 'not_found', reasons: ['no_photo'] });
        expect(by(s, 'd')).toMatchObject({ status: 'invalid_barcode' });
        expect(by(s, 'e')).toMatchObject({ status: 'not_found', reasons: ['not_in_database'] });
        expect(by(s, 'f')).toMatchObject({ status: 'unavailable', reasons: ['source_unavailable'] });
        // Cleaning product: a community database alone never verifies it.
        expect(by(s, 'g')).toMatchObject({ status: 'needs_confirmation', secondSourceNeeded: true, reasons: expect.arrayContaining(['second_source_needed']) });
        expect(off.calls).not.toContain(softener);
        // No category on the row and none on the record: shown to check, with that reason (not the cleaning-products one).
        const svc2 = new ImportEnrichmentService();
        const bare = provider('off', { '5060335634870': { status: 'found', record: rec('5060335634870', 'Monster Energy The Doctor', 'Monster Energy', '500 ml', true, []) } });
        svc2.useProviders([bare.p]);
        const s2 = await finished(svc2, 's1', svc2.start('s1', [{ key: 'm', ean: '5060335634870', name: 'Monster Energy The Doctor 500 ml' }]).jobId);
        expect(by(s2, 'm')).toMatchObject({ status: 'needs_confirmation', reasons: expect.arrayContaining(['kind_unknown']) });
        expect(by(s2, 'm').secondSourceNeeded).toBeUndefined();
    }, 30_000);

    it('reuses cached answers in the next search and only for the supplier who started it', async () => {
        const svc = new ImportEnrichmentService();
        const p = provider('off', { [takis]: { status: 'found', record: rec(takis, 'Takis Fuego 55g', 'Takis', '55 g') } });
        svc.useProviders([p.p]);
        await finished(svc, 's1', svc.start('s1', [{ key: 'a', ean: takis, name: 'Takis Fuego 55g' }]).jobId);
        const second = svc.start('s1', [{ key: 'a', ean: takis, name: 'Takis Fuego 55g' }]);
        expect(second.lookups).toBe(0);
        await finished(svc, 's1', second.jobId);
        expect(p.calls).toHaveLength(1);
        expect(() => svc.status('s2', second.jobId)).toThrow('expired');
        // Only a URL the search returned for that barcode can be used.
        expect(svc.candidateFor(takis, `https://images.openfoodfacts.org/images/products/${takis}/front_en.3.full.jpg`)).toBeTruthy();
        expect(svc.candidateFor(takis, 'https://images.openfoodfacts.org/images/products/other.jpg')).toBeNull();
        expect(svc.candidateFor('5941143028832', `https://images.openfoodfacts.org/images/products/${takis}/front_en.3.full.jpg`)).toBeNull();
    });

    it('a different barcode in the record is never verified; UPC and EAN-13 forms are the same code', () => {
        const svc = new ImportEnrichmentService();
        const r = svc.judge({ key: 'x', ean: takis, name: 'Takis Fuego 55g', brand: 'Takis' }, 'food', [{ p: off.p, record: rec('5941143028832', 'Takis Fuego 55g', 'Takis', '55 g') }], false);
        expect(r.status).toBe('needs_confirmation');
        expect(r.reasons).toContain('barcode_differs');
        expect(sameGtin('012345678905', '0012345678905')).toBe(true);
        expect(sameGtin('012345678905', '012345678912')).toBe(false);
    });
});

describe('rate limit queue', () => {
    it('spaces requests per host and pauses after 429', async () => {
        let t = 0;
        const starts: [string, number][] = [];
        const replies = [429, 200, 200];
        const fetcher: any = async (url: string) => { starts.push([new URL(url).host, t]); const status = url.includes('a.example') ? replies.shift()! : 200; return { status, headers: { get: (h: string) => (h === 'retry-after' && status === 429 ? '30' : null) } }; };
        const q = new HostQueue(12, fetcher, () => t, async (ms) => { t += ms; });
        await Promise.all([q.fetch('https://a.example/1'), q.fetch('https://a.example/2'), q.fetch('https://b.example/1'), q.fetch('https://a.example/3')]);
        const a = starts.filter(([h]) => h === 'a.example').map(([, at]) => at);
        expect(a[0]).toBe(0);
        expect(a[1]).toBeGreaterThanOrEqual(30_000);          // Retry-After honoured
        expect(a[2] - a[1]).toBeGreaterThanOrEqual(5_000);   // 12 per minute
        expect(starts.find(([h]) => h === 'b.example')).toBeTruthy();
    });
});

describe('importing with a photo from the search', () => {
    const takis = '5941143028849';
    const url = `https://images.openfoodfacts.org/images/products/${takis}/front_en.3.full.jpg`;
    const sheet = (images?: string) => ({
        name: 'S', columns: [{ index: 0, key: 'n', header: 'Name' }, { index: 1, key: 'e', header: 'EAN' }, { index: 2, key: 'b', header: 'Brand' }, { index: 3, key: 'p', header: 'Price per Case' }, { index: 4, key: 'i', header: 'Image URL' }],
        rows: [{ row: 2, cells: ['Takis Fuego 55g', takis, 'Takis', '31.20', images || ''] }],
    });
    const enrichment = { candidateFor: (code: string, u: string) => (code === takis && u === url ? { url, source: 'Open Food Facts', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', attribution: 'Open Food Facts contributors', sourceUrl: `https://world.openfoodfacts.org/product/${takis}`, barcode: takis } : null), queue: { fetch }, imageQueue: { fetch } };
    const mapping = { n: 'name', e: 'ean', b: 'brand', p: 'price', i: 'imageUrl' } as any;

    it('stores the chosen photo with its licence and source', async () => {
        const f = fakes([], { enrichment });
        const out = await f.svc.commit('s1', { sheets: [sheet()], mapping, externalImages: { 'S!2': { url } } });
        expect(out.results[0]).toMatchObject({ outcome: 'created', photoFromLookup: true, imageMissing: false });
        expect(f.imageLookup.accept).toHaveBeenCalledWith(url, expect.any(Function));
        expect(f.products.setImageCredits).toHaveBeenCalledWith('p1', expect.objectContaining({ 'https://cdn.example.com/lookup-1.jpg': expect.objectContaining({ source: 'Open Food Facts', license: 'CC BY-SA 3.0', barcode: takis }) }));
        expect(f.created[0].images).toEqual(['https://cdn.example.com/lookup-1.jpg']);
    });

    it('ignores a photo the search did not return, and never replaces the supplier’s own photo', async () => {
        const f = fakes([], { enrichment });
        const v = await f.svc.validate('s1', { sheets: [sheet()], mapping, externalImages: { 'S!2': { url: 'https://images.openfoodfacts.org/x.jpg' } } });
        expect(v.rows[0].imageStatus).toBe('missing');
        expect(v.rows[0].warnings.join(' ')).toMatch(/can’t be used any more/);
        const own = await f.svc.commit('s1', { sheets: [sheet('https://supplier.example/own.jpg')], mapping, externalImages: { 'S!2': { url } } });
        expect(f.imageLookup.accept).not.toHaveBeenCalled();
        expect(f.created[0].images).toEqual(['https://supplier.example/own.jpg']);
        expect(own.results[0].photoFromLookup).toBe(false);
    });

    it('adds a found photo to a saved product without one, as a change shown before import', async () => {
        const existing = [{ id: 'e1', name: 'Takis Fuego 55g', ean: takis, status: 'DRAFT', brand: 'Takis', images: [], basePrice: 31.2, supplierPrice: 31.2, supplierCurrency: 'EUR' }];
        const f = fakes(existing, { enrichment });
        const v = await f.svc.validate('s1', { sheets: [sheet()], mapping, onExisting: 'update', externalImages: { 'S!2': { url } } });
        expect(v.rows[0]).toMatchObject({ state: 'update', action: 'update', existing: { hasPhoto: false } });
        expect(v.rows[0].changes).toEqual(expect.arrayContaining([{ field: 'images', label: 'Photo', from: '—', to: 'Open Food Facts' }]));
        const out = await f.svc.commit('s1', { sheets: [sheet()], mapping, onExisting: 'update', externalImages: { 'S!2': { url } } });
        expect(out.results[0].outcome).toBe('updated');
        expect(f.updated[0].patch.images).toEqual(['https://cdn.example.com/lookup-1.jpg']);
        expect(f.products.setImageCredits).toHaveBeenCalledWith('e1', expect.any(Object));
        // A saved product that already has photos keeps them.
        const g = fakes([{ ...existing[0], images: ['https://cdn.example.com/own.jpg'] }], { enrichment });
        const v2 = await g.svc.validate('s1', { sheets: [sheet()], mapping, onExisting: 'update', externalImages: { 'S!2': { url } } });
        expect(v2.rows[0].changes.some((c: any) => c.field === 'images')).toBe(false);
    });

    it('a photo that can’t be saved leaves a draft, not a failed import', async () => {
        const f = fakes([], { enrichment, storageDown: true });
        const out = await f.svc.commit('s1', { sheets: [sheet()], mapping, externalImages: { 'S!2': { url } } });
        expect(out.results[0]).toMatchObject({ outcome: 'created', imageMissing: true });
        expect(out.results[0].notes.join(' ')).toMatch(/couldn’t be saved/);
    });
});
