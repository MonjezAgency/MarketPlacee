import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../common/prisma.service';
import { CryptoService } from '../security/crypto.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class UsersService {
    constructor(
        private prisma: PrismaService,
        private cryptoService: CryptoService,
        private emailService: EmailService
    ) { }

    async findOne(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }

    async create(data: any) {
        const existing = await this.findOne(data.email);
        if (existing) {
            throw new ConflictException('User already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Encrypt sensitive billing data before saving
        const encryptedData = { ...data };
        if (encryptedData.iban) encryptedData.iban = this.cryptoService.encrypt(encryptedData.iban);
        if (encryptedData.swiftCode) encryptedData.swiftCode = this.cryptoService.encrypt(encryptedData.swiftCode);
        if (encryptedData.taxId) encryptedData.taxId = this.cryptoService.encrypt(encryptedData.taxId);

        return this.prisma.user.create({
            data: {
                ...encryptedData,
                password: hashedPassword,
                role: (data.role as Role) || Role.CUSTOMER,
                status: 'PENDING_APPROVAL',
            },
        });
    }

    async findAll(status?: any, page = 1, limit = 20) {
        const whereCondition: any = status ? { status } : {};
        
        // Strict Business Logic: Do not show Google SSO users to Admins for approval until they fill out onboarding
        if (status === 'PENDING_APPROVAL') {
            whereCondition.companyName = { not: null };
            whereCondition.phone = { not: null };
        }

        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where: whereCondition,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.user.count({ where: whereCondition }),
        ]);

        return { users, total, page, lastPage: Math.ceil(total / limit) };
    }

    // Explicit method for Admin reconciliation, decrypts sensitive billing fields
    async findDecryptedAll(status?: any, page = 1, limit = 20) {
        const { users, total, lastPage } = await this.findAll(status, page, limit);
        const decryptedUsers = users.map(user => {
            if (user.iban) user.iban = this.cryptoService.decrypt(user.iban);
            if (user.swiftCode) user.swiftCode = this.cryptoService.decrypt(user.swiftCode);
            if (user.taxId) user.taxId = this.cryptoService.decrypt(user.taxId);
            return user;
        });
        return { users: decryptedUsers, total, page, lastPage };
    }

    async approveAllPending() {
        const pending = await this.prisma.user.findMany({
            where: { 
                status: 'PENDING_APPROVAL',
                companyName: { not: null },
                phone: { not: null }
            }
        });

        let approved = 0;
        let failed = 0;

        for (const user of pending) {
            try {
                await this.updateStatus(user.id, 'ACTIVE');
                approved++;
            } catch (err) {
                console.error(`[ADMIN_BULK_APPROVE_ERROR] Failed for user ${user.id}:`, err.message);
                failed++;
            }
        }

        return { approved, failed, total: pending.length };
    }

    async updateStatus(id: string, status: any) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        const updated = await this.prisma.user.update({
            where: { id },
            data: { status },
        });

        // Trigger welcome/approval email if user is activated from pending state
        if (status === 'ACTIVE' && user && user.status === 'PENDING_APPROVAL') {
            await this.emailService.sendWelcomeEmail(updated.email, updated.name, updated.role);
        }

        return updated;
    }

    async deleteUser(id: string) {
        return this.prisma.user.delete({
            where: { id },
        });
    }

    async updateProfile(id: string, data: any) {
        const updateData = { ...data };
        // Encrypt sensitive billing data if being updated
        if (updateData.iban) updateData.iban = this.cryptoService.encrypt(updateData.iban);
        if (updateData.swiftCode) updateData.swiftCode = this.cryptoService.encrypt(updateData.swiftCode);
        if (updateData.taxId) updateData.taxId = this.cryptoService.encrypt(updateData.taxId);

        return this.prisma.user.update({
            where: { id },
            data: updateData,
        });
    }

    async getNotifications(userId: string) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
    }

    async markNotificationAsRead(id: string) {
        return this.prisma.notification.update({
            where: { id },
            data: { read: true }
        });
    }
}
