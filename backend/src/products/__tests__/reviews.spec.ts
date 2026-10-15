import { ReviewsService } from '../reviews.service';

/** Review rules with an in-memory Prisma double (no DB, no network). */
function setup(over: { product?: any; existing?: any; createError?: any } = {}) {
    const product = over.product ?? { id: 'p1', name: 'Nutella 400 g', status: 'APPROVED', supplierId: 'sup' };
    const store: any[] = over.existing ? [over.existing] : [];
    const prisma: any = {
        product: { findUnique: jest.fn(async () => product), update: jest.fn(async () => ({})) },
        review: {
            findUnique: jest.fn(async () => store[0] ?? null),
            findMany: jest.fn(async ({ where }: any) => (where?.productId ? store.map((r) => ({ ...r, user: { id: r.userId } })) : store)),
            create: jest.fn(async ({ data }: any) => { if (over.createError) throw over.createError; const r = { id: 'r1', ...data }; store.push(r); return r; }),
            update: jest.fn(async ({ data }: any) => Object.assign(store[0] ?? (store[0] = { id: 'r1' }), data)),
        },
        orderItem: { findMany: jest.fn(async () => [{ order: { customerId: 'buyer-1' } }]) },
        user: { findUnique: jest.fn(async () => ({ email: 'supplier@example.test', notificationPrefs: {} })) },
    };
    const notifications: any = { notifyUser: jest.fn(async () => ({})) };
    const email: any = { sendMailDetailed: jest.fn(async () => ({ success: true })) };
    const storage: any = { uploadProductImage: jest.fn(async () => 'https://storage.example/r.jpg') };
    return { svc: new ReviewsService(prisma, notifications, email, storage), prisma, notifications, email, storage };
}
const flush = () => new Promise((r) => setImmediate(r));

describe('Product reviews', () => {
    it('a supplier cannot review their own product', async () => {
        const { svc } = setup();
        await expect(svc.create('p1', 'sup', 5, 'Great')).rejects.toThrow(/own product/);
    });
    it('only live products can be reviewed, with a whole 1–5 rating', async () => {
        await expect(setup({ product: { id: 'p1', status: 'PENDING', supplierId: 'sup' } }).svc.create('p1', 'b', 4)).rejects.toThrow(/can’t be reviewed/);
        await expect(setup().svc.create('p1', 'b', 4.5)).rejects.toThrow(/whole number/);
    });
    it('a new review notifies the supplier once — in-app and by email, without the reviewer’s identity', async () => {
        const { svc, notifications, email } = setup();
        await svc.create('p1', 'buyer-1', 4, 'Arrived well packed');
        await flush();
        expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
        expect(notifications.notifyUser.mock.calls[0][0]).toBe('sup');
        expect(email.sendMailDetailed).toHaveBeenCalledTimes(1);
        const [to, subject, html] = email.sendMailDetailed.mock.calls[0];
        expect(to).toBe('supplier@example.test');
        expect(subject).toBe('New 4-star review: Nutella 400 g');
        expect(html).toContain('Arrived well packed');
        expect(html).not.toContain('buyer-1');
    });
    it('editing a review does not notify again; a lost create race does not either', async () => {
        const a = setup({ existing: { id: 'r1', productId: 'p1', userId: 'buyer-1', rating: 3 } });
        await a.svc.create('p1', 'buyer-1', 5, 'Changed my mind');
        await flush();
        expect(a.notifications.notifyUser).not.toHaveBeenCalled();
        const b = setup({ createError: Object.assign(new Error('dup'), { code: 'P2002' }) });
        await b.svc.create('p1', 'buyer-1', 5);
        await flush();
        expect(b.notifications.notifyUser).not.toHaveBeenCalled();
    });
    it('no email when the supplier turned listing feedback off (in-app still shows it)', async () => {
        const { svc, prisma, notifications, email } = setup();
        prisma.user.findUnique = jest.fn(async () => ({ email: 's@x.test', notificationPrefs: { productComments: false } }));
        await svc.create('p1', 'buyer-1', 2);
        await flush();
        expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
        expect(email.sendMailDetailed).not.toHaveBeenCalled();
    });
    it('marks reviews from buyers with a delivered order as verified purchases', async () => {
        const { svc } = setup({ existing: { id: 'r1', productId: 'p1', userId: 'buyer-1', rating: 5 } });
        const list: any[] = await svc.findAll('p1');
        expect(list[0].verifiedPurchase).toBe(true);
    });
    it('review photos go to the configured storage, not the server disk', async () => {
        const { svc, storage } = setup();
        const r: any = await svc.create('p1', 'buyer-1', 5, '', [{ buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg' }]);
        expect(storage.uploadProductImage).toHaveBeenCalledTimes(1);
        expect(r.images).toEqual(['https://storage.example/r.jpg']);
    });
});
