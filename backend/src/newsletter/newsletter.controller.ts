import {
    Controller, Post, Get, Delete, Body, Param, Req, UseGuards, UseInterceptors,
    UploadedFile, Query, Logger, BadRequestException, Res
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.guard';
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

    /** Public sign-up (double opt-in). `consent` must be the user's explicit tick. */
    @Post('subscribe')
    @UseGuards(OptionalJwtAuthGuard)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async subscribe(@Body() body: { email: string; source?: string; region?: string; name?: string; consent?: boolean; policyVersion?: string }, @Req() req: any) {
        if (!body || !body.email) {
            throw new BadRequestException('Email is required');
        }
        return this.newsletterService.subscribe(body.email, body.source, body.region, body.name, { consent: body.consent === true, policyVersion: body.policyVersion, userId: req?.user?.sub ?? null });
    }

    @Post('confirm')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    confirm(@Body() body: { token: string }) {
        return this.newsletterService.confirm(String(body?.token || ''));
    }

    @Post('unsubscribe')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    unsubscribe(@Body() body: { token?: string; email?: string }) {
        return this.newsletterService.unsubscribe({ token: body?.token, email: body?.email });
    }

    /** CSV of marketing-eligible subscribers with consent data (admins only). */
    @Get('export')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async export(@Res() res: any) {
        const csv = await this.newsletterService.exportCsv();
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="atlantis-newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send('\uFEFF' + csv);
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
