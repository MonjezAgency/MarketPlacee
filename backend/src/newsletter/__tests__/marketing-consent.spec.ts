import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { decide, contactBasis, maskEmail } from '../marketing-consent';
import { MarketingConsentService } from '../marketing-consent.service';
import { NewsletterContactsService } from '../newsletter-contacts.service';
import { NewsletterService } from '../newsletter.service';
import { fakePrisma } from './fake-prisma';

/** Central eligibility rules, unsubscribe persistence and resubscribe paths. */

describe('decide (pure rules)', () => {
    it('excludes a contact without a recorded consent basis (imported / manual)', () => {
        expect(decide({ email: 'a@x.test', contact: { status: 'ACTIVE', consentBasis: 'NONE', source: 'import' } })).toEqual({ eligible: false, reason: 'NO_CONSENT' });
        expect(decide({ email: 'a@x.test', contact: { status: 'ACTIVE', consentSource: 'admin import', consentAt: new Date(), source: 'Bulk Upload' } })).toEqual({ eligible: false, reason: 'NO_CONSENT' });
        expect(decide({ email: 'a@x.test', contact: { status: 'ACTIVE', consentBasis: 'ADMIN_RECORDED', consentEvidence: '   ' } }).eligible).toBe(false);
        expect(decide({ email: 'a@x.test' })).toEqual({ eligible: false, reason: 'NO_CONSENT' });
    });

    it('accepts confirmed sign-ups, admin-recorded bases and explicit account opt-ins', () => {
        expect(decide({ email: 'a@x.test', contact: { status: 'ACTIVE', confirmedAt: new Date() } })).toEqual({ eligible: true, basis: 'FORM_DOUBLE_OPT_IN' });
        expect(decide({ email: 'a@x.test', contact: { status: 'ACTIVE', consentBasis: 'ADMIN_RECORDED', consentEvidence: 'Signed form, Gulfood 2026' } })).toEqual({ eligible: true, basis: 'ADMIN_RECORDED' });
        expect(decide({ email: 'a@x.test', account: { status: 'ACTIVE', role: 'CUSTOMER', marketingOptIn: true } })).toEqual({ eligible: true, basis: 'ACCOUNT_SETTING' });
        expect(decide({ email: 'a@x.test', account: { status: 'ACTIVE', role: 'CUSTOMER', marketingOptIn: false } }).eligible).toBe(false);
        expect(contactBasis({ status: 'ACTIVE', source: 'Homepage Footer' })).toBe('LEGACY_FORM');
    });

    it('a pending sign-up is not sendable until confirmed', () => {
        expect(decide({ email: 'a@x.test', contact: { status: 'PENDING', consentAt: new Date(), consentSource: 'footer' } })).toEqual({ eligible: false, reason: 'PENDING_CONFIRMATION' });
    });

    it('suppression wins over every contact basis', () => {
        const contact = { status: 'ACTIVE', confirmedAt: new Date() };
        expect(decide({ email: 'a@x.test', contact, suppression: { reason: 'UNSUBSCRIBED' } })).toEqual({ eligible: false, reason: 'UNSUBSCRIBED' });
        expect(decide({ email: 'a@x.test', contact, suppression: { reason: 'BOUNCED' } })).toEqual({ eligible: false, reason: 'BOUNCED' });
        expect(decide({ email: 'a@x.test', contact, suppression: { reason: 'UNSUBSCRIBED', liftedAt: new Date() } }).eligible).toBe(true);
    });

    it('an account opt-in after an unsubscribe counts only when the unsubscribe had switched it off', () => {
        const account = { status: 'ACTIVE', role: 'CUSTOMER', marketingOptIn: true };
        expect(decide({ email: 'a@x.test', account, suppression: { reason: 'UNSUBSCRIBED', accountPrefCleared: true } })).toEqual({ eligible: true, basis: 'ACCOUNT_SETTING', reoptInByAccount: true });
        expect(decide({ email: 'a@x.test', account, suppression: { reason: 'UNSUBSCRIBED', accountPrefCleared: false } }).eligible).toBe(false);
        expect(decide({ email: 'a@x.test', account, suppression: { reason: 'BLOCKED', accountPrefCleared: true } }).eligible).toBe(false);
    });

    it('rejects invalid addresses and masks addresses for logs', () => {
        expect(decide({ email: 'not-an-email' })).toEqual({ eligible: false, reason: 'INVALID_EMAIL' });
        expect(maskEmail('buyer@example.com')).toBe('bu***@example.com');
    });
});

