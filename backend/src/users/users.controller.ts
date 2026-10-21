import { Controller, Get, UseGuards, Post, Patch, Param, Body, Query, Delete, UseInterceptors, ClassSerializerInterceptor, Request, Res, StreamableFile, UploadedFile, BadRequestException, ForbiddenException } from '@nestjs/common';
import { cleanProfile, cleanBrands, ProfileFieldError } from './profile-fields';
import { missingProfileFields, REQUIRED_PROFILE_FIELDS } from './profile-completion';
import { toursView, parseTourUpdate, applyTourUpdate, TourInputError } from './product-tours';
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
/** The signed-in staff member acting on an account (role from the database, see jwt.strategy). */
const actorOf = (req: any) => ({ id: String(req.user?.sub || ''), role: String(req.user?.role || '') });

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
    async updateMe(@Request() req, @Body() body: Record<string, unknown>) {
        const updated = await this.prisma.user.update({ where: { id: req.user.sub }, data: this.profileData(body) as any });
        return plainToInstance(UserDto, await this.settleOnboarding(updated));
    }

    /** Marks onboarding complete (and so stops reminders) as soon as every required field is saved. */
    private async settleOnboarding(u: any) {
        if (u && u.onboardingCompleted === false && missingProfileFields(u).length === 0) {
            return this.prisma.user.update({ where: { id: u.id }, data: { onboardingCompleted: true, profileIncompleteSince: null } as any });
        }
        return u;
    }

    @Get('me/profile-status')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    async profileStatus(@Request() req) {
        const u: any = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
        const missing = missingProfileFields(u);
        return { complete: u?.onboardingCompleted !== false || missing.length === 0, onboardingCompleted: u?.onboardingCompleted !== false, missing, required: REQUIRED_PROFILE_FIELDS };
    }

    /** Whitelisted self-service fields only; turns validation problems into 400s. */
    private profileData(body: Record<string, unknown>) {
        try { return cleanProfile(body || {}); }
        catch (e) { if (e instanceof ProfileFieldError) throw new BadRequestException(e.message); throw e; }
    }

    @Get('me/brand-preferences')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    async getBrandPrefs(@Request() req) {
        const u = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { preferredBrands: true } as any });
        return { brands: ((u as any)?.preferredBrands as string[]) ?? [] };
    }

    // ─── First-login dashboard tours (rules: ./product-tours.ts) ──────────

    /** Tours that apply to the caller's role, with eligibility and the saved step. */
    @Get('me/tours')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    async getTours(@Request() req) {
        const u = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { role: true, createdAt: true, productTours: true } as any });
        return { tours: u ? toursView(u as any) : {} };
    }

    /** Saves progress for one tour. Completed/skipped is final: the stored state is returned unchanged. */
    @Patch('me/tours/:tourId')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    async setTour(@Request() req, @Param('tourId') tourId: string, @Body() body: Record<string, unknown>) {
        const u: any = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { role: true, createdAt: true, productTours: true } as any });
        if (!u) throw new ForbiddenException();
        let update: ReturnType<typeof parseTourUpdate>;
        try { update = parseTourUpdate(u.role, tourId, body); }
        catch (e) { if (e instanceof TourInputError) throw new BadRequestException(e.message); throw e; }
        const res = applyTourUpdate(u.productTours, tourId, update);
        if (res.changed) await this.prisma.user.update({ where: { id: req.user.sub }, data: { productTours: res.json } as any });
        return { tourId, ...toursView({ ...u, productTours: res.json })[tourId] };
    }

    @Patch('me/brand-preferences')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.MODERATOR, Role.SUPPORT, Role.LOGISTICS, Role.OWNER)
    async setBrandPrefs(@Request() req, @Body('brands') brands: unknown) {
        let clean: string[];
        try { clean = cleanBrands(brands); } catch (e) { if (e instanceof ProfileFieldError) throw new BadRequestException(e.message); throw e; }
        await this.prisma.user.update({ where: { id: req.user.sub }, data: { preferredBrands: clean } as any });
        return { brands: clean };
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
            // Marketing is opt-in: off until the user switches it on.
            marketingEmails: false,
            muteToasts: false,
            onboardingReminders: true,
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
            'inboundOffers', 'marketingEmails', 'muteToasts', 'onboardingReminders',
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
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) throw new BadRequestException('Use a PNG, JPG or WebP image.');
        let url: string;
        try {
            url = await this.storageService.uploadProductImage(file.buffer, file.originalname, file.mimetype);
        } catch (e: any) {
            // Object storage unavailable (e.g. paused Supabase project): keep small,
            // client-resized avatars inline so the profile still works.
            if (file.size > 512 * 1024) throw new BadRequestException('Image storage is temporarily unavailable — use an image under 500 KB.');
            url = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }
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

    // Account approval is an OWNER/ADMIN decision (role matrix: frontend/src/lib/admin-access.ts).
    @Post('approve-all')
    @Roles(Role.OWNER, Role.ADMIN)
    async approveAll(@Request() req) {
        return this.usersService.approveAllPending(actorOf(req));
    }

    @Post(':id/status')
    @Roles(Role.OWNER, Role.ADMIN)
    async updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req) {
        return this.usersService.updateStatus(id, status, actorOf(req));
    }

    @Post('bulk-approve')
    @Roles(Role.OWNER, Role.ADMIN)
    async bulkApprove(@Body('ids') ids: string[], @Request() req) {
        const result = await this.usersService.bulkUpdateStatus(ids, 'ACTIVE', actorOf(req));
        return { message: `Successfully approved ${result.updated} users`, ...result };
    }

    @Post('bulk-block')
    @Roles(Role.OWNER, Role.ADMIN)
    async bulkBlock(@Body('ids') ids: string[], @Request() req) {
        const result = await this.usersService.bulkUpdateStatus(ids, 'BLOCKED', actorOf(req));
        return { message: `Successfully blocked ${result.updated} users`, ...result };
    }

    @Post('bulk-delete')
    @Roles(Role.OWNER, Role.ADMIN)
    async bulkDelete(@Body('ids') ids: string[], @Request() req) {
        const result = await this.usersService.bulkDelete(ids, actorOf(req));
        return { message: `Successfully deleted ${result.deleted} users`, ...result };
    }

    /**
     * Legacy self-update used by the settings pages. Previously accepted ANY
     * user id and ANY field (role, status, email, password…). Now: own account
     * only, whitelisted profile fields only.
     */
    @Post(':id')
    @Roles(Role.ADMIN, Role.SUPPLIER, Role.CUSTOMER, Role.OWNER)
    async updateProfile(@Param('id') id: string, @Body() data: Record<string, unknown>, @Request() req) {
        if (id !== req.user.sub) throw new ForbiddenException('You can only update your own profile.');
        const user = await this.prisma.user.update({ where: { id }, data: this.profileData(data) as any });
        return plainToInstance(UserDto, await this.settleOnboarding(user));
    }

    @Delete(':id')
    @Roles(Role.OWNER, Role.ADMIN)
    async deleteUser(@Param('id') id: string, @Request() req) {
        await this.usersService.deleteUser(id, actorOf(req));
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

        // 1. Guarantee Info@atlantisfmcg.com is OWNER
        try {
            const adminEmail = 'Info@atlantisfmcg.com';
            const userToUpdate = await this.prisma.user.findFirst({
                where: { email: { equals: adminEmail, mode: 'insensitive' } }
            });

            if (userToUpdate) {
                await this.prisma.user.update({
                    where: { id: userToUpdate.id },
                    data: { role: Role.OWNER, status: 'ACTIVE', emailVerified: true },
                });
                results.push(`Successfully verified role as OWNER and set status to ACTIVE for ${adminEmail} (password preserved)`);
            } else {
                const initial = process.env.OWNER_PASSWORD;
                if (!initial || initial.length < 12) throw new Error('OWNER_PASSWORD (12+ chars) is not set — owner not created');
                const hashedPassword = await bcrypt.hash(initial, 10);
                await this.prisma.user.create({
                    data: {
                        email: adminEmail,
                        password: hashedPassword,
                        name: 'Ali Dawara',
                        companyName: 'Atlantis FMCG',
                        role: Role.OWNER,
                        status: 'ACTIVE',
                        emailVerified: true,
                        kycStatus: 'VERIFIED',
                        onboardingCompleted: true,
                    }
                });
                results.push(`Created OWNER ${adminEmail} using secure initial password`);
            }
        } catch (e) {
            results.push(`Error securing admin account: ${e.message}`);
        }

        // 2. Create/Update Monjez Tech Team User
        try {
            const monjezEmail = 'Monjez@monjez-agency.com';
            const existing = await this.prisma.user.findFirst({
                where: { email: { equals: monjezEmail, mode: 'insensitive' } }
            });
            
            if (existing) {
                await this.prisma.user.update({
                    where: { id: existing.id },
                    data: { 
                        role: Role.DEVELOPER, 
                        status: 'ACTIVE',
                        emailVerified: true,
                    }
                });
                results.push(`Updated Monjez tech team user role and status to ACTIVE for ${monjezEmail} (password preserved)`);
            } else {
                const monjezPass = 'Monjez@2025!';
                const hashedPassword = await bcrypt.hash(monjezPass, 10);
                await this.prisma.user.create({
                    data: {
                        email: monjezEmail,
                        password: hashedPassword,
                        name: 'Monjez Agency Team',
                        companyName: 'Monjez Agency',
                        role: Role.DEVELOPER,
                        status: 'ACTIVE',
                        emailVerified: true,
                    }
                });
                results.push(`Created Monjez tech team user: ${monjezEmail} with DEVELOPER role`);
            }
        } catch (e) {
            results.push(`Error securing Monjez user: ${e.message}`);
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
