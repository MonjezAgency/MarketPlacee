import axios from 'axios';

/**
 * Google sign-in must be proven by a Google-signed ID token, verified here on
 * the server. The email in the request body is never trusted.
 */
// Public OAuth client id of the Ali FMCG web app (it appears in every Google
// redirect URL; not a secret). GOOGLE_CLIENT_IDS can add/override others.
const DEFAULT_CLIENT_IDS = ['1019170641470-u17pm1ribq6lv91n5bi8v5glqhvlqsrg.apps.googleusercontent.com'];
export const allowedGoogleAudiences = () =>
    [...new Set([...(process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '').split(','), ...DEFAULT_CLIENT_IDS].map((s) => s.trim()).filter(Boolean))];

export interface GoogleIdentity { email: string; name: string; picture: string | null; sub: string }

export class GoogleTokenError extends Error {}

/** Pure claim checks on a tokeninfo response (signature/expiry are verified by Google). */
export function checkGoogleClaims(c: any, audiences: string[], nowSec = Math.floor(Date.now() / 1000)): GoogleIdentity {
    if (!c || typeof c !== 'object') throw new GoogleTokenError('Invalid Google token.');
    if (!audiences.includes(String(c.aud))) throw new GoogleTokenError('Google token was issued for another app.');
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(String(c.iss))) throw new GoogleTokenError('Invalid Google token issuer.');
    if (!(Number(c.exp) > nowSec)) throw new GoogleTokenError('Google sign-in expired. Try again.');
    if (!(c.email_verified === true || c.email_verified === 'true')) throw new GoogleTokenError('Your Google email address isn’t verified.');
    const email = String(c.email || '').trim().toLowerCase();
    if (!email || !c.sub) throw new GoogleTokenError('Google didn’t share an email address.');
    return { email, name: String(c.name || email.split('@')[0]).slice(0, 120), picture: c.picture ? String(c.picture) : null, sub: String(c.sub) };
}

/** Verify with Google (checks signature + expiry), then apply our claim checks. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
    if (!idToken || typeof idToken !== 'string' || idToken.split('.').length !== 3) throw new GoogleTokenError('Missing Google ID token.');
    let claims: any;
    try {
        const res = await axios.get('https://oauth2.googleapis.com/tokeninfo', { params: { id_token: idToken }, timeout: 8000, validateStatus: () => true });
        if (res.status !== 200) throw new GoogleTokenError('Google rejected the sign-in token.');
        claims = res.data;
    } catch (e) {
        if (e instanceof GoogleTokenError) throw e;
        throw new GoogleTokenError('Couldn’t reach Google to verify sign-in. Try again.');
    }
    return checkGoogleClaims(claims, allowedGoogleAudiences());
}
