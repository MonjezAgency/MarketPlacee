import { Controller, Get, Param, Query, Request, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminOrdersService } from './admin-orders.service';

/**
 * Read-only admin order management (definitions in admin-orders.ts).
 * Actions stay on the existing /orders endpoints. OWNER passes RolesGuard.
 */
@Controller('orders/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminOrdersController {
    constructor(private readonly adminOrders: AdminOrdersService) {}

    /** Paged, filtered, sorted orders + status counts, "requiring action" queues and filter facets. */
    @Get('list')
    @Roles(Role.ADMIN, Role.OWNER, Role.SUPPORT, Role.LOGISTICS) // read-only; rows carry no supplier net or markup
    list(@Query() q: Record<string, string>) {
        return this.adminOrders.list(q);
    }

    /** The filtered list (same query parameters, every page) as a CSV file. */
    @Get('export')
    @Roles(Role.ADMIN, Role.OWNER)
    async export(@Query() q: Record<string, string>, @Res() res: Response) {
        const { csv, rows, total, truncated } = await this.adminOrders.exportCsv(q);
        res.set({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="atlantis-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
            'Cache-Control': 'no-store',
            'X-Export-Rows': String(rows),
            'X-Export-Total': String(total),
            'X-Export-Truncated': truncated ? '1' : '0',
        });
        res.send(csv);
    }

    /**
     * One order with everything recorded about it. Staff who can open orders today
     * (support, moderation, logistics) get it without supplier net prices or the markup.
     */
    @Get(':id/detail')
    @Roles(Role.ADMIN, Role.OWNER, Role.SUPPORT, Role.LOGISTICS)
    detail(@Param('id') id: string, @Request() req) {
        const role = String(req.user?.role || '').toUpperCase();
        return this.adminOrders.detail(id, { netVisible: role === 'ADMIN' || role === 'OWNER' });
    }
}
