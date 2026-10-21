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
};

export const orderRef = (id: string) => `#${id.slice(-8).toUpperCase()}`;

// ─── Roles (mirror the backend @Roles; the server stays the authority) ────────
/** KycController admin/* (all reads and verify / reject / revoke): OWNER, ADMIN, MODERATOR. */
export const KYC_REVIEW_ROLES = ['OWNER', 'ADMIN', 'MODERATOR'];
/** Roles the Support HQ conversation endpoints allow (backend/src/chat/support-hq.controller.ts). */
export const HQ_CHAT_ROLES = ['OWNER', 'ADMIN', 'SUPPORT', 'DEVELOPER', 'LOGISTICS'];
/** DisputesController GET / , GET stats, PATCH :id/resolve, PATCH :id/status: the same six roles for reading and deciding. */
export const DISPUTE_ROLES = ['OWNER', 'ADMIN', 'SUPPORT'];
/** Roles allowed to decide a dispute (refund / no refund): OWNER and ADMIN only, because a refund decision moves money. Support views and marks under review. */
export const DISPUTE_DECIDE_ROLES = ['OWNER', 'ADMIN'];
/** Roles allowed to decide on KYC documents (identical to KYC_REVIEW_ROLES today). */
export const KYC_DECIDE_ROLES = KYC_REVIEW_ROLES;
/** AdminOrdersController GET :id/detail (order link, suppliers and payment facts in the dispute view). */
export const ORDER_DETAIL_ROLES = ['OWNER', 'ADMIN', 'SUPPORT', 'LOGISTICS'];
/** AdminUsersController (the /admin/users pages). */
export const USER_DETAIL_ROLES = ['OWNER', 'ADMIN', 'SUPPORT'];

// ─── Disputes (backend/src/disputes) ─────────────────────────────────────────
export const DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_REFUND', 'CLOSED'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];
export type DisputeDecision = 'RESOLVED_REFUND' | 'RESOLVED_NO_REFUND';
/** Only the fields the workspace reads. The server sends more; nothing else is shown. */
export interface Dispute {
    id: string; orderId: string; customerId: string; reason: string; description: string; evidence: string[];
    status: DisputeStatus; resolution: string | null; resolvedBy: string | null; resolvedAt: string | null; createdAt: string; updatedAt: string;
    order?: { id: string; status: string; customer?: { id: string; name: string | null; email: string | null } | null; items?: { product?: { name: string } | null }[] } | null;
}
export interface DisputePage { data: Dispute[]; total: number; page: number; limit: number; totalPages: number }
export interface DisputeStats { open: number; underReview: number; resolvedRefund: number; resolvedNoRefund: number; total: number }
/** The parts of GET /orders/admin/:id/detail the dispute view uses (already redacted by role on the server). */
export interface DisputeOrderFacts {
    id: string; status: string; reviewStatus: string;
    payment: { status: string | null; paidAt: string | null; card: { status: string; capturedAt: string | null; releasedAt: string | null } | null } | null;
    suppliers: { id: string; name: string | null; companyName: string | null; email: string | null }[];
}

const pick = (d: any): Dispute => ({
    id: d.id, orderId: d.orderId, customerId: d.customerId, reason: d.reason, description: d.description, evidence: Array.isArray(d.evidence) ? d.evidence : [],
    status: d.status, resolution: d.resolution ?? null, resolvedBy: d.resolvedBy ?? null, resolvedAt: d.resolvedAt ?? null, createdAt: d.createdAt, updatedAt: d.updatedAt,
    order: d.order ? { id: d.order.id, status: d.order.status, customer: d.order.customer ?? null, items: (d.order.items || []).map((i: any) => ({ product: i.product ? { name: i.product.name } : null })) } : null,
});

