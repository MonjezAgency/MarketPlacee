jest.mock('otplib', () => ({ verify: jest.fn(), generateSecret: jest.fn(), generateURI: jest.fn() }));
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/roles.guard';
import { TargetPricesController } from '../market.controller';
import { TargetPricesService, allowedActions, targetStage } from '../target-prices.service';

/**
 * The target-price negotiation: desk outcomes (accept target / counter / decline),
 * buyer answers to a counter (accept / decline / revise), withdraw, ownership,
 * stale-state guards, notification wording and dedupe keys, and the role matrix.
 */

const product = { id: 'p1', status: 'APPROVED', supplierId: 'sup-1', name: 'Takis Fuego 55g', ean: '7501', images: [], unitsPerCase: 48, casesPerPallet: 96, palletsPerShipment: 33, moq: 1, moqUnit: 'CASE', basePrice: 30 };

function matches(row: any, where: any): boolean {
    for (const [k, v] of Object.entries(where || {})) {
        if (k === 'OR') continue;
        const val = row[k];
        if (v && typeof v === 'object' && !(v instanceof Date)) {
            if ('in' in (v as any)) { if (!(v as any).in.includes(val)) return false; continue; }
            if ('not' in (v as any)) { if (val === (v as any).not) return false; continue; }
        }
        if (v instanceof Date) { if (!(val instanceof Date) || val.getTime() !== v.getTime()) return false; continue; }
        if (val !== v) return false;
    }
    return true;
}

function setup() {
    const rows = new Map<string, any>();
    let tick = 1;
    const stamp = () => new Date(1_700_000_000_000 + tick++ * 1000);
    const prisma: any = {
        product: { findUnique: jest.fn(async () => product) },
        appConfig: { findMany: jest.fn(async () => []) },
        user: { findMany: jest.fn(async ({ where }: any) => (where.id.in as string[]).map((id) => ({ id, name: id === 'admin-1' ? 'Dana Desk' : id, email: `${id}@x`, role: 'ADMIN' }))) },
        targetPriceRequest: {
            findUnique: jest.fn(async ({ where }: any) => {
                const r = where.id ? rows.get(where.id) : [...rows.values()].find((x) => x.idempotencyKey === where.idempotencyKey);
                return r ? { ...r, product, buyer: { id: r.buyerId, email: `${r.buyerId}@x`, name: 'B', companyName: 'Buyer Co', notificationPrefs: {} } } : null;
            }),
            findFirst: jest.fn(async ({ where }: any) => [...rows.values()].find((r) => matches(r, where)) || null),
            findMany: jest.fn(async ({ where }: any) => [...rows.values()].filter((r) => matches(r, where)).map((r) => ({ ...r, product: { ...product, supplier: { id: 'sup-1', name: 'Sup', companyName: 'Supplier SRL' } }, buyer: { id: r.buyerId, name: 'B', email: 'b@x', companyName: 'Buyer Co' } }))),
            count: jest.fn(async ({ where }: any) => [...rows.values()].filter((r) => matches(r, where)).length),
            groupBy: jest.fn(async ({ where }: any) => {
                const c: Record<string, number> = {};
                for (const r of rows.values()) if (matches(r, where)) c[r.status] = (c[r.status] || 0) + 1;
                return Object.entries(c).map(([status, n]) => ({ status, _count: { _all: n } }));
            }),
            create: jest.fn(async ({ data }: any) => { const row = { id: `tp${rows.size + 1}`, createdAt: stamp(), updatedAt: stamp(), status: 'OPEN', counterCasePrice: null, response: null, ...data }; rows.set(row.id, row); return { ...row, product }; }),
            updateMany: jest.fn(async ({ where, data }: any) => {
                const r = rows.get(where.id);
                if (!r || !matches(r, where)) return { count: 0 };
                Object.assign(r, data, { updatedAt: stamp() });
                return { count: 1 };
            }),
        },
    };
    const notifications = { notifyAdmins: jest.fn(async () => undefined), notifyUser: jest.fn(async () => undefined) };
    const email = { sendMailDetailed: jest.fn(async () => ({ success: true })) };
    const svc = new TargetPricesService(prisma, notifications as any, email as any);
    return { svc, rows, notifications, email, prisma };
}

