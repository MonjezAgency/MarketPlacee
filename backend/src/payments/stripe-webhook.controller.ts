import { Controller, Post, Headers, Req, BadRequestException, HttpCode, Logger } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { PrismaService } from '../common/prisma.service';
import { EscrowStatus } from '@prisma/client';
import Stripe from 'stripe';

@Controller('webhooks/stripe')
export class StripeWebhookController {
    private readonly logger = new Logger(StripeWebhookController.name);
    private stripe: Stripe;

    constructor(
        private escrowService: EscrowService,
        private prisma: PrismaService,
    ) {
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            // apiVersion: '2024-06-20',
        });
    }

    @Post()
    @HttpCode(200)
    async handleWebhook(
        @Req() req: any,
        @Headers('stripe-signature') sig: string,
    ) {
        let event: Stripe.Event;

        try {
            // Use req.body directly as it should be the raw buffer thanks to main.ts setup
            event = this.stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET,
            );
        } catch (err: any) {
            this.logger.error(`[WEBHOOK INVALID] ${err.message}`);
            throw new BadRequestException('Invalid Stripe signature');
        }

        this.logger.log(`[WEBHOOK RECEIVED] ${event.type}`);

        switch (event.type) {
            case 'payment_intent.succeeded':
                await this.onPaymentSucceeded(event.data.object as Stripe.PaymentIntent);
                break;
            case 'payment_intent.payment_failed':
                await this.onPaymentFailed(event.data.object as Stripe.PaymentIntent);
                break;
            case 'transfer.created':
                this.logger.log(`[TRANSFER CREATED] ${event.data.object.id}`);
                break;
        }

        return { received: true };
    }

    private async onPaymentSucceeded(intent: Stripe.PaymentIntent) {
        const orderId = intent.metadata.orderId;
        if (!orderId) return;

        const escrow = await this.prisma.escrowTransaction.findUnique({
            where: { orderId },
        });

        // Don't overwrite if already released
        if (escrow && escrow.status !== EscrowStatus.RELEASED) {
            await this.prisma.escrowTransaction.update({
                where: { orderId },
                data: {
                    status: EscrowStatus.CAPTURED,
                    capturedAt: new Date(),
                },
            });
        }

        const order = await this.prisma.order.findUnique({
            where: { id: orderId }
        });

        // Only update to PROCESSING if it's currently PENDING
        if (order && order.status === 'PENDING') {
            await this.prisma.order.update({
                where: { id: orderId },
                data: { status: 'PROCESSING' },
            });
        }

        this.logger.log(`[PAYMENT CAPTURED] Order: ${orderId}`);
    }

    private async onPaymentFailed(intent: Stripe.PaymentIntent) {
        const orderId = intent.metadata.orderId;
        if (!orderId) return;

        await this.prisma.escrowTransaction.update({
            where: { orderId },
            data: { status: EscrowStatus.REFUNDED },
        });

        await this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'CANCELLED' },
        });

        this.logger.error(`[PAYMENT FAILED] Order: ${orderId}`);
    }
}
