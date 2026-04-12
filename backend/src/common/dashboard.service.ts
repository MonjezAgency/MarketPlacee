import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getAdminSnapshot() {
        const [totalRevenue, totalOrders, activePlacements, supplierCount] = await Promise.all([
            this.prisma.order.aggregate({ _sum: { totalAmount: true } }),
            this.prisma.order.count(),
            this.prisma.productPlacement.count({ where: { status: 'ACTIVE' } }),
            this.prisma.user.count({ where: { role: 'SUPPLIER' } }),
        ]);

        const recentOrders = await this.prisma.order.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { customer: { select: { name: true } } },
        });

        return {
            stats: {
                revenue: totalRevenue._sum.totalAmount || 0,
                orders: totalOrders,
                activePlacements,
                suppliers: supplierCount,
            },
            recentOrders,
        };
    }

    async getNotificationCounts() {
        const [pendingUsers, pendingProducts, pendingOrders, pendingPlacements] = await Promise.all([
            this.prisma.user.count({ where: { status: 'PENDING_APPROVAL', role: { not: 'ADMIN' } } }),
            this.prisma.product.count({ where: { status: 'PENDING' } }),
            this.prisma.order.count({ where: { status: 'PENDING' } }),
            this.prisma.productPlacement.count({ where: { status: 'PENDING' } }),
        ]);

        return { pendingUsers, pendingProducts, pendingOrders, pendingPlacements };
    }

    async getSupplierSnapshot(supplierId: string) {
        const [myProductsCount, myRevenue, myOrdersCount] = await Promise.all([
            this.prisma.product.count({ where: { supplierId } }),
            this.prisma.orderItem.aggregate({
                _sum: { price: true },
                where: { product: { supplierId } },
            }),
            this.prisma.order.count({
                where: { items: { some: { product: { supplierId } } } },
            }),
        ]);

        const recentPlacements = await this.prisma.productPlacement.findMany({
            where: { product: { supplierId } },
            take: 5,
            orderBy: { updatedAt: 'desc' },
            include: { product: { select: { name: true } } },
        });

        // ── Top Selling Products ─────────────────────
        const topProducts = await this.prisma.orderItem.groupBy({
            by: ['productId'],
            where: { product: { supplierId } },
            _sum: { quantity: true, price: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 5,
        });

        const topProductsWithNames = await Promise.all(
            topProducts.map(async (tp) => {
                const product = await this.prisma.product.findUnique({
                    where: { id: tp.productId },
                    select: { name: true, images: true },
                });
                return {
                    productId: tp.productId,
                    name: product?.name || 'Unknown',
                    image: product?.images?.[0] || null,
                    totalSold: tp._sum.quantity || 0,
                    totalRevenue: tp._sum.price || 0,
                };
            })
        );

        // ── Customer Demographics (by country) ──────────
        const customerOrders = await this.prisma.order.findMany({
            where: { items: { some: { product: { supplierId } } } },
            select: { customer: { select: { country: true } } },
        });
        const countryMap: Record<string, number> = {};
        customerOrders.forEach(o => {
            const c = o.customer.country || 'Unknown';
            countryMap[c] = (countryMap[c] || 0) + 1;
        });
        const demographics = Object.entries(countryMap)
            .map(([country, count]) => ({ country, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // ── Monthly Revenue (last 6 months) ──────────
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const recentOrders = await this.prisma.order.findMany({
            where: {
                createdAt: { gte: sixMonthsAgo },
                items: { some: { product: { supplierId } } },
            },
            select: { totalAmount: true, createdAt: true },
        });
        const monthlyRevenue: Record<string, number> = {};
        recentOrders.forEach(o => {
            const key = o.createdAt.toISOString().slice(0, 7); // YYYY-MM
            monthlyRevenue[key] = (monthlyRevenue[key] || 0) + o.totalAmount;
        });
        const revenueTrend = Object.entries(monthlyRevenue)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, revenue]) => ({ month, revenue }));

        return {
            stats: {
                products: myProductsCount,
                revenue: myRevenue._sum.price || 0,
                orders: myOrdersCount,
            },
            recentPlacements,
            topProducts: topProductsWithNames,
            demographics,
            revenueTrend,
        };
    }
}
