import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Next date for a repeating reminder (null = one-off, done). */
export function nextOccurrence(from: Date, repeat: string, now = new Date()): Date | null {
    if (repeat !== 'weekly' && repeat !== 'monthly') return null;
    const d = new Date(from);
    do {
        if (repeat === 'weekly') d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1);
    } while (d.getTime() <= now.getTime());
    return d;
}

/**
 * Reorder reminders for shopping lists: when a list's date arrives the buyer
 * gets an in-app notification (it never places an order). Each reminder is
 * claimed with a conditional update, so restarts/replicas can't send it twice.
 */
@Injectable()
export class ListRemindersService {
    private readonly logger = new Logger(ListRemindersService.name);
    constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

    @Cron('*/10 * * * *')
    async tick() { await this.runOnce().catch((e) => this.logger.error(`List reminders failed: ${e?.message}`)); }

    async runOnce(now = new Date()) {
        const due = await this.prisma.shoppingList.findMany({ where: { nextReminderAt: { lte: now } } as any, take: 100, include: { items: { select: { id: true } } } });
        let sent = 0;
        for (const l of due as any[]) {
            const next = nextOccurrence(l.nextReminderAt, l.reminderRepeat, now);
            const claim = await this.prisma.shoppingList.updateMany({ where: { id: l.id, nextReminderAt: l.nextReminderAt } as any, data: { nextReminderAt: next, lastRemindedAt: now } as any });
            if (claim.count !== 1) continue;
            await this.notifications.notifyUser(l.userId, `Time to reorder: ${l.name}`,
                `Your list “${l.name}” (${l.items.length} ${l.items.length === 1 ? 'item' : 'items'}) is due today. Review it and add it to your cart — prices are refreshed.`,
                'INFO', { listId: l.id, link: '/dashboard/customer/lists' }).catch(() => undefined);
            sent++;
        }
        return { due: due.length, sent };
    }
}
