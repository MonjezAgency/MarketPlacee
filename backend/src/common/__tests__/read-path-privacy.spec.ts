import { StreamableFile } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { applyPricePrivacy } from '../price-privacy';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { mayReadUserRecord } from '../../users/own-record';
import { isOrderParty, isShipmentStaff, publicTrackingView } from '../../shipping/shipment-view';
import { publicErrorMessage } from '../../security/security.exception-filter';
import { AdsService } from '../../ads/ads.service';

const m = { piece: 1.1, pallet: 1.05, container: 1.02, mix: 1.15 };
const product = () => ({
    id: 'p1', supplierId: 'sup-a', name: 'X', price: 7.4, basePrice: 6.72,
    supplier: { id: 'sup-a', name: 'Supplier A', companyName: 'A Co', email: 'a@sup.test' },
});

describe('supplier identity on read paths', () => {
    it('anonymous visitors and buyers never receive supplier ids or accounts', () => {
        for (const viewer of [null, { id: 'b1', role: 'CUSTOMER' }]) {
            const out: any = applyPricePrivacy({ data: [product()] }, viewer as any, m);
            expect(out.data[0]).not.toHaveProperty('supplierId');
            expect(out.data[0]).not.toHaveProperty('supplier');
        }
    });
    it('strips supplier ids from a buyer’s order terms, fulfilment groups and mixed loads', () => {
        const order: any = applyPricePrivacy({
            id: 'o1', customerId: 'b1', supplierId: null,
            termsSnapshot: { lines: [{ productId: 'p1', supplierId: 'sup-a', unitPrice: 5 }], fulfillment: { groups: [{ supplierId: 'sup-a' }] } },
            items: [{ price: 5, supplierUnitPrice: 4, product: { id: 'p1', supplierId: 'sup-a', basePrice: 4 } }],
        }, { id: 'b1', role: 'CUSTOMER' }, m);
        expect(JSON.stringify(order)).not.toMatch(/sup-a|supplierUnitPrice/);
        expect(order.customerId).toBe('b1'); // the buyer's own fields stay
        expect(order.termsSnapshot.lines[0].unitPrice).toBe(5);
    });
    it('another supplier sees neither the id nor the account of a competitor’s product', () => {
        const p: any = applyPricePrivacy(product(), { id: 'sup-b', role: 'SUPPLIER' }, m);
        expect(p).not.toHaveProperty('supplierId');
        expect(p).not.toHaveProperty('supplier');
    });
    it('the owning supplier and staff keep it', () => {
        expect((applyPricePrivacy(product(), { id: 'sup-a', role: 'SUPPLIER' }, m) as any).supplierId).toBe('sup-a');
        const staff: any = applyPricePrivacy(product(), { id: 'x', role: 'ADMIN' }, m);
        expect(staff.supplier.email).toBe('a@sup.test');
    });
    it('a supplier’s own records (non-product objects) keep their supplierId', () => {
        const s: any = applyPricePrivacy({ settings: { supplierId: 'sup-a', method: 'SELF' } }, { id: 'sup-a', role: 'SUPPLIER' }, m);
        expect(s.settings.supplierId).toBe('sup-a');
    });
});

describe('user-addressed records (GET /users/:id/notifications)', () => {
    it('only the user themself or an administrator', () => {
        expect(mayReadUserRecord({ sub: 'u1', role: 'CUSTOMER' }, 'u1')).toBe(true);
        expect(mayReadUserRecord({ sub: 'u2', role: 'CUSTOMER' }, 'u1')).toBe(false);
        expect(mayReadUserRecord({ sub: 's1', role: 'SUPPLIER' }, 'u1')).toBe(false);
        expect(mayReadUserRecord({ sub: 'a1', role: 'ADMIN' }, 'u1')).toBe(true);
        expect(mayReadUserRecord(null, 'u1')).toBe(false);
    });
});

