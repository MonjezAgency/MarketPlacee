import { SupportAssistantService, attachmentUrl, systemPrompt } from '../support-assistant.service';
import { SupportContextService, detectAreas, orderRefs } from '../support-context.service';
import { ChatService } from '../../chat/chat.service';

/** In-memory doubles: no DB, no network, no AI provider. */
function setup(opts: { handedOver?: boolean } = {}) {
    const msgs: any[] = [];
    let n = 0;
    const prisma: any = {
        user: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, name: 'Abdelrhman Hany', role: where.id.startsWith('sup') ? 'SUPPLIER' : 'CUSTOMER', companyName: 'Co' })), findMany: jest.fn(async () => [{ id: 'admin-1' }]) },
        supportMessage: {
            findMany: jest.fn(async ({ where, take }: any) => msgs.filter((m) => !m.orderId && where.OR.some((c: any) => Object.entries(c).every(([k, v]) => m[k] === v))).slice().reverse().slice(0, take)),
            findFirst: jest.fn(async ({ where }: any) => msgs.filter((m) => (where.senderId === undefined || m.senderId === where.senderId) && (where.receiverId === undefined || m.receiverId === where.receiverId) && (where.isBot === undefined || m.isBot === where.isBot) && (!where.createdAt || m.createdAt > where.createdAt.gt)).slice(-1)[0] ?? null),
            findUnique: jest.fn(async ({ where }: any) => msgs.find((m) => m.id === where.id) ?? null),
            create: jest.fn(async ({ data }: any) => { const m = { id: `m${++n}`, orderId: null, isBot: false, isHandedOver: false, imageUrl: null, createdAt: new Date(Date.now() + n), ...data }; msgs.push(m); return m; }),
            updateMany: jest.fn(async () => ({ count: 1 })),
        },
        notification: { create: jest.fn(async () => ({})) },
    };
    if (opts.handedOver) msgs.push({ id: 'old', senderId: 'buyer-1', receiverId: null, content: 'earlier', isHandedOver: true, isBot: false, orderId: null, createdAt: new Date(0) });
    const context: any = { build: jest.fn(async () => ({ role: 'buyer', areas: ['orders'], facts: 'Buyer orders (1 total): #AB12CD34 SHIPPED', links: [{ label: 'Order #AB12CD34', href: '/dashboard/customer/orders/x-ab12cd34' }] })) };
    const storage: any = { uploadSupportImage: jest.fn(async (uid: string) => `support/${uid}/0123456789abcdef01234567.png`), downloadSupportImage: jest.fn(async () => ({ buffer: Buffer.from('png'), contentType: 'image/png' })) };
    const svc = new SupportAssistantService(prisma, context, storage);
    return { svc, prisma, msgs, context, storage };
}
const buyer = { id: 'buyer-1', role: 'CUSTOMER' };
const reply = (text: string) => jest.fn(async () => ({ data: { choices: [{ message: { content: text } }] } }));

