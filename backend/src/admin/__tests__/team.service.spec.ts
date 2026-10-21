jest.mock('bcrypt', () => ({ hash: async (p: string) => `hashed:${p}` }));
import { TeamService, invitationState, INVITE_TTL_MS } from '../team.service';
import { hashSecret } from '../../auth/verification';

/** In-memory stand-ins for the tables TeamService touches. Mailer is mocked: nothing is sent. */
function setup(opts: { mailOk?: boolean } = {}) {
    const users: any[] = [
        { id: 'owner', email: 'owner@atl.test', name: 'Olga Owner', role: 'OWNER', status: 'ACTIVE' },
        { id: 'admin', email: 'admin@atl.test', name: 'Adam Admin', role: 'ADMIN', status: 'ACTIVE' },
        { id: 'buyer', email: 'buyer@atl.test', name: 'Bea Buyer', role: 'CUSTOMER', status: 'ACTIVE' },
    ];
    const invites: any[] = [];
    const logs: any[] = [];
    const val = (row: any, k: string, cond: any): boolean => {
        const v = row[k];
        if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('equals' in cond) return String(v).toLowerCase() === String(cond.equals).toLowerCase();
            if ('gt' in cond) return v instanceof Date && v.getTime() > cond.gt.getTime();
            if ('in' in cond) return cond.in.includes(v);
            if ('not' in cond) return v !== cond.not;
        }
        return (v ?? null) === (cond ?? null);
    };
    const match = (row: any, where: any) => Object.entries(where || {}).every(([k, c]) => val(row, k, c));
    const table = (rows: any[], prefix: string) => ({
        findMany: async ({ where }: any = {}) => rows.filter((r) => match(r, where)),
        findFirst: async ({ where }: any) => rows.find((r) => match(r, where)) ?? null,
        findUnique: async ({ where }: any) => rows.find((r) => match(r, where)) ?? null,
        create: async ({ data }: any) => {
            if (prefix === 'u' && rows.some((r) => r.email === data.email)) { const e: any = new Error('dup'); e.code = 'P2002'; throw e; }
            const r = { id: `${prefix}${rows.length + 1}`, createdAt: new Date(), used: false, ...data }; rows.push(r); return r;
        },
        update: async ({ where, data }: any) => { const r = rows.find((x) => match(x, where)); Object.assign(r, data); return r; },
        updateMany: async ({ where, data }: any) => { const l = rows.filter((x) => match(x, where)); l.forEach((r) => Object.assign(r, data)); return { count: l.length }; },
        deleteMany: async () => ({ count: 0 }),
        groupBy: async () => [],
    });
    const prisma: any = {
        user: table(users, 'u'),
        inviteToken: table(invites, 'i'),
        userSession: table([], 's'),
        refreshToken: table([], 'r'),
        adminActionLog: { create: async ({ data }: any) => { logs.push(data); return data; } },
    };
    prisma.$transaction = async (fn: any) => fn(prisma);
    const mails: { to: string; html: string }[] = [];
    const email: any = {
        sendMailDetailed: async (to: string, _s: string, html: string) => {
            mails.push({ to, html });
            return opts.mailOk === false ? { success: false, error: 'RESEND_API_KEY not configured; SMTP fallback also failed: EAUTH', provider: 'none' } : { success: true, provider: 'resend' };
        },
    };
    const svc = new TeamService(prisma, email);
    const secretOf = (i = mails.length - 1) => decodeURIComponent(mails[i].html.match(/#token=([A-Za-z0-9_-]+)/)![1]);
    return { svc, users, invites, mails, logs, secretOf };
}
const OWNER = { id: 'owner', role: 'OWNER' };
const ADMIN = { id: 'admin', role: 'ADMIN' };
const PASSWORD = 'Harbour-Lantern-48';

describe('team invitations', () => {
    it('creates a hashed, single-use invitation and sends it; the raw secret appears only in the email link', async () => {
        const { svc, invites, mails, secretOf } = setup();
        const r: any = await svc.invite(ADMIN, { name: 'Sam Support', email: 'Support-Test@ATL.test', role: 'support' });
        expect(r.email.sent).toBe(true);
        expect(r.invitation).toMatchObject({ email: 'support-test@atl.test', role: 'SUPPORT', state: 'PENDING' });
        const secret = secretOf();
        expect(secret.length).toBeGreaterThanOrEqual(40);
        expect(invites[0].token).toBe(hashSecret(secret));
        expect(JSON.stringify(invites)).not.toContain(secret);
        expect(JSON.stringify(r)).not.toContain(secret);
        expect(mails[0].html).toContain('/auth/team-invite#token=');
        expect(invites[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(INVITE_TTL_MS - 5000);
    });

    it('reports a failed email honestly: 502, invitation NOT_SENT and its link unusable', async () => {
        const { svc, invites, secretOf } = setup({ mailOk: false });
        await expect(svc.invite(ADMIN, { name: 'Sam', email: 'sam@atl.test', role: 'SUPPORT' })).rejects.toMatchObject({ status: 502, response: { code: 'EMAIL_NOT_SENT' } });
        expect(invites[0].emailStatus).toBe('FAILED');
        expect(invitationState(invites[0])).toBe('NOT_SENT');
        expect(await svc.inspect(secretOf())).toEqual({ state: 'INVALID' });
        await expect(svc.accept({ token: secretOf(), password: PASSWORD, name: 'Sam' })).rejects.toMatchObject({ response: { code: 'INVALID' } });
    });

    it('inviting the same email again after a failed email reuses that row with a new secret', async () => {
        const s = setup({ mailOk: false });
        await expect(s.svc.invite(ADMIN, { name: 'Sam', email: 'sam@atl.test', role: 'SUPPORT' })).rejects.toMatchObject({ status: 502 });
        const first = s.secretOf();
        await expect(s.svc.invite(ADMIN, { name: 'Sam S', email: 'sam@atl.test', role: 'EDITOR' })).rejects.toMatchObject({ status: 502 });
        expect(s.invites).toHaveLength(1);
        expect(s.invites[0]).toMatchObject({ role: 'EDITOR', name: 'Sam S', emailStatus: 'FAILED' });
        expect(s.invites[0].token).not.toBe(hashSecret(first));
    });

    it('enforces who may invite which role', async () => {
        const { svc } = setup();
        await expect(svc.invite(ADMIN, { name: 'A', email: 'a2@atl.test', role: 'ADMIN' })).rejects.toMatchObject({ status: 403, response: { code: 'ROLE_NOT_GRANTABLE' } });
        await expect(svc.invite(OWNER, { name: 'A', email: 'a3@atl.test', role: 'OWNER' })).rejects.toMatchObject({ status: 403 });
        await expect(svc.invite({ id: 'x', role: 'SUPPORT' }, { name: 'A', email: 'a4@atl.test', role: 'SUPPORT' })).rejects.toMatchObject({ status: 403, response: { code: 'NOT_ALLOWED' } });
        await expect(svc.invite(OWNER, { name: 'A', email: 'a5@atl.test', role: 'ADMIN' })).resolves.toMatchObject({ email: { sent: true } });
    });

    it('refuses duplicates: an existing account, or a pending invitation (offers resend)', async () => {
        const { svc } = setup();
        await expect(svc.invite(ADMIN, { name: 'B', email: 'buyer@atl.test', role: 'SUPPORT' })).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_HAS_ACCOUNT' } });
        await expect(svc.invite(OWNER, { name: 'A', email: 'ADMIN@atl.test', role: 'SUPPORT' })).rejects.toMatchObject({ status: 409, response: { code: 'ALREADY_MEMBER' } });
        const first: any = await svc.invite(ADMIN, { name: 'S', email: 's@atl.test', role: 'SUPPORT' });
        await expect(svc.invite(ADMIN, { name: 'S', email: 's@atl.test', role: 'SUPPORT' })).rejects.toMatchObject({ status: 409, response: { code: 'INVITE_PENDING', invitationId: first.invitation.id } });
    });

    it('validates the form server-side', async () => {
        const { svc } = setup();
        await expect(svc.invite(ADMIN, { name: '', email: 'nope', role: '' })).rejects.toMatchObject({ status: 400, response: { errors: { name: expect.any(String), email: expect.any(String), role: expect.any(String) } } });
    });
});

describe('invitation lifecycle', () => {
    it('accept: sets the invitee’s own password, assigns the invited role, consumes the token once', async () => {
        const { svc, users, invites, secretOf } = setup();
        await svc.invite(ADMIN, { name: 'Sam Support', email: 'support-test@atl.test', role: 'SUPPORT' });
        const secret = secretOf();
        expect(await svc.inspect(secret)).toMatchObject({ state: 'PENDING', email: 'support-test@atl.test', role: 'SUPPORT', accountExists: false });
        await expect(svc.accept({ token: secret, name: 'Sam Support', password: 'short' })).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD' } });
        const r = await svc.accept({ token: secret, name: 'Sam Support', password: PASSWORD, role: 'OWNER' });
        expect(r).toEqual({ accepted: true, email: 'support-test@atl.test', role: 'SUPPORT' });
        const u = users.find((x) => x.email === 'support-test@atl.test');
        expect(u).toMatchObject({ role: 'SUPPORT', status: 'ACTIVE', password: `hashed:${PASSWORD}`, emailVerified: true });
        expect(invites[0]).toMatchObject({ used: true, acceptedUserId: u.id });
        expect(await svc.inspect(secret)).toEqual({ state: 'ACCEPTED' });
        await expect(svc.accept({ token: secret, name: 'Sam', password: PASSWORD })).rejects.toMatchObject({ status: 410, response: { code: 'USED' } });
    });

    it('expired and revoked links are refused', async () => {
        const { svc, invites, secretOf } = setup();
        await svc.invite(ADMIN, { name: 'E', email: 'e@atl.test', role: 'EDITOR' });
        invites[0].expiresAt = new Date(Date.now() - 1000);
        expect(await svc.inspect(secretOf())).toEqual({ state: 'EXPIRED' });
        await expect(svc.accept({ token: secretOf(), name: 'E', password: PASSWORD })).rejects.toMatchObject({ status: 410, response: { code: 'EXPIRED' } });

        await svc.invite(ADMIN, { name: 'R', email: 'r@atl.test', role: 'SUPPORT' });
        const rSecret = secretOf();
        await svc.revoke(ADMIN, invites[1].id);
        expect(await svc.inspect(rSecret)).toEqual({ state: 'REVOKED' });
        await expect(svc.accept({ token: rSecret, name: 'R', password: PASSWORD })).rejects.toMatchObject({ status: 410, response: { code: 'REVOKED' } });
        await expect(svc.resend(ADMIN, invites[1].id)).rejects.toMatchObject({ status: 409, response: { code: 'REVOKED' } });
    });

    it('resend issues a new secret and the old link stops working', async () => {
        const { svc, invites, secretOf } = setup();
        await svc.invite(ADMIN, { name: 'S', email: 's@atl.test', role: 'SUPPORT' });
        const old = secretOf();
        invites[0].expiresAt = new Date(Date.now() - 1000); // an expired invitation can be resent
        const r: any = await svc.resend(ADMIN, invites[0].id);
        expect(r.invitation.state).toBe('PENDING');
        const fresh = secretOf();
        expect(fresh).not.toBe(old);
        expect(await svc.inspect(old)).toEqual({ state: 'INVALID' });
        expect(await svc.inspect(fresh)).toMatchObject({ state: 'PENDING' });
    });

    it('an admin can’t resend or revoke an admin invitation the owner sent', async () => {
        const { svc, invites } = setup();
        await svc.invite(OWNER, { name: 'A', email: 'a9@atl.test', role: 'ADMIN' });
        await expect(svc.resend(ADMIN, invites[0].id)).rejects.toMatchObject({ status: 403 });
        await expect(svc.revoke(ADMIN, invites[0].id)).rejects.toMatchObject({ status: 403 });
    });

    it('rejects malformed and unknown tokens without detail', async () => {
        const { svc } = setup();
        expect(await svc.inspect('')).toEqual({ state: 'INVALID' });
        expect(await svc.inspect('x'.repeat(43))).toEqual({ state: 'INVALID' });
        await expect(svc.accept({ token: 'nope', password: PASSWORD })).rejects.toMatchObject({ status: 400 });
    });
});

describe('member changes', () => {
    const withSupport = () => {
        const s = setup();
        s.users.push({ id: 'sup', email: 'sup@atl.test', name: 'Sup', role: 'SUPPORT', status: 'ACTIVE' }, { id: 'admin2', email: 'a2@atl.test', name: 'A2', role: 'ADMIN', status: 'ACTIVE' });
        return s;
    };
    it('no self-escalation, owner protected, admins only by the owner', async () => {
        const { svc } = withSupport();
        await expect(svc.changeRole(ADMIN, 'admin', 'OWNER')).rejects.toMatchObject({ status: 403, response: { code: 'SELF' } });
        await expect(svc.changeRole(ADMIN, 'owner', 'SUPPORT')).rejects.toMatchObject({ status: 403, response: { code: 'OWNER_PROTECTED' } });
        await expect(svc.setActive(ADMIN, 'owner', false)).rejects.toMatchObject({ status: 403, response: { code: 'OWNER_PROTECTED' } });
        await expect(svc.changeRole(ADMIN, 'admin2', 'SUPPORT')).rejects.toMatchObject({ status: 403, response: { code: 'ADMIN_PROTECTED' } });
        await expect(svc.changeRole(ADMIN, 'sup', 'ADMIN')).rejects.toMatchObject({ status: 403, response: { code: 'ROLE_NOT_GRANTABLE' } });
        await expect(svc.setActive(OWNER, 'owner', false)).rejects.toMatchObject({ response: { code: 'SELF' } });
        await expect(svc.verifyKyc(ADMIN, 'admin')).rejects.toMatchObject({ response: { code: 'SELF' } });
    });
    it('allowed changes persist and are audited', async () => {
        const { svc, users, logs } = withSupport();
        await expect(svc.changeRole(ADMIN, 'sup', 'moderator')).resolves.toMatchObject({ changed: true, member: { role: 'MODERATOR' } });
        await expect(svc.setActive(ADMIN, 'sup', false)).resolves.toMatchObject({ member: { status: 'BLOCKED' } });
        await expect(svc.setActive(OWNER, 'admin2', false)).resolves.toMatchObject({ member: { status: 'BLOCKED' } });
        expect(users.find((u) => u.id === 'sup')).toMatchObject({ role: 'MODERATOR', status: 'BLOCKED' });
        expect(logs.map((l) => l.action)).toEqual(['TEAM_CHANGE_ROLE', 'TEAM_DEACTIVATE', 'TEAM_DEACTIVATE']);
        await expect(svc.changeRole(ADMIN, 'buyer', 'SUPPORT')).rejects.toMatchObject({ status: 404 });
    });
});
