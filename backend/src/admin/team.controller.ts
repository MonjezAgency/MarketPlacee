import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamService } from './team.service';
import { normEmail, EMAIL_RE } from '../auth/verification';

const actorOf = (req: any) => ({ id: String(req.user?.sub || ''), role: String(req.user?.role || '') });

/**
 * Admin → Team. OWNER and ADMIN only (RolesGuard lets OWNER through). Per-member rules
 * — no self-changes, the owner account is untouchable, only the owner manages admins —
 * live in staff-access.ts and are applied in TeamService. DEVELOPER used to reach this
 * controller (and could invite admins); it no longer can.
 */
@Controller('admin/team')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class TeamController {
    constructor(private readonly team: TeamService, private readonly emailService: EmailService) {}

    /** Members, invitations and the roles the viewer may grant. */
    @Get()
    overview(@Req() req: any) {
        return this.team.overview(actorOf(req));
    }

    /** Body: { name, email, role }. 201 after the email is accepted by the provider; 502 EMAIL_NOT_SENT otherwise. */
    @Post('invitations')
    invite(@Body() body: any, @Req() req: any) {
        return this.team.invite(actorOf(req), body);
    }

    /** Legacy path used by the old Team page: same invitation flow (no temporary passwords any more). */
    @Post('invite')
    legacyInvite(@Body() body: any, @Req() req: any) {
        return this.team.invite(actorOf(req), body);
    }

    @Post('invitations/:id/resend')
    @HttpCode(200)
    resend(@Param('id') id: string, @Req() req: any) {
        return this.team.resend(actorOf(req), id);
    }

    @Post('invitations/:id/revoke')
    @HttpCode(200)
    revoke(@Param('id') id: string, @Req() req: any) {
        return this.team.revoke(actorOf(req), id);
    }

    /** Body: { role }. Signs the member out everywhere so the new role applies at once. */
    @Patch('members/:id/role')
    changeRole(@Param('id') id: string, @Body('role') role: string, @Req() req: any) {
        return this.team.changeRole(actorOf(req), id, role);
    }

    @Post('members/:id/deactivate')
    @HttpCode(200)
    deactivate(@Param('id') id: string, @Req() req: any) {
        return this.team.setActive(actorOf(req), id, false);
    }

    @Post('members/:id/reactivate')
    @HttpCode(200)
    reactivate(@Param('id') id: string, @Req() req: any) {
        return this.team.setActive(actorOf(req), id, true);
    }

    /**
     * Team accounts are deactivated, never deleted: the old implementation also deleted the
     * account's orders and products. Kept as a route so old callers get a clear answer.
     */
    @Delete(':id')
    deleteMember() {
        throw new ForbiddenException({ code: 'DEACTIVATE_INSTEAD', message: 'Team accounts can’t be deleted. Deactivate the member instead.' });
    }

    @Post(':id/verify-kyc')
    @HttpCode(200)
    verifyKyc(@Param('id') id: string, @Req() req: any) {
        return this.team.verifyKyc(actorOf(req), id);
    }

    /**
     * Email a business (supplier or buyer) the public sign-up link. The link is built
     * here, never taken from the request, and the account still goes through sign-up,
     * email verification and approval. Reports each address's real delivery result.
     */
    @Post('send-invite')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async sendInvite(@Body() body: { email: string | string[]; role: string }, @Req() req: any) {
        const role = String(body?.role || '').toLowerCase();
        if (role !== 'supplier' && role !== 'customer') throw new BadRequestException({ code: 'INVALID_ROLE', message: 'Choose supplier or buyer.' });
        const raw = Array.isArray(body?.email) ? body.email : String(body?.email || '').split(/[,\s\n]+/);
        const emails = [...new Set(raw.map(normEmail).filter((e: string) => EMAIL_RE.test(e)))].slice(0, 20) as string[];
        if (!emails.length) throw new BadRequestException({ code: 'NO_EMAILS', message: 'Enter at least one valid email address.' });
        const base = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/+$/, '');
        const senderName = req.user?.name || 'Ali FMCG';
        const results = await Promise.all(emails.map(async (email) => {
            const inviteLink = `${base}/auth/register?role=${role}&email=${encodeURIComponent(email)}`;
            try {
                const r = await this.emailService.sendInviteEmail({ recipientEmail: email, role, inviteLink, senderName });
                return { email, success: !!r.success, provider: r.provider || null, error: r.success ? undefined : (r.error || 'Delivery failed') };
            } catch (e: any) {
                return { email, success: false, provider: null, error: e?.message || 'Delivery failed' };
            }
        }));
        const sent = results.filter((r) => r.success).length;
        return { success: sent === emails.length, partial: sent > 0 && sent < emails.length, summary: { total: emails.length, success: sent, failed: emails.length - sent }, results };
    }
}