describe('Support assistant — conversation', () => {
    const OLD = process.env.OPENROUTER_API_KEY;
    beforeEach(() => { process.env.OPENROUTER_API_KEY = 'test-key'; });
    afterAll(() => { process.env.OPENROUTER_API_KEY = OLD; });

    it('session: personal greeting name, role-based suggestions, honest availability', async () => {
        const { svc } = setup();
        const s: any = await svc.session({ id: 'sup-1', role: 'SUPPLIER' });
        expect(s.firstName).toBe('Abdelrhman');
        expect(s.suggestions).toContain('Why isn’t my product appearing in the marketplace?');
        expect((await svc.session(buyer) as any).suggestions).toContain('Where is my order?');
        delete process.env.OPENROUTER_API_KEY;
        expect((await svc.session(buyer) as any).assistant.available).toBe(false);
    });
    it('answers with the user\'s facts and real links appended; history is passed', async () => {
        const { svc, msgs } = setup();
        const post = reply('Your order **#AB12CD34** is SHIPPED.');
        (svc as any).complete = ((orig) => (v: any, c: any, h: any, q: any, i: any, hi: any) => orig.call(svc, v, c, h, q, i, hi, post))(svc.complete);
        const r: any = await svc.message(buyer, { content: 'Where is my order?' });
        expect(r.assistantMessage.text).toContain('#AB12CD34');
        expect(r.assistantMessage.text).toMatch(/→ \[Order #AB12CD34\]\(\/dashboard\/customer\/orders\/x-ab12cd34\)$/);
        const body = (post.mock.calls[0] as any)[1];
        expect(body.messages[0].content).toContain('Buyer orders (1 total): #AB12CD34 SHIPPED');
        await svc.message(buyer, { content: 'And when will it arrive?' });
        const second = (post.mock.calls[1] as any)[1].messages;
        expect(second.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'user']); // earlier turn remembered
        expect(second[2].content).not.toContain('→ ['); // link block not fed back
        expect(msgs.filter((m) => m.isBot)).toHaveLength(2);
    });
    it('a provider failure keeps the message, stores NO fake answer, and retry does not duplicate it', async () => {
        const { svc, msgs } = setup();
        const fail = jest.fn(async () => { throw Object.assign(new Error('boom'), { response: { status: 502 } }); });
        (svc as any).complete = ((orig) => (v: any, c: any, h: any, q: any, i: any, hi: any) => orig.call(svc, v, c, h, q, i, hi, fail))(svc.complete);
        const e: any = await svc.message(buyer, { content: 'Where is my order?' }).catch((x) => x);
        expect(e.response.code).toBe('AI_UNAVAILABLE');
        expect(msgs.filter((m) => m.isBot)).toHaveLength(0);
        const userId = e.response.userMessage.id;
        (svc as any).complete = ((orig) => (v: any, c: any, h: any, q: any, i: any, hi: any) => orig.call(svc, v, c, h, q, i, hi, reply('Now it works.')))(SupportAssistantService.prototype.complete);
        const r: any = await svc.retry(buyer, userId);
        expect(r.assistantMessage.text).toContain('Now it works.');
        expect(msgs.filter((m) => !m.isBot && m.senderId === 'buyer-1')).toHaveLength(1);
        const again: any = await svc.retry(buyer, userId); // already answered → same answer, nothing new
        expect(again.assistantMessage.id).toBe(r.assistantMessage.id);
        expect(msgs.filter((m) => m.isBot)).toHaveLength(1);
    });
    it('not configured → clear error, message kept', async () => {
        delete process.env.OPENROUTER_API_KEY;
        const { svc, msgs } = setup();
        const e: any = await svc.message(buyer, { content: 'hi' }).catch((x) => x);
        expect(e.response.code).toBe('AI_NOT_CONFIGURED');
        expect(msgs).toHaveLength(1);
    });
    it('when a person has taken over, the assistant stays quiet and staff are notified', async () => {
        const { svc, context, prisma } = setup({ handedOver: true });
        const r: any = await svc.message(buyer, { content: 'still waiting' });
        expect(r.mode).toBe('team');
        expect(r.assistantMessage).toBeNull();
        expect(context.build).not.toHaveBeenCalled();
        expect(prisma.notification.create).toHaveBeenCalled();
    });
    it('only the sender\'s own screenshot can be attached; it reaches the model as an image', async () => {
        const { svc } = setup();
        const e: any = await svc.message(buyer, { content: 'look', imageUrl: attachmentUrl('support/other-user/0123456789abcdef01234567.png') }).catch((x) => x);
        expect(e.status).toBe(400);
        const post = reply('I can see a checkout error.');
        (svc as any).complete = ((orig) => (v: any, c: any, h: any, q: any, i: any, hi: any) => orig.call(svc, v, c, h, q, i, hi, post))(svc.complete);
        await svc.message(buyer, { content: 'look', imageUrl: attachmentUrl('support/buyer-1/0123456789abcdef01234567.png') });
        const last = (post.mock.calls[0] as any)[1].messages.slice(-1)[0];
        expect(last.content[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from('png').toString('base64')}` } });
        expect((post.mock.calls[0] as any)[1].messages[0].content).toContain('describe only what you can actually see');
    });
    it('screenshots are served to the owner and staff only', async () => {
        const { svc } = setup();
        const file = '0123456789abcdef01234567.png';
        await expect(svc.attachment({ id: 'buyer-2', role: 'CUSTOMER' }, 'buyer-1', file)).rejects.toThrow();
        await expect(svc.attachment(buyer, 'buyer-1', file)).resolves.toBeTruthy();
        await expect(svc.attachment({ id: 'a', role: 'SUPPORT' }, 'buyer-1', file)).resolves.toBeTruthy();
        await expect(svc.attachment(buyer, 'buyer-1', '../../etc/passwd')).rejects.toThrow();
    });
    it('uploads: images only, size-limited, stored under the uploader\'s own folder', async () => {
        const { svc, storage } = setup();
        await expect(svc.upload(buyer, { buffer: Buffer.from('x'), mimetype: 'application/pdf', size: 10 })).rejects.toThrow(/JPEG, PNG or WebP/);
        await expect(svc.upload(buyer, { buffer: Buffer.from('x'), mimetype: 'image/png', size: 7 * 1024 * 1024 })).rejects.toThrow(/6 MB/);
        const r = await svc.upload(buyer, { buffer: Buffer.from('x'), mimetype: 'image/png', size: 10 });
        expect(storage.uploadSupportImage).toHaveBeenCalledWith('buyer-1', expect.any(Buffer), 'image/png');
        expect(r.url).toBe('/api/proxy/support-assistant/attachments/buyer-1/0123456789abcdef01234567.png');
    });
    it('the prompt forbids inventing facts and claiming fixes', () => {
        const p = systemPrompt('supplier', 'F', [], false, false);
        expect(p).toMatch(/Never invent order statuses/);
        expect(p).toMatch(/Never say you fixed/);
        expect(p).toMatch(/buyer prices/);
    });
});

describe('Support context — scoped to the signed-in user', () => {
    it('detects areas and order references (English and Arabic)', () => {
        expect(detectAreas('Why isn’t my product appearing in the marketplace?')).toContain('products');
        expect(detectAreas('ليه السعر غلط')).toContain('pricing');
        expect(detectAreas('فين الطلب بتاعي')).toContain('orders');
        expect(orderRefs('Where is #ab12cd34 and 99887766?')).toEqual(['AB12CD34', '99887766']);
    });
    it('supplier: every product and order query is filtered by that supplier', async () => {
        const prisma: any = {
            user: { findUnique: jest.fn(async () => ({ kycStatus: 'VERIFIED', status: 'ACTIVE' })) },
            product: { findMany: jest.fn(async () => [{ id: 'p1', name: 'Cola 330 ml', status: 'DRAFT', stock: 0, images: [] }]) },
            orderItem: { findMany: jest.fn(async () => []) },
        };
        const ctx = await new SupportContextService(prisma, {} as any, {} as any).build({ id: 'sup-1', role: 'SUPPLIER' }, 'Why is my product not live and where are my orders?');
        expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ supplierId: 'sup-1' });
        expect(prisma.orderItem.findMany.mock.calls[0][0].where).toEqual({ product: { supplierId: 'sup-1' } });
        expect(ctx.facts).toMatch(/Not live: "Cola 330 ml" — DRAFT/);
        expect(ctx.facts).not.toMatch(/markup|buyer price/i);
    });
    it('buyer: orders are filtered by that buyer', async () => {
        const prisma: any = { user: { findUnique: jest.fn(async () => ({ status: 'ACTIVE' })) }, order: { findMany: jest.fn(async () => []) } };
        const ctx = await new SupportContextService(prisma, {} as any, {} as any).build({ id: 'buyer-1', role: 'CUSTOMER' }, 'Where is my order #ab12cd34?');
        expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ customerId: 'buyer-1', deletedByCustomer: false });
        expect(ctx.facts).toMatch(/No order of this buyer matches #AB12CD34/);
    });
});

describe('Order threads', () => {
    const svc = (order: any, supplies = 0, extra: any = {}) => new ChatService({ order: { findUnique: jest.fn(async () => order) }, orderItem: { count: jest.fn(async () => supplies) }, ...extra } as any, {} as any);
    const o = { id: 'o1', customerId: 'b1', supplierId: null };
    it('each participant gets only their own thread; outsiders get none', async () => {
        await expect(svc(o).resolveOrderThread('o1', 'b1', 'CUSTOMER')).resolves.toMatchObject({ partyId: 'b1', kind: 'buyer', isStaff: false });
        await expect(svc(o).resolveOrderThread('o1', 'b2', 'CUSTOMER')).rejects.toThrow('Not your order.');
        await expect(svc(o, 1).resolveOrderThread('o1', 's1', 'SUPPLIER')).resolves.toMatchObject({ partyId: 's1', kind: 'supplier' });
        await expect(svc(o, 0).resolveOrderThread('o1', 's9', 'SUPPLIER')).rejects.toThrow('Not your order.');
        // a non-staff caller can't pick someone else's thread
        await expect(svc(o, 1).resolveOrderThread('o1', 's1', 'SUPPLIER', 'b1')).resolves.toMatchObject({ partyId: 's1' });
    });
    it('staff default to the buyer thread and may open a supplier thread on the order', async () => {
        await expect(svc(o).resolveOrderThread('o1', 'x', 'SUPPORT')).resolves.toMatchObject({ partyId: 'b1', kind: 'buyer', isStaff: true });
        await expect(svc(o, 1).resolveOrderThread('o1', 'x', 'ADMIN', 's1')).resolves.toMatchObject({ partyId: 's1', kind: 'supplier' });
        await expect(svc(o, 0).resolveOrderThread('o1', 'x', 'ADMIN', 'stranger')).rejects.toThrow(/isn’t a buyer or supplier/);
    });
    it('a supplier never reads the buyer thread, and the buyer never reads a supplier thread', async () => {
        const findMany = jest.fn(async (_args: any) => [] as any[]);
        const s = svc(o, 1, { supportMessage: { findMany } });
        await s.getOrderMessages('o1', await s.resolveOrderThread('o1', 's1', 'SUPPLIER'));
        expect((findMany.mock.calls[0] as any)[0].where).toEqual({ orderId: 'o1', partyId: 's1' });
        await s.getOrderMessages('o1', await s.resolveOrderThread('o1', 'b1', 'CUSTOMER'));
        expect((findMany.mock.calls[1] as any)[0].where).toEqual({ orderId: 'o1', OR: [{ partyId: null }, { partyId: 'b1' }] });
    });
    it('messages are stored in the sender’s thread and must have content', async () => {
        const create = jest.fn(async ({ data }: any) => ({ ...data, sender: { name: 'S' } }));
        const s = svc(o, 1, { supportMessage: { create }, user: { findMany: jest.fn(async () => []) }, notification: { create: jest.fn(async () => ({})) } });
        const t = await s.resolveOrderThread('o1', 's1', 'SUPPLIER');
        await expect(s.sendOrderMessage('s1', 'o1', '   ', t)).rejects.toThrow('Write a message first.');
        await s.sendOrderMessage('s1', 'o1', ' Stock ready on Friday ', t);
        expect(create.mock.calls[0][0].data).toMatchObject({ orderId: 'o1', partyId: 's1', content: 'Stock ready on Friday' });
    });
});
