import { linesFromOrderItems, variantKeyOf, cleanQty } from '../list-lines';

describe('shopping list lines', () => {
    it('builds a stable variant key, ignoring internal groups', () => {
        expect(variantKeyOf({ Size: 'L', Flavour: 'Grape', __translations: 'x' })).toBe('Flavour=Grape|Size=L');
        expect(variantKeyOf(null)).toBe('');
    });
    it('copies normal order lines with their tier', () => {
        const l = linesFromOrderItems([{ productId: 'a', quantity: 3, selectedTier: 'pallet', selectedVariants: { Flavour: 'Ice' } }]);
        expect(l).toEqual([{ productId: 'a', variantKey: 'Flavour=Ice', selectedVariants: { Flavour: 'Ice' }, tier: 'pallet', quantity: 3 }]);
    });
    it('expands a mixed load into its real products', () => {
        const l = linesFromOrderItems([{ productId: null, mixedLoadId: 'm', quantity: 1, mixComposition: [
            { productId: 'a', variant: null, quantity: 2, unit: 'pallet' },
            { productId: 'b', variant: 'Flavour=Grape', quantity: 1, unit: 'pallet' },
        ] }]);
        expect(l.map((x) => [x.productId, x.variantKey, x.tier, x.quantity])).toEqual([['a', '', 'pallet', 2], ['b', 'Flavour=Grape', 'pallet', 1]]);
    });
    it('merges duplicates instead of creating two rows', () => {
        const l = linesFromOrderItems([{ productId: 'a', quantity: 2, selectedTier: 'carton' }, { productId: 'a', quantity: 5, selectedTier: 'carton' }]);
        expect(l).toHaveLength(1);
        expect(l[0].quantity).toBe(7);
    });
    it('skips deleted products and bad quantities', () => {
        expect(linesFromOrderItems([{ productId: null, quantity: 2 }, { productId: 'a', quantity: 0 }])).toEqual([]);
        expect(cleanQty('abc')).toBe(0);
        expect(cleanQty(1e9)).toBe(100000);
    });
});
