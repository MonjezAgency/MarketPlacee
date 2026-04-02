import {
    Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** الصلاحيات الممكن منحها لأعضاء الفريق */
export const ALL_PERMISSIONS = [
    // المستخدمون
    { key: 'users.view',         label: 'عرض المستخدمين' },
    { key: 'users.approve',      label: 'الموافقة على حسابات جديدة' },
    { key: 'users.block',        label: 'حجب المستخدمين' },
    { key: 'users.delete',       label: 'حذف المستخدمين' },

    // KYC
    { key: 'kyc.view',           label: 'عرض طلبات KYC' },
    { key: 'kyc.approve',        label: 'الموافقة على KYC' },
    { key: 'kyc.reject',         label: 'رفض KYC' },

    // المنتجات
    { key: 'products.view',      label: 'عرض المنتجات' },
    { key: 'products.approve',   label: 'الموافقة على منتجات جديدة' },
    { key: 'products.reject',    label: 'رفض المنتجات' },
    { key: 'products.delete',    label: 'حذف المنتجات' },

    // الطلبات
    { key: 'orders.view',        label: 'عرض الطلبات' },
    { key: 'orders.manage',      label: 'إدارة الطلبات' },
    { key: 'orders.refund',      label: 'إصدار استرداد' },

    // المالية
    { key: 'finance.view',       label: 'عرض التقارير المالية' },
    { key: 'finance.audit',      label: 'عرض سجل المعاملات المالية' },
    { key: 'finance.escrow',     label: 'إدارة Escrow' },
    { key: 'finance.payouts',    label: 'إصدار Payouts' },

    // النزاعات والدعم
    { key: 'disputes.view',      label: 'عرض النزاعات' },
    { key: 'disputes.resolve',   label: 'حل النزاعات' },
    { key: 'support.view',       label: 'عرض محادثات الدعم' },
    { key: 'support.reply',      label: 'الرد على محادثات الدعم' },

    // الإعلانات
    { key: 'placements.view',    label: 'عرض الإعلانات' },
    { key: 'placements.approve', label: 'الموافقة على الإعلانات' },
    { key: 'placements.reject',  label: 'رفض الإعلانات' },

    // الأمان
    { key: 'security.view',      label: 'عرض سجلات الأمان' },
    { key: 'security.manage',    label: 'إدارة الأمان (حجب IPs)' },

    // الشحن والمستودعات
    { key: 'logistics.view',     label: 'عرض الشحن والمستودعات' },
    { key: 'logistics.manage',   label: 'إدارة الشحن والمستودعات' },

    // الإعدادات
    { key: 'settings.view',      label: 'عرض الإعدادات' },
    { key: 'settings.manage',    label: 'تعديل الإعدادات' },
];

const TEAM_ROLES = ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];

@Injectable()
export class OwnerService {
    private readonly logger = new Logger(OwnerService.name);

    constructor(private readonly prisma: PrismaService) {}

    // ─── Dashboard ────────────────────────────────────────────────────────────

