import { NotFoundException } from '@nestjs/common';
import { AdminUsersService } from '../admin-users.service';
import { SENSITIVE_USER_FIELDS, USER_LIST_SELECT, USER_SAFE_SELECT } from '../admin-users-query';

/** The service reads only whitelisted columns and returns nothing sensitive, even if the database returned more. */
const leaky = (o: Record<string, unknown>) => ({
    password: '$2b$hash', twoFactorSecret: 'totp', stripeAccountId: 'acct_9', resetPasswordToken: 'rt', emailOtpCode: '999999', iban: 'enc-iban',
    createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-02'), kycStatus: 'UNVERIFIED', status: 'ACTIVE', ...o,
});

function fakePrisma(users: any[]) {
    const calls: Record<string, any[]> = {};
    const rec = (k: string, v: any) => { (calls[k] ||= []).push(v); };
    const prisma: any = {
        user: {
            findMany: jest.fn(async (a) => { rec('user.findMany', a); return users; }),
            findUnique: jest.fn(async (a) => { rec('user.findUnique', a); return users.find((u) => u.id === a.where.id) ?? null; }),
            count: jest.fn(async () => users.length),
            groupBy: jest.fn(async (a) => { rec('user.groupBy', a); return a.by[0] === 'role' ? [{ role: 'SUPPLIER', _count: { _all: 1 } }, { role: 'ADMIN', _count: { _all: 2 } }] : []; }),
        },
        product: {
            groupBy: jest.fn(async (a) => (a.by[0] === 'supplierId' ? [{ supplierId: 's1', _count: { _all: 3 } }] : [{ status: 'APPROVED', _count: { _all: 3 } }, { status: 'PENDING', _count: { _all: 1 } }])),
            findMany: jest.fn(async () => []),
        },
        productReviewEvent: { findMany: jest.fn(async () => []) },
        order: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
        targetPriceRequest: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
        kYCDocument: { findMany: jest.fn(async () => []) },
    };
    return { prisma, calls };
}

describe('AdminUsersService', () => {
    it('lists with the safe select and adds live product counts for suppliers', async () => {
        const { prisma, calls } = fakePrisma([leaky({ id: 's1', name: 'Sup', email: 's@x.test', role: 'SUPPLIER', _count: { customerOrders: 0, products: 4, targetPriceRequests: 0 } })]);
        const out = await new AdminUsersService(prisma).list({ role: 'SUPPLIER', limit: '10' });
        expect(calls['user.findMany'][0].select).toBe(USER_LIST_SELECT);
        expect(calls['user.findMany'][0].take).toBe(10);
        expect(out.data[0].activity).toEqual({ orders: null, targetPrices: null, products: 4, liveProducts: 3 });
        expect(out.counts.staff).toBe(2);
        const json = JSON.stringify(out);
        for (const f of SENSITIVE_USER_FIELDS) expect(json).not.toContain(`"${f}"`);
        expect(json).not.toMatch(/\$2b\$hash|totp|acct_9|999999|enc-iban/);
    });
    it('returns a supplier detail with product counts and no sensitive fields', async () => {
        const { prisma, calls } = fakePrisma([leaky({ id: 's1', name: 'Sup', email: 's@x.test', role: 'SUPPLIER' })]);
        const out = await new AdminUsersService(prisma).detail('s1');
        expect(calls['user.findUnique'][0].select).toBe(USER_SAFE_SELECT);
        expect(out.supplier.products).toMatchObject({ total: 4, byStatus: { APPROVED: 3, PENDING: 1 } });
        expect(out.buyer).toBeNull();
        expect(JSON.stringify(out)).not.toMatch(/\$2b\$hash|totp|acct_9|999999|enc-iban|"password"/);
    });
    it('staff accounts get the profile only', async () => {
        const { prisma } = fakePrisma([leaky({ id: 'a1', name: 'Admin', email: 'a@x.test', role: 'ADMIN' })]);
        const out = await new AdminUsersService(prisma).detail('a1');
        expect(out.supplier).toBeNull();
        expect(out.buyer).toBeNull();
        expect(prisma.order.findMany).not.toHaveBeenCalled();
    });
    it('anonymised and unknown accounts are not found', async () => {
        const { prisma } = fakePrisma([leaky({ id: 'd1', name: 'Deleted User (Archived)', email: 'deleted_d1_1@removed.invalid', role: 'CUSTOMER' })]);
        await expect(new AdminUsersService(prisma).detail('d1')).rejects.toBeInstanceOf(NotFoundException);
        await expect(new AdminUsersService(prisma).detail('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
});
