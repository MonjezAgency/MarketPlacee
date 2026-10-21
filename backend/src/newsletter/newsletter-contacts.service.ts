import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../common/prisma.service';
import { MarketingConsentService } from './marketing-consent.service';
import { contactOrigin, isValidEmail, maskEmail, normalizeEmail } from './marketing-consent';
import { csvEscape, ImportMapping, planImport, suggestMapping, summarize } from './import-contacts';

const MAX_IMPORT_ROWS = 5000;
const clean = (v: unknown, max: number) => { const s = String(v ?? '').trim().slice(0, max); return s || null; };

export interface ContactQuery { q?: string; status?: string; kind?: string; source?: string; region?: string; eligibility?: string; page?: number; pageSize?: number }

/**
 * Newsletter Hub → Contacts. Everything here is admin-only (controller:
 * OWNER/ADMIN). Eligibility always comes from MarketingConsentService.
 */
@Injectable()
export class NewsletterContactsService {
    constructor(private prisma: PrismaService, private consent: MarketingConsentService) {}
    private db() { return this.prisma as any; }

    /** All contact rows with account match, consent decision and suppression, newest first. */
    private async enriched() {
        const rows: any[] = await this.db().newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' } });
        const emails = rows.map((r) => normalizeEmail(r.email));
        const [decisions, users, sups] = await Promise.all([
            this.consent.decideMany(emails),
            this.prisma.user.findMany({ where: { email: { in: emails, mode: 'insensitive' } }, select: { id: true, email: true, name: true, companyName: true, role: true, status: true, createdAt: true, emailVerified: true } }),
            this.db().marketingSuppression.findMany({ where: { email: { in: emails } } }),
        ]);
        const uMap = new Map<string, any>(users.map((u) => [normalizeEmail(u.email), u]));
        const sMap = new Map<string, any>((sups as any[]).map((s) => [s.email, s]));
        return rows.map((r) => {
            const e = normalizeEmail(r.email);
            const u = uMap.get(e);
            const d = decisions.get(e)?.decision;
            const s = sMap.get(e);
            const origin = contactOrigin(r);
            return {
                id: r.id, email: r.email, name: r.name, company: r.company ?? null, region: r.region, source: r.source,
                origin, kind: u ? 'ACCOUNT' : origin,
                status: r.status,
                eligible: !!d?.eligible, basis: d?.eligible ? d.basis : null, reason: d && !d.eligible ? d.reason : null,
                consentBasis: r.consentBasis ?? null, consentEvidence: r.consentEvidence ?? null, consentRecordedAt: r.consentRecordedAt ?? null,
                consentAt: r.consentAt, consentSource: r.consentSource, confirmedAt: r.confirmedAt, unsubscribedAt: r.unsubscribedAt,
                suppression: s && !s.liftedAt ? { reason: s.reason, source: s.source, at: s.suppressedAt } : null,
                createdAt: r.createdAt, updatedAt: r.updatedAt, lastImportedAt: r.lastImportedAt ?? null,
                account: u ? { id: u.id, name: u.name, companyName: u.companyName, role: u.role, status: u.status, createdAt: u.createdAt, emailVerified: u.emailVerified } : null,
            };
        });
    }

    async list(q: ContactQuery) {
        const all = await this.enriched();
        const term = String(q.q || '').trim().toLowerCase();
        const rows = all.filter((r) => {
            if (term && ![r.email, r.name, r.company, r.account?.companyName, r.account?.name].some((v) => String(v || '').toLowerCase().includes(term))) return false;
            if (q.status && r.status !== q.status) return false;
            if (q.kind && r.kind !== q.kind) return false;
            if (q.source && (r.source || '') !== q.source) return false;
            if (q.region && (r.region || '') !== q.region) return false;
            if (q.eligibility === 'ELIGIBLE' && !r.eligible) return false;
            if (q.eligibility && q.eligibility !== 'ELIGIBLE' && r.reason !== q.eligibility) return false;
            return true;
        });
        const pageSize = Math.min(100, Math.max(10, Number(q.pageSize) || 25));
        const page = Math.max(1, Number(q.page) || 1);
        const byReason: Record<string, number> = {};
        const byKind: Record<string, number> = {};
        for (const r of all) { if (!r.eligible && r.reason) byReason[r.reason] = (byReason[r.reason] || 0) + 1; byKind[r.kind] = (byKind[r.kind] || 0) + 1; }
        // Accounts that switched marketing on but aren't a contact row (reachable through an account audience).
        const contactEmails = new Set(all.map((r) => normalizeEmail(r.email)));
        const opted = await this.prisma.user.findMany({ where: { role: { in: ['CUSTOMER', 'SUPPLIER'] as any } }, select: { email: true, notificationPrefs: true } });
        const accountOnly = opted.filter((u) => (u.notificationPrefs as any)?.marketingEmails === true && !contactEmails.has(normalizeEmail(u.email))).length;
        return {
            rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize,
            summary: { contacts: all.length, eligible: all.filter((r) => r.eligible).length, byReason, byKind, accountOptInsWithoutContact: accountOnly },
            facets: {
                sources: [...new Set(all.map((r) => r.source).filter(Boolean))].sort(),
                regions: [...new Set(all.map((r) => r.region).filter(Boolean))].sort(),
            },
        };
    }

