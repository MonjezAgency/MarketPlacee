import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MixedLoadsService } from './mixed-loads.service';

/**
 * Mixed pallets / truckloads for the signed-in buyer. Every write is
 * validated and priced server-side; the response always carries the
 * server quote so the storefront never computes totals on its own.
 */
@Controller('mixed-loads')
@UseGuards(JwtAuthGuard)
export class MixedLoadsController {
    constructor(private readonly loads: MixedLoadsService) {}

    /** Price a hypothetical load without saving it. */
    @Post('quote')
    quote(@Body() body: { kind: 'PALLET' | 'TRUCK'; lines: { productId: string; variant?: string; quantity: number }[] }) {
        return this.loads.price(body?.kind, body?.lines || []);
    }

    /** Create a new load from exactly the lines the buyer selected (nothing else is added). */
    @Post()
    create(@Request() req, @Body() body: { kind: 'PALLET' | 'TRUCK'; lines: { productId: string; variant?: string | null; quantity: number }[] }) {
        return this.loads.create(req.user.sub, body?.kind, (body?.lines || []).map((l) => ({ productId: l?.productId, variant: l?.variant ?? null, quantity: Number(l?.quantity) })));
    }

    @Get()
    list(@Request() req) {
        return this.loads.list(req.user.sub);
    }

    @Get(':id')
    get(@Request() req, @Param('id') id: string) {
        return this.loads.get(req.user.sub, id);
    }

    /** Add a product to the buyer's open load of this kind (creates one when needed). */
    @Post('lines')
    addLine(@Request() req, @Body() body: { kind: 'PALLET' | 'TRUCK'; productId: string; variant?: string; quantity: number; loadId?: string }) {
        return this.loads.addLine(req.user.sub, body?.kind, { productId: body?.productId, variant: body?.variant ?? null, quantity: Number(body?.quantity) }, body?.loadId);
    }

    @Put(':id')
    replace(@Request() req, @Param('id') id: string, @Body() body: { lines: { productId: string; variant?: string; quantity: number }[]; version: number }) {
        return this.loads.replaceLines(req.user.sub, id, body?.lines || [], Number(body?.version));
    }

    @Delete(':id')
    remove(@Request() req, @Param('id') id: string) {
        return this.loads.remove(req.user.sub, id);
    }
}
