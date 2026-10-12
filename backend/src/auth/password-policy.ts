/**
 * Password policy for NEW passwords (sign-up, reset, change). Existing
 * passwords keep working: login never re-validates them.
 *  - 12+ characters, at least 3 of: lower, upper, digit, symbol
 *  - not a common/breached-style password, not built from the email or name
 *  - no leading/trailing spaces (login trims input, so they would never match)
 */
const COMMON = new Set(`123456789012 1234567890123 password1234 password12345 password123! passw0rd1234 qwerty123456 qwertyuiop12 qwertyuiop123 iloveyou1234 welcome12345 welcome2024! welcome2025! welcome2026! admin1234567 administrator letmein12345 changeme1234 abc123456789 football1234 baseball1234 monkey123456 dragon123456 sunshine1234 princess1234 trustno11234 superman1234 starwars1234 aa1234567890 1q2w3e4r5t6y 1qaz2wsx3edc zaq12wsx3edc q1w2e3r4t5y6 asdfghjkl123 zxcvbnm12345 password!234 p@ssw0rd1234 p@ssword1234 summer2024!! winter2024!! spring2024!! autumn2024!! company12345 atlantis1234 atlantisfmcg wholesale123 marketplace1`.split(' '));

export interface PasswordCheck { ok: boolean; score: 0 | 1 | 2 | 3; problems: string[] }

export function checkPassword(pw: string, ctx: { email?: string; name?: string } = {}): PasswordCheck {
    const p = String(pw ?? '');
    const problems: string[] = [];
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
    if (p.length < 12) problems.push('Use at least 12 characters.');
    if (p.length > 128) problems.push('Use at most 128 characters.');
    if (classes < 3) problems.push('Mix at least three of: lower-case, upper-case, numbers, symbols.');
    if (p !== p.trim()) problems.push('Don’t start or end with a space.');
    const low = p.toLowerCase();
    const squashed = low.replace(/[^a-z0-9]/g, '');
    if (COMMON.has(low) || /^(.)\1{5,}/.test(p) || /(0123456|1234567|abcdefg|qwertyu|password)/.test(squashed)) problems.push('Avoid common or predictable passwords.');
    const local = String(ctx.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (local.length >= 4 && squashed.includes(local)) problems.push('Don’t use your email address in the password.');
    const nameParts = String(ctx.name || '').toLowerCase().split(/\s+/).filter((n) => n.length >= 4);
    if (nameParts.some((n) => squashed.includes(n.replace(/[^a-z0-9]/g, '')))) problems.push('Don’t use your name in the password.');
    const score = (problems.length ? (p.length >= 8 && classes >= 2 ? 1 : 0) : p.length >= 16 && classes >= 3 ? 3 : 2) as PasswordCheck['score'];
    return { ok: problems.length === 0, score, problems };
}
