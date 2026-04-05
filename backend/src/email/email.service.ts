import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { getInvitationEmailHtml } from './email-templates';

@Injectable()
export class EmailService {
  private transporter;
  private readonly fromName = 'Atlantis Marketplace';

  constructor() {
    // Explicit configuration for Hostinger based on user provided settings
    const host = process.env.EMAIL_HOST || 'smtp.hostinger.com';
    const port = Number(process.env.EMAIL_PORT) || 465;
    const user = process.env.EMAIL_USER || 'Info@atlantisfmcg.com';
    const pass = process.env.EMAIL_PASS || 'AliDawara@22';

    // Port 465 REQUIRES secure: true. Port 587 REQUIRES secure: false.
    const secure = port === 465;

    console.log(`[SMTP] Initializing for Hostinger: ${host}:${port} (Secure: ${secure})`);

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      pool: true, // Use pooling for better performance with Hostinger
      maxConnections: 5,
      maxMessages: 100,
      auth: { user, pass },
      tls: {
        // Essential for Hostinger's SSL certificates compatibility
        rejectUnauthorized: false
      },
      // Increased timeouts for Hostinger shared hosting reliability
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
    } as any);

    // Immediate sanity check
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ SMTP CONNECTION FAILED:', error.message);
        console.error('Check if your Hosting firewall blocks outgoing port 465.');
      } else {
        console.log('✅ SMTP CONNECTION ESTABLISHED - Ready to send emails');
      }
    });
  }

  private getFrom() {
    const user = process.env.EMAIL_USER || 'Info@atlantisfmcg.com';
    return user;
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `${process.env.FRONTEND_URL}/auth/verify-email?token=${token}`;
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: 'Verify your email - Atlantis Marketplace',
        html: `
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
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendVerificationEmail]:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, token: string) {
    const url = `${process.env.FRONTEND_URL}/auth/reset-password?token=${token}`;
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: 'Reset your password - Atlantis Marketplace',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
            <div style="background: #0A1A2F; padding: 40px 30px; text-align: center;">
              <h1 style="color: #FFFFFF; font-size: 28px; margin: 0 0 8px; font-weight: 900;">Atlan<span style="color: #1BC7C9;">tis</span></h1>
              <p style="color: #B0BCCF; font-size: 14px; margin: 0;">Enterprise B2B Distribution</p>
            </div>
            <div style="padding: 40px 30px; background: #FFFFFF;">
              <h2 style="color: #0A1A2F; font-size: 22px; margin: 0 0 16px;">Password Reset Request 🔐</h2>
              <p style="color: #2E2E2E; font-size: 15px; line-height: 1.7; margin: 0 0 24px;">You requested to reset your password. Click the button below to proceed.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${url}" style="display: inline-block; padding: 16px 40px; background: #1BC7C9; color: #FFFFFF; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Reset Password →</a>
              </div>
              <p style="margin-top: 20px; font-size: 12px; color: #667085; text-align: center;">This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
            </div>
            <div style="background: #0A1A2F; padding: 20px; text-align: center;">
              <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
            </div>
          </div>
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendPasswordResetEmail]:', error);
      throw error;
    }
  }

  async sendTeamInvitation(email: string, name: string, role: string, tempPassword?: string) {
    const url = `${process.env.FRONTEND_URL}/auth/login`;
    const credentialsBlock = tempPassword ? `
            <div style="background: #F2F4F7; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #1BC7C9;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #667085; font-weight: 600;">Your login credentials:</p>
              <p style="margin: 0; font-size: 14px; color: #2E2E2E;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 0; font-size: 14px; color: #2E2E2E;"><strong>Password:</strong> ${tempPassword}</p>
              <p style="margin: 10px 0 0 0; font-size: 11px; color: #667085;">Please change your password after first login.</p>
            </div>` : '';
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: 'You have been invited to the Atlantis Team',
        html: `
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
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendTeamInvitation]:', error);
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

    try {
      const info = await this.transporter.sendMail({
        from: this.getFrom(),
        to: params.recipientEmail,
        subject: `🎉 You're Invited to Join Atlantis as a ${params.role === 'supplier' ? 'Supplier Partner' : 'Strategic Buyer'}`,
        html,
      });

      return { messageId: info.messageId, previewUrl: nodemailer.getTestMessageUrl(info) };
    } catch (error) {
      console.error('SMTP ERROR [sendInviteEmail]:', error);
      throw error;
    }
  }

  async sendOrderConfirmationEmail(email: string, name: string, orderId: string, total: number) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: `✅ Order Confirmed #${orderId.slice(0, 8).toUpperCase()} — Atlantis`,
        html: `
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
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendOrderConfirmationEmail]:', error);
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
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: `${info.title} — Order #${orderId.slice(0, 8).toUpperCase()}`,
        html: `
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
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendOrderStatusUpdateEmail]:', error);
    }
  }

  async sendKycStatusEmail(email: string, name: string, status: 'VERIFIED' | 'REJECTED' | 'PENDING', adminNotes?: string) {
    if (status === 'PENDING') {
      try {
        await this.transporter.sendMail({
          from: this.getFrom(),
          to: email,
          subject: '⏳ KYC Submitted — Under Review',
          html: `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#F2F4F7;border-radius:16px;overflow:hidden;"><div style="background:#0A1A2F;padding:40px 30px;text-align:center;border-bottom:4px solid #F59E0B;"><h1 style="color:#fff;font-size:28px;margin:0;font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1></div><div style="padding:40px 30px;background:#fff;"><h2 style="color:#F59E0B;font-size:22px;margin:0 0 16px;">KYC Documents Received ⏳</h2><p style="color:#2E2E2E;font-size:15px;line-height:1.7;">Hello <strong>${name}</strong>,</p><p style="color:#2E2E2E;font-size:15px;line-height:1.7;">Your identity documents have been submitted and are under review. We'll notify you once complete — usually within 24 hours.</p></div><div style="background:#0A1A2F;padding:20px;text-align:center;"><p style="color:#667085;font-size:11px;margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p></div></div>`,
        });
      } catch (err) {
        console.error('SMTP ERROR [sendKycStatusEmail PENDING]:', err);
      }
      return;
    }
    const isApproved = status === 'VERIFIED';
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: isApproved ? '✅ KYC Verified — Atlantis' : '❌ KYC Review Required — Atlantis',
        html: `
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
            <div style="background:#0A1A2F; padding:20px; text-align:center;">
              <p style="color:#667085; font-size:11px; margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p>
            </div>
          </div>
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendKycStatusEmail]:', error);
    }
  }

  /**
   * Send a branded welcome email to a newly activated user
   */
  async sendWelcomeEmail(email: string, name: string, role: string) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const dashboardUrl = role === 'SUPPLIER'
      ? `${frontendUrl}/dashboard/supplier`
      : `${frontendUrl}/`;
    
    const roleNameEn = role === 'SUPPLIER' ? 'Supplier Partner' : 'Strategic Buyer';
    const roleNameAr = role === 'SUPPLIER' ? 'مورد معتمد' : 'مشتري استراتيجي';

    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: `🎉 تهانينا! تم تفعيل حسابك - Welcome to Atlantis, ${name || 'Partner'}!`,
        html: `
          <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
            <div style="background: #0A1A2F; padding: 50px 40px; text-align: center;">
               <div style="font-size: 60px; margin-bottom: 20px;">✨</div>
               <h1 style="color: white; font-size: 32px; margin: 0 0 10px; font-weight: 900; letter-spacing: -1px;">تم تفعيل الحساب بنجاح!</h1>
               <p style="color: #1BC7C9; font-size: 18px; margin: 0; font-weight: 600;">Your Account is Now Fully Active</p>
            </div>
            
            <div style="padding: 50px 40px; background: #FFFFFF; text-align: right;">
              <p style="font-size: 20px; line-height: 1.6; color: #2E2E2E; margin-bottom: 25px;">مرحباً <strong style="color: #1BC7C9;">${name || 'شريكنا العزيز'}</strong>،</p>
              <p style="font-size: 16px; line-height: 1.8; color: #667085;">نود إعلامك بأنه قد تمت الموافقة على طلب انضمامك إلى منصة <strong>Atlantis</strong> كـ <strong style="color: #0A1A2F;">${roleNameAr}</strong>. حسابك الآن مفعل بالكامل وجاهز للاستخدام.</p>
              
              <div style="background: #F2F4F7; border-radius: 16px; padding: 30px; margin: 40px 0; border: 1px solid #E5E7EB; text-align: center;">
                <p style="font-size: 12px; color: #667085; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">الوصول السريع للوحة التحكم</p>
                <a href="${dashboardUrl}" style="display: inline-block; padding: 18px 50px; background: #1BC7C9; color: #FFFFFF; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">
                  ${role === 'SUPPLIER' ? 'دخول لوحة تحكم المورد ←' : 'دخول الماركت بليس ←'}
                </a>
              </div>
              
              <p style="font-size: 14px; color: #667085; text-align: center; line-height: 1.6;">
                يمكنك الآن إضافة منتجاتك، متابعة طلباتك، والاستفادة من كافة مميزات المنصة.<br/>
                نحن متحمسون للعمل معك!
              </p>
            </div>

            <div style="background: #0A1A2F; padding: 25px; text-align: center;">
              <p style="color: #FFFFFF; font-size: 16px; font-weight: 900; margin: 0 0 4px;">Atlan<span style="color: #1BC7C9;">tis</span></p>
              <p style="color: #667085; font-size: 11px; margin: 0;">© 2026 ATLANTIS FMCG MARKETPLACE. ALL RIGHTS RESERVED.</p>
            </div>
          </div>
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendWelcomeEmail]:', error);
      throw error;
    }
  }

  async sendInvoiceEmail(email: string, name: string, invoiceNumber: string, orderId: string, totalAmount: number, dueDate: Date) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: `🧾 Invoice ${invoiceNumber} — Atlantis Marketplace`,
        html: `
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
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendInvoiceEmail]:', error);
    }
  }

  async sendEmailOtp(email: string, name: string, code: string) {
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject: `🔐 Your Atlantis Verification Code: ${code}`,
        html: `<div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#F2F4F7;border-radius:16px;overflow:hidden;"><div style="background:#0A1A2F;padding:40px 30px;text-align:center;border-bottom:4px solid #FF9900;"><h1 style="color:#fff;font-size:28px;margin:0;font-weight:900;">Atlan<span style="color:#1BC7C9;">tis</span></h1></div><div style="padding:40px 30px;background:#fff;"><h2 style="color:#0A1A2F;font-size:22px;margin:0 0 16px;">Verification Code 🔐</h2><p style="color:#2E2E2E;font-size:15px;">Hello <strong>${name}</strong>,</p><p style="color:#2E2E2E;font-size:15px;">Your one-time verification code is:</p><div style="background:#F2F4F7;border-radius:12px;padding:24px;text-align:center;margin:24px 0;"><span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#0A1A2F;font-family:monospace;">${code}</span></div><p style="color:#667085;font-size:13px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p></div><div style="background:#0A1A2F;padding:20px;text-align:center;"><p style="color:#667085;font-size:11px;margin:0;">© 2026 Atlantis Marketplace. All rights reserved.</p></div></div>`,
      });
    } catch (err) {
      console.error('SMTP ERROR [sendEmailOtp]:', err);
    }
  }

  /**
   * Send a registration confirmation email to a new user
   */
  async sendRegistrationConfirmationEmail(email: string, name: string, locale: string = 'en') {
    const isAr = locale === 'ar';
    const subject = isAr ? 'تم استلام طلب التسجيل - Atlantis Marketplace Onboarding' : 'Registration Received - Atlantis Marketplace Onboarding';
    
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to: email,
        subject,
        html: `
          <div dir="${isAr ? 'rtl' : 'ltr'}" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #F2F4F7; border-radius: 16px; overflow: hidden;">
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
        `,
      });
    } catch (error) {
      console.error('SMTP ERROR [sendRegistrationConfirmationEmail]:', error);
      throw error;
    }
  }

  /** Generic raw email — used by ReportsService and other internal senders */
  async sendRawEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.getFrom(),
        to,
        subject,
        html,
      });
    } catch (error) {
      console.error(`SMTP ERROR [sendRawEmail → ${to}]:`, error);
      // Don't throw — report emails are non-critical
    }
  }
}
