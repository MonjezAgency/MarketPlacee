import { OrdersService } from '../orders.service';
import { MixedLoadsService } from '../mixed-loads.service';

/**
 * Order creation with an in-memory Prisma double: verifies server-side
 * repricing, the PRICE_CHANGED guard, idempotency, transactional stock
 * and mixed-load locking. No database or network needed.
 */
const MARKUPS = { piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15, platformFee: 5, shippingMarkup: 1.1 };
const prime = { id: 'prime', name: 'Prime Juventus', price: 15.1953488372093, basePrice: 13.81395348837209, unitsPerCase: 12, casesPerPallet: 132, palletsPerShipment: 26, moq: 1, moqUnit: 'PIECE', status: 'APPROVED', supplierId: 'sup-a', exwLocation: null, warehouse: { id: 'w-nl', city: 'Rotterdam', country: 'Netherlands' }, variantPrices: null, images: [], ean: null, brand: 'Prime' };
const zero = { ...prime, id: 'zero', name: 'Prime Zero', casesPerPallet: 120, palletsPerShipment: 24 };

function makeDb() {
    const state = {
        products: new Map<string, any>([[prime.id, { ...prime, stock: 50 }], [zero.id, { ...zero, stock: 50 }]]),
        orders: [] as any[],
        loads: new Map<string, any>(),
        coupons: new Map<string, any>([['SAVE10', { code: 'SAVE10', discountPercent: 10, isActive: true, expirationDate: new Date(Date.now() + 864e5) }]]),
        offers: [] as any[],
        confirmations: [] as any[],
    };
    const db: any = {
        state,
        appConfig: { findUnique: jest.fn(async () => null) },
        orderSupplierConfirmation: { createMany: jest.fn(async ({ data }: any) => { state.confirmations.push(...data); return { count: data.length }; }) },
        offer: { findMany: jest.fn(async () => state.offers ?? []) },
        coupon: { findUnique: jest.fn(async ({ where }: any) => state.coupons.get(where.code) ?? null) },
        product: {
            findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => state.products.get(id)).filter(Boolean)),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const p = state.products.get(where.id);
                if (!p || p.stock < where.stock.gte) return { count: 0 };
                p.stock -= data.stock.decrement;
                return { count: 1 };
            }),
        },
        mixedLoad: {
            findFirst: jest.fn(async ({ where }: any) => { const l = state.loads.get(where.id); return l && l.customerId === where.customerId ? l : null; }),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const l = state.loads.get(where.id);
                if (!l || l.status !== where.status) return { count: 0 };
                Object.assign(l, data);
                return { count: 1 };
            }),
        },
        order: {
            findUnique: jest.fn(async ({ where }: any) => state.orders.find((o) => o.idempotencyKey === where.idempotencyKey) ?? null),
            create: jest.fn(async ({ data }: any) => {
                const o = { id: `ord-${state.orders.length + 1}`, ...data, items: data.items.create, customer: { email: null, name: 'Buyer' } };
                state.orders.push(o);
                return o;
            }),
        },
        // Snapshot/restore emulates rollback of the interactive transaction.
        $transaction: jest.fn(async (fn: any) => {
            const snap = { stock: [...state.products.values()].map((p) => [p.id, p.stock]), orders: state.orders.length, loads: [...state.loads.values()].map((l) => ({ ...l })) };
            try { return await fn(db); } catch (e) {
                snap.stock.forEach(([id, s]) => (state.products.get(id as string).stock = s));
                state.orders.length = snap.orders;
                snap.loads.forEach((l) => state.loads.set(l.id, l));
                throw e;
            }
        }),
    };
    return db;
}

