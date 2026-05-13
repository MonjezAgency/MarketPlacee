import {
    Controller, Post, Get, Delete, Body, Param, Req, UseGuards, UseInterceptors,
    UploadedFile, Query, Logger, BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NewsletterService } from './newsletter.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('newsletter')
export class NewsletterController {
    private readonly logger = new Logger(NewsletterController.name);

    constructor(private readonly newsletterService: NewsletterService) {
        this.logger.log('NewsletterController loaded — POST /newsletter/subscribe is registered');
    }

    @Post('subscribe')
    async subscribe(@Body() body: { email: string; source?: string; region?: string; name?: string }) {
        if (!body || !body.email) {
            throw new BadRequestException('Email is required');
        }
        return this.newsletterService.subscribe(body.email, body.source, body.region, body.name);
    }

    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async findAll(@Query('includeHidden') includeHidden?: string) {
        return this.newsletterService.findAll(includeHidden === 'true');
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async remove(@Param('id') id: string) {
        return this.newsletterService.remove(id);
    }

    /**
     * Bulk action endpoint. The admin Newsletter UI selects N rows and
     * fires this once with the chosen action: delete (permanent),
     * hide (soft archive), block (kept on file but cannot receive),
     * unhide / unblock (revert to ACTIVE).
     */
    @Post('bulk-action')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async bulkAction(@Body() body: { ids: string[]; action: string }) {
        const action = String(body?.action || '').toLowerCase();
        if (!['delete', 'hide', 'block', 'unhide', 'unblock'].includes(action)) {
            throw new BadRequestException('Unknown action. Allowed: delete, hide, block, unhide, unblock.');
        }
        return this.newsletterService.bulkAction(body.ids || [], action as any);
    }

    /**
     * Bulk-upload a CSV / XLS / XLSX of clients. The sheet is expected
     * to have at minimum an Email column; Name / Region are optional.
     * Returns a per-row report with created/updated/skipped counts so
     * the admin sees exactly which rows failed and why.
     */
    @Post('bulk-upload')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    @UseInterceptors(FileInterceptor('file'))
    async bulkUpload(
        @UploadedFile() file: any,
        @Body('source') source?: string,
    ) {
        if (!file?.buffer) {
            throw new BadRequestException('Upload a CSV / Excel file under the "file" field.');
        }
        return this.newsletterService.bulkUpload(file.buffer, source || 'Bulk Upload');
    }

    @Post('send-campaign')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async sendCampaign(
        @Body() body: {
            subject: string;
            content?: string;
            html?: string;
            blocks?: any[];
            audience?: 'PLATFORM' | 'NEWSLETTER';
        },
        @Req() req: any,
    ) {
        return this.newsletterService.sendCampaign(body.subject, body.content, {
            html: body.html,
            blocks: body.blocks,
            audience: body.audience,
            sentBy: req.user?.sub,
        });
    }

    /**
     * Diagnostic — fires one email through the same pipeline campaigns
     * use and returns the provider response. Useful when "Send" reports
     * 0/N delivered — call this with the admin's own email to see the
     * actual failure (Resend domain unverified, SMTP blocked, etc.).
     */
    @Post('test-email')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async testEmail(@Body() body: { to: string }) {
        return this.newsletterService.sendTestEmail(body?.to);
    }

    /** Past campaigns (history page). */
    @Get('campaigns')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async listCampaigns() {
        return this.newsletterService.listCampaigns();
    }

    /** Single campaign — used to re-open in the builder. */
    @Get('campaigns/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async getCampaign(@Param('id') id: string) {
        return this.newsletterService.getCampaign(id);
    }

    /** Delete from history. */
    @Delete('campaigns/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async deleteCampaign(@Param('id') id: string) {
        return this.newsletterService.deleteCampaign(id);
    }
}
