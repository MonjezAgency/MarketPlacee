import { Controller, Get, UseGuards, Post, Patch, Param, Body, Query, Delete, UseInterceptors, ClassSerializerInterceptor, Request, Res, StreamableFile, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { UserDto } from '../common/dtos/base.dto';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';

// Phone validation: optional + prefix, 8-15 digits. Stripped of spaces/dashes.
const PHONE_RE = /^\+?\d{8,15}$/;

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly prisma: PrismaService,
        private readonly storageService: SupabaseStorageService,
    ) { }

    // ─── Self-service profile endpoints ──────────────────────────────────

    /**
     * Update the authenticated user's profile fields. Validates phone format
     * server-side so the customer-facing settings page can't ship garbage to
     * the DB. Only fields the user is allowed to change land in the update.
     */
    @Patch('me')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    async updateMe(
        @Request() req,
        @Body() body: { name?: string; phone?: string | null; companyDescription?: string | null },
    ) {
        const data: any = {};
        if (typeof body.name === 'string') data.name = body.name.trim();
        if (body.phone !== undefined) {
            if (body.phone === null || body.phone === '') {
                data.phone = null;
            } else {
                const stripped = String(body.phone).replace(/[\s()-]/g, '');
                if (!PHONE_RE.test(stripped)) {
                    throw new BadRequestException('Invalid phone — must be 8-15 digits with optional + prefix');
                }
                data.phone = stripped;
            }
        }
        if (body.companyDescription !== undefined) {
            data.companyDescription = body.companyDescription || null;
        }
        const updated = await this.prisma.user.update({
            where: { id: req.user.sub },
            data,
        });
        return plainToInstance(UserDto, updated);
    }

    /**
     * Per-user notification preferences. Returns the current map +
     * the canonical default keys so the settings UI can render every
     * toggle even on first-load. Empty / null = "all on".
     */
    @Get('me/notification-prefs')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    async getNotificationPrefs(@Request() req) {
        const user = await this.prisma.user.findUnique({
            where: { id: req.user.sub },
            select: { notificationPrefs: true },
        });
        const DEFAULTS = {
            orderUpdates: true,
            productComments: true,
            lowStockAlerts: true,
            inboundOffers: true,
            marketingEmails: true,
            muteToasts: false,
        };
        const saved = (user?.notificationPrefs as Record<string, boolean>) || {};
        return { ...DEFAULTS, ...saved };
    }

    @Patch('me/notification-prefs')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    async setNotificationPrefs(@Request() req, @Body() body: Record<string, boolean>) {
        // Whitelist the accepted keys + coerce booleans. Anything
        // outside the list is dropped silently so a malicious caller
        // can't stuff arbitrary JSON into the field.
        const ALLOWED = [
            'orderUpdates', 'productComments', 'lowStockAlerts',
            'inboundOffers', 'marketingEmails', 'muteToasts',
        ];
        const clean: Record<string, boolean> = {};
        for (const k of ALLOWED) {
            if (k in body) clean[k] = !!body[k];
        }
        await this.prisma.user.update({
            where: { id: req.user.sub },
            data: { notificationPrefs: clean as any },
        });
        return { ok: true, prefs: clean };
    }

    /**
     * Upload / replace the authenticated user's avatar. Routes through the
     * existing StorageService used for product images so the same Cloudinary
     * (or local fallback) configuration applies.
     */
    @Post('me/avatar')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024 } }))
    async uploadAvatar(@Request() req, @UploadedFile() file: any) {
        if (!file) throw new BadRequestException('No file uploaded');
        if (!file.mimetype?.startsWith('image/')) throw new BadRequestException('File must be an image');
        const url = await this.storageService.uploadProductImage(file.buffer, file.originalname, file.mimetype);
        await this.prisma.user.update({
            where: { id: req.user.sub },
            data: { avatar: url },
        });
        return { url };
    }

    // ─── User-management endpoints ───────────────────────────────────────
    // Previously gated by `Role.ADMIN` only — but the operator (logged in
    // as OWNER) and other staff (MODERATOR / SUPPORT) couldn't see new
    // pending registrations because the API silently returned 403, which
    // the frontend rendered as an empty list. Now: OWNER, ADMIN, MODERATOR
    // and SUPPORT can READ and APPROVE; only ADMIN/OWNER can do destructive
    // bulk-block / bulk-delete.

    /**
     * Diagnostic — returns a per-role + per-status breakdown of every
     * user on the platform. Lets the operator verify "yes, the buyer
     * I just registered IS in the database" without scrolling through
     * a 100-row table. Useful for triaging the
     * "I can't see new registrations" class of complaints.
     */
    @Get('counts')
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR, Role.SUPPORT)
    async counts() {
        return this.usersService.getCounts();
    }

    @Get()
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR, Role.SUPPORT)
    async findAll(
        @Query('status') status?: string,
        @Query('role') role?: string,
        @Query('search') search?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20'
    ) {
        const result = await this.usersService.findAll(status, parseInt(page), parseInt(limit), search, role);
        return {
            ...result,
            users: plainToInstance(UserDto, result.users)
        };
    }

    @Post('approve-all')
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    async approveAll() {
        return this.usersService.approveAllPending();
    }

    @Post(':id/status')
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    async updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.usersService.updateStatus(id, status);
    }

    @Post('bulk-approve')
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    async bulkApprove(@Body('ids') ids: string[]) {
        const result = await this.usersService.bulkUpdateStatus(ids, 'ACTIVE');
        return { message: `Successfully approved ${result.updated} users`, ...result };
    }

    @Post('bulk-block')
    @Roles(Role.OWNER, Role.ADMIN)
    async bulkBlock(@Body('ids') ids: string[]) {
        const result = await this.usersService.bulkUpdateStatus(ids, 'BLOCKED');
        return { message: `Successfully blocked ${result.updated} users`, ...result };
    }

    @Post('bulk-delete')
    @Roles(Role.OWNER, Role.ADMIN)
    async bulkDelete(@Body('ids') ids: string[]) {
        const result = await this.usersService.bulkDelete(ids);
        return { message: `Successfully deleted ${result.deleted} users`, ...result };
    }

    @Post(':id')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER) // Everyone can update their profile
    async updateProfile(@Param('id') id: string, @Body() data: any) {
        const user = await this.usersService.updateProfile(id, data);
        return plainToInstance(UserDto, user);
    }

    @Delete(':id')
    @Roles(Role.OWNER, Role.ADMIN)
    async deleteUser(@Param('id') id: string) {
        await this.usersService.deleteUser(id);
        return { message: 'User deleted successfully' };
    }

    @Get(':id')
    @Roles(Role.ADMIN, Role.SUPPORT, Role.DEVELOPER, Role.LOGISTICS, Role.OWNER)
    async findById(@Param('id') id: string) {
        const user = await this.usersService.findById(id);
        return plainToInstance(UserDto, user);
    }

    @Get(':id/notifications')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER)
    async getNotifications(@Param('id') id: string) {
        return this.usersService.getNotifications(id);
    }

    @Post(':id/notifications/:notifId/read')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER)
    async markNotificationAsRead(@Param('notifId') notifId: string) {
        return this.usersService.markNotificationAsRead(notifId);
    }

    // ─── GDPR Endpoints ──────────────────────────────────────────────────

    @Get('me/data-export')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER)
    async exportMyData(@Request() req, @Res({ passthrough: true }) res: Response) {
        const data = await this.usersService.exportMyData(req.user.sub);
        const json = JSON.stringify(data, null, 2);
        res.set({
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="atlantis-data-export-${Date.now()}.json"`,
        });
        return new StreamableFile(Buffer.from(json));
    }

    @Delete('me')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER)
    async deleteMyAccount(@Request() req) {
        return this.usersService.deleteMyAccount(req.user.sub);
    }

    @Get('repair-data-secure-2026')
    @Roles(Role.ADMIN)
    async repairData() {
        console.log('[REPAIR] Starting data repair...');
        const results = [];

        // 1. Force Reset Info@atlantisfmcg.com Password
        try {
            const adminEmail = 'Info@atlantisfmcg.com';
            const newPassword = 'Admin@123';
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            const userToUpdate = await this.usersService.findOne(adminEmail);
            if (userToUpdate) {
                await this.usersService.updateProfile(userToUpdate.id, { password: hashedPassword, role: Role.OWNER });
                results.push(`Successfully reset password for ${adminEmail} to Admin@123 and set role to OWNER`);
            } else {
                results.push(`${adminEmail} not found in database`);
            }
        } catch (e) {
            results.push(`Error updating admin password: ${e.message}`);
        }

        // 2. Create/Update Monjez Tech Team User
        try {
            const monjezEmail = 'Monjez@monjez-agency.com';
            const monjezPass = 'Monjez@2025!';
            const existing = await this.usersService.findOne(monjezEmail);
            
            if (existing) {
                const hashedPassword = await bcrypt.hash(monjezPass, 10);
                await this.usersService.updateProfile(existing.id, { 
                    password: hashedPassword, 
                    role: Role.DEVELOPER, 
                    status: 'ACTIVE' 
                });
                results.push(`Updated Monjez test user: ${monjezEmail} to DEVELOPER role`);
            } else {
                const hashedPassword = await bcrypt.hash(monjezPass, 10);
                // @ts-ignore
                await this.usersService['prisma'].user.create({
                    data: {
                        email: monjezEmail,
                        password: hashedPassword,
                        name: 'Monjez Agency Team',
                        role: Role.DEVELOPER,
                        status: 'ACTIVE'
                    }
                });
                results.push(`Created Monjez test user: ${monjezEmail} with DEVELOPER role`);
            }
        } catch (e) {
            results.push(`Error with Monjez user: ${e.message}`);
        }

        // 3. Normalize all emails to lowercase
        try {
            const allUsers = await this.prisma.user.findMany({
                select: { id: true, email: true }
            });
            let updatedCount = 0;
            for (const user of allUsers) {
                if (user.email !== user.email.toLowerCase()) {
                    await this.prisma.user.update({
                        where: { id: user.id },
                        data: { email: user.email.toLowerCase() }
                    });
                    updatedCount++;
                }
            }
            results.push(`Normalized ${updatedCount} user emails to lowercase`);
        } catch (e) {
            results.push(`Error normalizing emails: ${e.message}`);
        }

        return { success: true, log: results };
    }
}
