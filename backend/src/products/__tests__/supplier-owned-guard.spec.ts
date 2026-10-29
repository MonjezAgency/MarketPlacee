import { ForbiddenException } from '@nestjs/common';
import { ProductsController } from '../products.controller';

/**
 * Supplier-owned product data is edited only by its supplier: staff can't
 * overwrite fields, override the status, resubmit, change variant stock or
 * create products under a supplier's account. Ali FMCG Catalog products
 * (owned by staff accounts) stay editable by staff.
 */
function setup(ownerRole: string) {
    const prisma: any = {
        product: { findUnique: jest.fn(async () => ({ supplier: { role: ownerRole } })) },
        user: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, role: ownerRole })) },
    };
    const products: any = {
        update: jest.fn(async () => ({ ok: true })),
        updateStatus: jest.fn(async () => ({ ok: true })),
        resendForReview: jest.fn(async () => ({ ok: true })),
        setVariantStock: jest.fn(async () => ({ ok: true })),
        brandCatalogFor: jest.fn(async () => ({ entries: [], byKey: new Map() })),
        supplierUpdate: jest.fn(async () => ({ ok: true })),
        create: jest.fn(async () => ({ id: 'new', status: 'APPROVED' })),
    };
    const ai: any = { categorizeProduct: jest.fn(async () => null) };
    const ctrl = new ProductsController(products, {} as any, {} as any, {} as any, ai, {} as any, prisma);
    return { ctrl, products };
}
const admin = { user: { sub: 'admin-1', role: 'ADMIN' } };
const owner = { user: { sub: 'owner-1', role: 'OWNER' } };

describe('staff and supplier-owned products', () => {
    it('refuses staff edits, status overrides, resubmission and variant stock on a supplier product', async () => {
        const { ctrl, products } = setup('SUPPLIER');
        for (const [call, req] of [
            [() => ctrl.update('p1', { name: 'Overwritten' }, admin), admin],
            [() => ctrl.updateStatus('p1', { status: 'APPROVED' as any }, owner), owner],
            [() => ctrl.resend('p1', admin), admin],
            [() => ctrl.setVariantStock('p1', { signature: 'Size=L', stock: 1 }, admin), admin],
        ] as const) {
            void req;
            await expect((call as any)()).rejects.toMatchObject({ response: { code: 'SUPPLIER_OWNED' } });
        }
        expect(products.update).not.toHaveBeenCalled();
        expect(products.updateStatus).not.toHaveBeenCalled();
        expect(products.resendForReview).not.toHaveBeenCalled();
        expect(products.setVariantStock).not.toHaveBeenCalled();
    });
    it('refuses creating a product under a supplier account', async () => {
        const { ctrl, products } = setup('SUPPLIER');
        await expect(ctrl.create({ name: 'X', category: 'Snacks', supplierId: 'sup-1' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
        expect(products.create).not.toHaveBeenCalled();
    });
    it('lets staff edit and change the status of Ali FMCG Catalog products', async () => {
        const { ctrl, products } = setup('OWNER');
        await expect(ctrl.update('p1', { name: 'Catalog name', category: 'Snacks' }, admin)).resolves.toEqual({ ok: true });
        await expect(ctrl.updateStatus('p1', { status: 'DRAFT' as any }, admin)).resolves.toEqual({ ok: true });
        expect(products.update).toHaveBeenCalled();
        expect(products.updateStatus).toHaveBeenCalledWith('p1', 'DRAFT', undefined, { id: 'admin-1', role: 'ADMIN' });
    });
    it('leaves supplier self-edits to the ownership checks in the service', async () => {
        const { ctrl, products } = setup('SUPPLIER');
        await ctrl.update('p1', { name: 'Mine' }, { user: { sub: 'sup-1', role: 'SUPPLIER' } });
        expect(products.supplierUpdate).toHaveBeenCalledWith('p1', 'sup-1', { name: 'Mine' }, { submit: false });
    });
});
