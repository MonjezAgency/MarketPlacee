import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from '../chat.service';
import { SupportHqService } from '../support-hq.service';
import { firstResponseSamples, summarizeGeneral, summarizeOrder, visibleGeneral, HqMessage } from '../support-hq';

const T0 = Date.UTC(2026, 9, 20, 9, 0, 0);
let seq = 0;
const msg = (p: Partial<HqMessage> & { at: number; role?: string }): HqMessage => ({
    id: `m${++seq}`, senderId: 'u1', receiverId: null, orderId: null, partyId: null, content: 'hi', imageUrl: null, isRead: false, isBot: false,
    assignedTeam: null, isHandedOver: false, handedOverBy: null, createdAt: new Date(p.at), sender: { role: p.role ?? 'CUSTOMER', name: 'X' }, ...p,
});
const min = 60_000;

describe('Support HQ — conversation rules', () => {
    it('a conversation the assistant answers is "assistant", nobody is waiting', () => {
        const s = summarizeGeneral('u1', [msg({ at: T0 }), msg({ at: T0 + min, isBot: true, receiverId: 'u1' })])!;
        expect(s.state).toBe('assistant');
        expect(s.awaitingTeam).toBe(false);
        expect(s.unread).toBe(1);
        expect(s.lastFrom).toBe('assistant');
    });

    it('routed to a team and unanswered → waiting for the team; a staff reply clears it', () => {
        const rows = [msg({ at: T0, assignedTeam: 'SUPPORT' })];
        expect(summarizeGeneral('u1', rows)).toMatchObject({ state: 'assigned', assignedTeam: 'SUPPORT', awaitingTeam: true });
        rows.push(msg({ at: T0 + 5 * min, senderId: 'staff', receiverId: 'u1', role: 'SUPPORT' }));
        expect(summarizeGeneral('u1', rows)).toMatchObject({ state: 'assigned', awaitingTeam: false, lastFrom: 'team' });
    });

    it('taken over follows the user’s latest message (the same rule the assistant uses)', () => {
        const s = summarizeGeneral('u1', [msg({ at: T0, isHandedOver: true, handedOverBy: 'agent-1' })])!;
        expect(s).toMatchObject({ state: 'taken_over', handedOverBy: 'agent-1', awaitingTeam: true });
    });

    it('order conversations wait for the team when the participant wrote last', () => {
        const s = summarizeOrder('o1', 'u1', [msg({ at: T0, orderId: 'o1', senderId: 'staff', role: 'ADMIN' }), msg({ at: T0 + min, orderId: 'o1' })])!;
        expect(s).toMatchObject({ kind: 'order', state: 'order', awaitingTeam: true, lastFrom: 'participant' });
    });

    it('developers and logistics see only conversations routed to their team', () => {
        const routed = [msg({ at: T0, assignedTeam: 'DEVELOPER' })];
        expect(visibleGeneral('ADMIN', routed)).toBe(true);
        expect(visibleGeneral('DEVELOPER', routed)).toBe(true);
        expect(visibleGeneral('LOGISTICS', routed)).toBe(false);
        expect(visibleGeneral('CUSTOMER', routed)).toBe(false);
    });

    it('first response: participant turn → next team reply, only in the window, unanswered turns ignored', () => {
        const now = T0 + 60 * min;
        const a = [msg({ at: T0, orderId: 'o1' }), msg({ at: T0 + min, orderId: 'o1' }), msg({ at: T0 + 10 * min, orderId: 'o1', senderId: 's', role: 'SUPPORT' }), msg({ at: T0 + 20 * min, orderId: 'o1' })];
        expect(firstResponseSamples([a], now)).toEqual([10 * min]);
        expect(firstResponseSamples([a], now + 40 * 86_400_000)).toEqual([]);
    });
});

