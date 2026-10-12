import { checkGoogleClaims, GoogleTokenError } from '../google-token';

const AUD = ['app-client-id'];
const now = 1_800_000_000;
const ok = { aud: 'app-client-id', iss: 'https://accounts.google.com', exp: String(now + 300), email: 'Buyer@Example.com', email_verified: 'true', sub: '123', name: 'Buyer' };

describe('Google ID token claims', () => {
    it('accepts a valid, verified token and lower-cases the email', () => {
        expect(checkGoogleClaims(ok, AUD, now)).toMatchObject({ email: 'buyer@example.com', sub: '123' });
    });
    it.each([
        ['another app', { aud: 'evil' }],
        ['bad issuer', { iss: 'https://evil.example' }],
        ['expired', { exp: String(now - 1) }],
        ['unverified email', { email_verified: 'false' }],
        ['no email', { email: '' }],
    ])('rejects %s', (_n, patch) => {
        expect(() => checkGoogleClaims({ ...ok, ...patch }, AUD, now)).toThrow(GoogleTokenError);
    });
});
