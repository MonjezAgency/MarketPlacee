import { loadOrigin, priceLoad, PricingError, type PricingProduct } from '../pricing';

const base = { price: 10, unitsPerCase: 12, casesPerPallet: 100, palletsPerShipment: 20, status: 'APPROVED' };
const P = (id: string, extra: Partial<PricingProduct> = {}): PricingProduct => ({ id, name: `P-${id}`, ...base, ...extra } as PricingProduct);
const NL1 = { id: 'w-nl-1', city: 'Rotterdam', country: 'Netherlands' };
const NL2 = { id: 'w-nl-2', city: 'Venlo', country: 'Netherlands' };
const IT = { id: 'w-it', city: 'Milan', country: 'Italy' };
const M = { piece: 1, pallet: 1, container: 1, mix: 1 } as any;

describe('mixed load dispatch origin', () => {
    it('same verified warehouse → verified', () => {
        const o = loadOrigin([P('a', { warehouse: NL1 }), P('b', { warehouse: NL1 })]);
        expect(o.status).toBe('VERIFIED');
        expect(o.label).toBe('Rotterdam, Netherlands');
    });
    it('different countries → rejected', () => {
        expect(() => loadOrigin([P('a', { warehouse: NL1 }), P('b', { warehouse: IT })])).toThrow(PricingError);
        try { loadOrigin([P('a', { warehouse: NL1 }), P('b', { warehouse: IT })]); } catch (e: any) { expect(e.code).toBe('ORIGIN_MISMATCH'); }
    });
    it('same country, different warehouses → needs verification (not assumed)', () => {
        expect(loadOrigin([P('a', { warehouse: NL1 }), P('b', { warehouse: NL2 })]).status).toBe('UNVERIFIED');
    });
    it('unknown location → needs verification, naming the product', () => {
        const o = loadOrigin([P('a', { warehouse: NL1 }), P('b')]);
        expect(o.status).toBe('UNVERIFIED');
        expect(o.unverified).toEqual(['P-b']);
    });
    it('same stated EXW location (case/space-insensitive) → verified', () => {
        expect(loadOrigin([P('a', { exwLocation: 'Rotterdam, NL' }), P('b', { exwLocation: ' rotterdam,  nl' })]).status).toBe('VERIFIED');
    });
    it('variants of one product are not a mix of origins', () => {
        const prods = new Map([['a', P('a', { variants: [{ name: 'Flavour', values: ['x', 'y'] }] })]]);
        const q = priceLoad('TRUCK', [{ productId: 'a', variant: 'Flavour=x', quantity: 1 }, { productId: 'a', variant: 'Flavour=y', quantity: 1 }], prods, M, { requiredFill: 0 });
        expect(q.ready).toBe(true);
    });
    it('a multi-product load with unverified origin is not orderable', () => {
        const prods = new Map([['a', P('a', { warehouse: NL1 })], ['b', P('b')]]);
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 1 }], prods, M, { requiredFill: 0 });
        expect(q.ready).toBe(false);
        expect(q.issues.join(' ')).toMatch(/needs verification/);
    });
    it('a multi-product load from one verified warehouse is orderable', () => {
        const prods = new Map([['a', P('a', { warehouse: NL1 })], ['b', P('b', { warehouse: NL1 })]]);
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 1 }], prods, M, { requiredFill: 0 });
        expect(q.ready).toBe(true);
        expect(q.origin.label).toBe('Rotterdam, Netherlands');
    });
});
