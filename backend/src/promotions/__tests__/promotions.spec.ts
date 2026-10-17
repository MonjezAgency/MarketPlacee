import {
    PromotionError, bestDiscount, editableFields, parseInstant, productEligibility, promoPrice, promotionState,
    validatePercent, validateWindow, windowsOverlap,
} from '../promotion-rules';
import { activePromotions, attachPromotions } from '../promotion-lookup';
import { PromotionsService } from '../promotions.service';
import { OrdersService } from '../../orders/orders.service';
import { MixedLoadsService } from '../../orders/mixed-loads.service';
import { applyPricePrivacy } from '../../common/price-privacy';
import { stripPrices } from '../../products/price-visibility';

/**
 * Special offers (Promotion): lifecycle, validation, authorization, and that
 * the cart quote / order creation honour exactly the running promotion —
 * once, from the undiscounted price — and stop the moment it ends.
 * In-memory Prisma double, no database.
 */

const T0 = new Date('2026-10-20T10:00:00.000Z');
const H = 3600_000;
const at = (h: number) => new Date(T0.getTime() + h * H);

// ─── A tiny where-matcher for the Prisma double ─────────────────────────
function cmp(v: any, cond: any): boolean {
    if (cond === undefined) return true;
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
        if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime();
        return v === cond;
    }
    const n = (x: any) => (x instanceof Date ? x.getTime() : x);
    if ('in' in cond && !cond.in.includes(v)) return false;
    if ('notIn' in cond && cond.notIn.includes(v)) return false;
    if ('not' in cond && (cond.not === null ? v === null || v === undefined : v === cond.not)) return false;
    if ('lt' in cond && !(v != null && n(v) < n(cond.lt))) return false;
    if ('lte' in cond && !(v != null && n(v) <= n(cond.lte))) return false;
    if ('gt' in cond && !(v != null && n(v) > n(cond.gt))) return false;
    if ('gte' in cond && !(v != null && n(v) >= n(cond.gte))) return false;
    if ('contains' in cond && !String(v ?? '').toLowerCase().includes(String(cond.contains).toLowerCase())) return false;
    return true;
}
function matches(row: any, where: any, rel: Record<string, (r: any) => any> = {}): boolean {
    if (!where) return true;
    for (const [k, c] of Object.entries(where)) {
        if (k === 'AND') { if (!(c as any[]).every((w) => matches(row, w, rel))) return false; continue; }
        if (k === 'OR') { if (!(c as any[]).some((w) => matches(row, w, rel))) return false; continue; }
        if (rel[k]) { if (!matches(rel[k](row) || {}, c, {})) return false; continue; }
        if (!cmp(row[k], c)) return false;
    }
    return true;
}

const MARKUPS = { piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15, platformFee: 5, shippingMarkup: 1.1 };
const prime = { id: 'prime', name: 'Prime Juventus', price: 15.1953488372093, basePrice: 13.81395348837209, unitsPerCase: 12, casesPerPallet: 132, palletsPerShipment: 26, moq: 1, moqUnit: 'PIECE', status: 'APPROVED', supplierId: 'sup-a', exwLocation: null, warehouse: { id: 'w-nl', city: 'Rotterdam', country: 'Netherlands' }, variantPrices: null, variants: null, images: [], ean: '5060639123456', brand: 'Prime', stock: 5000 };

