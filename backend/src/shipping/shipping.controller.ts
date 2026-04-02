import { Controller, Get, Query, Param, NotFoundException } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { DhlProvider, AramexProvider } from './shipping.provider';

@Controller('shipping')
export class ShippingController {
    constructor(
        private readonly shippingService: ShippingService,
        private readonly dhl: DhlProvider,
        private readonly aramex: AramexProvider,
    ) { }

    /** Platform shipping rates (used at checkout) */
    @Get('rates')
    async getRates(
        @Query('cartTotal') cartTotal: string,
        @Query('destination') destination: string,
    ) {
        const total = parseFloat(cartTotal) || 100;
        const dest = destination || 'Default';
        return this.shippingService.getRates(total, dest);
    }

    /** Carrier rates — returns live quotes from DHL + Aramex */
    @Get('carrier-rates')
    async getCarrierRates(
        @Query('from') from: string,
        @Query('to') to: string,
        @Query('weightKg') weightKg: string,
    ) {
        const weight = parseFloat(weightKg || '1');
        const [dhlRates, aramexRates] = await Promise.allSettled([
            this.dhl.getRates(from || 'AE', to || 'US', weight),
            this.aramex.getRates(from || 'AE', to || 'US', weight),
        ]);
        return [
            ...(dhlRates.status    === 'fulfilled' ? dhlRates.value    : []),
            ...(aramexRates.status === 'fulfilled' ? aramexRates.value : []),
        ];
    }

    /** Track a shipment — auto-detects carrier from trackingId prefix */
    @Get('track/:trackingId')
    async track(@Param('trackingId') trackingId: string) {
        const upper = trackingId.toUpperCase();
        if (upper.startsWith('DHL') || upper.startsWith('1Z') || upper.length === 10) {
            return this.dhl.trackShipment(trackingId);
        }
        if (upper.startsWith('ARX') || upper.startsWith('6')) {
            return this.aramex.trackShipment(trackingId);
        }
        // Try both, return whichever responds
        const [dhlResult, aramexResult] = await Promise.allSettled([
            this.dhl.trackShipment(trackingId),
            this.aramex.trackShipment(trackingId),
        ]);
        if (dhlResult.status === 'fulfilled') return dhlResult.value;
        if (aramexResult.status === 'fulfilled') return aramexResult.value;
        throw new NotFoundException('Shipment not found with any carrier');
    }
}
