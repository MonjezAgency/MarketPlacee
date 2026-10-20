import { apiFetch } from '@/lib/api';
import { ApiError } from '@/lib/supplier-api';

/**
 * Admin → Support HQ. Reads: GET /chat/admin/hq/inbox|stats|thread
 * (backend/src/chat/support-hq.*). Replies use the existing send endpoints:
 * POST /chat/send (general support, receiverId) and POST /chat/order/:id/send
 * (order conversations, partyId). Routing and take-over: /chat/admin/hq/conversations/:userId/*.
 */

export const TEAMS = ['SUPPORT', 'DEVELOPER', 'LOGISTICS'] as const;
export type Team = (typeof TEAMS)[number];
export type Author = 'participant' | 'assistant' | 'team';
export type ThreadState = 'assistant' | 'assigned' | 'taken_over' | 'order';

export interface Person { id: string; name: string | null; companyName: string | null; email: string | null; role: string | null }

export interface InboxThread {
    key: string; kind: 'support' | 'order'; participantId: string; orderId: string | null;
    lastMessage: string | null; lastHasImage: boolean; lastAt: string; lastFrom: Author;
    unread: number; messages: number; state: ThreadState; assignedTeam: string | null; handedOverBy: string | null;
    awaitingTeam: boolean; participantMessages: number;
    participant: Person; partyKind: 'buyer' | 'supplier' | null; order: { id: string; status: string } | null; handedOverByName: string | null;
}
export interface Inbox { threads: InboxThread[]; truncated: boolean; canAssign: boolean; ordersVisible: boolean }

type Unavailable<R extends string> = { available: false; reason: R; days?: number };
export interface HqStats {
    openDisputes: number; disputesUnderReview: number;
    awaitingTeam: { total: number; support: number; order: number };
    takenOver: number;
    active: { total: number; support: number; order: number; days: number };
    kycPending: { available: true; count: number } | Unavailable<'role'>;
    firstResponse: { available: true; averageMs: number; samples: number; days: number; scope: 'order' } | Unavailable<'role' | 'noSamples'>;
    truncated: boolean; generatedAt: string;
}

export interface ThreadMessage { id: string; from: Author; senderName: string | null; content: string | null; imageUrl: string | null; isRead: boolean; createdAt: string; assignedTeam: string | null }
export interface Participant { id: string; name: string; companyName: string | null; email: string; role: string; status: string; kycStatus: string; country: string | null; avatar: string | null; createdAt: string }
export interface OrderSummary {
    id: string; status: string; reviewStatus: string; paymentStatus: string; createdAt: string;
    buyer: { id: string; name: string; companyName: string | null } | null;
    lines: { id: string; name: string | null; quantity: number; unit: string | null; fromParty: boolean | null }[];
}
export interface Thread {
    kind: 'support' | 'order';
    participant: Participant;
    partyKind?: 'buyer' | 'supplier';
    messages: ThreadMessage[];
    state: { state: ThreadState; assignedTeam: string | null; awaitingTeam: boolean; takenOverBy: { id: string; name: string } | null; participantMessages: number };
    history: { id: string; action: string; details: any; createdAt: string; by: { id: string; name: string } | null }[];
    truncated: boolean;
    can: { reply: boolean; assign: boolean; takeOver: boolean };
    order: OrderSummary | null;
}

export interface DisputeRow { id: string; orderId: string; reason: string; status: string; createdAt: string; order?: { customer?: { id: string; name: string } | null } | null }
export interface KycRow { id: string; documentType: string; status: string; createdAt: string; adminNotes: string | null; user: { id: string; name: string; email: string; role: string } | null }

async function json<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const m = body?.message;
        const msg = Array.isArray(m) ? m.join(' ') : typeof m === 'string' && m ? m : `HTTP ${res.status}`;
        throw new ApiError(msg, res.status, body);
    }
    return body as T;
}
const send = (path: string, method: string, body?: unknown) =>
    apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export const supportHqApi = {
    inbox: () => apiFetch('/chat/admin/hq/inbox').then((r) => json<Inbox>(r)),
    stats: () => apiFetch('/chat/admin/hq/stats').then((r) => json<HqStats>(r)),
    thread: (userId: string, orderId?: string | null) =>
        apiFetch(`/chat/admin/hq/thread?user=${encodeURIComponent(userId)}${orderId ? `&order=${encodeURIComponent(orderId)}` : ''}`).then((r) => json<Thread>(r)),
    /** General support reply (or the first message of a new conversation). */
    reply: (userId: string, content: string) => send('/chat/send', 'POST', { content, receiverId: userId }).then((r) => json<any>(r)),
    /** Reply in one participant's thread of an order. */
    replyOrder: (orderId: string, partyId: string, content: string) => send(`/chat/order/${encodeURIComponent(orderId)}/send`, 'POST', { content, partyId }).then((r) => json<any>(r)),
    markRead: (ids: string[]) => send('/chat/read', 'PATCH', { ids }).then((r) => json<{ count: number }>(r)),
    assign: (userId: string, team: Team) => send(`/chat/admin/hq/conversations/${encodeURIComponent(userId)}/team`, 'PATCH', { team }).then((r) => json<{ ok: boolean; team: string; changed: boolean; notified?: number }>(r)),
    takeOver: (userId: string) => send(`/chat/admin/hq/conversations/${encodeURIComponent(userId)}/take-over`, 'POST').then((r) => json<any>(r)),
    handBack: (userId: string) => send(`/chat/admin/hq/conversations/${encodeURIComponent(userId)}/hand-back`, 'POST').then((r) => json<any>(r)),
    disputes: (status: 'OPEN' | 'UNDER_REVIEW') => apiFetch(`/disputes?page=1&limit=50&status=${status}`).then((r) => json<{ data: DisputeRow[]; total: number }>(r)),
    kycPending: () => apiFetch('/kyc/admin/pending').then((r) => json<KycRow[]>(r)),
};

export const orderRef = (id: string) => `#${id.slice(-8).toUpperCase()}`;
export const KYC_REVIEW_ROLES = ['OWNER', 'ADMIN', 'MODERATOR'];