function makeDb(clock: { now: Date }) {
    const state = {
        products: new Map<string, any>([
            ['prime', { ...prime }],
            ['other', { ...prime, id: 'other', name: 'Other supplier product', supplierId: 'sup-b' }],
            ['noprice', { ...prime, id: 'noprice', name: 'No price yet', basePrice: null }],
            ['pending', { ...prime, id: 'pending', name: 'In review', status: 'PENDING' }],
        ]),
        promotions: [] as any[],
        offers: [] as any[],
        orders: [] as any[],
    };
    const prod = (r: any) => state.products.get(r.productId);
    const withProduct = (r: any, include: any) => (include?.product ? { ...r, product: prod(r) } : r);
    const db: any = {
        state,
        appConfig: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
        user: { findMany: jest.fn(async () => []) },
        offer: { findMany: jest.fn(async () => state.offers) },
        coupon: { findUnique: jest.fn(async () => null) },
        orderSupplierConfirmation: { createMany: jest.fn(async ({ data }: any) => ({ count: data.length })) },
        product: {
            findUnique: jest.fn(async ({ where }: any) => state.products.get(where.id) ?? null),
            findMany: jest.fn(async ({ where }: any) => [...state.products.values()].filter((p) => matches(p, where))),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const p = state.products.get(where.id);
                if (!p || p.stock < where.stock.gte) return { count: 0 };
                p.stock -= data.stock.decrement;
                return { count: 1 };
            }),
        },
        promotion: {
            create: jest.fn(async ({ data }: any) => { const r = { id: `promo-${state.promotions.length + 1}`, createdAt: clock.now, updatedAt: clock.now, cancelledAt: null, cancelReason: null, updatedById: null, cancelledById: null, ...data }; state.promotions.push(r); return r; }),
            findUnique: jest.fn(async ({ where, include }: any) => { const r = state.promotions.find((x) => x.id === where.id); return r ? withProduct(r, include) : null; }),
            findFirst: jest.fn(async ({ where }: any) => state.promotions.find((r) => matches(r, where, { product: prod })) ?? null),
            findMany: jest.fn(async ({ where, include, orderBy }: any) => {
                let rows = state.promotions.filter((r) => matches(r, where, { product: prod }));
                if (orderBy?.discountPercent === 'desc') rows = rows.slice().sort((a, b) => b.discountPercent - a.discountPercent);
                return rows.map((r) => withProduct(r, include));
            }),
            count: jest.fn(async ({ where }: any) => state.promotions.filter((r) => matches(r, where, { product: prod })).length),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const rows = state.promotions.filter((r) => matches(r, where));
                rows.forEach((r) => Object.assign(r, data, { updatedAt: clock.now }));
                return { count: rows.length };
            }),
        },
        order: {
            findUnique: jest.fn(async () => null),
            create: jest.fn(async ({ data }: any) => { const o = { id: `ord-${state.orders.length + 1}`, ...data, items: data.items.create }; state.orders.push(o); return o; }),
        },
        mixedLoad: { findFirst: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: 1 })) },
        $transaction: jest.fn(async (fn: any) => fn(db)),
    };
    return db;
}

function makePromotions(db: any, clock: { now: Date }) {
    const svc = new PromotionsService(db);
    svc.now = () => clock.now;
    return svc;
}
const SUPPLIER = { id: 'sup-a', role: 'SUPPLIER' };
const ADMIN = { id: 'adm-1', role: 'ADMIN' };
const supScope = { kind: 'supplier' as const, supplierId: 'sup-a' };
const adminScope = { kind: 'admin' as const };
const code = async (p: Promise<unknown>) => { try { await p; } catch (e: any) { return e instanceof PromotionError ? `${e.status}:${e.code}` : e?.response?.code ?? e?.message; } return 'NO_ERROR'; };

/** Insert a promotion row directly (bypasses the "end must be in the future" rule, for past windows). */
function seed(db: any, row: Partial<any>) {
    const r = { id: `seed-${db.state.promotions.length + 1}`, productId: 'prime', supplierId: 'sup-a', name: null, discountPercent: 10, startsAt: at(-1), endsAt: at(24), status: 'ACTIVE', basePriceAtCreation: prime.basePrice, createdById: 'sup-a', createdByRole: 'SUPPLIER', history: [], createdAt: at(-2), updatedAt: at(-2), cancelledAt: null, cancelledById: null, cancelReason: null, ...row };
    db.state.promotions.push(r);
    return r;
}

// ─── Rules ──────────────────────────────────────────────────────────────

