import { PricingError, priceLine, priceLoad, minUnits, tierAvailability, PricingProduct } from '../pricing';

const M = { piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15 };
// Real record: Prime Hydration UK Juventus DFA 500ml (production catalog).
const prime: PricingProduct = { id: 'prime', name: 'Prime Juventus', price: 15.1953488372093, basePrice: 13.81395348837209, unitsPerCase: 12, casesPerPallet: 132, palletsPerShipment: 26, moq: 1, moqUnit: 'PIECE', status: 'APPROVED', supplierId: 'sup-a', exwLocation: null, warehouse: { id: 'w-nl', city: 'Rotterdam', country: 'Netherlands' } };
const noTruck: PricingProduct = { ...prime, id: 'nt', name: 'No truck data', palletsPerShipment: null };
const otherSupplier: PricingProduct = { ...prime, id: 'os', name: 'Other supplier', supplierId: 'sup-b' };
const map = (...ps: PricingProduct[]) => new Map(ps.map((p) => [p.id, p]));
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as PricingError).code; } return 'NO_ERROR'; };

describe('tier availability', () => {
    it('offers truckload only when all three pack sizes exist', () => {
        expect(tierAvailability(prime).truck.ok).toBe(true);
        expect(tierAvailability(noTruck).truck).toEqual({ ok: false, missing: ['palletsPerShipment'] });
        expect(tierAvailability(noTruck).pallet.ok).toBe(true);
    });
    it('rejects a truckload line for a product without palletsPerShipment', () => {
        expect(code(() => priceLine(noTruck, 'truck', 1, M))).toBe('TIER_UNAVAILABLE');
    });
});

describe('priceLine — server totals match the storefront', () => {
    it('truckload: 3,432 cases at €14.09 (rounded per case) = €48,356.88', () => {
        const l = priceLine(prime, 'truck', 1, M);
        expect(l.perCase).toBe(14.09);
        expect(l.casesTotal).toBe(3432);
        expect(l.unitsTotal).toBe(41184);
        expect(l.lineTotal).toBe(48356.88);
    });
    it('case tier uses the piece markup and multiplies quantity', () => {
        const l = priceLine(prime, 'carton', 3, M);
        expect(l.perCase).toBe(15.2);
        expect(l.lineTotal).toBe(45.6);
    });
    it('supplier buying their own listing pays the raw price', () => {
        expect(priceLine(prime, 'carton', 1, M, { raw: true }).perCase).toBe(13.81);
    });
    it('validates quantity', () => {
        expect(code(() => priceLine(prime, 'pallet', 0, M))).toBe('INVALID_QUANTITY');
        expect(code(() => priceLine(prime, 'pallet', 1.5 as any, M))).toBe('INVALID_QUANTITY');
        expect(code(() => priceLine(prime, 'pallet', 20000, M))).toBe('INVALID_QUANTITY');
        expect(code(() => priceLine(prime, 'boat', 1, M))).toBe('INVALID_TIER');
    });
    it('rejects unapproved products', () => {
        expect(code(() => priceLine({ ...prime, status: 'PENDING' }, 'carton', 1, M))).toBe('PRODUCT_NOT_AVAILABLE');
    });
});

describe('MOQ conversion respects moqUnit', () => {
    it('2,000 pieces → 167 cases / 2 pallets / 1 truck', () => {
        const p = { ...prime, moq: 2000, moqUnit: 'PIECE' };
        expect(minUnits(p, 'carton')).toBe(167);
        expect(minUnits(p, 'pallet')).toBe(2);
        expect(minUnits(p, 'truck')).toBe(1);
        expect(code(() => priceLine(p, 'carton', 166, M))).toBe('BELOW_MOQ');
        expect(priceLine(p, 'carton', 167, M).quantity).toBe(167);
    });
    it('MOQ given in pallets', () => {
        expect(minUnits({ ...prime, moq: 3, moqUnit: 'PALLET' }, 'pallet')).toBe(3);
        expect(minUnits({ ...prime, moq: 3, moqUnit: 'PALLET' }, 'carton')).toBe(396);
    });
});

