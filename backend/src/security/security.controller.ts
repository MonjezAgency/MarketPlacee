import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SecurityService } from './security.service';
import { ThreatDetectionService } from './threat-detection.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { AutoHealerService } from './auto-healer.service';

@Controller('admin/security')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SecurityController {
    constructor(
        private securityService: SecurityService,
        private threatDetection: ThreatDetectionService,
        private autoHealer: AutoHealerService,
        private prisma: PrismaService,
    ) { }

    @Get('status')
    async getStatus() {
        const isLockedDown = await this.threatDetection.checkLockdownStatus();
        const recentLogs = await this.prisma.securityLog.findMany({
            take: 50,
            orderBy: { createdAt: 'desc' },
        });

        const blockedIps = await this.prisma.blockedIp.findMany();

        // Simple security score calculation
        let score = 100;
        if (isLockedDown) score -= 0; // Lockdown is safe but high alert
        const criticalLogs = recentLogs.filter(l => l.level === 'CRITICAL').length;
        score -= criticalLogs * 5;

        return {
            score: Math.max(0, score),
            isLockedDown,
            recentLogs,
            blockedIps,
            timestamp: new Date(),
        };
    }

    @Post('lockdown')
    async toggleLockdown(@Body('enabled') enabled: boolean) {
        await this.threatDetection.toggleLockdown(enabled);
        return { success: true, lockdown: enabled };
    }

    @Post('unblock')
    async unblockIp(@Body('ip') ip: string) {
        await this.prisma.blockedIp.delete({ where: { ip } });
        return { success: true };
    }

    @Get('agent-status')
    getAgentStatus() {
        return this.autoHealer.getAgentState();
    }

    @Post('agent-fix')
    async forceAgentFix() {
        const started = await this.autoHealer.forceScanAndFix();
        return { success: started };
    }

    @Get('fraud-analysis')
    async getFraudAnalysis() {
        return this.threatDetection.analyzeOrderFraud();
    }
}
