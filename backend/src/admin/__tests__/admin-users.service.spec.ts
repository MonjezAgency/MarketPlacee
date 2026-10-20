import { BadRequestException, NotFoundException } from '@nestjs/common';
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
            findMany: jest.fn(async (a) => { rec('product.findMany', a); return [leaky({ id: 'p1', name: 'Cola', ean: '5449000000996', brand: 'X', status: 'APPROVED', images: ['/a.jpg'], stock: 9, unit: 'carton', basePrice: 10.5, price: 12.6 })]; }),
            count: jest.fn(async () => 30),
        },
        offer: {
            groupBy: jest.fn(async () => [{ status: 'APPROVED', _count: { _all: 2 } }]),
            findMany: jest.fn(async () => [{ id: 'o1', status: 'PENDING', unit: 'pallet', quantity: 3, pricePerUnit: 400, validUntil: null, createdAt: new Date(), productNameSnap: null, product: { id: 'p1', name: 'Cola' } }]),
            count: jest.fn(async () => 1),
        },
        review: { aggregate: jest.fn(async () => ({ _count: { _all: 0 }, _avg: { rating: null } })), count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
        productReviewEvent: { findMany: jest.fn(async () => []) },
        order: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
        targetPriceRequest: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
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
        const out = await new AdminUsersService(prisma).detail('s1', 'ADMIN');
        expect(calls['user.findUnique'][0].select).toBe(USER_SAFE_SELECT);
        expect(out.supplier.offers).toMatchObject({ total: 2 });
        expect(out.supplier.money).toMatchObject({ countedOrders: 0, grossValue: 0, supplierNet: null, netVisible: true });
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
    it('pages supplier products 14 at a time with the net price only for OWNER/ADMIN', async () => {
        const { prisma, calls } = fakePrisma([leaky({ id: 's1', name: 'Sup', email: 's@x.test', role: 'SUPPLIER' })]);
        const svc = new AdminUsersService(prisma);
        const out = await svc.products('s1', { page: '2' }, 'OWNER');
        expect(calls['product.findMany'][0]).toMatchObject({ skip: 14, take: 14, where: { supplierId: 's1' } });
        expect(out).toMatchObject({ total: 30, page: 2, limit: 14, pages: 3, netVisible: true });
        expect(out.data[0]).toMatchObject({ id: 'p1', ean: '5449000000996', netPrice: 10.5, image: '/a.jpg' });
        expect(JSON.stringify(out)).not.toMatch(/12\.6|\$2b\$hash|"password"/);
        const hidden = await svc.products('s1', {}, 'SUPPORT');
        expect(hidden.data[0].netPrice).toBeNull();
        const offers = await svc.offers('s1', {}, 'MODERATOR');
        expect(offers.data[0].pricePerUnit).toBeNull();
    });
    it('rejects tabs that do not fit the role', async () => {
        const { prisma } = fakePrisma([leaky({ id: 'b1', name: 'Buy', email: 'b@x.test', role: 'CUSTOMER' }), leaky({ id: 'a1', name: 'Adm', email: 'a@x.test', role: 'ADMIN' })]);
        const svc = new AdminUsersService(prisma);
        await expect(svc.products('b1', {})).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.offers('b1', {})).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.orders('a1', {})).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.reviews('a1', {})).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.products('nope', {})).rejects.toBeInstanceOf(NotFoundException);
    });
    it('anonymised and unknown accounts are not found', async () => {
        const { prisma } = fakePrisma([leaky({ id: 'd1', name: 'Deleted User (Archived)', email: 'deleted_d1_1@removed.invalid', role: 'CUSTOMER' })]);
        await expect(new AdminUsersService(prisma).detail('d1')).rejects.toBeInstanceOf(NotFoundException);
        await expect(new AdminUsersService(prisma).detail('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
});