/** Minimal in-memory prisma for the service. */
function setup(opts: { messages?: any[]; order?: any; items?: number } = {}) {
    const messages: any[] = opts.messages ?? [];
    const logs: any[] = [];
    const users: Record<string, any> = {
        u1: { id: 'u1', name: 'Buyer One', companyName: 'Buyer Co', email: 'b@x.test', role: 'CUSTOMER', status: 'ACTIVE', kycStatus: 'VERIFIED', country: 'RO', avatar: null, createdAt: new Date(T0) },
        s1: { id: 's1', name: 'Supplier One', companyName: 'Sup Co', email: 's@x.test', role: 'SUPPLIER', status: 'ACTIVE', kycStatus: 'VERIFIED', country: 'DE', avatar: null, createdAt: new Date(T0) },
        x9: { id: 'x9', name: 'Stranger', companyName: null, email: 'x@x.test', role: 'CUSTOMER', status: 'ACTIVE', kycStatus: 'UNVERIFIED', country: null, avatar: null, createdAt: new Date(T0) },
    };
    const matches = (m: any, w: any): boolean => Object.entries(w || {}).every(([k, v]: any) => {
        if (k === 'OR') return v.some((c: any) => matches(m, c));
        if (v && typeof v === 'object' && 'not' in v) return m[k] !== v.not;
        if (v && typeof v === 'object' && 'in' in v) return v.in.includes(m[k]);
        return (m[k] ?? null) === v;
    });
    const prisma: any = {
        supportMessage: {
            findMany: jest.fn(async ({ where, orderBy }: any) => { const r = messages.filter((m) => matches(m, where)); return orderBy?.createdAt === 'desc' ? r.slice().reverse() : r; }),
            findFirst: jest.fn(async ({ where }: any) => messages.filter((m) => matches(m, where)).slice(-1)[0] ?? null),
            count: jest.fn(async ({ where }: any) => messages.filter((m) => matches(m, where)).length),
            updateMany: jest.fn(async ({ where, data }: any) => { const hit = messages.filter((m) => matches(m, where)); hit.forEach((m) => Object.assign(m, data)); return { count: hit.length }; }),
            create: jest.fn(async ({ data }: any) => { const m = { id: `n${messages.length}`, createdAt: new Date(), ...data }; messages.push(m); return m; }),
        },
        user: {
            findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null),
            findMany: jest.fn(async ({ where }: any) => Object.values(users).filter((u: any) => !where?.id?.in || where.id.in.includes(u.id))),
        },
        order: {
            findUnique: jest.fn(async () => opts.order ?? null),
            findMany: jest.fn(async () => (opts.order ? [opts.order] : [])),
        },
        orderItem: { count: jest.fn(async () => opts.items ?? 0) },
        dispute: { count: jest.fn(async ({ where }: any) => (where.status === 'OPEN' ? 2 : 1)) },
        kYCDocument: { count: jest.fn(async () => 3) },
        adminActionLog: { create: jest.fn(async ({ data }: any) => { const l = { id: `l${logs.length}`, ...data }; logs.push(l); return l; }), findMany: jest.fn(async () => []) },
        notification: { create: jest.fn(async () => ({})) },
    };
    const chat = new ChatService(prisma, { getResponse: jest.fn() } as any);
    return { hq: new SupportHqService(prisma, chat), chat, prisma, messages, logs };
}

const order = { id: 'order-1', customerId: 'u1', supplierId: null, status: 'PENDING', reviewStatus: 'PENDING_SUPPLIERS', paymentStatus: 'UNPAID', createdAt: new Date(T0), customer: { id: 'u1', name: 'Buyer One', companyName: 'Buyer Co' }, items: [{ id: 'i1', quantity: 3, selectedTier: 'case', productNameSnapshot: null, product: { name: 'Cola', supplierId: 's1' } }] };

