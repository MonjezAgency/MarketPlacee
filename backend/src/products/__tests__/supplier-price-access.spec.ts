import { PriceHistoryService } from '../price-history.service';
import { ProductsController } from '../products.controller';

/** Suppliers never receive buyer prices from Targets or price history (backend-enforced). */

function historyService() {
    const observations = [{ casePrice: 12.5, observedAt: new Date(Date.now() - 5 * 86_400_000) }, { casePrice: 13.1, observedAt: new Date() }];
    const prisma: any = {
        product: { findUnique: jest.fn(async () => ({ id: 'p1', status: 'APPROVED', supplierId: 'sup-owner', price: 13.1 })) },
        priceObservation: {
            findMany: jest.fn(async () => observations),
            findFirst: jest.fn(async (q: any) => (q?.where?.observedAt?.lt ? null : { observedAt: observations[0].observedAt })),
            create: jest.fn(async () => ({})),
        },
    };
    const svc = new PriceHistoryService(prisma, { notifyUser: jest.fn() } as any);
    jest.spyOn(svc, 'record').mockResolvedValue(null);
    return { svc, prisma };
}

describe('price history access', () => {
    it('a supplier gets no buyer-price history for another supplier’s listing, and nothing is queried', async () => {
        const { svc, prisma } = historyService();
        const out: any = await svc.history('p1', { id: 'sup-other', role: 'SUPPLIER' }, 12);
        expect(out).toEqual({ supplierView: true, reason: expect.any(String) });
        expect(JSON.stringify(out)).not.toMatch(/12\.5|13\.1/);
        expect(prisma.priceObservation.findMany).not.toHaveBeenCalled();
    });
    it('the owning supplier still gets the owner notice, not buyer prices', async () => {
        const { svc } = historyService();
        const out: any = await svc.history('p1', { id: 'sup-owner', role: 'supplier' }, 12);
        expect(out.ownerView).toBe(true);
        expect(out.points).toBeUndefined();
    });
    it('buyers and staff keep the history', async () => {
        for (const role of ['CUSTOMER', 'ADMIN', 'OWNER']) {
            const { svc } = historyService();
            const out: any = await svc.history('p1', { id: 'u1', role }, 12);
            expect(out.points.map((p: any) => p.price)).toEqual([12.5, 13.1]);
            expect(out.latest.price).toBe(13.1);
        }
    });
    it('signed-out visitors are asked to sign in', async () => {
        const { svc } = historyService();
        expect(await svc.history('p1', null, 12)).toEqual({ locked: true, reason: expect.any(String) });
    });
});

describe('targets access', () => {
    const rows = [{ product: { id: 'p1', name: 'Takis Fuego 55g', price: 31.2, basePrice: 31.2, previousPrice: 30, unitsPerCase: 48 }, buyersWatching: 4, approvedOffers: 1 }];
    const controller = () => new ProductsController({ findBuyerTargets: jest.fn(async () => JSON.parse(JSON.stringify(rows))) } as any, null as any, null as any, null as any, null as any, null as any, null as any);
    const priceFree = (out: any[]) => out.every((r) => r.product.price === null && !('basePrice' in r.product) && !('previousPrice' in r.product) && r.product.pricesHidden === true);

    it('suppliers get demand data without buyer prices', async () => {
        const out: any[] = await controller().getBuyerTargets('24', { user: { sub: 's1', role: 'SUPPLIER' } });
        expect(priceFree(out)).toBe(true);
        expect(out[0]).toMatchObject({ buyersWatching: 4, approvedOffers: 1, product: { id: 'p1', name: 'Takis Fuego 55g', unitsPerCase: 48 } });
    });
    it('signed-out visitors get no prices', async () => {
        expect(priceFree(await controller().getBuyerTargets('24', undefined))).toBe(true);
    });
    it('buyers and staff keep the buyer price', async () => {
        for (const role of ['CUSTOMER', 'ADMIN']) {
            const out: any[] = await controller().getBuyerTargets('24', { user: { sub: 'u1', role } });
            expect(out[0].product.price).toBe(31.2);
        }
    });
});
