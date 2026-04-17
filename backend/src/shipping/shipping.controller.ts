import { Controller, Get, Post, Query, Param, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';
import { ShippingService, ShippingAgentInput } from './shipping.service';
import { DhlProvider, AramexProvider } from './shipping.provider';

class AgentRatesDto {
    @IsArray()
    productIds: string[];

    @IsObject()
    quantities: Record<string, number>;

    @IsString()
    destinationCity: string;

    @IsString()
    destinationCountry: string;

    @IsString()
    @IsOptional()
    destinationPostalCode?: string;
}

@Controller('shipping')
export class ShippingController {
    constructor(
        private readonly shippingService: ShippingService,
        private readonly dhl: DhlProvider,
        private readonly aramex: AramexProvider,
    ) { }

    /** Platform shipping rates (used at checkout — legacy) */
    @Get('rates')
    async getRates(
        @Query('cartTotal') cartTotal: string,
        @Query('destination') destination: string,
    ) {
        const total = parseFloat(cartTotal) || 100;
        const dest = destination || 'Default';
        return this.shippingService.getRates(total, dest);
    }

    /**
     * Agent-powered shipping rates — uses real product list + destination country
     * to calculate weight-aware quotes from DB Schenker, LKW Walter, Raben Group.
     *
     * POST /shipping/agent-rates
     * Body: { productIds, quantities, destinationCity, destinationCountry }
     */
    @Post('agent-rates')
    async getAgentRates(@Body() body: AgentRatesDto) {
        if (!body.destinationCountry) {
            throw new BadRequestException('destinationCountry is required');
        }
        const input: ShippingAgentInput = {
            productIds: body.productIds || [],
            quantities: body.quantities || {},
            destinationCity: body.destinationCity || '',
            destinationCountry: body.destinationCountry,
            destinationPostalCode: body.destinationPostalCode,
        };
        return this.shippingService.getAgentRates(input);
    }

    /** Carrier rates — returns live quotes from DHL + Aramex */
    @Get('carrier-rates')
    async getCarrierRates(
        @Query('from') from: string,
        @Query('to') to: string,
        @Query('weightKg') weightKg: string,
    ) {
        // Legacy carrier-rates endpoint — returns empty until provider APIs are configured
        return [];
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
        const [dhlResult, aramexResult] = await Promise.allSettled([
            this.dhl.trackShipment(trackingId),
            this.aramex.trackShipment(trackingId),
        ]);
        if (dhlResult.status === 'fulfilled') return dhlResult.value;
        if (aramexResult.status === 'fulfilled') return aramexResult.value;
        throw new NotFoundException('Shipment not found with any carrier');
    }
}
