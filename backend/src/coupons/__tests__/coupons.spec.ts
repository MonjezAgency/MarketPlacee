import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { OrdersService } from '../../orders/orders.service';
import { MixedLoadsService } from '../../orders/mixed-loads.service';
import { CouponsController } from '../coupons.controller';
import { CouponsService } from '../coupons.service';
import { CODE_ALPHABET, applyCoupon, couponStatus, generateCode, parseCouponInput, CouponRefusal } from '../coupon-rules';
import { recordRedemption } from '../coupon-redemption';

const DAY = 864e5;
const future = () => new Date(Date.now() + DAY);
const base = { code: 'X', discountPercent: 10, isActive: true, expirationDate: future() };
const reason = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof CouponRefusal ? e.reason : String(e); } return 'NO_ERROR'; };

describe('coupon rules', () => {
    it('generates readable codes from the unambiguous alphabet', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 500; i++) {
            const c = generateCode();
            expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
            for (const ch of c.replace('-', '')) expect(CODE_ALPHABET).toContain(ch);
            expect(c).not.toMatch(/[01OIL]/);
            seen.add(c);
        }
        expect(seen.size).toBe(500);
    });

    it('status precedence: disabled > expired > exhausted > scheduled > active', () => {
        const now = new Date();
        expect(couponStatus({ ...base, isActive: false, expirationDate: new Date(0) }, now)).toBe('DISABLED');
        expect(couponStatus({ ...base, expirationDate: new Date(now.getTime() - 1) }, now)).toBe('EXPIRED');
        expect(couponStatus({ ...base, usageLimit: 2, usedCount: 2 }, now)).toBe('EXHAUSTED');
        expect(couponStatus({ ...base, startsAt: new Date(now.getTime() + 1000) }, now)).toBe('SCHEDULED');
        expect(couponStatus({ ...base, startsAt: new Date(now.getTime() - 1000), usageLimit: 2, usedCount: 1 }, now)).toBe('ACTIVE');
    });

    it('date boundaries: valid from startsAt (inclusive) until expirationDate (inclusive)', () => {
        const start = new Date('2026-11-01T10:00:00Z'), end = new Date('2026-11-02T10:00:00Z');
        const c = { ...base, startsAt: start, expirationDate: end };
        const lines = [{ productId: 'a', lineTotal: 100 }];
        expect(reason(() => applyCoupon(c, lines, 100, () => null, { now: new Date(start.getTime() - 1) }))).toBe('NOT_STARTED');
        expect(applyCoupon(c, lines, 100, () => null, { now: start }).discount).toBe(10);
        expect(applyCoupon(c, lines, 100, () => null, { now: end }).discount).toBe(10);
        expect(reason(() => applyCoupon(c, lines, 100, () => null, { now: new Date(end.getTime() + 1) }))).toBe('EXPIRED');
    });

    it('percentage on eligible lines after line discounts, rounded to cents', () => {
        const r = applyCoupon({ ...base, discountPercent: 12.5 }, [{ productId: 'a', lineTotal: 33.33 }, { productId: 'b', lineTotal: 10 }], 43.33, () => null);
        expect(r).toMatchObject({ discount: 5.42, eligibleSubtotal: 43.33, discountPercent: 12.5, type: 'PERCENT' });
        expect(applyCoupon({ ...base, discountPercent: 100 }, [{ productId: 'a', lineTotal: 50 }], 50, () => null).discount).toBe(50);
    });

    it('fixed EUR amount is capped at the eligible amount (total never negative)', () => {
        const c = { ...base, discountType: 'FIXED', discountPercent: 0, amountOff: 25 };
        expect(applyCoupon(c, [{ productId: 'a', lineTotal: 100 }], 100, () => null)).toMatchObject({ discount: 25, discountPercent: 0, type: 'FIXED' });
        expect(applyCoupon(c, [{ productId: 'a', lineTotal: 10 }], 10, () => null).discount).toBe(10);
        // Only the eligible line counts for the cap.
        const scoped = { ...c, scope: 'PRODUCTS', productIds: ['a'] };
        expect(applyCoupon(scoped, [{ productId: 'a', lineTotal: 10 }, { productId: 'b', lineTotal: 500 }], 510, () => null).discount).toBe(10);
    });

    it('eligibility: all / category / products / legacy placement; refuses with a reason when nothing is eligible', () => {
        const lines = [{ productId: 'a', lineTotal: 100 }, { productId: 'b', lineTotal: 300 }, { productId: null, mixedLoadId: 'm', lineTotal: 50 }, { productId: 'c', lineTotal: 0, error: { code: 'BELOW_MOQ' } }];
        const cat = (id: string) => ({ a: 'Snacks', b: 'Drinks', c: 'Snacks' } as any)[id];
        expect(applyCoupon({ ...base, scope: 'ALL' }, lines, 450, cat)).toMatchObject({ eligibleSubtotal: 450, discount: 45 });
        expect(applyCoupon({ ...base, scope: 'CATEGORY', categories: ['Drinks'] }, lines, 450, cat)).toMatchObject({ eligibleSubtotal: 300, discount: 30, eligibleLines: 1 });
        expect(applyCoupon({ ...base, scope: 'PRODUCTS', productIds: ['a'] }, lines, 450, cat)).toMatchObject({ eligibleSubtotal: 100, discount: 10 });
        expect(applyCoupon({ ...base, placementId: 'pl', placement: { productId: 'b' } }, lines, 450, cat)).toMatchObject({ eligibleSubtotal: 300 });
        expect(reason(() => applyCoupon({ ...base, scope: 'CATEGORY', categories: ['Dairy'] }, lines, 450, cat))).toBe('NOT_ELIGIBLE');
        expect(reason(() => applyCoupon({ ...base, scope: 'PRODUCTS', productIds: ['zzz'] }, lines, 450, cat))).toBe('NOT_ELIGIBLE');
        // An errored line (lineTotal 0) is never eligible, even when its product matches.
        expect(reason(() => applyCoupon({ ...base, scope: 'PRODUCTS', productIds: ['c'] }, lines, 450, cat))).toBe('NOT_ELIGIBLE');
        // Legacy placement whose product is gone → nothing eligible, never the whole cart.
        expect(reason(() => applyCoupon({ ...base, placementId: 'pl', placement: null }, lines, 450, cat))).toBe('NOT_ELIGIBLE');
    });

    it('minimum order is compared to the goods subtotal before the coupon', () => {
        const c = { ...base, minOrderAmount: 500 };
        expect(reason(() => applyCoupon(c, [{ productId: 'a', lineTotal: 499.99 }], 499.99, () => null))).toBe('MIN_ORDER');
        expect(applyCoupon(c, [{ productId: 'a', lineTotal: 500 }], 500, () => null).discount).toBe(50);
    });

    it('refuses disabled, expired, exhausted and per-customer-limited codes', () => {
        const l = [{ productId: 'a', lineTotal: 100 }];
        expect(reason(() => applyCoupon(null, l, 100, () => null))).toBe('NOT_FOUND');
        expect(reason(() => applyCoupon({ ...base, isActive: false }, l, 100, () => null))).toBe('DISABLED');
        expect(reason(() => applyCoupon({ ...base, expirationDate: new Date(Date.now() - 1000) }, l, 100, () => null))).toBe('EXPIRED');
        expect(reason(() => applyCoupon({ ...base, usageLimit: 3, usedCount: 3 }, l, 100, () => null))).toBe('EXHAUSTED');
        expect(reason(() => applyCoupon({ ...base, perCustomerLimit: 1 }, l, 100, () => null, { customerUses: 1 }))).toBe('CUSTOMER_LIMIT');
        expect(applyCoupon({ ...base, perCustomerLimit: 2 }, l, 100, () => null, { customerUses: 1 }).discount).toBe(10);
    });
});

