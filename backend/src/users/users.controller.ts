import { Controller, Get, UseGuards, Post, Param, Body, Query, Delete, UseInterceptors, ClassSerializerInterceptor, Request, Res, StreamableFile } from '@nestjs/common';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { UserDto } from '../common/dtos/base.dto';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @Roles(Role.ADMIN)
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
    @Roles(Role.ADMIN)
    async approveAll() {
        return this.usersService.approveAllPending();
    }

    @Post(':id/status')
    @Roles(Role.ADMIN)
    async updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.usersService.updateStatus(id, status);
    }

    @Post('bulk-approve')
    @Roles(Role.ADMIN)
    async bulkApprove(@Body('ids') ids: string[]) {
        const result = await this.usersService.bulkUpdateStatus(ids, 'ACTIVE');
        return { message: `Successfully approved ${result.updated} users`, ...result };
    }

    @Post('bulk-block')
    @Roles(Role.ADMIN)
    async bulkBlock(@Body('ids') ids: string[]) {
        const result = await this.usersService.bulkUpdateStatus(ids, 'BLOCKED');
        return { message: `Successfully blocked ${result.updated} users`, ...result };
    }

    @Post('bulk-delete')
    @Roles(Role.ADMIN)
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
    @Roles(Role.ADMIN)
    async deleteUser(@Param('id') id: string) {
        await this.usersService.deleteUser(id);
        return { message: 'User deleted successfully' };
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

        // 1. Update Founder Email
        try {
            const oldEmail = '7bd02025@gmail.com';
            const newEmail = 'Info@atlantisfmcg.com';
            const founder = await this.usersService.findOne(oldEmail);
            if (founder) {
                await this.usersService.updateProfile(founder.id, { email: newEmail, role: Role.ADMIN });
                results.push(`Updated founder email from ${oldEmail} to ${newEmail}`);
            } else {
                results.push(`Founder ${oldEmail} not found`);
            }
        } catch (e) {
            results.push(`Error updating founder: ${e.message}`);
        }

        // 2. Create/Update Monjez Test User
        try {
            const monjezEmail = 'monjez@monjez-agency.com';
            const monjezPass = 'Monjez@test-2026';
            const existing = await this.usersService.findOne(monjezEmail);
            
            if (existing) {
                const hashedPassword = await bcrypt.hash(monjezPass, 10);
                await this.usersService.updateProfile(existing.id, { 
                    password: hashedPassword, 
                    role: Role.ADMIN, 
                    status: 'ACTIVE' 
                });
                results.push(`Updated Monjez test user: ${monjezEmail}`);
            } else {
                // We use create logic but simplified
                const hashedPassword = await bcrypt.hash(monjezPass, 10);
                // Create user directly via prisma to bypass some checks if needed
                // But better use service if possible. 
                // Since I can't easily call create with hashed pass without it re-hashing...
                // I'll use prisma directly for the test user.
                // @ts-ignore
                await this.usersService['prisma'].user.create({
                    data: {
                        email: monjezEmail,
                        password: hashedPassword,
                        name: 'Monjez Agency Team',
                        role: Role.ADMIN,
                        status: 'ACTIVE'
                    }
                });
                results.push(`Created Monjez test user: ${monjezEmail}`);
            }
        } catch (e) {
            results.push(`Error with Monjez user: ${e.message}`);
        }

        return { success: true, log: results };
    }
}