function setup(seed: Parameters<typeof fakePrisma>[0] = {}) {
    const prisma: any = fakePrisma(seed);
    const consent = new MarketingConsentService(prisma);
    (consent as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const contacts = new NewsletterContactsService(prisma, consent);
    const email: any = { sendMailDetailed: jest.fn(async () => ({ success: true, provider: 'test' })) };
    const newsletter = new NewsletterService(prisma, email, consent);
    (newsletter as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { prisma, consent, contacts, newsletter, email };
}

describe('MarketingConsentService', () => {
    const prevEnv = process.env.NODE_ENV;
    afterAll(() => { process.env.NODE_ENV = prevEnv; });

    it('unsubscribe by token persists the event and timestamp, and survives deletion + re-import', async () => {
        const { prisma, consent, contacts } = setup({ subscribers: [{ id: 's1', email: 'buyer@atl.test', status: 'ACTIVE', confirmedAt: new Date() }] });
        const gate = await consent.prepareSend('Buyer@atl.test', { campaignId: 'c1' });
        expect(gate.ok).toBe(true);
        expect(gate.unsubscribeUrl).toMatch(/\/unsubscribe\?token=/);
        expect(gate.unsubscribeUrl).not.toContain('buyer');
        const token = decodeURIComponent(gate.unsubscribeUrl!.split('token=')[1]);

        const res = await consent.unsubscribe({ token, method: 'LINK' });
        expect(res.email).toBe('bu***@atl.test');
        expect(prisma.marketingSuppression.rows[0]).toMatchObject({ email: 'buyer@atl.test', reason: 'UNSUBSCRIBED', liftedAt: null });
        expect(prisma.marketingSuppression.rows[0].suppressedAt).toBeInstanceOf(Date);
        expect(prisma.marketingConsentEvent.rows.find((e: any) => e.type === 'UNSUBSCRIBED')).toMatchObject({ email: 'buyer@atl.test', source: 'LINK', campaignId: 'c1' });
        expect(prisma.newsletterSubscriber.rows[0]).toMatchObject({ status: 'UNSUBSCRIBED' });
        expect((await consent.check('buyer@atl.test'))).toEqual({ eligible: false, reason: 'UNSUBSCRIBED' });

        // Admin deletes the row, then re-imports the address with a recorded basis: still suppressed.
        await contacts.bulk(['s1'], 'delete', 'admin');
        const plan = { rows: [['buyer@atl.test', 'Buyer']], mapping: { email: 0, name: 1 }, consentEvidence: 'Trade fair list' };
        const out = await contacts.commitImport(plan, 'admin');
        expect(out.created).toBe(1);
        expect(out.summary.suppressed).toBe(1);
        expect(prisma.newsletterSubscriber.rows[0].consentBasis).toBe('NONE'); // basis not applied to a suppressed address
        expect((await consent.check('buyer@atl.test')).reason).toBe('UNSUBSCRIBED');
        expect((await consent.prepareSend('buyer@atl.test')).ok).toBe(false);

        // Manual re-add of the same address doesn't resubscribe either.
        await contacts.bulk([prisma.newsletterSubscriber.rows[0].id], 'delete', 'admin');
        await contacts.add({ email: 'buyer@atl.test', consentEvidence: 'Phone call' }, 'admin');
        expect((await consent.check('buyer@atl.test')).reason).toBe('UNSUBSCRIBED');
    });

    it('resubscribe happens only through the person’s own confirmed sign-up', async () => {
        const { prisma, consent, newsletter, email } = setup({
            subscribers: [{ id: 's1', email: 'buyer@atl.test', status: 'UNSUBSCRIBED', confirmedAt: new Date(Date.now() - 1e9), unsubscribedAt: new Date() }],
            suppressions: [{ id: 'x1', email: 'buyer@atl.test', reason: 'UNSUBSCRIBED', liftedAt: null }],
        });
        await newsletter.subscribe('buyer@atl.test', 'footer', undefined, undefined, { consent: true });
        // Signing up again sends a confirmation but doesn't make the address sendable yet.
        expect((await consent.check('buyer@atl.test')).eligible).toBe(false);
        const html = email.sendMailDetailed.mock.calls[0][2] as string;
        const token = decodeURIComponent(html.match(/token=([^"&]+)/)![1]);
        await newsletter.confirm(token);
        expect(prisma.marketingSuppression.rows[0].liftedAt).toBeInstanceOf(Date);
        expect(await consent.check('buyer@atl.test')).toEqual({ eligible: true, basis: 'FORM_DOUBLE_OPT_IN' });
        expect(prisma.marketingConsentEvent.rows.map((e: any) => e.type)).toEqual(expect.arrayContaining(['SUBSCRIBE_REQUESTED', 'CONFIRMED', 'RESUBSCRIBED']));
    });

    it('an admin block on top of an unsubscribe, then unblock, never makes the address sendable', async () => {
        const { consent, contacts } = setup({ subscribers: [{ id: 's1', email: 'b@atl.test', status: 'ACTIVE', confirmedAt: new Date() }] });
        await consent.unsubscribe({ email: 'b@atl.test' });
        await contacts.bulk(['s1'], 'unblock', 'admin'); // not blocked: skipped
        const r = await contacts.bulk(['s1'], 'block', 'admin');
        expect(r.done).toBe(1);
        await contacts.bulk(['s1'], 'unblock', 'admin');
        expect((await consent.check('b@atl.test')).reason).toBe('UNSUBSCRIBED');
    });

    it('unsubscribe switches the account’s marketing preference off; turning it back on later is an explicit re-opt-in', async () => {
        const { prisma, consent } = setup({ users: [{ id: 'u1', email: 'Buyer@Atl.test', role: 'CUSTOMER', status: 'ACTIVE', notificationPrefs: { marketingEmails: true, orderUpdates: true } }] });
        expect((await consent.check('buyer@atl.test')).basis).toBe('ACCOUNT_SETTING');
        await consent.unsubscribe({ email: 'buyer@atl.test' });
        expect(prisma.user.rows[0].notificationPrefs).toEqual({ marketingEmails: false, orderUpdates: true });
        expect((await consent.check('buyer@atl.test')).eligible).toBe(false);
        prisma.user.rows[0].notificationPrefs = { marketingEmails: true, orderUpdates: true }; // the user's own settings toggle
        const gate = await consent.prepareSend('buyer@atl.test');
        expect(gate.ok).toBe(true);
        expect(prisma.marketingSuppression.rows[0].liftedReason).toBe('ACCOUNT_SETTING_ON');
    });

    it('validates unsubscribe tokens: unknown, too short and tampered tokens are refused', async () => {
        const { consent } = setup({ subscribers: [{ id: 's1', email: 'b@atl.test', status: 'ACTIVE', confirmedAt: new Date() }] });
        await expect(consent.unsubscribe({ token: 'short' })).rejects.toBeInstanceOf(BadRequestException);
        await expect(consent.unsubscribe({ token: crypto.randomBytes(32).toString('base64url') })).rejects.toBeInstanceOf(BadRequestException);
        const gate = await consent.prepareSend('b@atl.test');
        const token = decodeURIComponent(gate.unsubscribeUrl!.split('token=')[1]);
        await expect(consent.unsubscribe({ token: token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA') })).rejects.toBeInstanceOf(BadRequestException);
        await expect(consent.unsubscribe({ email: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
        expect((await consent.check('b@atl.test')).eligible).toBe(true);
        await consent.unsubscribe({ token });
        expect((await consent.check('b@atl.test')).eligible).toBe(false);
        // Re-using the same link is harmless.
        await expect(consent.unsubscribe({ token })).resolves.toMatchObject({ ok: true });
    });

    it('outside production only test domains pass the pre-send gate', async () => {
        const { consent } = setup({ subscribers: [{ id: 's1', email: 'real@customer.com', status: 'ACTIVE', confirmedAt: new Date() }] });
        process.env.NODE_ENV = 'development';
        expect(await consent.prepareSend('real@customer.com')).toEqual({ ok: false, reason: 'NON_PRODUCTION' });
        process.env.NODE_ENV = 'production';
        expect((await consent.prepareSend('real@customer.com')).ok).toBe(true);
        process.env.NODE_ENV = prevEnv;
    });

    it('audience counts eligible recipients and exclusions by reason; priced content excludes suppliers', async () => {
        const { consent } = setup({
            subscribers: [
                { id: 'a', email: 'ok@atl.test', status: 'ACTIVE', confirmedAt: new Date() },
                { id: 'b', email: 'imp@atl.test', status: 'ACTIVE', consentBasis: 'NONE', source: 'import' },
                { id: 'c', email: 'pend@atl.test', status: 'PENDING' },
                { id: 'd', email: 'sup@atl.test', status: 'ACTIVE', confirmedAt: new Date() },
            ],
            users: [{ id: 'u', email: 'sup@atl.test', role: 'SUPPLIER', status: 'ACTIVE', notificationPrefs: {} }],
            suppressions: [],
        });
        const plain = await consent.eligibleRecipients({ audience: 'NEWSLETTER' });
        expect(plain.recipients.map((r) => r.email)).toEqual(['ok@atl.test', 'sup@atl.test']);
        expect(plain.excluded).toEqual({ NO_CONSENT: 1, PENDING_CONFIRMATION: 1 });
        const priced = await consent.eligibleRecipients({ audience: 'NEWSLETTER' }, { pricedContent: true });
        expect(priced.recipients.map((r) => r.email)).toEqual(['ok@atl.test']);
        expect(priced.excluded.SUPPLIER_PRICE_PRIVACY).toBe(1);
    });
});
