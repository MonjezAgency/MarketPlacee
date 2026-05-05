import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { AiAgentService } from './ai-agent.service';

@Controller('ai-agent')
export class AiAgentController {
    constructor(private readonly aiAgentService: AiAgentService) {}

    // Admin/Owner: trigger a scan manually
    @Post('scan')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.OWNER)
    async triggerScan() {
        return this.aiAgentService.runScan();
    }

    // Admin/Owner: get all recent reports
    @Get('reports')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.OWNER)
    getReports() {
        return this.aiAgentService.getReports();
    }

    // Admin/Owner: get latest report
    @Get('reports/latest')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN, Role.OWNER)
    getLatestReport() {
        return this.aiAgentService.getLatestReport();
    }

    // Any logged-in user: submit a complaint for AI analysis
    @Post('analyze-complaint')
    @UseGuards(JwtAuthGuard)
    async analyzeComplaint(@Body() body: { complaint: string }, @Request() req) {
        return this.aiAgentService.analyzeCustomerComplaint(body.complaint, req.user.sub);
    }

    // PUBLIC — no auth required: AI pricing assistant for any product page
    @Post('pricing-chat')
    async pricingChat(
        @Body() body: {
            productId: string;
            message: string;
            history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        },
    ) {
        return this.aiAgentService.pricingAssistant(
            body.productId,
            body.message,
            body.history || [],
        );
    }
}