describe('coupon input validation', () => {
    const ok = { code: 'spring-26', discountType: 'PERCENT', discountPercent: 10, expirationDate: future().toISOString(), scope: 'ALL' };
    it('accepts a valid config and normalises the code', () => {
        const { input, errors } = parseCouponInput(ok);
        expect(errors).toBeUndefined();
        expect(input).toMatchObject({ code: 'SPRING-26', discountType: 'PERCENT', discountPercent: 10, scope: 'ALL', usageLimit: null, minOrderAmount: null });
    });
    it.each([
        [{ discountPercent: 0 }, 'discountPercent'], [{ discountPercent: 101 }, 'discountPercent'], [{ discountPercent: 'abc' }, 'discountPercent'], [{ discountPercent: 10.555 }, 'discountPercent'],
        [{ discountType: 'FIXED', amountOff: 0 }, 'amountOff'], [{ discountType: 'FIXED', amountOff: -5 }, 'amountOff'], [{ discountType: 'FIXED', amountOff: 1.234 }, 'amountOff'],
        [{ code: '' }, 'code'], [{ code: 'AB' }, 'code'], [{ code: 'BAD CODE!' }, 'code'], [{ code: '-ABCD' }, 'code'],
        [{ minOrderAmount: -1 }, 'minOrderAmount'], [{ usageLimit: 0 }, 'usageLimit'], [{ usageLimit: 1.5 }, 'usageLimit'],
        [{ usageLimit: 2, perCustomerLimit: 3 }, 'perCustomerLimit'],
        [{ expirationDate: '' }, 'expirationDate'], [{ expirationDate: 'nope' }, 'expirationDate'], [{ expirationDate: new Date(Date.now() - 1000).toISOString() }, 'expirationDate'],
        [{ startsAt: future().toISOString(), expirationDate: new Date(Date.now() + 3600_000).toISOString() }, 'dates'],
        [{ scope: 'EVERYTHING' }, 'scope'], [{ scope: 'CATEGORY' }, 'categories'], [{ description: 'x'.repeat(121) }, 'description'], [{ scope: 'PRODUCTS', productIds: [] }, 'productIds'], [{ scope: 'PRODUCTS', productIds: [42] }, 'productIds'],
    ])('rejects %j (%s)', (patch, field) => {
        const { input, errors } = parseCouponInput({ ...ok, ...(patch as any) });
        expect(input).toBeUndefined();
        expect(Object.keys(errors!)).toContain(field);
    });
    it('a fixed coupon stores no percentage', () => {
        expect(parseCouponInput({ ...ok, discountType: 'FIXED', amountOff: '25.50', discountPercent: 99 }).input).toMatchObject({ discountType: 'FIXED', amountOff: 25.5, discountPercent: 0 });
    });
});