describe('promotion lifecycle (derived from time)', () => {
    const p = { startsAt: at(0), endsAt: at(10), status: 'ACTIVE' };
    it('exactly at the start it is active; a millisecond before it is scheduled', () => {
        expect(promotionState(p, at(0))).toBe('ACTIVE');
        expect(promotionState(p, new Date(at(0).getTime() - 1))).toBe('SCHEDULED');
    });
    it('exactly at the end it has expired; a millisecond before it is still active', () => {
        expect(promotionState(p, at(10))).toBe('EXPIRED');
        expect(promotionState(p, new Date(at(10).getTime() - 1))).toBe('ACTIVE');
    });
    it('cancelled wins over time; an unapproved product puts a running window on hold', () => {
        expect(promotionState({ ...p, status: 'CANCELLED' }, at(5))).toBe('CANCELLED');
        expect(promotionState(p, at(5), false)).toBe('ON_HOLD');
        expect(promotionState(p, at(-1), false)).toBe('SCHEDULED');
    });
    it('only a scheduled promotion can change its discount and start', () => {
        expect(editableFields('SCHEDULED')).toEqual(['discountPercent', 'startsAt', 'endsAt', 'name']);
        expect(editableFields('ACTIVE')).toEqual(['endsAt', 'name']);
        expect(editableFields('EXPIRED')).toEqual([]);
        expect(editableFields('CANCELLED')).toEqual([]);
    });
});

describe('time zones', () => {
    it('a value without a zone is UTC; an offset is honoured; both are the same instant', () => {
        expect(parseInstant('2026-10-24T18:00', 'endsAt').toISOString()).toBe('2026-10-24T18:00:00.000Z');
        expect(parseInstant('2026-10-24T20:00:00+02:00', 'endsAt').toISOString()).toBe('2026-10-24T18:00:00.000Z');
        expect(parseInstant('2026-10-24T18:00:00Z', 'endsAt').getTime()).toBe(parseInstant('2026-10-24T21:00+03:00', 'endsAt').getTime());
    });
    it('the boundary is the same instant whatever zone it was entered in', () => {
        const p = { startsAt: parseInstant('2026-10-24T09:00+03:00', 'startsAt'), endsAt: parseInstant('2026-10-25T00:00', 'endsAt') };
        expect(promotionState(p, new Date('2026-10-24T06:00:00Z'))).toBe('ACTIVE');
        expect(promotionState(p, new Date('2026-10-24T05:59:59.999Z'))).toBe('SCHEDULED');
        expect(promotionState(p, new Date('2026-10-25T00:00:00Z'))).toBe('EXPIRED');
    });
    it('garbage dates are refused', () => {
        expect(() => parseInstant('next tuesday', 'startsAt')).toThrow(PromotionError);
        expect(() => parseInstant('', 'endsAt')).toThrow(PromotionError);
    });
});

describe('validation', () => {
    it.each([[0, 'PERCENT_TOO_LOW'], [100, 'PERCENT_TOO_HIGH'], [-5, 'PERCENT_TOO_LOW'], [NaN, 'PERCENT_INVALID'], ['abc', 'PERCENT_INVALID'], [Infinity, 'PERCENT_INVALID'], [null, 'PERCENT_INVALID'], [90.5, 'PERCENT_TOO_HIGH'], [12.345, 'PERCENT_PRECISION']])('refuses %p (%s)', (v, c) => {
        try { validatePercent(v); throw new Error('accepted'); } catch (e: any) { expect(e).toBeInstanceOf(PromotionError); expect(e.code).toBe(c); }
    });
    it('accepts 0 < p ≤ 90 with up to 2 decimals (numbers or strings)', () => {
        expect(validatePercent(15)).toBe(15);
        expect(validatePercent('12.5')).toBe(12.5);
        expect(validatePercent('7,25')).toBe(7.25);
        expect(validatePercent(90)).toBe(90);
        expect(validatePercent(0.01)).toBe(0.01);
    });
    it('end must be after the start and in the future; a past start means now', () => {
        expect(() => validateWindow(at(5), at(5), T0)).toThrow(expect.objectContaining({ code: 'END_BEFORE_START' }));
        expect(() => validateWindow(at(5), at(4), T0)).toThrow(expect.objectContaining({ code: 'END_BEFORE_START' }));
        expect(() => validateWindow(at(-5), at(-1), T0)).toThrow(expect.objectContaining({ code: 'END_IN_PAST' }));
        expect(() => validateWindow(at(1), at(24 * 400), T0)).toThrow(expect.objectContaining({ code: 'TOO_LONG' }));
        const w = validateWindow(at(-3), at(3), T0);
        expect(w.startsAt.getTime()).toBe(T0.getTime());
    });
    it('half-open windows: back-to-back promotions do not overlap', () => {
        expect(windowsOverlap({ startsAt: at(0), endsAt: at(5) }, { startsAt: at(5), endsAt: at(9) })).toBe(false);
        expect(windowsOverlap({ startsAt: at(0), endsAt: at(5) }, { startsAt: at(4), endsAt: at(9) })).toBe(true);
    });
    it('a product needs a valid net price and must be live', () => {
        expect(productEligibility({ status: 'APPROVED', basePrice: null })).toMatchObject({ ok: false, code: 'PRICE_MISSING' });
        expect(productEligibility({ status: 'APPROVED', basePrice: 0 })).toMatchObject({ ok: false, code: 'PRICE_MISSING' });
        expect(productEligibility({ status: 'PENDING', basePrice: 10 })).toMatchObject({ ok: false, code: 'PRODUCT_NOT_LIVE' });
        expect(productEligibility({ status: 'APPROVED', basePrice: 10 })).toEqual({ ok: true });
    });
    it('one discount per line: the deeper one, never both', () => {
        expect(bestDiscount(5, 10)).toEqual({ percent: 10, source: 'PROMOTION' });
        expect(bestDiscount(20, 10)).toEqual({ percent: 20, source: 'OFFER' });
        expect(bestDiscount(0, 0)).toEqual({ percent: 0, source: null });
        expect(promoPrice(14.5, 15)).toBe(12.33);
    });
});

