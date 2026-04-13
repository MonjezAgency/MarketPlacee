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
            res.cookie('token', result.access_token, this.getCookieOptions(15 * 60 * 1000));
            res.cookie('refreshToken', result.refresh_token, this.getCookieOptions(7 * 24 * 60 * 60 * 1000));
        }
        return result;
    }

    @Post('register')
    async register(@Body() registerDto: any) {
        return this.authService.register(registerDto);
    }

    @Post('forgot-password')
    async forgotPassword(@Body('email') email: string) {
        return this.authService.forgotPassword(email);
    }

    @Post('reset-password')
    async resetPassword(@Body() body: { token: string; newPassword: any }) {
        return this.authService.resetPassword(body.token, body.newPassword);
    }

    @Post('refresh')
    @SkipThrottle()
    async refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const refreshToken = req?.cookies?.refreshToken;
        if (!refreshToken) throw new UnauthorizedException('No refresh token provided');
        
        const result = await this.authService.refreshTokens(refreshToken);
        if (result && 'access_token' in result) {
            res.cookie('token', result.access_token, this.getCookieOptions(15 * 60 * 1000));
            res.cookie('refreshToken', result.refresh_token, this.getCookieOptions(7 * 24 * 60 * 60 * 1000));
        }
        return result;
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    async getMe(@Request() req: any) {
        return this.authService.getUserProfile(req.user.sub);
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
            path: '/auth/refresh',
        });
        return { message: 'Logged out successfully' };
    }

    @Post('google-login')
    async googleLogin(@Body('email') email: string, @Body('name') name: string, @Body('avatar') avatar: string, @Res({ passthrough: true }) res: any) {
        const result = await this.authService.googleLogin({ email, name, avatar });
        if (result && 'access_token' in result) {
            res.cookie('token', result.access_token, this.getCookieOptions(15 * 60 * 1000));
            res.cookie('refreshToken', result.refresh_token, this.getCookieOptions(7 * 24 * 60 * 60 * 1000));
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
                if (existing.role === 'ADMIN' && existing.status === 'ACTIVE' && existing.emailVerified) {
                    return { message: 'Admin already exists', userId: existing.id };
                }
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
            return { message: 'Admin seeded successfully', userId: user.id };
        } catch (err) {
            throw new Error(`Seed admin failed: ${(err as any).message}`);
        }
    }
}
