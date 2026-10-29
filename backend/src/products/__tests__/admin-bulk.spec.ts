import { planBulk, type BulkCandidate } from '../admin-bulk';
import { ProductsController } from '../products.controller';

/** Bulk actions on the admin Products page: the server decides per product, and reports every skip. */
const complete = { name: 'Takis Fuego 90 g', brand: 'Takis', category: 'Snacks', ean: '8000070025400', origin: 'Mexico', exwLocation: 'Bucharest', weight: '90 g', basePrice: 30, stock: 10, unitsPerCase: 24, casesPerPallet: 80, unit: 'piece', moq: 1, moqUnit: 'CASE', images: ['https://cdn.example/takis.jpg'] };
const sub = (id: string, status: string, product: any = complete): BulkCandidate => ({ id, name: id, status, scope: 'submissions', product });
const cat = (id: string, usage: Partial<NonNullable<BulkCandidate['usage']>> = {}): BulkCandidate => ({ id, name: id, status: 'APPROVED', scope: 'catalog', product: complete, usage: { orderLines: 0, openTargets: 0, activePromotions: 0, approvedOffers: 0, ...usage } });

describe('planBulk', () => {
    it('approves only submitted, complete supplier products', () => {
        const out = planBulk('approve', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'zz'], [
            sub('a', 'PENDING'), sub('b', 'APPROVED'), sub('c', 'DRAFT'), sub('d', 'REJECTED'), sub('e', 'NEEDS_CHANGES'), sub('f', 'PENDING', { ...complete, images: [] }), { ...cat('g'), status: 'REJECTED' },
        ]);
        expect(out.eligible.map((e) => e.id)).toEqual(['a']);
        const why = Object.fromEntries(out.skipped.map((s) => [s.id, s.reason]));
        expect(why).toEqual({ b: 'ALREADY_APPROVED', c: 'NOT_SUBMITTED', d: 'CLOSED', e: 'ALREADY_CHANGES', f: 'INCOMPLETE', g: 'CLOSED', zz: 'NOT_FOUND' });
        expect(out.skipped.find((s) => s.id === 'f')!.detail).toEqual(['Product image']);
    });
    it('publishes complete Ali FMCG Catalog drafts', () => {
        const draft = { ...cat('d'), status: 'DRAFT' };
        const bare = { ...cat('b'), status: 'DRAFT', product: { ...complete, brand: '' } };
        const out = planBulk('approve', ['d', 'b', 'live'], [draft, bare, cat('live')]);
        expect(out.eligible.map((e) => e.id)).toEqual(['d']);
        expect(out.skipped.map((s) => [s.id, s.reason])).toEqual([['b', 'INCOMPLETE'], ['live', 'ALREADY_APPROVED']]);
    });
    it('rejects and requests changes only on products waiting for review; never touches live or catalog products', () => {
        const rows = [sub('p', 'PENDING'), sub('n', 'NEEDS_CHANGES'), sub('l', 'APPROVED'), sub('x', 'REJECTED'), sub('d', 'DRAFT'), cat('c')];
        const ids = rows.map((r) => r.id);
        expect(planBulk('reject', ids, rows).eligible.map((e) => e.id)).toEqual(['p', 'n']);
        expect(planBulk('changes', ids, rows).eligible.map((e) => e.id)).toEqual(['p']);
    });
    it('deletes only catalog products nothing depends on', () => {
        const rows = [cat('free'), cat('ordered', { orderLines: 2 }), cat('target', { openTargets: 1 }), cat('promo', { activePromotions: 1 }), cat('offer', { approvedOffers: 1 }), sub('supplier', 'PENDING')];
        const out = planBulk('delete', rows.map((r) => r.id), rows);
        expect(out.eligible.map((e) => e.id)).toEqual(['free']);
        expect(out.skipped.map((s) => s.reason)).toEqual(['HAS_ORDERS', 'HAS_TARGETS', 'HAS_PROMOTIONS', 'HAS_OFFERS', 'WRONG_SCOPE']);
    });
    it('counts a repeated id once', () => {
        expect(planBulk('approve', ['a', 'a'], [sub('a', 'PENDING')]).eligible).toHaveLength(1);
    });
});

describe('POST /products/admin/bulk', () => {
    function setup(plan = { eligible: [{ id: 'a', name: 'A' }], skipped: [] as any[] }) {
        const products: any = {
            bulkApprove: jest.fn(async (ids: string[]) => ({ count: ids.length, skipped: [] })),
            bulkReject: jest.fn(async (ids: string[]) => ({ count: ids.length })),
            deleteProducts: jest.fn(async (ids: string[]) => ({ deletedCount: ids.length })),
            adminComment: jest.fn(async () => ({})),
        };
        const adminProducts: any = { planBulk: jest.fn(async () => plan) };
        const ctrl = new ProductsController(products, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, undefined, adminProducts);
        return { ctrl, products, adminProducts };
    }
    const admin = { user: { sub: 'admin-1', role: 'ADMIN' } };
    it('runs the action only on the eligible products and returns the skips', async () => {
        const skipped = [{ id: 'b', name: 'B', reason: 'ALREADY_APPROVED' }];
        const { ctrl, products } = setup({ eligible: [{ id: 'a', name: 'A' }], skipped });
        const out = await ctrl.adminBulk({ action: 'approve', ids: ['a', 'b'] }, admin);
        expect(products.bulkApprove).toHaveBeenCalledWith(['a'], expect.anything());
        expect(out).toMatchObject({ action: 'approve', requested: 2, done: 1, skipped, failed: [] });
    });
    it('requires a message for reject and changes, and owner/admin for delete', async () => {
        const { ctrl, products } = setup();
        await expect(ctrl.adminBulk({ action: 'reject', ids: ['a'], message: ' ' }, admin)).rejects.toMatchObject({ response: { code: 'MESSAGE' } });
        await expect(ctrl.adminBulk({ action: 'changes', ids: ['a'] }, admin)).rejects.toMatchObject({ response: { code: 'MESSAGE' } });
        await expect(ctrl.adminBulk({ action: 'delete', ids: ['a'] }, { user: { sub: 'm', role: 'MODERATOR' } })).rejects.toMatchObject({ response: { code: 'ROLE' } });
        await expect(ctrl.adminBulk({ action: 'publish', ids: ['a'] }, admin)).rejects.toMatchObject({ response: { code: 'ACTION' } });
        await expect(ctrl.adminBulk({ action: 'approve', ids: [] }, admin)).rejects.toMatchObject({ response: { code: 'NO_IDS' } });
        await expect(ctrl.adminBulk({ action: 'approve', ids: Array.from({ length: 201 }, (_, i) => `p${i}`) }, admin)).rejects.toMatchObject({ response: { code: 'TOO_MANY' } });
        expect(products.bulkReject).not.toHaveBeenCalled();
        expect(products.deleteProducts).not.toHaveBeenCalled();
    });
    it('reports a request-changes row that failed instead of counting it', async () => {
        const { ctrl, products } = setup({ eligible: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], skipped: [] });
        products.adminComment.mockImplementationOnce(async () => ({})).mockImplementationOnce(async () => { throw new Error('db down'); });
        const out = await ctrl.adminBulk({ action: 'changes', ids: ['a', 'b'], message: 'Add the back-of-pack photo' }, admin);
        expect(out.done).toBe(1);
        expect(out.failed).toEqual([{ id: 'b', name: 'B', error: 'db down' }]);
    });
});
