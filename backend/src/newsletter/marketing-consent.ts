/**
 * Marketing consent rules (pure, no database). The one place that decides
 * whether an address may receive a marketing email; MarketingConsentService
 * loads the facts and every marketing send path asks it right before sending.
 *
 * Sendable only with a recorded basis and no suppression:
 *   FORM_DOUBLE_OPT_IN  the person confirmed a newsletter sign-up (confirmedAt)
 *   LEGACY_FORM         an ACTIVE sign-up from the website form made before
 *                       confirmation emails existed (the row and its date are the record)
 *   ADMIN_RECORDED      an admin entered the basis (consentEvidence) — recorded with who and when
 *   ACCOUNT_SETTING     the account holder switched "marketing emails" on in their own settings
 * Imported and manually added contacts without one of these are never sendable.
 */

export type ConsentBasis = 'FORM_DOUBLE_OPT_IN' | 'LEGACY_FORM' | 'ADMIN_RECORDED' | 'ACCOUNT_SETTING';
export type Exclusion =
    | 'INVALID_EMAIL' | 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED' | 'BLOCKED' | 'ARCHIVED'
    | 'PENDING_CONFIRMATION' | 'NO_CONSENT' | 'ACCOUNT_CLOSED';
export const EXCLUSIONS: Exclusion[] = ['UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED', 'BLOCKED', 'ARCHIVED', 'PENDING_CONFIRMATION', 'NO_CONSENT', 'ACCOUNT_CLOSED', 'INVALID_EMAIL'];

export interface ContactFacts {
    status: string;                    // ACTIVE | PENDING | UNSUBSCRIBED | BOUNCED | BLOCKED | HIDDEN
    confirmedAt?: Date | string | null;
    consentAt?: Date | string | null;
    consentSource?: string | null;
    consentBasis?: string | null;
    consentEvidence?: string | null;
    source?: string | null;
}
export interface AccountFacts { status?: string | null; role?: string | null; marketingOptIn: boolean }
export interface SuppressionFacts { reason: string; liftedAt?: Date | string | null; accountPrefCleared?: boolean | null }

/** eligible → basis is set; not eligible → reason is set. (Flat shape: the backend compiles without strictNullChecks.) */
export interface Decision { eligible: boolean; basis?: ConsentBasis; reason?: Exclusion; reoptInByAccount?: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function normalizeEmail(e: unknown): string { return String(e ?? '').trim().toLowerCase(); }
export function isValidEmail(e: string): boolean { return e.length > 0 && e.length <= 254 && EMAIL_RE.test(e); }
/** "ab***@example.com" — for logs and API answers that must not echo addresses. */
export function maskEmail(e: unknown): string { return String(e ?? '').replace(/^(.{1,2})[^@]*@/, '$1***@'); }

const CLOSED_ACCOUNT = new Set(['SUSPENDED', 'BANNED', 'DELETED', 'DEACTIVATED', 'BLOCKED', 'REJECTED']);
const IMPORT_LIKE = /import|bulk|upload|manual|admin|csv|excel|suppression|unsubscribe/i;
const FORM_LIKE = /footer|homepage|home|website|site|form|signup|sign-up|newsletter|landing|popup|blog/i;

/** Where a contact came from, for labels: SIGNUP, MANUAL, IMPORTED or UNKNOWN. */
export function contactOrigin(c: Pick<ContactFacts, 'source' | 'consentSource'>): 'SIGNUP' | 'MANUAL' | 'IMPORTED' | 'UNKNOWN' {
    const s = `${c.source || ''}`.toLowerCase();
    if (s === 'manual') return 'MANUAL';
    if (s === 'import' || /import|bulk|upload|csv/.test(s) || c.consentSource === 'admin import') return 'IMPORTED';
    if (s === 'website_form' || FORM_LIKE.test(s)) return 'SIGNUP';
    return 'UNKNOWN';
}

/** The recorded basis a contact row carries, if any (ignoring suppression). */
export function contactBasis(c: ContactFacts): ConsentBasis | null {
    if (c.status !== 'ACTIVE') return null;
    if (c.confirmedAt) return 'FORM_DOUBLE_OPT_IN';
    if (c.consentBasis === 'ADMIN_RECORDED' && String(c.consentEvidence || '').trim()) return 'ADMIN_RECORDED';
    if (c.consentBasis) return null; // NONE or an unknown value
    // Older rows: a website-form sign-up kept as ACTIVE, never an import.
    if (c.consentSource === 'admin import') return null;
    const src = `${c.source || ''} ${c.consentSource || ''}`;
    if (FORM_LIKE.test(src) && !IMPORT_LIKE.test(c.source || '')) return 'LEGACY_FORM';
    return null;
}

const SUPPRESSION_REASON: Record<string, Exclusion> = { UNSUBSCRIBED: 'UNSUBSCRIBED', BOUNCED: 'BOUNCED', COMPLAINED: 'COMPLAINED', BLOCKED: 'BLOCKED' };

export function decide(input: { email: string; contact?: ContactFacts | null; account?: AccountFacts | null; suppression?: SuppressionFacts | null }): Decision {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) return { eligible: false, reason: 'INVALID_EMAIL' };
    const { contact, account, suppression } = input;
    const accountOpen = !!account && !CLOSED_ACCOUNT.has(String(account.status || '').toUpperCase());
    const accountOptIn = !!account && accountOpen && account.marketingOptIn === true;

    if (suppression && !suppression.liftedAt) {
        // The only way back after an unsubscribe without a new sign-up: the
        // person switched marketing on again in their own account, after the
        // unsubscribe had switched it off.
        if (suppression.reason === 'UNSUBSCRIBED' && suppression.accountPrefCleared && accountOptIn) {
            return { eligible: true, basis: 'ACCOUNT_SETTING', reoptInByAccount: true };
        }
        return { eligible: false, reason: SUPPRESSION_REASON[suppression.reason] || 'BLOCKED' };
    }
    if (contact) {
        if (contact.status === 'UNSUBSCRIBED') return { eligible: false, reason: 'UNSUBSCRIBED' };
        if (contact.status === 'BOUNCED') return { eligible: false, reason: 'BOUNCED' };
        if (contact.status === 'BLOCKED') return { eligible: false, reason: 'BLOCKED' };
        if (contact.status === 'HIDDEN') return { eligible: false, reason: 'ARCHIVED' };
        const basis = contactBasis(contact);
        if (basis) return { eligible: true, basis };
    }
    if (accountOptIn) return { eligible: true, basis: 'ACCOUNT_SETTING' };
    if (contact?.status === 'PENDING') return { eligible: false, reason: 'PENDING_CONFIRMATION' };
    if (account && !accountOpen && !contact) return { eligible: false, reason: 'ACCOUNT_CLOSED' };
    return { eligible: false, reason: 'NO_CONSENT' };
}

/** Marketing preference stored on the account (opt-in: only an explicit true counts). */
export function accountOptedIn(prefs: unknown): boolean {
    return !!prefs && typeof prefs === 'object' && (prefs as Record<string, unknown>).marketingEmails === true;
}
