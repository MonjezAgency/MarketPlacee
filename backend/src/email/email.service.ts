import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import { getInvitationEmailHtml } from './email-templates';

@Injectable()
export class EmailService {
  private transporter;
  private readonly fromName = 'Atlantis Marketplace';

  constructor() {
    const host = process.env.EMAIL_HOST || 'smtp.hostinger.com';
    const port = parseInt(process.env.EMAIL_PORT || '465');
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    console.log(`[EMAIL] ====== INIT ======`);
    console.log(`[EMAIL] SMTP: ${host}:${port} (user: ${user})`);
    console.log(`[EMAIL] Resend: ${process.env.RESEND_API_KEY ? 'KEY SET' : 'NO KEY'}`);

    // Create SMTP transport (works locally, may be blocked on Railway)
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    } as any);
  }

  private getFrom() {
    const rawFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@atlantis.com';
    if (rawFrom.includes('<') && rawFrom.includes('>')) return rawFrom;
    return `"${this.fromName}" <${rawFrom}>`;
  }

  private getFrontendUrl() {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  /**
   * Send email — tries Resend (HTTPS, never blocked from cloud hosts) FIRST,
   * falls back to SMTP only if Resend isn't configured.
   *
   * Returns { success: boolean, error?: string } so the controller can
   * surface the real reason to the admin instead of a vague "REJECTED".
   *
   * The previous order (SMTP → Resend) didn't work on Railway because
   * Hostinger SMTP rejects connections from cloud-IP ranges. Result: every
   * SMTP attempt timed out at 5s, then fell through to Resend — which on
   * an unverified domain returned 403, leaving the user with "REJECTED"
   * and no idea what to do.
   */
  /**
   * Strip HTML to a clean plain-text alternative. Gmail auto-generates
   * one when missing but its version concatenates everything into a
   * single paragraph (the "ugly spam" view the operator just saw).
   * Providing our own plain-text part keeps the subject line + an
   * inviting one-liner readable in clients that block HTML.
   */
  private htmlToPlainText(html: string): string {
    return html
      // Drop style/script/title — they are not user-facing copy.
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<title[\s\S]*?<\/title>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      // Table cell boundaries become " · " separators so the plain-text
      // version stays readable when an email client falls back to text
      // (the previous version collapsed every cell into one giant blob
      // — "Trade TermsEXW EgyptEAN8000070016185Units per case20" — and
      // the operator legitimately read it as "the template is missing").
      .replace(/<\/td>\s*<td[^>]*>/gi, ' · ')
      // Row/block-level closures become real line breaks.
      .replace(/<\/(p|div|h[1-6]|li|tr|table|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Drop every remaining tag, then unescape entities.
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Collapse multiple spaces but keep paragraph breaks intact.
      .replace(/[ \t]+/g, ' ')
      .replace(/ \n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 4000);
  }

  async sendMailDetailed(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string; provider?: string }> {
    const resendKey = process.env.RESEND_API_KEY;
    const text = this.htmlToPlainText(html);
    // Support / unsubscribe address that recipients can hit in their
    // mail client. Resend honours List-Unsubscribe-Post for one-click
    // unsubscribe, which is a major Gmail / Outlook deliverability win.
    const unsubscribeUrl = `${process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com'}/unsubscribe?email=${encodeURIComponent(to)}`;
    const replyTo = process.env.EMAIL_USER || 'Info@atlantisfmcg.com';

    // ──── Strategy 1: Resend API (PRIMARY) ────
    if (resendKey) {
      const resendFrom = process.env.RESEND_FROM || 'onboarding@resend.dev';
      try {
        console.log(`[EMAIL] Resend → ${to} (from: ${resendFrom})`);
        const res = await axios.post(
          'https://api.resend.com/emails',
          {
            from: `Atlantis FMCG <${resendFrom}>`,
            to: [to],
            reply_to: replyTo,
            subject,
            html,
            text,
            // Headers that meaningfully reduce spam scoring on Gmail /
            // Outlook. List-Unsubscribe + List-Unsubscribe-Post lets
            // clients show a one-click unsubscribe button (Gmail's
            // anti-spam treats sender domains that ignore this badly).
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${replyTo}?subject=unsubscribe>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              'X-Entity-Ref-ID': `atlantis-${Date.now()}`,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        );
        console.log(`✅ [EMAIL] Resend success — ID ${res.data?.id}`);
        return { success: true, provider: 'resend' };
      } catch (resendErr: any) {
        const status = resendErr.response?.status;
        const data = resendErr.response?.data;
        console.error(`❌ [EMAIL] Resend HTTP ${status}: ${JSON.stringify(data)}`);

        // Translate the Resend error into a human reason for the admin UI
        let reason = data?.message || resendErr.message || 'Resend API error';
        if (status === 403 && /verify.*domain/i.test(reason)) {
            reason = `Sending domain not verified in Resend. Go to https://resend.com/domains, add atlantisfmcg.com, copy the DNS records, then set RESEND_FROM=noreply@atlantisfmcg.com on Railway.`;
        } else if (status === 403 && /testing emails/i.test(reason)) {
            reason = `Resend is in testing mode — only the account owner's email can receive. Verify a sending domain to send to anyone.`;
        } else if (status === 422) {
            reason = `Resend rejected the message: ${reason}`;
        } else if (status === 401) {
            reason = `Resend API key invalid. Check RESEND_API_KEY on Railway.`;
        }
        // Fall through to SMTP attempt
        console.warn(`[EMAIL] Falling back to SMTP — ${reason}`);
        return this.smtpFallback(to, subject, html, reason);
      }
    } else {
      console.warn(`[EMAIL] RESEND_API_KEY not set — SMTP-only mode (likely fails on Railway)`);
      return this.smtpFallback(to, subject, html, 'RESEND_API_KEY not configured');
    }
  }

  private async smtpFallback(to: string, subject: string, html: string, prevError: string): Promise<{ success: boolean; error?: string; provider?: string }> {
    try {
      console.log(`[EMAIL] SMTP fallback → ${to}...`);
      const text = this.htmlToPlainText(html);
      const replyTo = process.env.EMAIL_USER || 'Info@atlantisfmcg.com';
      const unsubscribeUrl = `${process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com'}/unsubscribe?email=${encodeURIComponent(to)}`;
      const info = await this.transporter.sendMail({
        from: this.getFrom(),
        to,
        replyTo,
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${replyTo}?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      console.log(`✅ [EMAIL] SMTP success — ${info.messageId}`);
      return { success: true, provider: 'smtp' };
    } catch (smtpErr: any) {
      const reason = `${prevError}; SMTP fallback also failed: ${smtpErr.code || smtpErr.message}`;
      console.error(`❌ [EMAIL] BOTH PROVIDERS FAILED for ${to} — ${reason}`);
      return { success: false, error: reason, provider: 'none' };
    }
  }

  /**
   * Backwards-compat boolean wrapper. New callers should use sendMailDetailed
   * to get the actual error message.
   */
  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    const result = await this.sendMailDetailed(to, subject, html);
    return result.success;
  }

  async sendVerificationEmail(email: string, token: string) {
    const baseUrl = this.getFrontendUrl();
    const url = `${baseUrl}/auth/verify-email?token=${token}`;
    await this.sendMail(email, 'Verify your email - Atlantis Marketplace', `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
        <div style="background: #0A1A2F; padding: 40px 30px; text-align: center;">
          <h1 style="color: #FFFFFF; font-size: 28px; margin: 0 0 8px; font-weight: 900;">Atlan<span style="color: #1BC7C9;">tis</span></h1>
          <p style="color: #B0BCCF; font-size: 14px; margin: 0;">Enterprise B2B Distribution</p>
        </div>
        <div style="padding: 40px 30px; background: #FFFFFF;">
          <h2 style="color: #0A1A2F; font-size: 22px; margin: 0 0 16px;">Welcome to Atlantis! 👋</h2>
          <p style="color: #2E2E2E; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">Please click the button below to verify your email address and activate your account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${url}" style="display: inline-block; padding: 16px 40px; background: #1BC7C9; color: #FFFFFF; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Verify Email →</a>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #667085; text-align: center;">If the button doesn't work, copy and paste this link into your browser: <br/> ${url}</p>
        </div>
        <div style="background: #0A1A2F; padding: 20px; text-align: center;">
          <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
        </div>
      </div>
    `);
  }

  async sendPasswordResetEmail(email: string, name: string, token: string) {
    const frontendUrl = this.getFrontendUrl();
    const url = `${frontendUrl}/auth/reset-password?token=${token}`;

    console.log(`[EMAIL] Preparing password reset for ${email} with token: ${token.substring(0, 8)}...`);

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
        <div style="background: #0A1A2F; padding: 40px 30px; text-align: center;">
          <h1 style="color: #FFFFFF; font-size: 28px; margin: 0 0 8px; font-weight: 900;">Atlan<span style="color: #1BC7C9;">tis</span></h1>
          <p style="color: #B0BCCF; font-size: 14px; margin: 0;">Enterprise B2B Distribution</p>
        </div>
        <div style="padding: 40px 30px; background: #FFFFFF;">
          <h2 style="color: #0A1A2F; font-size: 22px; margin: 0 0 16px;">Password Reset Request 🔐</h2>
          <p style="color: #2E2E2E; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">Hi ${name}, you requested to reset your password. Click the button below to proceed. This link expires in 1 hour.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${url}" style="display: inline-block; padding: 16px 40px; background: #1BC7C9; color: #FFFFFF; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Reset Password →</a>
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #667085; text-align: center;">If you didn't request this, please ignore this email.</p>
        </div>
        <div style="background: #0A1A2F; padding: 20px; text-align: center;">
          <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
        </div>
      </div>
    `;

    return this.sendMail(email, 'Atlantis — Password Reset Request 🔐', html);
  }

  async sendTeamInvitation(email: string, name: string, role: string, tempPassword?: string): Promise<boolean> {
    const baseUrl = this.getFrontendUrl();
    const url = `${baseUrl}/auth/login`;
    const credentialsBlock = tempPassword ? `
            <div style="background: #F2F4F7; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #1BC7C9;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #667085; font-weight: 600;">Your login credentials:</p>
              <p style="margin: 0; font-size: 14px; color: #2E2E2E;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 0; font-size: 14px; color: #2E2E2E;"><strong>Password:</strong> ${tempPassword}</p>
              <p style="margin: 10px 0 0 0; font-size: 11px; color: #667085;">Please change your password after first login.</p>
            </div>` : '';
    
    return this.sendMail(email, 'You have been invited to the Atlantis Team', `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
          <div style="background: #0A1A2F; padding: 40px 30px; text-align: center;">
            <h1 style="color: #FFFFFF; font-size: 28px; margin: 0 0 8px; font-weight: 900;">Atlan<span style="color: #1BC7C9;">tis</span></h1>
            <p style="color: #B0BCCF; font-size: 14px; margin: 0;">Enterprise B2B Distribution</p>
          </div>
          <div style="padding: 40px 30px; background: #FFFFFF;">
            <h2 style="color: #0A1A2F; font-size: 22px; margin: 0 0 16px;">Team Invitation 🤝</h2>
            <p style="color: #2E2E2E; font-size: 15px; line-height: 1.7;">Hello <strong style="color: #0A1A2F;">${name}</strong>,</p>
            <p style="color: #2E2E2E; font-size: 15px; line-height: 1.7;">You have been invited to join the Atlantis Marketplace team as a <strong style="color: #1BC7C9;">${role}</strong>.</p>
            ${credentialsBlock}
            <p style="color: #2E2E2E; font-size: 15px; line-height: 1.7;">Please log in to your account to get started.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${url}" style="display: inline-block; padding: 16px 40px; background: #1BC7C9; color: #FFFFFF; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Login Now →</a>
            </div>
          </div>
          <div style="background: #0A1A2F; padding: 20px; text-align: center;">
            <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
          </div>
        </div>
      `);
  }

  /**
   * Send a branded invitation email to a potential partner
   */
  async sendInviteEmail(params: {
    recipientEmail: string;
    role: string;
    inviteLink: string;
    senderName?: string;
  }): Promise<{ success: boolean; error?: string; provider?: string }> {
    const html = getInvitationEmailHtml(params);
    try {
      // sendMailDetailed returns the real error reason so the admin UI can
      // surface "Domain not verified" / "API key invalid" instead of a
      // vague REJECTED badge.
      const result = await this.sendMailDetailed(
        params.recipientEmail,
        `🎉 Invitation: Join Atlantis as a ${params.role === 'supplier' ? 'Supplier' : 'Strategic Customer'}`,
        html,
      );
      return result;
    } catch (error: any) {
      console.error('ERROR [sendInviteEmail]:', error);
      return { success: false, error: error?.message || 'Unknown email error' };
    }
  }

  async sendOrderConfirmationEmail(email: string, name: string, orderId: string, total: number) {
    const frontendUrl = this.getFrontendUrl();
    try {
      await this.sendMail(email, `✅ Order Confirmed #${orderId.slice(0, 8).toUpperCase()} — Atlantis`, `
          <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
            <div style="background: #0A1A2F; padding: 40px 30px; text-align: center;">
              <h1 style="color:#fff; font-size:28px; margin:0 0 8px; font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1>
              <p style="color:#B0BCCF; font-size:14px; margin:0;">B2B Marketplace</p>
            </div>
            <div style="padding:40px 30px; background:#fff;">
              <h2 style="color:#0A1A2F; font-size:22px; margin:0 0 16px;">Order Confirmed ✅</h2>
              <p style="color:#2E2E2E; font-size:15px; line-height:1.7;">Hello <strong>${name}</strong>, your order has been placed successfully.</p>
              <div style="background:#F2F4F7; padding:20px; border-radius:12px; margin:20px 0;">
                <p style="margin:0; font-size:14px; color:#2E2E2E;"><strong>Order ID:</strong> #${orderId.slice(0, 8).toUpperCase()}</p>
                <p style="margin:8px 0 0; font-size:14px; color:#2E2E2E;"><strong>Total:</strong> $${total.toFixed(2)}</p>
              </div>
              <div style="text-align:center; margin:30px 0;">
                <a href="${frontendUrl}/dashboard/customer" style="display:inline-block; padding:16px 40px; background:#1BC7C9; color:#fff; text-decoration:none; border-radius:12px; font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:1px;">Track Your Order →</a>
              </div>
            </div>
            <div style="background:#0A1A2F; padding:20px; text-align:center;">
              <p style="color:#667085; font-size:11px; margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
            </div>
          </div>
        `);
    } catch (error) {
      console.error('ERROR [sendOrderConfirmationEmail]:', error);
    }
  }

  async sendOrderStatusUpdateEmail(email: string, name: string, orderId: string, newStatus: string, trackingUrl?: string) {
    const statusMessages: Record<string, { title: string; body: string; color: string }> = {
      PAID: { title: 'Order Confirmed ✅', body: 'Your payment has been received and your order is now confirmed. The supplier is preparing your shipment.', color: '#10B981' },
      PROCESSING: { title: 'Order is Being Processed 🔄', body: 'Your order is now being processed by the supplier.', color: '#F59E0B' },
      SHIPPED: { title: 'Order Shipped 🚚', body: `Great news! Your order has been shipped and is on its way.${trackingUrl ? ' You can track it using the link below.' : ''}`, color: '#3B82F6' },
      DELIVERED: { title: 'Order Delivered ✅', body: 'Your order has been delivered successfully. Thank you for choosing Atlantis!', color: '#10B981' },
      CANCELLED: { title: 'Order Cancelled ❌', body: 'Your order has been cancelled. Contact support if you have any questions.', color: '#EF4444' },
    };
    const info = statusMessages[newStatus] || { title: `Order Status Updated`, body: `Your order status changed to ${newStatus}.`, color: '#1BC7C9' };

    try {
      await this.sendMail(email, `${info.title} — Order #${orderId.slice(0, 8).toUpperCase()}`, `
          <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
            <div style="background: #0A1A2F; padding: 40px 30px; text-align: center; border-bottom: 4px solid ${info.color};">
              <h1 style="color:#fff; font-size:28px; margin:0 0 8px; font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1>
            </div>
            <div style="padding:40px 30px; background:#fff;">
              <h2 style="color:${info.color}; font-size:22px; margin:0 0 16px;">${info.title}</h2>
              <p style="color:#2E2E2E; font-size:15px; line-height:1.7;">Hello <strong>${name}</strong>,</p>
              <p style="color:#2E2E2E; font-size:15px; line-height:1.7;">${info.body}</p>
              <div style="background:#F2F4F7; padding:20px; border-radius:12px; margin:20px 0; border-left:4px solid ${info.color};">
                <p style="margin:0; font-size:14px; color:#2E2E2E;"><strong>Order ID:</strong> #${orderId.slice(0, 8).toUpperCase()}</p>
                <p style="margin:8px 0 0; font-size:14px; color:#2E2E2E;"><strong>Status:</strong> ${newStatus}</p>
              </div>
              ${trackingUrl ? `
              <div style="text-align:center; margin:30px 0;">
                <a href="${trackingUrl}" style="display:inline-block; padding:16px 40px; background:#3B82F6; color:#fff; text-decoration:none; border-radius:12px; font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:1px;">Track Live Shipment 🚚</a>
              </div>
              ` : ''}
            </div>
            <div style="background:#0A1A2F; padding:20px; text-align:center;">
              <p style="color:#667085; font-size:11px; margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
            </div>
          </div>
        `);
    } catch (error) {
      console.error('ERROR [sendOrderStatusUpdateEmail]:', error);
    }
  }

  async sendKycStatusEmail(email: string, name: string, status: 'VERIFIED' | 'REJECTED' | 'PENDING', adminNotes?: string) {
    if (status === 'PENDING') {
      try {
        await this.sendMail(email, '⏳ KYC Submitted — Under Review', `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#F2F4F7;border-radius:16px;overflow:hidden;"><div style="background:#0A1A2F;padding:40px 30px;text-align:center;border-bottom:4px solid #F59E0B;"><h1 style="color:#fff;font-size:28px;margin:0;font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1></div><div style="padding:40px 30px;background:#fff;"><h2 style="color:#F59E0B;font-size:22px;margin:0 0 16px;">KYC Documents Received ⏳</h2><p style="color:#2E2E2E;font-size:15px;line-height:1.7;">Hello <strong>${name}</strong>,</p><p style="color:#2E2E2E;font-size:15px;line-height:1.7;">Your identity documents have been submitted and are under review. We'll notify you once complete — usually within 24 hours.</p></div><div style="background:#0A1A2F;padding:20px;text-align:center;"><p style="color:#667085;font-size:11px;margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p></div></div>`);
      } catch (err) {
        console.error('ERROR [sendKycStatusEmail PENDING]:', err);
      }
      return;
    }
    const isApproved = status === 'VERIFIED';
    try {
      await this.sendMail(email, isApproved ? '✅ KYC Verified — Atlantis' : '❌ KYC Review Required — Atlantis', `
          <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
            <div style="background: #0A1A2F; padding: 40px 30px; text-align: center; border-bottom: 4px solid ${isApproved ? '#10B981' : '#EF4444'};">
              <h1 style="color:#fff; font-size:28px; margin:0; font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1>
            </div>
            <div style="padding:40px 30px; background:#fff;">
              <h2 style="color:${isApproved ? '#10B981' : '#EF4444'}; font-size:22px; margin:0 0 16px;">${isApproved ? 'Identity Verified ✅' : 'KYC Review Required ❌'}</h2>
              <p style="color:#2E2E2E; font-size:15px; line-height:1.7;">Hello <strong>${name}</strong>,</p>
              <p style="color:#2E2E2E; font-size:15px; line-height:1.7;">
                ${isApproved
                  ? 'Your identity has been successfully verified. You can now access all platform features including payment methods.'
                  : 'Your KYC submission requires attention. Please review the notes below and resubmit your documents.'}
              </p>
              ${adminNotes ? `<div style="background:#FEF2F2; padding:16px; border-radius:12px; margin:20px 0; border-left:4px solid #EF4444;"><p style="margin:0; font-size:14px; color:#991B1B;"><strong>Notes:</strong> ${adminNotes}</p></div>` : ''}
            </div>
            <div style="background:#0A1A2F; padding:20px; text-align: center;">
              <p style="color:#667085; font-size:11px; margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
            </div>
          </div>
        `);
    } catch (error) {
      console.error('ERROR [sendKycStatusEmail]:', error);
    }
  }

  async sendWelcomeEmail(email: string, name: string, role: string) {
    const frontendUrl = this.getFrontendUrl();
    const isSupplier = role.toUpperCase() === 'SUPPLIER';
    
    // Supplier CTA → /supplier (the supplier hub, layout lives at
    //   frontend/src/app/supplier/layout.tsx — NOT /dashboard/supplier
    //   which 404s).
    // Buyer CTA → / (homepage / catalog).
    const ctaUrl = isSupplier
      ? `${frontendUrl}/supplier`
      : `${frontendUrl}/`;

    const ctaText = isSupplier
      ? 'Go to Your Dashboard →'
      : 'Start Shopping Now →';

    const welcomeBody = isSupplier
      ? 'Excellent news! Our team has verified your business profile. You can now access the full power of the Atlantis supplier hub.'
      : 'Excellent news! Your account is active and you can now start sourcing premium products directly from our global partners.';

    await this.sendMail(email, 'Welcome to Atlantis — Your account is approved! 🎉', this.atlantisShell({
      title: `Welcome, ${name}! 👋`,
      subtitle: 'Your account is ready.',
      iconType: 'success',
      body: `<p style="font-size:16px;color:#475569;margin:0 0 28px;line-height:1.65;">${welcomeBody}</p>`,
      ctaText,
      ctaUrl,
    }));
  }

  /**
   * Reusable Atlantis email shell — gradient navy header with the
   * ATLANTIS / FMCG wordmark, a floating icon (success / pending /
   * warning / info), the body the caller passes in, an optional
   * primary CTA button, and a clean footer. Mirrors the visual
   * language of the campaign builder so every transactional + every
   * marketing email looks like the same brand.
   */
  private atlantisShell(opts: {
    title: string;
    subtitle?: string;
    iconType?: 'success' | 'pending' | 'warning' | 'info';
    body: string;
    ctaText?: string;
    ctaUrl?: string;
    footerNote?: string;
  }): string {
    const iconBg: Record<string, string> = {
      success: '#2EC4B6',
      pending: '#F59E0B',
      warning: '#EF4444',
      info:    '#3B82F6',
    };
    const iconSvg: Record<string, string> = {
      success: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      pending: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      warning: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info:    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };
    const iconColor = iconBg[opts.iconType || 'info'];
    const icon = iconSvg[opts.iconType || 'info'];

    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.08);">

      <!-- Header — Atlantis brand mark on gradient navy. The logo is
           the public PNG hosted at /icon.png on the frontend domain;
           email clients can fetch any HTTPS URL but block local data
           so a CDN-style hosted asset is the only reliable option. -->
      <tr><td style="background:linear-gradient(135deg,#0B1F3A 0%,#0F172A 100%);padding:40px 40px 56px;text-align:center;">
        <div style="display:inline-block;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:14px;">
              <img src="${(process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '')}/icon.png" alt="Atlantis" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:12px;background:#ffffff;padding:4px;box-sizing:border-box;" />
            </td>
            <td style="vertical-align:middle;text-align:left;">
              <div style="color:#ffffff;font-family:Inter,Arial,sans-serif;font-weight:900;font-size:22px;letter-spacing:0.02em;line-height:1;">ATLANTIS</div>
              <div style="color:#2EC4B6;font-family:Inter,Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:0.4em;margin-top:4px;line-height:1;">FMCG</div>
            </td>
          </tr></table>
        </div>
      </td></tr>

      <!-- Floating status icon -->
      <tr><td style="background:#ffffff;padding:0;text-align:center;height:0;">
        <div style="margin-top:-32px;display:inline-block;width:64px;height:64px;border-radius:50%;background:${iconColor};box-shadow:0 8px 24px ${iconColor}40;line-height:64px;text-align:center;">
          <span style="display:inline-block;vertical-align:middle;line-height:0;">${icon}</span>
        </div>
      </td></tr>

      <!-- Title + subtitle -->
      <tr><td style="padding:24px 40px 8px;text-align:center;">
        <h1 style="color:#0F172A;font-family:Inter,Arial,sans-serif;font-size:28px;font-weight:900;margin:0 0 8px;line-height:1.2;letter-spacing:-0.02em;">${opts.title}</h1>
        ${opts.subtitle ? `<p style="color:#2EC4B6;font-family:Inter,Arial,sans-serif;font-weight:700;font-size:15px;margin:0;letter-spacing:0.01em;">${opts.subtitle}</p>` : ''}
      </td></tr>

      <!-- Body content -->
      <tr><td style="padding:24px 48px 16px;text-align:center;">
        <div style="height:1px;background:#E2E8F0;margin:0 auto 28px;width:60px;"></div>
        ${opts.body}
        ${opts.ctaText && opts.ctaUrl ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 8px;"><tr>
            <td style="background:#2EC4B6;border-radius:14px;box-shadow:0 6px 20px rgba(46,196,182,0.35);">
              <a href="${opts.ctaUrl}" style="display:inline-block;padding:16px 36px;color:#ffffff;font-family:Inter,Arial,sans-serif;font-weight:800;font-size:14px;text-decoration:none;letter-spacing:0.04em;text-transform:uppercase;">${opts.ctaText}</a>
            </td>
          </tr></table>
        ` : ''}
        ${opts.footerNote ? `<p style="color:#94A3B8;font-family:Inter,Arial,sans-serif;font-size:12px;margin:24px 0 0;line-height:1.5;">${opts.footerNote}</p>` : ''}
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#F8FAFC;padding:24px 40px;border-top:1px solid #E2E8F0;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
          <td style="vertical-align:middle;padding-right:10px;">
            <img src="${(process.env.FRONTEND_URL || 'https://www.atlantisfmcg.com').replace(/\/+$/, '')}/icon.png" alt="Atlantis" width="28" height="28" style="display:block;width:28px;height:28px;border-radius:7px;" />
          </td>
          <td style="vertical-align:middle;text-align:left;">
            <span style="color:#0F172A;font-family:Inter,Arial,sans-serif;font-weight:900;font-size:13px;letter-spacing:0.01em;">ATLANTIS</span>
            <span style="color:#2EC4B6;font-family:Inter,Arial,sans-serif;font-weight:700;font-size:10px;letter-spacing:0.3em;margin-left:6px;">FMCG</span>
          </td>
        </tr></table>
        <p style="color:#94A3B8;font-family:Inter,Arial,sans-serif;font-size:11px;margin:14px 0 0;">© ${new Date().getFullYear()} Atlantis FMCG · All rights reserved</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  }

  async sendRejectionEmail(email: string, name: string, reason?: string) {
    await this.sendMail(email, 'Update regarding your Atlantis application', this.atlantisShell({
      title: 'Application Update',
      subtitle: `Hello ${name}`,
      iconType: 'warning',
      body: `
        <p style="font-size:15px;color:#475569;margin:0 0 18px;line-height:1.65;">Thank you for your interest in Atlantis. After reviewing your application, we are unable to approve your account at this time.</p>
        ${reason ? `<div style="background:#FEF2F2;padding:16px 20px;border-radius:14px;margin:20px 0;border-left:4px solid #EF4444;text-align:left;"><p style="margin:0;font-size:13px;color:#991B1B;line-height:1.6;"><strong style="color:#7F1D1D;">Reason:</strong> ${reason}</p></div>` : ''}
        <p style="font-size:13px;color:#94A3B8;margin:18px 0 0;line-height:1.6;">If you believe this is a mistake or have updated documentation, please contact our compliance team at Info@atlantisfmcg.com.</p>
      `,
    }));
  }

  /**
   * Pending-registration acknowledgement — sent immediately after a
   * supplier (or buyer) finishes signup so they know their account
   * is in the review queue and roughly when to expect a response.
   * Mirrors the in-app "Registration Pending" screen design.
   */
  async sendRegistrationPendingEmail(email: string, name: string, role: string) {
    const isSupplier = role.toUpperCase() === 'SUPPLIER';
    const subject = isSupplier
      ? 'Atlantis · Your supplier application is under review'
      : 'Atlantis · Your account is under review';
    await this.sendMail(email, subject, this.atlantisShell({
      title: 'Registration Pending',
      subtitle: `Hello ${name}`,
      iconType: 'pending',
      body: `
        <p style="font-size:15px;color:#475569;margin:0 0 20px;line-height:1.65;">
          Your account is currently being reviewed by our administration team.
        </p>
        <div style="background:#F0FDFA;border:1px solid #99F6E4;border-radius:14px;padding:18px 22px;margin:20px 0;text-align:left;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td style="vertical-align:top;width:36px;padding-top:2px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F766E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </td>
            <td style="vertical-align:top;">
              <p style="margin:0 0 4px;color:#0F172A;font-family:Inter,Arial,sans-serif;font-size:13px;font-weight:800;">Notification Email</p>
              <p style="margin:0;color:#475569;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.6;">
                We will email <strong style="color:#0F766E;">${email}</strong> as soon as your request is processed. This typically takes <strong>24-48 hours</strong>.
              </p>
            </td>
          </tr></table>
        </div>
        <p style="font-size:12px;color:#94A3B8;margin:20px 0 0;line-height:1.6;">
          ${isSupplier
            ? 'You will receive a verification link once approved — until then, login is locked.'
            : 'You can still browse the catalog while we verify your details.'}
        </p>
      `,
      footerNote: 'Connecting buyers and suppliers worldwide.',
    }));
  }

  async sendArrivingTodayEmail(email: string, name: string, orderId: string) {
    await this.sendMail(email, `🚚 Your Order #${orderId.slice(0, 8).toUpperCase()} is arriving today!`, `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
        <div style="background: #0A1A2F; padding: 40px 30px; text-align: center; border-bottom: 4px solid #1BC7C9;">
          <h1 style="color: white; font-size: 26px; margin: 0; font-weight: 900;">Out for Delivery 🚚</h1>
        </div>
        <div style="padding: 40px 30px; background: #fff; text-align: center;">
          <p style="font-size: 18px; color: #0A1A2F; font-weight: 800;">Get Ready, ${name}!</p>
          <p style="font-size: 16px; color: #2E2E2E; margin-bottom: 25px;">Your order <strong>#${orderId.slice(0, 8).toUpperCase()}</strong> is out for delivery and should arrive today.</p>
          <div style="background: #F8FAFC; padding: 20px; border-radius: 16px; border: 1px solid #E2E8F0; margin-bottom: 30px;">
            <p style="margin: 0; font-size: 14px; color: #64748B;">Please ensure someone is available at the delivery address to receive the shipment.</p>
          </div>
        </div>
        <div style="background: #0A1A2F; padding: 20px; text-align: center;">
          <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
        </div>
      </div>
    `);
  }

  async sendFeedbackPromptEmail(email: string, name: string, orderId: string) {
    const frontendUrl = this.getFrontendUrl();
    await this.sendMail(email, `How was your order #${orderId.slice(0, 8).toUpperCase()}? ⭐️`, `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
        <div style="background: #0A1A2F; padding: 40px 30px; text-align: center; border-bottom: 4px solid #F59E0B;">
          <h1 style="color: white; font-size: 26px; margin: 0; font-weight: 900;">Your Feedback Matters ⭐️</h1>
        </div>
        <div style="padding: 40px 30px; background: #fff; text-align: center;">
          <p style="font-size: 16px; color: #2E2E2E; margin-bottom: 25px;">Hi ${name}, we hope you're happy with your recent purchase!</p>
          <p style="font-size: 15px; color: #64748B; margin-bottom: 30px;">Could you take a moment to confirm delivery and rate your experience?</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}/dashboard/customer" style="display: inline-block; padding: 16px 40px; background: #0A1A2F; color: #FFFFFF; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Rate Experience →</a>
          </div>
        </div>
        <div style="background: #0A1A2F; padding: 20px; text-align: center;">
          <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
        </div>
      </div>
    `);
  }

  async sendPendingReviewEmail(email: string, name: string) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    await this.sendMail(email, 'Atlantis — Your application is under review ⏳', `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
        <div style="background: #0A1A2F; padding: 40px 30px; text-align: center;">
          <h1 style="color: white; font-size: 26px; margin: 0; font-weight: 900;">Thank You, ${name}!</h1>
        </div>
        <div style="padding: 40px 30px; background: #fff; text-align: center;">
          <p style="font-size: 16px; color: #2E2E2E; margin-bottom: 25px;">Your registration is being reviewed by our team. We'll notify you once approved (usually within 24 hours).</p>
          <a href="${frontendUrl}/auth/pending" style="display: inline-block; background:#1BC7C9; color:#fff; padding:14px 28px; border-radius:12px; text-decoration:none; font-weight: 800;">
            Check Status
          </a>
        </div>
        <div style="background: #0A1A2F; padding: 20px; text-align: center;">
          <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
        </div>
      </div>
    `);
  }

  async sendAdminNewUserNotification(userEmail: string, companyName: string) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@atlantis.com';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    await this.sendMail(adminEmail, 'Atlantis Admin — New Registration Pending 🔔', `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
        <div style="background: #0A1A2F; padding: 30px; text-align: center;">
          <h1 style="color: #fff; font-size: 20px; margin: 0;">New User Registration</h1>
        </div>
        <div style="padding: 30px; background: #fff;">
          <p><strong>Company:</strong> ${companyName}</p>
          <p><strong>Email:</strong> ${userEmail}</p>
          <div style="margin-top: 25px; text-align: center;">
            <a href="${frontendUrl}/admin/verifications" style="display: inline-block; background:#1BC7C9; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight: bold;">
              Review Application
            </a>
          </div>
        </div>
      </div>
    `);
  }

  async sendInvoiceEmail(email: string, name: string, invoiceNumber: string, orderId: string, totalAmount: number, dueDate: Date) {
    const frontendUrl = this.getFrontendUrl();
    try {
      await this.sendMail(email, `🧾 Invoice ${invoiceNumber} — Atlantis Marketplace`, `
          <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
            <div style="background: #0A1A2F; padding: 40px 30px; text-align: center; border-bottom: 4px solid #1BC7C9;">
              <h1 style="color:#fff; font-size:28px; margin:0 0 8px; font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1>
              <p style="color:#B0BCCF; font-size:14px; margin:0;">B2B Marketplace</p>
            </div>
            <div style="padding:40px 30px; background:#fff;">
              <h2 style="color:#0A1A2F; font-size:22px; margin:0 0 16px;">Invoice Ready 🧾</h2>
              <p style="color:#2E2E2E; font-size:15px; line-height:1.7;">Hello <strong>${name}</strong>, your invoice for order #${orderId.slice(0,8).toUpperCase()} is now available.</p>
              <div style="background:#F2F4F7; padding:20px; border-radius:12px; margin:20px 0; border-left:4px solid #1BC7C9;">
                <p style="margin:0; font-size:14px;"><strong>Invoice:</strong> ${invoiceNumber}</p>
                <p style="margin:8px 0 0; font-size:14px;"><strong>Total:</strong> $${totalAmount.toFixed(2)}</p>
                <p style="margin:8px 0 0; font-size:14px;"><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>
              </div>
              <div style="text-align:center; margin:30px 0;">
                <a href="${frontendUrl}/dashboard/customer" style="display:inline-block; padding:16px 40px; background:#1BC7C9; color:#fff; text-decoration:none; border-radius:12px; font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:1px;">Download Invoice →</a>
              </div>
            </div>
            <div style="background:#0A1A2F; padding:20px; text-align:center;">
              <p style="color:#667085; font-size:11px; margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
            </div>
          </div>
        `);
    } catch (error) {
      console.error('ERROR [sendInvoiceEmail]:', error);
    }
  }

  async sendShippingConfirmationWithInvoice(
    email: string,
    name: string,
    orderId: string,
    invoiceNumber: string,
    orderItems: { name: string; quantity: number; price: number }[],
    shippingCompany: string,
    shippingCost: number,
    estimatedDays: string,
    destinationAddress: string,
    subtotal: number,
    totalAmount: number,
    currency: string = 'EUR',
  ) {
    const frontendUrl = this.getFrontendUrl();
    const currencySymbol = currency.toUpperCase() === 'EUR' ? '€' : currency.toUpperCase() === 'GBP' ? '£' : '$';
    const fmt = (n: number) => `${currencySymbol}${n.toFixed(2)}`;

    const itemRows = orderItems.map(i => `
      <tr>
        <td style="padding:10px 8px; font-size:13px; color:#2E2E2E; border-bottom:1px solid #EEF0F2;">${i.name}</td>
        <td style="padding:10px 8px; font-size:13px; color:#2E2E2E; text-align:center; border-bottom:1px solid #EEF0F2;">${i.quantity}</td>
        <td style="padding:10px 8px; font-size:13px; color:#2E2E2E; text-align:right; border-bottom:1px solid #EEF0F2; font-weight:700;">${fmt(i.price * i.quantity)}</td>
      </tr>
    `).join('');

    const carrierLogos: Record<string, string> = {
      'DB SCHENKER':  '#C8102E',
      'LKW WALTER':   '#FF6600',
      'Raben Group':  '#003DA5',
    };
    const carrierColor = carrierLogos[shippingCompany] || '#1BC7C9';

    try {
      await this.sendMail(email, `✅ Order Confirmed + Invoice ${invoiceNumber} — ${shippingCompany} | Atlantis`, `
          <div style="font-family:'Segoe UI',Arial,sans-serif; max-width:620px; margin:0 auto; background:#F2F4F7; border-radius:16px; overflow:hidden;">
            <div style="background:#0A1A2F; padding:36px 30px; text-align:center; border-bottom:4px solid #1BC7C9;">
              <h1 style="color:#fff; font-size:30px; margin:0 0 4px; font-weight:900; letter-spacing:-1px;">Atlan<span style="color:#1BC7C9;">tis</span></h1>
              <p style="color:#B0BCCF; font-size:12px; margin:0; letter-spacing:2px; text-transform:uppercase;">B2B Marketplace</p>
            </div>
            <div style="background:#fff; padding:36px 30px 0;">
              <div style="background:#E8FFF5; border:1.5px solid #10B981; border-radius:12px; padding:16px 20px; margin-bottom:24px;">
                <span style="font-size:24px; margin-right:12px;">✅</span>
                <div style="display:inline-block;">
                  <p style="margin:0; font-size:16px; font-weight:800; color:#065F46;">Payment Received & Order Confirmed</p>
                  <p style="margin:4px 0 0; font-size:13px; color:#065F46;">Order <strong>#${orderId.slice(0,8).toUpperCase()}</strong> — Invoice <strong>${invoiceNumber}</strong></p>
                </div>
              </div>
              <p style="color:#2E2E2E; font-size:15px; line-height:1.7; margin:0 0 24px;">Dear <strong>${name}</strong>, your order has been confirmed and payment processed.</p>
            </div>
            <div style="background:#fff; padding:0 30px 24px;">
              <h3 style="font-size:14px; font-weight:800; color:#0A1A2F; margin:0 0 12px; text-transform:uppercase; letter-spacing:1px;">Invoice ${invoiceNumber}</h3>
              <table style="width:100%; border-collapse:collapse; background:#FAFAFA; border-radius:8px; overflow:hidden;">
                <thead>
                  <tr style="background:#0A1A2F;">
                    <th style="padding:10px 8px; font-size:12px; color:#B0BCCF; text-align:left; font-weight:700; text-transform:uppercase;">Product</th>
                    <th style="padding:10px 8px; font-size:12px; color:#B0BCCF; text-align:center; font-weight:700; text-transform:uppercase;">Qty</th>
                    <th style="padding:10px 8px; font-size:12px; color:#B0BCCF; text-align:right; font-weight:700; text-transform:uppercase;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                  <tr style="background:#F2F4F7;">
                    <td colspan="2" style="padding:10px 8px; font-size:13px; color:#667085;">Subtotal</td>
                    <td style="padding:10px 8px; font-size:13px; text-align:right; color:#667085;">${fmt(subtotal)}</td>
                  </tr>
                  <tr style="background:#F2F4F7;">
                    <td colspan="2" style="padding:10px 8px; font-size:13px; color:#667085;">Shipping (${shippingCompany})</td>
                    <td style="padding:10px 8px; font-size:13px; text-align:right; color:#667085;">${fmt(shippingCost)}</td>
                  </tr>
                  <tr style="background:#0A1A2F;">
                    <td colspan="2" style="padding:12px 8px; font-size:15px; font-weight:900; color:#fff;">TOTAL DUE</td>
                    <td style="padding:12px 8px; font-size:15px; font-weight:900; text-align:right; color:#1BC7C9;">${fmt(totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style="background:#fff; padding:0 30px 30px;">
              <div style="background:#F8F9FF; border:1.5px solid ${carrierColor}; border-radius:12px; padding:18px 20px;">
                <p style="margin:0 0 4px; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Logistics Partner</p>
                <p style="margin:0 0 8px; font-size:18px; font-weight:900; color:${carrierColor};">${shippingCompany}</p>
                <p style="margin:0; font-size:11px; color:#667085;">Estimated: ${estimatedDays} business days — ${destinationAddress}</p>
              </div>
            </div>
            <div style="background:#fff; padding:0 30px 36px; text-align:center;">
              <a href="${frontendUrl}/dashboard/customer" style="display:inline-block; padding:16px 48px; background:#1BC7C9; color:#fff; text-decoration:none; border-radius:12px; font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:1px;">Track Order →</a>
            </div>
            <div style="background:#0A1A2F; padding:20px 30px; text-align:center;">
              <p style="color:#667085; font-size:11px; margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
            </div>
          </div>
        `);
    } catch (error) {
      console.error('ERROR [sendShippingConfirmationWithInvoice]:', error);
    }
  }

  async sendEmailOtp(email: string, name: string, code: string) {
    try {
      await this.sendMail(email, `🔐 Your Atlantis Verification Code: ${code}`, `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#F2F4F7;border-radius:16px;overflow:hidden;"><div style="background:#0A1A2F;padding:40px 30px;text-align:center;border-bottom:4px solid #FF9900;"><h1 style="color:#fff;font-size:28px;margin:0;font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1></div><div style="padding:40px 30px;background:#fff;"><h2 style="color:#0A1A2F;font-size:22px;margin:0 0 16px;">Verification Code 🔐</h2><p style="color:#2E2E2E;font-size:15px;">Hello <strong>${name}</strong>,</p><p style="color:#2E2E2E;font-size:15px;">Your one-time verification code is:</p><div style="background:#F2F4F7;border-radius:12px;padding:24px;text-align:center;margin:24px 0;"><span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#0A1A2F;font-family:monospace;">${code}</span></div><p style="color:#667085;font-size:13px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p></div><div style="background:#0A1A2F;padding:20px;text-align:center;"><p style="color:#667085;font-size:11px;margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p></div></div>`);
    } catch (err) {
      console.error('ERROR [sendEmailOtp]:', err);
    }
  }

  /**
   * Send a registration confirmation email to a new user
   */
  async sendRegistrationConfirmationEmail(email: string, name: string, locale: string = 'en') {
    const isAr = locale === 'ar';
    const subject = isAr ? 'تم استلام طلب التسجيل - Atlantis Marketplace Onboarding' : 'Registration Received - Atlantis Marketplace Onboarding';
    
    try {
      await this.sendMail(email, subject, `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
            <div style="background: #0A1A2F; padding: 50px 30px; text-align: center; border-bottom: 4px solid #1BC7C9;">
              <h1 style="color: white; font-size: 28px; margin: 0 0 10px; font-weight: 900;">${isAr ? 'شكراً لتسجيلك! 👋' : 'Thank You for Registering! 👋'}</h1>
              <p style="color: #1BC7C9; font-size: 16px; font-weight: bold; margin: 0;">${isAr ? 'طلبك قيد المراجعة الآن' : 'Your request is now under review'}</p>
            </div>
            
            <div style="padding: 40px 30px; background: #FFFFFF; text-align: ${isAr ? 'right' : 'left'};">
              <p style="font-size: 18px; line-height: 1.6; color: #2E2E2E;">${isAr ? 'مرحباً' : 'Hello'} <strong style="color: #1BC7C9;">${name || (isAr ? 'شريكنا العزيز' : 'Dear Partner')}</strong>،</p>
              <p style="font-size: 16px; line-height: 1.8; color: #2E2E2E;">
                ${isAr 
                  ? 'شكراً جزيلاً لتسجيلك في منصة Atlantis. لقد استلمنا طلب انضمامك بنجاح، ويتم الآن مراجعته لضمان أفضل تجربة لك.' 
                  : 'Thank you for registering with Atlantis. We have successfully received your application, and it is currently being reviewed to ensure the best experience for you.'}
              </p>
              
              <div style="background: #F2F4F7; border-${isAr ? 'right' : 'left'}: 4px solid #1BC7C9; padding: 20px; margin: 30px 0; border-radius: 8px;">
                <p style="margin: 0; font-weight: bold; color: #0A1A2F; font-size: 15px;">
                  ${isAr 
                    ? 'سيتم مراجعة طلبك والموافقة عليه في غضون الـ 24 ساعة القادمة بإذن الله.' 
                    : 'Your request will be reviewed and approved within the next 24 hours.'}
                </p>
              </div>

              <p style="font-size: 13px; color: #667085; text-align: center; margin-top: 40px;">
                ${isAr ? 'فريق Atlantis يتمنى لك يوماً سعيداً!' : 'The Atlantis team wishes you a great day!'}
              </p>
            </div>

            <div style="background: #0A1A2F; padding: 25px; text-align: center;">
              <p style="color: #FFFFFF; font-size: 16px; font-weight: 900; margin: 0 0 4px;">Atlan<span style="color: #1BC7C9;">tis</span></p>
              <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
            </div>
          </div>
        `);
    } catch (error) {
      console.error('ERROR [sendRegistrationConfirmationEmail]:', error);
      throw error;
    }
  }

  /** Generic raw email — used by ReportsService and other internal senders */
  async sendRawEmail(to: string, subject: string, html: string): Promise<void> {
    await this.sendMail(to, subject, html);
  }

  async sendAdminSignupAlert(userData: {
      name: string;
      email: string;
      role: string;
      companyName?: string;
      registeredAt: Date;
  }): Promise<void> {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (!adminEmail) {
          console.warn('[EMAIL] ADMIN_EMAIL not set — skipping admin signup alert');
          return;
      }
      
      const subject = `🆕 New Registration Pending Review — ${userData.name}`;
      const html = `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
          <div style="background: #0A1A2F; padding: 40px 30px; text-align: center; border-bottom: 4px solid #F59E0B;">
            <h1 style="color:#fff; font-size:28px; margin:0; font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1>
            <p style="color:#B0BCCF; font-size:14px; margin:8px 0 0;">Admin Alert</p>
          </div>
          <div style="padding:40px 30px; background:#fff;">
            <h2 style="color:#F59E0B; font-size:20px; margin:0 0 16px;">New Registration Pending 🔔</h2>
            <div style="background:#F2F4F7; padding:20px; border-radius:12px; margin:16px 0;">
              <p style="margin:4px 0; font-size:14px;"><strong>Name:</strong> ${userData.name}</p>
              <p style="margin:4px 0; font-size:14px;"><strong>Email:</strong> ${userData.email}</p>
              <p style="margin:4px 0; font-size:14px;"><strong>Role:</strong> ${userData.role}</p>
              ${userData.companyName ? `<p style="margin:4px 0; font-size:14px;"><strong>Company:</strong> ${userData.companyName}</p>` : ''}
              <p style="margin:4px 0; font-size:14px;"><strong>Time:</strong> ${userData.registeredAt.toISOString()}</p>
            </div>
            <div style="text-align:center; margin:30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/users?status=PENDING_APPROVAL" style="display:inline-block; padding:14px 36px; background:#1BC7C9; color:#fff; text-decoration:none; border-radius:12px; font-weight:800; font-size:13px;">Review Pending Users →</a>
            </div>
          </div>
          <div style="background:#0A1A2F; padding:20px; text-align:center;">
            <p style="color:#667085; font-size:11px; margin:0;">© 2026 Atlantis Marketplace</p>
          </div>
        </div>
      `;
      
      await this.sendMail(adminEmail, subject, html);
  }
}
