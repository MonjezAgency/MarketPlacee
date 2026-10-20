import { notificationLink } from '../notification-links';

/** Each role is sent to the page it is allowed to use for the same record. */
describe('notification destinations by recipient role', () => {
    it('orders', () => {
        expect(notificationLink('ADMIN', { orderId: 'o1' })).toBe('/admin/orders/o1');
        expect(notificationLink('OWNER', { orderId: 'o1' })).toBe('/admin/orders/o1');
        expect(notificationLink('SUPPLIER', { orderId: 'o1' })).toBe('/supplier/orders?view=all&q=o1');
        expect(notificationLink('CUSTOMER', { orderId: 'o1' })).toBe('/dashboard/customer/orders/o1');
    });
    it('target prices: staff list, supplier product, buyer list', () => {
        expect(notificationLink('ADMIN', { targetPriceRequestId: 't', targetRef: 'TP-1' })).toBe('/admin/target-prices?q=TP-1');
        expect(notificationLink('SUPPLIER', { targetPriceRequestId: 't', productId: 'p' })).toBe('/supplier/products/p/edit');
        expect(notificationLink('CUSTOMER', { targetPriceRequestId: 't', productId: 'p' })).toBe('/dashboard/customer/targets');
    });
    it('products and offers', () => {
        expect(notificationLink('ADMIN', { productId: 'p' })).toBe('/admin/products/p');
        expect(notificationLink('SUPPLIER', { productId: 'p' })).toBe('/supplier/products/p/edit#feedback');
        expect(notificationLink('SUPPLIER', { productId: 'p', type: 'LOW_STOCK' })).toBe('/supplier/products/p/edit');
        expect(notificationLink('CUSTOMER', { productId: 'p' })).toBe('/products/p');
        expect(notificationLink('ADMIN', { offerId: 'x' })).toBe('/admin/wholesale-offers');
    });
    it('sends staff to disputes and accounts; never sends buyers or suppliers to another account', () => {
        expect(notificationLink('ADMIN', { disputeId: 'd', orderId: 'o' })).toBe('/admin/disputes');
        expect(notificationLink('CUSTOMER', { disputeId: 'd', orderId: 'o' })).toBe('/dashboard/customer/orders/o');
        expect(notificationLink('OWNER', { userId: 'u1' })).toBe('/admin/users/u1');
        expect(notificationLink('SUPPLIER', { userId: 'u1' })).toBeNull();
        expect(notificationLink('CUSTOMER', { userId: 'u1' })).toBeNull();
    });
    it('keeps a stored internal link, refuses external ones and returns null without a record', () => {
        expect(notificationLink('CUSTOMER', { link: '/x', orderId: 'o' })).toBe('/x');
        expect(notificationLink('CUSTOMER', { link: '//evil.example' })).toBeNull();
        expect(notificationLink('CUSTOMER', {})).toBeNull();
        expect(notificationLink('CUSTOMER', null)).toBeNull();
    });
});
