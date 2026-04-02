import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { FinancialAuditService } from '../common/financial-audit.service';
import { PaymentsService } from './payments.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Escrow Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Model:
 *   1. Customer pays → escrowStatus = HELD (money sits in platform Stripe account)
 *   2. Order → DELIVERED → escrowStatus = RELEASED → payoutSupplier() called
 *   3. Dispute RESOLVED_REFUND → escrowStatus = REFUNDED → Stripe refund issued
 *   4. Auto-release cron: orders delivered 7+ days ago with no open disputes
 *
 * Supplier never knows escrow exists — they just receive their basePrice payout.
 */
@Injectable()
export class EscrowService {
    private readonly logger = new Logger(EscrowService.name);

    // Auto-release after this many days if no dispute opened
    private readonly AUTO_RELEASE_DAYS = 7;

    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: FinancialAuditService,
        private readonly paymentsService: PaymentsService,
        private readonly notificationsService: NotificationsService,
    ) {}

    /**
     * Mark funds as held when payment is confirmed.
     * Called automatically by the Stripe webhook (payment_intent.succeeded).
     */
    async holdEscrow(orderId: string): Promise<void> {
        const order = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                escrowStatus: 'HELD',
                escrowHeldAt: new Date(),
            },
            select: { totalAmount: true, buyerId: true },
        });
        await this.audit.log({
            eventType: 'ESCROW_HELD',
            orderId,
            userId:   order.buyerId,
            amount:   order.totalAmount,
        });
        this.logger.log(`Escrow HELD for order ${orderId}`);
    }

    /**
     * Release funds to supplier — called when order is DELIVERED.
     * Triggers actual Stripe transfer only if supplier has Connect account.
     * If not connected, escrow stays RELEASED (will be paid manually).
     */
    async releaseEscrow(orderId: string): Promise<void> {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { buyer: { select: { id: true, name: true } } },
        });
        if (!order) throw new NotFoundException(`Order ${orderId} not found`);
        if (order.escrowStatus === 'RELEASED') return; // idempotent
        if (order.paymentStatus !== 'PAID') {
            this.logger.warn(`Skipping escrow release for unpaid order ${orderId}`);
            return;
        }

        // Mark released first (idempotency — prevents double payout)
        await this.prisma.order.update({
            where: { id: orderId },
            data: { escrowStatus: 'RELEASED', escrowReleasedAt: new Date() },
        });
        await this.audit.log({
            eventType: 'ESCROW_RELEASED',
            orderId,
            userId:   order.buyer?.id,
            amount:   order.totalAmount,
        });

        // Attempt Stripe payout — skip silently if supplier not connected yet
        try {
            await this.paymentsService.payoutSupplier(orderId);
            this.logger.log(`Escrow RELEASED + supplier paid for order ${orderId}`);
        } catch (err) {
            // Supplier hasn't connected Stripe yet — funds stay in platform account
            this.logger.warn(`Escrow released for ${orderId} but payout skipped: ${err.message}`);
        }

        // Notify buyer
        if (order.buyer?.id) {
            await this.notificationsService.create(
                order.buyer.id,
                'Order Completed',
                `Your order #${orderId.slice(-8).toUpperCase()} has been delivered and payment has been released to the supplier.`,
                'SUCCESS',
                { orderId },
            );
        }
    }

    /**
     * Refund buyer — called when dispute resolves with RESOLVED_REFUND decision.
     * Issues Stripe refund and marks escrow as REFUNDED.
     */
    async refundEscrow(orderId: string, buyerId: string): Promise<void> {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException(`Order ${orderId} not found`);
        if (order.escrowStatus === 'REFUNDED') return; // idempotent
        if (order.escrowStatus === 'RELEASED') {
            throw new BadRequestException('Cannot refund: funds already released to supplier');
        }

        await this.prisma.order.update({
            where: { id: orderId },
            data: { escrowStatus: 'REFUNDED', paymentStatus: 'REFUNDED' },
        });
        await this.audit.log({
            eventType: 'ESCROW_REFUNDED',
            orderId,
            userId:   buyerId,
            amount:   order.totalAmount,
        });

        // Issue Stripe refund
        try {
            await this.paymentsService.refund(orderId, buyerId);
            this.logger.log(`Escrow REFUNDED for order ${orderId}`);
        } catch (err) {
            this.logger.error(`Stripe refund failed for ${orderId}: ${err.message}`);
            throw err;
        }

        // Notify buyer
        await this.notificationsService.create(
            buyerId,
            'Refund Approved',
            `Your refund for order #${orderId.slice(-8).toUpperCase()} has been processed. Funds will appear in 3–5 business days.`,
            'SUCCESS',
            { orderId },
        );
    }

    /**
     * Get escrow status for an order.
     */
    async getEscrowStatus(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                escrowStatus: true,
                escrowHeldAt: true,
                escrowReleasedAt: true,
                totalAmount: true,
                paymentStatus: true,
            },
        });
        if (!order) throw new NotFoundException(`Order ${orderId} not found`);
        return order;
    }

    /**
     * Platform-wide escrow summary for admin dashboard.
     */
    async getEscrowSummary() {
        const [held, released, refunded, total] = await Promise.all([
            this.prisma.order.count({ where: { escrowStatus: 'HELD' } }),
            this.prisma.order.count({ where: { escrowStatus: 'RELEASED' } }),
            this.prisma.order.count({ where: { escrowStatus: 'REFUNDED' } }),
            this.prisma.order.aggregate({
                where: { escrowStatus: 'HELD', paymentStatus: 'PAID' },
                _sum: { totalAmount: true },
            }),
        ]);

        return {
            held,
            released,
            refunded,
            heldAmountUSD: total._sum.totalAmount ?? 0,
        };
    }

    // ─── Cron Jobs ────────────────────────────────────────────────────────────

    /**
     * Every day at 3:00 AM — auto-release escrow for delivered orders with
     * no open disputes, delivered more than AUTO_RELEASE_DAYS days ago.
     */
    @Cron('0 3 * * *', { name: 'escrow-auto-release' })
    async autoReleaseEscrow(): Promise<void> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.AUTO_RELEASE_DAYS);

        const eligibleOrders = await this.prisma.order.findMany({
            where: {
                escrowStatus: 'HELD',
                paymentStatus: 'PAID',
                status: 'DELIVERED',
                updatedAt: { lt: cutoff },
                disputes: {
                    none: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
                },
            },
            select: { id: true, buyerId: true },
        });

        if (eligibleOrders.length === 0) {
            this.logger.log('Auto-release cron: no eligible orders');
            return;
        }

        this.logger.log(`Auto-release cron: releasing ${eligibleOrders.length} orders`);
        for (const order of eligibleOrders) {
            try {
                await this.releaseEscrow(order.id);
            } catch (err) {
                this.logger.error(`Auto-release failed for ${order.id}: ${err.message}`);
            }
        }
    }

    /**
     * Every hour — cancel PENDING orders unpaid for more than 24 hours.
     * Frees up stock and cleans up abandoned checkouts.
     */
    @Cron(CronExpression.EVERY_HOUR, { name: 'cancel-abandoned-orders' })
    async cancelAbandonedOrders(): Promise<void> {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - 24);

        const abandoned = await this.prisma.order.findMany({
            where: {
                paymentStatus: 'UNPAID',
                status: 'PENDING',
                createdAt: { lt: cutoff },
            },
            select: { id: true, buyerId: true },
        });

        if (abandoned.length === 0) return;

        this.logger.log(`Cancelling ${abandoned.length} abandoned orders`);
        for (const order of abandoned) {
            await this.prisma.order.update({
                where: { id: order.id },
                data: { status: 'CANCELLED', escrowStatus: 'NOT_STARTED' },
            });
            await this.notificationsService.create(
                order.buyerId,
                'Order Cancelled',
                `Order #${order.id.slice(-8).toUpperCase()} was automatically cancelled due to no payment within 24 hours.`,
                'WARNING',
                { orderId: order.id },
            );
        }
    }

    /**
     * Daily at 09:00 — notify suppliers when any product stock drops below threshold.
     * Threshold: stock <= 10 units (or custom LOW_STOCK_THRESHOLD env var).
     */
    @Cron('0 9 * * *', { name: 'stock-alerts' })
    async checkLowStock(): Promise<void> {
        const threshold = parseInt(process.env.LOW_STOCK_THRESHOLD || '10', 10);

        const lowStockProducts = await this.prisma.product.findMany({
            where: {
                status: 'APPROVED',
                stock: { lte: threshold, gt: 0 },
            },
            select: {
                id: true,
                name: true,
                stock: true,
                supplierId: true,
            },
        });

        if (lowStockProducts.length === 0) return;
        this.logger.log(`Stock alert: ${lowStockProducts.length} products below threshold (${threshold})`);

        // Group by supplier to send one notification per supplier with all affected products
        const bySupplier: Record<string, typeof lowStockProducts> = {};
        for (const p of lowStockProducts) {
            if (!bySupplier[p.supplierId]) bySupplier[p.supplierId] = [];
            bySupplier[p.supplierId].push(p);
        }

        for (const [supplierId, products] of Object.entries(bySupplier)) {
            const names = products.map(p => `${p.name} (${p.stock} left)`).join(', ');
            await this.notificationsService.create(
                supplierId,
                '⚠️ Low Stock Alert',
                `${products.length} product(s) are running low: ${names}. Restock soon to avoid missed orders.`,
                'WARNING',
                { productIds: products.map(p => p.id) },
            ).catch(() => {});
        }
    }

    /**
     * Daily at 09:00 — notify suppliers about out-of-stock products.
     */
    @Cron('5 9 * * *', { name: 'out-of-stock-alerts' })
    async checkOutOfStock(): Promise<void> {
        const outOfStock = await this.prisma.product.findMany({
            where: { status: 'APPROVED', stock: 0 },
            select: { id: true, name: true, supplierId: true },
        });

        if (outOfStock.length === 0) return;

        const bySupplier: Record<string, typeof outOfStock> = {};
        for (const p of outOfStock) {
            if (!bySupplier[p.supplierId]) bySupplier[p.supplierId] = [];
            bySupplier[p.supplierId].push(p);
        }

        for (const [supplierId, products] of Object.entries(bySupplier)) {
            const names = products.map(p => p.name).join(', ');
            await this.notificationsService.create(
                supplierId,
                '🔴 Out of Stock',
                `${products.length} product(s) are out of stock and hidden from buyers: ${names}.`,
                'ERROR',
                { productIds: products.map(p => p.id) },
            ).catch(() => {});
        }
    }
}
