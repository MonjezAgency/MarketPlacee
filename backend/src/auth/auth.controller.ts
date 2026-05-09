import { Controller, Post, Body, Req, Res, UseGuards, Get, UnauthorizedException, ForbiddenException, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SkipThrottle } from '@nestjs/throttler';
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
        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // Step 2: Handle 2FA check + token generation
        const result = await this.authService.loginStep1(user);
        if (result && 'access_token' in result) {
            // Persistent sessions: 2h for access token, 30d for refresh token
            res.cookie('token', result.access_token, this.getCookieOptions(2 * 60 * 60 * 1000));
            res.cookie('refreshToken', (result as any).refresh_token, this.getCookieOptions(30 * 24 * 60 * 60 * 1000));
        }
        return result;
    }

    @Post('register')
    async register(@Body() registerDto: any, @Res({ passthrough: true }) res: any) {
        const result = await this.authService.register(registerDto);
        if (result && 'access_token' in result) {
            res.cookie('token', result.access_token, this.getCookieOptions(2 * 60 * 60 * 1000));
            res.cookie('refreshToken', (result as any).refresh_token, this.getCookieOptions(30 * 24 * 60 * 60 * 1000));
        }
        return result;
    }

    @Post('forgot-password')
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
            res.cookie('token', result.access_token, this.getCookieOptions(2 * 60 * 60 * 1000));
            res.cookie('refreshToken', (result as any).refresh_token, this.getCookieOptions(30 * 24 * 60 * 60 * 1000));
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

    @Post('logout')
    async logout(@Res({ passthrough: true }) res: any) {
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
    async googleLogin(@Body('email') email: string, @Body('name') name: string, @Body('avatar') avatar: string, @Body('googleId') googleId: string, @Res({ passthrough: true }) res: any) {
        const result = await this.authService.googleLogin({ email, name, avatar, googleId });
        if (result && 'access_token' in result) {
            res.cookie('token', result.access_token, this.getCookieOptions(2 * 60 * 60 * 1000));
            res.cookie('refreshToken', (result as any).refresh_token, this.getCookieOptions(30 * 24 * 60 * 60 * 1000));
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
        const expectedSecret = process.env.SEED_ADMIN_SECRET || 'atlantis_seed_2025_secure';
        if (secret !== expectedSecret) {
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
