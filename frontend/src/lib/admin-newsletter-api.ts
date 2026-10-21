import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/supplier-api';

/**
 * Admin → Newsletter Hub. Backend: backend/src/newsletter (OWNER/ADMIN on every
 * /newsletter/admin route). Who may receive marketing is decided only by the
 * server (newsletter/marketing-consent.ts); this client never computes it.
 */

export type ContactStatus = 'ACTIVE' | 'PENDING' | 'UNSUBSCRIBED' | 'BOUNCED' | 'BLOCKED' | 'HIDDEN';
export type ContactKind = 'ACCOUNT' | 'SIGNUP' | 'MANUAL' | 'IMPORTED' | 'UNKNOWN';
export type ConsentBasis = 'FORM_DOUBLE_OPT_IN' | 'LEGACY_FORM' | 'ADMIN_RECORDED' | 'ACCOUNT_SETTING';
export type Exclusion = 'INVALID_EMAIL' | 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED' | 'BLOCKED' | 'ARCHIVED' | 'PENDING_CONFIRMATION' | 'NO_CONSENT' | 'ACCOUNT_CLOSED' | 'SUPPLIER_PRICE_PRIVACY' | 'NON_PRODUCTION';
export const EXCLUSIONS: Exclusion[] = ['NO_CONSENT', 'PENDING_CONFIRMATION', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED', 'BLOCKED', 'ARCHIVED', 'ACCOUNT_CLOSED', 'INVALID_EMAIL', 'SUPPLIER_PRICE_PRIVACY', 'NON_PRODUCTION'];
export const CONTACT_STATUSES: ContactStatus[] = ['ACTIVE', 'PENDING', 'UNSUBSCRIBED', 'BOUNCED', 'BLOCKED', 'HIDDEN'];
export const CONTACT_KINDS: ContactKind[] = ['ACCOUNT', 'SIGNUP', 'MANUAL', 'IMPORTED', 'UNKNOWN'];

export interface ContactRow {
    id: string; email: string; name: string | null; company: string | null; region: string | null; source: string | null;
    origin: Exclude<ContactKind, 'ACCOUNT'>; kind: ContactKind; status: ContactStatus;
    eligible: boolean; basis: ConsentBasis | null; reason: Exclusion | null;
    consentBasis: string | null; consentEvidence: string | null; consentRecordedAt: string | null;
    consentAt: string | null; consentSource: string | null; confirmedAt: string | null; unsubscribedAt: string | null;
    suppression: { reason: string; source: string | null; at: string } | null;
    createdAt: string; updatedAt: string; lastImportedAt: string | null;
    account: { id: string; name: string | null; companyName: string | null; role: string; status: string; createdAt: string; emailVerified: boolean } | null;
}
export interface ContactDetail extends ContactRow { events: { type: string; source: string | null; at: string; campaignId: string | null; offerId: string | null }[] }
export interface ContactList {
    rows: ContactRow[]; total: number; page: number; pageSize: number;
    summary: { contacts: number; eligible: number; byReason: Partial<Record<Exclusion, number>>; byKind: Partial<Record<ContactKind, number>>; accountOptInsWithoutContact: number };
    facets: { sources: string[]; regions: string[] };
}
export type BulkContactAction = 'block' | 'unblock' | 'archive' | 'restore' | 'delete';
export interface BulkContactResult { action: BulkContactAction; done: number; skipped: { id: string; email: string; reason: string }[] }

export interface ImportMapping { email: number | null; name: number | null; company: number | null; region: number | null }
export interface ParsedImport { headers: string[]; rows: string[][]; suggested: ImportMapping }
export type ImportOutcome = 'NEW' | 'UPDATE' | 'DUPLICATE_IN_FILE' | 'INVALID_EMAIL' | 'MISSING_EMAIL';
export interface ImportSummary { total: number; NEW: number; UPDATE: number; DUPLICATE_IN_FILE: number; INVALID_EMAIL: number; MISSING_EMAIL: number; suppressed: number; accounts: number }
export interface ImportPreview { summary: ImportSummary; rows: { line: number; email: string; name: string | null; company: string | null; region: string | null; outcome: ImportOutcome; suppressed: boolean; account: boolean }[] }
export interface ImportResult { summary: ImportSummary; created: number; updated: number; failed: { line: number; reason: string }[] }

export type CampaignStatus = 'DRAFT' | 'SENDING' | 'SENT' | 'PARTIAL' | 'FAILED';
export type CampaignTemplate = 'BLANK' | 'ANNOUNCEMENT' | 'PRODUCTS';
export type AudienceKind = 'NEWSLETTER' | 'ACCOUNTS' | 'ALL';
export interface AudienceSpec { audience: AudienceKind; roles?: string[]; region?: string | null; source?: string | null }
export interface CampaignContent { headline?: string; body?: string; ctaLabel?: string; ctaUrl?: string; closing?: string; productIds?: string[] }
export interface CampaignRow {
    id: string; subject: string; status: CampaignStatus; template: CampaignTemplate | null; audience: string; audienceSpec: (AudienceSpec & { excludedAtStart?: Record<string, number>; excludedTotal?: number }) | null;
    totalCount: number; sentCount: number; failedCount: number; skippedCount: number; lastError: string | null;
    createdAt: string; updatedAt: string; sendStartedAt: string | null; sentAt: string | null; lastTestAt: string | null;
    legacy: boolean; sending: boolean; tracking: { opens: number; clicks: number };
}
export interface CampaignDetail extends Omit<CampaignRow, 'tracking'> {
    preheader: string | null; content: CampaignContent | null; lastTestResult: string | null;
    recipientStatus: Partial<Record<'PENDING' | 'ATTEMPTING' | 'ACCEPTED' | 'FAILED' | 'SKIPPED', number>>;
    skipReasons: Record<string, number>; errors: { error: string; count: number }[];
}
export interface CampaignDraft { subject: string; preheader: string; template: CampaignTemplate; content: CampaignContent; audience: AudienceSpec }
export interface CampaignPreview {
    html: string; text: string; legacy?: boolean;
    /** Same email for recipients who aren't buyer accounts (no wholesale prices, as on the site). */
    htmlNoPrices?: string;
    products: EmailProduct[]; missing: string[]; issues: string[];
    sender?: { name: string; contactEmail: string; addressConfigured: boolean; siteUrl: string };
}
export interface AudienceCount { eligible: number; considered: number; excluded: Partial<Record<Exclusion, number>>; pricedContent: boolean; nonProduction: boolean; sample: { email: string; basis: ConsentBasis }[] }
export interface EmailProduct { id: string; name: string; brand: string | null; image: string | null; casePrice: number | null; unitsPerCase: number | null; url: string }
export interface TestResult { ok: boolean; to: string; provider: string | null; error: string | null }

async function json(res: Response) {
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const m = body?.message;
        const msg = Array.isArray(m) ? m.join(' ') : typeof m === 'string' && m ? m : `HTTP ${res.status}`;
        throw new ApiError(msg, res.status, body);
    }
    return body;
}
const send = (method: string, path: string, body?: unknown) => apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (o: Record<string, unknown>) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); }); const s = p.toString(); return s ? `?${s}` : ''; };
const A = '/newsletter/admin';

