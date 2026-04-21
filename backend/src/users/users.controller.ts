import { Controller, Get, UseGuards, Post, Param, Body, Query, Delete, UseInterceptors, ClassSerializerInterceptor, Request, Res, StreamableFile } from '@nestjs/common';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { UserDto } from '../common/dtos/base.dto';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Response } from 'express';

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
}
