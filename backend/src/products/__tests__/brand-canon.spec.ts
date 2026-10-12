import { buildBrandCanon, canonicalBrand } from '../brand-canon';

describe('brand canonicalisation', () => {
    const canon = buildBrandCanon([
        { brand: 'Prime', count: 8 }, { brand: 'PRIME', count: 1 },
        { brand: 'Mars ', count: 1 }, { brand: 'MONDELEZ', count: 1 },
        { brand: 'KitKat', count: 2 }, { brand: 'KITKAT', count: 2 },
    ]);
    it('uses the majority spelling', () => {
        expect(canonicalBrand(canon, 'PRIME')).toBe('Prime');
        expect(canonicalBrand(canon, 'prime ')).toBe('Prime');
    });
    it('trims stray whitespace without changing case', () => {
        expect(canonicalBrand(canon, 'Mars ')).toBe('Mars');
        expect(canonicalBrand(canon, 'MONDELEZ')).toBe('MONDELEZ');
    });
    it('prefers the non all-caps spelling on a tie', () => {
        expect(canonicalBrand(canon, 'KITKAT')).toBe('KitKat');
    });
    it('keeps every stored spelling for filtering', () => {
        expect(canon.variants.get('prime')!.sort()).toEqual(['PRIME', 'Prime']);
    });
    it('passes through null and unknown brands', () => {
        expect(canonicalBrand(canon, null)).toBeNull();
        expect(canonicalBrand(canon, 'Lotus ')).toBe('Lotus');
    });
});
