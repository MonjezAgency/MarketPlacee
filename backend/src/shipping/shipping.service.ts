import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface ShippingQuote {
    id: string;
    name: string;
    logoUrl: string;
    cost: number;
    currency: string;
    estimatedDays: string;
    serviceType: string;
    note: string | null;
}

export interface ShippingAgentInput {
    productIds: string[];
    quantities: Record<string, number>;   // productId → qty
    destinationCity: string;
    destinationCountry: string;
    destinationPostalCode?: string;
}

interface EuropeanZone {
    factor: number;
    label: string;
}

@Injectable()
export class ShippingService {
    private readonly logger = new Logger(ShippingService.name);

    constructor(private prisma: PrismaService) {}

    // ─── Public: legacy endpoint (checkout simple) ──────────────────────────
    async getRates(cartTotal: number, destination: string, productIds?: string[]): Promise<ShippingQuote[]> {
        const baseWeight = cartTotal * 0.1;
        const { factor: distanceFactor, warehouseCity } = await this.resolveDistanceFactor(destination, productIds);
        return await this.buildQuotes(baseWeight, distanceFactor, warehouseCity);
    }

    // ─── Public: Agent endpoint — full address-aware pricing ────────────────
    async getAgentRates(input: ShippingAgentInput): Promise<ShippingQuote[]> {
        this.logger.log(`[ShippingAgent] Calculating rates → ${input.destinationCity}, ${input.destinationCountry}`);

        const [estimatedWeight, { factor, warehouseCity }] = await Promise.all([
            this.estimateWeightKg(input.productIds, input.quantities),
            this.resolveZoneByCountry(input.destinationCountry, input.productIds),
        ]);

        this.logger.log(`[ShippingAgent] Weight=${estimatedWeight}kg | Zone factor=${factor} | From: ${warehouseCity || 'unknown'}`);

        return await this.buildQuotes(estimatedWeight, factor, warehouseCity);
    }