describe('recordRedemption — atomic usage limits', () => {
    /** In-memory coupon row; updateMany applies the WHERE to the current row (as Postgres does after the row lock). */
    function txFor(row: any) {
        const redemptions: any[] = [];
        const tx: any = {
            redemptions,
            coupon: {
                updateMany: jest.fn(async ({ where, data }: any) => {
                    const now = Date.now();
                    const okLimit = !where.usedCount || row.usedCount < where.usedCount.lt;
                    const okWindow = row.expirationDate.getTime() >= where.expirationDate.gte.getTime() && (!row.startsAt || row.startsAt.getTime() <= now);
                    if (row.id !== where.id || row.isActive !== where.isActive || !okLimit || !okWindow) return { count: 0 };
                    row.usedCount += data.usedCount.increment;
                    return { count: 1 };
                }),
            },
            couponRedemption: {
                count: jest.fn(async ({ where }: any) => redemptions.filter((r) => r.couponId === where.couponId && r.customerId === where.customerId).length),
                create: jest.fn(async ({ data }: any) => { if (redemptions.some((r) => r.orderId === data.orderId)) throw Object.assign(new Error('unique'), { code: 'P2002' }); redemptions.push(data); return data; }),
            },
        };
        return tx;
    }
    const code = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e?.response?.reason ?? e?.message; } return 'OK'; };

    it('concurrent orders can never exceed the total limit', async () => {
        const row = { id: 'c1', isActive: true, usedCount: 0, expirationDate: future(), startsAt: null };
        const tx = txFor(row);
        const applied = { id: 'c1', code: 'X', discount: 5, usageLimit: 3, perCustomerLimit: null };
        const results = await Promise.all(Array.from({ length: 10 }, (_, i) => code(recordRedemption(tx, applied, `o${i}`, `buyer${i}`))));
        expect(results.filter((r) => r === 'OK')).toHaveLength(3);
        expect(results.filter((r) => r === 'EXHAUSTED')).toHaveLength(7);
        expect(row.usedCount).toBe(3);
        expect(tx.redemptions).toHaveLength(3);
    });

    it('per-customer limit, and a disabled or expired code is refused at order time', async () => {
        const row = { id: 'c1', isActive: true, usedCount: 0, expirationDate: future(), startsAt: null };
        const tx = txFor(row);
        const applied = { id: 'c1', code: 'X', discount: 5, usageLimit: null, perCustomerLimit: 1 };
        expect(await code(recordRedemption(tx, applied, 'o1', 'b1'))).toBe('OK');
        expect(await code(recordRedemption(tx, applied, 'o2', 'b1'))).toBe('CUSTOMER_LIMIT');
        expect(await code(recordRedemption(tx, applied, 'o3', 'b2'))).toBe('OK');
        row.isActive = false;
        expect(await code(recordRedemption(tx, applied, 'o4', 'b3'))).toBe('EXHAUSTED');
        row.isActive = true; row.expirationDate = new Date(Date.now() - 1000);
        expect(await code(recordRedemption(tx, applied, 'o5', 'b3'))).toBe('EXHAUSTED');
    });
});

