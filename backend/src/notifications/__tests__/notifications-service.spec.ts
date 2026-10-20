import { NotificationsService } from '../notifications.service';

/** Persisted notifications: one per event per user (dedupeKey), the link derived for the recipient's role, the list filtered and paged per user. */
function setup(existing: any = null, role = 'SUPPLIER') {
    const created: any[] = [];
    const prisma: any = {
        notification: {
            findFirst: jest.fn(async () => existing),
            create: jest.fn(async ({ data }: any) => { const row = { id: `n${created.length + 1}`, read: false, createdAt: new Date(), ...data }; created.push(row); return row; }),
            findMany: jest.fn(async () => []),
        },
        user: { findUnique: jest.fn(async () => ({ role })) },
    };
    const gateway: any = { emitToUser: jest.fn() };
    return { svc: new NotificationsService(prisma, gateway), prisma, gateway, created };
}

describe('NotificationsService.create', () => {
    it('stores the event once per dedupeKey and does not push it again', async () => {
        const first = setup();
        await first.svc.create('u1', 'T', 'M', 'INFO', { dedupeKey: 'target:1:created' });
        expect(first.created).toHaveLength(1);
        expect(first.gateway.emitToUser).toHaveBeenCalledTimes(1);
        const again = setup({ id: 'n1' });
        const out = await again.svc.create('u1', 'T', 'M', 'INFO', { dedupeKey: 'target:1:created' });
        expect(out).toEqual({ id: 'n1', duplicate: true });
        expect(again.prisma.notification.create).not.toHaveBeenCalled();
        expect(again.gateway.emitToUser).not.toHaveBeenCalled();
        expect(again.prisma.notification.findFirst).toHaveBeenCalledWith({ where: { userId: 'u1', data: { path: ['dedupeKey'], equals: 'target:1:created' } } });
    });
    it('adds the link for the recipient role when none is given, and keeps an explicit one', async () => {
        const s = setup(null, 'SUPPLIER');
        await s.svc.create('u1', 'T', 'M', 'INFO', { orderId: 'o1' });
        expect(s.created[0].data.link).toBe('/supplier/orders?view=all&q=o1');
        await s.svc.create('u1', 'T', 'M', 'INFO', { orderId: 'o1', link: '/supplier/orders' });
        expect(s.created[1].data.link).toBe('/supplier/orders');
    });
});

describe('NotificationsService.findByUser', () => {
    it('reads only the caller’s rows, with the unread filter, a cursor and a capped page size', async () => {
        const s = setup();
        await s.svc.findByUser('u1', { unread: true, before: '2026-10-01T00:00:00.000Z', limit: 500 });
        expect(s.prisma.notification.findMany).toHaveBeenCalledWith({ where: { userId: 'u1', read: false, createdAt: { lt: new Date('2026-10-01T00:00:00.000Z') } }, orderBy: { createdAt: 'desc' }, take: 100 });
        await s.svc.findByUser('u1', { before: 'not a date' });
        expect(s.prisma.notification.findMany).toHaveBeenLastCalledWith({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' }, take: 50 });
    });
});