describe('priceLoad — mixed pallets and truckloads', () => {
    const half: PricingProduct = { ...prime, id: 'half', name: 'Half', casesPerPallet: 60, palletsPerShipment: 20 };
    it('mixed truck: shares use each product\'s own capacity; full load is ready', () => {
        const q = priceLoad('TRUCK', [{ productId: 'prime', quantity: 13 }, { productId: 'half', quantity: 10 }], map(prime, half), M);
        expect(q.fill).toBeCloseTo(1);
        expect(q.ready).toBe(true);
        // total = (13*132 + 10*60) cases × 13.81 × 1.15, rounded once (unchanged buyer total)
        const raw = Math.round((13 * 132 * 13.81 + 10 * 60 * 13.81) * 100) / 100;
        expect(q.total).toBe(Math.round(raw * 1.15 * 100) / 100);
        // the quote only shows buyer prices: no markup field, lines already include it
        expect(q.subtotal).toBe(q.total);
        expect((q as any).markup).toBeUndefined();
        expect(q.lines[0].casePrice).toBeCloseTo(13.81 * 1.15, 3);
    });
    it('under-filled loads are priced but not ready', () => {
        const q = priceLoad('PALLET', [{ productId: 'prime', quantity: 66 }], map(prime), M);
        expect(q.fill).toBeCloseTo(0.5);
        expect(q.ready).toBe(false);
        expect(q.issues[0]).toMatch(/50% full/);
    });
    it('honours an admin minimum fill', () => {
        expect(priceLoad('PALLET', [{ productId: 'prime', quantity: 106 }], map(prime), M, { requiredFill: 0.8 }).ready).toBe(true);
    });
    it('rejects over-capacity, missing pack data and unknown products', () => {
        expect(code(() => priceLoad('PALLET', [{ productId: 'prime', quantity: 133 }], map(prime), M))).toBe('OVER_CAPACITY');
        expect(code(() => priceLoad('TRUCK', [{ productId: 'nt', quantity: 1 }], map(noTruck), M))).toBe('NOT_MIXABLE');
        expect(code(() => priceLoad('TRUCK', [{ productId: 'ghost', quantity: 1 }], map(prime), M))).toBe('PRODUCT_NOT_FOUND');
    });
    it('applies no supplier / location compatibility rule (not defined by the business yet)', () => {
        const a = { ...prime, id: 'a', exwLocation: 'Rotterdam' }, b = { ...otherSupplier, id: 'b', exwLocation: 'Bucharest' };
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 1 }], map(a, b), M, { requiredFill: 0 });
        expect(q.lines).toHaveLength(2);
        expect(q.supplierId).toBeNull();
    });
    it('with no minimum fill configured, any non-empty load is orderable', () => {
        const q = priceLoad('PALLET', [{ productId: 'prime', quantity: 1 }], map(prime), M, { requiredFill: 0 });
        expect(q.ready).toBe(true);
        expect(priceLoad('PALLET', [], map(prime), M, { requiredFill: 0 }).ready).toBe(false);
    });
    it('accepts flavours from the product\'s own variant groups even without per-variant prices', () => {
        const v = { ...prime, id: 'fl', variants: [{ name: 'Flavour', values: ['Grape', 'Ice Pop'] }, { name: '__translations', values: ['{}'] }] };
        const q = priceLoad('PALLET', [{ productId: 'fl', variant: 'Flavour=Grape', quantity: 10 }, { productId: 'fl', variant: 'Flavour=Ice Pop', quantity: 5 }], map(v), M, { requiredFill: 0 });
        expect(q.lines.map((l) => [l.variant, l.quantity])).toEqual([['Flavour=Grape', 10], ['Flavour=Ice Pop', 5]]);
        expect(code(() => priceLoad('PALLET', [{ productId: 'fl', variant: 'Flavour=Lime', quantity: 1 }], map(v), M))).toBe('UNKNOWN_VARIANT');
    });
    it('merges duplicate lines', () => {
        const q = priceLoad('PALLET', [{ productId: 'prime', quantity: 60 }, { productId: 'prime', quantity: 72 }], map(prime), M);
        expect(q.lines).toHaveLength(1);
        expect(q.lines[0].quantity).toBe(132);
        expect(q.ready).toBe(true);
    });
    it('uses per-variant case prices and rejects unknown variants', () => {
        const v = { ...prime, id: 'v', variantPrices: { 'Flavour=Grape': 12, 'Flavour=Ice': 14 } };
        const q = priceLoad('PALLET', [{ productId: 'v', variant: 'Flavour=Grape', quantity: 66 }, { productId: 'v', variant: 'Flavour=Ice', quantity: 66 }], map(v), M);
        expect(q.total).toBe(Math.round((66 * 12 + 66 * 14) * 1.15 * 100) / 100);
        expect(q.lines.map((l) => l.casePrice)).toEqual([13.8, 16.1]); // buyer case prices
        expect(code(() => priceLoad('PALLET', [{ productId: 'v', variant: 'Flavour=Lime', quantity: 1 }], map(v), M))).toBe('UNKNOWN_VARIANT');
    });
});

