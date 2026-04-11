import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AdminService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService
    ) { }

    async inviteTeamMember(data: any) {
        const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new BadRequestException('User already exists');
        }

        // Generate a random temporary password
        const tempPassword = crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Map frontend role names to Prisma Role enum
        const roleMap: Record<string, string> = {
            'admin': 'ADMIN',
            'moderator': 'MODERATOR',
            'support': 'SUPPORT',
            'editor': 'EDITOR',
            'super admin': 'ADMIN',
        };
        const prismaRole = roleMap[data.role.toLowerCase()] || data.role.toUpperCase();

        const user = await this.prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                name: data.name,
                role: prismaRole as any,
                permissions: data.permissions || [],
                status: 'ACTIVE',
                emailVerified: true,
            },
        });

        // Non-blocking email: don't let SMTP failures prevent user creation
        this.emailService.sendTeamInvitation(user.email, user.name, user.role, tempPassword).catch((err) => {
            console.error(`[TEAM] Failed to send invitation email to ${user.email}:`, err.message);
        });

        return {
            message: 'Invitation sent successfully',
            userId: user.id
        };
    }

    async getTeamMembers() {
        return this.prisma.user.findMany({
            where: {
                role: { in: ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR'] }
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                permissions: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async deleteTeamMember(id: string) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) throw new NotFoundException('User not found');
        if (!['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR'].includes(user.role)) {
            throw new BadRequestException('Cannot delete non-team users from this endpoint');
        }

        // Delete all related records in a transaction to avoid FK constraints
        await this.prisma.$transaction(async (tx) => {
            // Delete order items for orders placed by this user
            const orders = await tx.order.findMany({ where: { buyerId: id }, select: { id: true } });
            const orderIds = orders.map(o => o.id);
            if (orderIds.length > 0) {
                await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
                await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
                await tx.order.deleteMany({ where: { buyerId: id } });
            }
            await tx.product.deleteMany({ where: { supplierId: id } });
            await tx.user.delete({ where: { id } });
        });

        return { message: 'Team member removed successfully' };
    }
}
