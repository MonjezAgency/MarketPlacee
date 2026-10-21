import * as crypto from 'crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { accountOptedIn, decide, Decision, Exclusion, isValidEmail, maskEmail, normalizeEmail } from './marketing-consent';

export type Audience = 'NEWSLETTER' | 'ACCOUNTS' | 'ALL';
export interface AudienceSpec {
    audience: Audience;
    /** Account roles to include for ACCOUNTS / ALL (CUSTOMER, SUPPLIER). Empty = both. */
    roles?: string[];
    region?: string | null;
    source?: string | null;
}
export interface EligibleRecipient { email: string; name: string | null; basis: string; accountRole: string | null }
export interface AudienceResult {
    recipients: EligibleRecipient[];
    excluded: Partial<Record<Exclusion | 'SUPPLIER_PRICE_PRIVACY', number>>;
    considered: number;
}
/** ok → the URLs are set; otherwise reason says why this address must not be emailed now. */
export interface PrepareResult { ok: boolean; unsubscribeUrl?: string; oneClickUrl?: string; basis?: string; accountRole?: string | null; reason?: Exclusion | 'SUPPLIER_PRICE_PRIVACY' | 'NON_PRODUCTION' }

const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const frontendBase = () => (process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');

/** Accounts that may receive marketing (the rest are never on an account audience). */
const MARKETING_ROLES = ['CUSTOMER', 'SUPPLIER'];

/**
 * Non-production safety net: outside production a marketing email only goes to
 * test domains (MARKETING_NONPROD_ALLOWED_DOMAINS, default atl.test, example.com,
 * example.org), so a local or staging run can never reach a real customer list.
 */
export function nonProductionBlocked(email: string): boolean {
    if ((process.env.NODE_ENV || '').toLowerCase() === 'production') return false;
    const allowed = (process.env.MARKETING_NONPROD_ALLOWED_DOMAINS || 'atl.test,example.com,example.org')
        .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
    const domain = email.split('@')[1] || '';
    return !allowed.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * The central "may this address receive marketing email now" service.
 * Every marketing sender (campaigns, the approved-offer email) calls
 * `prepareSend` immediately before each send; it re-reads consent and
 * suppression and issues the per-recipient unsubscribe link.
 */
@Injectable()
export class MarketingConsentService {
    private readonly logger = new Logger(MarketingConsentService.name);
    constructor(private prisma: PrismaService) {}

    private db() { return this.prisma as any; }

    /** Decision for each address (normalised), from the contact row, the account and the suppression list. */
    async decideMany(emails: string[]): Promise<Map<string, { decision: Decision; name: string | null; accountRole: string | null; region: string | null; source: string | null }>> {
        const list = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
        const out = new Map<string, any>();
        for (let i = 0; i < list.length; i += 1000) {
            const chunk = list.slice(i, i + 1000);
            const [contacts, users, sups] = await Promise.all([
                this.db().newsletterSubscriber.findMany({ where: { email: { in: chunk } } }),
                this.prisma.user.findMany({ where: { email: { in: chunk, mode: 'insensitive' } }, select: { email: true, name: true, companyName: true, role: true, status: true, notificationPrefs: true } }),
                this.db().marketingSuppression.findMany({ where: { email: { in: chunk } } }),
            ]);
            const cMap = new Map<string, any>((contacts as any[]).map((c) => [normalizeEmail(c.email), c]));
            const uMap = new Map<string, any>((users as any[]).map((u) => [normalizeEmail(u.email), u]));
            const sMap = new Map<string, any>((sups as any[]).map((s) => [normalizeEmail(s.email), s]));
            for (const e of chunk) {
                const c = cMap.get(e), u = uMap.get(e), s = sMap.get(e);
                const decision = decide({
                    email: e, contact: c || null, suppression: s || null,
                    account: u ? { status: u.status, role: u.role, marketingOptIn: MARKETING_ROLES.includes(String(u.role)) && accountOptedIn(u.notificationPrefs) } : null,
                });
                out.set(e, { decision, name: c?.name || u?.companyName || u?.name || null, accountRole: u ? String(u.role) : null, region: c?.region ?? null, source: c?.source ?? null });
            }
        }
        return out;
    }

    async check(email: string): Promise<Decision> {
        const e = normalizeEmail(email);
        return (await this.decideMany([e])).get(e)?.decision ?? { eligible: false, reason: 'INVALID_EMAIL' };
    }

    /**
     * Everyone an audience could reach, split into eligible recipients and
     * excluded counts by reason. `pricedContent` excludes supplier accounts
     * (suppliers never see buyer prices).
     */
    async eligibleRecipients(spec: AudienceSpec, opts: { pricedContent?: boolean } = {}): Promise<AudienceResult> {
        const audience: Audience = ['NEWSLETTER', 'ACCOUNTS', 'ALL'].includes(spec?.audience) ? spec.audience : 'NEWSLETTER';
        const roles = (spec.roles || []).map((r) => String(r).toUpperCase()).filter((r) => MARKETING_ROLES.includes(r));
        const pool = new Set<string>();
        if (audience !== 'ACCOUNTS') {
            const where: any = {};
            if (spec.region) where.region = spec.region;
            if (spec.source) where.source = spec.source;
            const rows: any[] = await this.db().newsletterSubscriber.findMany({ where, select: { email: true } });
            rows.forEach((r) => pool.add(normalizeEmail(r.email)));
        }
        if (audience !== 'NEWSLETTER') {
            const users = await this.prisma.user.findMany({ where: { role: { in: (roles.length ? roles : MARKETING_ROLES) as any } }, select: { email: true } });
            users.forEach((u) => pool.add(normalizeEmail(u.email)));
        }
        const decisions = await this.decideMany([...pool]);
        const recipients: EligibleRecipient[] = [];
        const excluded: AudienceResult['excluded'] = {};
        for (const [email, d] of decisions) {
            if (!d.decision.eligible) { excluded[d.decision.reason] = (excluded[d.decision.reason] || 0) + 1; continue; }
            if (audience === 'ALL' && roles.length && d.accountRole && !roles.includes(d.accountRole)) continue;
            if (opts.pricedContent && d.accountRole === 'SUPPLIER') { excluded.SUPPLIER_PRICE_PRIVACY = (excluded.SUPPLIER_PRICE_PRIVACY || 0) + 1; continue; }
            recipients.push({ email, name: d.name, basis: d.decision.basis, accountRole: d.accountRole });
        }
        recipients.sort((a, b) => a.email.localeCompare(b.email));
        return { recipients, excluded, considered: decisions.size };
    }

    /**
     * The pre-send gate. Re-checks consent and suppression for this one
     * address right now and, when allowed, issues a fresh unsubscribe token.
     */
    async prepareSend(email: string, ctx: { campaignId?: string; offerId?: string; pricedContent?: boolean } = {}): Promise<PrepareResult> {
        const e = normalizeEmail(email);
        const facts = (await this.decideMany([e])).get(e);
        const d = facts?.decision;
        if (!d) return { ok: false, reason: 'INVALID_EMAIL' };
        if (!d.eligible) return { ok: false, reason: d.reason };
        if (ctx.pricedContent && facts?.accountRole === 'SUPPLIER') return { ok: false, reason: 'SUPPLIER_PRICE_PRIVACY' };
        if (nonProductionBlocked(e)) return { ok: false, reason: 'NON_PRODUCTION' };
        if (d.reoptInByAccount) await this.liftSuppression(e, 'ACCOUNT_SETTING_ON');
        const token = await this.issueToken(e, ctx);
        return { ok: true, basis: d.basis, accountRole: facts?.accountRole ?? null, ...this.unsubscribeUrls(token) };
    }

    unsubscribeUrls(token: string) {
        const t = encodeURIComponent(token);
        return { unsubscribeUrl: `${frontendBase()}/unsubscribe?token=${t}`, oneClickUrl: `${frontendBase()}/unsubscribe/one-click?token=${t}` };
    }

    async issueToken(email: string, ctx: { campaignId?: string; offerId?: string } = {}): Promise<string> {
        const token = crypto.randomBytes(32).toString('base64url');
        await this.db().marketingUnsubscribeToken.create({ data: { tokenHash: sha(token), email: normalizeEmail(email), campaignId: ctx.campaignId ?? null, offerId: ctx.offerId ?? null } });
        return token;
    }

    async recordEvent(email: string, type: string, extra: { source?: string; actorId?: string | null; campaignId?: string | null; offerId?: string | null; detail?: any } = {}) {
        await this.db().marketingConsentEvent.create({
            data: { email: normalizeEmail(email), type, source: extra.source ?? null, actorId: extra.actorId ?? null, campaignId: extra.campaignId ?? null, offerId: extra.offerId ?? null, detail: extra.detail ?? undefined },
        }).catch((err: any) => this.logger.warn(`consent event not stored for ${maskEmail(email)}: ${err?.message}`));
    }

    /** Add or refresh a suppression (an unsubscribe always wins over an earlier lift). */
    async suppress(email: string, reason: 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED' | 'BLOCKED', source: string, accountPrefCleared = false) {
        const e = normalizeEmail(email);
        // An admin block on top of the person's own unsubscribe keeps the unsubscribe
        // (unblocking must never make them sendable again).
        const current = await this.db().marketingSuppression.findUnique({ where: { email: e } });
        if (current && !current.liftedAt && current.reason === 'UNSUBSCRIBED' && reason === 'BLOCKED') return;
        await this.db().marketingSuppression.upsert({
            where: { email: e },
            create: { email: e, reason, source, accountPrefCleared, suppressedAt: new Date() },
            update: { reason, source, accountPrefCleared, suppressedAt: new Date(), liftedAt: null, liftedReason: null },
        });
    }

    async liftSuppression(email: string, why: string) {
        const e = normalizeEmail(email);
        const r = await this.db().marketingSuppression.updateMany({ where: { email: e, liftedAt: null }, data: { liftedAt: new Date(), liftedReason: why } });
        if (r.count) await this.recordEvent(e, 'RESUBSCRIBED', { source: why });
    }

    /**
     * Public unsubscribe by token (marketing emails) or by address (form on the
     * page). Records the event, keeps a suppression that no import or re-add can
     * undo, and switches the matching account's marketing preference off.
     */
    async unsubscribe(input: { token?: string; email?: string; method?: string }): Promise<{ ok: true; email: string | null }> {
        let email = '';
        let campaignId: string | null = null, offerId: string | null = null;
        const method = ['LINK', 'ONE_CLICK', 'EMAIL_FORM'].includes(String(input.method)) ? String(input.method) : (input.token ? 'LINK' : 'EMAIL_FORM');
        if (input.token) {
            const tok = String(input.token);
            if (tok.length < 20 || tok.length > 200) throw new BadRequestException('This unsubscribe link is invalid.');
            const row = await this.db().marketingUnsubscribeToken.findUnique({ where: { tokenHash: sha(tok) } });
            if (row) {
                email = row.email; campaignId = row.campaignId; offerId = row.offerId;
                if (!row.usedAt) await this.db().marketingUnsubscribeToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
            } else {
                // Links in emails sent before per-recipient tokens: the subscriber's own random token.
                const legacy = await this.db().newsletterSubscriber.findUnique({ where: { unsubscribeToken: tok } });
                if (!legacy) throw new BadRequestException('This unsubscribe link is invalid.');
                email = normalizeEmail(legacy.email);
            }
        } else {
            email = normalizeEmail(input.email);
            if (!isValidEmail(email)) throw new BadRequestException('Enter a valid email address.');
        }

        const existingSup = await this.db().marketingSuppression.findUnique({ where: { email } });
        const user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, notificationPrefs: true } });
        let cleared = false;
        if (user) {
            const prefs = (user.notificationPrefs && typeof user.notificationPrefs === 'object') ? { ...(user.notificationPrefs as any) } : {};
            prefs.marketingEmails = false;
            await this.prisma.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
            cleared = true;
        }
        // An admin block or a bounce stays the stronger reason; otherwise it's an unsubscribe.
        const keepReason = existingSup && !existingSup.liftedAt && ['BLOCKED', 'BOUNCED', 'COMPLAINED'].includes(existingSup.reason);
        if (!keepReason) await this.suppress(email, 'UNSUBSCRIBED', method, cleared);
        const contact = await this.db().newsletterSubscriber.findUnique({ where: { email } });
        if (contact && !['UNSUBSCRIBED', 'BLOCKED', 'BOUNCED'].includes(contact.status)) {
            await this.db().newsletterSubscriber.update({ where: { id: contact.id }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date(), confirmTokenHash: null } });
        } else if (contact && !contact.unsubscribedAt) {
            await this.db().newsletterSubscriber.update({ where: { id: contact.id }, data: { unsubscribedAt: new Date() } });
        }
        await this.recordEvent(email, 'UNSUBSCRIBED', { source: method, campaignId, offerId });
        this.logger.log(`unsubscribe recorded for ${maskEmail(email)} (${method})`);
        return { ok: true, email: input.token ? maskEmail(email) : null };
    }
}
