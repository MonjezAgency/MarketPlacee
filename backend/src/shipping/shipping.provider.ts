/**
 * Shipping Provider Interface
 * All carriers implement this interface.
 * Add real API implementations when credentials are available.
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

import { Injectable, Logger } from '@nestjs/common';

// ─── DB Schenker Stub ────────────────────────────────────────────────────────
// Real API: https://developer.dbschenker.com
@Injectable()
export class DbSchenkerProvider implements ShippingProvider {
    readonly name = 'DB SCHENKER';
    private readonly logger = new Logger('DbSchenker');

    async getRates(_from: string, _to: string, _weightKg: number): Promise<ShipmentRate[]> {
        this.logger.warn('DB Schenker API not configured — using ShippingService pricing');
        return [];
    }

    async createShipment(orderId: string, _from: string, _to: string, _weightKg: number): Promise<CreateShipmentResult> {
        return { trackingId: `SCH-${orderId.slice(-8).toUpperCase()}`, labelUrl: null, carrier: this.name };
    }

    async trackShipment(trackingId: string): Promise<TrackingResult> {
        return { carrier: this.name, trackingId, status: 'IN_TRANSIT', location: null, estimatedDelivery: null, events: [] };
    }
}

// ─── LKW Walter Stub ─────────────────────────────────────────────────────────
// Real API: https://www.lkw-walter.com/en/services/digital-services
@Injectable()
export class LkwWalterProvider implements ShippingProvider {
    readonly name = 'LKW WALTER';
    private readonly logger = new Logger('LkwWalter');

    async getRates(_from: string, _to: string, _weightKg: number): Promise<ShipmentRate[]> {
        this.logger.warn('LKW Walter API not configured — using ShippingService pricing');
        return [];
    }

    async createShipment(orderId: string, _from: string, _to: string, _weightKg: number): Promise<CreateShipmentResult> {
        return { trackingId: `LKW-${orderId.slice(-8).toUpperCase()}`, labelUrl: null, carrier: this.name };
    }

    async trackShipment(trackingId: string): Promise<TrackingResult> {
        return { carrier: this.name, trackingId, status: 'IN_TRANSIT', location: null, estimatedDelivery: null, events: [] };
    }
}

// ─── Raben Group Stub ─────────────────────────────────────────────────────────
// Real API: https://www.raben-group.com/e-services
@Injectable()
export class RabenGroupProvider implements ShippingProvider {
    readonly name = 'Raben Group';
    private readonly logger = new Logger('RabenGroup');

    async getRates(_from: string, _to: string, _weightKg: number): Promise<ShipmentRate[]> {
        this.logger.warn('Raben Group API not configured — using ShippingService pricing');
        return [];
    }

    async createShipment(orderId: string, _from: string, _to: string, _weightKg: number): Promise<CreateShipmentResult> {
        return { trackingId: `RBN-${orderId.slice(-8).toUpperCase()}`, labelUrl: null, carrier: this.name };
    }

    async trackShipment(trackingId: string): Promise<TrackingResult> {
        return { carrier: this.name, trackingId, status: 'IN_TRANSIT', location: null, estimatedDelivery: null, events: [] };
    }
}

// Legacy stubs kept for backward-compat imports — not used in transport flow
@Injectable()
export class DhlProvider implements ShippingProvider {
    readonly name = 'DHL';
    async getRates(): Promise<ShipmentRate[]> { return []; }
    async createShipment(orderId: string): Promise<CreateShipmentResult> { return { trackingId: `DHL-${orderId.slice(-8)}`, labelUrl: null, carrier: 'DHL' }; }
    async trackShipment(trackingId: string): Promise<TrackingResult> { return { carrier: 'DHL', trackingId, status: 'UNKNOWN', location: null, estimatedDelivery: null, events: [] }; }
}

@Injectable()
export class AramexProvider implements ShippingProvider {
    readonly name = 'Aramex';
    async getRates(): Promise<ShipmentRate[]> { return []; }
    async createShipment(orderId: string): Promise<CreateShipmentResult> { return { trackingId: `ARX-${orderId.slice(-8)}`, labelUrl: null, carrier: 'Aramex' }; }
    async trackShipment(trackingId: string): Promise<TrackingResult> { return { carrier: 'Aramex', trackingId, status: 'UNKNOWN', location: null, estimatedDelivery: null, events: [] }; }
}