export const newsletterApi = {
    contacts: (q: Record<string, unknown>): Promise<ContactList> => apiFetch(`${A}/contacts${qs(q)}`, { cache: 'no-store' }).then(json),
    contact: (id: string): Promise<ContactDetail> => apiFetch(`${A}/contacts/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(json),
    addContact: (d: { email: string; name?: string; company?: string; region?: string; consentEvidence?: string }): Promise<ContactDetail> => send('POST', `${A}/contacts`, d).then(json),
    updateContact: (id: string, d: { name?: string; company?: string; region?: string }): Promise<ContactDetail> => send('PATCH', `${A}/contacts/${encodeURIComponent(id)}`, d).then(json),
    recordConsent: (id: string, evidence: string | null): Promise<ContactDetail> => send('POST', `${A}/contacts/${encodeURIComponent(id)}/consent`, { evidence }).then(json),
    bulk: (ids: string[], action: BulkContactAction): Promise<BulkContactResult> => send('POST', `${A}/contacts/bulk`, { ids, action }).then(json),
    parseImport: (file: File): Promise<ParsedImport> => { const f = new FormData(); f.append('file', file); return apiFetch(`${A}/contacts/import/parse`, { method: 'POST', body: f }).then(json); },
    previewImport: (rows: string[][], mapping: ImportMapping): Promise<ImportPreview> => send('POST', `${A}/contacts/import/preview`, { rows, mapping }).then(json),
    commitImport: (rows: string[][], mapping: ImportMapping, consentEvidence: string | null, fileName: string): Promise<ImportResult> => send('POST', `${A}/contacts/import/commit`, { rows, mapping, consentEvidence, fileName }).then(json),
    /** Server-side CSV (OWNER/ADMIN); downloaded through the authenticated proxy. */
    exportContacts: async () => {
        const res = await apiFetch(`${A}/contacts/export`, { cache: 'no-store' });
        if (!res.ok) await json(res);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `atlantis-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    products: (q: string): Promise<EmailProduct[]> => apiFetch(`${A}/products${qs({ q })}`, { cache: 'no-store' }).then(json),
    campaigns: (): Promise<CampaignRow[]> => apiFetch(`${A}/campaigns`, { cache: 'no-store' }).then(json),
    campaign: (id: string): Promise<CampaignDetail> => apiFetch(`${A}/campaigns/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(json),
    createCampaign: (d: CampaignDraft): Promise<CampaignDetail> => send('POST', `${A}/campaigns`, d).then(json),
    updateCampaign: (id: string, d: CampaignDraft): Promise<CampaignDetail> => send('PATCH', `${A}/campaigns/${encodeURIComponent(id)}`, d).then(json),
    deleteCampaign: (id: string) => send('DELETE', `${A}/campaigns/${encodeURIComponent(id)}`).then(json),
    duplicateCampaign: (id: string): Promise<CampaignDetail> => send('POST', `${A}/campaigns/${encodeURIComponent(id)}/duplicate`).then(json),
    preview: (id: string): Promise<CampaignPreview> => apiFetch(`${A}/campaigns/${encodeURIComponent(id)}/preview`, { cache: 'no-store' }).then(json),
    audience: (id: string): Promise<AudienceCount> => apiFetch(`${A}/campaigns/${encodeURIComponent(id)}/audience`, { cache: 'no-store' }).then(json),
    test: (id: string): Promise<TestResult> => send('POST', `${A}/campaigns/${encodeURIComponent(id)}/test`).then(json),
    send: (id: string, expectedRecipients: number): Promise<CampaignDetail> => send('POST', `${A}/campaigns/${encodeURIComponent(id)}/send`, { expectedRecipients }).then(json),
    resume: (id: string): Promise<CampaignDetail> => send('POST', `${A}/campaigns/${encodeURIComponent(id)}/resume`).then(json),
};
