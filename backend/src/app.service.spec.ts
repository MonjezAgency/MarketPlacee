import { AppService } from './app.service';

/** The founding OWNER account is kept, but its password is never reset or defaulted. */
function setup(existing: any) {
    const calls: any = { update: [], create: [] };
    const db: any = { user: {
        findFirst: jest.fn(async () => existing),
        update: jest.fn(async ({ data }: any) => { calls.update.push(data); return { ...existing, ...data }; }),
        create: jest.fn(async ({ data }: any) => { calls.create.push(data); return data; }),
    } };
    return { svc: new AppService(db), calls };
}

describe('AppService owner account check', () => {
    const OLD = process.env.OWNER_PASSWORD;
    afterEach(() => { if (OLD === undefined) delete process.env.OWNER_PASSWORD; else process.env.OWNER_PASSWORD = OLD; });

    it('keeps the existing owner (role/status) and never touches the password', async () => {
        process.env.OWNER_PASSWORD = 'some-long-password-123';
        const { svc, calls } = setup({ id: 'u1', email: 'Info@atlantisfmcg.com', role: 'OWNER', password: 'HASH' });
        await svc.onModuleInit();
        expect(calls.update).toHaveLength(1);
        expect(calls.update[0]).not.toHaveProperty('password');
        expect(calls.update[0].role).toBe('OWNER');
        expect(calls.create).toHaveLength(0);
    });
    it('does not create the owner from any default when OWNER_PASSWORD is unset', async () => {
        delete process.env.OWNER_PASSWORD;
        const { svc, calls } = setup(null);
        await svc.resetAdmin();
        expect(calls.create).toHaveLength(0);
    });
});
