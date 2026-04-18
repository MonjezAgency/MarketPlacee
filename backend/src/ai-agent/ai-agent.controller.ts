import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { AiAgentService } from './ai-agent.service';

@Controller('ai-agent')
@UseGuards(JwtAuthGuard)
export class AiAgentController {
    constructor(private readonly aiAgentService: AiAgentService) {}

    // Admin/Owner: trigger a scan manually
    @Post('scan')
    @Roles(Role.ADMIN, Role.OWNER)
    @UseGuards(RolesGuard)
    async triggerScan() {
        return this.aiAgentService.runScan();
    }

    // Admin/Owner: get all recent reports
    @Get('reports')
    @Roles(Role.ADMIN, Role.OWNER)
    @UseGuards(RolesGuard)
    getReports() {
        return this.aiAgentService.getReports();
    }

    // Admin/Owner: get latest report
    @Get('reports/latest')
    @Roles(Role.ADMIN, Role.OWNER)
    @UseGuards(RolesGuard)
    getLatestReport() {
        return this.aiAgentService.getLatestReport();
    }

    // Any logged-in user: submit a complaint for AI analysis
    @Post('analyze-complaint')
    async analyzeComplaint(@Body() body: { complaint: string }, @Request() req) {
        return this.aiAgentService.analyzeCustomerComplaint(body.complaint, req.user.sub);
    }
}
