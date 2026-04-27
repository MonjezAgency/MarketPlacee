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