// ── End to end through OrdersService (same in-memory double as orders-create.spec) ──────────────
const MARKUPS = { piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15, platformFee: 5, shippingMarkup: 1.1 };
const prime = { id: 'prime', name: 'Prime Juventus', category: 'Drinks', price: 15.1953488372093, basePrice: 13.81395348837209, unitsPerCase: 12, casesPerPallet: 132, palletsPerShipment: 26, moq: 1, moqUnit: 'PIECE', status: 'APPROVED', supplierId: 'sup-a', exwLocation: null, warehouse: null, variantPrices: null, images: [], ean: null, brand: 'Prime' };
const chips = { ...prime, id: 'chips', name: 'Chips', category: 'Snacks', supplierId: 'sup-b' };

function makeDb(coupons: any[]) {
    const state = {
        products: new Map<string, any>([[prime.id, { ...prime, stock: 5000 }], [chips.id, { ...chips, stock: 5000 }]]),
        orders: [] as any[], coupons: new Map<string, any>(coupons.map((c) => [c.code, { usedCount: 0, ...c }])), redemptions: [] as any[],
    };
    const db: any = {
        state,
        appConfig: { findUnique: jest.fn(async () => null) },
        orderSupplierConfirmation: { createMany: jest.fn(async ({ data }: any) => ({ count: data.length })) },
        offer: { findMany: jest.fn(async () => []) },
        promotion: { findMany: jest.fn(async () => []) },
        coupon: {
            findUnique: jest.fn(async ({ where }: any) => state.coupons.get(where.code) ?? null),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const c = [...state.coupons.values()].find((x) => x.id === where.id);
                if (!c || !c.isActive || (where.usedCount && c.usedCount >= where.usedCount.lt) || c.expirationDate < where.expirationDate.gte) return { count: 0 };
                c.usedCount += data.usedCount.increment; return { count: 1 };
            }),
        },
        couponRedemption: {
            count: jest.fn(async ({ where }: any) => state.redemptions.filter((r) => r.couponId === where.couponId && r.customerId === where.customerId).length),
            create: jest.fn(async ({ data }: any) => { state.redemptions.push(data); return data; }),
        },
        product: {
            findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => state.products.get(id)).filter(Boolean)),
            updateMany: jest.fn(async ({ where, data }: any) => { const p = state.products.get(where.id); if (!p || p.stock < where.stock.gte) return { count: 0 }; p.stock -= data.stock.decrement; return { count: 1 }; }),
        },
        mixedLoad: { findFirst: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: 0 })) },
        order: {
            findUnique: jest.fn(async () => null),
            create: jest.fn(async ({ data }: any) => { const o = { id: `ord-${state.orders.length + 1}`, ...data, items: data.items.create, customer: { email: null, name: 'Buyer' } }; state.orders.push(o); return o; }),
        },
        $transaction: jest.fn(async (fn: any) => {
            const snap = { orders: state.orders.length, redemptions: state.redemptions.length, used: [...state.coupons.values()].map((c) => [c, c.usedCount]) };
            try { return await fn(db); } catch (e) {
                state.orders.length = snap.orders; state.redemptions.length = snap.redemptions; snap.used.forEach(([c, n]: any) => (c.usedCount = n));
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
    return new OrdersService(db, noop, noop, {} as any, {} as any, appConfig, loads);
}
const RO = { name: 'Buyer', street: 'Str. 1', city: 'Bucharest', postal: '010000', country: 'Romania' };
const err = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return `${e?.response?.code}:${e?.response?.reason ?? ''}`; } return 'NO_ERROR'; };
const cart = [{ productId: 'prime', tier: 'pallet', quantity: 1 }, { productId: 'chips', tier: 'pallet', quantity: 1 }]; // €1,914.00 each

