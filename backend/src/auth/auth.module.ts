import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ViesService } from './vies.service';
import { TwoFaService } from './twofa.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { PrismaModule } from '../common/prisma.module';

@Module({
    imports: [
        PassportModule,
        EmailModule,
        PrismaModule,
        forwardRef(() => NotificationsModule),
        // ── Session length ──────────────────────────────────────
        // Operator pain point: closing the browser tab logged the user
        // out. Two settings combine to control this:
        //   • signOptions.expiresIn — the JWT itself expires this far
        //     in the future. We push to 30d so the access token stays
        //     valid through normal customer behaviour (close laptop,
        //     come back next morning, tab is still authed).
        //   • Cookie maxAge on /login + /register (in auth.controller)
        //     — extended to match (30d for access, 90d for refresh)
        //     so the browser keeps the cookie across restarts.
        // The refresh-token rotation guard inside the auth service
        // still kicks in for compromised tokens. This change is just
        // about closing the gap between "JWT not expired" and "user
        // is asked to log in again".
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'secretKey',
            signOptions: { expiresIn: '30d' },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, ViesService, TwoFaService],
    exports: [AuthService, TwoFaService],
})
export class AuthModule { }
