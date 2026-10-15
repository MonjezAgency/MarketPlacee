import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AppConfigService } from '../admin/app-config.service';
import { LoadKind, LoadLineInput, Markups, PricingError, PricingProduct, basePerCase, priceLoad, PricedLoad, minUnits, variantSignatures } from './pricing';

const PRODUCT_PRICING_SELECT = {
    id: true, name: true, price: true, basePrice: true, unitsPerCase: true, casesPerPallet: true,
    palletsPerShipment: true, moq: true, moqUnit: true, status: true, stock: true, supplierId: true, exwLocation: true,
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

    /**
     * "Add Mix" candidates: the other variants of the SAME product (same
     * SKU — one Product row is one supplier listing on Atlantis) that can
     * still go in this load. Other products, other suppliers and other
     * listings are never offered. Each candidate has room left in the load
     * and stock left after what the load already takes. Buyer prices only.
     */
    async candidates(customerId: string, id: string, q?: string) {
        const row = await this.prisma.mixedLoad.findFirst({ where: { id, customerId, status: 'DRAFT' } });
        if (!row) throw new NotFoundException('Mixed load not found');
        const kind = row.kind as LoadKind;
        const lines = ((row.lines as any[]) || []) as LoadLineInput[];
        const products = await this.loadProducts(lines.map((l) => l.productId));
        const [m, priced] = await Promise.all([this.markups(), this.price(kind, lines).catch(() => null)]);
        const fillLeft = Math.max(0, 1 - (priced?.fill ?? 0));
        const empty = (reason: string) => ({ kind, items: [], reason });
        if (!products.size) return empty('Add a product first.');
        if (fillLeft <= 1e-9) return empty('This load is full.');
        const search = String(q ?? '').trim().toLowerCase().slice(0, 80);
        const items: any[] = [];
        for (const p of products.values() as any) {
            if (p.status !== 'APPROVED') continue;
            const taken = new Set(lines.filter((l) => l.productId === p.id).map((l) => l.variant || ''));
            const casesInLoad = (priced?.lines || []).filter((l) => l.productId === p.id).reduce((s, l) => s + l.cases, 0);
            const cap = kind === 'PALLET' ? Number(p.casesPerPallet) : Number(p.palletsPerShipment);
            const casesPerUnit = kind === 'PALLET' ? 1 : Number(p.casesPerPallet);
            const byRoom = Math.floor(fillLeft * cap + 1e-9);
            const byStock = typeof p.stock === 'number' ? Math.floor(Math.max(0, p.stock - casesInLoad) / casesPerUnit) : byRoom;
            const prices = p.variantPrices && typeof p.variantPrices === 'object' ? p.variantPrices : {};
            for (const sig of variantSignatures(p)) {
                if (taken.has(sig)) continue;
                const label = sig.split('|').map((x) => x.split('=').slice(1).join('=')).join(' · ');
                if (search && !`${p.name} ${label}`.toLowerCase().includes(search)) continue;
                const own = Number(prices[sig]);
                const casePrice = Math.round((Number.isFinite(own) && own > 0 ? own : basePerCase(p, m)) * m.mix * 10000) / 10000;
                const maxQuantity = Math.max(0, Math.min(byRoom, byStock));
                if (maxQuantity < 1) continue;
                items.push({
                    id: p.id, variant: sig, variantLabel: label, name: p.name, sku: `ATL-${String(p.id).slice(0, 8).toUpperCase()}`, supplier: 'Same supplier as this load',
                    brand: p.brand ?? null, image: p.images?.[0] ?? null, ean: p.ean ?? null, origin: p.origin ?? null,
                    unitsPerCase: p.unitsPerCase, casesPerPallet: p.casesPerPallet, palletsPerShipment: p.palletsPerShipment ?? null,
                    unit: kind === 'PALLET' ? 'case' : 'pallet', casesPerUnit, casePrice, unitPrice: Math.round(casePrice * casesPerUnit * 100) / 100,
                    maxQuantity, shareOfLoadPerUnit: 1 / cap, minUnits: minUnits(p, kind === 'PALLET' ? 'carton' : 'pallet'), variants: [],
                });
            }
        }
        return { kind, items: items.slice(0, 60), reason: items.length ? null : search ? 'No variant matches that search.' : 'No eligible mix options: this product has no other variant with stock and room left in this load.' };
    }

    async remove(customerId: string, id: string) {
        const res = await this.prisma.mixedLoad.deleteMany({ where: { id, customerId, status: 'DRAFT' } });
        if (res.count === 0) throw new NotFoundException('Mixed load not found');
        return { ok: true };
    }
}
