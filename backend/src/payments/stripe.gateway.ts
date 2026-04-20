import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

export interface PaymentMetadata {
    orderId: string;
    customerId: string;
    supplierId: string;
}

@Injectable()
export class StripeGateway {
    public stripe: Stripe;

    constructor() {
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            // apiVersion: '2024-06-20',
        });
    }

    async createPaymentIntent(amount: number, currency: string, metadata: PaymentMetadata) {
        return this.stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // convert to cents
            currency,
            metadata: {
                orderId: metadata.orderId,
                customerId: metadata.customerId,
                supplierId: metadata.supplierId,
            },
            capture_method: 'manual', // for escrow
        });
    }

    async confirmPayment(intentId: string) {
        return this.stripe.paymentIntents.capture(intentId);
    }

    async refund(intentId: string, amount: number, reason: string) {
        return this.stripe.refunds.create({
            payment_intent: intentId,
            amount: Math.round(amount * 100),
            reason: reason as Stripe.RefundCreateParams.Reason,
        });
    }

    async cancelPaymentIntent(intentId: string) {
        return this.stripe.paymentIntents.cancel(intentId);
    }
}
