import { Body, Controller, Get, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FulfillmentService } from './fulfillment.service';

/** Public: verified Ali FMCG hubs and the delivery countries (the Warehouses page). */
@Controller('fulfillment')
export class FulfillmentPublicController {
    constructor(private readonly svc: FulfillmentService) {}

    @Get('hubs')
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    hubs() {
        return this.svc.publicHubs();
    }
}

/** Supplier: own fulfilment defaults, per-product method and a price preview. Always scoped to the caller. */
@Controller('fulfillment/supplier')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPPLIER)
export class FulfillmentSupplierController {
    constructor(private readonly svc: FulfillmentService) {}

    @Get('settings')
    settings(@Request() req) { return this.svc.supplierSettings(req.user.sub); }

    @Put('settings')
    save(@Request() req, @Body() body: any) { return this.svc.updateSupplierSettings(req.user.sub, body); }

    @Patch('products/:id/method')
    method(@Request() req, @Param('id') id: string, @Body('method') method: string | null) { return this.svc.setProductMethod(req.user.sub, id, method); }

    @Post('preview')
    @Throttle({ default: { limit: 60, ttl: 60_000 } })
    preview(@Request() req, @Body() body: any) { return this.svc.supplierPreview(req.user.sub, body); }
}

/** Staff: hubs (verification is admin-only) and freight rates. */
@Controller('fulfillment/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FulfillmentAdminController {
    constructor(private readonly svc: FulfillmentService) {}

    @Get()
    @Roles(Role.ADMIN, Role.OWNER, Role.LOGISTICS)
    list() { return this.svc.adminList(); }

    @Post('hubs')
    @Roles(Role.ADMIN, Role.OWNER)
    createHub(@Request() req, @Body() body: any) { return this.svc.saveHub(req.user.sub, body); }

    @Patch('hubs/:id')
    @Roles(Role.ADMIN, Role.OWNER)
    updateHub(@Request() req, @Param('id') id: string, @Body() body: any) { return this.svc.saveHub(req.user.sub, body, id); }

    @Post('rates')
    @Roles(Role.ADMIN, Role.OWNER, Role.LOGISTICS)
    createRate(@Request() req, @Body() body: any) { return this.svc.saveRate(req.user.sub, body); }

    @Patch('rates/:id')
    @Roles(Role.ADMIN, Role.OWNER, Role.LOGISTICS)
    updateRate(@Request() req, @Param('id') id: string, @Body() body: any) { return this.svc.saveRate(req.user.sub, body, id); }
}
