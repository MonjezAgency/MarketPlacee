import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';

/**
 * Email tracking — manages the SENT / OPEN / CLICK lifecycle for
 * every email the platform fires, and provides the admin
 * analytics aggregation.
 *
 * How it threads through the existing email senders:
 *   1. Caller (campaign / offer blast / transactional) calls
 *      registerSentEmail(...) before invoking emailService.sendMail.
 *      That returns a unique trackingId.
 *   2. Caller injects the tracking pixel + click-rewrites the
 *      links in the HTML using trackingPixelHtml(trackingId) and
 *      wrapLinks(html, trackingId).
 *   3. When the recipient opens the mail, their client loads the
 *      pixel — controller hits trackOpen() which writes an OPEN
 *      row.
 *   4. When the recipient clicks a wrapped link, the controller
 *      hits trackClick() which writes a CLICK row and 302's to
 *      the original URL.
 */
@Injectable()
export class EmailTrackingService {
    private readonly logger = new Logger(EmailTrackingService.name);

    constructor(private prisma: PrismaService) {}

    private getBaseUrl(): string {
        // Prefer BACKEND_PUBLIC_URL (the Railway URL) — that's what
        // the recipient's mail client must reach. Fallback to the
        // app's own request host is brittle so we require the env.
        return (
            process.env.BACKEND_PUBLIC_URL ||
            process.env.BACKEND_URL ||
            'https://marketplace-backend-production-539c.up.railway.app'
        ).replace(/\/+$/, '');
    }

    async registerSentEmail(input: {
        recipient: string;
        subject?: string;
        campaignId?: string;
        offerId?: string;
    }): Promise<string> {
        const trackingId = crypto.randomBytes(16).toString('hex');
        await this.prisma.emailEvent.create({
            data: {
                trackingId,
                type: 'SENT',
                recipient: (input.recipient || '').toLowerCase().trim(),
                subject: input.subject ?? null,
                campaignId: input.campaignId ?? null,
                offerId: input.offerId ?? null,
            },
        });
        return trackingId;
    }

    /**
     * 1×1 transparent tracking pixel HTML, ready to drop near the
     * `</body>` of any email. Some clients (Gmail, Outlook) cache
     * pixels — so a single open per recipient is the realistic
     * upper bound for the OPEN counter, which is fine for analytics.
     */
    trackingPixelHtml(trackingId: string): string {
        const url = `${this.getBaseUrl()}/email/track/open/${trackingId}.png`;
        return `<img src="${url}" width="1" height="1" alt="" style="display:block;border:0;outline:none;" />`;
    }

