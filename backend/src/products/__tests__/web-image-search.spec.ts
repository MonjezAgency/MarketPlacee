import { PNG } from 'pngjs';
import { webTitleMatches } from '../image-lookup.service';
import { WEB_SEARCH_MONTHLY_LIMIT, WebImageSearchService, downloadPublicFile, isCleanPackshot, isPublicAddress, searchQuery } from '../web-image-search.service';
import { analyseBuffer } from '../image-quality';

/** An 800 px image: `bg` background with a dark pack in the middle. */
function photo(bg: [number, number, number], isPack: (x: number, y: number) => boolean = (x, y) => x > 250 && x < 550 && y > 100 && y < 700) {
    const png = new PNG({ width: 800, height: 800 });
    for (let y = 0; y < 800; y++) for (let x = 0; x < 800; x++) {
        const pack = isPack(x, y);
        const c = pack ? [20, 90, 40] : bg, i = (y * 800 + x) * 4;
        png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
    }
    return PNG.sync.write(png);
}
const WHITE = photo([255, 255, 255]), SHOP = photo([120, 80, 60]);
const ITEM = { ean: '5061013941402', name: 'Monster Energy Zero Green 500ml' };
const result = (n: number, title = 'Monster Energy Zero Green 500ml can') => ({ original: `https://shop.example/${n}.png`, link: `https://shop.example/p/${n}`, title, source: 'Shop Example' });

function setup(results: any[] = [result(1)], files: Record<string, Buffer> = {}) {
    const rows = new Map<string, string>();
    const prisma: any = {
        appConfig: {
            findUnique: jest.fn(async ({ where }: any) => (rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null)),
            create: jest.fn(async ({ data }: any) => { if (rows.has(data.key)) throw new Error('unique'); rows.set(data.key, data.value); }),
            updateMany: jest.fn(async ({ where, data }: any) => { if (rows.get(where.key) !== where.value) return { count: 0 }; rows.set(where.key, data.value); return { count: 1 }; }),
            upsert: jest.fn(async ({ where, create }: any) => { rows.set(where.key, create.value); }),
        },
    };
    const images: any = { store: jest.fn(async () => ({ url: `https://cdn.example.com/${rows.size}-${Math.random()}.png` })) };
    const svc = new WebImageSearchService(prisma, images);
    svc.searchImages = jest.fn(async () => results);
    svc.download = jest.fn(async (u: string) => files[u] ?? WHITE);
    svc.now = () => Date.UTC(2026, 9, 31);
    return { svc, rows, images };
}

