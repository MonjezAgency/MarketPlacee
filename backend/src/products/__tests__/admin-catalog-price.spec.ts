import { SupplierUpdatesService, UPDATE_COLUMNS } from '../supplier-updates.service';
import { AdminCatalogController } from '../admin-catalog.controller';

/**
 * Ali FMCG Catalog price updates: the same rules as a supplier changing their own
 * price (ProductsService.supplierUpdate), applied as the product's staff owner.
 * Supplier products are never touched.
 */
const CATALOG = [
    { id: 'c-1', supplierId: 'owner-1', ean: '8000070025400', name: 'House Blend', status: 'APPROVED', basePrice: 48, stock: 120, supplierCurrency: 'EUR', supplierPrice: 48 },
    { id: 'c-2', supplierId: 'admin-2', ean: '3179730004217', name: 'Sparkling', status: 'DRAFT', basePrice: 11, stock: 0, supplierCurrency: 'RON', supplierPrice: 55 },
];
const H = UPDATE_COLUMNS.map((c) => c.header);
const row = (o: Partial<Record<string, string>>) => H.map((h) => o[h] ?? '');

describe('price & stock file, Ali FMCG Catalog mode', () => {
    function setup() {
        const prisma: any = { product: { findMany: jest.fn(async ({ where }: any) => CATALOG.filter((p) => (where.supplierId?.in ?? [where.supplierId]).includes(p.supplierId))) } };
        const products: any = { supplierUpdate: jest.fn(async (id: string, _o: string, patch: any) => ({ id, status: 'APPROVED', ...patch })) };
        const notifications: any = { notifyUser: jest.fn(async () => ({})) };
        return { svc: new SupplierUpdatesService(prisma, products, notifications), products, notifications };
    }
    it('matches staff-owned products only and saves each row as its own owner', async () => {
        const { svc, products, notifications } = setup();
        const out = await svc.commit(['owner-1', 'admin-2'], { headers: H, rows: [row({ 'Ali FMCG ID': 'c-1', 'New Price per Case': '49.5' }), row({ EAN: '3179730004217', 'New Stock (cases)': '30' }), row({ EAN: '5449000000996', 'New Price per Case': '1' })] });
        expect(out.summary).toEqual({ total: 3, updated: 2, unchanged: 0, failed: 1 }); // a barcode not in the catalog is never matched elsewhere
        expect(products.supplierUpdate).toHaveBeenCalledWith('c-1', 'owner-1', expect.objectContaining({ supplierCurrency: 'EUR', supplierPrice: 49.5 }), {});
        expect(products.supplierUpdate).toHaveBeenCalledWith('c-2', 'admin-2', expect.objectContaining({ stock: 30 }), {});
        expect(notifications.notifyUser).not.toHaveBeenCalled();
    });
});

describe('PATCH /admin-catalog/products/:id/price', () => {
    function setup(ownerRole = 'OWNER', unitsPerCase: number | null = 12) {
        const prisma: any = {
            product: { findUnique: jest.fn(async ({ select }: any) => (select.price ? { price: 54.45 } : { id: 'c-1', supplierId: 'owner-1', unitsPerCase, supplierCurrency: 'EUR', supplier: { role: ownerRole } })) },
        };
        const products: any = { supplierUpdate: jest.fn(async (id: string, _o: string, patch: any) => ({ id, status: 'APPROVED', basePrice: patch.supplierPrice, ...patch })) };
        const ctrl = new AdminCatalogController({} as any, { providers: [] } as any, prisma, {} as any, products);
        return { ctrl, products };
    }
    const req = { user: { sub: 'admin-1', role: 'ADMIN' } };
    it('sets the net price per case in the chosen currency through the supplier rules; the buyer price comes back from the server', async () => {
        const { ctrl, products } = setup();
        const out = await ctrl.updatePrice('c-1', { price: '49.50', currency: 'eur', basis: 'case' }, req);
        expect(products.supplierUpdate).toHaveBeenCalledWith('c-1', 'owner-1', { supplierCurrency: 'EUR', supplierPrice: 49.5, changeReason: 'Price updated by Ali FMCG (admin)' }, {});
        expect(out).toMatchObject({ supplierPrice: 49.5, supplierCurrency: 'EUR', buyerPrice: 54.45 });
    });
    it('converts a piece price to the case price with pieces per case', async () => {
        const { ctrl, products } = setup();
        await ctrl.updatePrice('c-1', { price: 4.125, currency: 'EUR', basis: 'piece' }, req);
        expect(products.supplierUpdate.mock.calls[0][2].supplierPrice).toBe(49.5);
    });
    it('refuses bad input and supplier products without saving anything', async () => {
        const { ctrl, products } = setup();
        for (const body of [{ price: 0 }, { price: -3 }, { price: 'abc' }, { price: 10, currency: 'XYZ' }, { price: 10, basis: 'pallet' }]) {
            await expect(ctrl.updatePrice('c-1', body as any, req)).rejects.toMatchObject({ status: 400 });
        }
        await expect(setup('OWNER', null).ctrl.updatePrice('c-1', { price: 2, basis: 'piece' }, req)).rejects.toMatchObject({ response: { code: 'NO_PACK' } });
        const sup = setup('SUPPLIER');
        await expect(sup.ctrl.updatePrice('c-1', { price: 10 }, req)).rejects.toMatchObject({ response: { code: 'SUPPLIER_OWNED' } });
        expect(products.supplierUpdate).not.toHaveBeenCalled();
        expect(sup.products.supplierUpdate).not.toHaveBeenCalled();
    });
});
