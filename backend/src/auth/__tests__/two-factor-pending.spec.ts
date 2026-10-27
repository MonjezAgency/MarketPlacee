import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../jwt.strategy';

/** The token issued after the password step of two-step sign-in must not work as a sign-in. */
describe('JwtStrategy: two-step sign-in pending token', () => {
    const prisma: any = {
        user: { findUnique: jest.fn().mockResolvedValue({ role: 'CUSTOMER', status: 'ACTIVE', tokensValidAfter: null }) },
        userSession: { findUnique: jest.fn().mockResolvedValue({ revokedAt: null, lastSeenAt: new Date() }) },
    };
    const strategy = new JwtStrategy(prisma);

    it('refuses a token that is still waiting for the code', async () => {
        await expect(strategy.validate({ sub: 'u-pending', role: 'CUSTOMER', twoFactorPending: true })).rejects.toBeInstanceOf(UnauthorizedException);
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('accepts a normal sign-in token', async () => {
        await expect(strategy.validate({ sub: 'u-normal', role: 'CUSTOMER' })).resolves.toMatchObject({ userId: 'u-normal', role: 'CUSTOMER' });
    });
});