describe('Minimum order — single lines and mixed loads', () => {
    const sup = (id: string, supplierId: string, extra: Partial<PricingProduct> = {}): PricingProduct => ({ id, name: id, price: 11, basePrice: 10, unitsPerCase: 12, casesPerPallet: 80, palletsPerShipment: 33, moq: 15, moqUnit: 'PALLET', status: 'APPROVED', supplierId, warehouse: { id: 'w1', city: 'Constanța', country: 'Romania' }, ...extra });
    const MM = { piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15 };
    const mapOf = (...ps: PricingProduct[]) => new Map(ps.map((p) => [p.id, p]));
    const thrown = (f: () => unknown): any => { try { f(); } catch (e) { return e; } return null; };

    it('below minimum: says exactly how many more, and what the minimum line would cost', () => {
        const e = thrown(() => priceLine(sup('a', 's1'), 'pallet', 1, MM));
        expect(e.code).toBe('BELOW_MOQ');
        expect(e.message).toBe('a: minimum order is 15 pallets.');
        expect(e.detail).toMatchObject({ minUnits: 15, quantity: 1, remaining: 14, moq: 15, moqUnit: 'PALLET' });
        expect(e.detail.unitPrice).toBe(Math.round(10.5 * 80 * 100) / 100);
        expect(e.detail.minLineTotal).toBe(Math.round(840 * 15 * 100) / 100);
        expect(e.detail.mixable).toEqual({ kind: 'TRUCK', quantity: 1, minUnits: 15, capacity: 33 });
    });
    it('exactly at and above the minimum is accepted', () => {
        expect(priceLine(sup('a', 's1'), 'pallet', 15, MM).lineTotal).toBe(12600);
        expect(priceLine(sup('a', 's1'), 'pallet', 16, MM).quantity).toBe(16);
    });
    it('a truck-sized MOQ cannot be met in a mixed pallet, so no mixed path is offered', () => {
        const e = thrown(() => priceLine(sup('a', 's1', { moq: 2 }), 'carton', 10, MM));
        expect(e.detail.mixable).toBeNull();
    });
    it('mixed truck: 1 pallet against a 15-pallet minimum is not ready and says 14 more', () => {
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 1 }], mapOf(sup('a', 's1')), MM, { requiredFill: 0 });
        expect(q.ready).toBe(false);
        expect(q.minimums).toEqual([expect.objectContaining({ unit: 'pallet', required: 15, have: 1, remaining: 14, satisfiable: true })]);
        expect(q.issues.join(' ')).toMatch(/Minimum order: 15 pallets\. Add 14 more pallets of a or other eligible products/);
    });
    it('mixed truck: same-supplier products count together (8 + 7 = 15 pallets)', () => {
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 8 }, { productId: 'b', quantity: 7 }], mapOf(sup('a', 's1'), sup('b', 's1', { moq: null })), MM, { requiredFill: 0 });
        expect(q.minimums[0]).toMatchObject({ required: 15, have: 15, remaining: 0 });
        expect(q.ready).toBe(true);
    });
    it('another supplier\'s pallets do not count toward this supplier\'s minimum', () => {
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 8 }, { productId: 'c', quantity: 7 }], mapOf(sup('a', 's1'), sup('c', 's2', { moq: null })), MM, { requiredFill: 0 });
        expect(q.minimums).toEqual([expect.objectContaining({ required: 15, have: 8, remaining: 7 })]);
        expect(q.ready).toBe(false);
    });
    it('a minimum larger than the load itself is reported as impossible, not as "add more"', () => {
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 20 }], mapOf(sup('a', 's1', { moq: 40 })), MM, { requiredFill: 0 });
        expect(q.minimums[0].satisfiable).toBe(false);
        expect(q.issues.join(' ')).toMatch(/more than this truck can hold/);
    });
    it('a mixed load with too little stock of a product is not ready', () => {
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 15 }], mapOf(sup('a', 's1', { stock: 100 })), MM, { requiredFill: 0 });
        expect(q.ready).toBe(false);
        expect(q.issues.join(' ')).toMatch(/Only 100 cases of a in stock/);
    });
    it('an offer discount applies once, after the tier markup', () => {
        const l = priceLine(sup('a', 's1', { moq: null }), 'carton', 1, MM, { discountPercent: 10 });
        expect(l.perCase).toBe(Math.round(10 * 1.1 * 0.9 * 100) / 100);
        expect(priceLine(sup('a', 's1', { moq: null }), 'carton', 1, MM, { discountPercent: 150 }).perCase).toBe(11); // out-of-range % ignored
    });
});