function makeService(db: any) {
    const appConfig: any = { getMarkupPercentage: jest.fn(async () => MARKUPS) };
    const loads = new MixedLoadsService(db, appConfig);
    const noop: any = { sendOrderConfirmationEmail: jest.fn(async () => {}), create: jest.fn(async () => {}), notifyAdmins: jest.fn(async () => {}) };
    const svc = new OrdersService(db, noop, noop, {} as any, {} as any, appConfig, loads);
    // Every order needs a delivery address in a supported country; tests that don't care get Romania.
    const create = svc.create.bind(svc);
    (svc as any).create = (c: string, t: any, i: any[], sc?: string, cost?: number, opts: any = {}) => create(c, t, i, sc, cost, { shippingAddress: RO, ...opts });
    return svc;
}
const RO = { name: 'Buyer', street: 'Str. 1', city: 'Bucharest', postal: '010000', country: 'Romania' };
const err = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e?.response?.code ?? e?.message; } return 'NO_ERROR'; };

describe('OrdersService.create — server-side pricing', () => {
    it('ignores client prices and stores server prices', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('prime').stock = 500;
        const order: any = await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 2, price: 0.01 }]);
        // 132 cases × €14.50 = €1,914.00 per pallet
        expect(order.items[0].price).toBe(1914);
        expect(order.totalAmount).toBe(3828);
        // Stock is kept in cases: 2 pallets × 132 cases come off stock and are recorded on the line.
        expect(db.state.products.get('prime').stock).toBe(500 - 264);
        expect(order.items[0].stockCases).toBe(264);
    });
    it('a new order waits for supplier acceptance and Atlantis approval — the buyer’s submit confirms nothing', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('prime').stock = 500;
        const order: any = await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }]);
        expect(order.status).toBe('PENDING');
        expect(order.reviewStatus).toBe('PENDING_REVIEW');
        expect(order.termsVersion).toBe(1);
        expect(order.submittedTerms.lines[0]).toMatchObject({ productId: 'prime', quantity: 1, unitPrice: 1914, supplierId: 'sup-a' });
        // No fulfilment service in this test → freight is quoted after the order, never invented.
        expect(order.shippingCost).toBeNull();
        expect(order.submittedTerms.freight).toEqual({ amount: null, status: 'quote_required' });
        expect(db.state.confirmations).toEqual([expect.objectContaining({ orderId: order.id, supplierId: 'sup-a', termsVersion: 1, deadline: expect.any(Date) })]);
        // 72 hours by default
        const hours = (db.state.confirmations[0].deadline.getTime() - Date.now()) / 3600_000;
        expect(hours).toBeGreaterThan(71.9);
        expect(hours).toBeLessThanOrEqual(72);
    });
    it('refuses when the client total disagrees with the server (PRICE_CHANGED)', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('prime').stock = 500;
        expect(await err(svc.create('buyer', 100, [{ productId: 'prime', tier: 'pallet', quantity: 2 }]))).toBe('PRICE_CHANGED');
        expect(db.state.orders).toHaveLength(0);
    });
    it('applies a valid coupon server-side and rejects an invalid one', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('prime').stock = 500;
        const o: any = await svc.create('buyer', 3445.2, [{ productId: 'prime', tier: 'pallet', quantity: 2 }], undefined, undefined, { couponCode: 'SAVE10' });
        expect(o.totalAmount).toBe(3445.2);
        expect(await err(svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }], undefined, undefined, { couponCode: 'NOPE' }))).toBe('INVALID_COUPON');
    });
    it('enforces tier availability and MOQ on the server', async () => {
        const db = makeDb();
        db.state.products.get('prime').palletsPerShipment = null;
        db.state.products.get('zero').moq = 5000;
        const svc = makeService(db);
        expect(await err(svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'truck', quantity: 1 }]))).toBe('TIER_UNAVAILABLE');
        expect(await err(svc.create('buyer', undefined as any, [{ productId: 'zero', tier: 'carton', quantity: 10 }]))).toBe('BELOW_MOQ');
    });
    it('refuses a pallet when stock holds fewer cases than a pallet (no overselling by tier)', async () => {
        const db = makeDb(), svc = makeService(db); // prime: 50 cases, a pallet is 132
        expect(await err(svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }]))).toBe('INSUFFICIENT_STOCK');
        expect(db.state.products.get('prime').stock).toBe(50);
    });
    it('rolls back everything when stock is short on any line', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('zero').stock = 1;
        expect(await err(svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'carton', quantity: 3 }, { productId: 'zero', tier: 'carton', quantity: 2 }]))).toBe('INSUFFICIENT_STOCK');
        expect(db.state.products.get('prime').stock).toBe(50);
        expect(db.state.orders).toHaveLength(0);
    });
});

