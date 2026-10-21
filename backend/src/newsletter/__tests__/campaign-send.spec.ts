import { ConflictException } from '@nestjs/common';
import { MarketingConsentService } from '../marketing-consent.service';
import { NewsletterCampaignsService } from '../newsletter-campaigns.service';
import { NewsletterAdminController, NewsletterController } from '../newsletter.controller';
import { RolesGuard } from '../../auth/roles.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { fakePrisma } from './fake-prisma';

/** Campaign send with a mocked mailer: consent re-checked per recipient, idempotent, honest status. */

function setup(opts: { fail?: boolean } = {}) {
    const prisma: any = fakePrisma({
        subscribers: [
            { id: 's1', email: 'ok1@atl.test', status: 'ACTIVE', confirmedAt: new Date() },
            { id: 's2', email: 'ok2@atl.test', status: 'ACTIVE', confirmedAt: new Date() },
            { id: 's3', email: 'gone@atl.test', status: 'ACTIVE', confirmedAt: new Date() },
            { id: 's4', email: 'nobasis@atl.test', status: 'ACTIVE', consentBasis: 'NONE', source: 'import' },
        ],
        users: [{ id: 'admin', email: 'admin@atl.test', role: 'ADMIN', status: 'ACTIVE' }],
        suppressions: [{ id: 'x', email: 'gone@atl.test', reason: 'UNSUBSCRIBED', liftedAt: null }],
    });
    const consent = new MarketingConsentService(prisma);
    (consent as any).logger = { log: jest.fn(), warn: jest.fn() };
    const email: any = { sendMailDetailed: jest.fn(async () => (opts.fail ? { success: false, error: 'RESEND_API_KEY not configured', provider: 'none' } : { success: true, provider: 'resend', id: 'm1' })) };
    const tracking: any = { registerSentEmail: jest.fn(async () => 'trk'), wrapLinks: jest.fn((h: string) => h.replace(/href="([^"]+)"/g, (_m, u) => `href="https://api.test/email/track/click/trk?u=${encodeURIComponent(u)}"`)), trackingPixelHtml: jest.fn(() => '<img src="https://api.test/p.png" alt="" />') };
    const svc = new NewsletterCampaignsService(prisma, consent, email, tracking);
    (svc as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { prisma, svc, email, consent };
}

async function draft(svc: NewsletterCampaignsService) {
    return svc.create({ subject: 'Hello', template: 'ANNOUNCEMENT', content: { headline: 'News', body: 'Body' }, audience: { audience: 'NEWSLETTER' } }, 'admin');
}
const settle = async (svc: any, id: string) => { for (let i = 0; i < 50 && svc.running.has(id); i++) await new Promise((r) => setTimeout(r, 5)); };

describe('NewsletterCampaignsService send', () => {
    const prev = process.env.NODE_ENV;
    afterEach(() => { process.env.NODE_ENV = prev; });

    it('sends only to eligible recipients, re-checks right before each send and never sends twice', async () => {
        const { prisma, svc, email } = setup();
        const c: any = await draft(svc);
        const aud = await svc.audience(c.id);
        expect(aud.eligible).toBe(2);
        expect(aud.excluded).toEqual({ UNSUBSCRIBED: 1, NO_CONSENT: 1 });

        // Someone unsubscribes after the admin confirmed but before their email goes out.
        const origPrepare = (svc as any).consent.prepareSend.bind((svc as any).consent);
        jest.spyOn((svc as any).consent, 'prepareSend').mockImplementation(async (e: any, ctx: any) => {
            if (e === 'ok2@atl.test') prisma.marketingSuppression.rows.push({ id: 'late', email: 'ok2@atl.test', reason: 'UNSUBSCRIBED', liftedAt: null });
            return origPrepare(e, ctx);
        });

        await svc.send(c.id, 'admin', 2);
        await settle(svc, c.id);
        const to = email.sendMailDetailed.mock.calls.map((x: any[]) => x[0]);
        expect(to).toEqual(['ok1@atl.test']);
        const html = email.sendMailDetailed.mock.calls[0][2] as string;
        // The link goes straight to the unsubscribe page (FRONTEND_URL), never through click tracking.
        expect(html).toMatch(/<a href="https?:\/\/[^"\/]+\/unsubscribe\?token=[A-Za-z0-9_-]{40,}"/);
        expect(html).not.toContain('__ATL_UNSUBSCRIBE_URL__');
        expect(email.sendMailDetailed.mock.calls[0][3].unsubscribeUrl).toMatch(/\/unsubscribe\/one-click\?token=/);

        const done = prisma.campaign.rows[0];
        expect(done).toMatchObject({ status: 'SENT', sentCount: 1, skippedCount: 1, failedCount: 0 });
        expect(prisma.campaignRecipient.rows.find((r: any) => r.email === 'ok2@atl.test')).toMatchObject({ status: 'SKIPPED', skipReason: 'UNSUBSCRIBED' });

        // A second send of the same campaign is refused; resuming attempts nobody again.
        await expect(svc.send(c.id, 'admin', 2)).rejects.toBeInstanceOf(ConflictException);
        prisma.campaign.rows[0].status = 'SENDING';
        await svc.resume(c.id); await settle(svc, c.id);
        expect(email.sendMailDetailed).toHaveBeenCalledTimes(1);
    });

    it('refuses to send when the confirmed recipient count is out of date', async () => {
        const { svc } = setup();
        const c: any = await draft(svc);
        await expect(svc.send(c.id, 'admin', 5)).rejects.toBeInstanceOf(ConflictException);
    });

    it('reports provider failures as FAILED, not as sent', async () => {
        const { prisma, svc } = setup({ fail: true });
        const c: any = await draft(svc);
        await svc.send(c.id, 'admin', 2); await settle(svc, c.id);
        expect(prisma.campaign.rows[0]).toMatchObject({ status: 'FAILED', sentCount: 0, failedCount: 2, lastError: 'RESEND_API_KEY not configured' });
    });

    it('outside production real-looking addresses are skipped, never emailed', async () => {
        const { prisma, svc, email } = setup();
        prisma.newsletterSubscriber.rows.push({ id: 's9', email: 'buyer@realcompany.com', status: 'ACTIVE', confirmedAt: new Date() });
        process.env.NODE_ENV = 'development';
        const c: any = await draft(svc);
        await svc.send(c.id, 'admin', 3); await settle(svc, c.id);
        expect(email.sendMailDetailed.mock.calls.map((x: any[]) => x[0])).not.toContain('buyer@realcompany.com');
        expect(prisma.campaignRecipient.rows.find((r: any) => r.email === 'buyer@realcompany.com').skipReason).toBe('NON_PRODUCTION');
    });

    it('test email goes only to the signed-in admin’s own address and reports provider errors', async () => {
        const { svc, email } = setup({ fail: true });
        const c: any = await draft(svc);
        const r = await svc.sendTest(c.id, 'admin');
        expect(email.sendMailDetailed.mock.calls[0][0]).toBe('admin@atl.test');
        expect(r).toMatchObject({ ok: false, to: 'ad***@atl.test', error: 'RESEND_API_KEY not configured' });
    });
});

describe('newsletter permissions metadata', () => {
    it('every admin route is OWNER/ADMIN behind JWT + roles guards', () => {
        expect(Reflect.getMetadata('roles', NewsletterAdminController)).toEqual(['ADMIN', 'OWNER']);
        expect(Reflect.getMetadata('__guards__', NewsletterAdminController)).toEqual([JwtAuthGuard, RolesGuard]);
        const proto = NewsletterAdminController.prototype as any;
        for (const m of Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor')) {
            const own = Reflect.getMetadata('roles', proto[m]);
            if (own) expect(own).toEqual(['ADMIN', 'OWNER']);
        }
    });

    it('public endpoints are only subscribe, confirm and unsubscribe; the diagnostic is admin-only', () => {
        const proto = NewsletterController.prototype as any;
        expect(Reflect.getMetadata('roles', proto.testEmail)).toEqual(['ADMIN', 'OWNER']);
        for (const m of ['subscribe', 'confirm', 'unsubscribe']) expect(Reflect.getMetadata('roles', proto[m])).toBeUndefined();
    });
});
