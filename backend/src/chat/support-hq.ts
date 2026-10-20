/**
 * Support HQ read model: pure rules over SupportMessage rows (no DB here, so
 * every rule is unit-tested in __tests__/support-hq.spec.ts).
 *
 * Two kinds of conversation exist in the data:
 *  • general support — one per user: their messages (receiverId null, orderId null),
 *    assistant replies (isBot, receiverId = user) and staff replies (receiverId = user);
 *  • order conversations — one per order and participant (the buyer, or one
 *    supplier on the order); partyId null = the buyer. No assistant answers there.
 *
 * States the data supports: assistant (bot) answering, routed to a team
 * (assignedTeam), taken over by a person (isHandedOver / handedOverBy), and
 * "waiting for the team" (the participant wrote last). "Resolved" is not
 * recorded anywhere, so it is never reported.
 */

export const STAFF_ROLES = ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];
/** Roles that may open Support HQ (the same roles as the existing chat admin endpoints). */
export const HQ_ROLES = ['ADMIN', 'SUPPORT', 'DEVELOPER', 'LOGISTICS', 'OWNER'];
/** Roles that see every general conversation and may route one to a team. */
export const ALL_ACCESS_ROLES = ['ADMIN', 'SUPPORT', 'OWNER'];
/** Roles that see order conversations (the same roles as GET /chat/admin/order-chats). */
export const ORDER_THREAD_ROLES = ['ADMIN', 'SUPPORT', 'OWNER', 'LOGISTICS'];
/** Roles that review KYC documents (GET /kyc/admin/pending). */
export const KYC_REVIEW_ROLES = ['OWNER', 'ADMIN', 'MODERATOR'];
/** Team values already stored in assignedTeam (assistant routing and "ask the team"). */
export const TEAMS = ['SUPPORT', 'DEVELOPER', 'LOGISTICS'] as const;
export type Team = (typeof TEAMS)[number];

export const ACTIVE_DAYS = 7;
export const FIRST_RESPONSE_DAYS = 30;
const DAY = 86_400_000;

export const isStaffRole = (role?: string | null) => STAFF_ROLES.includes(String(role || '').toUpperCase());
export const upper = (r?: string | null) => String(r || '').toUpperCase();

export interface HqMessage {
    id: string; senderId: string; receiverId: string | null; orderId: string | null; partyId: string | null;
    content: string | null; imageUrl: string | null; isRead: boolean; isBot: boolean;
    assignedTeam: string | null; isHandedOver: boolean; handedOverBy: string | null; createdAt: Date;
    sender?: { role?: string | null; name?: string | null } | null;
}

export type Author = 'participant' | 'assistant' | 'team';

/** Who wrote a message of a general conversation with `participantId`. */
export function generalAuthor(m: HqMessage, participantId: string): Author {
    if (m.isBot) return 'assistant';
    if (m.senderId === participantId && m.receiverId === null) return 'participant';
    return 'team';
}

/** Who wrote a message of an order conversation (staff = team, anyone else = the participant). */
export function orderAuthor(m: HqMessage): Author {
    return isStaffRole(m.sender?.role) ? 'team' : 'participant';
}

/** The participant of a general-conversation message. */
export const generalParticipant = (m: HqMessage) => (m.receiverId === null ? m.senderId : m.receiverId);

export type ThreadState = 'assistant' | 'assigned' | 'taken_over' | 'order';

export interface ThreadSummary {
    key: string; kind: 'support' | 'order'; participantId: string; orderId: string | null;
    lastMessage: string | null; lastHasImage: boolean; lastAt: Date; lastFrom: Author;
    unread: number; messages: number;
    state: ThreadState; assignedTeam: string | null; handedOverBy: string | null;
    /** The participant wrote last and a person is expected to answer (routed, taken over, or an order conversation). */
    awaitingTeam: boolean;
    participantMessages: number;
}

