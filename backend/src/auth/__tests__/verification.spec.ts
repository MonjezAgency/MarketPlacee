import { newCode, hashSecret, checkCode, cooldownLeft, publicRole, MAX_ATTEMPTS, CODE_TTL_MS } from '../verification';

describe('email verification primitives', () => {
    it('makes 6-digit codes and never needs the raw code stored', () => {
        for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
        expect(hashSecret('123456')).toHaveLength(64);
        expect(hashSecret('123456')).not.toContain('123456');
    });
    const rec = (over: any = {}) => ({ hash: hashSecret('482913'), expiry: new Date(Date.now() + CODE_TTL_MS), attempts: 0, ...over });
    it('accepts the right code only', () => {
        expect(checkCode('482913', rec())).toBe('OK');
        expect(checkCode(' 482913 ', rec())).toBe('OK');
        expect(checkCode('482914', rec())).toBe('WRONG');
        expect(checkCode('abc', rec())).toBe('WRONG');
    });
    it('rejects expired, exhausted and missing codes', () => {
        expect(checkCode('482913', rec({ expiry: new Date(Date.now() - 1) }))).toBe('EXPIRED');
        expect(checkCode('482913', rec({ attempts: MAX_ATTEMPTS }))).toBe('TOO_MANY');
        expect(checkCode('482913', rec({ hash: null }))).toBe('NO_CODE');
    });
    it('enforces the resend cooldown', () => {
        const now = Date.now();
        expect(cooldownLeft(null, now)).toBe(0);
        expect(cooldownLeft(new Date(now - 10_000), now)).toBe(50);
        expect(cooldownLeft(new Date(now - 61_000), now)).toBe(0);
    });
    it('never lets public sign-up pick a staff role', () => {
        expect(publicRole('customer')).toBe('CUSTOMER');
        expect(publicRole('buyer')).toBe('CUSTOMER');
        expect(publicRole('SUPPLIER')).toBe('SUPPLIER');
        for (const r of ['ADMIN', 'owner', 'MODERATOR', 'support', '', undefined, 'DEVELOPER']) expect(publicRole(r)).toBeNull();
    });
});