    async detail(id: string) {
        const row = (await this.enriched()).find((r) => r.id === id);
        if (!row) throw new NotFoundException('Contact not found');
        const events = await this.db().marketingConsentEvent.findMany({ where: { email: normalizeEmail(row.email) }, orderBy: { createdAt: 'desc' }, take: 50 });
        return { ...row, events: events.map((e: any) => ({ type: e.type, source: e.source, at: e.createdAt, campaignId: e.campaignId, offerId: e.offerId })) };
    }

    /** Add one contact by hand. A consent basis counts only when the admin records one. */
    async add(body: { email?: string; name?: string; company?: string; region?: string; consentEvidence?: string }, actorId: string) {
        const email = normalizeEmail(body?.email);
        if (!isValidEmail(email)) throw new BadRequestException('Enter a valid email address.');
        const existing = await this.db().newsletterSubscriber.findUnique({ where: { email } });
        if (existing) throw new ConflictException({ message: 'This email is already a contact.', code: 'DUPLICATE', id: existing.id });
        const evidence = clean(body?.consentEvidence, 500);
        const created = await this.db().newsletterSubscriber.create({
            data: {
                email, name: clean(body?.name, 120), company: clean(body?.company, 160), region: clean(body?.region, 80),
                source: 'manual', status: 'ACTIVE', addedById: actorId,
                consentBasis: evidence ? 'ADMIN_RECORDED' : 'NONE', consentEvidence: evidence,
                consentRecordedById: evidence ? actorId : null, consentRecordedAt: evidence ? new Date() : null,
            },
        });
        await this.consent.recordEvent(email, 'ADMIN_ADDED', { source: 'manual', actorId, detail: { basisRecorded: !!evidence } });
        if (evidence) await this.consent.recordEvent(email, 'CONSENT_RECORDED', { source: 'admin', actorId });
        return this.detail(created.id);
    }

    async update(id: string, body: { name?: string; company?: string; region?: string }) {
        const row = await this.db().newsletterSubscriber.findUnique({ where: { id } });
        if (!row) throw new NotFoundException('Contact not found');
        const data: any = {};
        for (const [k, max] of [['name', 120], ['company', 160], ['region', 80]] as const) if (k in (body || {})) data[k] = clean((body as any)[k], max);
        await this.db().newsletterSubscriber.update({ where: { id }, data });
        return this.detail(id);
    }

    /** Record (or withdraw) the admin-entered consent basis. Never lifts an unsubscribe. */
    async recordConsent(id: string, body: { evidence?: string | null }, actorId: string) {
        const row = await this.db().newsletterSubscriber.findUnique({ where: { id } });
        if (!row) throw new NotFoundException('Contact not found');
        const evidence = clean(body?.evidence, 500);
        await this.db().newsletterSubscriber.update({
            where: { id },
            data: evidence
                ? { consentBasis: 'ADMIN_RECORDED', consentEvidence: evidence, consentRecordedById: actorId, consentRecordedAt: new Date() }
                : { consentBasis: row.confirmedAt ? row.consentBasis : 'NONE', consentEvidence: null, consentRecordedById: actorId, consentRecordedAt: new Date() },
        });
        await this.consent.recordEvent(row.email, evidence ? 'CONSENT_RECORDED' : 'CONSENT_WITHDRAWN_BY_ADMIN', { source: 'admin', actorId });
        return this.detail(id);
    }

