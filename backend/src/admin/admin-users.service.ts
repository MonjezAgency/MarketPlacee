import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import {
    REMOVED_EMAIL_MARK, REVIEW_DECISION_ACTIONS, USER_LIST_SELECT, USER_SAFE_SELECT,
    countBy, parseUserListQuery, toListRow, toProfile, userListOrderBy, userListWhere,
} from './admin-users-query';

const RECENT = 20;
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

    async detail(id: string) {
        const u = await this.prisma.user.findUnique({ where: { id }, select: USER_SAFE_SELECT });
        if (!u || u.email.includes(REMOVED_EMAIL_MARK)) throw new NotFoundException('User not found');
        const profile = toProfile(u);
        const kycDocuments = await this.prisma.kYCDocument.findMany({
            where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 10,
            select: { id: true, documentType: true, status: true, adminNotes: true, createdAt: true, updatedAt: true },
        });
        const base = { user: profile, kycDocuments, supplier: null as any, buyer: null as any };
        if (profile.role === 'SUPPLIER') base.supplier = await this.supplierSections(id);
        if (profile.role === 'CUSTOMER') base.buyer = await this.buyerSections(id);
        return base;
    }

    private async supplierSections(id: string) {
        const ordersWhere = { OR: [{ supplierId: id }, { items: { some: { product: { supplierId: id } } } }] };
        const [byStatus, products, decisions, orders, ordersTotal] = await Promise.all([
            this.prisma.product.groupBy({ by: ['status'], where: { supplierId: id }, _count: { _all: true } }),
            this.prisma.product.findMany({
                where: { supplierId: id }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: RECENT,
                select: { id: true, name: true, brand: true, status: true, images: true, stock: true, updatedAt: true },
            }),
            this.prisma.productReviewEvent.findMany({
                where: { product: { supplierId: id }, action: { in: [...REVIEW_DECISION_ACTIONS] }, OR: [{ actorRole: null }, { actorRole: { not: 'SUPPLIER' } }] },
                orderBy: { createdAt: 'desc' }, take: RECENT,
                select: { id: true, action: true, message: true, statusAfter: true, actorRole: true, createdAt: true, product: { select: { id: true, name: true } }, actor: { select: { name: true } } },
            }),
            this.prisma.order.findMany({
                where: ordersWhere, orderBy: { createdAt: 'desc' }, take: RECENT,
                select: {
                    id: true, createdAt: true, status: true, reviewStatus: true, paymentStatus: true,
                    customer: { select: { id: true, name: true, companyName: true } },
                    items: { where: { product: { supplierId: id } }, select: { id: true } },
                },
            }),
            this.prisma.order.count({ where: ordersWhere }),
        ]);
        const counts = countBy(byStatus as any[], 'status');
        return {
            products: {
                total: Object.values(counts).reduce((a, b) => a + b, 0),
                byStatus: counts,
                recent: products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, status: p.status, image: p.images?.[0] ?? null, stock: p.stock, updatedAt: p.updatedAt })),
            },
            reviewDecisions: decisions.map((e) => ({
                id: e.id, action: e.action, message: e.message, statusAfter: e.statusAfter, createdAt: e.createdAt,
                product: e.product, by: e.actorRole === 'SYSTEM' ? 'system' : 'atlantis', actorName: e.actor?.name ?? null,
            })),
            orders: {
                total: ordersTotal,
                recent: orders.map((o) => ({
                    id: o.id, createdAt: o.createdAt, status: o.status, reviewStatus: o.reviewStatus, paymentStatus: o.paymentStatus,
                    buyer: o.customer ? { id: o.customer.id, name: o.customer.companyName || o.customer.name } : null,
                    supplierLines: o.items.length,
                })),
            },
        };
    }

    private async buyerSections(id: string) {
        const [orders, ordersTotal, byStatus, tps, tpsTotal] = await Promise.all([
            this.prisma.order.findMany({
                where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: RECENT,
                select: { id: true, createdAt: true, status: true, reviewStatus: true, paymentStatus: true, totalAmount: true, _count: { select: { items: true } } },
            }),
            this.prisma.order.count({ where: { customerId: id } }),
            this.prisma.order.groupBy({ by: ['status'], where: { customerId: id }, _count: { _all: true } }),
            this.prisma.targetPriceRequest.findMany({
                where: { buyerId: id }, orderBy: { createdAt: 'desc' }, take: RECENT,
                select: { id: true, ref: true, status: true, targetCasePrice: true, quantity: true, quantityUnit: true, createdAt: true, product: { select: { id: true, name: true } } },
            }),
            this.prisma.targetPriceRequest.count({ where: { buyerId: id } }),
        ]);
        return {
            orders: {
                total: ordersTotal,
                byStatus: countBy(byStatus as any[], 'status'),
                recent: orders.map((o) => ({ id: o.id, createdAt: o.createdAt, status: o.status, reviewStatus: o.reviewStatus, paymentStatus: o.paymentStatus, totalAmount: o.totalAmount, lines: o._count.items })),
            },
            targetPrices: { total: tpsTotal, recent: tps },
        };
    }
}
