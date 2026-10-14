import { Injectable, ForbiddenException } from '@nestjs/common';
import { verify } from 'otplib';
import { PrismaService } from '../common/prisma.service';
import { hashSecret, sameHash } from './verification';

export type StepUpCodes = { totp?: string | null; email?: string | null };
export const stepUpCodesFrom = (req: any): StepUpCodes => ({
    totp: req?.headers?.['x-2fa-code'] ? String(req.headers['x-2fa-code']).trim() : null,
    email: req?.headers?.['x-email-code'] ? String(req.headers['x-email-code']).trim() : null,
});

/**
 * Re-confirmation for sensitive actions on accounts with two-step verification:
 * the authenticator code (or a one-time backup code) and, for money actions,
 * an email code. Accounts without 2FA are not affected.
 */
@Injectable()
export class StepUpService {
    constructor(private prisma: PrismaService) {}

    async require(userId: string, codes: StepUpCodes, opts: { email?: boolean; action: string }) {
        const u: any = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true, emailOtpCode: true, emailOtpExpiry: true } as any });
        if (!u?.twoFactorEnabled || !u.twoFactorSecret) return;
        const required = opts.email ? ['totp', 'email'] : ['totp'];
        const fail = (message: string) => { throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', required, action: opts.action, message }); };

        const t = String(codes.totp || '').replace(/\s+/g, '').toUpperCase();
        if (!t) fail(`Confirm ${opts.action} with your authenticator code${opts.email ? ' and the code we email you' : ''}.`);
        let ok = /^\d{6}$/.test(t) && (await verify({ token: t, secret: u.twoFactorSecret })).valid;
        if (!ok) {
            // One-time backup code (stored hashed); consumed on use.
            const list: string[] = u.twoFactorBackupCodes || [];
            const hit = list.find((h) => sameHash(t, h));
            if (hit) {
                ok = true;
                await this.prisma.user.update({ where: { id: userId }, data: { twoFactorBackupCodes: list.filter((h) => h !== hit) } as any });
            }
        }
        if (!ok) fail('That authenticator code isn’t right.');

        if (opts.email) {
            const e = String(codes.email || '').trim();
            if (!e) fail('Enter the code we emailed you.');
            if (!u.emailOtpCode || !u.emailOtpExpiry || new Date(u.emailOtpExpiry) < new Date() || !sameHash(e, u.emailOtpCode)) fail('That email code isn’t valid or has expired.');
            await this.prisma.user.update({ where: { id: userId }, data: { emailOtpCode: null, emailOtpExpiry: null } });
        }
    }
}
export { hashSecret };
