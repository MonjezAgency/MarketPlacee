import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../auth/roles.guard';
import { InvoiceController } from '../invoice.controller';
import { InvoiceService } from '../invoice.service';

/**
 * Who may call each /invoices route (TX-02 / PLT-05). The RolesGuard runs
 * against the controller's real metadata, so a removed or loosened @Roles
 * fails here.
 */
const guard = new RolesGuard(new Reflector());
const allowed = (handler: keyof InvoiceController, role: string) =>
    guard.canActivate({
        getHandler: () => InvoiceController.prototype[handler],
        getClass: () => InvoiceController,
        switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u-1', role } }) }),
    } as any);

const ROUTES: Record<string, keyof InvoiceController> = {
    'GET /invoices': 'getAllInvoices',
    'GET /invoices/my': 'getMyInvoices',
    'GET /invoices/:id': 'getInvoice',
    'POST /invoices/generate/:orderId': 'generateInvoice',
    'POST /invoices/:id/pay': 'markAsPaid',
};

// role → routes it may reach (everything else is refused)
const MATRIX: Record<string, string[]> = {
    OWNER: Object.keys(ROUTES),
    ADMIN: ['GET /invoices', 'GET /invoices/:id', 'POST /invoices/generate/:orderId', 'POST /invoices/:id/pay'],
    SUPPORT: ['GET /invoices', 'GET /invoices/:id'],
    CUSTOMER: ['GET /invoices/my', 'GET /invoices/:id'],
    SUPPLIER: [],
    MODERATOR: [],
    EDITOR: [],
    DEVELOPER: [],
    LOGISTICS: [],
};

describe('invoice route roles', () => {
    for (const [role, reachable] of Object.entries(MATRIX)) {
        for (const [route, handler] of Object.entries(ROUTES)) {
            const expected = reachable.includes(route);
            it(`${role} ${expected ? 'may' : 'may not'} call ${route}`, () => {
                expect(allowed(handler, role)).toBe(expected);
            });
        }
    }

    it('refuses a request without a user', () => {
        const ctx: any = {
            getHandler: () => InvoiceController.prototype.getAllInvoices,
            getClass: () => InvoiceController,
            switchToHttp: () => ({ getRequest: () => ({}) }),
        };
        expect(guard.canActivate(ctx)).toBe(false);
    });

    it('denies by default: the class-level roles are OWNER only', () => {
        expect(new Reflector().get('roles', InvoiceController)).toEqual(['OWNER']);
    });
});

function setup(invoice: any = { id: 'inv-1', customerId: 'buyer-1', orderId: 'o-1', invoiceNumber: 'INV-1', totalAmount: 105, currency: 'EUR', status: 'ISSUED' }) {
    const prisma: any = {
        invoice: {
            findUnique: jest.fn(async () => invoice),
            findMany: jest.fn(async () => []),
            update: jest.fn(async ({ data }: any) => ({ ...invoice, ...data })),
        },
        creditTerm: { findUnique: jest.fn(async () => null), update: jest.fn() },
    };
    const audit: any = { log: jest.fn(async () => undefined) };
    return { service: new InvoiceService(prisma, audit), prisma, audit };
}

describe('invoice ownership and buyer payload', () => {
    it('a buyer reads their own invoice with an order reference only', async () => {
        const { service, prisma } = setup();
        await expect(service.getInvoiceFor('inv-1', { sub: 'buyer-1', role: 'CUSTOMER' })).resolves.toMatchObject({ id: 'inv-1' });
        expect(prisma.invoice.findUnique.mock.calls[0][0].include).toEqual({ order: { select: { id: true, status: true, createdAt: true } } });
    });

    it("a buyer gets 404 on another buyer's invoice", async () => {
        const { service } = setup();
        await expect(service.getInvoiceFor('inv-1', { sub: 'buyer-2', role: 'CUSTOMER' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a supplier gets 404 even if the route guard were bypassed', async () => {
        const { service } = setup();
        await expect(service.getInvoiceFor('inv-1', { sub: 'sup-1', role: 'SUPPLIER' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['OWNER', 'ADMIN', 'SUPPORT', 'support'])('%s gets the full staff view of any invoice', async (role) => {
        const { service, prisma } = setup();
        await service.getInvoiceFor('inv-1', { sub: 'staff-1', role });
        expect(prisma.invoice.findUnique.mock.calls[0][0].include.order.include.items).toBeDefined();
    });

    it('/my never includes the full order (no terms, fulfillment or supplier prices)', async () => {
        const { service, prisma } = setup();
        await service.getInvoicesByBuyer('buyer-1');
        const args = prisma.invoice.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ customerId: 'buyer-1' });
        expect(args.include).toEqual({ order: { select: { id: true, status: true, createdAt: true } } });
    });

    it('marking paid writes an INVOICE_PAID audit row naming who did it', async () => {
        const { service, audit } = setup();
        await service.markAsPaid('inv-1', 'admin-1');
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'INVOICE_PAID',
            userId: 'buyer-1',
            amount: 105,
            metadata: expect.objectContaining({ invoiceId: 'inv-1', markedBy: 'admin-1', previousStatus: 'ISSUED' }),
        }));
    });
});