// ─── Management ─────────────────────────────────────────────────────────

describe('PromotionsService — create / edit / cancel', () => {
    const body = (o: any = {}) => ({ productId: 'prime', discountPercent: 15, startsAt: at(1).toISOString(), endsAt: at(48).toISOString(), name: 'Autumn push', ...o });

    it('a supplier creates a special offer on their own product (audit recorded, net prices only)', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        const v: any = await svc.create(SUPPLIER, supScope, body());
        expect(v).toMatchObject({ discountPercent: 15, state: 'SCHEDULED', name: 'Autumn push', createdBy: { kind: 'YOU' } });
        expect(v.net).toEqual({ current: 13.81, promotional: 11.74, atCreation: 13.81, changedSinceCreation: false });
        expect(db.state.promotions[0].history).toEqual([expect.objectContaining({ action: 'CREATE', by: 'sup-a', role: 'SUPPLIER' })]);
        expect(db.state.promotions[0].supplierId).toBe('sup-a');
    });

    it("a supplier can't create one on another supplier's product (403) — an admin can", async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        expect(await code(svc.create(SUPPLIER, supScope, body({ productId: 'other' })))).toBe('403:FORBIDDEN');
        expect(db.state.promotions).toHaveLength(0);
        const v: any = await svc.create(ADMIN, adminScope, body({ productId: 'other' }));
        expect(v.state).toBe('SCHEDULED');
        expect(db.state.promotions[0]).toMatchObject({ productId: 'other', supplierId: 'sup-b', createdById: 'adm-1', createdByRole: 'ADMIN' });
    });

    it("a supplier can't edit or cancel a promotion on another supplier's product (403)", async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        const row = seed(db, { productId: 'other', supplierId: 'sup-b', startsAt: at(2), endsAt: at(20) });
        expect(await code(svc.update(SUPPLIER, supScope, row.id, { discountPercent: 20 }))).toBe('403:FORBIDDEN');
        expect(await code(svc.cancel(SUPPLIER, supScope, row.id))).toBe('403:FORBIDDEN');
        expect(await code(svc.get(supScope, row.id))).toBe('403:FORBIDDEN');
        expect(row.discountPercent).toBe(10);
        expect(row.status).toBe('ACTIVE');
    });

    it('refuses a product without a price, an unapproved product, bad percentages and bad windows', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        expect(await code(svc.create(SUPPLIER, supScope, body({ productId: 'noprice' })))).toBe('400:PRICE_MISSING');
        expect(await code(svc.create(SUPPLIER, supScope, body({ productId: 'pending' })))).toBe('400:PRODUCT_NOT_LIVE');
        expect(await code(svc.create(SUPPLIER, supScope, body({ productId: 'nope' })))).toBe('404:PRODUCT_NOT_FOUND');
        for (const pct of [0, 100, -1, 'x']) expect(await code(svc.create(SUPPLIER, supScope, body({ discountPercent: pct })))).toMatch(/^400:PERCENT_/);
        expect(await code(svc.create(SUPPLIER, supScope, body({ startsAt: at(5).toISOString(), endsAt: at(5).toISOString() })))).toBe('400:END_BEFORE_START');
        expect(await code(svc.create(SUPPLIER, supScope, body({ startsAt: at(-9).toISOString(), endsAt: at(-1).toISOString() })))).toBe('400:END_IN_PAST');
        expect(db.state.promotions).toHaveLength(0);
    });

    it('refuses overlapping promotions on the same product; back-to-back and after a cancel is fine', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        const first: any = await svc.create(SUPPLIER, supScope, body({ startsAt: at(1).toISOString(), endsAt: at(10).toISOString() }));
        expect(await code(svc.create(SUPPLIER, supScope, body({ startsAt: at(9).toISOString(), endsAt: at(20).toISOString() })))).toBe('409:OVERLAP');
        expect(await code(svc.create(ADMIN, adminScope, body({ startsAt: at(0).toISOString(), endsAt: at(30).toISOString() })))).toBe('409:OVERLAP');
        await svc.create(SUPPLIER, supScope, body({ startsAt: at(10).toISOString(), endsAt: at(20).toISOString() }));
        await svc.cancel(SUPPLIER, supScope, first.id);
        const again: any = await svc.create(SUPPLIER, supScope, body({ startsAt: at(2).toISOString(), endsAt: at(8).toISOString(), discountPercent: 5 }));
        expect(again.state).toBe('SCHEDULED');
        // Moving the end of a scheduled one into its neighbour is refused too.
        expect(await code(svc.update(SUPPLIER, supScope, again.id, { endsAt: at(12).toISOString() }))).toBe('409:OVERLAP');
    });

    it('a running promotion keeps its discount and start; its end and name can change', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        const row = seed(db, { startsAt: at(-2), endsAt: at(10), discountPercent: 10 });
        expect(await code(svc.update(SUPPLIER, supScope, row.id, { discountPercent: 25 }))).toBe('409:FIELD_LOCKED');
        expect(await code(svc.update(SUPPLIER, supScope, row.id, { startsAt: at(1).toISOString() }))).toBe('409:FIELD_LOCKED');
        expect(await code(svc.update(SUPPLIER, supScope, row.id, { endsAt: at(-1).toISOString() }))).toBe('400:END_IN_PAST');
        const v: any = await svc.update(SUPPLIER, supScope, row.id, { endsAt: at(30).toISOString(), name: 'Extended' });
        expect(v).toMatchObject({ state: 'ACTIVE', discountPercent: 10, endsAt: at(30).toISOString(), name: 'Extended' });
        expect(row.startsAt).toEqual(at(-2));
        expect(row.history.at(-1)).toMatchObject({ action: 'UPDATE', by: 'sup-a', changes: { endsAt: [at(10).toISOString(), at(30).toISOString()], name: [null, 'Extended'] } });
    });

    it('a scheduled promotion can change everything; ended or cancelled ones are locked', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        const sched = seed(db, { startsAt: at(5), endsAt: at(10) });
        const v: any = await svc.update(SUPPLIER, supScope, sched.id, { discountPercent: 22.5, startsAt: at(6).toISOString(), endsAt: at(12).toISOString() });
        expect(v).toMatchObject({ discountPercent: 22.5, startsAt: at(6).toISOString(), endsAt: at(12).toISOString(), state: 'SCHEDULED' });
        const old = seed(db, { startsAt: at(-50), endsAt: at(-40) });
        expect(await code(svc.update(SUPPLIER, supScope, old.id, { name: 'x' }))).toBe('409:NOT_EDITABLE');
        expect(await code(svc.cancel(SUPPLIER, supScope, old.id))).toBe('409:ALREADY_ENDED');
    });

    it('cancel records who and when, and is not repeatable', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        const row = seed(db, {});
        const v: any = await svc.cancel(ADMIN, adminScope, row.id, 'Supplier asked by phone');
        expect(v).toMatchObject({ state: 'CANCELLED', cancelReason: 'Supplier asked by phone', cancelledAt: T0.toISOString() });
        expect(row).toMatchObject({ status: 'CANCELLED', cancelledById: 'adm-1' });
        expect(row.history.at(-1)).toMatchObject({ action: 'CANCEL', by: 'adm-1', role: 'ADMIN', stateBefore: 'ACTIVE' });
        expect(await code(svc.cancel(ADMIN, adminScope, row.id))).toBe('409:ALREADY_CANCELLED');
        // The supplier sees that Atlantis cancelled it, not which staff member.
        const sv: any = await svc.get(supScope, row.id);
        expect(sv.cancelledBy).toEqual({ kind: 'ATLANTIS' });
    });

    it('the list filters by derived state and counts every tab', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        seed(db, { startsAt: at(-1), endsAt: at(5) });                            // active
        seed(db, { startsAt: at(6), endsAt: at(9) });                             // scheduled
        seed(db, { startsAt: at(-9), endsAt: at(-5) });                           // expired
        seed(db, { startsAt: at(10), endsAt: at(12), status: 'CANCELLED' });      // cancelled
        seed(db, { productId: 'other', supplierId: 'sup-b' });                    // someone else's
        const all: any = await svc.list(supScope, {});
        expect(all.counts).toEqual({ ALL: 4, SCHEDULED: 1, ACTIVE: 1, EXPIRED: 1, CANCELLED: 1 });
        expect(all.data).toHaveLength(4);
        expect((await svc.list(supScope, { status: 'active' })).data.map((r: any) => r.state)).toEqual(['ACTIVE']);
        expect((await svc.list(supScope, { status: 'EXPIRED' })).data.map((r: any) => r.state)).toEqual(['EXPIRED']);
        expect((await svc.list(adminScope, {})).counts.ALL).toBe(5);
    });

    it('supplier responses carry no buyer price or markup; admin responses carry both', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        seed(db, { discountPercent: 10 });
        const buyerCase = Math.round(prime.basePrice * MARKUPS.piece * 100) / 100; // 15.20
        const sup = JSON.stringify([await svc.list(supScope, {}), await svc.eligibleProducts(supScope, { q: 'prime' })]);
        expect(sup).not.toMatch(/"buyer"|"perNet"|markup|"price"|basePrice/i);
        expect(sup).not.toContain(String(buyerCase));
        expect(sup).not.toContain('13.68'); // buyer promotional (15.20 × 0.9)
        const admin: any = await svc.list(adminScope, {});
        expect(admin.data[0].buyer).toEqual({ current: buyerCase, promotional: 13.68, percentOff: 10, perNet: MARKUPS.piece });
        expect(admin.data[0].net).toMatchObject({ current: 13.81, promotional: 12.43 });
    });

    it('a price change after creation: the % follows the current price; the price at creation is shown', async () => {
        const clock = { now: T0 }, db = makeDb(clock), svc = makePromotions(db, clock);
        const row = seed(db, { discountPercent: 10, basePriceAtCreation: 13.81 });
        db.state.products.get('prime').basePrice = 20;
        const v: any = await svc.get(supScope, row.id);
        expect(v.net).toEqual({ current: 20, promotional: 18, atCreation: 13.81, changedSinceCreation: true });
    });
});

