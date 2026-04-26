import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';
import { CryptoService } from '../security/crypto.service';
import { TwoFaService } from './twofa.service';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';

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
        private notificationsService: NotificationsService,
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
        const startTime = Date.now();
        this.logger.log(`[AUTH] Validating user: ${email} from IP: ${ip}`);

        // ── Run lockout check and user fetch in parallel to save ~500ms ────────
        const [locked, user] = await Promise.all([
            this.isAccountLocked(email),
            this.prisma.user.findUnique({ where: { email } }),
        ]);
        this.logger.debug(`[AUTH] Parallel lockout+fetch took: ${Date.now() - startTime}ms`);

        if (locked) {
            this.logger.warn(`[AUTH] Account locked for email: ${email}`);
            throw new UnauthorizedException(
                'تم تجاوز الحد المسموح من المحاولات. حاول مرة أخرى بعد 15 دقيقة.',
            );
        }

        if (!user) {
            this.logger.warn(`[AUTH_STEP] User not found: ${email}`);
            // Record failed attempt even for non-existent accounts (prevent enumeration timing)
            await this.recordLoginAttempt(email, false, ip);
            return null;
        }

        // Check password
        this.logger.debug(`[AUTH_STEP] Password verification starting for: ${email}`);
        const bcryptStart = Date.now();
        const isMatch = await bcrypt.compare(pass, user.password);
        this.logger.debug(`[AUTH_STEP] Password verification result: ${isMatch}`);
        this.logger.debug(`[AUTH] Bcrypt compare took: ${Date.now() - bcryptStart}ms`);
        
        if (isMatch) {
            // Clear recent failed attempts on successful login
            this.logger.debug(`[AUTH_STEP] Recording successful login attempt for: ${email}`);
            await this.recordLoginAttempt(email, true, ip);

            // Check status
            if (user.status === 'PENDING_APPROVAL') {
                this.logger.warn(`[AUTH] Login blocked: User ${email} pending approval`);
                throw new UnauthorizedException('حسابك قيد المراجعة في انتظار موافقة الإدارة');
            }
            if (user.status === 'REJECTED' || user.status === 'BLOCKED' || user.status === 'DELETED') {
                this.logger.warn(`[AUTH] Login blocked: User ${email} status is ${user.status}`);
                throw new UnauthorizedException(`حسابك موقوف أو مرفوض أو محذوف: ${user.status}`);
            }

            this.logger.log(`[AUTH] User ${email} validated successfully in ${Date.now() - startTime}ms`);
            
            // Strict scrubbing: NEVER expose passwords or billing data to the frontend
            const {
                password, iban, swiftCode, taxId, bankAddress, vatNumber,
                verificationToken, resetPasswordToken, resetPasswordExpires,
                ...safeResult
            } = user;

            return safeResult;
        }

        // Wrong password — record failure (non-blocking)
        this.recordLoginAttempt(email, false, ip).catch(err => 
            this.logger.error(`[AUTH] Failed to record login attempt: ${err.message}`)
        );
        return null;
    }

    async register(data: any) {
        this.logger.log(`[AUTH] Registration attempt for email: ${data.email}, role: ${data.role}`);
        
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
            this.logger.log(`[AUTH] Attempting database creation for ${data.email}`);
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
                    emailVerified: isInvited || data.status === 'ACTIVE',
                    onboardingCompleted: true, // Email signup collects all business data in the form
                },
            });

            this.logger.log(`[AUTH] User created successfully: ${user.id} (${user.email})`);

            (async () => {
                try {
                    this.logger.log(`[AUTH] Background tasks started for ${user.email}`);

                    // 1. Send Verification Email (if needed)
                    if (user.verificationToken) {
                        await this.emailService.sendVerificationEmail(user.email, user.verificationToken);
                        this.logger.log(`[AUTH] Verification email sent to ${user.email}`);
                    }

                    // 2. Send Registration Confirmation Email
                    await this.emailService.sendRegistrationConfirmationEmail(user.email, user.name, data.locale);
                    this.logger.log(`[AUTH] Registration confirmation email sent to ${user.email}`);

                    if (user.status === 'PENDING_APPROVAL') {
                        // 3. Send Admin Alert Email
                        await this.emailService.sendAdminSignupAlert({
                            name: user.name || 'N/A',
                            email: user.email,
                            role: data.role,
                            companyName: data.companyName,
                            registeredAt: user.createdAt || new Date(),
                        });
                        this.logger.log(`[AUTH] Admin signup alert email sent for ${user.email}`);

                        // 4. Create In-App Notifications for Admins
                        await this.notificationsService.notifyAdmins(
                            'New Registration Pending Approval',
                            `${user.name} (${user.companyName}) has registered as a ${data.role} and is waiting for approval.`,
                            'INFO',
                            { userId: user.id }
                        ).catch(() => {});
                        this.logger.log(`[AUTH] In-app notifications created for admins regarding ${user.email}`);
                    } else if (isInvited) {
                        // For invited users, send welcome email immediately since they bypass approval
                        await this.emailService.sendWelcomeEmail(user.email, user.name, user.role);
                        this.logger.log(`[AUTH] Welcome email sent to invited user ${user.email}`);
                    }
                } catch (error: any) {
                    this.logger.error(`[AUTH] Background tasks failed for ${user.email}: ${error.message}`);
                    console.error('[AUTH] Task Error Stack:', error.stack);
                }
            })();

            if (user.status === 'ACTIVE') {
                 // Background email sending for active users
                 this.emailService.sendWelcomeEmail(user.email, user.name, user.role).catch((err: any) => {
                     this.logger.error('[AUTH] Welcome email background error:', err.message);
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
            this.logger.error('[AUTH] Registration database error:', error);
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
        if (!user || user.status === 'BLOCKED' || user.status === 'REJECTED' || user.status === 'DELETED') {
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
        } catch (_e) {
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
                    onboardingCompleted: false, // Must finish details flow
                },
            });

            // Non-blocking: Send registration email and notify admins
            this.emailService.sendRegistrationConfirmationEmail(user.email, user.name, 'en').catch((err) => {
                this.logger.error('[AUTH] Google registration email failed:', err.message);
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
                    // Notify admins about new Google registration
                    await this.notificationsService.notifyAdmins(
                        'New Google Registration Pending',
                        `${googleUser.name} (${googleUser.email}) signed up via Google and needs approval.`,
                        'INFO',
                        { userId: googleUser.id, email: googleUser.email, role: 'CUSTOMER', provider: 'google' }
                    ).catch(() => {});
                } catch (err: any) {
                    this.logger.error('[AUTH] Google reg admin notification failed:', err.message);
                }
            })();

            return { pendingApproval: true, email: user.email, needsCompanyDetails: true };
        }

        if (user.status === 'BLOCKED' || user.status === 'REJECTED' || user.status === 'DELETED') {
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

    async forgotPassword(email: string) {
        const user = await this.prisma.user.findUnique({ where: { email } });

        // Security: Always return success for non-existent users to prevent enumeration
        if (!user) {
            this.logger.debug(`[FORGOT_PASSWORD] Attempt for non-existent email: ${email}`);
            return { success: true, message: 'If that email exists, a reset link was sent.' };
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour expiry

        await this.prisma.user.update({
            where: { email },
            data: {
                resetPasswordToken: token,
                resetPasswordExpires: expires,
            },
        });

        // We await the email result to ensure we know if it was at least queued/sent successfully
        // but we still return a generic success message to the client for security.
        try {
            const sent = await this.emailService.sendPasswordResetEmail(user.email, user.name, token);
            if (sent) {
                this.logger.log(`[FORGOT_PASSWORD] Reset email sent to ${user.email}`);
            } else {
                this.logger.error(`[FORGOT_PASSWORD] Email reported failure for ${user.email}`);
            }
        } catch (err: any) {
            this.logger.error(`[FORGOT_PASSWORD] Fatal error delivering to ${user.email}: ${err.message}`);
        }

        return { success: true, message: 'If that email exists, a reset link was sent.' };
    }

    async resetPassword(token: string, newPassword: string) {
        const user = await this.prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: { gt: new Date() }, // Token must not be expired
            },
        });

        if (!user) {
            throw new BadRequestException('Invalid or expired reset token.');
        }

        // Validate new password strength on backend too
        const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/.test(newPassword);
        if (!isStrong) {
            throw new BadRequestException('Password does not meet security requirements.');
        }

        const hashed = await bcrypt.hash(newPassword, 12);

        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashed,
                resetPasswordToken: null,
                resetPasswordExpires: null,
            },
        });

        return { success: true, message: 'Password reset successfully. You can now log in.' };
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

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new UnauthorizedException('User not found');

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) throw new BadRequestException('كلمة المرور الحالية غير صحيحة');

        const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/.test(newPassword);
        if (!isStrong) {
            throw new BadRequestException('كلمة المرور الجديدة ضعيفة. يجب أن تحتوي على 8 أحرف على الأقل، حرف كبير، حرف صغير، رقم، ورمز خاص.');
        }

        const hashed = await bcrypt.hash(newPassword, 12);
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashed },
        });

        return { success: true, message: 'تم تغيير كلمة المرور بنجاح' };
    }
}
