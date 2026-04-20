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

    if (!user || !pass) {
        console.warn('⚠️ SMTP Credentials missing in .env. Email delivery will depend on Resend fallback.');
    }

    console.log(`[SMTP] Initializing for ${host}:${port} (secure: ${port === 465})`);

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      pool: false,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs (dev only)
        minVersion: 'TLSv1.2', // Enforce modern TLS
      },
      connectionTimeout: 15000, // Increased to 15s for slow connections
      greetingTimeout: 15000,
      socketTimeout: 20000, // Added socket timeout
      logger: false, // Disable verbose nodemailer logging
      debug: false,
    } as any);

    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ SMTP CONNECTION FAILED:', error.message);
      } else {
        console.log('✅ SMTP CONNECTION ESTABLISHED');
      }
    });
  }

  private getFrom() {
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@atlantis.com';
    return `"${this.fromName}" <${fromEmail}>`;
  }

  private getFrontendUrl() {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  /**
   * Primary mail sender with retry and fallback
   */
  async sendMail(to: string, subject: string, html: string, retries = 1): Promise<boolean> {
    const retryableErrors = ['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKET', 'ENOTFOUND', 'EAI_AGAIN'];

    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.error('[SMTP_ERROR] Missing EMAIL_USER or EMAIL_PASS in .env');
            throw new Error('MISSING_SMTP_CONFIG');
        }

        await this.transporter.sendMail({
            from: this.getFrom(),
            to,
            subject,
            html,
        });
        console.log(`[SMTP_SUCCESS] Sent to ${to}`);
        return true;
    } catch (error: any) {
        // Structured error logging for easier debugging
        const errorCode = error.code || 'UNKNOWN';
        const errorMsg = error.message || 'No message';
        
        this.logSmtpError(errorCode, errorMsg, to, subject);

        const isRetryable = retryableErrors.includes(errorCode);
        
        if (isRetryable && retries > 0) {
            console.warn(`[SMTP_RETRY] Attempting retry for ${to} due to ${errorCode}...`);
            await new Promise(res => setTimeout(res, 2000));
            return this.sendMail(to, subject, html, retries - 1);
        }

        // Only fallback to Resend if it's a connection issue or SMTP-specific failure
        // We don't fallback for invalid recipient errors (550, etc.)
        if (errorCode.startsWith('55') || errorCode === 'EENVELOPE') {
            console.error(`[SMTP_FATAL] Invalid recipient or envelope error for ${to}. Skipping fallback.`);
            return false;
        }

        console.error(`[SMTP_FAIL] Falling back to Resend for ${to}`);
        const result = await this.sendViaResend({ to, subject, html });
        
        if (!result) {
            // Log final failure after all transports failed
            console.error(`[EMAIL_SYSTEM_FATAL] All delivery methods failed for ${to}`);
            return false; // Return false instead of throwing to allow app to continue gracefully
        }
        
        return true;
    }
  }

  private logSmtpError(code: string, message: string, to: string, subject: string) {
    const timestamp = new Date().toISOString();
    console.error(`--- [SMTP ERROR DIAGNOSTIC] ---`);
    console.error(`Time: ${timestamp}`);
    console.error(`Code: ${code}`);
    console.error(`Message: ${message}`);
    console.error(`Target: ${to}`);
    console.error(`Subject: ${subject}`);
    
    if (code === 'EAUTH') {
        console.error(`Analysis: SMTP Authentication failed. Verify EMAIL_USER/EMAIL_PASS.`);
    } else if (code === 'ETIMEDOUT') {
        console.error(`Analysis: Connection timed out. Check firewall, port (465 vs 587), and EMAIL_HOST.`);
    } else if (code === 'ECONNREFUSED') {
        console.error(`Analysis: Connection refused. Verify host and port.`);
    }
    console.error(`-------------------------------`);
  }

  private async sendViaResend(options: { to: string; subject: string; html: string; }): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error('[RESEND_FAIL] Missing RESEND_API_KEY env variable.');
        return false;
    }

    try {
        await axios.post(
            'https://api.resend.com/emails',
            {
                from: `Atlantis Marketplace <${process.env.RESEND_FROM || 'onboarding@resend.dev'}>`,
                to: [options.to],
                subject: options.subject,
                html: options.html,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log(`[RESEND_SUCCESS] Sent to ${options.to}`);
        return true;
    } catch (err: any) {
        console.error(`[RESEND_FAIL] Failed for ${options.to}:`, err.response?.data || err.message);
        return false;
    }
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

    const text = `Hi ${name}, \n\nYou requested a password reset for your Atlantis account. \n\nPlease use the following link to reset your password: \n${url} \n\nThis link expires in 1 hour. \n\nIf you did not request this, please ignore this email.`;

    try {
        await this.sendMail(email, 'Atlantis — Password Reset Request 🔐', html);
        return true;
    } catch (err: any) {
        console.error(`[EMAIL_ERROR] sendPasswordResetEmail failed for ${email}:`, err.message);
        return false;
    }
  }

  async sendTeamInvitation(email: string, name: string, role: string, tempPassword?: string) {
    const baseUrl = this.getFrontendUrl();
    const url = `${baseUrl}/auth/login`;
    const credentialsBlock = tempPassword ? `
            <div style="background: #F2F4F7; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #1BC7C9;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #667085; font-weight: 600;">Your login credentials:</p>
              <p style="margin: 0; font-size: 14px; color: #2E2E2E;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 0; font-size: 14px; color: #2E2E2E;"><strong>Password:</strong> ${tempPassword}</p>
              <p style="margin: 10px 0 0 0; font-size: 11px; color: #667085;">Please change your password after first login.</p>
            </div>` : '';
    try {
      await this.sendMail(email, 'You have been invited to the Atlantis Team', `
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
    } catch (error) {
      console.error('ERROR [sendTeamInvitation]:', error);
      throw error;
    }
  }

  /**
   * Send a branded invitation email to a potential partner
   */
  async sendInviteEmail(params: {
    recipientEmail: string;
    role: string;
    inviteLink: string;
    senderName?: string;
  }) {
    const html = getInvitationEmailHtml(params);
    const text = `🎉 You're invited to join Atlantis as a ${params.role}! \n\nClick here to join: ${params.inviteLink}`;

    try {
      const result = await this.sendMail(params.recipientEmail, `🎉 Invitation: Join Atlantis as a ${params.role === 'supplier' ? 'Supplier' : 'Strategic Customer'}`, html);
      return { success: result };
    } catch (error) {
      console.error('ERROR [sendInviteEmail]:', error);
      throw error;
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

  async sendOrderStatusUpdateEmail(email: string, name: string, orderId: string, newStatus: string) {
    const statusMessages: Record<string, { title: string; body: string; color: string }> = {
      PROCESSING: { title: 'Order is Being Processed 🔄', body: 'Your order is now being processed by the supplier.', color: '#F59E0B' },
      SHIPPED: { title: 'Order Shipped 🚚', body: 'Great news! Your order has been shipped and is on its way.', color: '#3B82F6' },
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
    const ctaUrl = role.toUpperCase() === 'SUPPLIER'
      ? `${frontendUrl}/dashboard/supplier`
      : `${frontendUrl}/dashboard/buyer`;

    await this.sendMail(email, 'Welcome to Atlantis — Your account is approved! 🎉', `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
        <div style="background: #0A1A2F; padding: 50px 40px; text-align: center;">
          <h1 style="color: white; font-size: 32px; margin: 0 0 10px; font-weight: 900;">Welcome, ${name}! 👋</h1>
          <p style="color: #1BC7C9; font-size: 18px; margin: 0;">Your account has been approved.</p>
        </div>
        <div style="padding: 40px 30px; background: #fff; text-align: center;">
          <p style="font-size: 16px; color: #2E2E2E; margin-bottom: 25px;">Excellent news! Our team has verified your business profile. You can now access the full power of the Atlantis marketplace.</p>
          <a href="${ctaUrl}" style="display: inline-block; background:#f97316; color:#fff; padding:16px 32px; border-radius:12px; text-decoration:none; font-weight: 900; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">
            Go to Your Dashboard →
          </a>
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
            <!-- Header -->
            <div style="background:#0A1A2F; padding:36px 30px; text-align:center; border-bottom:4px solid #1BC7C9;">
              <h1 style="color:#fff; font-size:30px; margin:0 0 4px; font-weight:900; letter-spacing:-1px;">Atlan<span style="color:#1BC7C9;">tis</span></h1>
              <p style="color:#B0BCCF; font-size:12px; margin:0; letter-spacing:2px; text-transform:uppercase;">B2B Marketplace</p>
            </div>

            <!-- Hero -->
            <div style="background:#fff; padding:36px 30px 0;">
              <div style="background:#E8FFF5; border:1.5px solid #10B981; border-radius:12px; padding:16px 20px; display:flex; align-items:center; margin-bottom:24px;">
                <span style="font-size:24px; margin-right:12px;">✅</span>
                <div>
                  <p style="margin:0; font-size:16px; font-weight:800; color:#065F46;">Payment Received & Order Confirmed</p>
                  <p style="margin:4px 0 0; font-size:13px; color:#065F46;">Order <strong>#${orderId.slice(0,8).toUpperCase()}</strong> — Invoice <strong>${invoiceNumber}</strong></p>
                </div>
              </div>
              <p style="color:#2E2E2E; font-size:15px; line-height:1.7; margin:0 0 24px;">Dear <strong>${name}</strong>, your order has been confirmed and payment processed. Below you will find your invoice and shipping details.</p>
            </div>

            <!-- Invoice Table -->
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

            <!-- Shipping Partner -->
            <div style="background:#fff; padding:0 30px 30px;">
              <div style="background:#F8F9FF; border:1.5px solid ${carrierColor}; border-radius:12px; padding:18px 20px;">
                <p style="margin:0 0 4px; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:1px; font-weight:700;">Logistics Partner</p>
                <p style="margin:0 0 8px; font-size:18px; font-weight:900; color:${carrierColor};">${shippingCompany}</p>
                <div style="display:flex; gap:20px; flex-wrap:wrap;">
                  <div>
                    <p style="margin:0; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:1px;">Estimated Delivery</p>
                    <p style="margin:4px 0 0; font-size:14px; font-weight:700; color:#0A1A2F;">${estimatedDays} business days</p>
                  </div>
                  <div>
                    <p style="margin:0; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:1px;">Destination</p>
                    <p style="margin:4px 0 0; font-size:14px; font-weight:700; color:#0A1A2F;">${destinationAddress}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- CTA -->
            <div style="background:#fff; padding:0 30px 36px; text-align:center;">
              <a href="${frontendUrl}/dashboard/customer" style="display:inline-block; padding:16px 48px; background:#1BC7C9; color:#fff; text-decoration:none; border-radius:12px; font-weight:800; font-size:14px; text-transform:uppercase; letter-spacing:1px;">Track Order →</a>
              <p style="margin:16px 0 0; font-size:12px; color:#667085;">Questions? Reply to this email or visit our support center.</p>
            </div>

            <!-- Footer -->
            <div style="background:#0A1A2F; padding:20px 30px; text-align:center;">
              <p style="color:#667085; font-size:11px; margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
              <p style="color:#4A5568; font-size:10px; margin:6px 0 0;">This is a transaction confirmation. Secure payment processed via Stripe.</p>
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
