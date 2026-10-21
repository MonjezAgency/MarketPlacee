import { BadRequestException, ConflictException, ForbiddenException, GoneException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';
import { checkPassword } from '../auth/password-policy';
import { EMAIL_RE, normEmail, hashSecret } from '../auth/verification';
import { forgetSession, forgetUser } from '../auth/jwt.strategy';
import { Actor, checkGrant, checkManageStaff, Denial, DENIAL_MESSAGE, grantableBy, STAFF_ROLES, upper } from './staff-access';
import { teamInvitationEmail } from './team-invite-email';

/** Invitation links are valid this long after they are (re)sent. */
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const STAFF_KIND = 'STAFF';

export type InvitationState = 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED' | 'NOT_SENT';

/** The lifecycle state of an invitation row, derived from its columns only. */
export function invitationState(row: { used: boolean; usedAt?: Date | null; revokedAt?: Date | null; expiresAt: Date; emailStatus?: string | null }, now = new Date()): InvitationState {
    if (row.used || row.usedAt) return 'ACCEPTED';
    if (row.revokedAt) return 'REVOKED';
    if (row.emailStatus !== 'SENT') return 'NOT_SENT';
    if (row.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
    return 'PENDING';
}

/** A fresh link secret (256 bits, URL-safe). Only its hash is stored. */
export const newInviteSecret = () => crypto.randomBytes(32).toString('base64url');

const deny = (d: Denial) => new ForbiddenException({ code: d, message: DENIAL_MESSAGE[d] });

const INVITE_SELECT = { id: true, email: true, name: true, role: true, expiresAt: true, used: true, usedAt: true, revokedAt: true, emailStatus: true, emailError: true, sentAt: true, createdAt: true, createdBy: true, acceptedUserId: true } as const;

@Injectable()
export class TeamService {
    private readonly logger = new Logger(TeamService.name);

    constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

    private frontendUrl() {
        return (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/+$/, '');
    }

    /** The accept link. The secret sits in the URL fragment, so it never reaches server logs or Referer headers. */
    acceptLink(secret: string) {
        return `${this.frontendUrl()}/auth/team-invite#token=${secret}`;
    }

    private toInvitation(r: any, now = new Date()) {
        const creator = r.creator ?? null;
        return {
            id: r.id, email: r.email, name: r.name, role: r.role, state: invitationState(r, now),
            expiresAt: r.expiresAt, sentAt: r.sentAt, createdAt: r.createdAt, acceptedAt: r.usedAt ?? null, revokedAt: r.revokedAt ?? null,
            emailError: r.emailStatus === 'FAILED' ? (r.emailError || 'Delivery failed') : null,
            invitedBy: creator ? { id: creator.id, name: creator.name } : null,
        };
    }

    /** Members (every staff account, owner included) and STAFF invitations, plus what the viewer may do. */
    async overview(actor: Actor) {
        const now = new Date();
        const [members, invites] = await Promise.all([
            this.prisma.user.findMany({
                where: { role: { in: STAFF_ROLES as any } },
                select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, twoFactorEnabled: true },
                orderBy: { createdAt: 'asc' },
            }),
            this.prisma.inviteToken.findMany({ where: { kind: STAFF_KIND }, select: INVITE_SELECT as any, orderBy: { createdAt: 'desc' }, take: 200 }),
        ]);
        const memberIds = (members as any[]).map((m) => m.id);
        const seen = memberIds.length
            ? await (this.prisma as any).userSession.groupBy({ by: ['userId'], where: { userId: { in: memberIds } }, _max: { lastSeenAt: true } }).catch(() => [])
            : [];
        const lastSeen = new Map((seen as any[]).map((r) => [r.userId, r._max?.lastSeenAt ?? null]));
        const creatorIds = [...new Set((invites as any[]).map((i) => i.createdBy).filter(Boolean))] as string[];
        const creators = creatorIds.length ? await this.prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }) : [];
        const byId = new Map(creators.map((c) => [c.id, c]));
        return {
            viewer: { id: actor.id, role: upper(actor.role), grantableRoles: grantableBy(actor.role) },
            members: (members as any[]).map((m) => ({
                id: m.id, name: m.name, email: m.email, role: m.role, status: m.status, createdAt: m.createdAt,
                lastActiveAt: lastSeen.get(m.id) ?? null, twoFactorEnabled: !!m.twoFactorEnabled,
                isSelf: m.id === actor.id,
                canManage: checkManageStaff(actor, m) === null,
            })),
            invitations: (invites as any[]).map((r) => this.toInvitation({ ...r, creator: r.createdBy ? byId.get(r.createdBy) : null }, now)),
        };
    }

    private parseInvite(body: any) {
        const email = normEmail(body?.email);
        const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
        const role = upper(body?.role);
        const errors: Record<string, string> = {};
        if (!name) errors.name = 'Enter the person’s full name.';
        if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';
        if (!role) errors.role = 'Choose a role.';
        if (Object.keys(errors).length) throw new BadRequestException({ code: 'INVALID_INVITATION', message: 'Check the highlighted fields.', errors });
        return { email, name, role };
    }

    /** Refuse an email that already has an account or a live invitation. */
    private async assertEmailFree(email: string, exceptInviteId?: string) {
        const existing = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, role: true } });
        if (existing) {
            const staff = (STAFF_ROLES as readonly string[]).includes(String(existing.role));
            throw new ConflictException(staff
                ? { code: 'ALREADY_MEMBER', message: 'This person is already on the Atlantis team.', userId: existing.id }
                : { code: 'EMAIL_HAS_ACCOUNT', message: 'This email already has an Atlantis buyer or supplier account. Invite a different work email.' });
        }
        const now = new Date();
        const open = await this.prisma.inviteToken.findMany({
            where: { kind: STAFF_KIND, email, used: false, revokedAt: null, expiresAt: { gt: now }, ...(exceptInviteId ? { id: { not: exceptInviteId } } : {}) },
            select: INVITE_SELECT as any,
        });
        const live = (open as any[]).find((r) => invitationState(r, now) === 'PENDING');
        if (live) throw new ConflictException({ code: 'INVITE_PENDING', message: 'An invitation to this email is still open. Resend it instead.', invitationId: live.id });
    }

    /**
     * Send (or re-send) the email for an invitation row that already holds `secret`'s hash.
     * The row is SENT only after the provider accepts the message; otherwise FAILED, which
     * makes the link unusable, and the caller gets an error — never a success.
     */
    private async deliver(rowId: string, secret: string, p: { email: string; name: string; role: string; expiresAt: Date; inviterName: string }) {
        const t = teamInvitationEmail({ name: p.name, role: p.role, inviterName: p.inviterName, link: this.acceptLink(secret), expiresAt: p.expiresAt });
        let result: { success: boolean; error?: string; provider?: string };
        try {
            result = await this.email.sendMailDetailed(p.email, t.subject, t.html);
        } catch (e: any) {
            result = { success: false, error: e?.message || 'Email provider error' };
        }
        const now = new Date();
        const row = await this.prisma.inviteToken.update({
            where: { id: rowId },
            data: result.success
                ? { emailStatus: 'SENT', emailError: null, sentAt: now }
                : { emailStatus: 'FAILED', emailError: String(result.error || 'Delivery failed').slice(0, 500) },
            select: INVITE_SELECT as any,
        });
        if (!result.success) {
            this.logger.warn(`[TEAM] Invitation email to ${p.email} was not sent: ${result.error}`);
            throw new HttpException({
                code: 'EMAIL_NOT_SENT',
                message: 'The invitation email could not be sent, so the invitation is not active. Check the email setup and try again.',
                reason: row.emailError,
                invitation: this.toInvitation(row),
            }, HttpStatus.BAD_GATEWAY);
        }
        return { invitation: this.toInvitation(row), email: { sent: true, provider: result.provider ?? null } };
    }

    private async inviterName(actorId: string) {
        const u = await this.prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
        return u?.name || 'The Atlantis team';
    }

    async invite(actor: Actor, body: any) {
        const { email, name, role } = this.parseInvite(body);
        const d = checkGrant(actor, role);
        if (d) throw deny(d);
        await this.assertEmailFree(email);
        // An earlier invitation to this email that was never delivered or has expired is reused
        // (new secret, same row) instead of piling up rows for one person.
        const stale: any = await this.prisma.inviteToken.findFirst({ where: { kind: STAFF_KIND, email, used: false, revokedAt: null }, select: INVITE_SELECT as any, orderBy: { createdAt: 'desc' } });
        if (stale && checkGrant(actor, stale.role) === null) {
            await this.prisma.inviteToken.update({ where: { id: stale.id }, data: { name, role } as any });
            return this.resend(actor, stale.id);
        }
        const secret = newInviteSecret();
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
        const row = await this.prisma.inviteToken.create({
            data: { kind: STAFF_KIND, token: hashSecret(secret), email, name, role, expiresAt, used: false, createdBy: actor.id, emailStatus: 'SENDING' } as any,
        });
        await this.audit(actor.id, 'TEAM_INVITE', row.id, { email, role });
        return this.deliver(row.id, secret, { email, name, role, expiresAt, inviterName: await this.inviterName(actor.id) });
    }

    private async findInvite(id: string) {
        const row: any = await this.prisma.inviteToken.findFirst({ where: { id, kind: STAFF_KIND }, select: INVITE_SELECT as any });
        if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Invitation not found.' });
        return row;
    }

    /** New secret + new expiry on the same row: the previous link stops working at once. */
    async resend(actor: Actor, id: string) {
        const row = await this.findInvite(id);
        const state = invitationState(row);
        if (state === 'ACCEPTED') throw new ConflictException({ code: 'ALREADY_ACCEPTED', message: 'This invitation was already accepted.' });
        if (state === 'REVOKED') throw new ConflictException({ code: 'REVOKED', message: 'This invitation was revoked. Send a new one instead.' });
        const d = checkGrant(actor, row.role);
        if (d) throw deny(d);
        await this.assertEmailFree(row.email, row.id);
        const secret = newInviteSecret();
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
        const res = await this.prisma.inviteToken.updateMany({
            where: { id: row.id, used: false, revokedAt: null },
            data: { token: hashSecret(secret), expiresAt, emailStatus: 'SENDING', emailError: null } as any,
        });
        if (!res.count) throw new ConflictException({ code: 'CHANGED', message: 'This invitation changed meanwhile. Refresh and try again.' });
        await this.audit(actor.id, 'TEAM_INVITE_RESEND', row.id, { email: row.email, role: row.role });
        return this.deliver(row.id, secret, { email: row.email, name: row.name || '', role: row.role, expiresAt, inviterName: await this.inviterName(actor.id) });
    }

    async revoke(actor: Actor, id: string) {
        const row = await this.findInvite(id);
        const d = checkGrant(actor, row.role);
        if (d) throw deny(d);
        const res = await this.prisma.inviteToken.updateMany({
            where: { id: row.id, used: false, revokedAt: null },
            data: { revokedAt: new Date(), revokedBy: actor.id } as any,
        });
        if (!res.count) throw new ConflictException({ code: 'NOT_OPEN', message: 'This invitation is already accepted or revoked.' });
        await this.audit(actor.id, 'TEAM_INVITE_REVOKE', row.id, { email: row.email, role: row.role });
        return { invitation: this.toInvitation(await this.findInvite(id)) };
    }

    private async findMember(id: string) {
        const m = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, status: true } });
        if (!m || !(STAFF_ROLES as readonly string[]).includes(String(m.role))) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Team member not found.' });
        return m;
    }

    /** End every session of a user so the change applies now (the role is also re-read per request). */
    private async signOutEverywhere(userId: string) {
        const sessions = await (this.prisma as any).userSession.findMany({ where: { userId, revokedAt: null }, select: { id: true } }).catch(() => []);
        await (this.prisma as any).userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => undefined);
        await this.prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => undefined);
        await this.prisma.user.update({ where: { id: userId }, data: { tokensValidAfter: new Date() } as any }).catch(() => undefined);
        for (const s of sessions as any[]) forgetSession(s.id);
        forgetUser(userId);
    }

    async changeRole(actor: Actor, id: string, rawRole: unknown) {
        const m = await this.findMember(id);
        const role = upper(rawRole);
        const d = checkGrant(actor, role, m);
        if (d) throw deny(d);
        if (m.role === role) return { member: m, changed: false };
        const updated = await this.prisma.user.update({ where: { id }, data: { role: role as any }, select: { id: true, name: true, email: true, role: true, status: true } });
        await this.signOutEverywhere(id);
        await this.audit(actor.id, 'TEAM_CHANGE_ROLE', id, { from: m.role, to: role });
        return { member: updated, changed: true };
    }

    async setActive(actor: Actor, id: string, active: boolean) {
        const m = await this.findMember(id);
        const d = checkManageStaff(actor, m);
        if (d) throw deny(d);
        const status = active ? 'ACTIVE' : 'BLOCKED';
        if (m.status === status) return { member: m, changed: false };
        const updated = await this.prisma.user.update({ where: { id }, data: { status: status as any }, select: { id: true, name: true, email: true, role: true, status: true } });
        if (!active) await this.signOutEverywhere(id);
        else forgetUser(id);
        await this.audit(actor.id, active ? 'TEAM_REACTIVATE' : 'TEAM_DEACTIVATE', id, { role: m.role });
        return { member: updated, changed: true };
    }

    /** Mark a team member's identity check as verified (owner/admin, never on yourself). */
    async verifyKyc(actor: Actor, id: string) {
        const m = await this.findMember(id);
        const d = checkManageStaff(actor, m);
        if (d) throw deny(d);
        return this.prisma.user.update({ where: { id }, data: { kycStatus: 'VERIFIED' }, select: { id: true, email: true, kycStatus: true } });
    }

    // ── Public: the invitee ─────────────────────────────────────────────────

    private async byToken(secret: unknown) {
        const s = String(secret ?? '').trim();
        if (!/^[A-Za-z0-9_-]{32,64}$/.test(s)) return null;
        return (await this.prisma.inviteToken.findFirst({ where: { token: hashSecret(s), kind: STAFF_KIND }, select: INVITE_SELECT as any })) as any;
    }

    /** What the accept page shows. Never says whether an unknown token exists elsewhere. */
    async inspect(secret: unknown) {
        const row = await this.byToken(secret);
        if (!row) return { state: 'INVALID' as const };
        const state = invitationState(row);
        if (state === 'NOT_SENT') return { state: 'INVALID' as const };
        if (state !== 'PENDING') return { state };
        const existing = await this.prisma.user.findFirst({ where: { email: { equals: row.email, mode: 'insensitive' } }, select: { id: true } });
        return { state, email: row.email, name: row.name, role: row.role, expiresAt: row.expiresAt, accountExists: !!existing };
    }

    /**
     * Accept: validate the secret, then in one transaction consume the invitation
     * (only if still open) and create the account with the invitation's role.
     * The invitee chooses the password; nothing is pre-set.
     */
    async accept(body: any) {
        const row = await this.byToken(body?.token);
        if (!row) throw new BadRequestException({ code: 'INVALID', message: 'This invitation link isn’t valid.' });
        const state = invitationState(row);
        if (state === 'NOT_SENT') throw new BadRequestException({ code: 'INVALID', message: 'This invitation link isn’t valid.' });
        if (state === 'EXPIRED') throw new GoneException({ code: 'EXPIRED', message: 'This invitation has expired. Ask the person who invited you to send a new one.' });
        if (state === 'ACCEPTED') throw new GoneException({ code: 'USED', message: 'This invitation was already used. Sign in instead.' });
        if (state === 'REVOKED') throw new GoneException({ code: 'REVOKED', message: 'This invitation was withdrawn.' });
        const name = String(body?.name ?? row.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
        if (!name) throw new BadRequestException({ code: 'NAME_REQUIRED', message: 'Enter your full name.' });
        const password = String(body?.password ?? '');
        const pw = checkPassword(password, { email: row.email, name });
        if (!pw.ok) throw new BadRequestException({ code: 'WEAK_PASSWORD', message: pw.problems.join(' '), problems: pw.problems });
        if (!(STAFF_ROLES as readonly string[]).includes(row.role) || row.role === 'OWNER') throw new BadRequestException({ code: 'INVALID', message: 'This invitation link isn’t valid.' });
        const hash = await bcrypt.hash(password, 12);
        const now = new Date();
        const user = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.user.findFirst({ where: { email: { equals: row.email, mode: 'insensitive' } }, select: { id: true } });
            if (existing) throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'An account with this email already exists. Sign in instead, or ask for an invitation to a different email.' });
            const claimed = await tx.inviteToken.updateMany({
                where: { id: row.id, token: hashSecret(String(body.token).trim()), used: false, revokedAt: null, emailStatus: 'SENT', expiresAt: { gt: now } } as any,
                data: { used: true, usedAt: now } as any,
            });
            if (!claimed.count) throw new GoneException({ code: 'USED', message: 'This invitation is no longer valid.' });
            const u = await tx.user.create({
                data: { email: row.email, name, password: hash, role: row.role as any, status: 'ACTIVE', emailVerified: true, onboardingCompleted: true } as any,
                select: { id: true, email: true, role: true },
            });
            await tx.inviteToken.update({ where: { id: row.id }, data: { acceptedUserId: u.id } as any });
            return u;
        });
        await this.audit(row.createdBy || user.id, 'TEAM_INVITE_ACCEPTED', row.id, { userId: user.id, role: user.role }).catch(() => undefined);
        return { accepted: true, email: user.email, role: user.role };
    }

    private async audit(adminId: string, action: string, entityId: string, details: Record<string, unknown>) {
        if (!adminId) return;
        await this.prisma.adminActionLog.create({ data: { adminId, action, entityType: 'Team', entityId, details: details as any } }).catch((e) => this.logger.warn(`[TEAM] audit failed: ${e?.message}`));
    }
}
