jest.mock('../twofa.service', () => ({ TwoFaService: class {} }));
import { AuthService } from '../auth.service';
import { hashSecret } from '../verification';

/** In-memory Prisma stand-in for the user table (only what the flow touches). */
function setup() {
    const users: any[] = [];
    const match = (u: any, w: any) => Object.entries(w || {}).every(([k, v]: any) => {
        if (k === 'email' && v && typeof v === 'object' && 'equals' in v) return u.email.toLowerCase() === String(v.equals).toLowerCase();
        if (k === 'resetPasswordExpires' && v?.gt) return u.resetPasswordExpires > v.gt;
        return u[k] === v;
    });
    const apply = (u: any, data: any) => { for (const [k, v] of Object.entries(data)) u[k] = (v && typeof v === 'object' && 'increment' in (v as any)) ? (u[k] ?? 0) + (v as any).increment : v; };
    const prisma: any = {
        user: {
            findFirst: async ({ where }: any) => users.find((u) => match(u, where)) ?? null,
            findUnique: async ({ where }: any) => users.find((u) => match(u, where)) ?? null,
            create: async ({ data }: any) => {
                if (users.some((u) => u.email === data.email)) { const e: any = new Error('dup'); e.code = 'P2002'; e.meta = { target: ['email'] }; throw e; }
                const u = { id: `u${users.length + 1}`, createdAt: new Date(), emailVerifyAttempts: 0, ...data }; users.push(u); return u;
            },
            update: async ({ where, data }: any) => { const u = users.find((x) => match(x, where)); apply(u, data); return u; },
            updateMany: async ({ where, data }: any) => { const list = users.filter((x) => match(x, where)); list.forEach((u) => apply(u, data)); return { count: list.length }; },
        },
        refreshToken: { deleteMany: async () => ({ count: 0 }) },
    };
    const sent: { to: string; code?: string; kind: string }[] = [];
    const email: any = {
        sendSignupCode: async (to: string, _n: string, code: string) => { sent.push({ to, code, kind: 'code' }); return { success: true }; },
        sendSignupExisting: async (to: string) => { sent.push({ to, kind: 'existing' }); return { success: true }; },
        sendEmailVerified: async () => ({ success: true }), sendAdminSignupAlert: async () => true,
        sendPasswordResetEmail: async (to: string, _n: string, token: string) => { sent.push({ to, code: token, kind: 'reset' }); return true; },
    };
    const svc = new AuthService(prisma, {} as any, email, {} as any, {} as any, { notifyAdmins: async () => undefined } as any);
    return { svc, users, sent };
}
const good = { name: 'Dana Buyer', email: 'Dana@Wholesale.test', password: 'Pallet-Route-77', role: 'customer', companyName: 'Dana Wholesale BV' };

describe('sign-up → verify → sign-in', () => {
    it('creates an unverified, pending buyer and emails a code (no session issued)', async () => {
        const { svc, users, sent } = setup();
        const r: any = await svc.register(good);
        expect(r).toMatchObject({ verificationRequired: true, email: 'dana@wholesale.test' });
        expect(r.access_token).toBeUndefined();
        expect(users[0]).toMatchObject({ role: 'CUSTOMER', status: 'PENDING_APPROVAL', emailVerified: false, emailVerificationRequired: true });
        expect(users[0].emailVerifyCodeHash).toBe(hashSecret(sent[0].code!));
        expect(JSON.stringify(users[0])).not.toContain(`"${sent[0].code}"`);
    });
    it('refuses staff roles from the public form', async () => {
        const { svc } = setup();
        for (const role of ['ADMIN', 'OWNER', 'moderator']) await expect(svc.register({ ...good, role })).rejects.toMatchObject({ response: { code: 'INVALID_ROLE' } });
    });
    it('answers the same for an existing email and does not reveal it', async () => {
        const { svc, users, sent } = setup();
        users.push({ id: 'old', email: 'dana@wholesale.test', name: 'Dana', emailVerified: true, emailVerificationRequired: false });
        const r = await svc.register(good);
        expect(r).toEqual({ verificationRequired: true, email: 'dana@wholesale.test', pendingApproval: true, deliveryFailed: false });
        // A second attempt within 10 minutes sends nothing more (no inbox flooding).
        await svc.register(good);
        expect(sent.filter((x) => x.kind === 'existing')).toHaveLength(1);
        expect(users).toHaveLength(1);
        expect(sent[0].kind).toBe('existing');
    });
    it('blocks sign-in until verified, then verifies once with the right code', async () => {
        const { svc, users, sent } = setup();
        await svc.register(good);
        expect(() => svc.assertEmailVerified(users[0])).toThrow();
        await expect(svc.verifySignupCode(good.email, '000000' === sent[0].code ? '111111' : '000000')).rejects.toMatchObject({ response: { code: 'INVALID_CODE' } });
        expect(users[0].emailVerifyAttempts).toBe(1);
        const ok = await svc.verifySignupCode(good.email, sent[0].code!);
        expect(ok).toMatchObject({ verified: true });
        expect(users[0]).toMatchObject({ emailVerified: true, emailVerifyCodeHash: null });
        expect(() => svc.assertEmailVerified(users[0])).not.toThrow();
        await expect(svc.verifySignupCode(good.email, sent[0].code!)).resolves.toMatchObject({ alreadyVerified: true });
    });
    it('honours the resend cooldown and gives the same answer for unknown emails', async () => {
        const { svc, sent } = setup();
        await svc.register(good);
        const r = await svc.resendSignupCode(good.email);
        expect(r.retryAfter).toBeGreaterThan(0);
        expect(sent.filter((s) => s.kind === 'code')).toHaveLength(1);
        await expect(svc.resendSignupCode('nobody@x.test')).resolves.toEqual({ ok: true, retryAfter: 60, deliveryFailed: false });
    });
    it('reports a provider rejection honestly and allows an immediate retry', async () => {
        const { svc, users } = setup();
        (svc as any).emailService.sendSignupCode = async () => ({ success: false, error: 'domain not verified' });
        const r: any = await svc.register(good);
        expect(r.deliveryFailed).toBe(true);
        expect(users[0].emailVerifySentAt).toBeNull();
        expect(users[0].emailVerified).toBe(false);
    });
    it('rejects a weak password with the policy reasons', async () => {
        const { svc } = setup();
        await expect(svc.register({ ...good, password: 'Password1234' })).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD' } });
    });
    it('existing (pre-flow) users are not blocked', async () => {
        const { svc } = setup();
        expect(() => svc.assertEmailVerified({ emailVerified: false, emailVerificationRequired: false })).not.toThrow();
    });
    it('stores only a hash of the reset token and accepts the emailed one', async () => {
        const { svc, users, sent } = setup();
        users.push({ id: 'r', email: 'r@x.test', name: 'R', password: 'x' });
        await svc.forgotPassword('R@X.test');
        const raw = sent.find((s) => s.kind === 'reset')!.code!;
        expect(users[0].resetPasswordToken).toBe(hashSecret(raw));
        await expect(svc.checkResetToken(raw)).resolves.toEqual({ valid: true });
        await expect(svc.checkResetToken('nope')).resolves.toEqual({ valid: false });
    });
});
