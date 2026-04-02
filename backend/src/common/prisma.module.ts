import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { FinancialAuditService } from './financial-audit.service';

@Global()
@Module({
    providers: [PrismaService, FinancialAuditService],
    exports: [PrismaService, FinancialAuditService],
})
export class PrismaModule { }
