import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminUsersService } from './admin-users.service';

/**
 * Admin → Users. Read-only directory and user detail for ADMIN (OWNER passes
 * RolesGuard automatically). Only whitelisted, non-sensitive fields are returned
 * (see ./admin-users-query.ts). Account actions use the existing /users endpoints.
 * The account tabs (products, offers, orders, target prices, reviews) are
 * paginated, 14 per page by default; supplier net prices and the Atlantis
 * margin are only returned to OWNER/ADMIN (./admin-users-activity.ts).
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class AdminUsersController {
    constructor(private readonly svc: AdminUsersService) {}

    /** ?q, role (CUSTOMER|BUYER|SUPPLIER|…), status, country, kyc, sort, page, limit (max 100). */
    @Get('list')
    list(@Query() query: Record<string, unknown>) {
        return this.svc.list(query);
    }

    @Get(':id')
    detail(@Param('id') id: string, @Req() req: any) {
        return this.svc.detail(id, req.user?.role);
    }

    /** Supplier only. ?page, limit (default 14, max 50), status. */
    @Get(':id/products')
    products(@Param('id') id: string, @Query() query: Record<string, unknown>, @Req() req: any) {
        return this.svc.products(id, query, req.user?.role);
    }

    /** Supplier only: wholesale Offer records. */
    @Get(':id/offers')
    offers(@Param('id') id: string, @Query() query: Record<string, unknown>, @Req() req: any) {
        return this.svc.offers(id, query, req.user?.role);
    }

    /** Suppliers: orders containing their products. Buyers: orders they placed. */
    @Get(':id/orders')
    orders(@Param('id') id: string, @Query() query: Record<string, unknown>) {
        return this.svc.orders(id, query);
    }

    /** Buyer only. */
    @Get(':id/target-prices')
    targetPrices(@Param('id') id: string, @Query() query: Record<string, unknown>) {
        return this.svc.targetPrices(id, query);
    }

    /** Suppliers: reviews on their products. Buyers: reviews they wrote. */
    @Get(':id/reviews')
    reviews(@Param('id') id: string, @Query() query: Record<string, unknown>) {
        return this.svc.reviews(id, query);
    }
}