export const disputeApi = {
    list: (status: DisputeStatus | null, page = 1, limit = 50) =>
        apiFetch(`/disputes?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`).then((r) => json<DisputePage>(r)).then((p) => ({ ...p, data: (p.data || []).map(pick) })),
    stats: () => apiFetch('/disputes/stats').then((r) => json<DisputeStats>(r)),
    get: (id: string) => apiFetch(`/disputes/${encodeURIComponent(id)}`).then((r) => json<any>(r)).then(pick),
    /** PATCH /disputes/:id/status — the old Dispute Center only ever set UNDER_REVIEW. */
    markUnderReview: (id: string) => send(`/disputes/${encodeURIComponent(id)}/status`, 'PATCH', { status: 'UNDER_REVIEW' }).then((r) => json<any>(r)),
    /** PATCH /disputes/:id/resolve — records the decision; the server's reply is the updated dispute. */
    resolve: (id: string, decision: DisputeDecision, resolution: string) =>
        send(`/disputes/${encodeURIComponent(id)}/resolve`, 'PATCH', { decision, resolution }).then((r) => json<any>(r)),
    orderFacts: (orderId: string) => apiFetch(`/orders/admin/${encodeURIComponent(orderId)}/detail`).then((r) => json<any>(r)).then((o): DisputeOrderFacts => ({
        id: o.id, status: o.status, reviewStatus: o.reviewStatus,
        payment: o.payment ? { status: o.payment.status ?? null, paidAt: o.payment.paidAt ?? null, card: o.payment.card ? { status: o.payment.card.status, capturedAt: o.payment.card.capturedAt ?? null, releasedAt: o.payment.card.releasedAt ?? null } : null } : null,
        suppliers: (o.suppliers || []).map((s: any) => ({ id: s.id, name: s.name ?? null, companyName: s.companyName ?? null, email: s.email ?? null })),
    })),
};

// ─── KYC (backend/src/kyc) ───────────────────────────────────────────────────
export const KYC_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export interface KycDoc {
    id: string; userId: string; documentType: string; frontImageUrl: string | null; backImageUrl: string | null; selfieUrl: string | null;
    livenessScore: number | null; status: KycStatus; adminNotes: string | null; createdAt: string; updatedAt: string;
    user: { id: string; name: string | null; email: string | null; role: string | null } | null;
}
export interface KycStats { pending: number; verified: number; rejected: number; unverified: number }
const pickKyc = (d: any): KycDoc => ({
    id: d.id, userId: d.userId, documentType: d.documentType, frontImageUrl: d.frontImageUrl || null, backImageUrl: d.backImageUrl || null, selfieUrl: d.selfieUrl || null,
    livenessScore: typeof d.livenessScore === 'number' ? d.livenessScore : null, status: d.status, adminNotes: d.adminNotes ?? null,
    createdAt: d.createdAt, updatedAt: d.updatedAt, user: d.user ? { id: d.user.id, name: d.user.name ?? null, email: d.user.email ?? null, role: d.user.role ?? null } : null,
});

export const kycApi = {
    list: (status: KycStatus | null) => apiFetch(`/kyc/admin/all${status ? `?status=${status}` : ''}`).then((r) => json<any[]>(r)).then((rows) => (rows || []).map(pickKyc)),
    stats: () => apiFetch('/kyc/admin/stats').then((r) => json<KycStats>(r)),
    get: (id: string) => apiFetch(`/kyc/admin/${encodeURIComponent(id)}`).then((r) => json<any>(r)).then(pickKyc),
    verify: (id: string, adminNotes?: string) => send(`/kyc/admin/${encodeURIComponent(id)}/verify`, 'PATCH', adminNotes ? { adminNotes } : {}).then((r) => json<any>(r)).then(pickKyc),
    reject: (id: string, adminNotes: string) => send(`/kyc/admin/${encodeURIComponent(id)}/reject`, 'PATCH', { adminNotes }).then((r) => json<any>(r)).then(pickKyc),
    revoke: (id: string, adminNotes: string) => send(`/kyc/admin/${encodeURIComponent(id)}/revoke`, 'PATCH', { adminNotes }).then((r) => json<any>(r)).then(pickKyc),
    /** Private files (supabase://…) are opened through a signed URL that expires after one hour. */
    signedUrl: (path: string) => apiFetch(`/kyc/admin/signed-url?path=${encodeURIComponent(path)}`).then((r) => json<{ url: string }>(r)).then((b) => b.url),
};
