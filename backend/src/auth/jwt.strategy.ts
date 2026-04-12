import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request: any) => {
                    const cookieHeader = request?.headers?.cookie as string | undefined;
                    if (cookieHeader) {
                        const tokenMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]*)/);
                        if (tokenMatch) return tokenMatch[1];
                        
                        const bevTokenMatch = cookieHeader.match(/(?:^|;\s*)bev-token=([^;]*)/);
                        if (bevTokenMatch) return bevTokenMatch[1];
                    }
                    return null;
                },
                ExtractJwt.fromAuthHeaderAsBearerToken(),
            ]),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'secretKey',
        });
    }

    async validate(payload: any) {
        return { sub: payload.sub, userId: payload.sub, email: payload.email, role: payload.role };
    }
}
