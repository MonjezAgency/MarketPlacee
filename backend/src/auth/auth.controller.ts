import { Controller, Post, Body, Get, Query, UnauthorizedException, ForbiddenException, UseGuards, Request, Req } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ViesService } from './vies.service';
import { TwoFaService } from './twofa.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserDto } from '../common/dtos/base.dto';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly viesService: ViesService,
        private readonly twoFaService: TwoFaService,
    ) { }

    @Get('ping')
    async ping() {
        return { 
            message: 'Pong from Atlantis Backend!', 
            instance: 'local-development',
            timestamp: new Date().toISOString()
        };
    }

    @Get('validate-vat')
    async validateVat(@Query('countryCode') countryCode: string, @Query('vatNumber') vatNumber: string) {
        return this.viesService.validateVat(countryCode, vatNumber);
    }

    @Post('register')
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    async register(@Body() createUserDto: RegisterDto) {
        const { password, ...userData } = createUserDto;
        // The service already handles hashing, duplicate checks, and setting status to PENDING_APPROVAL
        const user = await this.authService.register(createUserDto);

        // Do not log in the user immediately, tell them to wait for approval.
        return {
            message: 'تم التسجيل بنجاح. حسابك الآن قيد المراجعة بواسطة الإدارة، ستتمكن من تسجيل الدخول فور الموافقة عليه.',
            userId: user.id
        };
    }

    @Post('login')
    @Throttle({ default: { limit: 6, ttl: 60000 } })
    async login(@Body() loginDto: any, @Req() req: any) {
        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
        const user = await this.authService.validateUser(loginDto.email, loginDto.password, ip);
        if (!user) {
            throw new UnauthorizedException('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        }
        if (!user.emailVerified) {
            throw new UnauthorizedException('يرجى تفعيل بريدك الإلكتروني أولاً');
        }
        return this.authService.loginStep1(user);
    }

    @Post('2fa/login-verify')
    async loginVerify2FA(@Body() body: { partialToken: string; code: string }) {
        return this.authService.loginVerify2FA(body.partialToken, body.code);
    }

    @Post('refresh')
    @SkipThrottle()
    async refresh(@Body('refresh_token') rawRefreshToken: string) {
        if (!rawRefreshToken) throw new UnauthorizedException('Refresh token required');
        return this.authService.refreshTokens(rawRefreshToken);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    async logout(@Request() req, @Body('refresh_token') rawRefreshToken?: string) {
        // Revoke the supplied refresh token (single device) or all tokens (if none supplied)
        if (rawRefreshToken) {
            await this.authService.revokeRefreshToken(rawRefreshToken);
        } else {
            await this.authService.revokeAllRefreshTokens(req.user.sub);
        }
        return { message: 'Logged out successfully' };
    }

    @Get('verify-email')
    async verifyEmail(@Query('token') token: string) {
        await this.authService.verifyEmail(token);
        return { message: 'Email verified successfully' };
    }

    @Post('forgot-password')
    async forgotPassword(@Body('email') email: string) {
        await this.authService.forgotPassword(email);
        return { message: 'If an account exists with this email, a reset link has been sent' };
    }

    @Post('reset-password')
    async resetPassword(@Body() body: any) {
        await this.authService.resetPassword(body.token, body.password);
        return { message: 'Password reset successfully' };
    }

    // ── 2FA Endpoints ──

    @Get('2fa/status')
    @UseGuards(JwtAuthGuard)
    async get2faStatus(@Request() req) {
        return this.twoFaService.get2faStatus(req.user.sub);
    }

    @Post('2fa/setup')
    @UseGuards(JwtAuthGuard)
    async setup2fa(@Request() req) {
        return this.twoFaService.generateTotpSetup(req.user.sub);
    }

    @Post('2fa/enable')
    @UseGuards(JwtAuthGuard)
    async enable2fa(@Request() req, @Body('token') token: string) {
        return this.twoFaService.verifyAndEnableTotp(req.user.sub, token);
    }

    @Post('2fa/disable')
    @UseGuards(JwtAuthGuard)
    async disable2fa(@Request() req, @Body('token') token: string) {
        await this.twoFaService.disableTotp(req.user.sub, token);
        return { message: '2FA disabled successfully' };
    }

    @Post('2fa/verify')
    @UseGuards(JwtAuthGuard)
    async verify2fa(@Request() req, @Body('token') token: string) {
        const user = await this.authService.findById(req.user.sub);
        if (!user?.twoFactorSecret) throw new UnauthorizedException('2FA not configured');
        const valid = this.twoFaService.verifyTotpToken(user.twoFactorSecret, token);
        if (!valid) throw new UnauthorizedException('Invalid 2FA code');
        return { verified: true };
    }

    @Post('email-otp/send')
    @UseGuards(JwtAuthGuard)
    async sendEmailOtp(@Request() req) {
        await this.twoFaService.sendEmailOtp(req.user.sub);
        return { message: 'Verification code sent to your email' };
    }

    @Post('email-otp/verify')
    @UseGuards(JwtAuthGuard)
    async verifyEmailOtp(@Request() req, @Body('code') code: string) {
        const valid = await this.twoFaService.verifyEmailOtp(req.user.sub, code);
        if (!valid) throw new UnauthorizedException('Invalid or expired verification code');
        return { verified: true };
    }

    @Post('google')
    async googleLogin(@Body() body: { email: string; name: string; avatar?: string; googleId?: string }) {
        return this.authService.googleLogin(body);
    }

    @Post('seed-admin')
    async seedAdmin(@Body() body: any) {
        // Protected by a secret key — only the server owner can use this endpoint
        const expectedSecret = process.env.SEED_ADMIN_SECRET;
        if (!expectedSecret || body.secret !== expectedSecret) {
            throw new ForbiddenException('Unauthorized seed attempt');
        }
        try {
            const existing = await this.authService.findByEmail(body.email);
            if (existing) {
                // If already ACTIVE admin, no need to re-hash password
                if (existing.role === 'ADMIN' && existing.status === 'ACTIVE' && existing.emailVerified) {
                    return { message: 'Admin already exists', userId: existing.id };
                }
                // Update the password hash and ensure ACTIVE status
                await this.authService.updateAdmin(existing.id, body.password);
                return { message: 'Admin updated', userId: existing.id };
            }
            const user = await this.authService.register({
                email: body.email,
                password: body.password,
                name: body.name || 'Super Admin',
                role: 'ADMIN',
                status: 'ACTIVE',
                emailVerified: true // Critical: Ensure seeded admin can login
            });
            return { message: 'Admin seeded successfully', userId: user.id };
        } catch (err) {
            throw new Error(`Seed admin failed: ${(err as any).message}`);
        }
    }
}
