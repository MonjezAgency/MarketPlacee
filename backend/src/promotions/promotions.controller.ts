import { Body, Controller, Get, HttpException, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PromotionsService, type Actor, type Scope } from './promotions.service';
import { PromotionError } from './promotion-rules';

/** Rule violations become 4xx responses the tools show verbatim ({ code, message, ...detail }). */
async function run<T>(p: () => Promise<T>): Promise<T> {
    try { return await p(); } catch (e) {
        if (e instanceof PromotionError) throw new HttpException({ code: e.code, message: e.message, ...(e.detail || {}) }, e.status);
        throw e;
    }
}
const actorOf = (req: any): Actor => ({ id: req.user.sub ?? req.user.userId, role: String(req.user.role || '') });

/**
 * Supplier special offers — only the caller's own products (supplier id from
 * the JWT, never from the request). Under /supplier-catalog, so the price
 * privacy interceptor treats every product in the response as the caller's
 * own; responses carry net prices only.
 */
@Controller('supplier-catalog/promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPPLIER)
export class SupplierPromotionsController {
    constructor(private readonly svc: PromotionsService) {}
    private scope(req: any): Scope { return { kind: 'supplier', supplierId: actorOf(req).id }; }

    @Get()
    list(@Request() req, @Query() q: any) { return run(() => this.svc.list(this.scope(req), q)); }

    @Get('products')
    products(@Request() req, @Query('q') q?: string) { return run(() => this.svc.eligibleProducts(this.scope(req), { q })); }

    @Get(':id')
    one(@Request() req, @Param('id') id: string) { return run(() => this.svc.get(this.scope(req), id)); }

    @Post()
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    create(@Request() req, @Body() body: any) { return run(() => this.svc.create(actorOf(req), this.scope(req), body)); }

    @Patch(':id')
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    update(@Request() req, @Param('id') id: string, @Body() body: any) { return run(() => this.svc.update(actorOf(req), this.scope(req), id, body)); }

    @Post(':id/cancel')
    cancel(@Request() req, @Param('id') id: string, @Body() body: any) { return run(() => this.svc.cancel(actorOf(req), this.scope(req), id, body?.reason)); }
}

/** Atlantis admins (and the owner, via RolesGuard) — any product; responses carry net and buyer prices. */
@Controller('admin/promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPromotionsController {
    constructor(private readonly svc: PromotionsService) {}
    private readonly scope: Scope = { kind: 'admin' };

    @Get()
    list(@Query() q: any) { return run(() => this.svc.list(this.scope, q)); }

    @Get('products')
    products(@Query('q') q?: string) { return run(() => this.svc.eligibleProducts(this.scope, { q })); }

    @Get(':id')
    one(@Param('id') id: string) { return run(() => this.svc.get(this.scope, id)); }

    @Post()
    create(@Request() req, @Body() body: any) { return run(() => this.svc.create(actorOf(req), this.scope, body)); }

    @Patch(':id')
    update(@Request() req, @Param('id') id: string, @Body() body: any) { return run(() => this.svc.update(actorOf(req), this.scope, id, body)); }

    @Post(':id/cancel')
    cancel(@Request() req, @Param('id') id: string, @Body() body: any) { return run(() => this.svc.cancel(actorOf(req), this.scope, id, body?.reason)); }
}
