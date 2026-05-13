import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AppConfigService {
    constructor(private prisma: PrismaService) { }

    async getMarkupPercentage(): Promise<{ piece: number; pallet: number; container: number; platformFee: number; shippingMarkup: number }> {
        const pieceConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_PIECE' } });
        const legacyConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE' } });
        const palletConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_PALLET' } });
        const containerConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_CONTAINER' } });
        const feeConfig = await this.prisma.appConfig.findUnique({ where: { key: 'PLATFORM_FEE_PERCENT' } });
        const shipConfig = await this.prisma.appConfig.findUnique({ where: { key: 'SHIPPING_MARKUP' } });

        const piece = pieceConfig ? parseFloat(pieceConfig.value) : (legacyConfig ? parseFloat(legacyConfig.value) : 1.10);
        const pallet = palletConfig ? parseFloat(palletConfig.value) : 1.05;
        const container = containerConfig ? parseFloat(containerConfig.value) : 1.02;
        const platformFee = feeConfig ? parseFloat(feeConfig.value) : (Number(process.env.PLATFORM_FEE_PERCENT) || 5);
        const shippingMarkup = shipConfig ? parseFloat(shipConfig.value) : 1.10; // Default 10% on shipping

        // Sanity-clamp markup multipliers to >= 1.0. The DB occasionally
        // ends up with bogus values (an exchange rate "0.019" written into
        // MARKUP_PERCENTAGE_PIECE, or a percentage "5" instead of "1.05").
        // Values below 1.0 would shrink prices, which is never what we want.
        const safe = (v: number, fallback: number) =>
            !isFinite(v) || isNaN(v) || v < 1.0 ? fallback : v;

        return {
            piece: safe(piece, 1.10),
            pallet: safe(pallet, 1.05),
            container: safe(container, 1.02),
            platformFee: isNaN(platformFee) ? 5 : platformFee,
            shippingMarkup: safe(shippingMarkup, 1.10),
        };
    }

    async setMarkupPercentage(data: { piece: number; pallet: number; container: number; platformFee?: number; shippingMarkup?: number }): Promise<any> {
        // Reject obviously-broken markup values at write time so the DB
        // can't re-acquire the "0.019 markup" corruption that broke the
        // catalog earlier. A markup multiplier MUST be >= 1.0.
        const guard = (label: string, v: number) => {
            if (!isFinite(v) || isNaN(v) || v < 1.0) {
                throw new BadRequestException(
                    `Invalid ${label} markup: ${v}. Markup must be a multiplier >= 1.0 ` +
                    `(e.g. 1.05 = +5%). If you meant a percentage, divide by 100 and add 1 first.`
                );
            }
        };
        guard('piece', data.piece);
        guard('pallet', data.pallet);
        guard('container', data.container);
        if (data.shippingMarkup !== undefined) guard('shipping', data.shippingMarkup);

        await this.prisma.appConfig.upsert({
            where: { key: 'MARKUP_PERCENTAGE_PIECE' },
            create: { key: 'MARKUP_PERCENTAGE_PIECE', value: data.piece.toString() },
            update: { value: data.piece.toString() }
        });
        await this.prisma.appConfig.upsert({
            where: { key: 'MARKUP_PERCENTAGE' }, // Keep legacy updated just in case
            create: { key: 'MARKUP_PERCENTAGE', value: data.piece.toString() },
            update: { value: data.piece.toString() }
        });
        await this.prisma.appConfig.upsert({
            where: { key: 'MARKUP_PERCENTAGE_PALLET' },
            create: { key: 'MARKUP_PERCENTAGE_PALLET', value: data.pallet.toString() },
            update: { value: data.pallet.toString() }
        });
        await this.prisma.appConfig.upsert({
            where: { key: 'MARKUP_PERCENTAGE_CONTAINER' },
            create: { key: 'MARKUP_PERCENTAGE_CONTAINER', value: data.container.toString() },
            update: { value: data.container.toString() }
        });
        if (data.platformFee !== undefined) {
            await this.prisma.appConfig.upsert({
                where: { key: 'PLATFORM_FEE_PERCENT' },
                create: { key: 'PLATFORM_FEE_PERCENT', value: data.platformFee.toString() },
                update: { value: data.platformFee.toString() }
            });
        }
        if (data.shippingMarkup !== undefined) {
            await this.prisma.appConfig.upsert({
                where: { key: 'SHIPPING_MARKUP' },
                create: { key: 'SHIPPING_MARKUP', value: data.shippingMarkup.toString() },
                update: { value: data.shippingMarkup.toString() }
            });
        }
        return true;
    }

    async getAllProducts() {
        return this.prisma.product.findMany({
            include: { supplier: true },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getPendingProducts() {
        return this.prisma.product.findMany({
            where: { status: ProductStatus.PENDING },
            include: { supplier: true }
        });
    }

    async approveProduct(id: string) {
        const product = await this.prisma.product.findUnique({ where: { id } });
        if (!product) throw new NotFoundException('Product not found');

        return this.prisma.product.update({
            where: { id },
            data: { status: ProductStatus.APPROVED }
            // Note: price is already multiplied by markup during creation,
            // so we just approve it here. If markup changes later, we may need a recalculate endpoint.
        });
    }

    async rejectProduct(id: string, reason: string) {
        return this.prisma.product.update({
            where: { id },
            data: {
                status: ProductStatus.REJECTED,
                adminNotes: reason
            }
        });
    }

    async getHomepageCategories() {
        const config = await this.prisma.appConfig.findUnique({
            where: { key: 'HOMEPAGE_CATEGORIES' }
        });
        if (!config || !config.value) {
            return null;
        }
        try {
            return JSON.parse(config.value);
        } catch (e) {
            return null;
        }
    }

    async setHomepageCategories(data: any): Promise<any> {
        return this.prisma.appConfig.upsert({
            where: { key: 'HOMEPAGE_CATEGORIES' },
            create: { key: 'HOMEPAGE_CATEGORIES', value: JSON.stringify(data) },
            update: { value: JSON.stringify(data) }
        });
    }

    async getAllowedBrands(): Promise<string[]> {
        const config = await this.prisma.appConfig.findUnique({
            where: { key: 'ALLOWED_BRANDS' }
        });
        if (!config || !config.value) {
            return [];
        }
        try {
            return JSON.parse(config.value);
        } catch (e) {
            return [];
        }
    }

    async setAllowedBrands(brands: string[]): Promise<any> {
        return this.prisma.appConfig.upsert({
            where: { key: 'ALLOWED_BRANDS' },
            create: { key: 'ALLOWED_BRANDS', value: JSON.stringify(brands) },
            update: { value: JSON.stringify(brands) }
        });
    }

    async setPlatformCurrency(currency: string | null): Promise<any> {
        if (!currency) {
            return this.prisma.appConfig.deleteMany({ where: { key: 'PLATFORM_CURRENCY' } });
        }
        return this.prisma.appConfig.upsert({
            where: { key: 'PLATFORM_CURRENCY' },
            create: { key: 'PLATFORM_CURRENCY', value: currency },
            update: { value: currency }
        });
    }
    async getDefaultDisplayUnit(): Promise<string> {
        const config = await this.prisma.appConfig.findUnique({ where: { key: 'DEFAULT_DISPLAY_UNIT' } });
        return config?.value || 'truck';
    }

    async setDefaultDisplayUnit(unit: string): Promise<any> {
        const allowed = ['truck', 'pallet', 'carton'];
        const value = allowed.includes(unit) ? unit : 'truck';
        return this.prisma.appConfig.upsert({
            where: { key: 'DEFAULT_DISPLAY_UNIT' },
            create: { key: 'DEFAULT_DISPLAY_UNIT', value },
            update: { value }
        });
    }

    async getAdPlacements() {
        const config = await this.prisma.appConfig.findUnique({
            where: { key: 'AD_PLACEMENTS' }
        });
        if (!config || !config.value) return null;
        try {
            return JSON.parse(config.value);
        } catch (e) {
            return null;
        }
    }

    /**
     * Homepage banner map — the visual placement editor at /admin/banners.
     * Stores a JSON map keyed by slot id ("hero", "promo-1", "promo-2", …)
     * with { imageUrl, linkUrl, alt, updatedAt }. Public readers fetch
     * via /config/homepage-banners; admin reads + writes via the
     * /admin/config/homepage-banners endpoint pair.
     */
    async getHomepageBanners(): Promise<Record<string, any>> {
        const config = await this.prisma.appConfig.findUnique({
            where: { key: 'HOMEPAGE_BANNERS' },
        });
        if (!config || !config.value) return {};
        try { return JSON.parse(config.value); } catch { return {}; }
    }

    async setHomepageBanners(data: Record<string, any>) {
        // Drop empty slots so the JSON stays compact. An empty string
        // / null in imageUrl deletes the slot from the saved map.
        const cleaned: Record<string, any> = {};
        for (const [slot, value] of Object.entries(data || {})) {
            if (!value || typeof value !== 'object') continue;
            if (!('imageUrl' in value) || !value.imageUrl) continue;
            cleaned[slot] = {
                imageUrl: String(value.imageUrl),
                linkUrl: value.linkUrl ? String(value.linkUrl) : null,
                alt: value.alt ? String(value.alt) : '',
                updatedAt: new Date().toISOString(),
            };
        }
        await this.prisma.appConfig.upsert({
            where: { key: 'HOMEPAGE_BANNERS' },
            create: { key: 'HOMEPAGE_BANNERS', value: JSON.stringify(cleaned) },
            update: { value: JSON.stringify(cleaned) },
        });
        return cleaned;
    }

    async setAdPlacements(data: any) {
        return this.prisma.appConfig.upsert({
            where: { key: 'AD_PLACEMENTS' },
            create: { key: 'AD_PLACEMENTS', value: JSON.stringify(data) },
            update: { value: JSON.stringify(data) }
        });
    }

    // ── Terms & Conditions (markdown body + version label) ────────────────
    async getTerms() {
        const [body, version, updatedAt] = await Promise.all([
            this.prisma.appConfig.findUnique({ where: { key: 'TERMS_CONTENT' } }),
            this.prisma.appConfig.findUnique({ where: { key: 'TERMS_VERSION' } }),
            this.prisma.appConfig.findUnique({ where: { key: 'TERMS_UPDATED_AT' } }),
        ]);
        return {
            content: body?.value ?? '',
            version: version?.value ?? 'v1.0',
            updatedAt: updatedAt?.value ?? null,
        };
    }

    async setTerms(content: string, version?: string) {
        const now = new Date().toISOString();
        const v = version || `v${Math.floor(Date.now() / 1000)}`;
        await this.prisma.appConfig.upsert({
            where: { key: 'TERMS_CONTENT' },
            create: { key: 'TERMS_CONTENT', value: content },
            update: { value: content },
        });
        await this.prisma.appConfig.upsert({
            where: { key: 'TERMS_VERSION' },
            create: { key: 'TERMS_VERSION', value: v },
            update: { value: v },
        });
        await this.prisma.appConfig.upsert({
            where: { key: 'TERMS_UPDATED_AT' },
            create: { key: 'TERMS_UPDATED_AT', value: now },
            update: { value: now },
        });
        return { content, version: v, updatedAt: now };
    }
}