    async getDashboardStats() {
        const [
            totalUsers, totalSuppliers, totalCustomers, totalTeam,
            totalProducts, pendingProducts,
            totalOrders, revenueData,
            pendingKyc, openDisputes,
            teamUnverifiedKyc,
        ] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.count({ where: { role: 'SUPPLIER' } }),
            this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
            this.prisma.user.count({ where: { role: { in: TEAM_ROLES as any } } }),
            this.prisma.product.count(),
            this.prisma.product.count({ where: { status: 'PENDING' } }),
            this.prisma.order.count(),
            this.prisma.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { totalAmount: true } }),
            this.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
            this.prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
            // أعضاء الفريق اللي KYC مش verified
            this.prisma.user.count({
                where: {
                    role: { in: TEAM_ROLES as any },
                    kycStatus: { not: 'VERIFIED' },
                },
            }),
        ]);

        return {
            users: { total: totalUsers, suppliers: totalSuppliers, customers: totalCustomers, team: totalTeam },
            products: { total: totalProducts, pending: pendingProducts },
            orders: { total: totalOrders, revenue: revenueData._sum.totalAmount ?? 0 },
            kyc: { pending: pendingKyc, teamUnverified: teamUnverifiedKyc },
            disputes: { open: openDisputes },
        };
    }

    // ─── إدارة الفريق ────────────────────────────────────────────────────────

    async getTeamMembers(roleFilter?: string) {
        const where: any = { role: { in: TEAM_ROLES as any } };
        if (roleFilter) where.role = roleFilter.toUpperCase();

        return this.prisma.user.findMany({
            where,
            select: {
                id: true, name: true, email: true, role: true,
                status: true, kycStatus: true, permissions: true,
                createdAt: true, avatar: true, companyName: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getTeamMember(userId: string) {
        const member = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, name: true, email: true, role: true,
                status: true, kycStatus: true, permissions: true,
                createdAt: true, avatar: true, companyName: true, phone: true,
                kycDocuments: {
                    select: { id: true, documentType: true, status: true, createdAt: true },
                },
            },
        });
        if (!member) throw new NotFoundException('العضو غير موجود');
        if (!TEAM_ROLES.includes(member.role as string) && member.role !== 'OWNER') {
            throw new ForbiddenException('هذا المستخدم ليس عضواً في الفريق');
        }
        return member;
    }

    async setPermissions(userId: string, permissions: string[], changedBy: string) {
        // التحقق من صحة الصلاحيات
        const validKeys = new Set(ALL_PERMISSIONS.map(p => p.key));
        const invalid = permissions.filter(p => !validKeys.has(p));
        if (invalid.length > 0) {
            throw new ForbiddenException(`صلاحيات غير معروفة: ${invalid.join(', ')}`);
        }

        const member = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, name: true } });
        if (!member) throw new NotFoundException('المستخدم غير موجود');
        if (member.role === 'OWNER') throw new ForbiddenException('لا يمكن تعديل صلاحيات المالك');

        await this.prisma.user.update({
            where: { id: userId },
            data: { permissions: permissions as any },
        });

        // تسجيل العملية
        await this.prisma.adminActionLog.create({
            data: {
                adminId: changedBy,
                action: 'SET_PERMISSIONS',
                entityType: 'User',
                entityId: userId,
                details: { permissions, memberName: member.name },
            },
        });

        this.logger.log(`Permissions updated for ${userId} by owner ${changedBy}`);
        return { message: 'تم تحديث الصلاحيات بنجاح', permissions };
    }

    async changeRole(userId: string, newRole: string, changedBy: string) {
        const validRoles = [...TEAM_ROLES, 'SUPPLIER', 'CUSTOMER'];
        if (!validRoles.includes(newRole.toUpperCase())) {
            throw new ForbiddenException(`الدور ${newRole} غير مسموح`);
        }

        const member = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, name: true } });
        if (!member) throw new NotFoundException('المستخدم غير موجود');
        if (member.role === 'OWNER') throw new ForbiddenException('لا يمكن تغيير دور المالك');

        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: { role: newRole.toUpperCase() as any },
            select: { id: true, name: true, role: true },
        });

        await this.prisma.adminActionLog.create({
            data: {
                adminId: changedBy,
                action: 'CHANGE_ROLE',
                entityType: 'User',
                entityId: userId,
                details: { oldRole: member.role, newRole, memberName: member.name },
            },
        });

        return updated;
    }

    async suspendMember(userId: string, changedBy: string) {
        const member = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (!member) throw new NotFoundException('المستخدم غير موجود');
        if (member.role === 'OWNER') throw new ForbiddenException('لا يمكن تعليق حساب المالك');

        await this.prisma.user.update({ where: { id: userId }, data: { status: 'BLOCKED' } });
        await this.prisma.adminActionLog.create({
            data: { adminId: changedBy, action: 'SUSPEND_TEAM_MEMBER', entityType: 'User', entityId: userId, details: {} },
        });
        return { message: 'تم تعليق الحساب' };
    }

    async activateMember(userId: string, changedBy: string) {
        await this.prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
        await this.prisma.adminActionLog.create({
            data: { adminId: changedBy, action: 'ACTIVATE_TEAM_MEMBER', entityType: 'User', entityId: userId, details: {} },
        });
        return { message: 'تم تفعيل الحساب' };
    }

    // ─── KYC الفريق ──────────────────────────────────────────────────────────

    async getTeamPendingKyc() {
        return this.prisma.user.findMany({
            where: {
                role: { in: TEAM_ROLES as any },
                kycStatus: { in: ['PENDING', 'UNVERIFIED'] },
            },
            select: {
                id: true, name: true, email: true, role: true, kycStatus: true,
                kycDocuments: { select: { id: true, documentType: true, status: true, frontImageUrl: true, createdAt: true } },
            },
        });
    }

    async approveTeamKyc(userId: string, approvedBy: string) {
        await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: 'VERIFIED' } });
        await this.prisma.kYCDocument.updateMany({
            where: { userId, status: 'PENDING' },
            data: { status: 'VERIFIED' },
        });
        await this.prisma.adminActionLog.create({
            data: { adminId: approvedBy, action: 'APPROVE_TEAM_KYC', entityType: 'User', entityId: userId, details: {} },
        });
        return { message: 'تم التحقق من الهوية بنجاح' };
    }

    async rejectTeamKyc(userId: string, reason: string, rejectedBy: string) {
        await this.prisma.user.update({ where: { id: userId }, data: { kycStatus: 'REJECTED' } });
        await this.prisma.kYCDocument.updateMany({
            where: { userId, status: 'PENDING' },
            data: { status: 'REJECTED', adminNotes: reason },
        });
        await this.prisma.adminActionLog.create({
            data: { adminId: rejectedBy, action: 'REJECT_TEAM_KYC', entityType: 'User', entityId: userId, details: { reason } },
        });
        return { message: 'تم رفض طلب KYC' };
    }

    // ─── سجل العمليات ────────────────────────────────────────────────────────

    async getAdminAuditLog(limit = 50) {
        return this.prisma.adminActionLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: { admin: { select: { id: true, name: true, role: true, avatar: true } } },
        });
    }

    // ─── الصلاحيات المتاحة ───────────────────────────────────────────────────

    getAvailablePermissions() {
        return ALL_PERMISSIONS;
    }
}