describe('coupons at quote and order creation', () => {
    const c = (o: any) => ({ id: o.code, discountPercent: 0, isActive: true, expirationDate: future(), ...o });

    it('quote: percentage on a category only; same response shape', async () => {
        const db = makeDb([c({ code: 'DRINKS10', discountPercent: 10, scope: 'CATEGORY', categories: ['Drinks'] })]);
        const q: any = await makeService(db).priceCart('buyer', cart, 'drinks10', db, { lenient: true });
        expect(q).toMatchObject({ subtotal: 3828, discountPercent: 10, discount: 191.4, coupon: 'DRINKS10', total: 3636.6 });
    });

    it('quote: fixed amount, products scope, never more than the eligible line', async () => {
        const db = makeDb([c({ code: 'CHIPS5K', discountType: 'FIXED', amountOff: 5000, scope: 'PRODUCTS', productIds: ['chips'] })]);
        const q: any = await makeService(db).priceCart('buyer', cart, 'CHIPS5K', db, { lenient: true });
        expect(q).toMatchObject({ discount: 1914, total: 1914, discountPercent: 0 });
    });

    it('quote and order refuse ineligible, expired, disabled, scheduled, exhausted and below-minimum codes', async () => {
        const db = makeDb([
            c({ code: 'DAIRY', discountPercent: 10, scope: 'CATEGORY', categories: ['Dairy'] }),
            c({ code: 'OLD', discountPercent: 10, scope: 'ALL', expirationDate: new Date(Date.now() - 1000) }),
            c({ code: 'OFF', discountPercent: 10, scope: 'ALL', isActive: false }),
            c({ code: 'SOON', discountPercent: 10, scope: 'ALL', startsAt: future(), expirationDate: new Date(Date.now() + 2 * DAY) }),
            c({ code: 'USED', discountPercent: 10, scope: 'ALL', usageLimit: 1, usedCount: 1 }),
            c({ code: 'BIG', discountPercent: 10, scope: 'ALL', minOrderAmount: 5000 }),
        ]);
        const svc = makeService(db);
        for (const [code, why] of [['DAIRY', 'NOT_ELIGIBLE'], ['OLD', 'EXPIRED'], ['OFF', 'DISABLED'], ['SOON', 'NOT_STARTED'], ['USED', 'EXHAUSTED'], ['BIG', 'MIN_ORDER'], ['NOPE', 'NOT_FOUND']]) {
            expect(await err(svc.priceCart('buyer', cart, code, db, { lenient: true }))).toBe(`INVALID_COUPON:${why}`);
            expect(await err(svc.create('buyer', undefined as any, cart, undefined, undefined, { couponCode: code, shippingAddress: RO }))).toBe(`INVALID_COUPON:${why}`);
        }
        expect(db.state.orders).toHaveLength(0);
    });

    it('order: applied once, recorded once, and the per-buyer + total limits hold', async () => {
        const db = makeDb([c({ code: 'ONCE', discountPercent: 10, scope: 'ALL', usageLimit: 2, perCustomerLimit: 1 })]);
        const svc = makeService(db);
        const o: any = await svc.create('b1', 3445.2, cart, undefined, undefined, { couponCode: 'ONCE', shippingAddress: RO });
        expect(o.totalAmount).toBe(3445.2);
        expect(o.submittedTerms).toMatchObject({ coupon: 'ONCE', goodsTotal: 3445.2 });
        // Line prices are untouched by the coupon (one discount per line stays the offer/special offer).
        expect(o.items.map((i: any) => i.price)).toEqual([1914, 1914]);
        expect(db.state.redemptions).toEqual([{ couponId: 'ONCE', orderId: o.id, customerId: 'b1', discount: 382.8 }]);
        expect(await err(svc.create('b1', undefined as any, cart, undefined, undefined, { couponCode: 'ONCE', shippingAddress: RO }))).toBe('INVALID_COUPON:CUSTOMER_LIMIT');
        await svc.create('b2', undefined as any, cart, undefined, undefined, { couponCode: 'ONCE', shippingAddress: RO });
        expect(await err(svc.create('b3', undefined as any, cart, undefined, undefined, { couponCode: 'ONCE', shippingAddress: RO }))).toBe('INVALID_COUPON:EXHAUSTED');
        expect(db.state.orders).toHaveLength(2);
        expect(db.state.coupons.get('ONCE').usedCount).toBe(2);
    });

    it('order: the last use taken by a concurrent order rolls this order back', async () => {
        const db = makeDb([c({ code: 'LAST', discountPercent: 10, scope: 'ALL', usageLimit: 1 })]);
        const svc = makeService(db);
        // Quote passes (0 used), then another order takes the last use before this transaction runs.
        const realTx = db.$transaction;
        db.$transaction = jest.fn(async (fn: any) => { db.state.coupons.get('LAST').usedCount = 1; return realTx(fn); });
        expect(await err(svc.create('b1', undefined as any, cart, undefined, undefined, { couponCode: 'LAST', shippingAddress: RO }))).toBe('INVALID_COUPON:EXHAUSTED');
        expect(db.state.orders).toHaveLength(0);
        expect(db.state.redemptions).toHaveLength(0);
    });
});

