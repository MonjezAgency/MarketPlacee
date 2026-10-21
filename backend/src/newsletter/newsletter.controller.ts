import {
    Controller, Post, Get, Patch, Delete, Body, Param, Req, UseGuards, UseInterceptors,
    UploadedFile, Query, BadRequestException, Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NewsletterService } from './newsletter.service';
import { NewsletterContactsService } from './newsletter-contacts.service';
import { NewsletterCampaignsService } from './newsletter-campaigns.service';

/** Public newsletter endpoints: sign-up (double opt-in), confirm, unsubscribe. */
@Controller('newsletter')
export class NewsletterController {
    constructor(private readonly newsletterService: NewsletterService) {}

    /** Public sign-up (double opt-in). `consent` must be the user's explicit tick. */
    @Post('subscribe')
    @UseGuards(OptionalJwtAuthGuard)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async subscribe(@Body() body: { email: string; source?: string; region?: string; name?: string; consent?: boolean; policyVersion?: string }, @Req() req: any) {
        if (!body || !body.email) throw new BadRequestException('Email is required');
        return this.newsletterService.subscribe(body.email, body.source, body.region, body.name, { consent: body.consent === true, policyVersion: body.policyVersion, userId: req?.user?.sub ?? null });
    }

    @Post('confirm')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    confirm(@Body() body: { token: string }) {
        return this.newsletterService.confirm(String(body?.token || ''));
    }

    /** Unsubscribe by the per-recipient token from a marketing email, or by address (form). Always public. */
    @Post('unsubscribe')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    unsubscribe(@Body() body: { token?: string; email?: string; method?: string }) {
        return this.newsletterService.unsubscribe({ token: body?.token, email: body?.email, method: body?.method });
    }

    /** Transport diagnostic used by Admin → Email setup (not marketing content). */
    @Post('test-email')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async testEmail(@Body() body: { to: string }) {
        return this.newsletterService.sendTestEmail(body?.to);
    }
}

/**
 * Admin Newsletter Hub. Managing contacts, exporting, campaigns and sending
 * are OWNER/ADMIN only (OWNER passes every RolesGuard check).
 */
@Controller('newsletter/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OWNER')
export class NewsletterAdminController {
    constructor(
        private readonly contacts: NewsletterContactsService,
        private readonly campaigns: NewsletterCampaignsService,
    ) {}

    // ── Contacts ──
    @Get('contacts')
    listContacts(@Query() q: any) { return this.contacts.list(q || {}); }

    @Get('contacts/export')
    async exportContacts(@Res() res: any) {
        const csv = await this.contacts.exportCsv();
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="atlantis-contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.setHeader('Cache-Control', 'no-store');
        res.send('﻿' + csv);
    }

    @Get('contacts/:id')
    contactDetail(@Param('id') id: string) { return this.contacts.detail(id); }

    @Post('contacts')
    addContact(@Body() body: any, @Req() req: any) { return this.contacts.add(body, req.user?.sub); }

    @Patch('contacts/:id')
    updateContact(@Param('id') id: string, @Body() body: any) { return this.contacts.update(id, body); }

    @Post('contacts/:id/consent')
    recordConsent(@Param('id') id: string, @Body() body: any, @Req() req: any) { return this.contacts.recordConsent(id, body, req.user?.sub); }

    @Post('contacts/bulk')
    bulk(@Body() body: { ids: string[]; action: string }, @Req() req: any) { return this.contacts.bulk(body?.ids, String(body?.action || '').toLowerCase(), req.user?.sub); }

    @Post('contacts/import/parse')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
    parseImport(@UploadedFile() file: any) {
        if (!file?.buffer) throw new BadRequestException('Upload a CSV or Excel file in the "file" field.');
        return this.contacts.parseFile(file.buffer);
    }

    @Post('contacts/import/preview')
    previewImport(@Body() body: any) { return this.contacts.previewImport(body); }

    @Post('contacts/import/commit')
    commitImport(@Body() body: any, @Req() req: any) { return this.contacts.commitImport(body, req.user?.sub); }

    // ── Campaigns ──
    @Get('products')
    products(@Query('q') q?: string) { return this.campaigns.searchProducts(q || ''); }

    @Get('campaigns')
    listCampaigns() { return this.campaigns.list(); }

    @Post('campaigns')
    createCampaign(@Body() body: any, @Req() req: any) { return this.campaigns.create(body || {}, req.user?.sub); }

    @Get('campaigns/:id')
    getCampaign(@Param('id') id: string) { return this.campaigns.get(id); }

    @Patch('campaigns/:id')
    updateCampaign(@Param('id') id: string, @Body() body: any) { return this.campaigns.update(id, body || {}); }

    @Delete('campaigns/:id')
    deleteCampaign(@Param('id') id: string) { return this.campaigns.remove(id); }

    @Post('campaigns/:id/duplicate')
    duplicateCampaign(@Param('id') id: string, @Req() req: any) { return this.campaigns.duplicate(id, req.user?.sub); }

    @Get('campaigns/:id/preview')
    previewCampaign(@Param('id') id: string) { return this.campaigns.preview(id); }

    @Get('campaigns/:id/audience')
    campaignAudience(@Param('id') id: string) { return this.campaigns.audience(id); }

    @Post('campaigns/:id/test')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    testCampaign(@Param('id') id: string, @Req() req: any) { return this.campaigns.sendTest(id, req.user?.sub); }

    @Post('campaigns/:id/send')
    sendCampaign(@Param('id') id: string, @Body() body: { expectedRecipients?: number }, @Req() req: any) {
        const n = Number(body?.expectedRecipients);
        if (!Number.isInteger(n) || n < 1) throw new BadRequestException('Confirm the number of recipients before sending.');
        return this.campaigns.send(id, req.user?.sub, n);
    }

    @Post('campaigns/:id/resume')
    resumeCampaign(@Param('id') id: string) { return this.campaigns.resume(id); }
}
