import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UsersService } from '../users/users.service';
import { StripeGateway } from './stripe.gateway';
import { EscrowStatus, Role } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private prisma: PrismaService,
        private usersService: UsersService,
        private stripe: StripeGateway,
        @Inject(forwardRef(() => OrdersService))
        private ordersService: OrdersService,
    ) {}

    async createConnectOnboardingUrl(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new ForbiddenException('User not found');
        
        if (user.kycStatus !== 'VERIFIED') {
            throw new ForbiddenException('Complete KYC verification before connecting your bank account');
        }

        let accountId = user.stripeAccountId;
        if (!accountId) {
            const account = await this.stripe.stripe.accounts.create({
                type: 'express',
                country: user.country || 'US',
                email: user.email,
                capabilities: {
                    transfers: { requested: true },
                },
                metadata: { userId: user.id },
            });
            accountId = account.id;
            await this.prisma.user.update({
                where: { id: userId },
                data: { stripeAccountId: accountId },
            });
        }

        const accountLink = await this.stripe.stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${process.env.FRONTEND_URL}/supplier/settings/payout?refresh=true`,
            return_url: `${process.env.FRONTEND_URL}/supplier/settings/payout?success=true`,
            type: 'account_onboarding',
        });

        return { url: accountLink.url };
    }

    async getSupplierEarnings(supplierId: string) {
        const escrows = await this.prisma.escrowTransaction.findMany({
            where: {
                order: { supplierId }
            },
            include: {
                order: {
                    select: {
                        id: true,
                        createdAt: true,
                        totalAmount: true,
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const totalEarned = escrows
            .filter(e => e.status === EscrowStatus.RELEASED)
            .reduce((sum, e) => sum + e.supplierAmount, 0);

        const pendingEscrow = escrows
            .filter(e => e.status === EscrowStatus.HOLDING || e.status === EscrowStatus.CAPTURED)
            .reduce((sum, e) => sum + e.supplierAmount, 0);

        const totalPlatformFees = escrows.reduce((sum, e) => sum + e.platformFee, 0);

        return {
            totalEarned,
            pendingEscrow,
            totalPlatformFees,
            transactions: escrows,
        };
    }

    async getAdminRevenue() {
        const escrows = await this.prisma.escrowTransaction.findMany({
            where: { status: EscrowStatus.RELEASED }
        });

        const totalRevenue = escrows.reduce((sum, e) => sum + e.platformFee, 0);
        
        return {
            totalRevenue,
            transactionCount: escrows.length,
            escrows
        };
    }

    async createPaymentIntent(
        orderId: string,
        customerId: string,
        userRole: string,
    ): Promise<{
        clientSecret: string;
        order: any;
    }> {
        const order = await this.ordersService
            .findByIdWithItems(orderId);

        // [ADMIN BYPASS]: Allow Admins or Owners to test payments/checkout
        const isAdmin = userRole === Role.ADMIN || userRole === 'OWNER' || userRole === 'DEVELOPER';
        
        if (!isAdmin && order.customerId !== customerId) {
            throw new ForbiddenException(
                'This order does not belong to you'
            );
        }

        if (order.status !== 'PENDING') {
            throw new BadRequestException(
                `Order status is ${order.status}. ` +
                'Only PENDING orders can be paid.'
            );
        }

        // Calculate split
        const feePercent = this.getPlatformFeePercent();
        const platformFee = order.totalAmount * (feePercent / 100);
        const supplierAmount = order.totalAmount - platformFee;

        const currency = (process.env.DEFAULT_CURRENCY || 'eur').toLowerCase();
        const expectedAmount = Math.round(order.totalAmount * 100);

        // Check for existing Escrow & Intent
        const existing = await this.prisma.escrowTransaction.findUnique({
            where: { orderId }
        });

        if (existing?.stripeIntentId) {
            try {
                const intent = await this.stripe.stripe.paymentIntents.retrieve(existing.stripeIntentId);
                
                if (['succeeded', 'requires_capture', 'processing'].includes(intent.status)) {
                    throw new BadRequestException('PAYMENT_ALREADY_COMPLETED');
                }

                const isAmountCorrect = intent.amount === expectedAmount;
                const isCurrencyCorrect = intent.currency.toLowerCase() === currency;
                const isNotCanceled = intent.status !== 'canceled';
                const hasCardMethod = Array.isArray(intent.payment_method_types) && intent.payment_method_types.includes('card');

                if (isAmountCorrect && isCurrencyCorrect && isNotCanceled && hasCardMethod) {
                    return {
                        clientSecret: intent.client_secret!,
                        order,
                    };
                }

                console.warn(`[Payment] Stale or invalid PaymentIntent detected for Order ${orderId}. Replacing with fresh intent.`);
                console.warn(`[Payment] Diagnostics -> amount:${isAmountCorrect}, cur:${isCurrencyCorrect}, status:${intent.status}, card:${hasCardMethod}`);
            } catch (err) {
                console.error(`[Payment] Failed to retrieve or validate existing PaymentIntent for Order ${orderId}. Will create a new one.`);
            }
        }

        // Create Stripe payment intent
        const intent = await this.stripe.stripe.paymentIntents.create({
            amount: expectedAmount,
            currency,
            capture_method: 'manual',
            payment_method_types: ['card'],
            metadata: {
                orderId: order.id,
                customerId: customerId,
                supplierId: order.supplierId ?? '',
                shippingCompany: order.shippingCompany ?? '',
                estimatedDays: (order as any).shippingEstimatedDays ?? '3-5',
                destinationAddress: (order as any).shippingAddress
                    ? `${(order as any).shippingAddress}`
                    : 'See dashboard',
            },
            description: `Atlantis B2B Order ${orderId}`,
        });

        // Initialize or Update escrow record safely
        if (existing) {
            await this.prisma.escrowTransaction.update({
                where: { id: existing.id },
                data: {
                    amount: order.totalAmount,
                    currency,
                    stripeIntentId: intent.id,
                    status: 'HOLDING'
                }
            });
        } else {
            await this.prisma.escrowTransaction.create({
                data: {
                    orderId,
                    amount: order.totalAmount,
                    currency,
                    platformFee,
                    supplierAmount,
                    status: 'HOLDING',
                    stripeIntentId: intent.id,
                },
            });
        }

        this.logger.log(
            `[ESCROW CREATED] Order: ${orderId} | ` +
            `Total: ${currency.toUpperCase()} ${order.totalAmount} | ` +
            `Platform: ${currency.toUpperCase()} ${platformFee} | ` +
            `Supplier: ${currency.toUpperCase()} ${supplierAmount} | ` +
            `Intent ID: ${intent.id}`,
            'PaymentsService'
        );

        if (!intent.client_secret) {
            this.logger.error(
                `[PAYMENT INTENT ERROR] clientSecret is NULL for intent ${intent.id}`,
                'PaymentsService'
            );
            throw new BadRequestException('Payment intent created but clientSecret is missing');
        }

        return {
            clientSecret: intent.client_secret!,
            order,
        };
    }

    async getConnectStatus(userId: string) {
        const user = await this.usersService.findById(userId);
        const connected = !!user.stripeAccountId;

        if (!connected) {
            return { connected: false, onboarded: false, chargesEnabled: false, accountId: null };
        }

        try {
            // Verify actual status with Stripe (not just the DB flag)
            const account = await this.stripe.stripe.accounts.retrieve(user.stripeAccountId);
            const chargesEnabled = account.charges_enabled ?? false;
            const payoutsEnabled = account.payouts_enabled ?? false;

            // Sync the DB if Stripe says onboarding is complete
            if (chargesEnabled && !user.stripeOnboarded) {
                await this.prisma.user.update({
                    where: { id: userId },
                    data: { stripeOnboarded: true },
                });
            }

            return {
                connected: true,
                onboarded: chargesEnabled,
                chargesEnabled,
                payoutsEnabled,
                accountId: '****' + user.stripeAccountId.slice(-4),
            };
        } catch (err: any) {
            this.logger.error(`[STRIPE STATUS] Failed to retrieve account: ${err.message}`);
            return {
                connected: true,
                onboarded: user.stripeOnboarded ?? false,
                chargesEnabled: user.stripeOnboarded ?? false,
                payoutsEnabled: false,
                accountId: '****' + user.stripeAccountId.slice(-4),
            };
        }
    }

    private getPlatformFeePercent(): number {
        const fee = Number(
            process.env.PLATFORM_FEE_PERCENT
        );
        if (isNaN(fee) || fee <= 0 || fee > 100) {
            this.logger.warn(
                'PLATFORM_FEE_PERCENT invalid — defaulting to 5%',
                'PaymentsService'
            );
            return 5;
        }
        return fee;
    }
}
