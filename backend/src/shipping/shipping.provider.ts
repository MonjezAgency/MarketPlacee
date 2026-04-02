/**
 * Shipping Provider Interface
 * ────────────────────────────────────────────────────────────────────
 * All shipping carriers (DHL, Aramex, etc.) implement this interface.
 * The ShippingService picks the right provider based on the carrier name.
 * Swap or add carriers without touching business logic.
 */

export interface TrackingResult {
    carrier:    string;
    trackingId: string;
    status:     string;
    location:   string | null;
    estimatedDelivery: string | null;
    events:     { timestamp: string; description: string; location: string }[];
}

export interface ShipmentRate {
    carrier:       string;
    service:       string;
    estimatedDays: number;
    priceCents:    number;
    currency:      string;
}

export interface CreateShipmentResult {
    trackingId:  string;
    labelUrl:    string | null;
    carrier:     string;
}

export interface ShippingProvider {
    readonly name: string;
    getRates(from: string, to: string, weightKg: number): Promise<ShipmentRate[]>;
    createShipment(orderId: string, from: string, to: string, weightKg: number): Promise<CreateShipmentResult>;
    trackShipment(trackingId: string): Promise<TrackingResult>;
}


// ─── DHL Stub ────────────────────────────────────────────────────────────────
// Replace the stub bodies with real DHL Express API calls when credentials are ready.
// Docs: https://developer.dhl.com/api-reference/dhl-express

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DhlProvider implements ShippingProvider {
    readonly name = 'DHL';
    private readonly logger = new Logger('DHL');

    private get apiKey() { return process.env.DHL_API_KEY; }
    private get baseUrl() { return 'https://api.dhl.com/dhl-express/v1'; }

    async getRates(from: string, to: string, weightKg: number): Promise<ShipmentRate[]> {
        if (!this.apiKey) {
            this.logger.warn('DHL_API_KEY not set — returning stub rates');
            return [{ carrier: 'DHL', service: 'EXPRESS WORLDWIDE', estimatedDays: 3, priceCents: 2500, currency: 'USD' }];
        }
        // TODO: call DHL Rates API
        return [];
    }

    async createShipment(orderId: string, from: string, to: string, weightKg: number): Promise<CreateShipmentResult> {
        if (!this.apiKey) {
            this.logger.warn('DHL_API_KEY not set — returning stub shipment');
            return { trackingId: `DHL-STUB-${orderId.slice(-8).toUpperCase()}`, labelUrl: null, carrier: 'DHL' };
        }
        // TODO: call DHL Shipment creation API
        return { trackingId: '', labelUrl: null, carrier: 'DHL' };
    }

    async trackShipment(trackingId: string): Promise<TrackingResult> {
        if (!this.apiKey) {
            return { carrier: 'DHL', trackingId, status: 'STUB', location: null, estimatedDelivery: null, events: [] };
        }
        // TODO: call DHL Tracking API  GET /tracking?trackingNumber={trackingId}
        return { carrier: 'DHL', trackingId, status: 'UNKNOWN', location: null, estimatedDelivery: null, events: [] };
    }
}


// ─── Aramex Stub ─────────────────────────────────────────────────────────────
// Replace the stub bodies with real Aramex API calls when credentials are ready.
// Docs: https://www.aramex.com/us/en/developers/apis

@Injectable()
export class AramexProvider implements ShippingProvider {
    readonly name = 'Aramex';
    private readonly logger = new Logger('Aramex');

    private get username()    { return process.env.ARAMEX_USERNAME; }
    private get password()    { return process.env.ARAMEX_PASSWORD; }
    private get accountNum()  { return process.env.ARAMEX_ACCOUNT_NUMBER; }

    async getRates(from: string, to: string, weightKg: number): Promise<ShipmentRate[]> {
        if (!this.username) {
            this.logger.warn('ARAMEX credentials not set — returning stub rates');
            return [{ carrier: 'Aramex', service: 'PRIORITY PARCEL EXPRESS', estimatedDays: 4, priceCents: 2200, currency: 'USD' }];
        }
        // TODO: call Aramex RateCalculator SOAP/REST endpoint
        return [];
    }

    async createShipment(orderId: string, from: string, to: string, weightKg: number): Promise<CreateShipmentResult> {
        if (!this.username) {
            return { trackingId: `ARX-STUB-${orderId.slice(-8).toUpperCase()}`, labelUrl: null, carrier: 'Aramex' };
        }
        // TODO: call Aramex CreateShipments endpoint
        return { trackingId: '', labelUrl: null, carrier: 'Aramex' };
    }

    async trackShipment(trackingId: string): Promise<TrackingResult> {
        if (!this.username) {
            return { carrier: 'Aramex', trackingId, status: 'STUB', location: null, estimatedDelivery: null, events: [] };
        }
        // TODO: call Aramex TrackShipments endpoint
        return { carrier: 'Aramex', trackingId, status: 'UNKNOWN', location: null, estimatedDelivery: null, events: [] };
    }
}
