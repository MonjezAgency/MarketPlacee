import { displayBrand, rebrandDeep } from '../brand-display';

describe('brand display (Atlantis → Ali FMCG in stored text)', () => {
    it('rewrites the brand inside stored sentences', () => {
        expect(displayBrand('Every supplier confirmed and Atlantis approved your order.')).toBe('Every supplier confirmed and Ali FMCG approved your order.');
        expect(displayBrand('Atlantis arranges collection')).toBe('Ali FMCG arranges collection');
        expect(displayBrand('Welcome to Atlantis FMCG!')).toBe('Welcome to Ali FMCG!');
        expect(displayBrand('WHY ATLANTIS')).toBe('WHY ALI FMCG');
    });
    it('keeps addresses, codes, exact stored codes and the legal name', () => {
        expect(displayBrand('Write to info@atlantisfmcg.com or visit https://www.atlantisfmcg.com')).toBe('Write to info@atlantisfmcg.com or visit https://www.atlantisfmcg.com');
        expect(displayBrand('ATLANTIS_COLLECTION')).toBe('ATLANTIS_COLLECTION');
        expect(displayBrand('Atlantis')).toBe('Atlantis');
        expect(displayBrand('Invoice from Atlantis FMCG SRL, sold by Atlantis')).toBe('Invoice from Atlantis FMCG SRL, sold by Ali FMCG');
    });
    it('walks nested responses and keeps keys', () => {
        const out = rebrandDeep({ groups: [{ label: 'Atlantis arranges collection', paidTo: 'Atlantis', method: 'ATLANTIS_COLLECTION' }], at: new Date(0) });
        expect(out).toEqual({ groups: [{ label: 'Ali FMCG arranges collection', paidTo: 'Atlantis', method: 'ATLANTIS_COLLECTION' }], at: new Date(0) });
    });
});
