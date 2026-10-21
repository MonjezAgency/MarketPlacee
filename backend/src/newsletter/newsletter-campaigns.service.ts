import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailTrackingService } from '../email-tracking/email-tracking.service';
import { buyerCasePrice, readMarkups } from '../common/markups';
import { AudienceSpec, MarketingConsentService } from './marketing-consent.service';
import { maskEmail, normalizeEmail } from './marketing-consent';
import {
    brandFromEnv, CampaignContent, CampaignTemplate, EmailProduct, renderCampaignEmail, renderCampaignText, safeUrl, TEMPLATES, UNSUBSCRIBE_PLACEHOLDER,
} from './campaign-email';

const MAX_PRODUCTS = 6;
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export interface DraftInput {
    subject?: string; preheader?: string; template?: string;
    content?: CampaignContent; audience?: AudienceSpec;
}

/**
 * Newsletter Hub → Campaigns: drafts, the exact email HTML, audience counts
 * from the central consent check, test email to the admin's own address and
 * an idempotent send (one CampaignRecipient row per address, attempted once).
 * Statuses: DRAFT → SENDING → SENT | PARTIAL | FAILED. "Sent" = accepted by the
 * email provider; no delivery/bounce reports are wired back from the provider.
 */
@Injectable()
export class NewsletterCampaignsService {
    private readonly logger = new Logger(NewsletterCampaignsService.name);
    /** Campaign ids being sent by this process (a second send/resume is refused). */
    private readonly running = new Set<string>();

    constructor(
        private prisma: PrismaService,
        private consent: MarketingConsentService,
        private email: EmailService,
        private tracking: EmailTrackingService,
    ) {}
    private db() { return this.prisma as any; }

    private normalizeDraft(input: DraftInput) {
        const template = (TEMPLATES as string[]).includes(String(input.template)) ? input.template as CampaignTemplate : 'BLANK';
        const c = input.content || {};
        const ids = Array.isArray(c.productIds) ? [...new Set(c.productIds.filter((x) => typeof x === 'string'))].slice(0, MAX_PRODUCTS) : [];
        const content: CampaignContent = {
            headline: clean(c.headline, 160), body: clean(c.body, 6000), ctaLabel: clean(c.ctaLabel, 60),
            ctaUrl: clean(c.ctaUrl, 500), closing: clean(c.closing, 2000), productIds: template === 'PRODUCTS' ? ids : [],
        };
        const a = input.audience || ({} as AudienceSpec);
        const audience: AudienceSpec = {
            audience: ['NEWSLETTER', 'ACCOUNTS', 'ALL'].includes(a.audience) ? a.audience : 'NEWSLETTER',
            roles: Array.isArray(a.roles) ? a.roles.map((r) => String(r).toUpperCase()).filter((r) => ['CUSTOMER', 'SUPPLIER'].includes(r)) : [],
            region: clean(a.region, 80) || null, source: clean(a.source, 80) || null,
        };
        return { subject: clean(input.subject, 200), preheader: clean(input.preheader, 200) || null, template, content, audience };
    }

    /** Problems that block a send (and are shown in the review step). */
    private issues(d: ReturnType<NewsletterCampaignsService['normalizeDraft']>, products: EmailProduct[], missing: string[]) {
        const out: string[] = [];
        if (!d.subject) out.push('SUBJECT_MISSING');
        if (!d.content.headline && !d.content.body && !products.length) out.push('CONTENT_EMPTY');
        if (d.content.ctaLabel && !safeUrl(d.content.ctaUrl)) out.push('CTA_URL_INVALID');
        if (d.template === 'PRODUCTS' && !products.length) out.push('NO_LIVE_PRODUCTS');
        if (missing.length) out.push('PRODUCTS_NOT_LIVE');
        return out;
    }

