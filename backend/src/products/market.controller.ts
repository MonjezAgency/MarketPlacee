import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TargetPricesService, TP_STAFF, type TargetPriceInput } from './target-prices.service';
import { PriceHistoryService } from './price-history.service';
import { OfferCompareService } from './offer-compare.service';

const viewerOf = (req: any) => (req?.user ? { id: req.user.sub, role: req.user.role } : null);

/** Buyer-facing market data: listed-price history for a product. */
@Controller('products')
export class PriceHistoryController {
    constructor(private readonly history: PriceHistoryService, private readonly offers: OfferCompareService) {}

    /** Other approved listings of the same barcode, for side-by-side comparison. */
    @Get(':id/compare')
    @UseGuards(OptionalJwtAuthGuard)
    compare(@Param('id') id: string, @Request() req) {
        return this.offers.compare(id, viewerOf(req));
    }

    @Get(':id/price-history')
    @UseGuards(OptionalJwtAuthGuard)
    get(@Param('id') id: string, @Query('months') months: string, @Request() req) {
        return this.history.history(id, viewerOf(req), Number(months));
    }
}

/** Target-price requests (buyer side + Atlantis operations side). */
@Controller('target-prices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TargetPricesController {
    constructor(private readonly svc: TargetPricesService) {}

    @Post()
    @Roles('CUSTOMER', 'SUPPLIER')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    create(@Request() req, @Body() body: TargetPriceInput) {
        return this.svc.create({ id: req.user.sub, role: req.user.role }, body || ({} as any));
    }

    @Get('mine')
    @Roles('CUSTOMER', 'SUPPLIER')
    mine(@Request() req) {
        return this.svc.mine(req.user.sub);
    }

    @Patch(':id/withdraw')
    @Roles('CUSTOMER', 'SUPPLIER')
    withdraw(@Request() req, @Param('id') id: string) {
        return this.svc.withdraw(req.user.sub, id);
    }

    @Get()
    @Roles(...(TP_STAFF as any))
    list(@Query() q: any) {
        return this.svc.list(q);
    }

    @Patch(':id/respond')
    @Roles(...(TP_STAFF as any))
    respond(@Request() req, @Param('id') id: string, @Body() body: any) {
        return this.svc.respond(req.user.sub, id, body);
    }
}
