import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { DashboardService } from '../common/dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('admin')
    @Roles(Role.ADMIN, Role.SUPPORT, Role.MODERATOR, Role.DEVELOPER, Role.LOGISTICS, Role.OWNER)
    async getAdminSnapshot() {
        return this.dashboardService.getAdminSnapshot();
    }

    @Get('admin/notifications')
    @Roles(Role.ADMIN, Role.SUPPORT, Role.MODERATOR, Role.DEVELOPER, Role.LOGISTICS, Role.OWNER)
    async getNotificationCounts() {
        return this.dashboardService.getNotificationCounts();
    }

    @Get('supplier')
    @Roles(Role.SUPPLIER)
    async getSupplierSnapshot(@Request() req) {
        return this.dashboardService.getSupplierSnapshot(req.user.sub);
    }
}
