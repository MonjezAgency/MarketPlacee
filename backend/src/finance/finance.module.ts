import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { ReportsService } from './reports.service';
import { PrismaModule } from '../common/prisma.module';
import { EmailModule } from '../email/email.module';
import { AdminModule } from '../admin/admin.module';

import { InvoiceModule } from '../invoices/invoice.module';

@Module({
    imports: [PrismaModule, EmailModule, AdminModule, InvoiceModule],
    providers: [FinanceService, ReportsService],
    controllers: [FinanceController],
    exports: [FinanceService, ReportsService],
})
export class FinanceModule {}
