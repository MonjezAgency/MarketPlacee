import { Controller, Post, Body, Req, Res, UseGuards, Get, UnauthorizedException, ForbiddenException, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('login')
        async login(@Body() loginDto: any, @Res({ passthrough: true }) res: any) {
        const result = await this.authService.login(loginDto);
        if ('access_token' in result) {
            res.cookie('token', result.access_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: 15 * 60 * 1000,
                path: '/',
            });
            res.cookie('refreshToken', result.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/auth/refresh',
            });
        }
        return result;
    }

    @Post('register')
        async register(@Body() registerDto: any) {
        return this.authService.register(registerDto);
    }

    @Post('refresh')
    @SkipThrottle()
    async refresh(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const refreshToken = req?.cookies?.refreshToken;
        if (!refreshToken) throw new UnauthorizedException('No refresh token provided');
        
        const result = await this.authService.refreshTokens(refreshToken);
        if ('access_token' in result) {
            res.cookie('token', result.access_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: 15 * 60 * 1000,
                path: '/',
            });
            res.cookie('refreshToken', result.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/auth/refresh',
            });
        }
        return result;
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
        async getProfile(@Request() req: any) {
        return this.authService.getUserProfile(req.user.sub);
    }

    @Post('logout')
        async logout(@Res({ passthrough: true }) res: any) {
        res.clearCookie('token');
        res.clearCookie('refreshToken');
        return { message: 'Logged out successfully' };
    }

    @Post('google-login')
    async googleLogin(@Body('email') email: string, @Body('name') name: string, @Body('avatar') avatar: string, @Res({ passthrough: true }) res: any) {
        const result = await this.authService.googleLogin({ email, name, avatar });
        if (result && 'access_token' in result) {
            res.cookie('token', result.access_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: 15 * 60 * 1000,
                path: '/',
            });
            res.cookie('refreshToken', result.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'none',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/auth/refresh',
            });
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
