import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common';
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

    async findById(id: string) {
        return this.prisma.user.findUnique({ where: { id } });
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
        if (encryptedData.vatNumber) encryptedData.vatNumber = this.cryptoService.encrypt(encryptedData.vatNumber);

        return this.prisma.user.create({
            data: {
                ...encryptedData,
                password: hashedPassword,
                role: (data.role as Role) || Role.CUSTOMER,
                status: 'PENDING_APPROVAL',
            },
        });
    }

    async findAll(status?: any, page = 1, limit = 1000, search?: string, role?: string) {
        const whereCondition: any = {};
        if (!status) {
            // By default, don't show users who have been "deleted" (anonymized)
            // We use the email pattern as it's more reliable than the status enum if migration hasn't run
            whereCondition.email = { not: { contains: '@removed.invalid' } };
        } else {
            whereCondition.status = status;
        }

        if (role) whereCondition.role = role;
        
        if (search) {
            whereCondition.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
            ];
        }

        // We no longer strictly filter PENDING_APPROVAL by companyName/phone here
        // to ensure Google signups (who haven't finished onboarding) are visible to admins.

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
    async findDecryptedAll(status?: any, page = 1, limit = 20, search?: string) {
        const { users, total, lastPage } = await this.findAll(status, page, limit, search);
        const decryptedUsers = users.map(user => {
            if (user.iban) user.iban = this.cryptoService.decrypt(user.iban);
            if (user.swiftCode) user.swiftCode = this.cryptoService.decrypt(user.swiftCode);
            if (user.taxId) user.taxId = this.cryptoService.decrypt(user.taxId);
            if (user.vatNumber) user.vatNumber = this.cryptoService.decrypt(user.vatNumber);
            return user;
        });
        return { users: decryptedUsers, total, page, lastPage };
    }

    async approveAllPending() {
        const pending = await this.prisma.user.findMany({
            where: { 
                status: 'PENDING_APPROVAL',
                // For bulk approval, we still prefer they have a name at least
                name: { not: null }
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

        // Trigger rejection email if user is rejected from pending state
        if (status === 'REJECTED' && user && user.status === 'PENDING_APPROVAL') {
            await this.emailService.sendRejectionEmail(updated.email, updated.name);
        }

        return updated;
    }

    async deleteUser(id: string) {
        try {
            // 1. Try to hard delete first (works if no orders/products exist)
            return await this.prisma.user.delete({
                where: { id },
            });
        } catch (error) {
            // 2. Fallback to Anonymization (Soft Delete)
            // This handles the "Foreign key constraint failed on the field" error (Prisma P2003)
            console.warn(`[UsersService] User ${id} cannot be hard-deleted (likely has orders/products). Anonymizing instead.`);
            
            return await this.prisma.user.update({
                where: { id },
                data: {
                    status: 'BLOCKED', 
                    email: `deleted_${id}_${Date.now()}@removed.invalid`,
                    name: 'Deleted User (Archived)',
                    password: 'DELETED_' + Math.random().toString(36).substring(7),
                    phone: null,
                    avatar: null,
                    companyName: 'Archived Entity',
                    iban: null,
                    swiftCode: null,
                    taxId: null,
                    vatNumber: null,
                    stripeAccountId: null,
                    twoFactorSecret: null,
                    onboardingCompleted: false
                },
            });
        }
    }

    async bulkUpdateStatus(ids: string[], status: string) {
        const results = { updated: 0, failed: 0 };
        for (const id of ids) {
            try {
                await this.updateStatus(id, status);
                results.updated++;
            } catch (err) {
                console.error(`[BULK_UPDATE_ERROR] User ${id}:`, err.message);
                results.failed++;
            }
        }
        return results;
    }

    async bulkDelete(ids: string[]) {
        const results = { deleted: 0, failed: 0 };
        for (const id of ids) {
            try {
                await this.deleteUser(id);
                results.deleted++;
            } catch (err) {
                console.error(`[BULK_DELETE_ERROR] User ${id}:`, err.message);
                results.failed++;
            }
        }
        return results;
    }

    async updateProfile(id: string, data: any) {
        const updateData = { ...data };
        // Encrypt sensitive billing data if being updated
        if (updateData.iban) updateData.iban = this.cryptoService.encrypt(updateData.iban);
        if (updateData.swiftCode) updateData.swiftCode = this.cryptoService.encrypt(updateData.swiftCode);
        if (updateData.taxId) updateData.taxId = this.cryptoService.encrypt(updateData.taxId);
        if (updateData.vatNumber) updateData.vatNumber = this.cryptoService.encrypt(updateData.vatNumber);

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

    // ─── GDPR: Data Export ─────────────────────────────────────────────
    async exportMyData(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                customerOrders: {
                    include: { items: true },
                    orderBy: { createdAt: 'desc' },
                },
                reviews: true,
                wishlist: true,
                notifications: { take: 100, orderBy: { createdAt: 'desc' } },
            },
        });

        if (!user) throw new ForbiddenException('User not found');

        // Strip sensitive encrypted fields & passwords before export
        const {
            password, iban, swiftCode, taxId, vatNumber,
            resetPasswordToken, resetPasswordExpires,
            verificationToken, twoFactorSecret,
            stripeAccountId,
            ...safeProfile
        } = user as any;

        return {
            exportedAt: new Date().toISOString(),
            profile: safeProfile,
            orders: user.customerOrders,
            reviews: user.reviews,
            wishlist: user.wishlist,
            notificationsCount: user.notifications.length,
        };
    }

    // ─── GDPR: Right to Erasure ────────────────────────────────────────
    async deleteMyAccount(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new ForbiddenException('User not found');

        // Check for active orders (PENDING/PROCESSING/SHIPPED) — block deletion
        const activeOrders = await this.prisma.order.count({
            where: {
                OR: [{ customerId: userId }, { supplierId: userId }],
                status: { in: ['PENDING', 'PROCESSING', 'SHIPPED'] },
            },
        });

        if (activeOrders > 0) {
            throw new ForbiddenException(
                `Cannot delete account with ${activeOrders} active order(s). ` +
                'Wait for all orders to complete or contact support.'
            );
        }

        // Anonymise instead of hard-delete to preserve audit/financial records
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                email: `deleted_${userId}@removed.invalid`,
                name: 'Deleted User',
                password: '',
                phone: null,
                avatar: null,
                companyName: null,
                iban: null,
                swiftCode: null,
                taxId: null,
                vatNumber: null,
                stripeAccountId: null,
                twoFactorSecret: null,
                status: 'BLOCKED',
            },
        });

        return { message: 'Your account data has been anonymised in compliance with GDPR.' };
    }

    async updatePayoutSettings(userId: string, dto: any) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new ConflictException('User not found');
        
        if (user.kycStatus !== 'VERIFIED') {
            throw new ForbiddenException('KYC verification required before updating payment details');
        }

        const data: any = {};
        if (dto.iban) data.iban = this.cryptoService.encrypt(dto.iban);
        if (dto.swiftCode) data.swiftCode = this.cryptoService.encrypt(dto.swiftCode);
        if (dto.vatNumber) data.vatNumber = this.cryptoService.encrypt(dto.vatNumber);
        if (dto.bankName) data.bankName = dto.bankName;
        if (dto.accountHolderName) data.accountHolderName = dto.accountHolderName;
        if (dto.countryCode) data.country = dto.countryCode;

        return this.prisma.user.update({
            where: { id: userId },
            data
        });
    }
}
