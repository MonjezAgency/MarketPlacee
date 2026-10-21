import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/** Short cache so session checks don't hit the database on every request. */
const CACHE_MS = 20_000;
const sessionCache = new Map<string, { ok: boolean; at: number }>();
type UserFacts = { found: boolean; role: string | null; status: string | null; after: number };
const userCache = new Map<string, { facts: UserFacts; at: number }>();
export const forgetSession = (sid: string) => sessionCache.delete(sid);
/** Drop the cached role/status/sign-out time so the next request reads the database. */
export const forgetUserTokens = (userId: string) => userCache.delete(userId);
export const forgetUser = forgetUserTokens;

const CLOSED_STATUSES = new Set(['BLOCKED', 'DELETED', 'REJECTED']);

/**
 * The identity a request acts as. The role comes from the database, not from the
 * token: access tokens live 30 days, so a role change, a demotion or a block must
 * take effect without waiting for the token to expire (at most CACHE_MS later).
 * Returns null when the token must be refused.
 */
export function resolveIdentity(payload: any, facts: UserFacts | null): { role: string } | null {
    if (!facts) return { role: payload.role }; // database unreachable: same behaviour as before (token claims)
    if (!facts.found) return null;
    if (facts.status && CLOSED_STATUSES.has(String(facts.status).toUpperCase())) return null;
    // Older tokens (before sessions were recorded) die on "sign out everywhere".
    if (!payload.sid && facts.after && Number(payload.iat || 0) * 1000 < facts.after) return null;
    return { role: facts.role || payload.role };
}

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

    private async userFacts(userId: string, now: number): Promise<UserFacts | null> {
        const c = userCache.get(userId);
        if (c && now - c.at <= CACHE_MS) return c.facts;
        let r: any;
        try {
            r = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true, tokensValidAfter: true } as any });
        } catch {
            return null; // not cached: try again on the next request
        }
        const facts: UserFacts = {
            found: !!r,
            role: r?.role ?? null,
            status: r?.status ?? null,
            after: r?.tokensValidAfter ? new Date(r.tokensValidAfter).getTime() : 0,
        };
        userCache.set(userId, { facts, at: now });
        return facts;
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
        }
        let role = payload.role;
        if (payload.sub) {
            const who = resolveIdentity(payload, await this.userFacts(payload.sub, now));
            if (!who) throw new UnauthorizedException('Signed out');
            role = who.role;
        }
        return { sub: payload.sub, userId: payload.sub, email: payload.email, role, sid: payload.sid };
    }
}
