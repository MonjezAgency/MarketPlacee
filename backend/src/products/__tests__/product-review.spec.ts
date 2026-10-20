import { ProductReviewService } from '../product-review.service';

/** Review trail: what is stored per event and how much identity each viewer sees. */
function service(rows: any[] = []) {
    const created: any[] = [];
    const prisma: any = {
        productReviewEvent: {
            create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'e', ...data }; }),
            findMany: jest.fn(async () => rows),
            groupBy: jest.fn(async () => [{ action: 'APPROVED', _count: { _all: 2 } }, { action: 'SUBMITTED', _count: { _all: 3 } }, { action: 'RESUBMITTED', _count: { _all: 1 } }]),
            findFirst: jest.fn(async () => ({ createdAt: new Date('2026-10-20T00:00:00Z') })),
        },
    };
    return { svc: new ProductReviewService(prisma), created, prisma };
}

describe('product review trail', () => {
    it('stores the message, the resulting status and the actor; trims and caps the message', async () => {
        const { svc, created } = service();
        await svc.record({ productId: 'p1', action: 'CHANGES_REQUESTED', message: '  Replace the photo.  ', statusAfter: 'NEEDS_CHANGES', actor: { id: 'admin-1', role: 'admin' } });
        expect(created[0]).toEqual({ productId: 'p1', action: 'CHANGES_REQUESTED', message: 'Replace the photo.', statusAfter: 'NEEDS_CHANGES', actorId: 'admin-1', actorRole: 'ADMIN' });
        await svc.record({ productId: 'p1', action: 'APPROVED', statusAfter: 'APPROVED' });
        expect(created[1]).toMatchObject({ message: null, actorId: null, actorRole: 'SYSTEM' });
        await svc.record({ productId: 'p1', action: 'REJECTED', message: 'x'.repeat(5000), statusAfter: 'REJECTED', actor: { id: 'a', role: 'OWNER' } });
        expect(created[2].message).toHaveLength(4000);
    });
    it('never throws into the caller when the row cannot be written', async () => {
        const { svc, prisma } = service();
        prisma.productReviewEvent.create.mockRejectedValueOnce(new Error('db down'));
        await expect(svc.record({ productId: 'p1', action: 'APPROVED' })).resolves.toBeUndefined();
    });
    it('shows team members to staff and only "Atlantis" to the supplier', async () => {
        const rows = [
            { id: '1', action: 'SUBMITTED', message: null, statusAfter: 'PENDING', createdAt: new Date('2026-10-20T01:00:00Z'), actorId: 'sup-1', actorRole: 'SUPPLIER', actor: { id: 'sup-1', name: 'Supplier A', role: 'SUPPLIER' } },
            { id: '2', action: 'CHANGES_REQUESTED', message: 'Fix photo', statusAfter: 'NEEDS_CHANGES', createdAt: new Date('2026-10-20T02:00:00Z'), actorId: 'adm-1', actorRole: 'ADMIN', actor: { id: 'adm-1', name: 'Dana', role: 'ADMIN' } },
            { id: '3', action: 'APPROVED', message: null, statusAfter: 'APPROVED', createdAt: new Date('2026-10-20T03:00:00Z'), actorId: null, actorRole: 'SYSTEM', actor: null },
        ];
        const { svc } = service(rows);
        const staff = await svc.history('p1', 'staff');
        expect(staff.map((e) => [e.by, e.actorName])).toEqual([['supplier', 'Supplier A'], ['atlantis', 'Dana'], ['system', null]]);
        const supplier = await svc.history('p1', 'supplier');
        expect(supplier.map((e) => e.by)).toEqual(['supplier', 'atlantis', 'system']);
        expect(supplier.every((e) => !('actorName' in e) && !('actorId' in e))).toBe(true);
        expect(supplier[1].message).toBe('Fix photo');
    });
    it('counts decisions per action and reports when dating began', async () => {
        const { svc } = service();
        await expect(svc.decisionCounts(new Date('2026-10-01'), new Date('2026-11-01'))).resolves.toEqual({ approved: 2, rejected: 0, changesRequested: 0, submitted: 4, trackedSince: '2026-10-20T00:00:00.000Z' });
    });
});