const buyer = { id: 'buyer-1', role: 'CUSTOMER' };
const newRequest = async (svc: TargetPricesService) => svc.create(buyer, { productId: 'p1', price: 25, quantity: 10, quantityUnit: 'CASE' }) as any;

describe('stage and allowed actions', () => {
    it('maps stored statuses to clear stages without renaming them', () => {
        expect(targetStage({ status: 'OPEN' })).toBe('AWAITING_DESK');
        expect(targetStage({ status: 'OPEN', buyerDecision: 'REVISED' })).toBe('REVISED');
        expect(targetStage({ status: 'RESPONDED', counterCasePrice: 28 })).toBe('COUNTER_OFFERED');
        expect(targetStage({ status: 'RESPONDED', counterCasePrice: null })).toBe('DESK_REPLIED');
        expect(targetStage({ status: 'ACCEPTED', agreedCasePrice: 25 })).toBe('AGREED_DESK');
        expect(targetStage({ status: 'ACCEPTED', agreedCasePrice: 28, buyerDecision: 'ACCEPTED' })).toBe('AGREED_BUYER');
        expect(targetStage({ status: 'ACCEPTED' })).toBe('ACCEPTED_LEGACY');
        expect(targetStage({ status: 'DECLINED' })).toBe('DECLINED_DESK');
        expect(targetStage({ status: 'DECLINED', buyerDecision: 'DECLINED' })).toBe('DECLINED_BUYER');
        expect(targetStage({ status: 'WITHDRAWN' })).toBe('WITHDRAWN');
    });
    it('only a counter can be accepted or declined; closed requests allow nothing', () => {
        expect(allowedActions('COUNTER_OFFERED')).toEqual({ deskMayAnswer: true, buyerMayAcceptCounter: true, buyerMayDeclineCounter: true, buyerMayRevise: true, buyerMayWithdraw: true });
        expect(allowedActions('AWAITING_DESK').buyerMayAcceptCounter).toBe(false);
        for (const s of ['AGREED_DESK', 'AGREED_BUYER', 'ACCEPTED_LEGACY', 'DECLINED_DESK', 'DECLINED_BUYER', 'WITHDRAWN']) expect(Object.values(allowedActions(s)).every((v) => v === false)).toBe(true);
    });
});

describe('create', () => {
    it('stores the listed buyer price at request time and a priced history entry', async () => {
        const { svc, rows } = setup();
        const out = await newRequest(svc);
        expect(out.stage).toBe('AWAITING_DESK');
        const row = rows.get(out.id);
        expect(row.listedCasePriceAtRequest).toBe(33); // 30 × default 1.1 markup
        expect(row.history[0]).toMatchObject({ action: 'SUBMITTED', price: 25, cases: 10 });
        expect(out.history[0].by).toBe('BUYER');
    });
});

