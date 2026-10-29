import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { readMarkups } from '../common/markups';
import { minOrderCases } from '../common/markups';
import { barcodeProblem, normaliseBarcode } from './catalog-rules';

type Viewer = { id: string; role?: string } | null;

/** Every stored spelling of one GTIN: with/without leading zeros, padded to 8/12/13/14. */
export function gtinForms(ean: string): string[] {
    const core = ean.replace(/^0+/, '');
    return Array.from(new Set([ean, core, ...[8, 12, 13, 14].filter((n) => n >= core.length).map((n) => core.padStart(n, '0'))]));
}

/**
 * Offers for the same product from different suppliers.
 *
 * Ali FMCG stores one Product row per supplier listing; listings that share a
 * valid barcode (GTIN) are the same trade item — same variant and pack — so
 * they're compared. Nothing is invented: if only one approved listing has the
 * barcode, there is nothing to compare.
 *
 * Prices are buyer prices at the case tier (with any approved offer applied,
 * as at checkout) plus the per-piece price, so listings with different case
 * sizes compare on the same unit. Suppliers stay anonymous ("Supplier 1…"),
 * with only their country and verification shown; a supplier never sees
 * buyer prices of their own listings here.
 */
@Injectable()
export class OfferCompareService {
    constructor(private readonly prisma: PrismaService) {}

    async compare(productId: string, viewer: Viewer) {
        const product: any = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, ean: true, status: true, supplierId: true } });
        if (!product || product.status !== 'APPROVED') throw new NotFoundException('Product not found');
        if (viewer && product.supplierId === viewer.id) return { ownerView: true, offers: [] };
        const ean = normaliseBarcode(product.ean || '');
        if (!ean || barcodeProblem(ean)) return { basis: null, offers: [], reason: 'This listing has no valid barcode, so it can’t be matched with other offers.' };

        const rows: any[] = await this.prisma.product.findMany({
            where: { status: 'APPROVED', ean: { in: gtinForms(ean) } },
            select: {
                id: true, name: true, supplierId: true, basePrice: true, unitsPerCase: true, casesPerPallet: true, palletsPerShipment: true,
                moq: true, moqUnit: true, stock: true, origin: true, exwLocation: true, leadTime: true, readyForDispatch: true, shelfLife: true, createdAt: true,
                warehouse: { select: { city: true, country: true } },
                supplier: { select: { country: true, kycStatus: true } },
                offers: { where: { status: 'APPROVED', discountPercent: { not: null }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }, orderBy: { discountPercent: 'desc' }, take: 1, select: { discountPercent: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: 20,
        });
        // A supplier never sees buyer prices of their own listings (margin privacy).
        const visible = rows.filter((r) => !(viewer && r.supplierId === viewer.id));
        if (visible.length < 2) return { basis: 'CASE', offers: [], reason: null };

        const signedIn = !!viewer;
        const m = await readMarkups(this.prisma);
        const supplierNo = new Map<string, number>();
        for (const r of visible) if (r.supplierId && !supplierNo.has(r.supplierId)) supplierNo.set(r.supplierId, supplierNo.size + 1);
        const offers = visible.map((r) => {
            const pct = Number(r.offers?.[0]?.discountPercent) || 0;
            const factor = pct > 0 && pct <= 90 ? 1 - pct / 100 : 1;
            const casePrice = signedIn && typeof r.basePrice === 'number' && r.basePrice > 0 ? Math.round(r.basePrice * m.piece * factor * 100) / 100 : null;
            const upc = Number(r.unitsPerCase) || 0;
            return {
                id: r.id, name: r.name, current: r.id === product.id,
                supplier: { label: `Supplier ${supplierNo.get(r.supplierId) ?? '—'}`, country: r.supplier?.country ?? null, verified: r.supplier?.kycStatus === 'VERIFIED' },
                origin: r.origin ?? null,
                shipsFrom: r.warehouse ? [r.warehouse.city, r.warehouse.country].filter(Boolean).join(', ') : (r.exwLocation?.trim() || null),
                pack: { unitsPerCase: upc || null, casesPerPallet: r.casesPerPallet ?? null, palletsPerShipment: r.palletsPerShipment ?? null },
                casePrice, piecePrice: casePrice !== null && upc ? Math.round((casePrice / upc) * 10000) / 10000 : null, offerPercent: pct || null,
                currency: 'EUR',
                minOrder: r.moq ? { quantity: r.moq, unit: String(r.moqUnit || 'PIECE').toUpperCase(), cases: minOrderCases(r) || null } : null,
                availability: (r.stock ?? 0) > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
                stockCases: signedIn ? r.stock ?? 0 : null,
                leadTimeDays: r.readyForDispatch ? 0 : (typeof r.leadTime === 'number' ? r.leadTime : null),
                bestBefore: r.shelfLife ?? null,
            };
        });
        const caseSizes = new Set(offers.map((o) => o.pack.unitsPerCase).filter(Boolean));
        return {
            basis: 'CASE', currency: 'EUR', barcode: ean, pricesHidden: !signedIn,
            note: caseSizes.size > 1 ? 'Case sizes differ between these offers — compare the price per piece.' : null,
            offers,
        };
    }
}
