import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
    REMOVED_EMAIL_MARK, REVIEW_DECISION_ACTIONS, USER_LIST_SELECT, USER_SAFE_SELECT,
    countBy, parseUserListQuery, toListRow, toProfile, userListOrderBy, userListWhere,
} from './admin-users-query';
import { accountMoney, canSeeNet, pageResult, parseTabPage, productStatusFilter, toOfferRow, toProductRow } from './admin-users-activity';

const RECENT_DECISIONS = 5;
const STAFF = ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'EDITOR', 'DEVELOPER', 'LOGISTICS'];

/**
 * Read-only user directory for the founder/admin panel. Account actions stay on
 * the existing /users endpoints (status changes, bulk approve/block); nothing
 * here writes. Rules and the field whitelist live in ./admin-users-query.ts.
 */
@Injectable()
export class AdminUsersService {
    constructor(private readonly prisma: PrismaService) {}

    async list(raw: Record<string, unknown>) {
        const q = parseUserListQuery(raw);
        const where = userListWhere(q);
        const [rows, total, byRole, byStatus, countries] = await Promise.all([
            this.prisma.user.findMany({ where, select: USER_LIST_SELECT, orderBy: userListOrderBy(q.sort), skip: (q.page - 1) * q.limit, take: q.limit }),
            this.prisma.user.count({ where }),
            this.prisma.user.groupBy({ by: ['role'], where: userListWhere(q, 'role'), _count: { _all: true } }),
            this.prisma.user.groupBy({ by: ['status'], where: userListWhere(q, 'status'), _count: { _all: true } }),
            this.prisma.user.groupBy({ by: ['country'], where: userListWhere(q, 'country'), _count: { _all: true } }),
        ]);
        const supplierIds = rows.filter((r) => r.role === 'SUPPLIER').map((r) => r.id);
        const live = supplierIds.length
            ? await this.prisma.product.groupBy({ by: ['supplierId'], where: { supplierId: { in: supplierIds }, status: 'APPROVED' }, _count: { _all: true } })
            : [];
        const liveBy = countBy(live as any[], 'supplierId');
        const roleCounts = countBy(byRole as any[], 'role');
        return {
            data: rows.map((r) => toListRow(r, liveBy[r.id] ?? 0)),
            total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)),
            query: q,
            counts: {
                byRole: roleCounts,
                staff: STAFF.reduce((n, r) => n + (roleCounts[r] || 0), 0),
                byStatus: countBy(byStatus as any[], 'status'),
            },
            facets: {
                countries: Object.entries(countBy(countries as any[], 'country'))
                    .filter(([k]) => k)
                    .map(([value, count]) => ({ value, count }))
                    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
            },
        };
    }

    async detail(id: string, viewerRole?: string) {
        const profile = await this.account(id);
        const netVisible = canSeeNet(viewerRole);
        const kycDocuments = await this.prisma.kYCDocument.findMany({
            where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 10,
            select: { id: true, documentType: true, status: true, adminNotes: true, createdAt: true, updatedAt: true },
        });
        const base = { user: profile, kycDocuments, netVisible, supplier: null as any, buyer: null as any };
        if (profile.role === 'SUPPLIER') base.supplier = await this.supplierOverview(id, netVisible);
        if (profile.role === 'CUSTOMER') base.buyer = await this.buyerOverview(id, netVisible);
        return base;
    }

    /** GET /admin/users/:id/products — the supplier's products, newest change first, 14 per page. */
    async products(id: string, raw: Record<string, unknown>, viewerRole?: string) {
        await this.account(id, 'SUPPLIER');
        const p = parseTabPage(raw);
        const status = productStatusFilter(raw.status);
        const where: any = { supplierId: id, ...(status ? { status } : {}) };
        const [rows, total] = await Promise.all([
            this.prisma.product.findMany({
                where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: p.skip, take: p.limit,
                select: { id: true, name: true, ean: true, brand: true, status: true, images: true, stock: true, unit: true, basePrice: true, updatedAt: true },
            }),
            this.prisma.product.count({ where }),
        ]);
        const netVisible = canSeeNet(viewerRole);
        return { ...pageResult(rows.map((r) => toProductRow(r as any, netVisible)), total, p), netVisible, status };
    }

    /** GET /admin/users/:id/offers — the supplier's wholesale offers (Offer records), newest first. */
    async offers(id: string, raw: Record<string, unknown>, viewerRole?: string) {
        await this.account(id, 'SUPPLIER');
        const p = parseTabPage(raw);
        const where = { supplierId: id };
        const [rows, total] = await Promise.all([
            this.prisma.offer.findMany({
                where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: p.skip, take: p.limit,
                select: { id: true, status: true, unit: true, quantity: true, pricePerUnit: true, validUntil: true, createdAt: true, productNameSnap: true, product: { select: { id: true, name: true } } },
            }),
            this.prisma.offer.count({ where }),
        ]);
        const netVisible = canSeeNet(viewerRole);
        return { ...pageResult(rows.map((r) => toOfferRow(r as any, netVisible)), total, p), netVisible };
    }

    /** GET /admin/users/:id/orders — suppliers: orders containing their products; buyers: orders they placed. */
    async orders(id: string, raw: Record<string, unknown>) {
        const profile = await this.account(id);
        const p = parseTabPage(raw);
        if (profile.role === 'SUPPLIER') {
            const where = supplierOrdersWhere(id);
            const [rows, total] = await Promise.all([
                this.prisma.order.findMany({
                    where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: p.skip, take: p.limit,
                    select: {
                        id: true, createdAt: true, status: true, reviewStatus: true, paymentStatus: true,
                        customer: { select: { id: true, name: true, companyName: true } },
                        items: { where: { product: { supplierId: id } }, select: { id: true } },
                    },
                }),
                this.prisma.order.count({ where }),
            ]);
            return pageResult(rows.map((o) => ({
                id: o.id, createdAt: o.createdAt, status: o.status, reviewStatus: o.reviewStatus, paymentStatus: o.paymentStatus,
                buyer: o.customer ? { id: o.customer.id, name: o.customer.companyName || o.customer.name } : null,
                lines: o.items.length, totalAmount: null as number | null,
            })), total, p);
        }
        if (profile.role !== 'CUSTOMER') throw new BadRequestException('This account has no orders');
        const where = { customerId: id };
        const [rows, total] = await Promise.all([
            this.prisma.order.findMany({
                where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: p.skip, take: p.limit,
                select: { id: true, createdAt: true, status: true, reviewStatus: true, paymentStatus: true, totalAmount: true, _count: { select: { items: true } } },
            }),
            this.prisma.order.count({ where }),
        ]);
        return pageResult(rows.map((o) => ({
            id: o.id, createdAt: o.createdAt, status: o.status, reviewStatus: o.reviewStatus, paymentStatus: o.paymentStatus,
            buyer: null, lines: o._count.items, totalAmount: o.totalAmount,
        })), total, p);
    }

    /** GET /admin/users/:id/target-prices — the buyer's target price requests. */
    async targetPrices(id: string, raw: Record<string, unknown>) {
        await this.account(id, 'CUSTOMER');
        const p = parseTabPage(raw);
        const where = { buyerId: id };
        const [rows, total] = await Promise.all([
            this.prisma.targetPriceRequest.findMany({
                where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: p.skip, take: p.limit,
                select: { id: true, ref: true, status: true, targetCasePrice: true, quantity: true, quantityUnit: true, createdAt: true, product: { select: { id: true, name: true } } },
            }),
            this.prisma.targetPriceRequest.count({ where }),
        ]);
        return pageResult(rows, total, p);
    }

    /** GET /admin/users/:id/reviews — suppliers: reviews on their products; buyers: reviews they wrote. */
    async reviews(id: string, raw: Record<string, unknown>) {
        const profile = await this.account(id);
        if (profile.role !== 'SUPPLIER' && profile.role !== 'CUSTOMER') throw new BadRequestException('This account has no reviews');
        const p = parseTabPage(raw);
        const where = profile.role === 'SUPPLIER' ? { product: { supplierId: id } } : { userId: id };
        const [rows, total] = await Promise.all([
            this.prisma.review.findMany({
                where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: p.skip, take: p.limit,
                select: { id: true, rating: true, comment: true, createdAt: true, product: { select: { id: true, name: true } }, user: { select: { id: true, name: true, companyName: true } } },
            }),
            this.prisma.review.count({ where }),
        ]);
        return pageResult(rows.map((r) => ({
            id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, product: r.product,
            author: profile.role === 'SUPPLIER' && r.user ? { id: r.user.id, name: r.user.companyName || r.user.name } : null,
        })), total, p);
    }

    /** The account (safe fields only); 404 for unknown or anonymised accounts, 400 when the role doesn't fit the tab. */
    private async account(id: string, role?: 'SUPPLIER' | 'CUSTOMER') {
        const u = await this.prisma.user.findUnique({ where: { id }, select: USER_SAFE_SELECT });
        if (!u || u.email.includes(REMOVED_EMAIL_MARK)) throw new NotFoundException('User not found');
        const profile = toProfile(u);
        if (role && profile.role !== role) throw new BadRequestException(role === 'SUPPLIER' ? 'Not a supplier account' : 'Not a buyer account');
        return profile;
    }

    private async supplierOverview(id: string, netVisible: boolean) {
        const [byStatus, offersByStatus, decisions, ordersTotal, reviewAgg, moneyOrders] = await Promise.all([
            this.prisma.product.groupBy({ by: ['status'], where: { supplierId: id }, _count: { _all: true } }),
            this.prisma.offer.groupBy({ by: ['status'], where: { supplierId: id }, _count: { _all: true } }),
            this.prisma.productReviewEvent.findMany({
                where: { product: { supplierId: id }, action: { in: [...REVIEW_DECISION_ACTIONS] }, OR: [{ actorRole: null }, { actorRole: { not: 'SUPPLIER' } }] },
                orderBy: { createdAt: 'desc' }, take: RECENT_DECISIONS,
                select: { id: true, action: true, message: true, statusAfter: true, actorRole: true, createdAt: true, product: { select: { id: true, name: true } }, actor: { select: { name: true } } },
            }),
            this.prisma.order.count({ where: supplierOrdersWhere(id) }),
            this.prisma.review.aggregate({ where: { product: { supplierId: id } }, _count: { _all: true }, _avg: { rating: true } }),
            this.prisma.order.findMany({
                where: { items: { some: { product: { supplierId: id } } } },
                select: {
                    status: true, reviewStatus: true, reviewedAt: true, createdAt: true, totalAmount: true,
                    items: { where: { product: { supplierId: id } }, select: { quantity: true, price: true, supplierUnitPrice: true } },
                },
            }),
        ]);
        const counts = countBy(byStatus as any[], 'status');
        const offerCounts = countBy(offersByStatus as any[], 'status');
        const money = accountMoney(moneyOrders.map((o) => ({ ...o, lines: o.items.map((l) => ({ ...l, supplierId: id })) })), { supplierId: id, netVisible });
        return {
            products: { total: sum(counts), byStatus: counts },
            offers: { total: sum(offerCounts), byStatus: offerCounts },
            orders: { total: ordersTotal },
            reviews: { total: reviewAgg._count?._all ?? 0, average: reviewAgg._avg?.rating ?? null },
            reviewDecisions: decisions.map((e) => ({
                id: e.id, action: e.action, message: e.message, statusAfter: e.statusAfter, createdAt: e.createdAt,
                product: e.product, by: e.actorRole === 'SYSTEM' ? 'system' : 'atlantis', actorName: e.actor?.name ?? null,
            })),
            money,
        };
    }

    private async buyerOverview(id: string, netVisible: boolean) {
        const [byStatus, awaiting, tpByStatus, reviewsTotal, moneyOrders] = await Promise.all([
            this.prisma.order.groupBy({ by: ['status'], where: { customerId: id }, _count: { _all: true } }),
            this.prisma.order.count({ where: { customerId: id, reviewStatus: 'PENDING_REVIEW' } }),
            this.prisma.targetPriceRequest.groupBy({ by: ['status'], where: { buyerId: id }, _count: { _all: true } }),
            this.prisma.review.count({ where: { userId: id } }),
            this.prisma.order.findMany({
                where: { customerId: id },
                select: {
                    status: true, reviewStatus: true, reviewedAt: true, createdAt: true, totalAmount: true,
                    items: { select: { quantity: true, price: true, supplierUnitPrice: true } },
                },
            }),
        ]);
        const orders = countBy(byStatus as any[], 'status');
        const tps = countBy(tpByStatus as any[], 'status');
        const money = accountMoney(moneyOrders.map((o) => ({ ...o, lines: o.items.map((l) => ({ ...l, supplierId: null })) })), { supplierId: null, netVisible });
        return {
            orders: { total: sum(orders), byStatus: orders, awaitingReview: awaiting },
            targetPrices: { total: sum(tps), byStatus: tps },
            reviews: { total: reviewsTotal },
            money,
        };
    }
}

const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
/** Orders that include this supplier's products (or were placed with them directly). */
const supplierOrdersWhere = (id: string) => ({ OR: [{ supplierId: id }, { items: { some: { product: { supplierId: id } } } }] });
