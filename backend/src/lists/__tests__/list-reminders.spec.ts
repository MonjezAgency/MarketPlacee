import { nextOccurrence, ListRemindersService } from '../list-reminders.service';

describe('list reorder reminders', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    it('computes the next repeat after now', () => {
        expect(nextOccurrence(new Date('2026-10-14T09:00:00Z'), 'weekly', now)!.toISOString()).toBe('2026-10-21T09:00:00.000Z');
        expect(nextOccurrence(new Date('2026-08-01T09:00:00Z'), 'monthly', now)!.toISOString().slice(0, 10)).toBe('2026-11-01');
        expect(nextOccurrence(new Date('2026-10-14T09:00:00Z'), 'none', now)).toBeNull();
    });
    it('notifies once per due date, even across overlapping runs', async () => {
        const lists: any[] = [{ id: 'l1', userId: 'u1', name: 'Weekly drinks', reminderRepeat: 'weekly', nextReminderAt: new Date('2026-10-14T09:00:00Z'), items: [{ id: 'a' }] }];
        const prisma: any = { shoppingList: {
            findMany: async () => lists.filter((l) => l.nextReminderAt && l.nextReminderAt <= now).map((l) => ({ ...l })),
            updateMany: async ({ where, data }: any) => { const l = lists.find((x) => x.id === where.id && x.nextReminderAt?.getTime() === where.nextReminderAt?.getTime()); if (!l) return { count: 0 }; Object.assign(l, data); return { count: 1 }; },
        } };
        const sent: string[] = [];
        const svc = new ListRemindersService(prisma, { notifyUser: async (u: string, t: string) => { sent.push(t); } } as any);
        await Promise.all([svc.runOnce(now), svc.runOnce(now)]);
        expect(sent).toEqual(['Time to reorder: Weekly drinks']);
        expect(lists[0].nextReminderAt.toISOString()).toBe('2026-10-21T09:00:00.000Z');
    });
});
