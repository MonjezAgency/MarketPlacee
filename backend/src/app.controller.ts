import { Controller, Get, Post, Body, HttpCode } from '@nestjs/common';
import { IsEmail, IsString, IsOptional } from 'class-validator';
import { AppService } from './app.service';
import { EmailService } from './email/email.service';

class ContactDto {
    @IsString() name: string;
    @IsEmail() email: string;
    @IsOptional() @IsString() company?: string;
    @IsString() topic: string;
    @IsString() message: string;
}

@Controller()
export class AppController {
    constructor(
        private readonly appService: AppService,
        private readonly emailService: EmailService,
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

        return { ok: true };
    }
}
