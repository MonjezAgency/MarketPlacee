import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { notificationLink } from './notification-links';

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly chatGateway: ChatGateway,
    ) {}

    /**
     * One persisted notification for one user. `data` may carry:
     *  • `kind` + `params` — the event, so the bell can show it in the reader's language;
     *  • `dedupeKey` — the same event for the same user is stored once (retries, double clicks);
     *  • `link` — where it opens; when absent it is derived from the record ids for the
     *    recipient's role (notification-links.ts), so it never points at a page they can't use.
     */
    async create(userId: string, title: string, message: string, type: NotificationType = 'INFO', data?: any) {
        if (data?.dedupeKey) {
            const existing = await this.prisma.notification.findFirst({ where: { userId, data: { path: ['dedupeKey'], equals: String(data.dedupeKey) } } }).catch(() => null);
            // Marked so callers can tell "already sent" from "sent now"; it is not pushed again.
            if (existing) return Object.assign(existing, { duplicate: true as const });
        }
        if (data && !data.link && (data.orderId || data.productId || data.targetPriceRequestId || data.offerId || data.disputeId || data.userId)) {
            const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } }).catch(() => null);
            const link = notificationLink(user?.role, data);
            if (link) data = { ...data, link };
        }
        const notification = await this.prisma.notification.create({
            data: { userId, title, message, type, data: data ?? undefined },
        });

        // Push in real-time via WebSocket
        try {
            this.chatGateway.emitToUser(userId, 'new_notification', notification);
        } catch (_e) {
            this.logger.warn(`Could not push notification to user ${userId} — offline`);
        }

        return notification;
    }

    async notifyAdmins(title: string, message: string, type: NotificationType = 'INFO', data?: any) {
        const admins = await this.prisma.user.findMany({
            where: {
                role: {
                    in: ['ADMIN', 'OWNER']
                }
            },
            select: { id: true }
        });

        const promises = admins.map(admin => 
            this.create(admin.id, title, message, type, data)
        );

        return Promise.all(promises);
    }

    async notifyUser(userId: string, title: string, message: string, type: NotificationType = 'INFO', data?: any) {
        return this.create(userId, title, message, type, data);
    }

    /** The user's own notifications, newest first. `unread` filters, `before` (ISO date) pages back, `limit` 1–100 (default 50). */
    async findByUser(userId: string, q: { unread?: boolean; before?: string; limit?: number } = {}) {
        const where: any = { userId };
        if (q.unread) where.read = false;
        const before = q.before ? new Date(q.before) : null;
        if (before && !isNaN(before.getTime())) where.createdAt = { lt: before };
        const take = Math.min(100, Math.max(1, Math.floor(Number(q.limit) || 50)));
        return this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take });
    }

    async getUnreadCount(userId: string): Promise<number> {
        return this.prisma.notification.count({ where: { userId, read: false } });
    }

    async markRead(notificationId: string, userId: string) {
        return this.prisma.notification.updateMany({
            where: { id: notificationId, userId },
            data: { read: true },
        });
    }

    async markAllRead(userId: string) {
        return this.prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true },
        });
    }
}
