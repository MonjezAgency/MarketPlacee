import { Controller, Post, Get, Delete, Body, Param, UseGuards, Logger, BadRequestException } from '@nestjs/common';
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
    async subscribe(@Body() body: { email: string; source?: string; region?: string }) {
        if (!body || !body.email) {
            throw new BadRequestException('Email is required');
        }
        return this.newsletterService.subscribe(body.email, body.source, body.region);
    }

    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async findAll() {
        return this.newsletterService.findAll();
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async remove(@Param('id') id: string) {
        return this.newsletterService.remove(id);
    }

    @Post('send-campaign')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'OWNER')
    async sendCampaign(@Body() body: { subject: string; content: string }) {
        return this.newsletterService.sendCampaign(body.subject, body.content);
    }
}
