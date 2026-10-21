import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { FinanceActor, WarehouseInput } from './finance-access';

@Injectable()
export class FinanceService {
    constructor(private prisma: PrismaService) {}

    // ─── Credit Terms ──────────────────────────────────────

    async setCreditTerm(data: {
        userId: string;
        creditLimit: number;
        paymentTermDays: number;
        approvedBy?: string;
        notes?: string;
    }) {
        const existing = await this.prisma.creditTerm.findUnique({ where: { userId: data.userId } });
        if (existing) {
            return this.prisma.creditTerm.update({
                where: { id: existing.id },
                data: {
                    creditLimit: data.creditLimit,
                    paymentTermDays: data.paymentTermDays,
                    approvedBy: data.approvedBy,
                    notes: data.notes,
                },
            });
        }
        return this.prisma.creditTerm.create({ data });
    }

    async getCreditTerm(userId: string) {
        return this.prisma.creditTerm.findUnique({ where: { userId } });
    }

    /** A buyer's own term: only the fields that describe their terms (no approver id). */
    async getOwnCreditTerm(userId: string) {
        return this.prisma.creditTerm.findUnique({
            where: { userId },
            select: { creditLimit: true, usedCredit: true, paymentTermDays: true, status: true, updatedAt: true },
        });
    }

    async getAllCreditTerms() {
        return this.prisma.creditTerm.findMany({ orderBy: { createdAt: 'desc' } });
    }

    async deleteCreditTerm(id: string) {
        return this.prisma.creditTerm.delete({ where: { id } });
    }

    async checkCreditAvailability(userId: string, orderAmount: number) {
        const term = await this.prisma.creditTerm.findUnique({ where: { userId } });
        if (!term || term.status !== 'ACTIVE') {
            return { allowed: false, reason: 'No active credit terms', available: 0 };
        }
        const available = term.creditLimit - term.usedCredit;
        if (orderAmount > available) {
            return { allowed: false, reason: 'Exceeds credit limit', available };
        }
        return { allowed: true, available, paymentTermDays: term.paymentTermDays };
    }

    async useCredit(userId: string, amount: number) {
        const term = await this.prisma.creditTerm.findUnique({ where: { userId } });
        if (!term) throw new NotFoundException('No credit terms for this user');
        return this.prisma.creditTerm.update({
            where: { id: term.id },
            data: { usedCredit: term.usedCredit + amount },
        });
    }

    // ─── Tax Exemptions ────────────────────────────────────

    async createTaxExemption(data: {
        userId: string;
        certificateUrl: string;
        certificateType?: string;
        validFrom?: Date;
        validUntil?: Date;
    }) {
        return this.prisma.taxExemption.create({ data });
    }

    async getTaxExemptions(userId?: string) {
        const where = userId ? { userId } : {};
        return this.prisma.taxExemption.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }

