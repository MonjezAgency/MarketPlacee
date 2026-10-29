import * as crypto from 'crypto';
import { Injectable, BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { MarketingConsentService } from './marketing-consent.service';
import { isValidEmail, maskEmail, normalizeEmail } from './marketing-consent';

/**
 * Public newsletter sign-up (double opt-in), confirmation and unsubscribe.
 * Admin contact management lives in NewsletterContactsService, campaigns in
 * NewsletterCampaignsService; the consent rules in marketing-consent.ts.
 */
@Injectable()
export class NewsletterService {
    private readonly logger = new Logger(NewsletterService.name);
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
        private consent: MarketingConsentService,
    ) {}
    private db() { return this.prisma as any; }

    /**
     * Marketing consent is given only by the explicit checkbox on the form
     * (`consent: true`); the address becomes sendable only after the emailed
     * link is confirmed. An unsubscribed address needs that same fresh
     * confirmation — never a silent re-activation. The answer is the same
     * whatever the address's state, so the form can't reveal who is subscribed.
     */
    async subscribe(email: string, source?: string, region?: string, name?: string, opts: { consent?: boolean; policyVersion?: string; userId?: string | null } = {}) {
        const trimmed = normalizeEmail(email);
        if (!isValidEmail(trimmed)) throw new BadRequestException('Enter a valid email address.');
        if (opts.consent !== true) throw new BadRequestException('Tick the box to agree to receive the newsletter.');
        const generic = { ok: true, status: 'CHECK_EMAIL', message: 'Almost done — check your inbox and click the link to confirm your subscription.' };

        const existing: any = await this.db().newsletterSubscriber.findUnique({ where: { email: trimmed } });
        const sup: any = await this.db().marketingSuppression.findUnique({ where: { email: trimmed } });
        const activeSup = sup && !sup.liftedAt ? sup.reason : null;
        // Already confirmed and not suppressed: nothing to do.
        if (existing?.status === 'ACTIVE' && existing.confirmedAt && !activeSup) return generic;
        // Admin blocks and hard bounces aren't lifted by the form.
        if ((existing && ['BLOCKED', 'BOUNCED'].includes(existing.status)) || activeSup === 'BLOCKED' || activeSup === 'BOUNCED' || activeSup === 'COMPLAINED') return generic;
        if (existing?.status === 'PENDING' && existing.confirmSentAt && Date.now() - +new Date(existing.confirmSentAt) < 10 * 60_000) return generic;

        const token = crypto.randomBytes(24).toString('base64url');
        const data: any = {
            // An ACTIVE row without confirmation (imported, manual, legacy) stays ACTIVE;
            // confirmation adds FORM_DOUBLE_OPT_IN. Unsubscribed rows wait for the click.
            status: existing?.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
            consentAt: new Date(), consentSource: (source || 'footer').slice(0, 60), policyVersion: (opts.policyVersion || 'v1').slice(0, 20),
            confirmTokenHash: crypto.createHash('sha256').update(token).digest('hex'), confirmSentAt: new Date(),
            unsubscribeToken: existing?.unsubscribeToken || crypto.randomBytes(24).toString('base64url'),
            source: existing?.source || source || 'website_form', region: existing?.region || region || null, name: existing?.name || name || null,
            userId: opts.userId || existing?.userId || null,
        };
        const row = existing
            ? await this.db().newsletterSubscriber.update({ where: { email: trimmed }, data })
            : await this.db().newsletterSubscriber.create({ data: { email: trimmed, ...data } });
        await this.consent.recordEvent(trimmed, 'SUBSCRIBE_REQUESTED', { source: data.consentSource, detail: { policyVersion: data.policyVersion } });

        const base = process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com';
        const link = `${base}/newsletter/confirm?token=${encodeURIComponent(token)}`;
        const result = await this.emailService.sendMailDetailed(trimmed, 'Confirm your Ali FMCG newsletter subscription',
            `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px;color:#0F172A">
              <h2 style="margin:0 0 8px">Confirm your subscription</h2>
              <p style="color:#475569;line-height:1.6">You asked to receive the Ali FMCG newsletter: FMCG market updates with new products and offers on the Ali FMCG marketplace.</p>
              <p style="margin:24px 0"><a href="${link}" style="background:#0B1F3A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Confirm subscription</a></p>
              <p style="color:#64748B;font-size:12px">If you didn't ask for this, ignore this email — you won't be subscribed.</p></div>`);
        if (!result.success) {
            this.logger.error(`[NEWSLETTER_CONFIRM_FAIL] ${row.id}: ${result.error || 'provider rejected'}`);
            await this.db().newsletterSubscriber.update({ where: { id: row.id }, data: { confirmSentAt: null } }).catch(() => {});
            throw new ServiceUnavailableException('We couldn’t send the confirmation email right now. Please try again later.');
        }
        return generic;
    }

    /** Double opt-in: activates the subscription for the emailed token and lifts an earlier unsubscribe. */
    async confirm(token: string) {
        if (!token || token.length < 20) throw new BadRequestException('This confirmation link is invalid.');
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        const row: any = await this.db().newsletterSubscriber.findUnique({ where: { confirmTokenHash: hash } });
        if (!row) throw new BadRequestException('This confirmation link is invalid or was already used.');
        if (row.confirmSentAt && Date.now() - +new Date(row.confirmSentAt) > 7 * 86_400_000) throw new BadRequestException('This confirmation link has expired. Subscribe again to get a new one.');
        if (['BLOCKED', 'BOUNCED'].includes(row.status)) throw new BadRequestException('This address can’t receive the newsletter.');
        const email = normalizeEmail(row.email);
        const sup: any = await this.db().marketingSuppression.findUnique({ where: { email } });
        if (sup && !sup.liftedAt && sup.reason !== 'UNSUBSCRIBED') throw new BadRequestException('This address can’t receive the newsletter.');
        await this.db().newsletterSubscriber.update({ where: { id: row.id }, data: { status: 'ACTIVE', confirmedAt: new Date(), consentBasis: 'FORM_DOUBLE_OPT_IN', confirmTokenHash: null, unsubscribedAt: null } });
        await this.consent.recordEvent(email, 'CONFIRMED', { source: row.consentSource || 'form' });
        // The person's own confirmed opt-in is the only way an unsubscribe is undone.
        await this.consent.liftSuppression(email, 'CONFIRMED_SIGNUP');
        return { ok: true, status: 'ACTIVE', email: maskEmail(row.email) };
    }

    unsubscribe(input: { token?: string; email?: string; method?: string }) {
        return this.consent.unsubscribe(input);
    }

    /**
     * Diagnostic — one plain email through the same pipeline, returning the
     * provider's answer (used by Admin → Email setup). Not marketing content.
     */
    async sendTestEmail(to: string) {
        if (!to || !isValidEmail(normalizeEmail(to))) throw new BadRequestException('A valid recipient email is required');
        const html = `<div style="font-family:Arial,sans-serif;padding:24px;max-width:520px;margin:auto;"><h2 style="color:#0F172A;">Ali FMCG test email</h2><p style="color:#475569;">If you can read this, the Ali FMCG email pipeline reached your inbox.</p><p style="color:#64748B;font-size:12px;">Sent at ${new Date().toISOString()}</p></div>`;
        return this.emailService.sendMailDetailed(to, 'Ali FMCG · Email Pipeline Test', html);
    }
}
