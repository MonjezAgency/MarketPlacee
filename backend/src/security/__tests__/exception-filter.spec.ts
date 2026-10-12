import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SecurityExceptionFilter } from '../security.exception-filter';

function run(err: unknown) {
    let sent: any; let code = 0;
    const res = { status: (s: number) => { code = s; return { json: (b: any) => { sent = b; } }; } };
    const host: any = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ ip: '1', url: '/x', method: 'POST' }) }) };
    return new SecurityExceptionFilter({ logEvent: () => undefined } as any).catch(err, host).then(() => ({ code, sent }));
}

describe('SecurityExceptionFilter', () => {
    it('keeps structured codes from our exceptions', async () => {
        const r = await run(new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email', email: 'a@b.c' }));
        expect(r.code).toBe(403);
        expect(r.sent).toMatchObject({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email', email: 'a@b.c', statusCode: 403 });
    });
    it('keeps validation message arrays and plain messages', async () => {
        expect((await run(new BadRequestException(['a must be a string']))).sent.message).toEqual(['a must be a string']);
        expect((await run(new BadRequestException('Nope'))).sent.message).toBe('Nope');
    });
    it('maps unexpected errors to 500 without extra fields', async () => {
        const r = await run(new Error('boom'));
        expect(r.code).toBe(500);
        expect(Object.keys(r.sent).sort()).toEqual(['message', 'path', 'statusCode', 'timestamp']);
    });
});