    /** A buyer's own exemption requests (no reviewer id). */
    async getOwnTaxExemptions(userId: string) {
        return this.prisma.taxExemption.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, certificateUrl: true, certificateType: true, status: true, validFrom: true, validUntil: true, notes: true, createdAt: true, updatedAt: true },
        });
    }

    async reviewTaxExemption(id: string, status: string, reviewedBy: string, notes?: string) {
        const exemption = await this.prisma.taxExemption.findUnique({ where: { id } });
        if (!exemption) throw new NotFoundException('Tax exemption not found');
        return this.prisma.taxExemption.update({
            where: { id },
            data: { status, reviewedBy, notes },
        });
    }

    async hasActiveExemption(userId: string): Promise<boolean> {
        const exemption = await this.prisma.taxExemption.findFirst({
            where: {
                userId,
                status: 'APPROVED',
                OR: [
                    { validUntil: null },
                    { validUntil: { gte: new Date() } },
                ],
            },
        });
        return !!exemption;
    }

    // ─── Warehouses ────────────────────────────────────────

    async createWarehouse(data: {
        name: string;
        address: string;
        city: string;
        country: string;
        zipCode?: string;
        latitude?: number;
        longitude?: number;
        supplierId: string;
        isDefault?: boolean;
    }) {
        // If this is the default, unset others
        if (data.isDefault) {
            await this.prisma.warehouse.updateMany({
                where: { supplierId: data.supplierId },
                data: { isDefault: false },
            });
        }
        return this.prisma.warehouse.create({ data });
    }

    async getWarehousesBySupplier(supplierId: string) {
        return this.prisma.warehouse.findMany({
            where: { supplierId },
            orderBy: { isDefault: 'desc' },
        });
    }

    async getAllWarehouses() {
        return this.prisma.warehouse.findMany({ orderBy: { createdAt: 'desc' } });
    }

    async updateWarehouse(id: string, data: any) {
        return this.prisma.warehouse.update({ where: { id }, data });
    }

    async deleteWarehouse(id: string) {
        return this.prisma.warehouse.delete({ where: { id } });
    }

    // ─── Dispatch locations, scoped to the caller ───────────
    // Staff (OWNER/ADMIN; LOGISTICS may only list) act on any supplier's locations; a
    // supplier only ever reaches rows whose supplierId is their own token id. Someone
    // else's row answers 404, so ids can't be probed.

    async listWarehousesFor(actor: FinanceActor, supplierIdQuery?: string) {
        if (actor.role === 'SUPPLIER') return this.getWarehousesBySupplier(actor.id);
        if (supplierIdQuery) return this.getWarehousesBySupplier(supplierIdQuery);
        return this.getAllWarehouses();
    }

    private async ownedWarehouse(actor: FinanceActor, id: string) {
        const w = await this.prisma.warehouse.findUnique({ where: { id } });
        if (!w || (!actor.staff && w.supplierId !== actor.id)) throw new NotFoundException('Location not found');
        return w;
    }

    async createWarehouseFor(actor: FinanceActor, data: WarehouseInput) {
        const supplierId = actor.staff ? data.supplierId : actor.id;
        if (!supplierId) throw new BadRequestException('supplierId is required.');
        if (actor.staff) {
            const owner = await this.prisma.user.findUnique({ where: { id: supplierId }, select: { role: true } });
            if (!owner || owner.role !== 'SUPPLIER') throw new BadRequestException('Choose a supplier account.');
        }
        return this.createWarehouse({
            name: data.name!, address: data.address!, city: data.city!, country: data.country!,
            zipCode: data.zipCode, latitude: data.latitude, longitude: data.longitude, isDefault: data.isDefault, supplierId,
        });
    }

    async updateWarehouseFor(actor: FinanceActor, id: string, data: WarehouseInput) {
        const w = await this.ownedWarehouse(actor, id);
        const { supplierId: _ignored, ...fields } = data;
        if (fields.isDefault) {
            await this.prisma.warehouse.updateMany({ where: { supplierId: w.supplierId, NOT: { id } }, data: { isDefault: false } });
        }
        return this.updateWarehouse(id, fields);
    }

    async deleteWarehouseFor(actor: FinanceActor, id: string) {
        await this.ownedWarehouse(actor, id);
        return this.deleteWarehouse(id);
    }

    // ─── Revenue Reports ───────────────────────────────────

    async getRevenueReport(period: 'week' | 'month' | 'year' = 'month') {
        const now = new Date();
        const since = new Date();
        if (period === 'week') since.setDate(now.getDate() - 7);
        else if (period === 'month') since.setMonth(now.getMonth() - 1);
        else since.setFullYear(now.getFullYear() - 1);

        const feePct = parseFloat(process.env.PLATFORM_FEE_PERCENT || '5') / 100;

        const [orders, totalOrders, paidOrders, pendingOrders, cancelledOrders, topSuppliers] = await Promise.all([
            // Revenue over time (daily buckets for chart)
            this.prisma.order.findMany({
                where: { createdAt: { gte: since }, paymentStatus: 'PAID' },
                select: { createdAt: true, totalAmount: true },
                orderBy: { createdAt: 'asc' },
            }),
            this.prisma.order.count({ where: { createdAt: { gte: since } } }),
            this.prisma.order.count({ where: { createdAt: { gte: since }, paymentStatus: 'PAID' } }),
            this.prisma.order.count({ where: { createdAt: { gte: since }, status: 'PENDING' } }),
            this.prisma.order.count({ where: { createdAt: { gte: since }, status: 'CANCELLED' } }),
            // Top suppliers by revenue
            this.prisma.orderItem.groupBy({
                by: ['productId'],
                where: { order: { createdAt: { gte: since }, paymentStatus: 'PAID' } },
                _sum: { price: true },
                orderBy: { _sum: { price: 'desc' } },
                take: 10,
            }),
        ]);

        const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
        const platformRevenue = totalRevenue * feePct;
        const supplierRevenue = totalRevenue * (1 - feePct);

        // Group by day for chart
        const dailyMap: Record<string, number> = {};
        for (const o of orders) {
            const day = o.createdAt.toISOString().split('T')[0];
            dailyMap[day] = (dailyMap[day] || 0) + o.totalAmount;
        }
        const chart = Object.entries(dailyMap).map(([date, revenue]) => ({ date, revenue }));

        return {
            period,
            totalRevenue,
            platformRevenue,
            supplierRevenue,
            totalOrders,
            paidOrders,
            pendingOrders,
            cancelledOrders,
            conversionRate: totalOrders > 0 ? ((paidOrders / totalOrders) * 100).toFixed(1) : '0',
            chart,
        };
    }

    async getSupplierEarnings(supplierId: string) {
        const feePct = parseFloat(process.env.PLATFORM_FEE_PERCENT || '5') / 100;

        const [items, pendingItems] = await Promise.all([
            this.prisma.orderItem.findMany({
                where: { product: { supplierId }, order: { paymentStatus: 'PAID' } },
                select: { price: true, quantity: true, order: { select: { status: true, createdAt: true } } },
            }),
            this.prisma.orderItem.findMany({
                where: { product: { supplierId }, order: { status: 'PENDING' } },
                select: { price: true, quantity: true },
            }),
        ]);

        const grossRevenue = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const netRevenue = grossRevenue * (1 - feePct);
        const pendingRevenue = pendingItems.reduce((sum, i) => sum + i.price * i.quantity, 0) * (1 - feePct);

        return {
            grossRevenue,
            netRevenue,
            platformFee: grossRevenue * feePct,
            pendingRevenue,
            totalOrders: items.length,
        };
    }

    async getFinancialTransactions(days: number = 30) {
        const since = new Date(Date.now() - days * 86_400_000);
        const orders = await this.prisma.order.findMany({
            where: { createdAt: { gte: since } },
            orderBy: { createdAt: 'desc' },
            include: {
                escrow: true,
            },
        });

        const feePct = parseFloat(process.env.PLATFORM_FEE_PERCENT || '5') / 100;

        return orders.map(o => ({
            orderId: o.id,
            createdAt: o.createdAt.toISOString(),
            status: o.status,
            totalAmount: o.totalAmount,
            platformFee: o.escrow?.platformFee ?? (o.totalAmount * feePct),
            supplierAmount: o.escrow?.supplierAmount ?? (o.totalAmount * (1 - feePct)),
            paymentStatus: o.paymentStatus,
            escrowStatus: o.escrow?.status ?? 'N/A',
        }));
    }
}
