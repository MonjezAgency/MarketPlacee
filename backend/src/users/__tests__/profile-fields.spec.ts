import { cleanProfile, cleanBrands } from '../profile-fields';

describe('self-service profile fields', () => {
    it('drops anything outside the whitelist (no role/status/email/password)', () => {
        const out = cleanProfile({ name: 'Dana', role: 'OWNER', status: 'ACTIVE', email: 'x@y.z', password: 'p', emailVerified: true, iban: 'x' } as any);
        expect(out).toEqual({ name: 'Dana' });
    });
    it('validates and normalises', () => {
        expect(cleanProfile({ phone: '+40 712 345 678', website: 'monjez.com', country: '  Romania ' })).toEqual({ phone: '+40712345678', website: 'monjez.com', country: 'Romania' });
        expect(() => cleanProfile({ phone: '12' })).toThrow();
        expect(() => cleanProfile({ website: 'not a site' })).toThrow();
        expect(() => cleanProfile({ companyName: '  ' })).toThrow();
        expect(cleanProfile({ website: '' })).toEqual({ website: null });
    });
    it('cleans brand lists', () => {
        expect(cleanBrands([' Milka ', 'milka', 'Lavazza', '', 'Coca-Cola'])).toEqual(['Milka', 'Lavazza', 'Coca-Cola']);
        expect(() => cleanBrands('Milka' as any)).toThrow();
        expect(() => cleanBrands(['x'.repeat(61)])).toThrow();
    });
});