describe('Idempotency', () => {
    it('a repeated submit with the same key returns the same order and writes once', async () => {
        const db = makeDb(), svc = makeService(db);
        const a: any = await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'carton', quantity: 3 }], undefined, undefined, { idempotencyKey: 'checkout-abc12345' });
        const b: any = await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'carton', quantity: 3 }], undefined, undefined, { idempotencyKey: 'checkout-abc12345' });
        expect(b.id).toBe(a.id);
        expect(db.state.orders).toHaveLength(1);
        expect(db.state.products.get('prime').stock).toBe(47);
    });
    it('another user cannot reuse a key', async () => {
        const db = makeDb(), svc = makeService(db);
        await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'carton', quantity: 1 }], undefined, undefined, { idempotencyKey: 'checkout-shared999' });
        expect(await err(svc.create('intruder', undefined as any, [{ productId: 'prime', tier: 'carton', quantity: 1 }], undefined, undefined, { idempotencyKey: 'checkout-shared999' }))).toBe('IDEMPOTENCY_CONFLICT');
    });
});

describe('Mixed loads in orders', () => {
    const fullTruck = { id: 'load-1', customerId: 'buyer', kind: 'TRUCK', status: 'DRAFT', version: 0, lines: [{ productId: 'prime', quantity: 13 }, { productId: 'zero', quantity: 12 }] };
    it('orders a full mixed truck at the server total and locks the load', async () => {
        const db = makeDb(); db.state.loads.set('load-1', { ...fullTruck });
        db.state.products.get('prime').stock = 5000; db.state.products.get('zero').stock = 5000;
        const svc = makeService(db);
        const o: any = await svc.create('buyer', undefined as any, [{ mixedLoadId: 'load-1', price: 1 }]);
        const subtotal = 13 * 132 * 13.81 + 12 * 120 * 13.81;
        expect(o.totalAmount).toBe(Math.round(Math.round(subtotal * 100) / 100 * 1.15 * 100) / 100);
        expect(o.items[0].mixedLoadId).toBe('load-1');
        expect(o.items[0].mixComposition).toHaveLength(2);
        expect(db.state.loads.get('load-1').status).toBe('ORDERED');
        // Mixed loads take stock per product, in cases, and record it on each entry.
        expect(db.state.products.get('prime').stock).toBe(5000 - 13 * 132);
        expect(db.state.products.get('zero').stock).toBe(5000 - 12 * 120);
        expect(o.items[0].mixComposition.map((c: any) => c.stockCases)).toEqual([13 * 132, 12 * 120]);
    });
    it('refuses a mixed load when a product in it has too little stock, and changes nothing', async () => {
        const db = makeDb(); db.state.loads.set('load-1', { ...fullTruck });
        db.state.products.get('prime').stock = 5000; db.state.products.get('zero').stock = 100;
        const svc = makeService(db);
        expect(await err(svc.create('buyer', undefined as any, [{ mixedLoadId: 'load-1' }]))).toBe('LOAD_NOT_READY');
        expect(db.state.products.get('prime').stock).toBe(5000);
        expect(db.state.orders).toHaveLength(0);
        expect(db.state.loads.get('load-1').status).toBe('DRAFT');
    });
    it('refuses an under-filled load (when a minimum is configured) and a load already ordered', async () => {
        const db = makeDb();
        db.state.loads.set('half', { ...fullTruck, id: 'half', lines: [{ productId: 'prime', quantity: 13 }] });
        db.state.loads.set('done', { ...fullTruck, id: 'done', status: 'ORDERED' });
        // Only when an admin has configured a minimum fill.
        db.appConfig.findUnique = jest.fn(async ({ where }: any) => (where.key === 'MIX_MIN_FILL_PERCENT' ? { value: '100' } : null));
        const svc = makeService(db);
        expect(await err(svc.create('buyer', undefined as any, [{ mixedLoadId: 'half' }]))).toBe('LOAD_NOT_READY');
        expect(await err(svc.create('buyer', undefined as any, [{ mixedLoadId: 'done' }]))).toBe('LOAD_ALREADY_ORDERED');
    });
    it('with no minimum configured, a partly filled load can be ordered', async () => {
        const db = makeDb();
        db.state.loads.set('half', { ...fullTruck, id: 'half', lines: [{ productId: 'prime', quantity: 13 }] });
        db.state.products.get('prime').stock = 5000;
        const o: any = await makeService(db).create('buyer', undefined as any, [{ mixedLoadId: 'half' }]);
        expect(o.items[0].mixedLoadId).toBe('half');
    });
    it('cannot order someone else\'s load', async () => {
        const db = makeDb(); db.state.loads.set('load-1', { ...fullTruck });
        const svc = makeService(db);
        expect(await err(svc.create('intruder', undefined as any, [{ mixedLoadId: 'load-1' }]))).toBe('LOAD_NOT_FOUND');
    });
});

