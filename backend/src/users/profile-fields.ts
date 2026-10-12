/**
 * The only profile fields a user may change on their own account.
 * Role, status, email, password, verification and banking fields are never
 * accepted here (they have dedicated, audited flows).
 */
const PHONE_RE = /^\+?\d{8,15}$/;
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#][^\s]*)?$/i;

export class ProfileFieldError extends Error {}

const text = (v: unknown, max: number, label: string) => {
    if (v === null) return null;
    const s = String(v ?? '').trim().replace(/\s+/g, ' ');
    if (s.length > max) throw new ProfileFieldError(`${label} is too long (max ${max} characters).`);
    return s || null;
};

export function cleanProfile(body: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const has = (k: string) => body && Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;
    if (has('name')) { const n = text(body.name, 120, 'Name'); if (!n) throw new ProfileFieldError('Name is required.'); out.name = n; }
    if (has('companyName')) { const c = text(body.companyName, 160, 'Company name'); if (!c) throw new ProfileFieldError('Company name is required.'); out.companyName = c; }
    if (has('phone')) {
        const p = body.phone === null ? '' : String(body.phone).replace(/[\s()-]/g, '');
        if (p && !PHONE_RE.test(p)) throw new ProfileFieldError('Phone must be 8–15 digits, optionally starting with +.');
        out.phone = p || null;
    }
    if (has('website')) {
        const w = text(body.website, 200, 'Website');
        if (w && !URL_RE.test(w)) throw new ProfileFieldError('Enter a website like company.com.');
        out.website = w;
    }
    if (has('country')) out.country = text(body.country, 60, 'Country');
    if (has('businessCity')) out.businessCity = text(body.businessCity, 80, 'City');
    if (has('businessType')) out.businessType = text(body.businessType, 60, 'Business type');
    if (has('avatar')) {
        const a = body.avatar === null ? null : String(body.avatar);
        if (a && a.length > 4_000_000) throw new ProfileFieldError('Image is too large.');
        out.avatar = a;
    }
    return out;
}

/** Brand preference list: trimmed, de-duplicated case-insensitively, bounded. */
export function cleanBrands(raw: unknown): string[] {
    if (!Array.isArray(raw)) throw new ProfileFieldError('Brands must be a list.');
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of raw) {
        const s = String(b ?? '').trim().replace(/\s+/g, ' ');
        if (!s) continue;
        if (s.length > 60) throw new ProfileFieldError('A brand name is too long.');
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k); out.push(s);
    }
    if (out.length > 150) throw new ProfileFieldError('Choose up to 150 brands.');
    return out;
}