// ─── Prices actually charged ────────────────────────────────────────────

function makeOrders(db: any) {
    const appConfig: any = { getMarkupPercentage: jest.fn(async () => MARKUPS) };
    const loads = new MixedLoadsService(db, appConfig);
    const noop: any = { sendOrderConfirmationEmail: jest.fn(async () => {}), create: jest.fn(async () => {}), notifyAdmins: jest.fn(async () => {}) };
    return new OrdersService(db, noop, noop, {} as any, {} as any, appConfig, loads);
}
const RO = { name: 'Buyer', street: 'Str. 1', city: 'Bucharest', postal: '010000', country: 'Romania' };
const pallet = [{ productId: 'prime', tier: 'pallet', quantity: 1 }];
// Without a promotion: 13.81395… × 1.05 = 14.50 / case → 1,914.00 per pallet (132 cases); supplier net 1,823.44.
const LIST = { price: 1914, supplierUnitPrice: 1823.44 };
// 10% special offer: round2(13.81395… × 1.05 × 0.9) = 13.05 / case → 1,722.60; supplier net round2(13.81395… × 0.9 × 132) = 1,641.10.
const PROMO10 = { price: 1722.6, supplierUnitPrice: 1641.1 };

describe('cart quote and order creation honour the running promotion', () => {
    // The quote reads the real clock; promotions are seeded relative to it.
    const now = () => new Date();
    const rel = (h: number) => new Date(Date.now() + h * H);

    it('active: the quote and the order line use the promotional price; supplier net is discounted the same %', async () => {
        const db = makeDb({ now: now() }), orders = makeOrders(db);
        const p = seed(db, { startsAt: rel(-1), endsAt: rel(5), discountPercent: 10 });
        const q: any = await orders.priceCart('buyer', pallet);
        expect(q.lines[0]).toMatchObject({ ...PROMO10, listUnitPrice: LIST.price, promotion: { id: p.id, discountPercent: 10 }, offerPercent: null, promotionEnded: null });
        const order: any = await orders.create('buyer', q.total, pallet, undefined, undefined, { shippingAddress: RO });
        expect(order.items[0]).toMatchObject({ ...PROMO10, promotionId: p.id, promotionPercent: 10 });
        expect(order.totalAmount).toBe(1722.6);
    });

    it('after the end, the very next quote is back to the normal price and says the offer ended', async () => {
        const db = makeDb({ now: now() }), orders = makeOrders(db);
        seed(db, { startsAt: rel(-48), endsAt: new Date(Date.now() - 1), discountPercent: 10 });
        const q: any = await orders.priceCart('buyer', pallet);
        expect(q.lines[0]).toMatchObject({ ...LIST, promotion: null, promotionEnded: { discountPercent: 10 } });
    });

    it('a buyer who quoted under the promotion and submits after it ended gets PRICE_CHANGED with the normal total', async () => {
        const db = makeDb({ now: now() }), orders = makeOrders(db);
        const p = seed(db, { startsAt: rel(-1), endsAt: rel(5), discountPercent: 10 });
        const q: any = await orders.priceCart('buyer', pallet);
        expect(q.total).toBe(1722.6);
        p.status = 'CANCELLED'; p.cancelledAt = new Date();
        expect(await code(orders.create('buyer', q.total, pallet, undefined, undefined, { shippingAddress: RO }))).toBe('PRICE_CHANGED');
        const order: any = await orders.create('buyer', 1914, pallet, undefined, undefined, { shippingAddress: RO });
        expect(order.items[0]).toMatchObject({ ...LIST, promotionId: null, promotionPercent: null });
    });

    it('cancelled before it started: never applied, no "ended" note', async () => {
        const db = makeDb({ now: now() }), orders = makeOrders(db);
        seed(db, { startsAt: rel(2), endsAt: rel(5), status: 'CANCELLED', cancelledAt: rel(-1) });
        const q: any = await orders.priceCart('buyer', pallet);
        expect(q.lines[0]).toMatchObject({ ...LIST, promotion: null, promotionEnded: null });
    });

    it('scheduled (not started yet): normal price', async () => {
        const db = makeDb({ now: now() }), orders = makeOrders(db);
        seed(db, { startsAt: rel(1), endsAt: rel(5) });
        expect((await orders.priceCart('buyer', pallet) as any).lines[0]).toMatchObject({ ...LIST, promotion: null });
    });

    it('no double discount: with a wholesale offer too, only the deeper one applies, once', async () => {
        const db = makeDb({ now: now() }), orders = makeOrders(db);
        seed(db, { startsAt: rel(-1), endsAt: rel(5), discountPercent: 10 });
        db.state.offers = [{ productId: 'prime', discountPercent: 5, variantDiscounts: null }];
        const a: any = await orders.priceCart('buyer', pallet);
        expect(a.lines[0]).toMatchObject({ ...PROMO10, offerPercent: null, promotion: expect.objectContaining({ discountPercent: 10 }) });
        db.state.offers = [{ productId: 'prime', discountPercent: 20, variantDiscounts: null }];
        const b: any = await orders.priceCart('buyer', pallet);
        // 20% only: round2(14.50465… × 0.8) = 11.60 × 132 = 1,531.20 (not 10% then 20%).
        expect(b.lines[0]).toMatchObject({ price: 1531.2, offerPercent: 20, promotion: null });
    });

    it('a price change after creation: the promotion applies to the current price', async () => {
        const db = makeDb({ now: now() }), orders = makeOrders(db);
        seed(db, { startsAt: rel(-1), endsAt: rel(5), discountPercent: 10, basePriceAtCreation: prime.basePrice });
        db.state.products.get('prime').basePrice = 20;
        const q: any = await orders.priceCart('buyer', pallet);
        // round2(20 × 1.05 × 0.9) = 18.90 / case × 132
        expect(q.lines[0].price).toBe(2494.8);
        expect(q.lines[0].supplierUnitPrice).toBe(2376); // 20 × 0.9 × 132
    });

    it('a product that is not approved never gets the promotional price (it cannot be ordered at all)', async () => {
        const db = makeDb({ now: now() });
        seed(db, { productId: 'pending', startsAt: rel(-1), endsAt: rel(5) });
        const products = [{ ...db.state.products.get('pending') }, { ...db.state.products.get('prime') }];
        await attachPromotions(db, products);
        expect(products[0].promotion).toBeUndefined();
        expect(products[1].promotion).toBeUndefined();
    });

    it('mixed loads take the promotion off the case price once, before the mix markup', async () => {
        const db = makeDb({ now: now() });
        const variants = [{ name: 'Flavour', values: ['Ice Pop', 'Lemon'] }];
        Object.assign(db.state.products.get('prime'), { variants, variantPrices: { 'Flavour=Ice Pop': 14, 'Flavour=Lemon': 12 } });
        const loads = new MixedLoadsService(db, { getMarkupPercentage: jest.fn(async () => MARKUPS) } as any);
        const lines = [{ productId: 'prime', variant: 'Flavour=Ice Pop', quantity: 66 }, { productId: 'prime', variant: 'Flavour=Lemon', quantity: 66 }];
        const before = await loads.price('PALLET', lines);
        seed(db, { startsAt: rel(-1), endsAt: rel(5), discountPercent: 10 });
        const after = await loads.price('PALLET', lines);
        expect(before.lines.map((l) => l.casePrice)).toEqual([16.1, 13.8]);                 // 14 × 1.15, 12 × 1.15
        expect(after.lines.map((l) => l.casePrice)).toEqual([14.49, 12.42]);                 // 12.60 × 1.15, 10.80 × 1.15
        expect(after.total).toBe(Math.round((12.6 * 66 + 10.8 * 66) * 1.15 * 100) / 100);
        expect(after.lines.every((l) => l.discountPercent === 10)).toBe(true);
    });
});

