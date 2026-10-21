import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TeamService } from './team.service';

/**
 * Public side of a team invitation (no sign-in). The secret travels in the request
 * body (the page reads it from the URL fragment), never in a path or query string,
 * so it stays out of access logs. Both routes are rate limited.
 */
@Controller('team-invitations')
export class TeamInvitationsController {
    constructor(private readonly team: TeamService) {}

    /** Body: { token } → { state: PENDING|EXPIRED|ACCEPTED|REVOKED|INVALID, email?, name?, role?, expiresAt?, accountExists? } */
    @Post('inspect')
    @HttpCode(200)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    inspect(@Body('token') token: string) {
        return this.team.inspect(token);
    }

    /** Body: { token, name, password } → { accepted: true, email, role }. The invitee then signs in. */
    @Post('accept')
    @HttpCode(200)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    accept(@Body() body: any) {
        return this.team.accept(body);
    }
}
