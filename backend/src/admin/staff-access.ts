/**
 * Who may manage which Ali FMCG team account. Shared by the Team endpoints
 * (team.controller.ts / team.service.ts) and the account actions in
 * users.service.ts, so the same rules apply wherever a staff account changes.
 *
 *  - Nobody changes their own role or status, or invites through themselves.
 *  - The OWNER account is never modified through these endpoints.
 *  - Only OWNER and ADMIN manage team accounts; only OWNER creates or manages ADMINs.
 *  - Roles that can be granted: ADMIN (owner only), MODERATOR, SUPPORT, EDITOR, DEVELOPER, LOGISTICS.
 *    OWNER can't be granted. PAIR and SUBLAYER exist in the enum but nothing uses them, so they can't be granted either.
 *
 * The role → capability matrix that the @Roles decorators implement is documented
 * in frontend/src/lib/admin-access.ts (the sidebar and page gate read it too).
 */
export const STAFF_ROLES = ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const GRANTABLE_ROLES: StaffRole[] = ['ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];

export const upper = (r: unknown) => String(r ?? '').trim().toUpperCase();
export const isStaffRole = (r: unknown): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(upper(r));

/** Roles this actor may give to someone else (by invitation or role change). */
export function grantableBy(actorRole: unknown): StaffRole[] {
    const a = upper(actorRole);
    if (a === 'OWNER') return [...GRANTABLE_ROLES];
    if (a === 'ADMIN') return GRANTABLE_ROLES.filter((r) => r !== 'ADMIN');
    return [];
}

export type Denial = 'NOT_ALLOWED' | 'SELF' | 'OWNER_PROTECTED' | 'ADMIN_PROTECTED' | 'ROLE_NOT_GRANTABLE';

export interface Actor { id: string; role: string }
export interface Target { id: string; role: string }

/** May `actor` change, deactivate or reactivate the team account `target`? null = yes. */
export function checkManageStaff(actor: Actor, target: Target): Denial | null {
    const a = upper(actor.role), t = upper(target.role);
    if (a !== 'OWNER' && a !== 'ADMIN') return 'NOT_ALLOWED';
    if (actor.id === target.id) return 'SELF';
    if (t === 'OWNER') return 'OWNER_PROTECTED';
    if (t === 'ADMIN' && a !== 'OWNER') return 'ADMIN_PROTECTED';
    return null;
}

/** May `actor` give `target` the role `role`? (target omitted = a new invitation) */
export function checkGrant(actor: Actor, role: unknown, target?: Target): Denial | null {
    if (target) {
        const d = checkManageStaff(actor, target);
        if (d) return d;
    } else if (!grantableBy(actor.role).length) return 'NOT_ALLOWED';
    return grantableBy(actor.role).includes(upper(role) as StaffRole) ? null : 'ROLE_NOT_GRANTABLE';
}

/**
 * Account actions on any user (approve, reject, block, delete in /users).
 * Marketplace accounts follow the endpoint's @Roles; team accounts follow checkManageStaff;
 * nobody acts on their own account and the OWNER account is never touched.
 */
export function checkAccountAction(actor: Actor, target: Target): Denial | null {
    if (actor.id === target.id) return 'SELF';
    if (upper(target.role) === 'OWNER') return 'OWNER_PROTECTED';
    if (isStaffRole(target.role)) return checkManageStaff(actor, target);
    return null;
}

export const DENIAL_MESSAGE: Record<Denial, string> = {
    NOT_ALLOWED: 'Only the owner or an admin can manage the Ali FMCG team.',
    SELF: 'You can’t change your own role or account status.',
    OWNER_PROTECTED: 'The owner account can’t be changed here.',
    ADMIN_PROTECTED: 'Only the owner can change an admin account.',
    ROLE_NOT_GRANTABLE: 'You can’t give this role.',
};