describe('what buyers and anonymous visitors see', () => {
    it('buyers get the running promotion without the campaign name; anonymous get nothing', async () => {
        const db = makeDb({ now: new Date() });
        seed(db, { startsAt: new Date(Date.now() - H), endsAt: new Date(Date.now() + H), name: 'Internal name', discountPercent: 12 });
        const [p] = await attachPromotions(db, [{ ...db.state.products.get('prime') }]);
        expect(p.promotion).toEqual({ id: expect.any(String), discountPercent: 12, startsAt: expect.any(String), endsAt: expect.any(String) });
        expect(JSON.stringify(p.promotion)).not.toContain('Internal name');
        expect(stripPrices(p)).not.toHaveProperty('promotion');
        // The owning supplier's view keeps the % (no buyer price is in it); the price itself is their net.
        const own = applyPricePrivacy(JSON.parse(JSON.stringify(p)), { id: 'sup-a', role: 'SUPPLIER' }, MARKUPS as any);
        expect(own.price).toBe(prime.basePrice);
        expect(own.promotion.discountPercent).toBe(12);
    });

    it('activePromotions ignores rows outside their window even if a query returned them', async () => {
        const rows = [{ id: 'x', productId: 'prime', discountPercent: 10, startsAt: at(1), endsAt: at(2) }];
        const fake = { promotion: { findMany: jest.fn(async () => rows) } };
        expect((await activePromotions(fake, ['prime'], T0)).size).toBe(0);
        expect((await activePromotions(fake, ['prime'], at(1))).get('prime')?.discountPercent).toBe(10);
        expect((await activePromotions(fake, ['prime'], at(2))).size).toBe(0);
        expect((await activePromotions({}, ['prime'], T0)).size).toBe(0); // no table → no promotions
    });
});
