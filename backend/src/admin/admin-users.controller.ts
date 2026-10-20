import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminUsersService } from './admin-users.service';

/**
 * Admin → Users. Read-only directory and user detail for ADMIN (OWNER passes
 * RolesGuard automatically). Only whitelisted, non-sensitive fields are returned
 * (see ./admin-users-query.ts). Account actions use the existing /users endpoints.
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class AdminUsersController {
    constructor(private readonly svc: AdminUsersService) {}

    /** ?q, role (CUSTOMER|BUYER|SUPPLIER|…), status, country, kyc, sort, page, limit (max 100). */
    @Get('list')
    list(@Query() query: Record<string, unknown>) {
        return this.svc.list(query);
    }

    @Get(':id')
    detail(@Param('id') id: string) {
        return this.svc.detail(id);
    }
}
