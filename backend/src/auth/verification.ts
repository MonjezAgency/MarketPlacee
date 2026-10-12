import * as crypto from 'crypto';

/**
 * Email-code primitives shared by sign-up verification and change-email.
 * Codes are never stored: only a SHA-256 hash, compared in constant time.
 */
export const CODE_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

export const newCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
export const hashSecret = (raw: string) => crypto.createHash('sha256').update(String(raw)).digest('hex');

export function sameHash(raw: string, storedHash: string | null | undefined): boolean {
    if (!storedHash) return false;
    const a = Buffer.from(hashSecret(String(raw).trim()), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type CodeCheck = 'OK' | 'NO_CODE' | 'EXPIRED' | 'TOO_MANY' | 'WRONG';
export function checkCode(input: string, rec: { hash: string | null | undefined; expiry: Date | null | undefined; attempts: number }, now = Date.now()): CodeCheck {
    if (!rec.hash || !rec.expiry) return 'NO_CODE';
    if (rec.attempts >= MAX_ATTEMPTS) return 'TOO_MANY';
    if (rec.expiry.getTime() < now) return 'EXPIRED';
    if (!/^\d{6}$/.test(String(input || '').trim())) return 'WRONG';
    return sameHash(input, rec.hash) ? 'OK' : 'WRONG';
}

/** Seconds left before another code may be sent (0 = allowed). */
export const cooldownLeft = (sentAt: Date | null | undefined, now = Date.now()) =>
    sentAt ? Math.max(0, Math.ceil((sentAt.getTime() + RESEND_COOLDOWN_MS - now) / 1000)) : 0;

/** Public sign-up may only create these roles. Staff roles are created by admins. */
export function publicRole(raw: unknown): 'CUSTOMER' | 'SUPPLIER' | null {
    const r = String(raw || '').trim().toUpperCase();
    if (r === 'SUPPLIER') return 'SUPPLIER';
    if (r === 'CUSTOMER' || r === 'BUYER') return 'CUSTOMER';
    return null;
}

export const normEmail = (e: unknown) => String(e || '').trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;
