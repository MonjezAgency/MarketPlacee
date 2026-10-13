import { Controller, Post, Body, Req, Res, UseGuards, Get, UnauthorizedException, ForbiddenException, Request, Delete, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    private getCookieOptions(maxAgeMs: number) {
        return {
            httpOnly: true,
            secure: true,   // Always true — Railway uses HTTPS
            sameSite: 'none' as const,
            path: '/',
            maxAge: maxAgeMs,
        };
    }

    @Post('login')
    async login(@Body() loginDto: any, @Res({ passthrough: true }) res: any) {
        // Step 1: Validate credentials → returns user object or null
        const user = await this.authService.validateUser(
            loginDto.email,
            loginDto.password,
        );
        if (user) this.authService.assertEmailVerified(user);
        if (!user) {
            // Security best-practice: don't reveal which of the two
            // failed (email-not-found vs password-mismatch). Add a
            // concrete next step so the operator / customer isn't
            // stuck if they actually forgot their password.
            throw new UnauthorizedException(
                'Invalid email or password. If you forgot your password, click "Recovery" below to reset it.',
            );
        }

        // Step 2: Handle 2FA check + token generation
        const result = await this.authService.loginStep1(user);
        if (result && 'access_token' in result) {
            // Persistent sessions: 2h for access token, 30d for refresh token
            // Persistent sessions, Facebook-style. The access cookie
            // matches the JWT expiry (30d), and the refresh cookie
            // lives even longer (90d) so an idle returning user is
            // re-authed silently when the access JWT eventually
            // lapses. The previous 2h access cookie was the reason
            // closing a tab kicked the user back to /auth/login.
            res.cookie('token', result.access_token, this.getCookieOptions(30 * 24 * 60 * 60 * 1000));
            res.cookie('refreshToken', (result as any).refresh_token, this.getCookieOptions(90 * 24 * 60 * 60 * 1000));
        }
        return result;
    }

    @Post('register')
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async register(@Body() registerDto: any, @Res({ passthrough: true }) res: any) {
        const result = await this.authService.register(registerDto);
        if (result && 'access_token' in result) {
            // Persistent sessions, Facebook-style. The access cookie
            // matches the JWT expiry (30d), and the refresh cookie
            // lives even longer (90d) so an idle returning user is
            // re-authed silently when the access JWT eventually
            // lapses. The previous 2h access cookie was the reason
            // closing a tab kicked the user back to /auth/login.
            res.cookie('token', result.access_token, this.getCookieOptions(30 * 24 * 60 * 60 * 1000));
            res.cookie('refreshToken', (result as any).refresh_token, this.getCookieOptions(90 * 24 * 60 * 60 * 1000));
        }
        return result;
    }

    @Post('verify-email')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async verifyEmail(@Body() body: { email: string; code: string }) {
        return this.authService.verifySignupCode(body?.email, body?.code);
    }

    @Post('resend-verification')
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async resendVerification(@Body('email') email: string) {
        return this.authService.resendSignupCode(email);
    }

    @Post('reset-password/check')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async checkReset(@Body('token') token: string) {
        return this.authService.checkResetToken(token);
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-email')
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async requestEmailChange(@Request() req: any, @Body() body: { newEmail: string; currentPassword: string }) {
        return this.authService.requestEmailChange(req.user.sub, body?.newEmail, body?.currentPassword);
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-email/confirm')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async confirmEmailChange(@Request() req: any, @Body('code') code: string) {
        return this.authService.confirmEmailChange(req.user.sub, code);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('change-email')
    async cancelEmailChange(@Request() req: any) {
        return this.authService.cancelEmailChange(req.user.sub);
    }

    @Post('forgot-password')
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    async forgotPassword(@Body('email') email: string) {
        return this.authService.forgotPassword(email);
    }

    /**
     * Emergency admin password reset. Used when SMTP is down or the
     * normal forgot-password flow isn't reaching the inbox. Caller
     * must know the SEED_ADMIN_SECRET env var (same one used by the
     * tech-team seed script) — without it the call is rejected.
     *
     * Body: { email, newPassword, secret, role? }
     *
     * If the user doesn't exist AND role is provided, we create a
     * fresh ACTIVE user at that role (lets the operator bootstrap
     * an admin account from scratch on a clean DB). When the user
     * exists we just overwrite the password and force ACTIVE status
     * so a forgotten / locked admin gets back in.
     */
    @Post('emergency-reset')
    async emergencyReset(@Body() body: { email: string; newPassword: string; secret: string; role?: string; name?: string }) {
        return this.authService.emergencyReset(
            body?.email,
            body?.newPassword,
            body?.secret,
            body?.role,
            body?.name,
        );
    }

    @Post('reset-password')
    async resetPassword(@Body() body: { token: string; newPassword: any }) {
        return this.authService.resetPassword(body.token, body.newPassword);
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    async changePassword(@Request() req: any, @Body() body: any) {
        return this.authService.changePassword(req.user.sub, body.currentPassword, body.newPassword);
    }

    @Post('refresh')
    @SkipThrottle()
    async refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const refreshToken = req?.cookies?.refreshToken;
        if (!refreshToken) throw new UnauthorizedException('No refresh token provided');
        
        const result = await this.authService.refreshTokens(refreshToken);
        if (result && 'access_token' in result) {
            // Persistent sessions, Facebook-style. The access cookie
            // matches the JWT expiry (30d), and the refresh cookie
            // lives even longer (90d) so an idle returning user is
            // re-authed silently when the access JWT eventually
            // lapses. The previous 2h access cookie was the reason
            // closing a tab kicked the user back to /auth/login.
            res.cookie('token', result.access_token, this.getCookieOptions(30 * 24 * 60 * 60 * 1000));
            res.cookie('refreshToken', (result as any).refresh_token, this.getCookieOptions(90 * 24 * 60 * 60 * 1000));
        }
        return result;
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    async getMe(@Request() req: any) {
        return this.authService.getUserProfile(req.user.sub);
    }

    /**
     * Returns the current JWT for the authenticated user, mined from the
     * httpOnly cookie. Used by the chat WebSocket gateway, which can't read
     * the cookie itself but can accept a token in the auth handshake.
     */
    @UseGuards(JwtAuthGuard)
    @Get('socket-token')
    async getSocketToken(@Req() req: any) {
        const cookieToken = req?.cookies?.token;
        if (!cookieToken) throw new UnauthorizedException('No token cookie');
        return { token: cookieToken };
    }

    @UseGuards(JwtAuthGuard)
    @Get('sessions')
    async sessions(@Request() req: any) {
        return this.authService.listSessions(req.user.sub, req.user.sid);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('sessions/:id')
    async revokeSession(@Request() req: any, @Param('id') id: string) {
        return this.authService.revokeSession(req.user.sub, id);
    }

    @UseGuards(JwtAuthGuard)
    @Post('sessions/revoke-others')
    async revokeOthers(@Request() req: any) {
        return this.authService.revokeOtherSessions(req.user.sub, req.user.sid);
    }

    @Post('logout')
    async logout(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const bearer = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
        await this.authService.logoutSession(req?.cookies?.token || bearer || undefined, req?.cookies?.refreshToken);
        res.clearCookie('token', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            path: '/',
        });
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            path: '/',
        });
        return { message: 'Logged out successfully' };
    }

    @Post('google-login')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async googleLogin(@Body('idToken') idToken: string, @Res({ passthrough: true }) res: any) {
        const result: any = await this.authService.googleLogin(idToken);
        if (result && 'access_token' in result) {
            // Persistent sessions, Facebook-style. The access cookie
            // matches the JWT expiry (30d), and the refresh cookie
            // lives even longer (90d) so an idle returning user is
            // re-authed silently when the access JWT eventually
            // lapses. The previous 2h access cookie was the reason
            // closing a tab kicked the user back to /auth/login.
            res.cookie('token', result.access_token, this.getCookieOptions(30 * 24 * 60 * 60 * 1000));
            res.cookie('refreshToken', (result as any).refresh_token, this.getCookieOptions(90 * 24 * 60 * 60 * 1000));
        }
        return result;
    }

    @Post('seed-admin')
    async seedAdmin(
        @Body('email') email: string, 
        @Body('password') password: string, 
        @Body('name') name: string, 
        @Body('secret') secret: string
    ) {
        // No built-in default: the endpoint is disabled unless the server has a real secret.
        const expectedSecret = process.env.SEED_ADMIN_SECRET;
        if (!expectedSecret || expectedSecret.length < 16 || secret !== expectedSecret) {
            throw new ForbiddenException('Unauthorized seed attempt');
        }
        try {
            const existing = await this.authService.findByEmail(email);
            if (existing) {
                // Always reset the password to the supplied one so admins
                // can recover access via this endpoint.
                await this.authService.updateAdmin(existing.id, password);
                return { message: 'Admin updated', userId: existing.id };
            }
            const user = await this.authService.register({
                email: email,
                password: password,
                name: name || 'Super Admin',
                role: 'ADMIN',
                status: 'ACTIVE',
                emailVerified: true
            });
            // register() always creates as PENDING_APPROVAL — re-run updateAdmin
            // so a fresh seed call also produces a usable ACTIVE admin in one shot.
            await this.authService.updateAdmin((user as any).id, password);
            return { message: 'Admin seeded successfully', userId: (user as any).id };
        } catch (err) {
            throw new Error(`Seed admin failed: ${(err as any).message}`);
        }
    }
}
