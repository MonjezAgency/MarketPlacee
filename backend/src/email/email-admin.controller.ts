import { BadRequestException, Controller, Get, Post, Query, Body, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmailService } from './email.service';
import { renderProductUpdateEmail, renderReviewNotificationEmail, type RenderedEmail } from './marketing-template';

const site = () => (process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');
const domainOf = (addr?: string | null) => (String(addr || '').match(/@([^>\s]+)/)?.[1] || null);

/**
 * Email checks for the owner/admin — read-only except the test send, which
 * goes ONLY to the signed-in admin's own address. Never returns secret values.
 */
@Controller('admin/email')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
export class EmailAdminController {
    constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

    /** Which provider is configured, the sender, and (if the key may read it) the domain's verification status at Resend. */
    @Get('status')
    async status() {
        const key = process.env.RESEND_API_KEY;
        const from = process.env.RESEND_FROM || null;
        let domain: { name: string; status: string; region?: string } | null = null;
        let domainCheck: string;
        if (!key) domainCheck = 'RESEND_API_KEY is not set — email falls back to SMTP, which cloud hosts often block.';
        else {
            try {
                const r = await axios.get('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` }, timeout: 8000 });
                const want = domainOf(from) || 'atlantisfmcg.com';
                const d = (r.data?.data || []).find((x: any) => x?.name === want || want.endsWith(`.${x?.name}`));
                domain = d ? { name: d.name, status: d.status, region: d.region } : null;
                domainCheck = d ? `Domain ${d.name} is “${d.status}” at Resend.` : `No Resend domain matches ${want}.`;
            } catch (e: any) {
                const st = e?.response?.status;
                domainCheck = st === 401 || st === 403 ? 'The API key can send but can’t read domains (a sending-only key) — check the domain at resend.com/domains.' : 'Couldn’t reach Resend to read the domain status.';
            }
        }
        return {
            provider: key ? 'resend' : process.env.EMAIL_HOST || process.env.EMAIL_USER ? 'smtp' : 'none',
            resendKeySet: !!key,
            resendFrom: from,
            senderIssue: key && !from ? 'RESEND_FROM is not set, so mail is sent from onboarding@resend.dev, which only reaches the Resend account owner.' : null,
            smtpConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
            replyTo: process.env.EMAIL_USER || 'Info@atlantisfmcg.com',
            siteUrl: site(),
            domain,
            domainCheck,
        };
    }

    /** Render an email with real catalog data, without sending it. */
    @Get('preview')
    async preview(@Query('template') template = 'product-update') {
        const r = await this.render(template, `${site()}/unsubscribe?token=PREVIEW`);
        return { ...r, from: `Atlantis FMCG <${process.env.RESEND_FROM || 'onboarding@resend.dev'}>`, replyTo: process.env.EMAIL_USER || 'Info@atlantisfmcg.com' };
    }

    /**
     * Marketing consent of one account, looked up by its exact email. Answers
     * only what's needed to decide whether a marketing email may be sent.
     */
    @Get('consent')
    async consent(@Query('email') raw: string) {
        const email = String(raw || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter the full email address.');
        const user: any = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { role: true, status: true, notificationPrefs: true } });
        const sub: any = await this.prisma.newsletterSubscriber.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { status: true, consentAt: true, confirmedAt: true, unsubscribedAt: true, source: true } as any });
        const prefOptIn = (user?.notificationPrefs as any)?.marketingEmails === true;
        const suppressed = !!sub && sub.status !== 'ACTIVE';
        const eligible = !suppressed && (sub?.status === 'ACTIVE' || (prefOptIn && user?.status === 'ACTIVE'));
        return {
            account: user ? { exists: true, role: user.role, status: user.status, marketingEmailsOptIn: prefOptIn, preferenceStored: (user.notificationPrefs as any)?.marketingEmails !== undefined } : { exists: false },
            newsletter: sub ? { status: sub.status, consentAt: sub.consentAt, confirmedAt: sub.confirmedAt, unsubscribedAt: sub.unsubscribedAt, source: sub.source } : null,
            marketingEligible: eligible,
            reason: eligible ? 'Has given marketing consent and hasn’t unsubscribed.' : suppressed ? 'Unsubscribed or blocked — do not send marketing.' : 'No marketing consent recorded — do not send marketing.',
        };
    }

    /** One test email to the signed-in admin's OWN address. */
    @Post('test-send')
    @Throttle({ default: { limit: 3, ttl: 60 * 60_000 } })
    async testSend(@Request() req, @Body() body: { template?: string }) {
        const me: any = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { email: true } });
        if (!me?.email) throw new BadRequestException('Your account has no email address.');
        const r = await this.render(body?.template || 'product-update', `${site()}/unsubscribe?email=${encodeURIComponent(me.email)}`);
        const res = await this.email.sendMailDetailed(me.email, `[Test] ${r.subject}`, r.html, { text: r.text, unsubscribeUrl: `${site()}/unsubscribe?email=${encodeURIComponent(me.email)}` });
        return {
            sentTo: me.email, accepted: res.success, provider: res.provider ?? null, messageId: res.id ?? null, error: res.success ? null : res.error,
            note: res.success ? 'Accepted by the provider. That is not proof of inbox delivery — check the inbox (and spam), and the Resend log for this message ID.' : 'Not sent.',
        };
    }

    private async render(template: string, unsubscribeUrl: string): Promise<RenderedEmail> {
        if (template === 'review') {
            const p: any = await this.prisma.product.findFirst({ where: { status: 'APPROVED' }, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true } });
            return renderReviewNotificationEmail({ productName: p?.name || 'Example product', rating: 4, comment: 'Example comment — the real email shows the buyer’s review text.', reviewUrl: `${site()}/products/${p?.id || ''}#reviews`, settingsUrl: `${site()}/supplier/settings`, siteUrl: site() });
        }
        if (template !== 'product-update') throw new BadRequestException('Unknown template.');
        const since = new Date(Date.now() - 14 * 864e5);
        let products: any[] = await this.prisma.product.findMany({ where: { status: 'APPROVED', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, brand: true, images: true, origin: true, unitsPerCase: true, casesPerPallet: true } });
        let period = 'in the last two weeks';
        if (!products.length) { products = await this.prisma.product.findMany({ where: { status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, brand: true, images: true, origin: true, unitsPerCase: true, casesPerPallet: true } }); period = 'recently'; }
        return renderProductUpdateEmail({ siteUrl: site(), unsubscribeUrl, periodLabel: period, products: products.map((p) => ({ ...p, image: (p.images || []).find((u: string) => /^https?:\/\//.test(u) && !/\.svg($|\?)/i.test(u)) || null })) });
    }
}