describe('shipment reads', () => {
    const shipment = {
        id: 's1', orderId: 'o1', trackingNumber: 'T1', carrier: 'DHL', status: 'IN_TRANSIT', expectedDelivery: null,
        createdAt: 'c', updatedAt: 'u', updates: [{ id: 'u1', status: 'X', description: 'd', location: null, createdAt: 'c', shipmentId: 's1' }],
        order: {
            id: 'o1', status: 'SHIPPED', totalAmount: 504, customerId: 'b1', supplierId: null, paymentIntentId: 'pi_1',
            shippingAddress: 'Street 1', customer: { name: 'B', email: 'b@x.test' },
            termsSnapshot: { lines: [{ supplierId: 'sup-a' }] }, items: [{ product: { supplierId: 'sup-a' } }],
        },
    };
    it('anyone with the number gets progress only', () => {
        const v: any = publicTrackingView(shipment, false, null);
        expect(Object.keys(v).sort()).toEqual(['carrier', 'createdAt', 'expectedDelivery', 'id', 'status', 'trackingNumber', 'updatedAt', 'updates']);
        expect(JSON.stringify(v)).not.toMatch(/b@x\.test|Street|pi_1|sup-a|504/);
    });
    it('the buyer also gets the order total; a supplier on the order never does', () => {
        expect(isOrderParty({ sub: 'b1', role: 'CUSTOMER' }, shipment.order)).toBe(true);
        expect(isOrderParty({ sub: 'b2', role: 'CUSTOMER' }, shipment.order)).toBe(false);
        expect(isOrderParty({ sub: 'sup-a', role: 'SUPPLIER' }, shipment.order)).toBe(true);
        expect(isOrderParty({ sub: 'sup-b', role: 'SUPPLIER' }, shipment.order)).toBe(false);
        expect((publicTrackingView(shipment, true, { sub: 'b1', role: 'CUSTOMER' }) as any).order).toEqual({ id: 'o1', status: 'SHIPPED', totalAmount: 504 });
        const sup: any = publicTrackingView(shipment, true, { sub: 'sup-a', role: 'SUPPLIER' });
        expect(sup.orderId).toBe('o1');
        expect(sup).not.toHaveProperty('order');
    });
    it('staff roles', () => {
        expect(isShipmentStaff({ role: 'LOGISTICS' })).toBe(true);
        expect(isShipmentStaff({ role: 'CUSTOMER' })).toBe(false);
        expect(isShipmentStaff(null)).toBe(false);
    });
});

describe('ads by placement', () => {
    const prisma: any = { productPlacement: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', placementType: 'LISTING', product: { id: 'p1' } }]) } };
    const svc = new AdsService(prisma);
    it('unknown placement names return an empty list instead of a database error', async () => {
        await expect(svc.getAdsByPlacement('SPONSORED_PRODUCT')).resolves.toEqual([]);
        await expect(svc.getAdsByPlacement('')).resolves.toEqual([]);
        expect(prisma.productPlacement.findMany).not.toHaveBeenCalled();
    });
    it('known placements load live products only, without the supplier account', async () => {
        await expect(svc.getAdsByPlacement('listing')).resolves.toEqual([{ id: 'a1', placement: 'LISTING', product: { id: 'p1' } }]);
        const arg = prisma.productPlacement.findMany.mock.calls[0][0];
        expect(arg.where).toMatchObject({ placementType: 'LISTING', status: 'ACTIVE', product: { status: 'APPROVED' } });
        expect(arg.include).toEqual({ product: true });
    });
});

describe('errors and downloads', () => {
    it('database client errors are not echoed to the client', () => {
        class PrismaClientValidationError extends Error { name = 'PrismaClientValidationError'; }
        expect(publicErrorMessage(new PrismaClientValidationError('Invalid `prisma.x.findMany()` in /srv/dist/x.js'))).toBe('Internal server error');
        expect(publicErrorMessage(new Error('Seed admin failed: x'))).toBe('Seed admin failed: x');
        expect(publicErrorMessage(undefined)).toBe('Internal server error');
    });
    it('file downloads pass the transform interceptor untouched', async () => {
        const file = new StreamableFile(Buffer.from('{}'));
        const out = await lastValueFrom(new TransformInterceptor().intercept({} as any, { handle: () => of(file) }));
        expect(out).toBe(file);
    });
});
