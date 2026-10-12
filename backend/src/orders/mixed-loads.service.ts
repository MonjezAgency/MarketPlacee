import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AppConfigService } from '../admin/app-config.service';
import { LoadKind, LoadLineInput, Markups, PricingError, PricingProduct, priceLoad, PricedLoad } from './pricing';

const PRODUCT_PRICING_SELECT = {
    id: true, name: true, price: true, basePrice: true, unitsPerCase: true, casesPerPallet: true,
    palletsPerShipment: true, moq: true, moqUnit: true, status: true, supplierId: true, exwLocation: true,
    variantPrices: true, variants: true, images: true, ean: true, brand: true, shelfLife: true, leadTime: true, readyForDispatch: true, origin: true,
    warehouse: { select: { id: true, city: true, country: true } },
} as const;

/** Turn pricing rule violations into 400s the storefront can show verbatim. */
export function asHttp(e: unknown): never {
    if (e instanceof PricingError) throw new BadRequestException({ code: e.code, message: e.message, ...e.detail });
    throw e;
}

@Injectable()
export class MixedLoadsService {
    constructor(private prisma: PrismaService, private appConfig: AppConfigService) {}

    async markups(): Promise<Markups> {
        const m = await this.appConfig.getMarkupPercentage();
        return { piece: m.piece, pallet: m.pallet, container: m.container, mix: m.mix };
    }

    /** Optional admin rule (AppConfig MIX_MIN_FILL_PERCENT, 1–100). Not set = no minimum fill. */
    async requiredFill(): Promise<number> {
        const row = await this.prisma.appConfig.findUnique({ where: { key: 'MIX_MIN_FILL_PERCENT' } }).catch(() => null);
        const n = row ? parseFloat(row.value) : NaN;
        return Number.isFinite(n) && n > 0 && n <= 100 ? n / 100 : 0;
    }

    async loadProducts(ids: string[], db: any = this.prisma): Promise<Map<string, PricingProduct & { images?: string[]; ean?: string | null; brand?: string | null }>> {
        const rows = ids.length ? await db.product.findMany({ where: { id: { in: [...new Set(ids)] } }, select: PRODUCT_PRICING_SELECT }) : [];
        return new Map(rows.map((r: any) => [r.id, r]));
    }

    async price(kind: LoadKind, lines: LoadLineInput[], db: any = this.prisma): Promise<PricedLoad> {
        const [products, m, requiredFill] = await Promise.all([this.loadProducts((lines || []).map((l) => l?.productId), db), this.markups(), this.requiredFill()]);
        try { return priceLoad(kind, lines || [], products, m, { requiredFill }); } catch (e) { asHttp(e); }
    }

    private async decorate(load: any) {
        const lines = (load.lines as LoadLineInput[]) || [];
        const priced = await this.price(load.kind, lines).catch((e) => ({ error: e?.response ?? { message: e?.message } }));
        const products = await this.loadProducts(lines.map((l) => l.productId));
        return {
            id: load.id, kind: load.kind, status: load.status, version: load.version, supplierId: load.supplierId,
            createdAt: load.createdAt, updatedAt: load.updatedAt,
            products: Object.fromEntries([...products.values()].map((p) => [p.id, {
                id: p.id, name: p.name, brand: p.brand ?? null, ean: p.ean ?? null, image: p.images?.[0] ?? null,
                unitsPerCase: p.unitsPerCase ?? null, casesPerPallet: p.casesPerPallet ?? null, palletsPerShipment: p.palletsPerShipment ?? null,
                leadTime: (p as any).leadTime ?? null, readyForDispatch: !!(p as any).readyForDispatch, exwLocation: p.exwLocation ?? null,
                dispatch: p.warehouse?.id ? [p.warehouse.city, p.warehouse.country].filter(Boolean).join(', ') || null : (p.exwLocation?.trim() || null),
            }])),
            ...(('error' in (priced as any)) ? { error: (priced as any).error, ready: false } : { quote: priced }),
        };
    }

    async list(customerId: string) {
        const rows = await this.prisma.mixedLoad.findMany({ where: { customerId, status: 'DRAFT' }, orderBy: { createdAt: 'asc' } });
        return Promise.all(rows.map((r) => this.decorate(r)));
    }

    async get(customerId: string, id: string) {
        const row = await this.prisma.mixedLoad.findFirst({ where: { id, customerId } });
        if (!row) throw new NotFoundException('Mixed load not found');
        return this.decorate(row);
    }

    async create(customerId: string, kind: LoadKind, lines: LoadLineInput[] = []) {
        if (kind !== 'PALLET' && kind !== 'TRUCK') throw new BadRequestException({ code: 'INVALID_LOAD', message: 'kind must be PALLET or TRUCK' });
        if (!Array.isArray(lines) || lines.length === 0) throw new BadRequestException({ code: 'EMPTY_SELECTION', message: 'Select at least one product for the mix.' });
        const priced = await this.price(kind, lines);
        const normalised = priced.lines.map(({ productId, variant, quantity }) => ({ productId, variant: variant ?? null, quantity }));
        // Double-click / retry guard: an identical draft created moments ago is returned instead of a duplicate.
        const recent = await this.prisma.mixedLoad.findFirst({ where: { customerId, kind, status: 'DRAFT', createdAt: { gte: new Date(Date.now() - 15_000) } }, orderBy: { createdAt: 'desc' } });
        if (recent && JSON.stringify(recent.lines) === JSON.stringify(normalised)) return this.decorate(recent);
        const row = await this.prisma.mixedLoad.create({
            data: { customerId, kind, supplierId: priced.supplierId, lines: normalised as any },
        });
        return this.decorate(row);
    }

    /** Replace all lines. `version` must match what the client last read (optimistic concurrency). */
    async replaceLines(customerId: string, id: string, lines: LoadLineInput[], version: number) {
        const row = await this.prisma.mixedLoad.findFirst({ where: { id, customerId } });
        if (!row) throw new NotFoundException('Mixed load not found');
        if (row.status !== 'DRAFT') throw new ConflictException({ code: 'LOAD_LOCKED', message: 'This mixed load has already been ordered.' });
        const priced = await this.price(row.kind as LoadKind, lines);
        const res = await this.prisma.mixedLoad.updateMany({
            where: { id, customerId, status: 'DRAFT', version: Number(version) },
            data: { lines: priced.lines.map(({ productId, variant, quantity }) => ({ productId, variant: variant ?? null, quantity })) as any, supplierId: priced.supplierId, version: { increment: 1 } },
        });
        if (res.count === 0) throw new ConflictException({ code: 'STALE_VERSION', message: 'This mixed load changed in another tab — reload and try again.' });
        return this.get(customerId, id);
    }

    /** Add (or increase) one product line in a SPECIFIC load the buyer is looking at, or start a new one. */
    async addLine(customerId: string, kind: LoadKind, line: LoadLineInput, loadId?: string) {
        if (loadId) {
            const row = await this.prisma.mixedLoad.findFirst({ where: { id: loadId, customerId, status: 'DRAFT' } });
            if (!row) throw new NotFoundException('Mixed load not found');
            return this.replaceLines(customerId, row.id, [...((row.lines as any[]) || []), line], row.version);
        }
        return this.create(customerId, kind, [line]);
    }

    async remove(customerId: string, id: string) {
        const res = await this.prisma.mixedLoad.deleteMany({ where: { id, customerId, status: 'DRAFT' } });
        if (res.count === 0) throw new NotFoundException('Mixed load not found');
        return { ok: true };
    }
}
