import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SupportHqService } from './support-hq.service';
import { ChatGateway } from './chat.gateway';

const viewer = (req: any) => ({ id: req.user.sub, role: String(req.user.role || '') });

/** Support HQ (staff). Reads are read-only; routing and take-over are recorded in the admin action log. */
@Controller('chat/admin/hq')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPPORT, Role.DEVELOPER, Role.LOGISTICS, Role.OWNER)
export class SupportHqController {
    constructor(private readonly hq: SupportHqService, private readonly gateway: ChatGateway) {}

    @Get('inbox')
    inbox(@Request() req) {
        return this.hq.inbox(viewer(req));
    }

    @Get('stats')
    stats(@Request() req) {
        return this.hq.stats(viewer(req));
    }

    /** ?user=<userId> → their general support conversation; with &order=<orderId> → that order's conversation with them (verified party). */
    @Get('thread')
    thread(@Request() req, @Query('user') user: string, @Query('order') order?: string) {
        return this.hq.thread(viewer(req), user, order || null);
    }

    @Patch('conversations/:userId/team')
    async assign(@Request() req, @Param('userId') userId: string, @Body('team') team: string) {
        const res = await this.hq.assignTeam(viewer(req), userId, team);
        this.push(userId, null);
        return res;
    }

    @Post('conversations/:userId/take-over')
    async takeOver(@Request() req, @Param('userId') userId: string) {
        const res: any = await this.hq.takeOver(viewer(req), userId);
        this.push(userId, res?.systemMessage);
        return res;
    }

    @Post('conversations/:userId/hand-back')
    async handBack(@Request() req, @Param('userId') userId: string) {
        const res: any = await this.hq.handBack(viewer(req), userId);
        this.push(userId, res?.systemMessage);
        return res;
    }

    /** Live updates for the user and the other staff screens; a missed push never fails the action. */
    private push(userId: string, message: any) {
        try {
            if (message) this.gateway.emitToUser(userId, 'new_message', message);
            this.gateway.emitToSupport('conversation_updated', { userId, message });
        } catch { /* offline */ }
    }
}
