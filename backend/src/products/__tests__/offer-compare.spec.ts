import { OfferCompareService, gtinForms } from '../offer-compare.service';

const base = { unitsPerCase: 12, casesPerPallet: 80, palletsPerShipment: 33, moq: 2, moqUnit: 'PALLET', stock: 100, exwLocation: null, leadTime: 0, readyForDispatch: true, shelfLife: null, createdAt: new Date(), warehouse: null, offers: [] };
const listing = (id: string, supplierId: string, extra: any = {}) => ({ id, name: `Cola ${id}`, status: 'APPROVED', ean: '5449000000996', supplierId, basePrice: 10, origin: 'Germany', supplier: { country: 'Romania', kycStatus: 'VERIFIED' }, ...base, ...extra });

function svcWith(rows: any[]) {
    const prisma: any = {
        product: {
            findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
            findMany: jest.fn(async ({ where }: any) => rows.filter((r) => r.status === 'APPROVED' && where.ean.in.includes(r.ean))),
        },
        appConfig: { findMany: jest.fn(async () => []) },
    };
    return new OfferCompareService(prisma);
}

describe('Offer comparison (same barcode, different suppliers)', () => {
    it('matches stored barcodes with or without leading zeros', () => {
        expect(gtinForms('05449000000996')).toEqual(expect.arrayContaining(['5449000000996', '05449000000996']));
    });
    it('compares buyer case and per-piece prices; offer % applied; suppliers anonymous', async () => {
        const rows = [listing('a', 's1'), listing('b', 's2', { basePrice: 9, unitsPerCase: 24, offers: [{ discountPercent: 10 }] })];
        const r: any = await svcWith(rows).compare('a', { id: 'buyer', role: 'CUSTOMER' });
        expect(r.offers).toHaveLength(2);
        const [a, b] = r.offers;
        expect(a).toMatchObject({ current: true, casePrice: 11, piecePrice: Math.round((11 / 12) * 10000) / 10000, supplier: { label: 'Supplier 1', country: 'Romania', verified: true } });
        expect(b.casePrice).toBe(Math.round(9 * 1.1 * 0.9 * 100) / 100);
        expect(b.offerPercent).toBe(10);
        expect(r.note).toMatch(/Case sizes differ/);
        expect(JSON.stringify(r)).not.toMatch(/s1|s2|basePrice/); // no supplier ids, no supplier price
    });
    it('hides prices from signed-out visitors and shows nothing to the listing’s own supplier', async () => {
        const rows = [listing('a', 's1'), listing('b', 's2')];
        const anon: any = await svcWith(rows).compare('a', null);
        expect(anon.pricesHidden).toBe(true);
        expect(anon.offers.every((o: any) => o.casePrice === null && o.stockCases === null)).toBe(true);
        expect((await svcWith(rows).compare('a', { id: 's1', role: 'SUPPLIER' }) as any).ownerView).toBe(true);
        // A supplier looking at a competitor never gets buyer prices of their own listing.
        const other: any = await svcWith([...rows, listing('c', 's3')]).compare('b', { id: 's1', role: 'SUPPLIER' });
        expect(other.offers.map((o: any) => o.id)).toEqual(['b', 'c']);
    });
    it('returns nothing to compare when only one listing has the barcode (no invented offers)', async () => {
        const r: any = await svcWith([listing('a', 's1'), listing('b', 's2', { ean: '4000000000001', status: 'APPROVED' })]).compare('a', { id: 'buyer' });
        expect(r.offers).toEqual([]);
    });
});
