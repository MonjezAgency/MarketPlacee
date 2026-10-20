import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { TeamController } from './team.controller';
import { EmailModule } from '../email/email.module';
import { ExcelService } from './excel.service';
import { ProductsModule } from '../products/products.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from '../common/dashboard.service';
import { AdminOverviewService } from './admin-overview.service';
import { AnalyticsService } from '../common/analytics.service';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AppConfigService } from './app-config.service';
import { AppConfigController } from './app-config.controller';
import { SecurityService } from './security.service';
import { SecurityController } from './security.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

import { PrismaModule } from '../common/prisma.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
    imports: [ProductsModule, EmailModule, PrismaModule, AiAgentModule],
    providers: [AdminService, ExcelService, DashboardService, AdminOverviewService, AnalyticsService, AuditService, AppConfigService, AdminUsersService],
    controllers: [TeamController, DashboardController, AuditController, AppConfigController, AdminUsersController],
    exports: [ExcelService, DashboardService, AnalyticsService, AuditService, AppConfigService],
})
export class AdminModule { }
