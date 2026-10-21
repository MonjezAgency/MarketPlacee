import { redactDisputeNet } from '../disputes.controller';

/** Supplier net prices on a disputed order's lines are for OWNER / ADMIN only (buyers and other staff never get them). */
const dispute = { id: 'd1', customerId: 'b1', order: { id: 'o1', items: [{ id: 'i1', price: 12, quantity: 2, supplierUnitPrice: 10, product: { name: 'Cola' } }] } };

describe('redactDisputeNet', () => {
    it('keeps supplier net for owner and admin', () => {
        expect(redactDisputeNet(dispute, 'ADMIN').order.items[0].supplierUnitPrice).toBe(10);
        expect(redactDisputeNet(dispute, 'OWNER').order.items[0].supplierUnitPrice).toBe(10);
    });
    it('removes it for the buyer and for other staff, on a single dispute and on a page', () => {
        for (const role of ['CUSTOMER', 'SUPPORT', 'MODERATOR', 'DEVELOPER', 'LOGISTICS', undefined]) {
            const one = redactDisputeNet(dispute, role);
            expect(JSON.stringify(one)).not.toContain('supplierUnitPrice');
            expect(one.order.items[0]).toMatchObject({ price: 12, quantity: 2, product: { name: 'Cola' } });
            const page = redactDisputeNet({ data: [dispute], total: 1 }, role);
            expect(JSON.stringify(page)).not.toContain('supplierUnitPrice');
        }
        expect(dispute.order.items[0].supplierUnitPrice).toBe(10); // the input is not mutated
    });
});
