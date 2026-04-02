import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../common/prisma.service';
import { FinancialAuditService } from '../common/financial-audit.service';

@Injectable()
export class PaymentsService {
    private stripe: Stripe;
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private prisma: PrismaService,
        private audit: FinancialAuditService,
    ) {
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
            apiVersion: '2026-03-25.dahlia' as any,
        });
    }

    /**
     * Create a Stripe PaymentIntent for an order.
     * Returns clientSecret to the frontend — card data never touches our server.
     */
    async createPaymentIntent(orderId: string, buyerId: string) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, buyerId },
            include: { buyer: { select: { email: true, name: true, stripeCustomerId: true } } },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.paymentStatus === 'PAID') throw new BadRequestException('Order already paid');

        // Get or create Stripe Customer (for saved cards later)
        let stripeCustomerId = order.buyer?.stripeCustomerId;
        if (!stripeCustomerId && order.buyer?.email) {
            const customer = await this.stripe.customers.create({
                email: order.buyer.email,
                name: order.buyer.name || undefined,
                metadata: { userId: buyerId },
            });
            stripeCustomerId = customer.id;
            await this.prisma.user.update({
                where: { id: buyerId },
                data: { stripeCustomerId },
            });
        }

        // Amount in smallest currency unit (cents for USD, fils for AED, etc.)
        const amountInCents = Math.round(order.totalAmount * 100);

        const paymentIntent = await this.stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'usd', // Change to 'aed' for UAE, 'eur' for Europe
            customer: stripeCustomerId || undefined,
            metadata: {
                orderId,
                buyerId,
                platform: 'atlantis-marketplace',
            },
            automatic_payment_methods: { enabled: true },
            description: `Atlantis Order #${orderId.slice(-8).toUpperCase()}`,
        });

        // Save paymentIntentId to order
        await this.prisma.order.update({
            where: { id: orderId },
            data: { paymentIntentId: paymentIntent.id, paymentStatus: 'PROCESSING' },
        });

        await this.audit.log({
            eventType: 'PAYMENT_CREATED',
            orderId,
            userId:   buyerId,
            amount:   order.totalAmount,
            stripeId: paymentIntent.id,
        });

        return {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: order.totalAmount,
        };
    }

    /**
     * Stripe Webhook — confirms payment and updates order status.
     * Must verify signature to prevent spoofing.
     */
    async handleWebhook(rawBody: Buffer, signature: string) {
        let event: Stripe.Event;

        // ── 1. Verify Stripe signature ────────────────────────────────────────
        try {
            event = this.stripe.webhooks.constructEvent(
                rawBody,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET || '',
            );
        } catch (err) {
            throw new BadRequestException(`Webhook signature invalid: ${err.message}`);
        }

        // ── 2. Idempotency guard — skip already-processed events ──────────────
        const alreadyProcessed = await this.prisma.processedWebhookEvent.findUnique({
            where: { eventId: event.id },
        });
        if (alreadyProcessed) {
            this.logger.warn(`Duplicate webhook skipped: ${event.id} (${event.type})`);
            return { received: true, duplicate: true };
        }

        // ── 3. Handle event ───────────────────────────────────────────────────
        try {
            switch (event.type) {
                case 'payment_intent.succeeded': {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    const orderId = pi.metadata?.orderId;
                    const buyerId = pi.metadata?.buyerId;
                    if (orderId) {
                        await this.prisma.order.update({
                            where: { id: orderId },
                            data: {
                                paymentStatus: 'PAID',
                                paidAt: new Date(),
                                escrowStatus: 'HELD',
                                escrowHeldAt: new Date(),
                            },
                        });
                        await this.audit.log({
                            eventType: 'PAYMENT_SUCCEEDED',
                            orderId,
                            userId:   buyerId,
                            amount:   pi.amount / 100,
                            currency: pi.currency.toUpperCase(),
                            stripeId: pi.id,
                        });
                    }
                    break;
                }
                case 'payment_intent.payment_failed': {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    const orderId = pi.metadata?.orderId;
                    const buyerId = pi.metadata?.buyerId;
                    if (orderId) {
                        await this.prisma.order.update({
                            where: { id: orderId },
                            data: { paymentStatus: 'FAILED' },
                        });
                        await this.audit.log({
                            eventType: 'PAYMENT_FAILED',
                            orderId,
                            userId:   buyerId,
                            amount:   pi.amount / 100,
                            stripeId: pi.id,
                            status:   'FAILED',
                            metadata: { reason: pi.last_payment_error?.message },
                        });
                    }
                    break;
                }
            }
        } catch (err) {
            this.logger.error(`Webhook processing error for ${event.id}: ${err.message}`);
            // Don't mark as processed if handling failed — Stripe will retry
            throw err;
        }

        // ── 4. Mark event as processed (idempotency record) ──────────────────
        await this.prisma.processedWebhookEvent.create({
            data: { eventId: event.id, eventType: event.type },
        });

        return { received: true };
    }

    /**
     * Issue a full or partial refund.
     */
    async refund(orderId: string, buyerId: string, amountCents?: number) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, buyerId },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.paymentStatus !== 'PAID') throw new BadRequestException('Order not paid yet');
        if (!order.paymentIntentId) throw new BadRequestException('No payment intent found');

        const refund = await this.stripe.refunds.create({
            payment_intent: order.paymentIntentId,
            ...(amountCents ? { amount: amountCents } : {}),
        });

        await this.prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'REFUNDED' },
        });

        await this.audit.log({
            eventType: 'REFUND_ISSUED',
            orderId,
            userId:   buyerId,
            amount:   amountCents ? amountCents / 100 : order.totalAmount,
            stripeId: refund.id,
            metadata: { refundStatus: refund.status },
        });

        return { refundId: refund.id, status: refund.status };
    }

    async getPaymentStatus(orderId: string, buyerId: string) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, buyerId },
            select: { id: true, paymentStatus: true, paidAt: true, totalAmount: true },
        });
        if (!order) throw new NotFoundException('Order not found');
        return order;
    }

    // ─── Stripe Connect (Supplier Payouts) ───────────────────

    /**
     * Create a Stripe Connect onboarding link for a supplier.
     * Supplier completes their identity/bank info on Stripe's hosted page.
     */
    async createConnectOnboardingLink(supplierId: string, returnUrl: string, refreshUrl: string) {
        const supplier = await this.prisma.user.findUnique({ where: { id: supplierId } });
        if (!supplier) throw new NotFoundException('Supplier not found');

        let stripeAccountId = supplier.stripeAccountId;

        if (!stripeAccountId) {
            const account = await this.stripe.accounts.create({
                type: 'express',
                email: supplier.email,
                metadata: { supplierId },
                capabilities: { transfers: { requested: true } },
            });
            stripeAccountId = account.id;
            await this.prisma.user.update({
                where: { id: supplierId },
                data: { stripeAccountId },
            });
        }

        const link = await this.stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
        });

        return { url: link.url, stripeAccountId };
    }

    /**
     * Get Stripe Connect account status for a supplier.
     */
    async getConnectStatus(supplierId: string) {
        const supplier = await this.prisma.user.findUnique({
            where: { id: supplierId },
            select: { stripeAccountId: true },
        });
        if (!supplier?.stripeAccountId) {
            return { connected: false, chargesEnabled: false, payoutsEnabled: false };
        }

        const account = await this.stripe.accounts.retrieve(supplier.stripeAccountId);
        return {
            connected: true,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            stripeAccountId: supplier.stripeAccountId,
        };
    }

    /**
     * Pay out the supplier after order delivery.
     * Model: Customer pays (basePrice × markup). Supplier receives basePrice.
     * Platform keeps the markup difference — no deduction from supplier's price.
     *
     * supplierAmount = Σ (item.product.basePrice × item.quantity)
     */
    async payoutSupplier(orderId: string) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: {
                            select: {
                                basePrice: true,
                                price: true,
                                supplierId: true,
                                supplier: { select: { stripeAccountId: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.paymentStatus !== 'PAID') throw new BadRequestException('Order not yet paid');

        // Sum of (basePrice × qty) — what the supplier originally priced their goods at.
        // basePrice is the supplier's price BEFORE markup. Customer pays price (with markup).
        // Platform revenue = order.totalAmount − supplierTotal (the markup difference).
        let supplierTotal = 0;
        for (const item of order.items) {
            const base = item.product?.basePrice ?? item.product?.price ?? 0;
            supplierTotal += base * item.quantity;
        }
        const supplierAmountCents = Math.round(supplierTotal * 100);
        if (supplierAmountCents <= 0) throw new BadRequestException('Cannot calculate supplier payout amount');

        // Find the primary supplier (all items in one order belong to one supplier)
        const stripeAccountId = order.items[0]?.product?.supplier?.stripeAccountId;
        if (!stripeAccountId) throw new BadRequestException('Supplier has not connected their Stripe account yet');

        const transfer = await this.stripe.transfers.create({
            amount: supplierAmountCents,
            currency: 'usd',
            destination: stripeAccountId,
            metadata: { orderId, platform: 'atlantis-marketplace' },
            description: `Payout for Order #${orderId.slice(-8).toUpperCase()}`,
        });

        const platformRevenue = order.totalAmount - supplierTotal;
        const supplierId = order.items[0]?.product?.supplierId;

        await this.audit.log({
            eventType: 'PAYOUT_SENT',
            orderId,
            userId:   supplierId,
            amount:   supplierTotal,
            stripeId: transfer.id,
            metadata: {
                platformRevenue: Math.round(platformRevenue * 100) / 100,
                stripeAccountId,
            },
        });

        return {
            transferId: transfer.id,
            supplierAmount: supplierTotal,
            platformRevenue: Math.round(platformRevenue * 100) / 100,
        };
    }
}