describe('Support HQ — access and deep links', () => {
    it('only support staff may open Support HQ', async () => {
        const { hq } = setup();
        await expect(hq.inbox({ id: 'u1', role: 'CUSTOMER' })).rejects.toBeInstanceOf(ForbiddenException);
        await expect(hq.stats({ id: 's1', role: 'SUPPLIER' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('order deep link opens that order’s thread with the buyer or a supplier on it', async () => {
        const { hq } = setup({ order, items: 1, messages: [msg({ at: T0, orderId: 'order-1', senderId: 'u1', partyId: null })] });
        const buyer: any = await hq.thread({ id: 'a1', role: 'ADMIN' }, 'u1', 'order-1');
        expect(buyer).toMatchObject({ kind: 'order', partyKind: 'buyer', participant: { id: 'u1' } });
        expect(buyer.order).toMatchObject({ id: 'order-1', status: 'PENDING' });
        const sup: any = await hq.thread({ id: 'a1', role: 'SUPPORT' }, 's1', 'order-1');
        expect(sup).toMatchObject({ kind: 'order', partyKind: 'supplier', participant: { id: 's1' } });
        expect(sup.order.lines[0]).toMatchObject({ name: 'Cola', quantity: 3, fromParty: true });
    });

    it('order deep link with someone who is not on the order is refused', async () => {
        const { hq } = setup({ order, items: 0 });
        await expect(hq.thread({ id: 'a1', role: 'ADMIN' }, 'x9', 'order-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('order conversations are refused to roles that can’t list them', async () => {
        const { hq } = setup({ order, items: 1 });
        await expect(hq.thread({ id: 'd1', role: 'DEVELOPER' }, 'u1', 'order-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('general deep link opens the user’s conversation, or an empty one ready to start; unknown users are 404', async () => {
        const { hq } = setup({ messages: [msg({ at: T0 }), msg({ at: T0 + min, senderId: 'staff', receiverId: 'u1', role: 'SUPPORT' })] });
        const t: any = await hq.thread({ id: 'a1', role: 'ADMIN' }, 'u1');
        expect(t.kind).toBe('support');
        expect(t.messages.map((m: any) => m.from)).toEqual(['participant', 'team']);
        const empty: any = await hq.thread({ id: 'a1', role: 'ADMIN' }, 's1');
        expect(empty.messages).toEqual([]);
        expect(empty.can.takeOver).toBe(false);
        await expect(hq.thread({ id: 'a1', role: 'ADMIN' }, 'nobody')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('developers can open only conversations routed to their team', async () => {
        const { hq } = setup({ messages: [msg({ at: T0 })] });
        await expect(hq.thread({ id: 'd1', role: 'DEVELOPER' }, 'u1')).rejects.toBeInstanceOf(ForbiddenException);
        const routed = setup({ messages: [msg({ at: T0, assignedTeam: 'DEVELOPER' })] });
        await expect(routed.hq.thread({ id: 'd1', role: 'DEVELOPER' }, 'u1')).resolves.toMatchObject({ kind: 'support' });
    });
});

describe('Support HQ — routing and take-over', () => {
    it('admins and support route a conversation to a team; it is logged and the team is told', async () => {
        const { hq, messages, logs, prisma } = setup({ messages: [msg({ at: T0 })] });
        const res = await hq.assignTeam({ id: 'a1', role: 'SUPPORT' }, 'u1', 'logistics');
        expect(res).toMatchObject({ ok: true, team: 'LOGISTICS', changed: true });
        expect(messages[0].assignedTeam).toBe('LOGISTICS');
        expect(logs[0]).toMatchObject({ adminId: 'a1', action: 'SUPPORT_ASSIGN_TEAM', entityId: 'u1', details: { team: 'LOGISTICS', previous: null } });
        expect(prisma.notification.create.mock.calls[0][0].data.data).toMatchObject({ kind: 'SUPPORT_ROUTED', params: { team: 'LOGISTICS' }, userId: 'u1' });
    });

    it('other roles can’t route, unknown teams are rejected, nothing to route is rejected', async () => {
        const { hq } = setup({ messages: [msg({ at: T0, assignedTeam: 'DEVELOPER' })] });
        await expect(hq.assignTeam({ id: 'd1', role: 'DEVELOPER' }, 'u1', 'SUPPORT')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(hq.assignTeam({ id: 'a1', role: 'ADMIN' }, 'u1', 'FINANCE')).rejects.toBeInstanceOf(BadRequestException);
        await expect(hq.assignTeam({ id: 'a1', role: 'ADMIN' }, 's1', 'SUPPORT')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('take over marks the user’s general messages only (not their order messages) and logs who', async () => {
        const { hq, messages, logs } = setup({ messages: [msg({ at: T0 }), msg({ at: T0 + 1, orderId: 'order-1' })] });
        await hq.takeOver({ id: 'a1', role: 'ADMIN' }, 'u1');
        expect(messages[0]).toMatchObject({ isHandedOver: true, handedOverBy: 'a1' });
        expect(messages[1].isHandedOver).toBe(false);
        expect(logs[0]).toMatchObject({ action: 'SUPPORT_TAKE_OVER', adminId: 'a1' });
        await hq.handBack({ id: 'a1', role: 'ADMIN' }, 'u1');
        expect(messages[0].isHandedOver).toBe(false);
        await expect(hq.handBack({ id: 'a1', role: 'ADMIN' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('take over is refused for a developer on a conversation not routed to them', async () => {
        const { hq } = setup({ messages: [msg({ at: T0 })] });
        await expect(hq.takeOver({ id: 'd1', role: 'DEVELOPER' }, 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('Support HQ — stats', () => {
    it('figures come from rows; KYC only for reviewers; response time only when measurable', async () => {
        const now = Date.now();
        const rows = [
            msg({ at: now - 60 * min, assignedTeam: 'SUPPORT' }),
            msg({ at: now - 50 * min, orderId: 'order-1', senderId: 'u1' }),
            msg({ at: now - 40 * min, orderId: 'order-1', senderId: 'a1', role: 'ADMIN' }),
        ];
        const { hq } = setup({ messages: rows, order });
        const s: any = await hq.stats({ id: 'a1', role: 'SUPPORT' }, now);
        expect(s.openDisputes).toBe(2);
        expect(s.awaitingTeam).toEqual({ total: 1, support: 1, order: 0 });
        expect(s.active).toMatchObject({ total: 2, days: 7 });
        expect(s.kycPending).toEqual({ available: false, reason: 'role' });
        expect(s.firstResponse).toMatchObject({ available: true, averageMs: 10 * min, samples: 1 });
        const admin: any = await hq.stats({ id: 'a1', role: 'ADMIN' }, now);
        expect(admin.kycPending).toEqual({ available: true, count: 3 });
        const empty: any = await setup().hq.stats({ id: 'a1', role: 'ADMIN' }, now);
        expect(empty.firstResponse).toMatchObject({ available: false, reason: 'noSamples' });
    });
});

describe('Chat send', () => {
    it('staff can’t write to a user that doesn’t exist, and empty messages are refused', async () => {
        const { chat } = setup();
        await expect(chat.sendMessage('a1', { content: 'hello', receiverId: 'nobody' })).rejects.toBeInstanceOf(NotFoundException);
        await expect(chat.sendMessage('a1', { content: '   ', receiverId: 'u1' })).rejects.toBeInstanceOf(BadRequestException);
    });
});