    // ─── Agent: estimate shipment weight from products ──────────────────────
    private async estimateWeightKg(
        productIds: string[],
        quantities: Record<string, number>,
    ): Promise<number> {
        if (!productIds.length) return 10; // default 10 kg

        const products = await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, price: true, unit: true },
        });

        let totalKg = 0;
        for (const p of products) {
            const qty = quantities[p.id] || 1;
            // Heuristic: carton ≈ price×0.005 kg baseline, pallet ≈ ×3
            const unitMultiplier = p.unit?.toLowerCase().includes('pallet') ? 3
                : p.unit?.toLowerCase().includes('kg') ? 1
                : 0.5;
            totalKg += p.price * unitMultiplier * qty * 0.005;
        }

        return Math.max(1, parseFloat(totalKg.toFixed(2)));
    }

    // ─── Agent: resolve EU zone factor by destination country ───────────────
    private async resolveZoneByCountry(
        country: string,
        productIds?: string[],
    ): Promise<{ factor: number; warehouseCity: string }> {
        const countryLower = country.toLowerCase().trim();

        const EU_ZONES: Record<string, EuropeanZone> = {
            // Zone 1 — Central Europe (Romania origin focus)
            romania: { factor: 1.0, label: 'Zone 1 — Central EU' },
            hungary: { factor: 1.1, label: 'Zone 1 — Central EU' },
            bulgaria: { factor: 1.1, label: 'Zone 1 — Central EU' },
            moldova: { factor: 1.1, label: 'Zone 1 — Central EU' },
            serbia: { factor: 1.2, label: 'Zone 1 — Central EU' },
            // Zone 2 — Western Europe
            germany: { factor: 1.3, label: 'Zone 2 — Western EU' },
            france:  { factor: 1.4, label: 'Zone 2 — Western EU' },
            austria: { factor: 1.3, label: 'Zone 2 — Western EU' },
            italy:   { factor: 1.4, label: 'Zone 2 — Western EU' },
            poland:  { factor: 1.2, label: 'Zone 2 — Western EU' },
            netherlands: { factor: 1.5, label: 'Zone 2 — Western EU' },
            belgium: { factor: 1.5, label: 'Zone 2 — Western EU' },
            spain:   { factor: 1.6, label: 'Zone 3 — Southern EU' },
            portugal:{ factor: 1.7, label: 'Zone 3 — Southern EU' },
            // Zone 4 — Northern Europe
            sweden:  { factor: 1.6, label: 'Zone 4 — Northern EU' },
            denmark: { factor: 1.5, label: 'Zone 4 — Northern EU' },
            finland: { factor: 1.7, label: 'Zone 4 — Northern EU' },
            norway:  { factor: 1.8, label: 'Zone 4 — Northern EU' },
            // Zone 5 — International
            'united kingdom': { factor: 2.0, label: 'Zone 5 — International' },
            uk: { factor: 2.0, label: 'Zone 5 — International' },
        };

        const zone = EU_ZONES[countryLower] ?? { factor: 2.5, label: 'Zone 5 — International' };

        let warehouseCity = '';
        if (productIds?.length) {
            const products = await this.prisma.product.findMany({
                where: { id: { in: productIds } },
                include: { warehouse: true },
            });
            const warehouse = products.map(p => p.warehouse).find(Boolean);
            if (warehouse) warehouseCity = warehouse.city;
        }

        this.logger.log(`[ShippingAgent] Country="${country}" → ${zone.label} (factor=${zone.factor})`);
        return { factor: zone.factor, warehouseCity };
    }

    // ─── Legacy: simple destination string → factor ─────────────────────────
    private async resolveDistanceFactor(
        destination: string,
        productIds?: string[],
    ): Promise<{ factor: number; warehouseCity: string }> {
        let factor = 1.0;
        let warehouseCity = '';

        if (productIds?.length) {
            const products = await this.prisma.product.findMany({
                where: { id: { in: productIds } },
                include: { warehouse: true },
            });
            const warehouses = products.map(p => p.warehouse).filter(Boolean);
            if (warehouses.length > 0) {
                const warehouse = warehouses[0];
                warehouseCity = warehouse.city.toLowerCase();
                const dest = destination.toLowerCase();
                if (dest.includes(warehouseCity)) factor = 0.5;
                else if (dest.includes(warehouse.country.toLowerCase())) factor = 1.0;
                else factor = 2.0;
            }
        } else {
            factor = destination.length > 10 ? 1.5 : 1.0;
        }

        return { factor, warehouseCity };
    }

    // ─── Build quotes from weight + zone factor ──────────────────────────────
    private async buildQuotes(weightKg: number, factor: number, warehouseCity: string): Promise<ShippingQuote[]> {
        const note = warehouseCity ? `Dispatched from: ${warehouseCity}` : null;
        const currency = (process.env.DEFAULT_CURRENCY || 'eur').toUpperCase();

        // Fetch Shipping Markup from DB
        const config = await this.prisma.appConfig.findUnique({ where: { key: 'SHIPPING_MARKUP' } });
        const shippingMarkup = config?.value ? parseFloat(config.value) : 1.15; // default 15% if not set
        const finalMarkup = isNaN(shippingMarkup) ? 1.15 : shippingMarkup;

        // DB SCHENKER — Road & Express, strong in Central/Eastern EU
        const schenkerCost = parseFloat(((45 + weightKg * 1.8) * factor * finalMarkup).toFixed(2));
        // LKW WALTER — Road freight specialist, best for heavy loads
        const walterCost   = parseFloat(((38 + weightKg * 2.1) * factor * finalMarkup).toFixed(2));
        // Raben Group — Eastern EU specialist, fastest in region
        const rabenCost    = parseFloat(((42 + weightKg * 1.9) * factor * finalMarkup).toFixed(2));

        return [
            {
                id: 'db_schenker',
                name: 'DB SCHENKER',
                logoUrl: '/logos/db-schenker.png',
                cost: schenkerCost,
                currency,
                estimatedDays: factor <= 1.0 ? '2-3' : factor <= 1.5 ? '3-5' : '5-8',
                serviceType: 'Standard Road Freight',
                note,
            },
            {
                id: 'lkw_walter',
                name: 'LKW WALTER',
                logoUrl: '/logos/lkw-walter.png',
                cost: walterCost,
                currency,
                estimatedDays: factor <= 1.0 ? '3-4' : factor <= 1.5 ? '4-6' : '7-10',
                serviceType: 'Full Truckload / LTL',
                note,
            },
            {
                id: 'raben_group',
                name: 'Raben Group',
                logoUrl: '/logos/raben-group.png',
                cost: rabenCost,
                currency,
                estimatedDays: factor <= 1.0 ? '1-2' : factor <= 1.5 ? '2-4' : '4-6',
                serviceType: 'Express EU Delivery',
                note,
            },
        ];
    }
}
