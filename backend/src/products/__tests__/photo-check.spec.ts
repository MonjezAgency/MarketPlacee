import { PHOTO_CHECK_MONTHLY_LIMIT, PhotoCheckService, judge } from '../photo-check.service';

const item = { ean: '5061013941402', name: 'MONSTER ZERO CLASSIC (black-green) 500ml', brand: 'Monster', weight: '500ml' };
const good = { read_text: 'Monster Energy Zero Sugar 500ml', same_brand: true, same_variant: true, same_size: 'yes', front_of_pack: true, single_unit: true, clean_image: true, confidence: 0.96 };

function db(used = 0) {
    const store = new Map<string, string>(used ? [[`photo_check_count:${new Date().toISOString().slice(0, 7)}`, String(used)]] : []);
    return { appConfig: {
        findUnique: jest.fn(async ({ where }: any) => (store.has(where.key) ? { key: where.key, value: store.get(where.key) } : null)),
        create: jest.fn(async ({ data }: any) => { store.set(data.key, data.value); return data; }),
        updateMany: jest.fn(async ({ where, data }: any) => { store.set(where.key, data.value); return { count: 1 }; }),
    } } as any;
}

describe('the AI answer is only a yes when everything holds', () => {
    it('accepts a full yes, and a size the pack doesn\'t show', () => {
        expect(judge(item, good)).toMatchObject({ ok: true, why: [] });
        expect(judge(item, { ...good, same_size: 'not_visible' }).ok).toBe(true);
    });
    it.each([
        [{ same_variant: false }, 'ai_variant'], [{ same_size: 'no' }, 'ai_size'], [{ front_of_pack: false }, 'ai_view'], [{ single_unit: false }, 'ai_multi'],
        [{ clean_image: false }, 'ai_clutter'], [{ confidence: 0.89 }, 'ai_unsure'], [{ same_brand: false }, 'ai_brand'], [{ read_text: 'Red Bull 250ml' }, 'ai_brand'],
    ])('refuses %j', (patch, why) => {
        const r = judge(item, { ...good, ...patch });
        expect(r.ok).toBe(false);
        expect(r.why).toContain(why);
    });
    it('a missing or odd answer is a no', () => {
        expect(judge(item, {}).ok).toBe(false);
        expect(judge(item, { ...good, same_variant: 'true' }).ok).toBe(false);
    });
});

describe('PhotoCheckService', () => {
    const OLD = process.env.OPENROUTER_API_KEY;
    beforeEach(() => { process.env.OPENROUTER_API_KEY = 'test-key'; });
    afterAll(() => { if (OLD === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = OLD; });
    const reply = (content: string) => ({ data: { choices: [{ message: { content } }], usage: { cost: 0.0001 } } });

    it('sends only the product and the photo, and reads the reply even inside a code fence', async () => {
        const svc = new PhotoCheckService(db());
        svc.post = jest.fn(async () => reply('```json\n' + JSON.stringify(good) + '\n```'));
        const r = await svc.check(item, 'https://cdn.example.com/a.png');
        expect(r).toMatchObject({ status: 'checked', check: { ok: true, read: good.read_text } });
        const body = (svc.post as jest.Mock).mock.calls[0][1];
        expect(JSON.stringify(body.messages[1])).toContain('MONSTER ZERO CLASSIC');
        expect(body.messages[1].content[1].image_url.url).toBe('https://cdn.example.com/a.png');
        expect(body.temperature).toBe(0);
    });
    it('no key, a failed call or an unreadable reply decide nothing', async () => {
        const svc = new PhotoCheckService(db());
        svc.post = jest.fn(async () => { throw Object.assign(new Error('x'), { response: { status: 402 } }); });
        expect(await svc.check(item, 'u')).toEqual({ status: 'unavailable' });
        svc.post = jest.fn(async () => reply('I think so'));
        expect(await svc.check(item, 'u')).toEqual({ status: 'unavailable' });
        delete process.env.OPENROUTER_API_KEY;
        expect(await svc.check(item, 'u')).toEqual({ status: 'unavailable' });
    });
    it('stops at the monthly limit without calling the model', async () => {
        const svc = new PhotoCheckService(db(PHOTO_CHECK_MONTHLY_LIMIT));
        svc.post = jest.fn();
        expect(await svc.check(item, 'u')).toEqual({ status: 'limit_reached' });
        expect(svc.post).not.toHaveBeenCalled();
    });
});
