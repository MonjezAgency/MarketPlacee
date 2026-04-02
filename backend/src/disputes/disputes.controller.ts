import {
    Controller, Post, Get, Patch, Body, Param, Query,
    UseGuards, Request, ForbiddenException,
} from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role, DisputeStatus } from '@prisma/client';

@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputesController {
    constructor(private readonly disputesService: DisputesService) {}

    /** Customer opens a dispute on their order */
    @Post()
    @Roles(Role.CUSTOMER)
    create(
        @Body() body: { orderId: string; reason: string; description: string; evidence?: string[] },
        @Request() req,
    ) {
        return this.disputesService.create(
            req.user.sub,
            body.orderId,
            body.reason,
            body.description,
            body.evidence,
        );
    }

    /** Customer views their own disputes */
    @Get('my')
    @Roles(Role.CUSTOMER)
    findMine(@Request() req) {
        return this.disputesService.findMyDisputes(req.user.sub);
    }

    /** Admin/Support views all disputes */
    @Get()
    @Roles(Role.ADMIN, Role.SUPPORT, Role.MODERATOR)
    findAll(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: DisputeStatus,
    ) {
        return this.disputesService.findAll(
            parseInt(page || '1', 10),
            parseInt(limit || '20', 10),
            status,
        );
    }

    /** Admin/Support dispute stats */
    @Get('stats')
    @Roles(Role.ADMIN, Role.SUPPORT, Role.MODERATOR)
    getStats() {
        return this.disputesService.getStats();
    }

    /** Get single dispute — customer can only see their own */
    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req) {
        const dispute = await this.disputesService.findOne(id);
        const isAdmin = [Role.ADMIN, Role.SUPPORT, Role.MODERATOR].includes(req.user.role);
        if (!isAdmin && dispute.buyerId !== req.user.sub) throw new ForbiddenException();
        return dispute;
    }

    /** Admin resolves the dispute */
    @Patch(':id/resolve')
    @Roles(Role.ADMIN, Role.SUPPORT, Role.MODERATOR)
    resolve(
        @Param('id') id: string,
        @Body() body: { decision: 'RESOLVED_REFUND' | 'RESOLVED_NO_REFUND'; resolution: string },
        @Request() req,
    ) {
        return this.disputesService.resolve(id, req.user.sub, body.decision, body.resolution);
    }

    /** Admin updates status (e.g. → UNDER_REVIEW) */
    @Patch(':id/status')
    @Roles(Role.ADMIN, Role.SUPPORT, Role.MODERATOR)
    updateStatus(@Param('id') id: string, @Body('status') status: DisputeStatus) {
        return this.disputesService.updateStatus(id, status);
    }
}
