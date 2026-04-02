import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly chatGateway: ChatGateway,
    ) {}

    async create(userId: string, title: string, message: string, type: NotificationType = 'INFO', data?: any) {
        const notification = await this.prisma.notification.create({
            data: { userId, title, message, type, data: data ?? undefined },
        });

        // Push in real-time via WebSocket
        try {
            this.chatGateway.emitToUser(userId, 'new_notification', notification);
        } catch {
            this.logger.warn(`Could not push notification to user ${userId} — offline`);
        }

        return notification;
    }

    async findByUser(userId: string) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
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