describe('Delivery destination and offers at order time', () => {
    it('refuses an unsupported destination before anything is written (Egypt)', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('prime').stock = 500;
        const e: any = await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }], undefined, undefined, { shippingAddress: { ...RO, country: 'Egypt' } }).catch((x) => x);
        expect(e.response.code).toBe('DESTINATION_UNSUPPORTED');
        expect(e.response.message).toMatch(/Delivery to Egypt is not currently supported/);
        expect(db.state.orders).toHaveLength(0);
        expect(db.state.products.get('prime').stock).toBe(500);
    });
    it('needs a delivery country, and stores the address with its ISO code', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('prime').stock = 500;
        expect(await err(svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }], undefined, undefined, { shippingAddress: { ...RO, country: '' } }))).toBe('DESTINATION_REQUIRED');
        const o: any = await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }], 'DB SCHENKER', 999);
        expect(o.destinationCountry).toBe('RO');
        expect(o.shippingAddress.city).toBe('Bucharest');
        expect(o.shippingCost).toBeNull(); // a client-side freight figure is never stored
    });
    it('follows an admin-configured delivery list', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('prime').stock = 500;
        db.appConfig.findUnique = jest.fn(async ({ where }: any) => (where.key === 'DELIVERY_COUNTRIES' ? { value: '["EG"]' } : null));
        expect(await err(svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }]))).toBe('DESTINATION_UNSUPPORTED');
        const o: any = await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }], undefined, undefined, { shippingAddress: { ...RO, country: 'Egypt' } });
        expect(o.destinationCountry).toBe('EG');
    });
    it('charges the approved offer price the product page shows (buyer and supplier price cut by the same %)', async () => {
        const db = makeDb(), svc = makeService(db);
        db.state.products.get('prime').stock = 500;
        db.state.offers = [{ productId: 'prime', discountPercent: 10, variantDiscounts: null }];
        const o: any = await svc.create('buyer', undefined as any, [{ productId: 'prime', tier: 'pallet', quantity: 1 }]);
        // €13.81395 × 1.05 × 0.9 = €13.05 per case; × 132 cases
        expect(o.items[0].price).toBe(Math.round(13.05 * 132 * 100) / 100);
        expect(o.items[0].supplierUnitPrice).toBe(Math.round(13.81395348837209 * 0.9 * 132 * 100) / 100);
    });
    it('reports short stock in the quote, before checkout', async () => {
        const db = makeDb(), svc = makeService(db);
        const q: any = await svc.priceCart('buyer', [{ productId: 'prime', tier: 'pallet', quantity: 1 }], null, db, { lenient: true });
        expect(q.lines[0].error.code).toBe('INSUFFICIENT_STOCK');
        expect(q.lines[0].error.availableCases).toBe(50);
    });
});
