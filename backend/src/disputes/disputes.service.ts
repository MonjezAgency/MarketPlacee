import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { DisputeStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { EscrowService } from '../payments/escrow.service';

@Injectable()
export class DisputesService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
        private escrow: EscrowService,
    ) {}

    async create(customerId: string, orderId: string, reason: string, description: string, evidence: string[] = []) {
        const order = await this.prisma.order.findFirst({ where: { id: orderId, customerId } });
        if (!order) throw new NotFoundException('Order not found');

        if (['PENDING', 'CANCELLED'].includes(order.status)) {
            throw new BadRequestException('Cannot open a dispute on a pending or cancelled order');
        }

        const existing = await this.prisma.dispute.findFirst({
            where: { orderId, customerId, status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] } },
        });
        if (existing) throw new BadRequestException('An active dispute already exists for this order');

        const dispute = await this.prisma.dispute.create({
            data: { orderId, customerId, reason, description, evidence },
        });

        // Notify admins/support
        const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPPORT'] } } });
        for (const admin of admins) {
            this.notifications.create(
                admin.id,
                'New Dispute Opened',
                `Customer opened a dispute on order #${orderId.slice(-8).toUpperCase()}. Reason: ${reason}`,
                'WARNING',
                { disputeId: dispute.id, orderId },
            ).catch(() => {});
        }

        return dispute;
    }

    async findAll(page = 1, limit = 20, status?: DisputeStatus) {
        const where = status ? { status } : {};
        const skip = (page - 1) * limit;

        const [disputes, total] = await Promise.all([
            this.prisma.dispute.findMany({
                where,
                include: {
                    order: {
                        include: {
                            customer: { select: { id: true, name: true, email: true } },
                            items: {
                                take: 1,
                                include: { product: { select: { name: true } } },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.dispute.count({ where }),
        ]);

        return { data: disputes, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findMyDisputes(customerId: string) {
        return this.prisma.dispute.findMany({
            where: { customerId },
            include: {
                order: { select: { id: true, totalAmount: true, status: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const dispute = await this.prisma.dispute.findUnique({
            where: { id },
            include: {
                order: {
                    include: {
                        customer: { select: { id: true, name: true, email: true } },
                        items: { include: { product: { select: { name: true, images: true } } } },
                    },
                },
            },
        });
        if (!dispute) throw new NotFoundException('Dispute not found');
        return dispute;
    }

    async resolve(id: string, adminId: string, decision: 'RESOLVED_REFUND' | 'RESOLVED_NO_REFUND', resolution: string) {
        const dispute = await this.prisma.dispute.findUnique({ where: { id } });
        if (!dispute) throw new NotFoundException('Dispute not found');
        if (dispute.status === DisputeStatus.CLOSED) throw new BadRequestException('Dispute is already closed');

        const updated = await this.prisma.dispute.update({
            where: { id },
            data: {
                status: DisputeStatus[decision],
                resolution,
                resolvedBy: adminId,
                resolvedAt: new Date(),
            },
        });

        // If refund decision → trigger escrow refund (Stripe refund to customer)
        if (decision === 'RESOLVED_REFUND') {
            this.escrow.refundEscrow(dispute.orderId, dispute.customerId).catch(() => {});
        }

        // Notify customer
        this.notifications.create(
            dispute.customerId,
            'Dispute Resolved',
            decision === 'RESOLVED_REFUND'
                ? `Your dispute on order #${dispute.orderId.slice(-8).toUpperCase()} has been resolved. A refund will be issued.`
                : `Your dispute on order #${dispute.orderId.slice(-8).toUpperCase()} has been reviewed. No refund will be issued. Reason: ${resolution}`,
            decision === 'RESOLVED_REFUND' ? 'SUCCESS' : 'WARNING',
            { disputeId: id, orderId: dispute.orderId },
        ).catch(() => {});

        return updated;
    }

    async updateStatus(id: string, status: DisputeStatus) {
        const dispute = await this.prisma.dispute.findUnique({ where: { id } });
        if (!dispute) throw new NotFoundException('Dispute not found');
        return this.prisma.dispute.update({ where: { id }, data: { status } });
    }

    async getStats() {
        const [open, underReview, resolvedRefund, resolvedNoRefund] = await Promise.all([
            this.prisma.dispute.count({ where: { status: DisputeStatus.OPEN } }),
            this.prisma.dispute.count({ where: { status: DisputeStatus.UNDER_REVIEW } }),
            this.prisma.dispute.count({ where: { status: DisputeStatus.RESOLVED_REFUND } }),
            this.prisma.dispute.count({ where: { status: DisputeStatus.RESOLVED_NO_REFUND } }),
        ]);
        return { open, underReview, resolvedRefund, resolvedNoRefund, total: open + underReview + resolvedRefund + resolvedNoRefund };
    }
}
