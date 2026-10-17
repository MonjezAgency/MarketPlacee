import { TargetPricesService } from '../target-prices.service';

/** Target-price requests: the optional delivery country is one country from the shared list, never guessed. */

function service() {
    const product = { id: 'p1', status: 'APPROVED', supplierId: 'sup-1', name: 'Takis Fuego 55g', unitsPerCase: 48, casesPerPallet: 96, palletsPerShipment: 33, moq: 1, moqUnit: 'CASE', basePrice: 30 };
    const created: any[] = [];
    const prisma: any = {
        product: { findUnique: jest.fn(async () => product) },
        appConfig: { findMany: jest.fn(async () => []) },
        targetPriceRequest: {
            findUnique: jest.fn(async () => null),
            findFirst: jest.fn(async () => null),
            create: jest.fn(async ({ data }: any) => { const row = { id: 'tp1', createdAt: new Date(), updatedAt: new Date(), product, ...data }; created.push(row); return row; }),
        },
    };
    const svc = new TargetPricesService(prisma, { notifyAdmins: jest.fn(async () => undefined) } as any, {} as any);
    return { svc, created };
}

const base = { productId: 'p1', price: 25, quantity: 1, quantityUnit: 'PALLET' as const };
const buyer = { id: 'buyer-1', role: 'CUSTOMER' };

describe('target price delivery country', () => {
    it('stores an ISO code and returns it to the buyer', async () => {
        const { svc, created } = service();
        const out: any = await svc.create(buyer, { ...base, deliveryCountry: 'it' });
        expect(created[0].deliveryCountry).toBe('IT');
        expect(out.deliveryCountry).toBe('IT');
        expect(out.quantityCases).toBe(96);
    });
    it('accepts a country name and stores its code', async () => {
        const { svc, created } = service();
        await svc.create(buyer, { ...base, deliveryCountry: 'Romania' });
        expect(created[0].deliveryCountry).toBe('RO');
    });
    it('is optional', async () => {
        const { svc, created } = service();
        const out: any = await svc.create(buyer, { ...base });
        expect(created[0].deliveryCountry).toBeNull();
        expect(out.deliveryCountry).toBeNull();
    });
    it('refuses something that is not one country', async () => {
        for (const bad of ['Bucharest, Romania', 'Narnia', 'EU']) {
            const { svc, created } = service();
            await expect(svc.create(buyer, { ...base, deliveryCountry: bad })).rejects.toThrow('Choose the delivery country from the list.');
            expect(created).toHaveLength(0);
        }
    });
    it('still refuses the product’s own supplier', async () => {
        const { svc } = service();
        await expect(svc.create({ id: 'sup-1', role: 'SUPPLIER' }, { ...base, deliveryCountry: 'IT' })).rejects.toThrow('own product');
    });
});