    /** block | unblock | archive | restore | delete, with a per-row report. */
    async bulk(ids: string[], action: string, actorId: string) {
        const allowed = ['block', 'unblock', 'archive', 'restore', 'delete'];
        if (!allowed.includes(action)) throw new BadRequestException(`Unknown action. Allowed: ${allowed.join(', ')}.`);
        const list = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && x).slice(0, 1000);
        if (!list.length) throw new BadRequestException('Select at least one contact.');
        const rows: any[] = await this.db().newsletterSubscriber.findMany({ where: { id: { in: list } } });
        const done: string[] = [];
        const skipped: { id: string; email: string; reason: string }[] = [];
        for (const r of rows) {
            const email = normalizeEmail(r.email);
            if (action === 'block') {
                if (r.status === 'BLOCKED') { skipped.push({ id: r.id, email: maskEmail(email), reason: 'ALREADY_BLOCKED' }); continue; }
                await this.db().newsletterSubscriber.update({ where: { id: r.id }, data: { status: 'BLOCKED' } });
                await this.consent.suppress(email, 'BLOCKED', 'ADMIN');
                await this.consent.recordEvent(email, 'BLOCKED', { source: 'admin', actorId });
            } else if (action === 'unblock') {
                if (r.status !== 'BLOCKED') { skipped.push({ id: r.id, email: maskEmail(email), reason: 'NOT_BLOCKED' }); continue; }
                await this.db().marketingSuppression.updateMany({ where: { email, reason: 'BLOCKED', liftedAt: null }, data: { liftedAt: new Date(), liftedReason: 'ADMIN_UNBLOCK' } });
                const sup = await this.db().marketingSuppression.findUnique({ where: { email } });
                const back = r.unsubscribedAt || (sup && !sup.liftedAt && sup.reason === 'UNSUBSCRIBED') ? 'UNSUBSCRIBED' : 'ACTIVE';
                await this.db().newsletterSubscriber.update({ where: { id: r.id }, data: { status: back } });
                await this.consent.recordEvent(email, 'UNBLOCKED', { source: 'admin', actorId, detail: { status: back } });
            } else if (action === 'archive') {
                if (r.status !== 'ACTIVE' && r.status !== 'PENDING') { skipped.push({ id: r.id, email: maskEmail(email), reason: `STATUS_${r.status}` }); continue; }
                await this.db().newsletterSubscriber.update({ where: { id: r.id }, data: { status: 'HIDDEN' } });
                await this.consent.recordEvent(email, 'ARCHIVED', { source: 'admin', actorId });
            } else if (action === 'restore') {
                if (r.status !== 'HIDDEN') { skipped.push({ id: r.id, email: maskEmail(email), reason: 'NOT_ARCHIVED' }); continue; }
                await this.db().newsletterSubscriber.update({ where: { id: r.id }, data: { status: r.unsubscribedAt ? 'UNSUBSCRIBED' : 'ACTIVE' } });
                await this.consent.recordEvent(email, 'RESTORED', { source: 'admin', actorId });
            } else {
                // The suppression list is separate, so an unsubscribe outlives the deleted row.
                await this.db().newsletterSubscriber.delete({ where: { id: r.id } });
                await this.consent.recordEvent(email, 'DELETED', { source: 'admin', actorId });
            }
            done.push(r.id);
        }
        for (const id of list) if (!rows.some((r) => r.id === id)) skipped.push({ id, email: '', reason: 'NOT_FOUND' });
        return { action, done: done.length, skipped };
    }

    /** Step 1: read the file's header row and rows (no writes). */
    parseFile(buffer: Buffer) {
        if (!buffer?.length) throw new BadRequestException('The file is empty.');
        let matrix: unknown[][];
        try {
            const wb = XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: false });
            matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }) as unknown[][];
        } catch (err: any) {
            throw new BadRequestException(`The file couldn’t be read: ${err?.message || 'unknown format'}`);
        }
        const [header = [], ...rows] = matrix;
        const headers = header.map((h) => String(h ?? '').trim().slice(0, 80));
        if (!headers.some(Boolean)) throw new BadRequestException('The first row must contain column names.');
        if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`The file has ${rows.length} rows; import at most ${MAX_IMPORT_ROWS} at a time.`);
        return { headers, rows: rows.map((r) => headers.map((_, i) => String(r?.[i] ?? '').slice(0, 320))), suggested: suggestMapping(headers) };
    }

    private async planFor(body: { rows?: unknown[][]; mapping?: ImportMapping }) {
        const rows = Array.isArray(body?.rows) ? body.rows.slice(0, MAX_IMPORT_ROWS + 1) : [];
        if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
        const m = body?.mapping;
        if (!m || !Number.isInteger(m.email) || m.email < 0) throw new BadRequestException('Choose the column that holds the email address.');
        const emails = rows.map((r) => normalizeEmail(Array.isArray(r) ? r[m.email] : '')).filter(Boolean);
        const [existing, sups, users] = await Promise.all([
            this.db().newsletterSubscriber.findMany({ where: { email: { in: emails } }, select: { email: true } }),
            this.db().marketingSuppression.findMany({ where: { email: { in: emails }, liftedAt: null }, select: { email: true } }),
            this.prisma.user.findMany({ where: { email: { in: emails, mode: 'insensitive' } }, select: { email: true } }),
        ]);
        const contactStatus: any[] = await this.db().newsletterSubscriber.findMany({ where: { email: { in: emails }, status: { in: ['UNSUBSCRIBED', 'BOUNCED', 'BLOCKED'] } }, select: { email: true } });
        return planImport({
            rows: rows.map((r) => (Array.isArray(r) ? r : [])), mapping: m,
            existing: new Set(existing.map((r: any) => normalizeEmail(r.email))),
            suppressed: new Set([...sups, ...contactStatus].map((r: any) => normalizeEmail(r.email))),
            accounts: new Set(users.map((u) => normalizeEmail(u.email))),
        });
    }

    /** Step 2: validation, duplicates and what would happen to each row (no writes). */
    async previewImport(body: { rows?: unknown[][]; mapping?: ImportMapping }) {
        const plan = await this.planFor(body);
        return { summary: summarize(plan), rows: plan.slice(0, 500).map((r) => ({ ...r })) };
    }

    /**
     * Step 3: write. New rows are created with source "import" and no consent
     * basis unless the admin records one for the whole file. Existing rows get
     * blank fields filled; status, consent and suppression never change.
     */
    async commitImport(body: { rows?: unknown[][]; mapping?: ImportMapping; consentEvidence?: string | null; fileName?: string }, actorId: string) {
        const plan = await this.planFor(body);
        const evidence = clean(body?.consentEvidence, 500);
        const now = new Date();
        let created = 0, updated = 0;
        const failed: { line: number; reason: string }[] = [];
        for (const r of plan) {
            if (r.outcome !== 'NEW' && r.outcome !== 'UPDATE') continue;
            try {
                if (r.outcome === 'NEW') {
                    await this.db().newsletterSubscriber.create({
                        data: {
                            email: r.email, name: r.name, company: r.company, region: r.region, source: 'import', status: 'ACTIVE',
                            addedById: actorId, lastImportedAt: now,
                            consentBasis: evidence && !r.suppressed ? 'ADMIN_RECORDED' : 'NONE', consentEvidence: evidence && !r.suppressed ? evidence : null,
                            consentRecordedById: evidence && !r.suppressed ? actorId : null, consentRecordedAt: evidence && !r.suppressed ? now : null,
                        },
                    });
                    created++;
                } else {
                    const cur = await this.db().newsletterSubscriber.findUnique({ where: { email: r.email } });
                    await this.db().newsletterSubscriber.update({
                        where: { email: r.email },
                        data: { name: cur.name || r.name, company: cur.company || r.company, region: cur.region || r.region, lastImportedAt: now },
                    });
                    updated++;
                }
                await this.consent.recordEvent(r.email, 'IMPORTED', { source: 'import', actorId, detail: { outcome: r.outcome, basisRecorded: !!evidence && r.outcome === 'NEW' && !r.suppressed, suppressed: r.suppressed, file: clean(body?.fileName, 120) } });
            } catch (err: any) {
                failed.push({ line: r.line, reason: 'DATABASE_ERROR' });
            }
        }
        return { summary: summarize(plan), created, updated, failed };
    }

    /** CSV of every contact with its consent record and eligibility (OWNER/ADMIN). */
    async exportCsv(): Promise<string> {
        const rows = await this.enriched();
        const head = ['email', 'name', 'company', 'region', 'type', 'source', 'status', 'sendable', 'basis', 'excluded_reason', 'consent_evidence', 'consent_recorded_at', 'confirmed_at', 'consent_at', 'unsubscribed_at', 'suppression', 'added_at', 'last_imported_at', 'account_role', 'account_company', 'account_registered_at'];
        return [head.join(','), ...rows.map((r) => [
            r.email, r.name, r.company, r.region, r.kind, r.source, r.status, r.eligible ? 'yes' : 'no', r.basis, r.reason, r.consentEvidence, r.consentRecordedAt, r.confirmedAt, r.consentAt, r.unsubscribedAt,
            r.suppression ? `${r.suppression.reason} ${new Date(r.suppression.at).toISOString()}` : '', r.createdAt, r.lastImportedAt, r.account?.role, r.account?.companyName, r.account?.createdAt,
        ].map(csvEscape).join(','))].join('\n');
    }
}