/** Summary of one general conversation; `msgs` in any order. */
export function summarizeGeneral(participantId: string, msgs: HqMessage[]): ThreadSummary | null {
    if (!msgs.length) return null;
    const rows = [...msgs].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    const last = rows[rows.length - 1];
    const own = rows.filter((m) => generalAuthor(m, participantId) === 'participant');
    const lastOwn = own[own.length - 1];
    const assignedTeam = [...rows].reverse().find((m) => m.assignedTeam)?.assignedTeam ?? null;
    // Same rule the assistant uses to stay quiet: the user's latest message carries the hand-over.
    const takenOver = !!lastOwn?.isHandedOver;
    const lastTeam = [...rows].reverse().find((m) => generalAuthor(m, participantId) === 'team');
    const needsPerson = takenOver || !!assignedTeam;
    const awaitingTeam = needsPerson && !!lastOwn && (!lastTeam || +new Date(lastTeam.createdAt) < +new Date(lastOwn.createdAt));
    return {
        key: `support:${participantId}`, kind: 'support', participantId, orderId: null,
        lastMessage: last.content ? last.content.slice(0, 160) : null, lastHasImage: !!last.imageUrl, lastAt: last.createdAt,
        lastFrom: generalAuthor(last, participantId),
        unread: own.filter((m) => !m.isRead).length, messages: rows.length,
        state: takenOver ? 'taken_over' : assignedTeam ? 'assigned' : 'assistant',
        assignedTeam, handedOverBy: takenOver ? lastOwn?.handedOverBy ?? null : null,
        awaitingTeam, participantMessages: own.length,
    };
}

/** Summary of one order conversation; `msgs` in any order. */
export function summarizeOrder(orderId: string, participantId: string, msgs: HqMessage[]): ThreadSummary | null {
    if (!msgs.length) return null;
    const rows = [...msgs].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    const last = rows[rows.length - 1];
    const own = rows.filter((m) => orderAuthor(m) === 'participant');
    return {
        key: `order:${orderId}:${participantId}`, kind: 'order', participantId, orderId,
        lastMessage: last.content ? last.content.slice(0, 160) : null, lastHasImage: !!last.imageUrl, lastAt: last.createdAt,
        lastFrom: orderAuthor(last), unread: own.filter((m) => !m.isRead).length, messages: rows.length,
        state: 'order', assignedTeam: null, handedOverBy: null,
        awaitingTeam: orderAuthor(last) === 'participant', participantMessages: own.length,
    };
}

/** Group general-support rows into conversations keyed by participant. */
export function groupGeneral(rows: HqMessage[]) {
    const by = new Map<string, HqMessage[]>();
    for (const m of rows) {
        if (m.orderId) continue;
        const p = generalParticipant(m);
        if (!p) continue;
        if (!by.has(p)) by.set(p, []);
        by.get(p)!.push(m);
    }
    return by;
}

/** Group order rows into conversations keyed by `orderId|participant` (participant = partyId, else the order's buyer). */
export function groupOrders(rows: HqMessage[], buyerOf: Map<string, string>) {
    const by = new Map<string, { orderId: string; participantId: string; msgs: HqMessage[] }>();
    for (const m of rows) {
        if (!m.orderId) continue;
        const participantId = m.partyId || buyerOf.get(m.orderId);
        if (!participantId) continue;
        const key = `${m.orderId}|${participantId}`;
        if (!by.has(key)) by.set(key, { orderId: m.orderId, participantId, msgs: [] });
        by.get(key)!.msgs.push(m);
    }
    return by;
}

/** Developers and logistics only see general conversations routed to their team. */
export function visibleGeneral(role: string, msgs: HqMessage[]) {
    const r = upper(role);
    if (ALL_ACCESS_ROLES.includes(r)) return true;
    if (r === 'DEVELOPER' || r === 'LOGISTICS') return msgs.some((m) => m.assignedTeam === r);
    return false;
}

/**
 * Time to a person's first reply, from order conversations only: there the
 * participant always waits for a person. (In general support the assistant
 * answers first and the data doesn't record when a chat was escalated, so a
 * figure there would mix assistant turns with team turns.)
 * A sample starts at the first participant message after the last team reply
 * and ends at the next team reply; only samples starting in the window count.
 */
export function firstResponseSamples(threads: HqMessage[][], now = Date.now(), days = FIRST_RESPONSE_DAYS) {
    const since = now - days * DAY;
    const samples: number[] = [];
    for (const msgs of threads) {
        const rows = [...msgs].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        let pending: number | null = null;
        for (const m of rows) {
            const at = +new Date(m.createdAt);
            if (orderAuthor(m) === 'participant') { if (pending === null) pending = at; }
            else if (pending !== null) { if (pending >= since) samples.push(at - pending); pending = null; }
        }
    }
    return samples;
}

export function average(ns: number[]) {
    return ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length) : null;
}

export const isActive = (t: { lastAt: Date }, now = Date.now(), days = ACTIVE_DAYS) => +new Date(t.lastAt) >= now - days * DAY;
