import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StripeGateway } from './stripe.gateway';
import { EscrowStatus } from '@prisma/client';

@Injectable()
export class EscrowService {
    private readonly logger = new Logger(EscrowService.name);

    constructor(
        private prisma: PrismaService,
        private stripe: StripeGateway,
    ) {}

    private getPlatformFeePercent(): number {
        const fee = Number(process.env.PLATFORM_FEE_PERCENT);
        if (isNaN(fee) || fee < 0 || fee > 100) {
            this.logger.warn('[PAYMENT] PLATFORM_FEE_PERCENT invalid, defaulting to 5%');
            return 5;
        }
        return fee;
    }

    async createEscrow(
        orderId: string,
        amount: number,
        currency: string,
        customerId: string,
        supplierId: string,
    ) {
        const feePercent = this.getPlatformFeePercent();
        const platformFee = amount * (feePercent / 100);
        const supplierAmount = amount - platformFee;

        // Create the Stripe Payment Intent (Auth only)
        const intent = await this.stripe.createPaymentIntent(amount, currency, {
            orderId,
            customerId,
            supplierId,
        });

        const escrow = await this.prisma.escrowTransaction.create({
            data: {
                orderId,
                amount,
                currency,
                platformFee,
                supplierAmount,
                status: EscrowStatus.HOLDING,
                stripeIntentId: intent.id,
            },
        });

        this.logger.log(`[ESCROW CREATED] Order: ${orderId} Amount: ${amount} Fee: ${platformFee}`);
        return escrow;
    }

    async releaseEscrow(orderId: string) {
        const escrow = await this.prisma.escrowTransaction.findUnique({
            where: { orderId },
            include: { order: { include: { supplier: true } } },
        });

        if (!escrow || (escrow.status !== EscrowStatus.HOLDING && escrow.status !== EscrowStatus.CAPTURED)) {
            throw new BadRequestException('Escrow not in a state that can be released');
        }

        const supplier = escrow.order.supplier;
        if (!supplier.stripeAccountId) {
            throw new BadRequestException('Supplier has not connected their Stripe account');
        }

        // 1. Capture the intent if it hasn't been captured yet
        // In our manual capture flow, HOLDING means authorized but not yet captured.
        // We capture it now to move funds from Buyer to Platform.
        if (escrow.status === EscrowStatus.HOLDING) {
            try {
                await this.stripe.stripe.paymentIntents.capture(escrow.stripeIntentId);
                this.logger.log(`[STRIPE CAPTURE] Intent: ${escrow.stripeIntentId} for Order: ${orderId}`);
            } catch (err: any) {
                this.logger.error(`[STRIPE CAPTURE FAILED] ${err.message}`);
                throw new BadRequestException('Failed to capture funds from buyer: ' + err.message);
            }
        }

        // 2. Transfer funds to supplier's Connect account
        // This moves funds from Platform Balance to Supplier Connect Account.
        const transfer = await this.stripe.stripe.transfers.create({
            amount: Math.round(escrow.supplierAmount * 100),
            currency: escrow.currency,
            destination: supplier.stripeAccountId,
            transfer_group: orderId,
            metadata: {
                orderId,
                supplierId: supplier.id,
                platformFee: escrow.platformFee.toString(),
            },
        });

        await this.prisma.escrowTransaction.update({
            where: { orderId },
            data: {
                status: EscrowStatus.RELEASED,
                releasedAt: new Date(),
                stripeTransferId: transfer.id,
            },
        });

        this.logger.log(`[ESCROW RELEASED] Order: ${orderId} Transfer: ${transfer.id}`);
    }

    async refundEscrow(orderId: string, reason: string) {
        const escrow = await this.prisma.escrowTransaction.findUnique({
            where: { orderId },
        });

        if (!escrow) throw new NotFoundException('Escrow not found');

        // Refund the Stripe payment intent
        await this.stripe.refund(escrow.stripeIntentId, escrow.amount, reason);

        await this.prisma.escrowTransaction.update({
            where: { orderId },
            data: { status: EscrowStatus.REFUNDED },
        });

        this.logger.log(`[ESCROW REFUNDED] Order: ${orderId} Reason: ${reason}`);
    }
}