describe('web photo search', () => {
    const key = process.env.SERPAPI_API_KEY;
    beforeEach(() => { process.env.SERPAPI_API_KEY = 'test'; });
    afterAll(() => { if (key === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = key; });

    it('is off without a key and spends nothing', async () => {
        delete process.env.SERPAPI_API_KEY;
        const { svc } = setup();
        expect((await svc.find(ITEM, new Set())).status).toBe('off');
        expect(svc.searchImages).not.toHaveBeenCalled();
    });

    it('keeps a white photo, stores it here and asks for confirmation', async () => {
        const { svc, images } = setup();
        const r = await svc.find(ITEM, new Set());
        expect(r.status).toBe('found');
        expect(images.store).toHaveBeenCalledTimes(1);
        const c = r.candidates[0];
        expect(c.url).toMatch(/^https:\/\/cdn\.example\.com/);
        expect(c.webImage).toBe('https://shop.example/1.png');
        expect(c.confidence).toBe('needs_confirmation');
        expect(c.reasons).toEqual(['web_search']);
        expect(c.license).toBe('');
    });

    it('drops a photo that is not on white and says so', async () => {
        const { svc, images } = setup([result(1)], { 'https://shop.example/1.png': SHOP });
        expect((await svc.find(ITEM, new Set())).status).toBe('no_white');
        expect(images.store).not.toHaveBeenCalled();
    });

    it('never downloads a result whose title is another flavour or a multipack', async () => {
        const { svc } = setup([result(1, 'Monster Ultra Paradise 500ml'), result(2, 'Monster Energy Green Zero 4 x 500ml')]);
        expect((await svc.find(ITEM, new Set())).status).toBe('no_white');
        expect(svc.download).not.toHaveBeenCalled();
    });

    it('offers at most six photos', async () => {
        const { svc } = setup([1, 2, 3, 4, 5, 6, 7, 8].map((n) => result(n)));
        expect((await svc.find(ITEM, new Set())).candidates).toHaveLength(6);
    });

    it('a second search for the same product is not paid for', async () => {
        const { svc, rows } = setup();
        await svc.find(ITEM, new Set());
        const r = await svc.find(ITEM, new Set());
        expect(r.status).toBe('found');
        expect(svc.searchImages).toHaveBeenCalledTimes(1);
        expect(rows.get('web_search_count:2026-10')).toBe('1');
    });

    it('a photo said to be wrong is not offered again', async () => {
        const { svc } = setup();
        const r = await svc.find(ITEM, new Set(['https://shop.example/1.png']));
        expect(r).toEqual({ status: 'no_white', candidates: [] });
    });

    it('stops at the monthly limit, across products, and starts again next month', async () => {
        const { svc, rows } = setup();
        rows.set('web_search_count:2026-10', String(WEB_SEARCH_MONTHLY_LIMIT - 1));
        expect((await svc.find({ ...ITEM, ean: '1' }, new Set())).status).toBe('found');
        expect((await svc.find({ ...ITEM, ean: '2' }, new Set())).status).toBe('limit_reached');
        expect(svc.searchImages).toHaveBeenCalledTimes(1);
        svc.now = () => Date.UTC(2026, 10, 1);
        expect((await svc.find({ ...ITEM, ean: '3' }, new Set())).status).toBe('found');
    });

    it('a failed search answers quietly and logs nothing from the error', async () => {
        const { svc } = setup();
        svc.searchImages = jest.fn(async () => { throw new Error('https://serpapi.com/search.json?api_key=secret'); });
        const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
        expect((await svc.find(ITEM, new Set())).status).toBe('failed');
        expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    });

    it('searches the name, not the barcode', () => {
        expect(searchQuery({ name: 'Zero Green', brand: 'Monster', weight: '500ml' })).toBe('Monster Zero Green 500ml');
        expect(searchQuery({ name: 'Monster Zero 500ml', brand: 'Monster', weight: '500ml' })).toBe('Monster Zero 500ml');
    });

    it('only accepts a whole pack on pure white', () => {
        expect(isCleanPackshot(analyseBuffer(WHITE), WHITE)).toBe(true);
        expect(isCleanPackshot(analyseBuffer(SHOP), SHOP)).toBe(false);
    });

    it('refuses a wide advert placed on white, keeps a can and a tall box', () => {
        const BANNER = photo([255, 255, 255], (x, y) => x > 100 && x < 700 && y > 280 && y < 520);
        const CAN = photo([255, 255, 255], (x, y) => { const dy = y < 150 ? 150 - y : y > 650 ? y - 650 : 0; return Math.abs(x - 400) < 150 - dy * 0.6 && y > 100 && y < 700; });
        expect(isCleanPackshot(analyseBuffer(BANNER), BANNER)).toBe(false);
        expect(isCleanPackshot(analyseBuffer(CAN), CAN)).toBe(true);
    });

    it('matches a title only when it says this product', () => {
        expect(webTitleMatches(ITEM, 'Monster Energy Zero Green 500ml can')).toBe(true);
        expect(webTitleMatches(ITEM, 'Buy Monster Energy Drink Zero Sugar Can 500mL')).toBe(true);
        expect(webTitleMatches(ITEM, 'Monster Energy Drink 500ml')).toBe(false);
        expect(webTitleMatches(ITEM, 'Red Bull Zero 500ml')).toBe(false);
        for (const t of ['Monster Green Zero Sugar 24Uds de 500ML', 'Monster Energy GREEN ZERO 4х500 ml', 'MONSTER Energy Green Zero 500 ml, confezione da 24 pezzi', 'Monster Energy Zero Green 12 pack 500ml', 'Monster Zero Green 500ml (24/carton)']) expect(webTitleMatches(ITEM, t)).toBe(false);
        expect(webTitleMatches({ name: 'Monster Zero Green 24 x 500ml' }, 'Monster Zero Green 24x500ml tray')).toBe(true);
    });

    it('refuses addresses and links that could reach our own network', async () => {
        for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']) expect(isPublicAddress(ip)).toBe(false);
        expect(isPublicAddress('8.8.8.8')).toBe(true);
        for (const u of ['http://example.com/a.jpg', 'https://127.0.0.1/a.jpg', 'https://[::1]/a.jpg', 'https://user:pw@example.com/a.jpg', 'https://example.com:8443/a.jpg', 'nonsense']) expect(await downloadPublicFile(u)).toBeNull();
    });
});
