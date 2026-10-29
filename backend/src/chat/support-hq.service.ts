import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ChatService } from './chat.service';
import {
    ALL_ACCESS_ROLES, HQ_ROLES, KYC_REVIEW_ROLES, ORDER_THREAD_ROLES, TEAMS, ACTIVE_DAYS, FIRST_RESPONSE_DAYS,
    HqMessage, ThreadSummary, average, firstResponseSamples, generalAuthor, groupGeneral, groupOrders, isActive,
    orderAuthor, summarizeGeneral, summarizeOrder, upper, visibleGeneral,
} from './support-hq';

const MSG_SELECT = {
    id: true, senderId: true, receiverId: true, orderId: true, partyId: true, content: true, imageUrl: true,
    isRead: true, isBot: true, assignedTeam: true, isHandedOver: true, handedOverBy: true, createdAt: true,
    sender: { select: { name: true, role: true } },
} as const;
const PERSON = { id: true, name: true, companyName: true, email: true, role: true, status: true, kycStatus: true, country: true, avatar: true, createdAt: true } as const;
/** Newest rows read for the inbox; older conversations beyond this are reported as truncated, not hidden silently. */
const INBOX_ROWS = 5000;
const THREAD_ROWS = 500;

type Viewer = { id: string; role: string };

/** Only image links the app itself serves (support attachments) or legacy inline images. */
const safeImage = (u: string | null) => (u && (/^\/api\/proxy\/support-assistant\/attachments\//.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)) ? u : null);

/**
 * Support HQ for staff: one inbox over general support and order conversations,
 * one thread view (with the participant and, for order conversations, the
 * order), real stats, and routing / take-over. Read rules mirror ChatService:
 * ADMIN, SUPPORT and OWNER see every general conversation; DEVELOPER and
 * LOGISTICS only those routed to their team; order conversations follow the
 * existing order-chat list roles. Nothing here changes an order.
 */
@Injectable()
export class SupportHqService {
    constructor(private readonly prisma: PrismaService, private readonly chat: ChatService) {}

    private assertHq(role: string) {
        if (!HQ_ROLES.includes(upper(role))) throw new ForbiddenException('Support HQ is for the Ali FMCG support team.');
    }

    private async loadThreads(role: string) {
        const r = upper(role);
        const general = await this.prisma.supportMessage.findMany({ where: { orderId: null }, orderBy: { createdAt: 'desc' }, take: INBOX_ROWS, select: MSG_SELECT }) as unknown as HqMessage[];
        const threads: { summary: ThreadSummary; msgs: HqMessage[] }[] = [];
        for (const [participantId, msgs] of groupGeneral(general)) {
            if (!visibleGeneral(r, msgs)) continue;
            const summary = summarizeGeneral(participantId, msgs);
            if (summary) threads.push({ summary, msgs });
        }
        let orderRows: HqMessage[] = [];
        if (ORDER_THREAD_ROLES.includes(r)) {
            orderRows = await this.prisma.supportMessage.findMany({ where: { orderId: { not: null } }, orderBy: { createdAt: 'desc' }, take: INBOX_ROWS, select: MSG_SELECT }) as unknown as HqMessage[];
            const orderIds = [...new Set(orderRows.map((m) => m.orderId as string))];
            const orders = orderIds.length ? await this.prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, customerId: true } }) : [];
            const buyerOf = new Map(orders.map((o) => [o.id, o.customerId]));
            for (const { orderId, participantId, msgs } of groupOrders(orderRows, buyerOf).values()) {
                const summary = summarizeOrder(orderId, participantId, msgs);
                if (summary) threads.push({ summary, msgs });
            }
        }
        return { threads, truncated: general.length >= INBOX_ROWS || orderRows.length >= INBOX_ROWS };
    }

    /** Every conversation the viewer may see, newest first, with participant and order references. */
    async inbox(viewer: Viewer) {
        this.assertHq(viewer.role);
        const { threads, truncated } = await this.loadThreads(viewer.role);
        const ids = new Set<string>();
        for (const { summary } of threads) { ids.add(summary.participantId); if (summary.handedOverBy) ids.add(summary.handedOverBy); }
        const people = ids.size ? await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, companyName: true, email: true, role: true } }) : [];
        const who = new Map(people.map((p) => [p.id, p]));
        const orderIds = [...new Set(threads.map((t) => t.summary.orderId).filter(Boolean) as string[])];
        const orders = orderIds.length ? await this.prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, status: true, customerId: true } }) : [];
        const orderBy = new Map(orders.map((o) => [o.id, o]));
        const rows = threads
            .map(({ summary: s }) => {
                const p = who.get(s.participantId);
                const o = s.orderId ? orderBy.get(s.orderId) : null;
                const by = s.handedOverBy ? who.get(s.handedOverBy) : null;
                return {
                    ...s,
                    participant: p ? { id: p.id, name: p.name, companyName: p.companyName, email: p.email, role: p.role } : { id: s.participantId, name: null, companyName: null, email: null, role: null },
                    partyKind: s.kind === 'order' ? (o && o.customerId === s.participantId ? 'buyer' : 'supplier') : null,
                    order: o ? { id: o.id, status: o.status } : null,
                    handedOverByName: by?.name ?? null,
                };
            })
            .sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
        return { threads: rows, truncated, canAssign: ALL_ACCESS_ROLES.includes(upper(viewer.role)), ordersVisible: ORDER_THREAD_ROLES.includes(upper(viewer.role)) };
    }

    /** Overview figures. Each one is computed from stored rows; what can't be computed is returned as unavailable with a reason. */
    async stats(viewer: Viewer, now = Date.now()) {
        this.assertHq(viewer.role);
        const r = upper(viewer.role);
        const { threads, truncated } = await this.loadThreads(r);
        const support = threads.filter((t) => t.summary.kind === 'support');
        const order = threads.filter((t) => t.summary.kind === 'order');
        const [openDisputes, underReview] = await Promise.all([
            this.prisma.dispute.count({ where: { status: 'OPEN' as any } }),
            this.prisma.dispute.count({ where: { status: 'UNDER_REVIEW' as any } }),
        ]);
        const kycPending = KYC_REVIEW_ROLES.includes(r) ? await this.prisma.kYCDocument.count({ where: { status: 'PENDING' as any } }) : null;
        const samples = ORDER_THREAD_ROLES.includes(r) ? firstResponseSamples(order.map((t) => t.msgs), now) : [];
        return {
            openDisputes, disputesUnderReview: underReview,
            awaitingTeam: { total: threads.filter((t) => t.summary.awaitingTeam).length, support: support.filter((t) => t.summary.awaitingTeam).length, order: order.filter((t) => t.summary.awaitingTeam).length },
            takenOver: support.filter((t) => t.summary.state === 'taken_over').length,
            active: { total: threads.filter((t) => isActive(t.summary, now)).length, support: support.filter((t) => isActive(t.summary, now)).length, order: order.filter((t) => isActive(t.summary, now)).length, days: ACTIVE_DAYS },
            kycPending: kycPending === null ? { available: false as const, reason: 'role' as const } : { available: true as const, count: kycPending },
            firstResponse: !ORDER_THREAD_ROLES.includes(r)
                ? { available: false as const, reason: 'role' as const }
                : samples.length
                    ? { available: true as const, averageMs: average(samples) as number, samples: samples.length, days: FIRST_RESPONSE_DAYS, scope: 'order' as const }
                    : { available: false as const, reason: 'noSamples' as const, days: FIRST_RESPONSE_DAYS },
            truncated,
            generatedAt: new Date(now).toISOString(),
        };
    }

    private async person(userId: string) {
        const p = await this.prisma.user.findUnique({ where: { id: userId }, select: PERSON });
        if (!p) throw new NotFoundException('That user doesn’t exist.');
        return p;
    }

    /** One conversation: the participant, the messages, the routing history, and the order for order conversations. */
    async thread(viewer: Viewer, userId: string, orderId?: string | null) {
        this.assertHq(viewer.role);
        if (!userId) throw new BadRequestException('Choose a user.');
        if (orderId) return this.orderThread(viewer, userId, orderId);
        await this.chat.assertAccessGeneral(viewer.role, userId);
        const participant = await this.person(userId);
        const rows = (await this.prisma.supportMessage.findMany({
            where: { orderId: null, OR: [{ senderId: userId, receiverId: null }, { receiverId: userId }] },
            orderBy: { createdAt: 'desc' }, take: THREAD_ROWS, select: MSG_SELECT,
        }) as unknown as HqMessage[]).reverse();
        const summary = summarizeGeneral(userId, rows);
        const log = await this.prisma.adminActionLog.findMany({
            where: { entityType: 'SupportConversation', entityId: userId },
            orderBy: { createdAt: 'desc' }, take: 50,
            select: { id: true, action: true, details: true, createdAt: true, admin: { select: { id: true, name: true } } },
        });
        const takenBy = summary?.handedOverBy ? await this.prisma.user.findUnique({ where: { id: summary.handedOverBy }, select: { id: true, name: true } }) : null;
        return {
            kind: 'support' as const,
            participant,
            messages: rows.map((m) => ({ id: m.id, from: generalAuthor(m, userId), senderName: m.sender?.name ?? null, content: m.content, imageUrl: safeImage(m.imageUrl), isRead: m.isRead, createdAt: m.createdAt, assignedTeam: m.assignedTeam })),
            state: summary ? { state: summary.state, assignedTeam: summary.assignedTeam, awaitingTeam: summary.awaitingTeam, takenOverBy: takenBy, participantMessages: summary.participantMessages } : { state: 'assistant' as const, assignedTeam: null, awaitingTeam: false, takenOverBy: null, participantMessages: 0 },
            history: log.map((l) => ({ id: l.id, action: l.action, details: l.details, createdAt: l.createdAt, by: l.admin })),
            truncated: rows.length >= THREAD_ROWS,
            can: { reply: true, assign: ALL_ACCESS_ROLES.includes(upper(viewer.role)), takeOver: (summary?.participantMessages ?? 0) > 0 },
            order: null,
        };
    }

    private async orderThread(viewer: Viewer, userId: string, orderId: string) {
        if (!ORDER_THREAD_ROLES.includes(upper(viewer.role))) throw new ForbiddenException('Order conversations aren’t available to your role.');
        // Verifies the order exists and that this user is its buyer or a supplier on it.
        const thread = await this.chat.resolveOrderThread(orderId, viewer.id, viewer.role, userId);
        const participant = await this.person(thread.partyId);
        const messages = await this.chat.getOrderMessages(orderId, thread) as any[];
        const order: any = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true, status: true, reviewStatus: true, paymentStatus: true, createdAt: true, supplierId: true,
                customer: { select: { id: true, name: true, companyName: true } },
                items: { select: { id: true, quantity: true, selectedTier: true, productNameSnapshot: true, product: { select: { name: true, supplierId: true } } } },
            },
        });
        const rows = messages.map((m) => ({ ...m, sender: m.sender })) as HqMessage[];
        const summary = summarizeOrder(orderId, thread.partyId, rows);
        return {
            kind: 'order' as const,
            participant,
            partyKind: thread.kind,
            messages: rows.map((m) => ({ id: m.id, from: orderAuthor(m), senderName: m.sender?.name ?? null, content: m.content, imageUrl: safeImage(m.imageUrl), isRead: m.isRead, createdAt: m.createdAt, assignedTeam: null })),
            state: { state: 'order' as const, assignedTeam: null, awaitingTeam: !!summary?.awaitingTeam, takenOverBy: null, participantMessages: summary?.participantMessages ?? 0 },
            history: [],
            truncated: false,
            can: { reply: true, assign: false, takeOver: false },
            order: order && {
                id: order.id, status: order.status, reviewStatus: order.reviewStatus, paymentStatus: order.paymentStatus, createdAt: order.createdAt,
                buyer: order.customer,
                // Names and quantities only; prices stay on the order page.
                lines: order.items.map((i: any) => ({
                    id: i.id, name: i.product?.name ?? i.productNameSnapshot ?? null, quantity: i.quantity, unit: i.selectedTier ?? null,
                    fromParty: thread.kind === 'supplier' ? (i.product?.supplierId === thread.partyId || (!i.product && order.supplierId === thread.partyId)) : null,
                })),
            },
        };
    }

    private async participantMessages(userId: string) {
        return this.prisma.supportMessage.count({ where: { senderId: userId, receiverId: null, orderId: null } });
    }

    /** Route a general conversation to a team (ADMIN, SUPPORT, OWNER). Recorded in the admin action log; messages are kept. */
    async assignTeam(viewer: Viewer, userId: string, teamIn: string) {
        if (!ALL_ACCESS_ROLES.includes(upper(viewer.role))) throw new ForbiddenException('Only admins and the support team can route conversations.');
        const team = upper(teamIn);
        if (!(TEAMS as readonly string[]).includes(team)) throw new BadRequestException(`Choose one of: ${TEAMS.join(', ')}.`);
        const participant = await this.person(userId);
        if (!(await this.participantMessages(userId))) throw new BadRequestException('This user hasn’t written to support yet, so there is nothing to route.');
        const previous = (await this.prisma.supportMessage.findFirst({ where: { orderId: null, assignedTeam: { not: null }, OR: [{ senderId: userId, receiverId: null }, { receiverId: userId }] }, orderBy: { createdAt: 'desc' }, select: { assignedTeam: true } }))?.assignedTeam ?? null;
        if (previous === team) return { ok: true, team, changed: false };
        const updated = await this.prisma.supportMessage.updateMany({ where: { senderId: userId, receiverId: null, orderId: null }, data: { assignedTeam: team } });
        const entry = await this.prisma.adminActionLog.create({ data: { adminId: viewer.id, action: 'SUPPORT_ASSIGN_TEAM', entityType: 'SupportConversation', entityId: userId, details: { team, previous } as any } });
        // Tell that team's members (not the person who routed it). Same persisted notification the rest of chat uses.
        const members = await this.prisma.user.findMany({ where: { role: team as any, id: { not: viewer.id } }, select: { id: true }, take: 50 });
        const name = participant.companyName || participant.name;
        await Promise.all(members.map((m) => this.prisma.notification.create({
            data: {
                userId: m.id, type: 'INFO', title: 'Support conversation routed to your team',
                message: `${name}'s support conversation was routed to ${team}.`,
                data: { kind: 'SUPPORT_ROUTED', params: { name, team }, userId, link: `/admin/support?view=chat&user=${encodeURIComponent(userId)}`, dedupeKey: `support.routed:${entry.id}` } as any,
            },
        }).catch(() => null)));
        return { ok: true, team, changed: true, messagesUpdated: updated.count, notified: members.length };
    }

    /** A person takes over (the assistant stops answering this user). Uses the existing hand-over; recorded in the admin action log. */
    async takeOver(viewer: Viewer, userId: string) {
        this.assertHq(viewer.role);
        await this.chat.assertAccessGeneral(viewer.role, userId);
        await this.person(userId);
        if (!(await this.participantMessages(userId))) throw new BadRequestException('This user hasn’t written to support yet. Send a message; you can take over once they reply.');
        const res = await this.chat.switchToHuman(userId, viewer.id);
        await this.prisma.adminActionLog.create({ data: { adminId: viewer.id, action: 'SUPPORT_TAKE_OVER', entityType: 'SupportConversation', entityId: userId, details: {} as any } });
        return res;
    }

    /** Hand the conversation back to the assistant. Uses the existing switch; recorded in the admin action log. */
    async handBack(viewer: Viewer, userId: string) {
        this.assertHq(viewer.role);
        await this.chat.assertAccessGeneral(viewer.role, userId);
        await this.person(userId);
        const last = await this.prisma.supportMessage.findFirst({ where: { senderId: userId, receiverId: null, orderId: null }, orderBy: { createdAt: 'desc' }, select: { isHandedOver: true } });
        if (!last?.isHandedOver) throw new BadRequestException('No one has taken over this conversation; the assistant is already answering.');
        const res = await this.chat.switchToAI(userId, viewer.id);
        await this.prisma.adminActionLog.create({ data: { adminId: viewer.id, action: 'SUPPORT_HAND_BACK', entityType: 'SupportConversation', entityId: userId, details: {} as any } });
        return res;
    }
}
