import { stripPrices, stripPriceList } from '../price-visibility';

describe('anonymous price stripping', () => {
    const p = { id: 'a', name: 'Orbit', brand: 'Mars', price: 225, basePrice: 150, previousPrice: 165, priceChangedAt: 'x', variantPrices: { A: 1 }, tieredPrices: [{ price: 1 }], activeOffer: { discountPercent: 10 }, stock: 5 };
    it('removes every commercial price field but keeps catalog data', () => {
        const s: any = stripPrices(p);
        expect(s.price).toBeNull();
        for (const k of ['basePrice', 'previousPrice', 'priceChangedAt', 'variantPrices', 'tieredPrices', 'activeOffer']) expect(s).not.toHaveProperty(k);
        expect(s).toMatchObject({ id: 'a', name: 'Orbit', brand: 'Mars', stock: 5, pricesHidden: true });
        expect(JSON.stringify(s)).not.toMatch(/225|150|165/);
    });
    it('does not mutate the source and handles lists / empties', () => {
        stripPriceList([p]);
        expect(p.price).toBe(225);
        expect(stripPrices(null)).toBeNull();
    });
});
