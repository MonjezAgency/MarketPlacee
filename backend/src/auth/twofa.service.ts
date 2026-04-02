import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { generateSecret, generate, verify, generateURI } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import * as crypto from 'crypto';

@Injectable()
export class TwoFaService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  // ── TOTP (Google Authenticator) ──

  async generateTotpSetup(userId: string): Promise<{ secret: string; qrCodeUrl: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw new BadRequestException('User not found');

    const secret = generateSecret();
    const otpauthUrl = generateURI({ label: user.email, issuer: 'Atlantis Marketplace', secret });
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    // Store secret temporarily (not yet enabled — user must verify first)
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });

    return { secret, qrCodeUrl, otpauthUrl };
  }

  async verifyAndEnableTotp(userId: string, token: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });
    if (!user?.twoFactorSecret) throw new BadRequestException('TOTP setup not initiated');

    const result = await verify({ token, secret: user.twoFactorSecret });
    if (!result.valid) throw new UnauthorizedException('Invalid verification code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    // Return dummy backup codes (in production, generate & store encrypted)
    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    return { backupCodes };
  }

  async disableTotp(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorEnabled) throw new BadRequestException('2FA is not enabled');

    const result = await verify({ token, secret: user.twoFactorSecret! });
    if (!result.valid) throw new UnauthorizedException('Invalid verification code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
  }

  async verifyTotpToken(secret: string, token: string): Promise<boolean> {
    const result = await verify({ token, secret });
    return result.valid;
  }

  // ── Email OTP ──

  async sendEmailOtp(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) throw new BadRequestException('User not found');

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailOtpCode: code, emailOtpExpiry: expiry },
    });

    await this.emailService.sendEmailOtp(user.email, user.name || 'Partner', code);
  }

  async verifyEmailOtp(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailOtpCode: true, emailOtpExpiry: true },
    });

    if (!user?.emailOtpCode || !user?.emailOtpExpiry) return false;
    if (user.emailOtpExpiry < new Date()) return false;
    if (user.emailOtpCode !== code.trim()) return false;

    // Invalidate the code after use
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailOtpCode: null, emailOtpExpiry: null },
    });

    return true;
  }

  // ── Status ──

  async get2faStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    return { twoFactorEnabled: user?.twoFactorEnabled ?? false };
  }
}