describe('admin coupon endpoints', () => {
    it('every management route is OWNER/ADMIN only; validate needs only a signed-in account', () => {
        const r = new Reflector();
        const proto = CouponsController.prototype as any;
        for (const m of ['adminList', 'generate', 'products', 'categories', 'create', 'update', 'findAll', 'setStatus', 'toggleStatus', 'remove']) {
            expect(r.get('roles', proto[m])).toEqual([Role.OWNER, Role.ADMIN]);
        }
        expect(r.get('roles', proto.validate)).toBeUndefined();
    });

    function svcWith(over: any = {}) {
        const prisma: any = {
            coupon: { findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => ({ id: 'n1', ...data })), findMany: jest.fn(async () => []), delete: jest.fn(async () => ({})), update: jest.fn() },
            couponRedemption: { groupBy: jest.fn(async () => []), count: jest.fn(async () => 0) },
            product: { findMany: jest.fn(async ({ where }: any) => where.id.in.filter((id: string) => id === 'p1').map((id: string) => ({ id }))), count: jest.fn(async () => 1) },
            $queryRaw: jest.fn(async () => []),
            ...over,
        };
        return { prisma, svc: new CouponsService(prisma) };
    }
    const status = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e?.response?.code; } return 'OK'; };
    const valid = { code: 'TEST-1', discountType: 'PERCENT', discountPercent: 10, expirationDate: future().toISOString(), scope: 'ALL' };

    it('generates a code that is not taken', async () => {
        let calls = 0;
        const { svc } = svcWith({ coupon: { findUnique: jest.fn(async () => (calls++ < 2 ? { id: 'taken' } : null)) } });
        const { code } = await svc.generateUniqueCode();
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
        expect(calls).toBe(3);
    });

    it('refuses invalid input with field errors, unknown products, and duplicate codes', async () => {
        const { svc, prisma } = svcWith();
        expect(await status(svc.create({ ...valid, discountPercent: 0 }, 'admin'))).toBe('INVALID_COUPON_INPUT');
        expect(await status(svc.create({ ...valid, scope: 'PRODUCTS', productIds: ['p1', 'ghost'] }, 'admin'))).toBe('INVALID_COUPON_INPUT');
        prisma.coupon.create = jest.fn(async () => { throw Object.assign(new Error('dup'), { code: 'P2002' }); });
        expect(await status(svc.create(valid, 'admin'))).toBe('CODE_TAKEN');
    });

    it('stores product ids only after checking they exist', async () => {
        const { svc, prisma } = svcWith();
        await svc.create({ ...valid, scope: 'PRODUCTS', productIds: ['p1'] }, 'admin');
        expect(prisma.coupon.create).toHaveBeenCalledWith({ data: expect.objectContaining({ code: 'TEST-1', scope: 'PRODUCTS', productIds: ['p1'], createdById: 'admin', discountType: 'PERCENT' }) });
    });

    it('a used code cannot be deleted', async () => {
        const row = { id: 'c1', code: 'USED', discountPercent: 10, isActive: true, expirationDate: future(), createdAt: new Date(0), productIds: [], scope: 'ALL', usedCount: 1, _count: { redemptions: 1 }, placement: null };
        const { svc, prisma } = svcWith({ coupon: { findMany: jest.fn(async () => [row]), delete: jest.fn() } });
        expect(await status(svc.remove('c1'))).toBe('COUPON_USED');
        expect(prisma.coupon.delete).not.toHaveBeenCalled();
    });
});

