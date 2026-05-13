import { Controller, Get, Post, Body, HttpCode, Logger } from '@nestjs/common';
import { IsEmail, IsString, IsOptional } from 'class-validator';
import { AppService } from './app.service';
import { EmailService } from './email/email.service';
import { PrismaService } from './common/prisma.service';

class ContactDto {
    @IsString() name: string;
    @IsEmail() email: string;
    @IsOptional() @IsString() company?: string;
    @IsString() topic: string;
    @IsString() message: string;
}

@Controller()
export class AppController {
    private readonly logger = new Logger(AppController.name);

    constructor(
        private readonly appService: AppService,
        private readonly emailService: EmailService,
        private readonly prisma: PrismaService,
    ) { }

    @Get()
    getHello(): string {
        return this.appService.getHello();
    }

    @Get('config/homepage-categories')
    async getHomepageCategories() {
        return this.appService.getHomepageCategories();
    }

    @Get('config/currency')
    async getPlatformCurrency() {
        return this.appService.getPlatformCurrency();
    }

    @Get('config/default-unit')
    async getDefaultDisplayUnit() {
        const unit = await this.appService.getDefaultDisplayUnit();
        return { unit };
    }

    @Get('config/markup')
    async getPublicMarkup() {
        return this.appService.getPublicMarkup();
    }

    @Get('config/homepage-banners')
    async getPublicHomepageBanners() {
        const config = await this.prisma.appConfig.findUnique({
            where: { key: 'HOMEPAGE_BANNERS' },
        });
        if (!config?.value) return {};
        try {
            const raw = JSON.parse(config.value);
            // Normalize legacy shapes → new envelope so the homepage
            // only needs one render path.
            const out: Record<string, any> = {};
            for (const [slot, value] of Object.entries(raw || {})) {
                if (!value) continue;
                if (Array.isArray(value)) {
                    out[slot] = { items: value, animated: false, intervalMs: 5000 };
                } else if (typeof value === 'object') {
                    const obj = value as any;
                    if (Array.isArray(obj.items)) {
                        out[slot] = {
                            items: obj.items,
                            animated: !!obj.animated,
                            intervalMs: Number(obj.intervalMs) || 5000,
                        };
                    } else if ('imageUrl' in obj) {
                        out[slot] = { items: [obj], animated: false, intervalMs: 5000 };
                    }
                }
            }
            return out;
        } catch { return {}; }
    }

    @Get('config/terms')
    async getPublicTerms() {
        const [body, version, updatedAt] = await Promise.all([
            this.prisma.appConfig.findUnique({ where: { key: 'TERMS_CONTENT' } }),
            this.prisma.appConfig.findUnique({ where: { key: 'TERMS_VERSION' } }),
            this.prisma.appConfig.findUnique({ where: { key: 'TERMS_UPDATED_AT' } }),
        ]);
        return {
            content: body?.value ?? '',
            version: version?.value ?? 'v1.0',
            updatedAt: updatedAt?.value ?? null,
        };
    }

    @Get('emergency-reset')
    async resetAdmin() {
        return this.appService.resetAdmin();
    }

    /** Public contact form — sends an email to the Atlantis team */
    @Post('contact')
    @HttpCode(200)
    async contactUs(@Body() dto: ContactDto) {
        const adminEmail = process.env.EMAIL_USER || 'Info@atlantisfmcg.com';

        const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
  <div style="background:#0B1F3A;padding:20px 24px;border-radius:10px 10px 0 0;">
    <h2 style="color:#2EC4B6;margin:0;font-size:18px;">📬 New Contact Form Submission</h2>
    <p style="color:#94A3B8;margin:4px 0 0;font-size:13px;">Atlantis Marketplace — Contact Request</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 10px 10px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#64748B;width:120px;vertical-align:top;font-weight:600;">Name</td><td style="padding:8px 0;color:#0F172A;font-weight:700;">${dto.name}</td></tr>
      <tr><td style="padding:8px 0;color:#64748B;vertical-align:top;font-weight:600;">Email</td><td style="padding:8px 0;"><a href="mailto:${dto.email}" style="color:#2EC4B6;">${dto.email}</a></td></tr>
      ${dto.company ? `<tr><td style="padding:8px 0;color:#64748B;vertical-align:top;font-weight:600;">Company</td><td style="padding:8px 0;color:#0F172A;">${dto.company}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#64748B;vertical-align:top;font-weight:600;">Topic</td><td style="padding:8px 0;"><span style="background:#CCFBF1;color:#0F766E;padding:2px 10px;border-radius:20px;font-weight:700;font-size:12px;">${dto.topic}</span></td></tr>
    </table>
    <div style="margin-top:16px;padding:16px;background:#F8FAFC;border-left:4px solid #2EC4B6;border-radius:4px;">
      <p style="margin:0;color:#64748B;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Message</p>
      <p style="margin:0;color:#0F172A;line-height:1.6;white-space:pre-wrap;">${dto.message}</p>
    </div>
    <p style="margin-top:20px;font-size:12px;color:#94A3B8;">Reply directly to <a href="mailto:${dto.email}" style="color:#2EC4B6;">${dto.email}</a> to respond to this inquiry.</p>
  </div>
</div>`;

        await this.emailService.sendMail(
            adminEmail,
            `[Contact] ${dto.topic} — ${dto.name}`,
            html,
        );

        // Also create a support thread entry — so the message appears in /admin/support
        // and (if the submitter is a known user) in their /dashboard/support thread.
        try {
            const user = await this.prisma.user.findUnique({
                where: { email: dto.email },
                select: { id: true, role: true },
            });

            const composed = `[${dto.topic}] ${dto.message}${dto.company ? `\n\nCompany: ${dto.company}` : ''}`;

            if (user) {
                // Known user — append to their existing support thread (visible to them too)
                await this.prisma.supportMessage.create({
                    data: {
                        senderId: user.id,
                        receiverId: null,
                        content: composed,
                    },
                });
            } else {
                // Unknown sender — attach to the first admin so it shows in /admin/support
                // with the submitter's email + name embedded in the body.
                const admin = await this.prisma.user.findFirst({
                    where: { role: { in: ['OWNER', 'ADMIN'] as any } },
                    select: { id: true },
                });
                if (admin) {
                    await this.prisma.supportMessage.create({
                        data: {
                            senderId: admin.id,
                            receiverId: null,
                            content: `📨 Public contact from ${dto.name} <${dto.email}>\n\n${composed}`,
                        },
                    });
                }
            }

            // Notify support staff so it appears in their notifications bell
            const staff = await this.prisma.user.findMany({
                where: { role: { in: ['ADMIN', 'OWNER', 'SUPPORT'] as any } },
                select: { id: true },
                take: 10,
            });
            await Promise.all(staff.map(s => this.prisma.notification.create({
                data: {
                    userId: s.id,
                    title: `Contact form: ${dto.topic}`,
                    message: `${dto.name} <${dto.email}>: ${dto.message.substring(0, 80)}${dto.message.length > 80 ? '…' : ''}`,
                    type: 'INFO',
                },
            }).catch(() => { })));
        } catch (e) {
            this.logger.warn(`Failed to mirror contact form to support thread: ${(e as Error).message}`);
        }

        return { ok: true };
    }
}
