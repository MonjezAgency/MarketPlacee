import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { invalidValues, isRealImage, missingForPublish, type Missing } from './catalog-rules';
import { STAFF_ROLES, scopeOf, scopeWhere, type CatalogScope } from './catalog-scope';
import { ProductReviewService } from './product-review.service';
import { planBulk, type BulkAction, type BulkCandidate, type BulkPlan } from './admin-bulk';

/**
 * Admin Products page and product review view — read models only.
 *
 *  • Two scopes, never mixed (catalog-scope.ts): Ali FMCG Catalog = products
 *    owned by staff accounts; Supplier Submissions = everything else. Counts,
 *    facets and pages are computed for the scope requested, on the server.
 *  • Completeness is the publish checklist (catalog-rules.ts missingForPublish),
 *    the same rule approval enforces — no separate percentage.
 *  • Decisions themselves stay in ProductsService (approve / reject / comment).
 */
const STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES'] as const;
const SORTS: Record<string, any> = {
    newest: { createdAt: 'desc' }, oldest: { createdAt: 'asc' }, updated: { updatedAt: 'desc' }, name: { name: 'asc' },
    price_asc: { basePrice: 'asc' }, price_desc: { basePrice: 'desc' }, stock_asc: { stock: 'asc' }, stock_desc: { stock: 'desc' },
    supplier: { supplier: { companyName: 'asc' } },
};
/** Fields the completeness checklist reads (kept small: the scope-wide pass loads every product once). */
const COMPLETENESS_SELECT = { id: true, status: true, name: true, brand: true, category: true, ean: true, origin: true, exwLocation: true, weight: true, basePrice: true, price: true, stock: true, unit: true, unitsPerCase: true, casesPerPallet: true, moq: true, moqUnit: true, images: true } as const;

export interface AdminListQuery { status?: string; q?: string; category?: string; brand?: string; supplier?: string; sort?: string; page?: string; limit?: string; attention?: string }

@Injectable()
export class AdminProductsService {
    constructor(private readonly prisma: PrismaService, private readonly reviewTrail: ProductReviewService) {}

    /** Ids of every staff account (owners of Ali FMCG Catalog products). */
    async staffIds(): Promise<string[]> {
        const rows = await this.prisma.user.findMany({ where: { role: { in: [...STAFF_ROLES] as any } }, select: { id: true } });
        return rows.map((r) => r.id);
    }

