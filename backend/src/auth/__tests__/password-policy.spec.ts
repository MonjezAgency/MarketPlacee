import { checkPassword } from '../password-policy';

describe('password policy', () => {
    it.each([
        ['short', 'Ab1!xyz'],
        ['two classes only', 'abcdefghijkl1'],
        ['common', 'Password1234'],
        ['predictable sequence', 'Qwertyuiop12!'],
        ['repeated', 'aaaaaaaaaaaa1A'],
        ['trailing space', 'Tr4ck-Pallet-9 '],
    ])('rejects %s', (_n, pw) => expect(checkPassword(pw).ok).toBe(false));
    it('rejects passwords built from the email or name', () => {
        expect(checkPassword('Danabuyer2026!', { email: 'danabuyer@x.com' }).ok).toBe(false);
        expect(checkPassword('Wholesale-Dana-77', { name: 'Dana Moretti' }).ok).toBe(false);
    });
    it('accepts strong passphrases and scores them', () => {
        const r = checkPassword('Pallet-Route-77', { email: 'a@b.c', name: 'Al B' });
        expect(r.ok).toBe(true);
        expect(r.score).toBe(2);
        expect(checkPassword('Seven-Trucks-East-2026').score).toBe(3);
    });
});
