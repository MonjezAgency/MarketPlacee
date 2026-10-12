import { missingProfileFields, dueReminder } from '../profile-completion';
import { ProfileRemindersService } from '../profile-reminders.service';

const T0 = new Date('2026-10-12T10:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60000);
const base = { onboardingCompleted: false, emailVerified: true, status: 'ACTIVE', profileIncompleteSince: T0, name: 'Dana', companyName: '', businessType: '', country: '', phone: '' };

describe('profile completion', () => {
    it('lists missing required fields (website/city stay optional)', () => {
        expect(missingProfileFields({ name: 'A', companyName: 'B', businessType: 'Wholesaler', country: 'NL', phone: '+31' })).toEqual([]);
        expect(missingProfileFields({ name: 'A' })).toEqual(['companyName', 'businessType', 'country', 'phone']);
    });
});

describe('reminder schedule', () => {
    it('sends #1 at 30 min and #2 at 60 min, then stops', () => {
        expect(dueReminder(base, at(29))).toBeNull();
        expect(dueReminder(base, at(30))).toBe(1);
        expect(dueReminder({ ...base, profileReminder1SentAt: at(30) }, at(59))).toBeNull();
        expect(dueReminder({ ...base, profileReminder1SentAt: at(30) }, at(60))).toBe(2);
        expect(dueReminder({ ...base, profileReminder1SentAt: at(30), profileReminder2SentAt: at(60) }, at(600))).toBeNull();
    });
    it('keeps a gap if #1 was delayed (e.g. after downtime)', () => {
        expect(dueReminder({ ...base, profileReminder1SentAt: at(90) }, at(95))).toBeNull();
        expect(dueReminder({ ...base, profileReminder1SentAt: at(90) }, at(110))).toBe(2);
    });
    it('skips completed, unverified, opted-out, blocked or repeatedly failing accounts', () => {
        expect(dueReminder({ ...base, onboardingCompleted: true }, at(45))).toBeNull();
        expect(dueReminder({ ...base, companyName: 'X', businessType: 'Wholesaler', country: 'NL', phone: '+31' }, at(45))).toBeNull();
        expect(dueReminder({ ...base, emailVerified: false }, at(45))).toBeNull();
        expect(dueReminder({ ...base, notificationPrefs: { onboardingReminders: false } }, at(45))).toBeNull();
        expect(dueReminder({ ...base, status: 'BLOCKED' }, at(45))).toBeNull();
        expect(dueReminder({ ...base, profileReminderFailures: 3 }, at(45))).toBeNull();
    });
});

describe('ProfileRemindersService (in-memory DB)', () => {
    function setup(sendOk = true) {
        const users: any[] = [{ id: 'u1', email: 'u1@x.test', ...base, profileReminder1SentAt: null, profileReminder2SentAt: null, profileReminderFailures: 0 }];
        const match = (u: any, w: any) => Object.entries(w).every(([k, v]: any) => (v && typeof v === 'object' && !(v instanceof Date)) ? true : u[k] === v);
        const prisma: any = { user: {
            findMany: async () => users,
            findUnique: async ({ where }: any) => users.find((u) => u.id === where.id),
            updateMany: async ({ where, data }: any) => { const l = users.filter((u) => match(u, where)); l.forEach((u) => { for (const [k, v] of Object.entries(data)) u[k] = (v as any)?.increment ? (u[k] ?? 0) + (v as any).increment : v; }); return { count: l.length }; },
        } };
        const sent: number[] = [];
        const email: any = { sendProfileReminder: async (_e: string, _n: string, step: number) => { sent.push(step); return sendOk ? { success: true } : { success: false, error: 'rejected' }; } };
        return { svc: new ProfileRemindersService(prisma, email), users, sent };
    }
    it('sends each reminder once across repeated runs (restart/replica safe)', async () => {
        const { svc, sent } = setup();
        await svc.runOnce(at(31)); await svc.runOnce(at(32)); await Promise.all([svc.runOnce(at(33)), svc.runOnce(at(33))]);
        expect(sent).toEqual([1]);
        await svc.runOnce(at(61)); await svc.runOnce(at(62));
        expect(sent).toEqual([1, 2]);
        await svc.runOnce(at(500));
        expect(sent).toEqual([1, 2]);
    });
    it('does not send once the profile is complete', async () => {
        const { svc, users, sent } = setup();
        Object.assign(users[0], { companyName: 'Dana BV', businessType: 'Wholesaler', country: 'NL', phone: '+31612345678' });
        await svc.runOnce(at(40));
        expect(sent).toEqual([]);
    });
    it('releases the claim and counts a failure when the provider rejects', async () => {
        const { svc, users } = setup(false);
        await svc.runOnce(at(31));
        expect(users[0].profileReminder1SentAt).toBeNull();
        expect(users[0].profileReminderFailures).toBe(1);
    });
});