    /** Which of the selected products a bulk action may touch, and why the others are skipped (admin-bulk.ts). */
    async planBulk(action: BulkAction, ids: string[]): Promise<BulkPlan> {
        const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, select: { ...COMPLETENESS_SELECT, supplier: { select: { role: true } } } as any });
        const found = rows.map((p: any): BulkCandidate => ({ id: p.id, name: p.name, status: p.status, scope: scopeOf(p.supplier?.role), product: p }));
        if (action === 'delete' && found.length) {
            const pid = found.map((c) => c.id);
            const now = new Date();
            const [orders, targets, promos, offers] = await Promise.all([
                (this.prisma as any).orderItem.groupBy({ by: ["productId"], where: { productId: { in: pid } }, _count: { _all: true } }),
                (this.prisma as any).targetPriceRequest.groupBy({ by: ['productId'], where: { productId: { in: pid }, status: { in: ['OPEN', 'RESPONDED'] } }, _count: { _all: true } }),
                (this.prisma as any).promotion.groupBy({ by: ['productId'], where: { productId: { in: pid }, status: 'ACTIVE', endsAt: { gt: now } }, _count: { _all: true } }),
                (this.prisma as any).offer.groupBy({ by: ['productId'], where: { productId: { in: pid }, status: 'APPROVED' }, _count: { _all: true } }),
            ]);
            const m = (list: any[]) => new Map(list.map((r: any) => [r.productId, r._count?._all ?? 0]));
            const o = m(orders as any[]), t = m(targets), pr = m(promos), of = m(offers as any[]);
            for (const c of found) c.usage = { orderLines: o.get(c.id) || 0, openTargets: t.get(c.id) || 0, activePromotions: pr.get(c.id) || 0, approvedOffers: of.get(c.id) || 0 };
        }
        return planBulk(action, ids, found);
    }

    async list(scope: CatalogScope, q: AdminListQuery) {
        const page = Math.max(1, Number(q.page) || 1);
        const limit = Math.min(100, Math.max(5, Number(q.limit) || 25));
        const staff = await this.staffIds();
        const base: any = { ...scopeWhere(scope, staff) };
        const where: any = { ...base };

        const wanted = String(q.status || '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => (STATUSES as readonly string[]).includes(s));
        if (wanted.length === 1) where.status = wanted[0];
        else if (wanted.length > 1) where.status = { in: [...new Set(wanted)] };
        if (q.category) where.category = q.category;
        if (q.brand) where.brand = { equals: q.brand, mode: 'insensitive' };
        if (q.supplier && scope === 'submissions') where.supplierId = q.supplier;
        const term = String(q.q || '').trim();
        if (term) {
            const digits = term.replace(/\D/g, '');
            where.OR = [
                { name: { contains: term, mode: 'insensitive' } },
                { brand: { contains: term, mode: 'insensitive' } },
                ...(digits.length >= 4 ? [{ ean: { contains: digits } }] : []),
                ...(scope === 'submissions' ? [
                    { supplier: { companyName: { contains: term, mode: 'insensitive' } } },
                    { supplier: { name: { contains: term, mode: 'insensitive' } } },
                    { supplier: { email: { contains: term, mode: 'insensitive' } } },
                ] : []),
            ];
        }

        // Scope-wide completeness pass: which open products miss something / have no real photo.
        const open = await this.prisma.product.findMany({ where: { ...base, status: { not: 'REJECTED' as any } }, select: COMPLETENESS_SELECT });
        const missingInfoIds = open.filter((p) => missingForPublish(p).length > 0).map((p) => p.id);
        const missingImageIds = open.filter((p) => !(Array.isArray(p.images) && p.images.some(isRealImage))).map((p) => p.id);
        if (q.attention === 'missing') where.id = { in: missingInfoIds };
        else if (q.attention === 'images') where.id = { in: missingImageIds };
        else if (q.attention) throw new BadRequestException({ code: 'ATTENTION_INVALID', message: 'attention must be missing or images.' });

        const orderBy = SORTS[String(q.sort || 'newest')] || SORTS.newest;
        const [total, rows, byStatus, cats, brands, scopeCounts, suppliers] = await Promise.all([
            this.prisma.product.count({ where }),
            this.prisma.product.findMany({
                where, orderBy, skip: (page - 1) * limit, take: limit,
                select: {
                    id: true, name: true, brand: true, category: true, status: true, adminNotes: true, images: true, ean: true,
                    basePrice: true, price: true, supplierCurrency: true, supplierPrice: true, stock: true, unit: true, moq: true, moqUnit: true, unitsPerCase: true, casesPerPallet: true,
                    palletsPerShipment: true, weight: true, origin: true, exwLocation: true, createdAt: true, updatedAt: true,
                    supplier: { select: { id: true, name: true, companyName: true, email: true, role: true } },
                },
            }),
            this.prisma.product.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
            this.prisma.product.groupBy({ by: ['category'], where: base, _count: { _all: true } }),
            this.prisma.product.groupBy({ by: ['brand'], where: { ...base, brand: { not: null } }, _count: { _all: true }, orderBy: { _count: { brand: 'desc' } }, take: 80 }),
            Promise.all([
                this.prisma.product.count({ where: scopeWhere('catalog', staff) }),
                this.prisma.product.count({ where: scopeWhere('submissions', staff) }),
                this.prisma.product.count({ where: { ...scopeWhere('submissions', staff), status: 'PENDING' as any } }),
            ]),
            scope === 'submissions'
                ? this.prisma.product.groupBy({ by: ['supplierId'], where: base, _count: { _all: true } })
                : Promise.resolve([] as any[]),
        ]);
        const supplierRows = suppliers.length
            ? await this.prisma.user.findMany({ where: { id: { in: (suppliers as any[]).map((s) => s.supplierId) } }, select: { id: true, name: true, companyName: true } })
            : [];
        const supplierName = new Map(supplierRows.map((u) => [u.id, u.companyName || u.name]));

        const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
        for (const g of byStatus as any[]) counts[g.status] = g._count._all;
        return {
            scope,
            data: rows.map((r: any) => {
                const missing = missingForPublish(r);
                return {
                    ...r,
                    image: Array.isArray(r.images) ? r.images.find(isRealImage) ?? null : null,
                    hasImage: Array.isArray(r.images) && r.images.some(isRealImage),
                    missing: missing.map((m) => m.label),
                    missingFields: missing.map((m) => m.field),
                };
            }),
            total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
            counts: {
                total: Object.values(counts).reduce((a, b) => a + b, 0),
                byStatus: counts,
                missingInfo: missingInfoIds.length,
                missingImages: missingImageIds.length,
                scopes: { catalog: scopeCounts[0], submissions: scopeCounts[1], submissionsPending: scopeCounts[2] },
            },
            facets: {
                categories: (cats as any[]).map((c) => ({ value: c.category, count: c._count._all })).filter((c) => c.value).sort((a, b) => a.value.localeCompare(b.value)),
                brands: (brands as any[]).map((b) => ({ value: b.brand, count: b._count._all })).filter((b) => b.value),
                suppliers: (suppliers as any[]).map((s) => ({ id: s.supplierId, name: supplierName.get(s.supplierId) || s.supplierId, count: s._count._all })).sort((a, b) => a.name.localeCompare(b.name)),
            },
        };
    }

    /** One product with everything a reviewer needs; never fabricates a value — missing stays missing. */
    async review(id: string) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: { supplier: { select: { id: true, name: true, companyName: true, email: true, role: true, status: true, country: true, createdAt: true, kycStatus: true } } },
        });
        if (!product) throw new NotFoundException('Product not found');
        const [history, changes, orderLines, watching, approvedOffers, activePromotions, supplierCounts] = await Promise.all([
            this.reviewTrail.history(id, 'staff'),
            this.prisma.productChangeLog.findMany({ where: { productId: id, field: { not: 'import' } }, orderBy: { createdAt: 'desc' }, take: 15 }),
            this.prisma.orderItem.count({ where: { productId: id } }),
            this.prisma.wishlistItem.count({ where: { productId: id } }),
            this.prisma.offer.count({ where: { productId: id, status: 'APPROVED' } }),
            this.prisma.promotion.count({ where: { productId: id, status: 'ACTIVE', endsAt: { gt: new Date() } } }),
            this.prisma.product.groupBy({ by: ['status'], where: { supplierId: product.supplierId }, _count: { _all: true } }),
        ]);
        const actorIds = [...new Set(changes.map((c) => c.actorId).filter(Boolean))] as string[];
        const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, role: true } }) : [];
        const actorById = new Map(actors.map((a) => [a.id, a]));
        const missing: Missing[] = missingForPublish(product);
        const invalid: Missing[] = invalidValues(product);
        const byStatus: Record<string, number> = {};
        for (const g of supplierCounts as any[]) byStatus[g.status] = g._count._all;
        const images: string[] = Array.isArray(product.images) ? product.images.filter(isRealImage) : [];
        return {
            product: { ...product, images, placeholderOnly: images.length === 0 && Array.isArray(product.images) && product.images.length > 0 },
            scope: scopeOf(product.supplier?.role),
            missing, invalid,
            canApprove: missing.length === 0 && invalid.length === 0,
            history,
            changes: changes.map((c) => ({ id: c.id, field: c.field, oldValue: c.oldValue, newValue: c.newValue, reason: c.reason, createdAt: c.createdAt.toISOString(), actor: c.actorId ? (actorById.get(c.actorId) ?? { id: c.actorId, name: null, role: null }) : null })),
            usage: { orderLines, buyersWatching: watching, approvedOffers, activePromotions },
            supplierCatalog: { byStatus, total: Object.values(byStatus).reduce((a, b) => a + b, 0) },
        };
    }
}
