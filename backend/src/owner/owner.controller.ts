import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    UseGuards, Request, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OwnerGuard } from '../auth/owner.guard';
import { OwnerService } from './owner.service';

/**
 * OwnerController — endpoints خاصة بالمالك فقط.
 * كل route محمية بـ JWT + OwnerGuard (OWNER role فقط).
 */
@Controller('owner')
@UseGuards(AuthGuard('jwt'), OwnerGuard)
export class OwnerController {
    constructor(private readonly ownerService: OwnerService) {}

    // ─── نظرة عامة على المنصة ────────────────────────────────────────────────

    /** إحصائيات المنصة الكاملة للمالك */
    @Get('dashboard')
    getDashboard() {
        return this.ownerService.getDashboardStats();
    }

    // ─── إدارة الفريق ─────────────────────────────────────────────────────────

    /** قائمة كل أعضاء الفريق مع KYC status وصلاحياتهم */
    @Get('team')
    getTeam(@Query('role') role?: string) {
        return this.ownerService.getTeamMembers(role);
    }

    /** عرض عضو بعينه */
    @Get('team/:userId')
    getTeamMember(@Param('userId') userId: string) {
        return this.ownerService.getTeamMember(userId);
    }

    /**
     * تعيين/تحديث صلاحيات عضو (يستبدل القديمة)
     * Body: { permissions: string[] }
     */
    @Patch('team/:userId/permissions')
    setPermissions(
        @Param('userId') userId: string,
        @Body('permissions') permissions: string[],
        @Request() req,
    ) {
        if (!Array.isArray(permissions)) throw new BadRequestException('permissions يجب أن تكون array');
        return this.ownerService.setPermissions(userId, permissions, req.user.sub);
    }

    /**
     * تغيير دور عضو (promote / demote)
     * لا يمكن تغيير دور OWNER من هنا
     */
    @Patch('team/:userId/role')
    changeRole(
        @Param('userId') userId: string,
        @Body('role') role: string,
        @Request() req,
    ) {
        if (role === 'OWNER') throw new ForbiddenException('لا يمكن تعيين OWNER من هذه الواجهة');
        return this.ownerService.changeRole(userId, role, req.user.sub);
    }

    /**
     * تعليق حساب عضو من الفريق (BLOCKED)
     */
    @Patch('team/:userId/suspend')
    suspendMember(@Param('userId') userId: string, @Request() req) {
        return this.ownerService.suspendMember(userId, req.user.sub);
    }

    /**
     * إعادة تفعيل حساب معلق
     */
    @Patch('team/:userId/activate')
    activateMember(@Param('userId') userId: string, @Request() req) {
        return this.ownerService.activateMember(userId, req.user.sub);
    }

    // ─── KYC للفريق ──────────────────────────────────────────────────────────

    /** أعضاء الفريق اللي KYC بتاعهم Pending أو Unverified */
    @Get('team/kyc/pending')
    getPendingKyc() {
        return this.ownerService.getTeamPendingKyc();
    }

    /**
     * الموافقة على KYC عضو فريق
     */
    @Patch('team/:userId/kyc/approve')
    approveTeamKyc(@Param('userId') userId: string, @Request() req) {
        return this.ownerService.approveTeamKyc(userId, req.user.sub);
    }

    /**
     * رفض KYC عضو فريق
     */
    @Patch('team/:userId/kyc/reject')
    rejectTeamKyc(
        @Param('userId') userId: string,
        @Body('reason') reason: string,
        @Request() req,
    ) {
        return this.ownerService.rejectTeamKyc(userId, reason, req.user.sub);
    }

    // ─── سجل العمليات ────────────────────────────────────────────────────────

    /** آخر عمليات الأدمن (من يعمل إيه ومتى) */
    @Get('audit-log')
    getAuditLog(@Query('limit') limit?: string) {
        return this.ownerService.getAdminAuditLog(parseInt(limit || '50', 10));
    }

    // ─── الصلاحيات المتاحة ───────────────────────────────────────────────────

    /** قائمة كل الصلاحيات الممكن منحها */
    @Get('permissions/list')
    listAvailablePermissions() {
        return this.ownerService.getAvailablePermissions();
    }
}
