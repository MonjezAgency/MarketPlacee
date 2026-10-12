import { MixedLoadsService } from '../mixed-loads.service';

/** Explicit selection: a load contains exactly the lines the buyer chose. */
const prime = { id: 'prime', name: 'Prime', price: 15.2, basePrice: 13.81, unitsPerCase: 12, casesPerPallet: 132, palletsPerShipment: 26, moq: 1, moqUnit: 'PIECE', status: 'APPROVED', supplierId: 'a', exwLocation: null, warehouse: { id: 'w-nl', city: 'Rotterdam', country: 'Netherlands' }, variantPrices: null, variants: [{ name: 'Flavour', values: ['Grape', 'Ice'] }], images: [], ean: null, brand: 'Prime' };
const zero = { ...prime, id: 'zero', name: 'Zero', supplierId: 'b', variants: null };
const draft = { ...prime, id: 'draft', status: 'PENDING' };

function setup() {
    const loads: any[] = [];
    const db: any = {
        appConfig: { findUnique: jest.fn(async () => null) },
        product: { findMany: jest.fn(async ({ where }: any) => [prime, zero, draft].filter((p) => where.id.in.includes(p.id))) },
        mixedLoad: {
            findFirst: jest.fn(async ({ where }: any) => [...loads].reverse().find((l) => (!where.id || l.id === where.id) && l.customerId === where.customerId && (!where.status || l.status === where.status) && (!where.kind || l.kind === where.kind) && (!where.createdAt || l.createdAt >= where.createdAt.gte)) ?? null),
            findMany: jest.fn(async ({ where }: any) => loads.filter((l) => l.customerId === where.customerId && l.status === where.status)),
            create: jest.fn(async ({ data }: any) => { const l = { id: `L${loads.length + 1}`, status: 'DRAFT', version: 0, createdAt: new Date(), updatedAt: new Date(), ...data }; loads.push(l); return l; }),
            updateMany: jest.fn(async ({ where, data }: any) => { const l = loads.find((x) => x.id === where.id && x.version === where.version && x.status === 'DRAFT'); if (!l) return { count: 0 }; Object.assign(l, { ...data, version: l.version + 1 }); return { count: 1 }; }),
        },
    };
    const svc = new MixedLoadsService(db, { getMarkupPercentage: jest.fn(async () => ({ piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15 })) } as any);
    return { svc, loads };
}
const code = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e?.response?.code ?? e?.message; } return 'NO_ERROR'; };

describe('MixedLoadsService — explicit selection', () => {
    it('creates a load with exactly the selected products/flavours, from different suppliers', async () => {
        const { svc, loads } = setup();
        const r: any = await svc.create('buyer', 'PALLET', [
            { productId: 'prime', variant: 'Flavour=Grape', quantity: 10 },
            { productId: 'prime', variant: 'Flavour=Ice', quantity: 4 },
            { productId: 'zero', quantity: 2 },
        ]);
        expect(loads).toHaveLength(1);
        expect(loads[0].lines).toEqual([
            { productId: 'prime', variant: 'Flavour=Grape', quantity: 10 },
            { productId: 'prime', variant: 'Flavour=Ice', quantity: 4 },
            { productId: 'zero', variant: null, quantity: 2 },
        ]);
        expect(r.quote.lines).toHaveLength(3);
        expect(r.quote.ready).toBe(true); // no minimum fill configured
    });
    it('refuses an empty selection', async () => {
        const { svc, loads } = setup();
        expect(await code(svc.create('buyer', 'TRUCK', []))).toBe('EMPTY_SELECTION');
        expect(loads).toHaveLength(0);
    });
    it('rejects unavailable products and unknown flavours without saving anything', async () => {
        const { svc, loads } = setup();
        expect(await code(svc.create('buyer', 'PALLET', [{ productId: 'prime', quantity: 1 }, { productId: 'draft', quantity: 1 }]))).toBe('PRODUCT_NOT_AVAILABLE');
        expect(await code(svc.create('buyer', 'PALLET', [{ productId: 'prime', variant: 'Flavour=Lime', quantity: 1 }]))).toBe('UNKNOWN_VARIANT');
        expect(loads).toHaveLength(0);
    });
    it('a double-submit of the same selection returns the same load', async () => {
        const { svc, loads } = setup();
        const a: any = await svc.create('buyer', 'PALLET', [{ productId: 'zero', quantity: 3 }]);
        const b: any = await svc.create('buyer', 'PALLET', [{ productId: 'zero', quantity: 3 }]);
        expect(b.id).toBe(a.id);
        expect(loads).toHaveLength(1);
    });
    it('adding one product without a loadId starts a new load — never merges into another draft', async () => {
        const { svc, loads } = setup();
        await svc.create('buyer', 'PALLET', [{ productId: 'zero', quantity: 3 }]);
        await svc.addLine('buyer', 'PALLET', { productId: 'prime', quantity: 1 });
        expect(loads).toHaveLength(2);
        expect(loads[0].lines).toEqual([{ productId: 'zero', variant: null, quantity: 3 }]);
    });
    it('adding to a specific load only changes that load', async () => {
        const { svc, loads } = setup();
        await svc.create('buyer', 'PALLET', [{ productId: 'zero', quantity: 3 }]);
        await svc.create('buyer', 'PALLET', [{ productId: 'prime', quantity: 5 }]);
        await svc.addLine('buyer', 'PALLET', { productId: 'zero', quantity: 1 }, 'L2');
        expect(loads[0].lines).toEqual([{ productId: 'zero', variant: null, quantity: 3 }]);
        expect(loads[1].lines.map((l: any) => l.productId).sort()).toEqual(['prime', 'zero']);
    });
});
