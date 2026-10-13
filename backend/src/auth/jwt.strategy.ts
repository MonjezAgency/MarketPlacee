import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** Short cache so session checks don't hit the database on every request. */
const CACHE_MS = 20_000;
const sessionCache = new Map<string, { ok: boolean; at: number }>();
const userCache = new Map<string, { after: number; at: number }>();
export const forgetSession = (sid: string) => sessionCache.delete(sid);
export const forgetUserTokens = (userId: string) => userCache.delete(userId);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (req: any) => {
                    return req?.cookies?.token || null;
                },
                ExtractJwt.fromAuthHeaderAsBearerToken(),
            ]),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'secretKey',
        });
    }

    async validate(payload: any) {
        const now = Date.now();
        if (payload.sid) {
            // Session tokens: valid while their session isn't revoked.
            let c = sessionCache.get(payload.sid);
            if (!c || now - c.at > CACHE_MS) {
                const s = await (this.prisma as any).userSession.findUnique({ where: { id: payload.sid }, select: { revokedAt: true, lastSeenAt: true } }).catch(() => null);
                c = { ok: !!s && !s.revokedAt, at: now };
                sessionCache.set(payload.sid, c);
                if (s && !s.revokedAt && now - new Date(s.lastSeenAt).getTime() > 5 * 60_000) {
                    (this.prisma as any).userSession.update({ where: { id: payload.sid }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
                }
            }
            if (!c.ok) throw new UnauthorizedException('This session was signed out');
        } else if (payload.sub) {
            // Older tokens (before sessions were recorded) die on "sign out everywhere".
            let u = userCache.get(payload.sub);
            if (!u || now - u.at > CACHE_MS) {
                const r: any = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { tokensValidAfter: true } as any }).catch(() => null);
                u = { after: r?.tokensValidAfter ? new Date(r.tokensValidAfter).getTime() : 0, at: now };
                userCache.set(payload.sub, u);
            }
            if (u.after && Number(payload.iat || 0) * 1000 < u.after) throw new UnauthorizedException('Signed out');
        }
        return { sub: payload.sub, userId: payload.sub, email: payload.email, role: payload.role, sid: payload.sid };
    }
}