    /**
     * Rewrite every <a href="..."> in the body to go through our
     * /email/track/click/:trackingId redirect. Internal links
     * (mailto: / tel: / unsubscribe / the tracking pixel itself)
     * are left alone.
     */
    wrapLinks(html: string, trackingId: string): string {
        const base = this.getBaseUrl();
        return html.replace(/href\s*=\s*"([^"]+)"/gi, (full, originalUrl: string) => {
            const u = String(originalUrl);
            if (!u || u.startsWith('mailto:') || u.startsWith('tel:') || u.includes('/email/track/')) {
                return full;
            }
            // Don't double-wrap (idempotent).
            if (u.startsWith(`${base}/email/track/click/`)) return full;
            const wrapped = `${base}/email/track/click/${trackingId}?u=${encodeURIComponent(u)}`;
            return `href="${wrapped}"`;
        });
    }

    async trackOpen(trackingId: string, userAgent?: string, ip?: string) {
        try {
            const sent = await this.prisma.emailEvent.findUnique({ where: { trackingId } });
            if (!sent) return;
            await this.prisma.emailEvent.create({
                data: {
                    trackingId: `${trackingId}-open-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    type: 'OPEN',
                    recipient: sent.recipient,
                    subject: sent.subject,
                    campaignId: sent.campaignId,
                    offerId: sent.offerId,
                    userAgent: userAgent?.slice(0, 500) ?? null,
                    ip: ip ?? null,
                },
            });
        } catch (err: any) {
            this.logger.warn(`[OPEN] failed for ${trackingId}: ${err?.message}`);
        }
    }

    async trackClick(trackingId: string, linkUrl: string, userAgent?: string, ip?: string) {
        try {
            const sent = await this.prisma.emailEvent.findUnique({ where: { trackingId } });
            if (!sent) return;
            await this.prisma.emailEvent.create({
                data: {
                    trackingId: `${trackingId}-click-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    type: 'CLICK',
                    recipient: sent.recipient,
                    subject: sent.subject,
                    campaignId: sent.campaignId,
                    offerId: sent.offerId,
                    linkUrl: linkUrl?.slice(0, 1000) ?? null,
                    userAgent: userAgent?.slice(0, 500) ?? null,
                    ip: ip ?? null,
                },
            });
        } catch (err: any) {
            this.logger.warn(`[CLICK] failed for ${trackingId}: ${err?.message}`);
        }
    }

    /**
     * Admin analytics — high-level overview the dashboard renders:
     *   - per-campaign sent / opened / clicked / open-rate /
     *     click-rate (last 30 days)
     *   - per-offer sent / opened / clicked
     *   - 30-day trend (events per day per type)
     *   - top 10 recipients by opens (most engaged)
     */
    async overview(days = 30) {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // We pull all events for the window once and aggregate in
        // memory — cheap for typical campaign volumes (≤ 50k events
        // per month) and saves N+1 queries.
        const rows = await this.prisma.emailEvent.findMany({
            where: { createdAt: { gte: since } },
            select: {
                type: true,
                recipient: true,
                campaignId: true,
                offerId: true,
                createdAt: true,
                subject: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        const totals = { sent: 0, opened: 0, clicked: 0 };
        const perCampaign: Record<string, { sent: number; opened: number; clicked: number; subject?: string }> = {};
        const perOffer: Record<string, { sent: number; opened: number; clicked: number; subject?: string }> = {};
        const recipientOpens: Record<string, number> = {};
        const dailyTrend: Record<string, { sent: number; opened: number; clicked: number }> = {};

        for (const r of rows) {
            const day = new Date(r.createdAt).toISOString().slice(0, 10);
            if (!dailyTrend[day]) dailyTrend[day] = { sent: 0, opened: 0, clicked: 0 };

            if (r.type === 'SENT') {
                totals.sent++;
                dailyTrend[day].sent++;
                if (r.campaignId) {
                    if (!perCampaign[r.campaignId]) perCampaign[r.campaignId] = { sent: 0, opened: 0, clicked: 0, subject: r.subject ?? undefined };
                    perCampaign[r.campaignId].sent++;
                }
                if (r.offerId) {
                    if (!perOffer[r.offerId]) perOffer[r.offerId] = { sent: 0, opened: 0, clicked: 0, subject: r.subject ?? undefined };
                    perOffer[r.offerId].sent++;
                }
            } else if (r.type === 'OPEN') {
                totals.opened++;
                dailyTrend[day].opened++;
                recipientOpens[r.recipient] = (recipientOpens[r.recipient] || 0) + 1;
                if (r.campaignId && perCampaign[r.campaignId]) perCampaign[r.campaignId].opened++;
                if (r.offerId    && perOffer[r.offerId])       perOffer[r.offerId].opened++;
            } else if (r.type === 'CLICK') {
                totals.clicked++;
                dailyTrend[day].clicked++;
                if (r.campaignId && perCampaign[r.campaignId]) perCampaign[r.campaignId].clicked++;
                if (r.offerId    && perOffer[r.offerId])       perOffer[r.offerId].clicked++;
            }
        }

        const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

        const campaignsWithRates = Object.entries(perCampaign).map(([id, v]) => ({
            id, ...v,
            openRate:  pct(v.opened, v.sent),
            clickRate: pct(v.clicked, v.sent),
        }));
        const offersWithRates = Object.entries(perOffer).map(([id, v]) => ({
            id, ...v,
            openRate:  pct(v.opened, v.sent),
            clickRate: pct(v.clicked, v.sent),
        }));
        const topRecipients = Object.entries(recipientOpens)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([recipient, opens]) => ({ recipient, opens }));
        const trend = Object.entries(dailyTrend)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([day, v]) => ({ day, ...v }));

        return {
            windowDays: days,
            totals: {
                ...totals,
                openRate:  pct(totals.opened, totals.sent),
                clickRate: pct(totals.clicked, totals.sent),
            },
            campaigns: campaignsWithRates,
            offers: offersWithRates,
            topRecipients,
            trend,
        };
    }

    /** Per-campaign drill-down — the recipients + per-recipient open/click counts. */
    async campaignDetail(campaignId: string) {
        const rows = await this.prisma.emailEvent.findMany({
            where: { campaignId },
            select: { type: true, recipient: true, createdAt: true, linkUrl: true },
            orderBy: { createdAt: 'asc' },
        });
        const perRecipient: Record<string, { sent: number; opens: number; clicks: number; firstOpenAt?: Date; lastOpenAt?: Date }> = {};
        for (const r of rows) {
            if (!perRecipient[r.recipient]) perRecipient[r.recipient] = { sent: 0, opens: 0, clicks: 0 };
            const rec = perRecipient[r.recipient];
            if (r.type === 'SENT')  rec.sent++;
            if (r.type === 'OPEN')  { rec.opens++;  if (!rec.firstOpenAt) rec.firstOpenAt = r.createdAt; rec.lastOpenAt = r.createdAt; }
            if (r.type === 'CLICK') rec.clicks++;
        }
        return Object.entries(perRecipient)
            .sort((a, b) => (b[1].opens + b[1].clicks) - (a[1].opens + a[1].clicks))
            .map(([recipient, v]) => ({ recipient, ...v }));
    }
}