describe('desk outcomes', () => {
    it('ACCEPTED = the target as asked: agreed at the target, no counter allowed', async () => {
        const { svc, rows, notifications } = setup();
        const r = await newRequest(svc);
        await expect(svc.respond('admin-1', r.id, { status: 'ACCEPTED', counterCasePrice: 27 })).rejects.toThrow('counter-offer');
        const res = await svc.respond('admin-1', r.id, { status: 'ACCEPTED' }); // message optional
        expect(res).toEqual({ ok: true, status: 'ACCEPTED', stage: 'AGREED_DESK' });
        expect(rows.get(r.id)).toMatchObject({ status: 'ACCEPTED', agreedCasePrice: 25, agreedQuantityCases: 10, counterCasePrice: null });
        const call: any[] = (notifications.notifyUser.mock.calls as any[]).find((c) => c[0] === 'buyer-1')!;
        expect(call[1]).toBe(`Target price ${r.ref} accepted`);
        expect(call[4]).toMatchObject({ kind: 'TARGET_ACCEPTED', link: `/dashboard/customer/targets?ref=${r.ref}`, dedupeKey: `target:${r.id}:ACCEPTED:1` });
        expect(call[2]).toContain('Nothing is ordered yet');
    });
    it('a counter must be above the target; it never says "accepted"', async () => {
        const { svc, rows, notifications, email } = setup();
        const r = await newRequest(svc);
        await expect(svc.respond('admin-1', r.id, { status: 'RESPONDED', counterCasePrice: 25 })).rejects.toThrow('accept the target instead');
        await expect(svc.respond('admin-1', r.id, { status: 'RESPONDED' })).rejects.toThrow('Enter a counter price');
        await svc.respond('admin-1', r.id, { status: 'RESPONDED', counterCasePrice: '28.004', response: 'Best we can do this month' });
        expect(rows.get(r.id)).toMatchObject({ status: 'RESPONDED', counterCasePrice: 28 });
        expect(rows.get(r.id).agreedCasePrice).toBeUndefined();
        const call: any[] = (notifications.notifyUser.mock.calls as any[]).find((c) => c[0] === 'buyer-1')!;
        expect(call[1]).toBe(`Counter-offer on your target price ${r.ref}`);
        expect(call[1]).not.toMatch(/accepted/i);
        expect(call[4]).toMatchObject({ kind: 'TARGET_COUNTERED', params: expect.objectContaining({ price: 28 }) });
        expect((email.sendMailDetailed.mock.calls as any[])[0][1]).toBe(`Counter-offer on your target price ${r.ref}`);
    });
    it('a counter quantity is checked against the minimum order and needs a price', async () => {
        const { svc } = setup();
        const r = await newRequest(svc);
        await expect(svc.respond('admin-1', r.id, { status: 'RESPONDED', counterQuantityCases: 20, response: 'more volume' })).rejects.toThrow('needs a counter price');
        await expect(svc.respond('admin-1', r.id, { status: 'DECLINED', counterCasePrice: 30 })).rejects.toThrow('A decline has no price');
    });
    it('closed requests cannot be answered', async () => {
        const { svc } = setup();
        const r = await newRequest(svc);
        await svc.respond('admin-1', r.id, { status: 'DECLINED' });
        await expect(svc.respond('admin-1', r.id, { status: 'ACCEPTED' })).rejects.toThrow('already closed');
    });
    it('respects the email preference but always records the in-app notification', async () => {
        const { svc, prisma, notifications, email } = setup();
        const r = await newRequest(svc);
        const orig = prisma.targetPriceRequest.findUnique;
        prisma.targetPriceRequest.findUnique = jest.fn(async (a: any) => { const x = await orig(a); return x && { ...x, buyer: { ...x.buyer, notificationPrefs: { orderUpdates: false } } }; });
        await svc.respond('admin-1', r.id, { status: 'DECLINED', response: 'Not possible' });
        expect(email.sendMailDetailed).not.toHaveBeenCalled();
        expect((notifications.notifyUser.mock.calls as any[]).some((c) => c[0] === 'buyer-1' && c[4].kind === 'TARGET_DECLINED')).toBe(true);
    });
});

