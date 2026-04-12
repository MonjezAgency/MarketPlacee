import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';
import { CryptoService } from '../security/crypto.service';
import { TwoFaService } from './twofa.service';
import { Logger } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service';

interface AuthUser {
    id: string;
    email: string;
    role: string;
    onboardingCompleted: boolean;
    name?: string;
    avatar?: string;
    status?: string;
    companyName?: string;
    phone?: string;
    country?: string;
    emailVerified?: boolean;
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly REFRESH_TOKEN_TTL_DAYS = 7;

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private emailService: EmailService,
        private cryptoService: CryptoService,
        private twoFaService: TwoFaService,
    ) { }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }

    async findById(id: string) {
        return this.prisma.user.findUnique({ where: { id }, select: { twoFactorSecret: true, twoFactorEnabled: true } });
    }

    async updateAdmin(id: string, newPassword: string) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        return this.prisma.user.update({
            where: { id },
            data: { password: hashedPassword, status: 'ACTIVE', role: 'ADMIN', emailVerified: true },
        });
    }

    // ─── Account Lockout ─────────────────────────────────────────────────────
    private readonly MAX_FAILED_ATTEMPTS = 5;
    private readonly LOCKOUT_WINDOW_MS   = 15 * 60 * 1000; // 15 minutes

    private async recordLoginAttempt(email: string, success: boolean, ip?: string) {
        await this.prisma.loginAttempt.create({ data: { email, success, ip: ip ?? null } });
    }

    private async isAccountLocked(email: string): Promise<boolean> {
        const since = new Date(Date.now() - this.LOCKOUT_WINDOW_MS);
        const recentFailures = await this.prisma.loginAttempt.count({
            where: { email, success: false, createdAt: { gte: since } },
        });
        return recentFailures >= this.MAX_FAILED_ATTEMPTS;
    }

    async validateUser(email: string, pass: string, ip?: string): Promise<any> {
        // ── Account lockout check ─────────────────────────────────────────────
        if (await this.isAccountLocked(email)) {
            throw new UnauthorizedException(
                'تم تجاوز الحد المسموح من المحاولات. حاول مرة أخرى بعد 15 دقيقة.',
            );
        }

        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            // Record failed attempt even for non-existent accounts (prevent enumeration timing)
            await this.recordLoginAttempt(email, false, ip);
            return null;
        }

        // Check password
        if (await bcrypt.compare(pass, user.password)) {
            // Clear recent failed attempts on successful login
            await this.recordLoginAttempt(email, true, ip);

            // Check status
            if (user.status === 'PENDING_APPROVAL') {
                throw new UnauthorizedException('حسابك قيد المراجعة في انتظار موافقة الإدارة');
            }
            if (user.status === 'REJECTED' || user.status === 'BLOCKED') {
                throw new UnauthorizedException(`حسابك موقوف أو مرفوض: ${user.status}`);
            }
            // Strict scrubbing: NEVER expose passwords or billing data to the frontend
            const {
                password, iban, swiftCode, taxId, bankAddress, vatNumber,
                verificationToken, resetPasswordToken, resetPasswordExpires,
                ...safeResult
            } = user;

            return safeResult;
        }

        // Wrong password — record failure
        await this.recordLoginAttempt(email, false, ip);
        return null;
    }

    async register(data: any) {
        console.log(`[AUTH] Registration attempt for email: ${data.email}, role: ${data.role}`);
        
        const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            console.warn(`[AUTH] Registration failed: User ${data.email} already exists.`);
            throw new UnauthorizedException('User already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // If user is registering via invite link, we activate them immediately 
        // as requested by the user, bypassing the manual approval queue.
        const isInvited = !!data.inviteToken;
        const status = (isInvited || data.status === 'ACTIVE') ? 'ACTIVE' : (data.status || 'PENDING_APPROVAL');

        try {
            console.log(`[AUTH] Attempting database creation for ${data.email}`);
            const user = await this.prisma.user.create({
                data: {
                    email: data.email,
                    password: hashedPassword,
                    name: data.name,
                    phone: data.phone,
                    companyName: data.companyName,
                    website: data.website,
                    socialLinks: data.socialLinks,
                    vatNumber: data.vatNumber,
                    taxId: data.taxId ? this.cryptoService.encrypt(data.taxId) : null,
                    country: data.country,
                    bankAddress: data.bankAddress,
                    iban: data.iban ? this.cryptoService.encrypt(data.iban) : null,
                    swiftCode: data.swiftCode ? this.cryptoService.encrypt(data.swiftCode) : null,
                    role: data.role.toUpperCase(),
                    status,
                    verificationToken: isInvited ? null : verificationToken,
                    emailVerified: isInvited || data.status === 'ACTIVE'
                },
            });

            console.log(`[AUTH] User created successfully: ${user.id} (${user.email})`);

            if (user.status === 'PENDING_APPROVAL') {
                // Background email sending to prevent slow SMTP response from hanging the API
                (async () => {
                    try {
                        if (user.verificationToken) {
                            await this.emailService.sendVerificationEmail(user.email, user.verificationToken);
                        }
                        await this.emailService.sendRegistrationConfirmationEmail(user.email, user.name, data.locale);
                    } catch (emailError: any) {
                        console.error('[AUTH] Background email sending failed:', emailError.message);
                    }
                })();

                // Notify all admins about the new pending registration
                (async () => {
                    try {
                        await this.emailService.sendAdminSignupAlert({
                            name: user.name || 'N/A',
                            email: user.email,
                            role: data.role,
                            companyName: data.companyName,
                            registeredAt: user.createdAt || new Date(),
                        });
                        const admins = await this.prisma.user.findMany({
                            where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE' },
                            select: { id: true },
                        });
                        for (const admin of admins) {
                            await this.prisma.notification.create({
                                data: {
                                    userId: admin.id,
                                    title: 'New Registration Pending Approval',
                                    message: `${user.name} (${user.email}) has registered as ${data.role} and is awaiting your approval.`,
                                    type: 'NEW_REGISTRATION',
                                    data: { userId: user.id, email: user.email, role: data.role },
                                },
                            });
                        }
                    } catch (notifError: any) {
                        console.error('[AUTH] Failed to create admin notification:', notifError.message);
                    }
                })();
            } else if (user.status === 'ACTIVE') {
                 // Background email sending for active users
                 this.emailService.sendWelcomeEmail(user.email, user.name, user.role).catch((err: any) => {
                     console.error('[AUTH] Welcome email background error:', err.message);
                 });
            }

            // Strict scrubbing before returning the newly registered user
            const {
                password, iban, swiftCode, taxId, bankAddress, vatNumber,
                verificationToken: vt, resetPasswordToken, resetPasswordExpires,
                ...safeUser
            } = user;

            return { ...safeUser, isInvited };
        } catch (error) {
            console.error('[AUTH] Registration database error:', error);
            require('fs').appendFileSync('/tmp/auth_errors.log', `[${new Date().toISOString()}] Database error for ${data.email}: ${error.message}\n`);
            throw error;
        }
    }

    async verifyEmail(token: string) {
        const user = await this.prisma.user.findFirst({ where: { verificationToken: token } });
        if (!user) throw new UnauthorizedException('Invalid verification token');

        return this.prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true, verificationToken: null },
        });
    }

    async forgotPassword(email: string) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            console.log(`[AUTH] forgotPassword: no user found for email ${email} — silently ignoring`);
            return; // Don't reveal user existence
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 3600000); // 1 hour

        await this.prisma.user.update({
            where: { id: user.id },
            data: { resetPasswordToken: resetToken, resetPasswordExpires: resetExpires },
        });

        console.log(`[AUTH] forgotPassword: token generated for ${email}, sending reset email (background)...`);
        
        // Background email sending
        this.emailService.sendPasswordResetEmail(user.email, resetToken).catch((err: any) => {
            console.error(`[AUTH] forgotPassword: background error for ${email}:`, err.message);
        });
    }

    async resetPassword(token: string, newPass: string) {
        const user = await this.prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: { gt: new Date() },
            },
        });

        if (!user) throw new UnauthorizedException('Invalid or expired reset token');

        const hashedPassword = await bcrypt.hash(newPass, 10);
        const isTeamRole = ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR'].includes(user.role);
        return this.prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null,
                ...(isTeamRole ? { status: 'ACTIVE', emailVerified: true } : {}),
            },
        });
    }

    // ─── Refresh Token Rotation ───────────────────────────────────────────────

    private hashToken(rawToken: string): string {
        return crypto.createHash('sha256').update(rawToken).digest('hex');
    }

    private async issueRefreshToken(userId: string): Promise<string> {
        const rawToken = crypto.randomBytes(40).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

        await this.prisma.refreshToken.create({ data: { tokenHash, userId, expiresAt } });
        return rawToken;
    }

    private async generateTokens(user: AuthUser) {
        const payload = { 
            sub: user.id, 
            email: user.email, 
            role: user.role,
            onboardingCompleted: !!user.onboardingCompleted 
        };
        
        return {
            access_token: await this.jwtService.signAsync(payload),
            refresh_token: await this.issueRefreshToken(user.id),
        };
    }

    async refreshTokens(rawRefreshToken: string) {
        const tokenHash = this.hashToken(rawRefreshToken);

        const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
        if (!stored) throw new UnauthorizedException('Refresh token invalid or already used');
        if (stored.expiresAt < new Date()) {
            await this.prisma.refreshToken.delete({ where: { tokenHash } });
            throw new UnauthorizedException('Refresh token expired');
        }

        // Rotate — delete old token immediately (single-use)
        await this.prisma.refreshToken.delete({ where: { tokenHash } });

        const user = await this.prisma.user.findUnique({
            where: { id: stored.userId },
            select: { id: true, email: true, role: true, status: true, name: true, onboardingCompleted: true,
                      avatar: true, companyName: true, phone: true, country: true, emailVerified: true },
        });
        if (!user || user.status === 'BLOCKED' || user.status === 'REJECTED') {
            throw new UnauthorizedException('Account is not active');
        }

        const tokens = await this.generateTokens(user as AuthUser);
        return { ...tokens, user };
    }

    async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
        const tokenHash = this.hashToken(rawRefreshToken);
        await this.prisma.refreshToken.deleteMany({ where: { tokenHash } }).catch(() => {});
    }

    async revokeAllRefreshTokens(userId: string): Promise<void> {
        await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
    }

    async login(user: any) {
        const tokens = await this.generateTokens(user);
        return {
            ...tokens,
            user,
        };
    }

    async loginStep1(user: any) {
        const record = await this.prisma.user.findUnique({
            where: { id: user.id },
            select: { twoFactorEnabled: true },
        });

        if (record?.twoFactorEnabled) {
            const partialToken = this.jwtService.sign(
                { sub: user.id, email: user.email, role: user.role, onboardingCompleted: !!user.onboardingCompleted, twoFactorPending: true },
                { expiresIn: '5m' },
            );
            return { requiresTwoFactor: true, partialToken };
        }

        return this.login(user);
    }

    async loginVerify2FA(partialToken: string, code: string) {
        let payload: any;
        try {
            payload = this.jwtService.verify(partialToken);
        } catch {
            throw new UnauthorizedException('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى');
        }

        if (!payload.twoFactorPending) {
            throw new UnauthorizedException('رمز غير صالح');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true, email: true, role: true, name: true, status: true, onboardingCompleted: true,
                avatar: true, companyName: true, phone: true, country: true,
                twoFactorEnabled: true, twoFactorSecret: true,
            },
        });

        if (!user?.twoFactorEnabled || !user?.twoFactorSecret) {
            throw new UnauthorizedException('لم يتم تفعيل التحقق بخطوتين');
        }

        const isValid = await this.twoFaService.verifyTotpToken(user.twoFactorSecret, code);
        if (!isValid) {
            throw new UnauthorizedException('رمز التحقق غير صحيح');
        }

        const { twoFactorSecret, twoFactorEnabled, ...safeUser } = user;
        return this.login(safeUser);
    }

    async googleLogin(data: { email: string; name: string; avatar?: string; googleId?: string }) {
        let user = await this.prisma.user.findUnique({ where: { email: data.email } });

        if (!user) {
            // New user via Google — create with PENDING_APPROVAL (B2B platform requires admin review)
            const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
            user = await this.prisma.user.create({
                data: {
                    email: data.email,
                    name: data.name,
                    password: randomPassword,
                    avatar: data.avatar,
                    role: 'CUSTOMER',
                    status: 'PENDING_APPROVAL',
                    emailVerified: true, // Google verified the email
                },
            });

            // Non-blocking: Send registration email and notify admins
            this.emailService.sendRegistrationConfirmationEmail(user.email, user.name, 'en').catch((err) => {
                console.error('[AUTH] Google registration email failed:', err.message);
            });

            // Notify admins about new Google registration
            const googleUser = user;
            (async () => {
                try {
                    await this.emailService.sendAdminSignupAlert({
                        name: googleUser.name || 'N/A',
                        email: googleUser.email,
                        role: 'CUSTOMER',
                        registeredAt: googleUser.createdAt || new Date(),
                    });
                    const admins = await this.prisma.user.findMany({
                        where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE' },
                        select: { id: true },
                    });
                    for (const admin of admins) {
                        await this.prisma.notification.create({
                            data: {
                                userId: admin.id,
                                title: 'New Google Registration Pending',
                                message: `${googleUser.name} (${googleUser.email}) signed up via Google and needs approval.`,
                                type: 'GOOGLE_REGISTRATION',
                                data: { userId: googleUser.id, email: googleUser.email, role: 'CUSTOMER', provider: 'google' },
                            },
                        });
                    }
                } catch (err: any) {
                    console.error('[AUTH] Google reg admin notification failed:', err.message);
                }
            })();

            return { pendingApproval: true, email: user.email, needsCompanyDetails: true };
        }

        if (user.status === 'BLOCKED' || user.status === 'REJECTED') {
            throw new UnauthorizedException(`Your account has been ${user.status.toLowerCase()}`);
        }

        if (user.status === 'PENDING_APPROVAL') {
            throw new UnauthorizedException('Your account is pending admin approval');
        }

        const {
            password, iban, swiftCode, taxId, bankAddress, vatNumber,
            verificationToken, resetPasswordToken, resetPasswordExpires,
            ...safeUser
        } = user;

        return this.login(safeUser);
    }

    async completeOnboarding(userId: string) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: { onboardingCompleted: true }
        });
        
        return this.generateTokens(user as AuthUser);
    }

    async getUserProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                role: true,
                name: true,
                status: true,
                onboardingCompleted: true,
                avatar: true,
                companyName: true,
                phone: true,
                country: true,
                emailVerified: true,
            },
        });
        if (!user) throw new UnauthorizedException('User not found');
        return user;
    }
}
