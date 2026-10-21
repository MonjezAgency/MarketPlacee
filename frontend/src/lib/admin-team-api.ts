import { apiFetch } from '@/lib/api';
import type { StaffRole } from '@/lib/admin-access';

/**
 * Admin → Team (backend/src/admin/team.controller.ts, OWNER/ADMIN) and the public
 * invitation endpoints (team-invitations.controller.ts). Errors carry the server's
 * `code` so the page can explain refusals (SELF, OWNER_PROTECTED, INVITE_PENDING, EMAIL_NOT_SENT…).
 */

export type InvitationState = 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED' | 'NOT_SENT';

export interface TeamMember {
    id: string; name: string | null; email: string; role: StaffRole | string; status: string;
    createdAt: string; lastActiveAt: string | null; twoFactorEnabled: boolean;
    isSelf: boolean; canManage: boolean;
}

export interface TeamInvitation {
    id: string; email: string; name: string | null; role: StaffRole | string; state: InvitationState;
    expiresAt: string; sentAt: string | null; createdAt: string; acceptedAt: string | null; revokedAt: string | null;
    emailError: string | null; invitedBy: { id: string; name: string | null } | null;
}

export interface TeamOverview {
    viewer: { id: string; role: string; grantableRoles: StaffRole[] };
    members: TeamMember[];
    invitations: TeamInvitation[];
}

export class TeamApiError extends Error {
    constructor(message: string, public status: number, public code?: string, public body?: any) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await apiFetch(path, init);
    } catch {
        throw new TeamApiError('', 0, 'NETWORK');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = Array.isArray(body?.message) ? body.message.join(' ') : typeof body?.message === 'string' ? body.message : '';
        throw new TeamApiError(msg, res.status, body?.code, body);
    }
    return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });

export const teamApi = {
    overview: () => call<TeamOverview>('/admin/team'),
    invite: (data: { name: string; email: string; role: string }) => call<{ invitation: TeamInvitation; email: { sent: true } }>('/admin/team/invitations', json('POST', data)),
    resend: (id: string) => call<{ invitation: TeamInvitation }>(`/admin/team/invitations/${encodeURIComponent(id)}/resend`, json('POST')),
    revoke: (id: string) => call<{ invitation: TeamInvitation }>(`/admin/team/invitations/${encodeURIComponent(id)}/revoke`, json('POST')),
    changeRole: (id: string, role: string) => call<{ changed: boolean }>(`/admin/team/members/${encodeURIComponent(id)}/role`, json('PATCH', { role })),
    deactivate: (id: string) => call<{ changed: boolean }>(`/admin/team/members/${encodeURIComponent(id)}/deactivate`, json('POST')),
    reactivate: (id: string) => call<{ changed: boolean }>(`/admin/team/members/${encodeURIComponent(id)}/reactivate`, json('POST')),
    /** Emails a business the public sign-up link (supplier or buyer). Per-address results are real provider results. */
    inviteBusiness: (data: { email: string; role: 'supplier' | 'customer' }) =>
        call<{ success: boolean; partial: boolean; summary: { total: number; success: number; failed: number }; results: { email: string; success: boolean; error?: string }[] }>('/admin/team/send-invite', json('POST', data)),
};

export type InviteInspect =
    | { state: 'PENDING'; email: string; name: string | null; role: string; expiresAt: string; accountExists: boolean }
    | { state: 'EXPIRED' | 'ACCEPTED' | 'REVOKED' | 'INVALID' };

export const invitationApi = {
    inspect: (token: string) => call<InviteInspect>('/team-invitations/inspect', json('POST', { token })),
    accept: (data: { token: string; name: string; password: string }) => call<{ accepted: true; email: string; role: string }>('/team-invitations/accept', json('POST', data)),
};