describe('editing a coupon', () => {
    const past = new Date(Date.now() - DAY);
    const stored = (o: any = {}) => ({ id: 'c1', code: 'USED-1', discountPercent: 10, discountType: 'PERCENT', isActive: true, expirationDate: future(), createdAt: new Date(0), productIds: [], categories: [], scope: 'ALL', usedCount: 3, _count: { redemptions: 3 }, placement: null, ...o });
    function svcFor(row: any) {
        const prisma: any = {
            coupon: { findMany: jest.fn(async () => [row]), updateMany: jest.fn(async ({ where }: any) => ({ count: where.usedCount?.lte !== undefined && row.usedCount > where.usedCount.lte ? 0 : where.usedCount?.equals !== undefined && row.usedCount !== where.usedCount.equals ? 0 : 1 })) },
            couponRedemption: { groupBy: jest.fn(async () => []) },
            product: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) },
            $queryRaw: jest.fn(async () => []),
        };
        return { prisma, svc: new CouponsService(prisma) };
    }
    const fields = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e?.response?.fields ?? e?.response?.code; } return 'OK'; };
    const body = (o: any = {}) => ({ code: 'USED-1', discountType: 'PERCENT', discountPercent: 15, expirationDate: future().toISOString(), scope: 'ALL', description: 'Autumn push', ...o });

    it('keeps the code locked once used and never lowers the limit below the uses', async () => {
        const { svc, prisma } = svcFor(stored());
        expect(await fields(svc.update('c1', body({ code: 'NEW-CODE' })))).toHaveProperty('code');
        expect(await fields(svc.update('c1', body({ usageLimit: 2 })))).toHaveProperty('usageLimit');
        expect(prisma.coupon.updateMany).not.toHaveBeenCalled();
        expect(await fields(svc.update('c1', body({ usageLimit: 3 })))).toBe('OK');
        expect(prisma.coupon.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', usedCount: { lte: 3 } }, data: expect.objectContaining({ discountPercent: 15, usageLimit: 3, description: 'Autumn push' }) });
    });

    it('an unused code can be renamed; the rename is refused if a first use lands meanwhile', async () => {
        const row = stored({ usedCount: 0, _count: { redemptions: 0 } });
        const { svc, prisma } = svcFor(row);
        expect(await fields(svc.update('c1', body({ code: 'RENAMED' })))).toBe('OK');
        expect(prisma.coupon.updateMany.mock.calls[0][0].where).toEqual({ id: 'c1', usedCount: { equals: 0 } });
        row.usedCount = 1; // redemption between the read and the UPDATE (the read still saw 0 below)
        prisma.coupon.findMany = jest.fn(async () => [{ ...row, usedCount: 0 }]);
        expect(await fields(svc.update('c1', body({ code: 'RENAMED-2' })))).toHaveProperty('usageLimit');
    });

    it('an expired end date may be kept; a changed end must be in the future', async () => {
        const { svc } = svcFor(stored({ expirationDate: past }));
        expect(await fields(svc.update('c1', body({ expirationDate: past.toISOString() })))).toBe('OK');
        expect(await fields(svc.update('c1', body({ expirationDate: new Date(Date.now() - 1000).toISOString() })))).toHaveProperty('expirationDate');
    });
});
