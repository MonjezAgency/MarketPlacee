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
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { newCode, hashSecret, checkCode, cooldownLeft, publicRole, normEmail, EMAIL_RE, STRONG_PASSWORD_RE, CODE_TTL_MS, MAX_ATTEMPTS } from './verification';

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
        const trimmedEmail = (email || '').trim().toLowerCase();
        const trimmedPass = (pass || '').trim();
        const startTime = Date.now();
        this.logger.log(`[AUTH] Validating user: ${trimmedEmail} from IP: ${ip}`);

        // ── Run lockout check and user fetch in parallel to save ~500ms ────────
        const [locked, user] = await Promise.all([
            this.isAccountLocked(trimmedEmail),
            this.prisma.user.findFirst({
                where: { email: { equals: trimmedEmail, mode: 'insensitive' } }
            }),
        ]);
        this.logger.debug(`[AUTH] Parallel lockout+fetch took: ${Date.now() - startTime}ms`);

        // Exempt platform staff from the brute-force lockout. They lose the
        // platform when they're locked out (admins are the people who'd
        // unlock other accounts) so the cost of a lockout-bypass attack
        // is dwarfed by the cost of a locked-out OWNER. Customers and
        // suppliers still get the standard lockout.
        const isStaffRole = !!user && ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'DEVELOPER', 'LOGISTICS', 'EDITOR']
            .includes(String(user.role).toUpperCase());

        if (locked && !isStaffRole) {
            this.logger.warn(`[AUTH] Account locked for email: ${trimmedEmail}`);
            throw new UnauthorizedException(
                'Too many failed attempts. Try again in 15 minutes — or use "Forgot password?". تم تجاوز الحد المسموح من المحاولات. حاول مرة أخرى بعد 15 دقيقة.',
            );
        }

        if (!user) {
            this.logger.warn(`[AUTH_STEP] User not found: ${trimmedEmail}`);
            // Record failed attempt even for non-existent accounts (prevent enumeration timing)
            await this.recordLoginAttempt(trimmedEmail, false, ip);
            return null;
        }

        // Check password
        this.logger.debug(`[AUTH_STEP] Password verification starting for: ${trimmedEmail}`);
        const bcryptStart = Date.now();
        const isMatch = await bcrypt.compare(trimmedPass, user.password);
        this.logger.debug(`[AUTH_STEP] Password verification result: ${isMatch}`);
        this.logger.debug(`[AUTH] Bcrypt compare took: ${Date.now() - bcryptStart}ms`);

        if (isMatch) {
            // Successful login — wipe ALL prior failed attempts for this
            // email so a single fat-finger session a week ago doesn't
            // accumulate and trigger lockout the next time the user has
            // a typo. Use the trimmed lowercased email for the delete
            // (matches how isAccountLocked counts) so case-variant
            // records are also cleared.
            this.logger.debug(`[AUTH_STEP] Recording successful login attempt for: ${trimmedEmail}`);
            await this.recordLoginAttempt(trimmedEmail, true, ip);
            try {
                await this.prisma.loginAttempt.deleteMany({
                    where: { email: trimmedEmail, success: false },
                });
            } catch {}

            // Status checks. We surface a CLEAR, distinct message per state
            // (bilingual EN/AR) so the user sees "your account is awaiting
            // approval" instead of the generic "invalid email or password"
            // and knows the credentials were correct.
            if (user.status === 'PENDING_APPROVAL') {
                this.logger.warn(`[AUTH] Login blocked: User ${email} pending approval`);
                throw new UnauthorizedException(
                    'Your account is awaiting approval from the Atlantis team — usually within 24 hours. You will receive an email with a link as soon as it goes through. حسابك قيد المراجعة من فريق Atlantis — عادةً خلال 24 ساعة. سيصلك إيميل بمجرد الموافقة.',
                );
            }
            if ((user.status as any) === 'REJECTED') {
                throw new UnauthorizedException('Your account application was rejected. Contact Info@atlantisfmcg.com if you believe this is a mistake. تم رفض طلب الحساب — تواصل معنا إذا كان ذلك بالخطأ.');
            }
            if ((user.status as any) === 'BLOCKED') {
                throw new UnauthorizedException('Your account is currently blocked. Contact Info@atlantisfmcg.com to resolve. حسابك محجوب حالياً.');
            }
            if ((user.status as any) === 'DELETED') {
                throw new UnauthorizedException('This account has been deleted. هذا الحساب تم حذفه.');
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

        // Wrong password — record failure (non-blocking). Use the
        // trimmed lowercased email so isAccountLocked() counts case-
        // variant attempts together; otherwise admin@x.com vs Admin@x.com
        // would accumulate on different rows and never trigger lockout.
        this.recordLoginAttempt(trimmedEmail, false, ip).catch(err =>
            this.logger.error(`[AUTH] Failed to record login attempt: ${err.message}`)
        );
        return null;
    }

    /**
     * Sign-up. Creates a PENDING_APPROVAL account with an UNVERIFIED email and
     * sends a 6-digit code. No session is issued until the email is verified
     * (and approval still applies afterwards). The response is identical
     * whether or not the email already has an account, so sign-up can't be
     * used to discover who is registered.
     */
    async register(data: any) {
        const email = normEmail(data?.email);
        const password = String(data?.password ?? '');
        const role = publicRole(data?.role);
        const name = String(data?.name ?? '').trim().slice(0, 120);
        if (!EMAIL_RE.test(email)) throw new BadRequestException({ code: 'INVALID_EMAIL', message: 'Enter a valid work email.' });
        if (!STRONG_PASSWORD_RE.test(password)) throw new BadRequestException({ code: 'WEAK_PASSWORD', message: 'Password needs 8+ characters with upper- and lower-case letters, a number and a symbol (!@#$%^&*).' });
        if (!role) throw new BadRequestException({ code: 'INVALID_ROLE', message: 'Choose Buyer or Supplier.' });
        if (!name) throw new BadRequestException({ code: 'NAME_REQUIRED', message: 'Enter your full name.' });
        const companyName = String(data?.companyName ?? '').trim().slice(0, 160);
        if (!companyName) throw new BadRequestException({ code: 'COMPANY_REQUIRED', message: 'Enter your company name.' });
        this.logger.log(`[AUTH] Sign-up attempt (${role})`);

        const generic = { verificationRequired: true, email, pendingApproval: true };
        const existing = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
        if (existing) {
            if (existing.emailVerificationRequired && !existing.emailVerified) {
                // Unfinished sign-up: just (re)send a code, respecting the cooldown.
                await this.sendSignupCode(existing.id).catch(() => undefined);
            } else {
                this.emailService.sendSignupExisting(existing.email, existing.name || '').catch(() => undefined);
            }
            return generic;
        }

        const blankToNull = (v: any) => (typeof v === 'string' ? (v.trim() ? v.trim().slice(0, 300) : null) : null);
        let user;
        try {
            user = await this.prisma.user.create({
                data: {
                    email,
                    password: await bcrypt.hash(password, 12),
                    name,
                    phone: blankToNull(data.phone),
                    companyName,
                    website: blankToNull(data.website),
                    country: blankToNull(data.country),
                    businessCity: blankToNull(data.businessCity),
                    businessType: blankToNull(data.businessType),
                    vatNumber: blankToNull(data.vatNumber),
                    role,
                    status: 'PENDING_APPROVAL',
                    emailVerified: false,
                    emailVerificationRequired: true,
                    onboardingCompleted: true,
                } as any,
            });
        } catch (e: any) {
            // Double submit / race on the unique email: same generic answer.
            if (e?.code === 'P2002' && String(e?.meta?.target || '').includes('email')) return generic;
            if (e?.code === 'P2002') throw new ConflictException({ code: 'DUPLICATE_FIELD', message: 'That VAT number is already registered. Leave it blank or contact Atlantis.' });
            throw e;
        }
        this.logger.log(`[AUTH] Sign-up created ${user.id}`);
        const sent = await this.sendSignupCode(user.id);
        // Admin alerts go out only after the email is verified (see verifySignupCode).
        return { ...generic, emailSent: sent.ok };
    }

    /** Issue + email a fresh sign-up code (cooldown enforced). The code itself is never stored. */
    private async sendSignupCode(userId: string): Promise<{ ok: boolean; retryAfter: number }> {
        const u = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!u || u.emailVerified) return { ok: false, retryAfter: 0 };
        const wait = cooldownLeft((u as any).emailVerifySentAt);
        if (wait > 0) return { ok: false, retryAfter: wait };
        const code = newCode();
        await this.prisma.user.update({
            where: { id: userId },
            data: { emailVerifyCodeHash: hashSecret(code), emailVerifyExpiry: new Date(Date.now() + CODE_TTL_MS), emailVerifyAttempts: 0, emailVerifySentAt: new Date() } as any,
        });
        const res = await this.emailService.sendSignupCode(u.email, u.name || '', code, CODE_TTL_MS / 60000).catch((e) => ({ success: false, error: e?.message }));
        if (!res.success) this.logger.error(`[AUTH] Verification email failed for ${userId}: ${res.error}`);
        return { ok: !!res.success, retryAfter: 60 };
    }

    /** Resend: same answer for unknown, verified and unverified emails (no enumeration). */
    async resendSignupCode(rawEmail: string) {
        const email = normEmail(rawEmail);
        const u = EMAIL_RE.test(email) ? await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }) : null;
        if (u && (u as any).emailVerificationRequired && !u.emailVerified) {
            const r = await this.sendSignupCode(u.id);
            if (!r.ok && r.retryAfter > 0) return { ok: true, retryAfter: r.retryAfter };
        }
        return { ok: true, retryAfter: 60 };
    }

    async verifySignupCode(rawEmail: string, code: string) {
        const email = normEmail(rawEmail);
        const fail = (codeName: string, message: string) => { throw new BadRequestException({ code: codeName, message }); };
        const u = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
        if (!u || !(u as any).emailVerificationRequired) fail('INVALID_CODE', 'That code isn’t valid. Check the latest email or request a new code.');
        if (u!.emailVerified) return { verified: true, alreadyVerified: true, role: u!.role, status: u!.status };
        const result = checkCode(code, { hash: (u as any).emailVerifyCodeHash, expiry: (u as any).emailVerifyExpiry, attempts: (u as any).emailVerifyAttempts });
        if (result === 'TOO_MANY') fail('TOO_MANY_ATTEMPTS', 'Too many wrong codes. Request a new code.');
        if (result === 'EXPIRED' || result === 'NO_CODE') fail('CODE_EXPIRED', 'This code has expired. Request a new one.');
        if (result === 'WRONG') {
            await this.prisma.user.update({ where: { id: u!.id }, data: { emailVerifyAttempts: { increment: 1 } } as any });
            fail('INVALID_CODE', `That code isn’t right. ${Math.max(0, MAX_ATTEMPTS - (u as any).emailVerifyAttempts - 1)} attempts left.`);
        }
        // Single-use: the conditional update only succeeds once.
        const done = await this.prisma.user.updateMany({
            where: { id: u!.id, emailVerified: false, emailVerifyCodeHash: (u as any).emailVerifyCodeHash } as any,
            data: { emailVerified: true, emailVerifyCodeHash: null, emailVerifyExpiry: null, emailVerifyAttempts: 0 } as any,
        });
        if (done.count === 1) {
            const role = u!.role === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER';
            (async () => {
                await this.emailService.sendEmailVerified(u!.email, u!.name || '', role).catch(() => undefined);
                await this.emailService.sendAdminSignupAlert({ name: u!.name || 'N/A', email: u!.email, role, companyName: u!.companyName, registeredAt: u!.createdAt }).catch(() => undefined);
                await this.notificationsService.notifyAdmins('New Registration Pending Approval', `${u!.name} (${u!.companyName}) verified their email and is waiting for approval as ${role === 'SUPPLIER' ? 'a supplier' : 'a buyer'}.`, 'INFO', { userId: u!.id }).catch(() => undefined);
            })();
        }
        return { verified: true, role: u!.role, status: u!.status };
    }

    /** Called by login after the password matched: block accounts whose sign-up email isn't verified yet. */
    assertEmailVerified(user: any) {
        if (user?.emailVerificationRequired && !user?.emailVerified) {
            throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email to sign in. We can send you a new code.', email: user.email });
        }
    }

    // ── Change email (authenticated) ──────────────────────────────────────
    async requestEmailChange(userId: string, rawNew: string, currentPassword: string) {
        const newEmail = normEmail(rawNew);
        if (!EMAIL_RE.test(newEmail)) throw new BadRequestException({ code: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
        const u = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!u) throw new UnauthorizedException();
        if (!(await bcrypt.compare(String(currentPassword || '').trim(), u.password))) throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'Your current password is incorrect.' });
        if (newEmail === normEmail(u.email)) throw new BadRequestException({ code: 'SAME_EMAIL', message: 'That is already your email.' });
        const wait = cooldownLeft((u as any).pendingEmailSentAt);
        if (wait > 0 && (u as any).pendingEmail === newEmail) return { pendingEmail: newEmail, retryAfter: wait };
        const taken = await this.prisma.user.findFirst({ where: { email: { equals: newEmail, mode: 'insensitive' } }, select: { id: true } });
        const code = newCode();
        await this.prisma.user.update({
            where: { id: userId },
            data: { pendingEmail: newEmail, pendingEmailCodeHash: taken ? hashSecret(crypto.randomBytes(16).toString('hex')) : hashSecret(code), pendingEmailExpiry: new Date(Date.now() + CODE_TTL_MS), pendingEmailAttempts: 0, pendingEmailSentAt: new Date() } as any,
        });
        // If the address belongs to another account we send nothing (and the stored hash can never match).
        if (!taken) {
            const r = await this.emailService.sendChangeEmailCode(newEmail, u.name || '', code, CODE_TTL_MS / 60000).catch((e) => ({ success: false, error: e?.message }));
            if (!r.success) this.logger.error(`[AUTH] Change-email code failed for ${userId}: ${r.error}`);
            this.emailService.sendChangeEmailNotice(u.email, u.name || '', newEmail, false).catch(() => undefined);
        }
        return { pendingEmail: newEmail, retryAfter: 60 };
    }

    async confirmEmailChange(userId: string, code: string) {
        const u = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!u || !(u as any).pendingEmail) throw new BadRequestException({ code: 'NO_PENDING_CHANGE', message: 'There’s no email change waiting for confirmation.' });
        const r = checkCode(code, { hash: (u as any).pendingEmailCodeHash, expiry: (u as any).pendingEmailExpiry, attempts: (u as any).pendingEmailAttempts });
        if (r === 'TOO_MANY') throw new BadRequestException({ code: 'TOO_MANY_ATTEMPTS', message: 'Too many wrong codes. Start the change again.' });
        if (r === 'EXPIRED' || r === 'NO_CODE') throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'This code has expired. Start the change again.' });
        if (r === 'WRONG') {
            await this.prisma.user.update({ where: { id: userId }, data: { pendingEmailAttempts: { increment: 1 } } as any });
            throw new BadRequestException({ code: 'INVALID_CODE', message: 'That code isn’t right.' });
        }
        const newEmail = (u as any).pendingEmail as string;
        const oldEmail = u.email;
        try {
            await this.prisma.user.update({
                where: { id: userId },
                data: { email: newEmail, emailVerified: true, pendingEmail: null, pendingEmailCodeHash: null, pendingEmailExpiry: null, pendingEmailAttempts: 0 } as any,
            });
        } catch (e: any) {
            if (e?.code === 'P2002') throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'That email can’t be used. Try another address.' });
            throw e;
        }
        this.emailService.sendChangeEmailNotice(oldEmail, u.name || '', newEmail, true).catch(() => undefined);
        return { email: newEmail };
    }

    async cancelEmailChange(userId: string) {
        await this.prisma.user.update({ where: { id: userId }, data: { pendingEmail: null, pendingEmailCodeHash: null, pendingEmailExpiry: null, pendingEmailAttempts: 0 } as any });
        return { ok: true };
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
        if (!user || (user.status as any) === 'BLOCKED' || (user.status as any) === 'REJECTED' || (user.status as any) === 'DELETED') {
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
            // New user via Google — activate immediately as requested
            const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
            user = await this.prisma.user.create({
                data: {
                    email: data.email,
                    name: data.name,
                    password: randomPassword,
                    avatar: data.avatar,
                    role: 'CUSTOMER',
                    status: 'ACTIVE',
                    emailVerified: true, // Google verified the email
                    onboardingCompleted: true, 
                },
            });

            // Background notifications
            this.emailService.sendWelcomeEmail(user.email, user.name, user.role).catch(() => {});
            this.notificationsService.notifyAdmins(
                'New Google Registration',
                `${user.name} (${user.email}) signed up via Google and is now active.`,
                'INFO',
                { userId: user.id }
            ).catch(() => {});

            const { password, ...safeUser } = user;
            return this.login(safeUser);
        }

        if ((user.status as any) === 'BLOCKED' || (user.status as any) === 'REJECTED' || (user.status as any) === 'DELETED') {
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

    /**
     * Emergency password reset gated by SEED_ADMIN_SECRET. See controller
     * docstring for the full rationale — short version: when SMTP can't
     * reach the operator's inbox, this lets them set their own password
     * server-side using the bootstrap secret already in the env.
     *
     * If the user exists → overwrite password + force status ACTIVE.
     * If not → create a new user when a role is provided.
     */
    async emergencyReset(
        email: string,
        newPassword: string,
        secret: string,
        role?: string,
        name?: string,
    ) {
        const expected = process.env.SEED_ADMIN_SECRET;
        if (!expected) {
            throw new UnauthorizedException('SEED_ADMIN_SECRET is not configured on the server.');
        }
        if (!secret || secret !== expected) {
            throw new UnauthorizedException('Invalid emergency-reset secret.');
        }
        const trimmedEmail = (email || '').trim().toLowerCase();
        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            throw new BadRequestException('Email is required and must be valid.');
        }
        if (!newPassword || newPassword.length < 8) {
            throw new BadRequestException('New password must be at least 8 characters.');
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        const existing = await this.prisma.user.findUnique({ where: { email: trimmedEmail } });

        if (existing) {
            await this.prisma.user.update({
                where: { id: existing.id },
                data: {
                    password: hashed,
                    status: 'ACTIVE',
                },
            });
            // Also clear any pending lockout from the LoginAttempt table
            // so the user isn't blocked by the rate-limiter immediately
            // after the reset.
            try {
                await this.prisma.loginAttempt.deleteMany({
                    where: { email: trimmedEmail, success: false },
                });
            } catch {}
            this.logger.warn(`[EMERGENCY_RESET] Password reset for existing user ${trimmedEmail} (role=${existing.role})`);
            return { ok: true, action: 'reset', userId: existing.id, role: existing.role };
        }

        // Create from scratch — required for first-boot or wiped DBs.
        if (!role) {
            throw new BadRequestException(
                `No user with email ${trimmedEmail} exists. Pass a role (ADMIN/OWNER/CUSTOMER/SUPPLIER) to create one.`,
            );
        }
        const created = await this.prisma.user.create({
            data: {
                email: trimmedEmail,
                password: hashed,
                name: name || trimmedEmail.split('@')[0],
                role: role.toUpperCase() as any,
                status: 'ACTIVE',
                emailVerified: true,
            },
        });
        this.logger.warn(`[EMERGENCY_RESET] Created new user ${trimmedEmail} role=${role.toUpperCase()}`);
        return { ok: true, action: 'created', userId: created.id, role: created.role };
    }

    async forgotPassword(rawEmail: string) {
        const email = normEmail(rawEmail);
        const user = EMAIL_RE.test(email) ? await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }) : null;

        // Security: Always return success for non-existent users to prevent enumeration
        if (!user) {
            this.logger.debug(`[FORGOT_PASSWORD] Attempt for non-existent email: ${email}`);
            return { success: true, message: 'If that email exists, a reset link was sent.' };
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour expiry

        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                // Only the hash is stored; the raw token lives in the emailed link.
                resetPasswordToken: hashSecret(token),
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
                resetPasswordToken: hashSecret(String(token || '')),
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

        // The reset link proved inbox ownership; sign out other sessions.
        await this.prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }).catch(() => undefined);
        await this.revokeAllRefreshTokens(user.id);
        return { success: true, message: 'Password reset successfully. You can now log in.' };
    }

    /** Lets the reset page tell the user up front that a link is invalid or expired. */
    async checkResetToken(token: string) {
        const ok = token ? await this.prisma.user.findFirst({ where: { resetPasswordToken: hashSecret(String(token)), resetPasswordExpires: { gt: new Date() } }, select: { id: true } }) : null;
        return { valid: !!ok };
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
                pendingEmail: true,
                website: true,
                businessType: true,
                businessCity: true,
                kycStatus: true,
                createdAt: true,
            } as any,
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