/** The worked examples in docs/pricing-and-packaging.md — kept true by this test. */
describe('Documented pricing examples', () => {
    const MM = { piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15 };
    const p = (id: string): PricingProduct => ({ id, name: id, price: 11, basePrice: 10, unitsPerCase: 12, casesPerPallet: 80, palletsPerShipment: 33, moq: null, status: 'APPROVED', supplierId: 's1', warehouse: { id: 'w1', city: 'Constanța', country: 'Romania' } });
    it('case, pallet and truck tiers', () => {
        expect(priceLine(p('a'), 'case', 5, MM)).toMatchObject({ perCase: 11, unitPrice: 11, lineTotal: 55, casesTotal: 5, unitsTotal: 60 });
        expect(priceLine(p('a'), 'pallet', 15, MM)).toMatchObject({ perCase: 10.5, unitPrice: 840, lineTotal: 12600, casesTotal: 1200 });
        expect(priceLine(p('a'), 'truck', 1, MM)).toMatchObject({ perCase: 10.2, unitPrice: 26928, lineTotal: 26928, casesTotal: 2640 });
        expect(priceLine(p('a'), 'case', 1, MM, { discountPercent: 10 }).perCase).toBe(9.9);
    });
    it('mixed truck: 8 + 7 pallets', () => {
        const q = priceLoad('TRUCK', [{ productId: 'a', quantity: 8 }, { productId: 'b', quantity: 7 }], new Map([['a', p('a')], ['b', p('b')]]), MM, { requiredFill: 0 });
        expect(q.total).toBe(13800);
        expect(q.lines.map((l) => l.cases)).toEqual([640, 560]);
        expect(Math.round(q.fill * 1000) / 1000).toBe(Math.round((15 / 33) * 1000) / 1000);
    });
});
