import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OffersService, withSource } from '../offers.service';

/**
 * Admin review of wholesale offers (Offer): the list marks staff-posted
 * offers with the shared staff rule, approve reports what the email step
 * really delivered (and never turns a recorded approval into an error),
 * and reject returns the stored record in the list-row shape.
 * In-memory Prisma double, no database, no email sent.
 */

type Row = Record<string, any>;

function makeService(opts: { recipients?: number; failSend?: boolean; blastThrows?: boolean } = {}) {
    const offers: Row[] = [
        { id: 'o1', status: 'PENDING', supplierId: 's1', productId: 'p1', pricePerUnit: 10, unit: 'pallet', quantity: 3, adminNotes: null, createdAt: new Date() },
        { id: 'o2', status: 'APPROVED', supplierId: 'a1', productId: 'p1', pricePerUnit: 9, unit: 'carton', quantity: 1, adminNotes: null, createdAt: new Date() },
    ];
    const users: Record<string, Row> = {
        s1: { id: 's1', name: 'Supplier A', email: 's@x.test', companyName: 'A Foods', role: 'SUPPLIER' },
        a1: { id: 'a1', name: 'Atlantis', email: 'a@x.test', companyName: null, role: 'ADMIN' },
    };
    const product = { id: 'p1', name: 'Biscuits 200g', images: [], ean: '123' };
    const hydrate = (o: Row) => ({ ...o, product, supplier: users[o.supplierId] });

    const prisma: any = {
        offer: {
            findMany: jest.fn(async ({ where }: any) => offers.filter((o) => !where?.status || o.status === where.status).map(hydrate)),
            findUnique: jest.fn(async ({ where }: any) => { const o = offers.find((x) => x.id === where.id); return o ? hydrate(o) : null; }),
            update: jest.fn(async ({ where, data }: any) => { const o = offers.find((x) => x.id === where.id)!; Object.assign(o, data); return { ...o }; }),
        },
        newsletterSubscriber: {
            findMany: jest.fn(async () => {
                if (opts.blastThrows) throw new Error('db down');
                return Array.from({ length: opts.recipients ?? 2 }, (_, i) => ({ email: `n${i}@x.test`, name: null, status: 'ACTIVE', unsubscribeToken: 't' }));
            }),
        },
        user: { findMany: jest.fn(async () => []) },
    };
    const email: any = { sendMailDetailed: jest.fn(async () => ({ success: !opts.failSend, error: opts.failSend ? 'smtp' : undefined })) };
    const tracking: any = {
        registerSentEmail: jest.fn(async () => 'trk'),
        wrapLinks: jest.fn((html: string) => html),
        trackingPixelHtml: jest.fn(() => ''),
    };
    const svc = new OffersService(prisma, email, tracking, {} as any);
    (svc as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.spyOn(svc as any, 'renderOfferEmail').mockReturnValue('<html><body>offer</body></html>');
    return { svc, offers, prisma, email };
}

describe('withSource', () => {
    it('marks staff accounts with the catalog-scope staff rule', () => {
        expect(withSource({ supplier: { role: 'ADMIN' } }).postedByStaff).toBe(true);
        expect(withSource({ supplier: { role: 'moderator' } }).postedByStaff).toBe(true);
        expect(withSource({ supplier: { role: 'SUPPLIER' } }).postedByStaff).toBe(false);
        expect(withSource({ supplier: null }).postedByStaff).toBe(false);
    });
});

describe('OffersService admin review', () => {
    it('listAll returns every offer with postedByStaff, and filters by status', async () => {
        const { svc } = makeService();
        const all = await svc.listAll();
        expect(all.map((o: any) => [o.id, o.postedByStaff])).toEqual([['o1', false], ['o2', true]]);
        const pending = await svc.listAll('PENDING');
        expect(pending.map((o: any) => o.id)).toEqual(['o1']);
    });

    it('approve records the approval and reports the real delivery count', async () => {
        const { svc, offers } = makeService({ recipients: 3 });
        const res: any = await svc.approve('o1', 'admin-1');
        expect(offers[0].status).toBe('APPROVED');
        expect(offers[0].approvedBy).toBe('admin-1');
        expect(res.status).toBe('APPROVED');
        expect(res.supplier.id).toBe('s1');
        expect(res.postedByStaff).toBe(false);
        expect(res.emailBlast).toEqual({ total: 3, successCount: 3 });
    });

    it('approve reports failed sends as not delivered', async () => {
        const { svc } = makeService({ recipients: 2, failSend: true });
        const res: any = await svc.approve('o1', 'admin-1');
        expect(res.emailBlast).toEqual({ total: 2, successCount: 0 });
    });

    it('approve stays recorded when the email step throws, with emailBlast null', async () => {
        const { svc, offers } = makeService({ blastThrows: true });
        const res: any = await svc.approve('o1', 'admin-1');
        expect(offers[0].status).toBe('APPROVED');
        expect(res.status).toBe('APPROVED');
        expect(res.emailBlast).toBeNull();
    });

    it('approve refuses an already approved offer and unknown ids', async () => {
        const { svc } = makeService();
        await expect(svc.approve('o2', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
        await expect(svc.approve('nope', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reject stores the trimmed reason and returns the list-row shape', async () => {
        const { svc, offers, email } = makeService();
        const res: any = await svc.reject('o1', 'admin-1', '  Price above market  ');
        expect(offers[0].status).toBe('REJECTED');
        expect(offers[0].adminNotes).toBe('Price above market');
        expect(res.adminNotes).toBe('Price above market');
        expect(res.product.id).toBe('p1');
        expect(res.supplier.companyName).toBe('A Foods');
        expect(res.postedByStaff).toBe(false);
        expect(email.sendMailDetailed).not.toHaveBeenCalled();
    });

    it('reject without a reason keeps the existing default note', async () => {
        const { svc, offers } = makeService();
        await svc.reject('o1', 'admin-1', '   ');
        expect(offers[0].adminNotes).toBe('Rejected by admin');
    });
});
