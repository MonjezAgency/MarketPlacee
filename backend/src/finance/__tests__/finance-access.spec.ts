import { BadRequestException, ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { FinanceController } from '../finance.controller';
import { FinanceService } from '../finance.service';
import { RolesGuard } from '../../auth/roles.guard';
import { actorOf, parseCreditTermBody, parseReviewBody, parseTaxExemptionBody, parseWarehouseBody } from '../finance-access';

const ADMIN_ONLY = [Role.ADMIN];
/** Every route and the roles it must declare (OWNER passes RolesGuard everywhere). */
const EXPECTED: Record<string, Role[]> = {
    exportStatement: ADMIN_ONLY,
    getReport: ADMIN_ONLY,
    sendReport: ADMIN_ONLY,
    getAllCreditTerms: ADMIN_ONLY,
    getMyCreditTerm: [Role.CUSTOMER],
    getCreditTerm: ADMIN_ONLY,
    setCreditTerm: ADMIN_ONLY,
    deleteCreditTerm: ADMIN_ONLY,
    checkCredit: ADMIN_ONLY,
    getAllTaxExemptions: ADMIN_ONLY,
    getMyTaxExemptions: [Role.CUSTOMER],
    createTaxExemption: [Role.ADMIN, Role.CUSTOMER],
    reviewTaxExemption: ADMIN_ONLY,
    getAllWarehouses: [Role.ADMIN, Role.LOGISTICS, Role.SUPPLIER],
    createWarehouse: [Role.ADMIN, Role.SUPPLIER],
    updateWarehouse: [Role.ADMIN, Role.SUPPLIER],
    deleteWarehouse: [Role.ADMIN, Role.SUPPLIER],
    getAuditByOrder: ADMIN_ONLY,
    getAuditByUser: ADMIN_ONLY,
    getRecentAudit: ADMIN_ONLY,
    getRevenueReport: ADMIN_ONLY,
    getSupplierEarnings: ADMIN_ONLY,
    createManualInvoice: ADMIN_ONLY,
};

const proto = FinanceController.prototype as any;
const routeNames = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');

function ctxFor(method: string, role: string): ExecutionContext {
    return {
        getHandler: () => proto[method],
        getClass: () => FinanceController,
        switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u-1', role } }) }),
    } as unknown as ExecutionContext;
}

describe('Finance routes — role metadata', () => {
    it('every route declares roles (no route open to any signed-in account)', () => {
        for (const name of routeNames) {
            expect({ name, roles: Reflect.getMetadata('roles', proto[name]) }).toEqual({ name, roles: expect.any(Array) });
        }
        expect(routeNames.sort()).toEqual(Object.keys(EXPECTED).sort());
    });

    it.each(Object.entries(EXPECTED))('%s declares exactly its roles', (name, roles) => {
        expect(Reflect.getMetadata('roles', proto[name])).toEqual(roles);
    });

    it('RolesGuard: buyers and suppliers are refused on staff routes; OWNER and ADMIN pass', () => {
        const guard = new RolesGuard(new Reflector());
        for (const [name, roles] of Object.entries(EXPECTED)) {
            expect(guard.canActivate(ctxFor(name, 'OWNER'))).toBe(true);
            for (const r of ['ADMIN', 'CUSTOMER', 'SUPPLIER', 'SUPPORT', 'LOGISTICS']) {
                expect({ name, r, ok: guard.canActivate(ctxFor(name, r)) }).toEqual({ name, r, ok: (roles as string[]).includes(r) });
            }
        }
    });
});

describe('Finance — body whitelists and ownership', () => {
    const buyer = { id: 'buyer-1', role: 'CUSTOMER', staff: false };
    const supplier = { id: 'sup-1', role: 'SUPPLIER', staff: false };
    const admin = { id: 'adm-1', role: 'ADMIN', staff: true };

    it('actorOf takes the id from the token and marks only OWNER/ADMIN as staff', () => {
        expect(actorOf({ user: { sub: 'x', role: 'owner' } })).toEqual({ id: 'x', role: 'OWNER', staff: true });
        expect(actorOf({ user: { sub: 'x', role: 'LOGISTICS' } }).staff).toBe(false);
        expect(() => actorOf({})).toThrow(UnauthorizedException);
    });

    it('a buyer’s tax exemption is always for themselves and always PENDING', () => {
        const out = parseTaxExemptionBody({ userId: 'someone-else', certificateUrl: 'https://x/c.pdf', status: 'APPROVED', reviewedBy: 'me' }, buyer);
        expect(out.userId).toBe('buyer-1');
        expect(out).not.toHaveProperty('status');
        expect(out).not.toHaveProperty('reviewedBy');
        expect(() => parseTaxExemptionBody({}, buyer)).toThrow(BadRequestException);
        expect(() => parseTaxExemptionBody({ certificateUrl: 'https://x', validUntil: 'nope' }, buyer)).toThrow(BadRequestException);
    });

    it('staff name the account for an exemption', () => {
        expect(parseTaxExemptionBody({ userId: 'b-9', certificateUrl: 'https://x' }, admin).userId).toBe('b-9');
        expect(() => parseTaxExemptionBody({ certificateUrl: 'https://x' }, admin)).toThrow(BadRequestException);
    });

    it('review accepts only APPROVED / REJECTED', () => {
        expect(parseReviewBody({ status: 'approved' }).status).toBe('APPROVED');
        expect(() => parseReviewBody({ status: 'PENDING' })).toThrow(BadRequestException);
    });

    it('credit term body drops usedCredit/status and validates numbers', () => {
        const out = parseCreditTermBody({ userId: 'b', creditLimit: 100, paymentTermDays: 30, usedCredit: -999, status: 'ACTIVE' });
        expect(out).toEqual({ userId: 'b', creditLimit: 100, paymentTermDays: 30, notes: undefined });
        expect(() => parseCreditTermBody({ userId: 'b', creditLimit: -1, paymentTermDays: 30 })).toThrow(BadRequestException);
        expect(() => parseCreditTermBody({ userId: 'b', creditLimit: 1, paymentTermDays: 0 })).toThrow(BadRequestException);
    });

    it('a supplier’s new location is pinned to their own id; updates never move the owner', () => {
        const base = { name: 'Main', address: 'Str 1', city: 'Cluj', country: 'RO' };
        expect(parseWarehouseBody({ ...base, supplierId: 'sup-2' }, supplier, 'create').supplierId).toBe('sup-1');
        expect(parseWarehouseBody({ ...base, supplierId: 'sup-2' }, admin, 'create').supplierId).toBe('sup-2');
        expect(parseWarehouseBody({ supplierId: 'sup-2', products: { connect: [] }, city: 'Iasi' }, supplier, 'update')).toEqual({ city: 'Iasi' });
        expect(() => parseWarehouseBody({ name: 'x' }, supplier, 'create')).toThrow(BadRequestException);
    });
});

describe('FinanceService — scoped dispatch locations (mocked prisma)', () => {
    const rows = [{ id: 'w1', supplierId: 'sup-1' }, { id: 'w2', supplierId: 'sup-2' }];
    const prisma: any = {
        warehouse: {
            findMany: jest.fn(async ({ where }: any = {}) => rows.filter((r) => !where?.supplierId || r.supplierId === where.supplierId)),
            findUnique: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
            create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
            update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
            updateMany: jest.fn(async () => ({ count: 0 })),
            delete: jest.fn(async ({ where }: any) => ({ id: where.id })),
        },
        user: { findUnique: jest.fn(async ({ where }: any) => (where.id.startsWith('sup') ? { role: 'SUPPLIER' } : { role: 'CUSTOMER' })) },
        creditTerm: { findUnique: jest.fn(async () => null) },
        taxExemption: { findMany: jest.fn(async () => []) },
    };
    const svc = new FinanceService(prisma);
    const supplier = { id: 'sup-1', role: 'SUPPLIER', staff: false };
    const logistics = { id: 'l-1', role: 'LOGISTICS', staff: false };
    const admin = { id: 'adm-1', role: 'ADMIN', staff: true };
    beforeEach(() => jest.clearAllMocks());

    it('a supplier lists only their own rows, whatever supplierId they pass', async () => {
        const out = await svc.listWarehousesFor(supplier, 'sup-2');
        expect(out.map((r: any) => r.id)).toEqual(['w1']);
        expect(prisma.warehouse.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { supplierId: 'sup-1' } }));
    });

    it('staff and logistics can list all or filter by supplier', async () => {
        expect((await svc.listWarehousesFor(admin)).length).toBe(2);
        expect((await svc.listWarehousesFor(logistics, 'sup-2')).map((r: any) => r.id)).toEqual(['w2']);
    });

    it('a supplier cannot update or delete another supplier’s row (404, nothing written)', async () => {
        await expect(svc.updateWarehouseFor(supplier, 'w2', { city: 'X' })).rejects.toThrow(NotFoundException);
        await expect(svc.deleteWarehouseFor(supplier, 'w2')).rejects.toThrow(NotFoundException);
        expect(prisma.warehouse.update).not.toHaveBeenCalled();
        expect(prisma.warehouse.delete).not.toHaveBeenCalled();
    });

    it('a supplier can update and delete their own row', async () => {
        await expect(svc.updateWarehouseFor(supplier, 'w1', { city: 'X', supplierId: 'sup-2' })).resolves.toEqual({ id: 'w1', city: 'X' });
        await expect(svc.deleteWarehouseFor(supplier, 'w1')).resolves.toEqual({ id: 'w1' });
    });

    it('a supplier’s create always uses their own id; staff must name a supplier account', async () => {
        const base = { name: 'n', address: 'a', city: 'c', country: 'RO' };
        expect((await svc.createWarehouseFor(supplier, { ...base, supplierId: 'sup-2' })).supplierId).toBe('sup-1');
        expect((await svc.createWarehouseFor(admin, { ...base, supplierId: 'sup-2' })).supplierId).toBe('sup-2');
        await expect(svc.createWarehouseFor(admin, { ...base, supplierId: 'buyer-1' })).rejects.toThrow(BadRequestException);
    });

    it('own credit term / exemptions are read by the token id and hide staff ids', async () => {
        await svc.getOwnCreditTerm('buyer-1');
        expect(prisma.creditTerm.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'buyer-1' } }));
        expect(prisma.creditTerm.findUnique.mock.calls[0][0].select).not.toHaveProperty('approvedBy');
        await svc.getOwnTaxExemptions('buyer-1');
        expect(prisma.taxExemption.findMany.mock.calls[0][0].where).toEqual({ userId: 'buyer-1' });
        expect(prisma.taxExemption.findMany.mock.calls[0][0].select).not.toHaveProperty('reviewedBy');
    });
});