describe('buyer answers to a counter', () => {
    const countered = async () => {
        const s = setup();
        const r = await newRequest(s.svc);
        await s.svc.respond('admin-1', r.id, { status: 'RESPONDED', counterCasePrice: 28, counterQuantityCases: 20, response: 'For 20 cases' });
        return { ...s, r };
    };
    it('accept → ACCEPTED, agreed at the counter for the counter quantity; staff notified once', async () => {
        const { svc, rows, r, notifications } = await countered();
        const out: any = await svc.decide('buyer-1', r.id, { decision: 'ACCEPT', counterCasePrice: 28 });
        expect(out.stage).toBe('AGREED_BUYER');
        expect(rows.get(r.id)).toMatchObject({ status: 'ACCEPTED', buyerDecision: 'ACCEPTED', agreedCasePrice: 28, agreedQuantityCases: 20 });
        const call: any[] = (notifications.notifyAdmins.mock.calls as any[]).find((c) => c[3].kind === 'TARGET_COUNTER_ACCEPTED')!;
        expect(call[3].dedupeKey).toBe(`target:${r.id}:buyer:ACCEPT:3`);
        await expect(svc.decide('buyer-1', r.id, { decision: 'ACCEPT', counterCasePrice: 28 })).rejects.toThrow('no counter-offer');
    });
    it('never accepts a counter the buyer did not see', async () => {
        const { svc, rows, r } = await countered();
        await expect(svc.decide('buyer-1', r.id, { decision: 'ACCEPT', counterCasePrice: 27 })).rejects.toThrow('changed');
        await expect(svc.decide('buyer-1', r.id, { decision: 'ACCEPT' })).rejects.toThrow('changed');
        expect(rows.get(r.id).status).toBe('RESPONDED');
    });
    it('a stale write (desk changed it meanwhile) is refused, not merged', async () => {
        const { svc, prisma, r } = await countered();
        const real = prisma.targetPriceRequest.updateMany;
        prisma.targetPriceRequest.updateMany = jest.fn(async () => ({ count: 0 }));
        await expect(svc.decide('buyer-1', r.id, { decision: 'ACCEPT', counterCasePrice: 28 })).rejects.toThrow('changed while you were looking');
        prisma.targetPriceRequest.updateMany = real;
    });
    it('decline → DECLINED by the buyer', async () => {
        const { svc, rows, r } = await countered();
        const out: any = await svc.decide('buyer-1', r.id, { decision: 'DECLINE', message: 'Too high' });
        expect(out.stage).toBe('DECLINED_BUYER');
        expect(rows.get(r.id)).toMatchObject({ status: 'DECLINED', buyerDecision: 'DECLINED' });
        expect(out.actions.buyerMayWithdraw).toBe(false);
    });
    it('revise → back to the desk with the new target; the original is kept', async () => {
        const { svc, rows, r } = await countered();
        await expect(svc.decide('buyer-1', r.id, { decision: 'REVISE', targetCasePrice: 28 })).rejects.toThrow('at or above the counter-offer');
        const out: any = await svc.decide('buyer-1', r.id, { decision: 'REVISE', targetCasePrice: 26.5 });
        expect(out.stage).toBe('REVISED');
        expect(rows.get(r.id)).toMatchObject({ status: 'OPEN', targetCasePrice: 26.5, originalTargetCasePrice: 25, counterCasePrice: null, reachedNotifiedAt: null });
        expect(out.history.map((h: any) => h.action)).toEqual(['SUBMITTED', 'DESK_COUNTER', 'BUYER_REVISE']);
        // The desk can answer again, and the buyer's earlier decision no longer counts.
        await svc.respond('admin-1', r.id, { status: 'ACCEPTED' });
        expect(rows.get(r.id)).toMatchObject({ status: 'ACCEPTED', agreedCasePrice: 26.5, buyerDecision: null });
    });
    it('cannot revise before the desk has replied', async () => {
        const { svc } = setup();
        const r = await newRequest(svc);
        await expect(svc.decide('buyer-1', r.id, { decision: 'REVISE', targetCasePrice: 20 })).rejects.toThrow('once the sourcing desk has replied');
    });
});

