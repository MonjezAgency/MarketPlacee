import { accountMoney, canSeeNet, parseTabPage, pageResult, productStatusFilter, toOfferRow, toProductRow, type MoneyOrder } from '../admin-users-activity';

/** Admin → Users → one account: tab paging and the money definitions. */
describe('parseTabPage', () => {
    it('defaults to 14 per page and clamps', () => {
        expect(parseTabPage({})).toEqual({ page: 1, limit: 14, skip: 0 });
        expect(parseTabPage({ page: '3' })).toEqual({ page: 3, limit: 14, skip: 28 });
        expect(parseTabPage({ page: '-1', limit: '999' })).toEqual({ page: 1, limit: 50, skip: 0 });
        expect(parseTabPage({ page: 'x', limit: '0' })).toEqual({ page: 1, limit: 14, skip: 0 });
    });
    it('reports pages, at least one', () => {
        expect(pageResult([], 0, parseTabPage({}))).toMatchObject({ total: 0, pages: 1 });
        expect(pageResult([], 29, parseTabPage({}))).toMatchObject({ pages: 3 });
    });
    it('accepts only real product statuses', () => {
        expect(productStatusFilter('approved')).toBe('APPROVED');
        expect(productStatusFilter('DELETED')).toBeNull();
    });
});

const approved = (o: Partial<MoneyOrder>): MoneyOrder => ({ status: 'PENDING', reviewStatus: 'APPROVED', reviewedAt: new Date('2026-10-01'), createdAt: new Date('2026-09-30'), totalAmount: 0, lines: [], ...o });

describe('accountMoney', () => {
    const orders: MoneyOrder[] = [
        approved({ totalAmount: 300, lines: [
            { quantity: 2, price: 100, supplierUnitPrice: 80, supplierId: 's1' },
            { quantity: 1, price: 100, supplierUnitPrice: 90, supplierId: 's2' },
        ] }),
        approved({ totalAmount: 50, lines: [{ quantity: 1, price: 50, supplierUnitPrice: null, supplierId: 's1' }] }),
        // never counted: waiting request, rejected request, cancelled, legacy not confirmed
        approved({ reviewStatus: 'PENDING_REVIEW', reviewedAt: null, totalAmount: 999, lines: [{ quantity: 1, price: 999, supplierUnitPrice: 1, supplierId: 's1' }] }),
        approved({ reviewStatus: 'REJECTED', totalAmount: 999, lines: [{ quantity: 1, price: 999, supplierUnitPrice: 1, supplierId: 's1' }] }),
        approved({ status: 'CANCELLED', totalAmount: 999, lines: [{ quantity: 1, price: 999, supplierUnitPrice: 1, supplierId: 's1' }] }),
        approved({ reviewStatus: 'LEGACY', status: 'PENDING', totalAmount: 999, lines: [{ quantity: 1, price: 999, supplierUnitPrice: 1, supplierId: 's1' }] }),
        approved({ reviewStatus: 'LEGACY', status: 'DELIVERED', totalAmount: 20, lines: [{ quantity: 1, price: 20, supplierUnitPrice: 15, supplierId: 's2' }] }),
    ];
    it('buyer: gross = order totals of counted orders; margin over lines with a recorded net', () => {
        const m = accountMoney(orders, { supplierId: null, netVisible: true });
        expect(m).toMatchObject({ countedOrders: 3, grossValue: 370, supplierNet: null, margin: 55, linesCounted: 4, linesWithoutNet: 1 });
    });
    it('supplier: only their own lines', () => {
        const m = accountMoney(orders, { supplierId: 's1', netVisible: true });
        expect(m).toMatchObject({ countedOrders: 2, grossValue: 250, supplierNet: 160, margin: 40, linesCounted: 2, linesWithoutNet: 1 });
    });
    it('hides net and margin without net access', () => {
        const m = accountMoney(orders, { supplierId: 's1', netVisible: false });
        expect(m).toMatchObject({ grossValue: 250, supplierNet: null, margin: null, linesWithoutNet: 0, netVisible: false });
    });
    it('no recorded supplier price → net and margin unavailable, not zero', () => {
        const m = accountMoney([approved({ totalAmount: 10, lines: [{ quantity: 1, price: 10, supplierUnitPrice: null, supplierId: 's1' }] })], { supplierId: 's1', netVisible: true });
        expect(m).toMatchObject({ grossValue: 10, supplierNet: null, margin: null, linesWithoutNet: 1 });
    });
});

describe('rows and net access', () => {
    it('only OWNER and ADMIN see net prices', () => {
        expect(canSeeNet('OWNER')).toBe(true);
        expect(canSeeNet('ADMIN')).toBe(true);
        for (const r of ['SUPPORT', 'MODERATOR', 'SUPPLIER', 'CUSTOMER', undefined]) expect(canSeeNet(r)).toBe(false);
    });
    it('product and offer rows drop the supplier price without access', () => {
        const p = { id: 'p', name: 'n', ean: '1', brand: null, status: 'APPROVED', images: [], stock: 1, unit: 'carton', basePrice: 5, updatedAt: new Date() };
        expect(toProductRow(p, true).netPrice).toBe(5);
        expect(toProductRow(p, false).netPrice).toBeNull();
        const o = { id: 'o', status: 'APPROVED', unit: 'pallet', quantity: 1, pricePerUnit: 9, validUntil: null, createdAt: new Date(), productNameSnap: 'Snap', product: { id: 'p', name: 'n' } };
        expect(toOfferRow(o, true)).toMatchObject({ pricePerUnit: 9, product: { id: 'p', name: 'Snap' } });
        expect(toOfferRow(o, false).pricePerUnit).toBeNull();
    });
});
