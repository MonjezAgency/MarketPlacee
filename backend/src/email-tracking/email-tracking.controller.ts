import {
    Controller, Get, Param, Query, Res, Req, UseGuards,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { EmailTrackingService } from './email-tracking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

// 1×1 transparent PNG, base64. Mail clients fetch this image to
// trigger the OPEN tracking. Buffer once at module-load time.
const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
);

@Controller('email')
export class EmailTrackingController {
    constructor(private svc: EmailTrackingService) {}

    /**
     * Tracking pixel endpoint. ALWAYS returns the 1×1 PNG even when
     * the trackingId is unknown — never break a recipient's mail
     * client with a 404 image. SkipThrottle because mail clients
     * legitimately fetch this from many different IPs in the same
     * second when a campaign goes out.
     */
    @Get('track/open/:trackingId.png')
    @SkipThrottle()
    async open(@Param('trackingId') trackingId: string, @Req() req: Request, @Res() res: Response) {
        const ua = req.get('user-agent') || undefined;
        const ip = (req.ip || req.socket?.remoteAddress || '').toString();
        await this.svc.trackOpen(trackingId, ua, ip).catch(() => {});
        res.set({
            'Content-Type': 'image/png',
            'Content-Length': PIXEL.length.toString(),
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
        });
        res.send(PIXEL);
    }

    /**
     * Click-through redirect. Logs the click then 302's to the
     * original URL. If the URL is missing or invalid we 302 home
     * so the recipient never lands on an error page.
     */
    @Get('track/click/:trackingId')
    @SkipThrottle()
    async click(
        @Param('trackingId') trackingId: string,
        @Query('u') url: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const safeUrl = (url || '').trim();
        const ua = req.get('user-agent') || undefined;
        const ip = (req.ip || req.socket?.remoteAddress || '').toString();
        await this.svc.trackClick(trackingId, safeUrl, ua, ip).catch(() => {});
        const fallback = (process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '');
        const isValid = /^https?:\/\//i.test(safeUrl);
        res.redirect(302, isValid ? safeUrl : fallback);
    }

    /** Admin analytics overview (aggregate sent / opened / clicked). */
    @Get('analytics/overview')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    async overview(@Query('days') days?: string) {
        const n = parseInt(days || '30', 10);
        return this.svc.overview(Math.min(180, Math.max(1, n)));
    }

    /** Per-campaign per-recipient drill-down. */
    @Get('analytics/campaigns/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN, Role.MODERATOR)
    async campaignDetail(@Param('id') id: string) {
        return this.svc.campaignDetail(id);
    }
}