describe('ownership', () => {
    it('another buyer can neither answer, withdraw nor see the request (404, not 403)', async () => {
        const { svc, r } = await (async () => { const s = setup(); const r = await newRequest(s.svc); await s.svc.respond('admin-1', r.id, { status: 'RESPONDED', counterCasePrice: 28 }); return { ...s, r }; })();
        await expect(svc.decide('buyer-2', r.id, { decision: 'ACCEPT', counterCasePrice: 28 })).rejects.toThrow('Request not found');
        await expect(svc.withdraw('buyer-2', r.id)).rejects.toThrow('Request not found');
        expect(await svc.mine('buyer-2')).toEqual([]);
    });
    it('the buyer view never carries the supplier, staff ids or internal keys', async () => {
        const { svc } = setup();
        const r = await newRequest(svc);
        await svc.respond('admin-1', r.id, { status: 'RESPONDED', counterCasePrice: 28 });
        const [view] = await svc.mine('buyer-1');
        const text = JSON.stringify(view);
        expect(text).not.toContain('sup-1');
        expect(text).not.toContain('admin-1');
        expect(text).not.toContain('idempotencyKey');
        expect(view).not.toHaveProperty('supplier');
        expect(view.listedCasePrice).toBe(33);
    });
});

describe('withdraw', () => {
    it('allowed while open or answered, kept as a record, staff told once', async () => {
        const { svc, rows, notifications } = setup();
        const r = await newRequest(svc);
        await svc.respond('admin-1', r.id, { status: 'RESPONDED', counterCasePrice: 28 });
        const out: any = await svc.withdraw('buyer-1', r.id);
        expect(out.stage).toBe('WITHDRAWN');
        expect(rows.get(r.id).history.map((h: any) => h.action)).toEqual(['SUBMITTED', 'DESK_COUNTER', 'WITHDRAWN']);
        await expect(svc.withdraw('buyer-1', r.id)).rejects.toThrow('already closed');
        expect((notifications.notifyAdmins.mock.calls as any[]).filter((c) => c[3].kind === 'TARGET_WITHDRAWN')).toHaveLength(1);
    });
    it('not after an agreement', async () => {
        const { svc } = setup();
        const r = await newRequest(svc);
        await svc.respond('admin-1', r.id, { status: 'ACCEPTED' });
        await expect(svc.withdraw('buyer-1', r.id)).rejects.toThrow('already closed');
    });
});

describe('staff list and detail', () => {
    it('real counts per status, the supplier for staff, and named staff in the history', async () => {
        const { svc } = setup();
        const a = await newRequest(svc);
        await svc.respond('admin-1', a.id, { status: 'RESPONDED', counterCasePrice: 28 });
        const out: any = await svc.list({ status: '' });
        expect(out.counts).toMatchObject({ OPEN: 0, RESPONDED: 1, ACCEPTED: 0, ALL: 1, COUNTER_OFFERED: 1 });
        expect(out.data[0]).toMatchObject({ stage: 'COUNTER_OFFERED', supplier: { companyName: 'Supplier SRL' }, listedCasePrice: 33 });
        expect(JSON.stringify(out.data[0])).not.toContain('basePrice');
        const d: any = await svc.detail(a.id);
        expect(d.history.map((h: any) => h.actor)).toEqual([{ kind: 'BUYER' }, { kind: 'STAFF', name: 'Dana Desk', role: 'ADMIN' }]);
    });
});

describe('role matrix', () => {
    const guard = new RolesGuard(new Reflector());
    const allowed = (method: string, role: string) => {
        const handler = (TargetPricesController.prototype as any)[method];
        const ctx: any = { getHandler: () => handler, getClass: () => TargetPricesController, switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u', role } }) }) };
        return guard.canActivate(ctx);
    };
    const ROLES = ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS', 'SUPPLIER', 'CUSTOMER'];
    const cases: [string, string[]][] = [
        ['create', ['OWNER', 'SUPPLIER', 'CUSTOMER']],
        ['mine', ['OWNER', 'SUPPLIER', 'CUSTOMER']],
        ['withdraw', ['OWNER', 'SUPPLIER', 'CUSTOMER']],
        ['decide', ['OWNER', 'SUPPLIER', 'CUSTOMER']],
        ['list', ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT']],
        ['detail', ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT']],
        ['respond', ['OWNER', 'ADMIN']],
    ];
    it.each(cases)('%s', (method, ok) => {
        for (const role of ROLES) expect([method, role, allowed(method, role)]).toEqual([method, role, ok.includes(role)]);
    });
});