    /** Live catalog products with the buyer case price listed on the site (never the supplier net price). */
    async resolveProducts(ids: string[]): Promise<{ products: EmailProduct[]; missing: string[] }> {
        if (!ids.length) return { products: [], missing: [] };
        const site = brandFromEnv().siteUrl;
        const [rows, markups] = await Promise.all([
            this.prisma.product.findMany({ where: { id: { in: ids }, status: 'APPROVED' as any }, select: { id: true, name: true, brand: true, images: true, basePrice: true, unitsPerCase: true } }),
            readMarkups(this.prisma),
        ]);
        const byId = new Map(rows.map((p) => [p.id, p]));
        const products: EmailProduct[] = [];
        const missing: string[] = [];
        for (const id of ids) {
            const p = byId.get(id);
            if (!p) { missing.push(id); continue; }
            const img = (p.images || []).find((u) => /^https:\/\//i.test(String(u))) || null;
            products.push({ id: p.id, name: p.name, brand: p.brand, image: img, casePrice: buyerCasePrice(p, markups), unitsPerCase: p.unitsPerCase, url: `${site}/products/${encodeURIComponent(p.id)}` });
        }
        return { products, missing };
    }

    /** Picker search: live products only, buyer price only. */
    async searchProducts(q: string) {
        const term = clean(q, 80);
        const rows = await this.prisma.product.findMany({
            where: { status: 'APPROVED' as any, ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { brand: { contains: term, mode: 'insensitive' } }, { ean: { contains: term } }] } : {}) },
            select: { id: true }, orderBy: { updatedAt: 'desc' }, take: 20,
        });
        return (await this.resolveProducts(rows.map((r) => r.id))).products;
    }

    async render(d: ReturnType<NewsletterCampaignsService['normalizeDraft']>, unsubscribeUrl: string) {
        const { products, missing } = await this.resolveProducts(d.content.productIds || []);
        const brand = brandFromEnv();
        const args = { subject: d.subject, preheader: d.preheader, template: d.template, content: d.content, products, brand, unsubscribeUrl };
        return {
            html: renderCampaignEmail(args), text: renderCampaignText(args), products, missing,
            // Variant for recipients who aren't buyer accounts: no wholesale prices (the site shows them only after sign-in).
            htmlNoPrices: renderCampaignEmail({ ...args, showPrices: false }), textNoPrices: renderCampaignText({ ...args, showPrices: false }),
            issues: this.issues(d, products, missing),
            sender: { name: brand.senderName, contactEmail: brand.contactEmail, addressConfigured: !!brand.senderAddress, siteUrl: brand.siteUrl },
        };
    }

    private toDraft(c: any) {
        return this.normalizeDraft({ subject: c.subject, preheader: c.preheader, template: c.template || 'BLANK', content: c.content || {}, audience: c.audienceSpec || {} });
    }

    // ── CRUD ────────────────────────────────────────────────────────────

    async list() {
        const rows: any[] = await this.db().campaign.findMany({
            orderBy: { createdAt: 'desc' }, take: 200,
            select: { id: true, subject: true, status: true, template: true, audience: true, audienceSpec: true, totalCount: true, sentCount: true, failedCount: true, skippedCount: true, lastError: true, createdAt: true, updatedAt: true, sendStartedAt: true, sentAt: true, lastTestAt: true, content: true },
        });
        const ids = rows.map((r) => r.id);
        const ev: any[] = ids.length ? await (this.prisma as any).emailEvent.groupBy({ by: ['campaignId', 'type'], where: { campaignId: { in: ids }, type: { in: ['OPEN', 'CLICK'] } }, _count: { _all: true } }) : [];
        return rows.map((r) => ({
            ...r, content: undefined, legacy: !r.content,
            sending: this.running.has(r.id),
            tracking: {
                opens: ev.find((e) => e.campaignId === r.id && e.type === 'OPEN')?._count._all ?? 0,
                clicks: ev.find((e) => e.campaignId === r.id && e.type === 'CLICK')?._count._all ?? 0,
            },
        }));
    }

    async get(id: string) {
        const c = await this.db().campaign.findUnique({ where: { id } });
        if (!c) throw new NotFoundException('Campaign not found');
        const counts: any[] = await this.db().campaignRecipient.groupBy({ by: ['status'], where: { campaignId: id }, _count: { _all: true } });
        const skips: any[] = await this.db().campaignRecipient.groupBy({ by: ['skipReason'], where: { campaignId: id, status: 'SKIPPED' }, _count: { _all: true } });
        const errors: any[] = await this.db().campaignRecipient.groupBy({ by: ['error'], where: { campaignId: id, status: 'FAILED' }, _count: { _all: true } });
        return {
            ...c, html: c.content ? undefined : c.html, legacy: !c.content, sending: this.running.has(id),
            recipientStatus: Object.fromEntries(counts.map((x) => [x.status, x._count._all])),
            skipReasons: Object.fromEntries(skips.map((x) => [x.skipReason || 'UNKNOWN', x._count._all])),
            errors: errors.map((x) => ({ error: x.error || 'Unknown error', count: x._count._all })).slice(0, 10),
        };
    }

    async create(input: DraftInput, actorId: string) {
        const d = this.normalizeDraft(input);
        const c = await this.db().campaign.create({
            data: { subject: d.subject || '', preheader: d.preheader, template: d.template, content: d.content as any, audienceSpec: d.audience as any, audience: d.audience.audience, html: '', status: 'DRAFT', createdBy: actorId, sentBy: null },
        });
        return this.get(c.id);
    }

    private async draftOrThrow(id: string) {
        const c = await this.db().campaign.findUnique({ where: { id } });
        if (!c) throw new NotFoundException('Campaign not found');
        if (c.status !== 'DRAFT') throw new ConflictException({ message: 'Only drafts can be changed.', code: 'NOT_DRAFT', status: c.status });
        return c;
    }

    async update(id: string, input: DraftInput) {
        await this.draftOrThrow(id);
        const d = this.normalizeDraft(input);
        await this.db().campaign.updateMany({ where: { id, status: 'DRAFT' }, data: { subject: d.subject, preheader: d.preheader, template: d.template, content: d.content as any, audienceSpec: d.audience as any, audience: d.audience.audience } });
        return this.get(id);
    }

    async duplicate(id: string, actorId: string) {
        const c = await this.db().campaign.findUnique({ where: { id } });
        if (!c) throw new NotFoundException('Campaign not found');
        if (!c.content) throw new BadRequestException('Campaigns sent with the old builder can’t be copied; start a new one.');
        return this.create({ subject: c.subject, preheader: c.preheader, template: c.template, content: c.content, audience: c.audienceSpec }, actorId);
    }

    async remove(id: string) {
        const c = await this.draftOrThrow(id);
        await this.db().campaign.deleteMany({ where: { id: c.id, status: 'DRAFT' } });
        return { ok: true };
    }

    // ── Preview, audience, test ────────────────────────────────────────

    async preview(id: string) {
        const c = await this.db().campaign.findUnique({ where: { id } });
        if (!c) throw new NotFoundException('Campaign not found');
        if (!c.content) return { html: c.html, text: '', products: [], missing: [], issues: [], legacy: true };
        // After sending, show exactly what went out (with a sample unsubscribe link).
        if (c.status !== 'DRAFT' && c.html) return { html: String(c.html).split(UNSUBSCRIBE_PLACEHOLDER).join(`${brandFromEnv().siteUrl}/unsubscribe?preview=1`), text: '', products: [], missing: [], issues: [] };
        // Sample link: the page explains it's a preview and changes nothing.
        return this.render(this.toDraft(c), `${brandFromEnv().siteUrl}/unsubscribe?preview=1`);
    }

    async audience(id: string) {
        const c = await this.db().campaign.findUnique({ where: { id } });
        if (!c) throw new NotFoundException('Campaign not found');
        const d = this.toDraft(c);
        const priced = d.template === 'PRODUCTS' && (d.content.productIds || []).length > 0;
        const r = await this.consent.eligibleRecipients(d.audience, { pricedContent: priced });
        return { eligible: r.recipients.length, considered: r.considered, excluded: r.excluded, pricedContent: priced, nonProduction: (process.env.NODE_ENV || '') !== 'production', sample: r.recipients.slice(0, 5).map((x) => ({ email: maskEmail(x.email), basis: x.basis })) };
    }

    /** Test email to the signed-in admin's own account address only (no consent check for that one address). */
    async sendTest(id: string, actorId: string) {
        const c = await this.db().campaign.findUnique({ where: { id } });
        if (!c || !c.content) throw new NotFoundException('Campaign not found');
        const me = await this.prisma.user.findUnique({ where: { id: actorId }, select: { email: true } });
        if (!me?.email) throw new BadRequestException('Your account has no email address.');
        const r = await this.render(this.toDraft(c), `${brandFromEnv().siteUrl}/unsubscribe?preview=1`);
        if (r.issues.includes('SUBJECT_MISSING')) throw new BadRequestException('Add a subject first.');
        const res = await this.email.sendMailDetailed(me.email, `[Test] ${c.subject}`, r.html, { text: r.text, unsubscribeUrl: `${brandFromEnv().siteUrl}/unsubscribe?preview=1` });
        const result = res.success ? `ACCEPTED${res.provider ? ` (${res.provider})` : ''}` : `FAILED: ${res.error || 'provider rejected the message'}`;
        await this.db().campaign.update({ where: { id }, data: { lastTestAt: new Date(), lastTestResult: result.slice(0, 500) } });
        return { ok: res.success, to: maskEmail(me.email), provider: res.provider || null, error: res.success ? null : (res.error || 'The email provider rejected the message.') };
    }

    // ── Send ───────────────────────────────────────────────────────────

    /**
     * Start sending a draft. `expectedRecipients` must match the server's
     * current eligible count (the number the admin confirmed); otherwise the
     * admin is asked to review again. Only one request can move DRAFT → SENDING.
     */
    async send(id: string, actorId: string, expectedRecipients?: number) {
        const c = await this.draftOrThrow(id);
        const d = this.toDraft(c);
        const r = await this.render(d, UNSUBSCRIBE_PLACEHOLDER);
        if (r.issues.length) throw new BadRequestException({ message: 'Fix the campaign before sending.', code: 'NOT_READY', issues: r.issues });
        const priced = d.template === 'PRODUCTS' && r.products.length > 0;
        const aud = await this.consent.eligibleRecipients(d.audience, { pricedContent: priced });
        if (!aud.recipients.length) throw new BadRequestException({ message: 'No one in this audience can receive marketing email.', code: 'NO_RECIPIENTS' });
        if (typeof expectedRecipients === 'number' && expectedRecipients !== aud.recipients.length) {
            throw new ConflictException({ message: 'The number of eligible recipients changed. Review the audience again.', code: 'AUDIENCE_CHANGED', eligible: aud.recipients.length });
        }
        const excludedTotal = Object.values(aud.excluded).reduce((a, b) => a + (b || 0), 0);
        const claimed = await this.db().campaign.updateMany({
            where: { id, status: 'DRAFT' },
            data: { status: 'SENDING', sendStartedAt: new Date(), sentBy: actorId, html: r.html, totalCount: aud.recipients.length, sentCount: 0, failedCount: 0, skippedCount: 0, audienceSpec: { ...d.audience, excludedAtStart: aud.excluded, excludedTotal } as any },
        });
        if (claimed.count !== 1) throw new ConflictException({ message: 'This campaign is already being sent.', code: 'ALREADY_SENDING' });
        await this.db().campaignRecipient.createMany({ data: aud.recipients.map((x) => ({ campaignId: id, email: normalizeEmail(x.email) })), skipDuplicates: true });
        void this.run(id, priced, { html: r.html, text: r.text, htmlNoPrices: r.htmlNoPrices, textNoPrices: r.textNoPrices });
        return this.get(id);
    }

    /** Continue a send that stopped (e.g. a restart). Only PENDING recipients are attempted; nobody gets it twice. */
    async resume(id: string) {
        const c = await this.db().campaign.findUnique({ where: { id } });
        if (!c) throw new NotFoundException('Campaign not found');
        if (c.status !== 'SENDING') throw new ConflictException({ message: 'Only a campaign that is still sending can be resumed.', code: 'NOT_SENDING' });
        if (this.running.has(id)) throw new ConflictException({ message: 'This campaign is already being sent.', code: 'ALREADY_SENDING' });
        const d = this.toDraft(c);
        const r = await this.render(d, UNSUBSCRIBE_PLACEHOLDER);
        void this.run(id, d.template === 'PRODUCTS' && r.products.length > 0, { html: c.html || r.html, text: r.text, htmlNoPrices: r.htmlNoPrices, textNoPrices: r.textNoPrices });
        return this.get(id);
    }

    /** Sends to each PENDING recipient, re-checking consent right before every send. */
    async run(id: string, pricedContent: boolean, v: { html: string; text: string; htmlNoPrices: string; textNoPrices: string }) {
        if (this.running.has(id)) return;
        this.running.add(id);
        try {
            const c = await this.db().campaign.findUnique({ where: { id }, select: { subject: true } });
            for (;;) {
                const batch: any[] = await this.db().campaignRecipient.findMany({ where: { campaignId: id, status: 'PENDING' }, take: 50, orderBy: { createdAt: 'asc' } });
                if (!batch.length) break;
                for (const rec of batch) {
                    // Claim the row; if another worker took it, skip.
                    const claim = await this.db().campaignRecipient.updateMany({ where: { id: rec.id, status: 'PENDING' }, data: { status: 'ATTEMPTING', attemptedAt: new Date() } });
                    if (claim.count !== 1) continue;
                    const gate = await this.consent.prepareSend(rec.email, { campaignId: id, pricedContent });
                    if (!gate.ok) { await this.db().campaignRecipient.update({ where: { id: rec.id }, data: { status: 'SKIPPED', skipReason: gate.reason } }); continue; }
                    // Wholesale prices only for buyer accounts, as on the site.
                    const html = gate.accountRole === 'CUSTOMER' ? v.html : v.htmlNoPrices;
                    const text = gate.accountRole === 'CUSTOMER' ? v.text : v.textNoPrices;
                    try {
                        const trackingId = await this.tracking.registerSentEmail({ recipient: rec.email, subject: c.subject, campaignId: id });
                        const wrapped = this.tracking.wrapLinks(html, trackingId)
                            // The unsubscribe link is never routed through click tracking.
                            .replace(/href="[^"]*__ATL_UNSUBSCRIBE_URL__[^"]*"/g, `href="${gate.unsubscribeUrl}"`)
                            .split(UNSUBSCRIBE_PLACEHOLDER).join(gate.unsubscribeUrl)
                            .replace(/<\/body>/i, `${this.tracking.trackingPixelHtml(trackingId)}</body>`);
                        const res = await this.email.sendMailDetailed(rec.email, c.subject, wrapped, { unsubscribeUrl: gate.oneClickUrl, text: text.split(UNSUBSCRIBE_PLACEHOLDER).join(gate.unsubscribeUrl) });
                        await this.db().campaignRecipient.update({ where: { id: rec.id }, data: res.success ? { status: 'ACCEPTED', provider: res.provider ?? null, providerId: res.id ?? null } : { status: 'FAILED', provider: res.provider ?? null, error: String(res.error || 'Provider rejected the message').slice(0, 300) } });
                    } catch (err: any) {
                        await this.db().campaignRecipient.update({ where: { id: rec.id }, data: { status: 'FAILED', error: String(err?.message || 'Send error').slice(0, 300) } });
                    }
                }
            }
            await this.finish(id);
        } catch (err: any) {
            this.logger.error(`[CAMPAIGN ${id}] send loop stopped: ${err?.message}`);
            await this.db().campaign.update({ where: { id }, data: { lastError: String(err?.message || 'Send stopped').slice(0, 500) } }).catch(() => undefined);
        } finally {
            this.running.delete(id);
        }
    }

    private async finish(id: string) {
        const counts: any[] = await this.db().campaignRecipient.groupBy({ by: ['status'], where: { campaignId: id }, _count: { _all: true } });
        const n = (s: string) => counts.find((x) => x.status === s)?._count._all ?? 0;
        const accepted = n('ACCEPTED'), failed = n('FAILED'), skipped = n('SKIPPED'), unknown = n('ATTEMPTING');
        const top: any[] = await this.db().campaignRecipient.groupBy({ by: ['error'], where: { campaignId: id, status: 'FAILED' }, _count: { _all: true } });
        top.sort((a, b) => b._count._all - a._count._all);
        const status = accepted === 0 ? 'FAILED' : (failed || unknown) ? 'PARTIAL' : 'SENT';
        await this.db().campaign.update({ where: { id }, data: { status, sentCount: accepted, failedCount: failed + unknown, skippedCount: skipped, sentAt: new Date(), lastError: top[0]?.error ?? null } });
        this.logger.log(`[CAMPAIGN ${id}] ${status}: ${accepted} accepted, ${failed} failed, ${skipped} skipped`);
    }
}
