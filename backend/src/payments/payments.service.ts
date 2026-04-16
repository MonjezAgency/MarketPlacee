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

        // Return existing intent if already created
        const existing = await this.prisma
            .escrowTransaction.findUnique({
                where: { orderId }
            });

        if (existing?.stripeIntentId) {
            const intent = await this.stripe.stripe.paymentIntents
                .retrieve(existing.stripeIntentId);
            return {
                clientSecret: intent.client_secret!,
                order,
            };
        }

        // Calculate split
        const feePercent = this.getPlatformFeePercent();
        const platformFee =
            order.totalAmount * (feePercent / 100);
        const supplierAmount =
            order.totalAmount - platformFee;

        const currency = (process.env.DEFAULT_CURRENCY || 'eur').toLowerCase();

        // Create Stripe payment intent
        const intent = await this.stripe.stripe.paymentIntents.create({
            amount: Math.round(order.totalAmount * 100),
            currency,
            capture_method: 'manual',
            metadata: {
                orderId: order.id,
                customerId: customerId,
                supplierId: order.supplierId ?? '',
            },
            description: `Atlantis B2B Order ${orderId}`,
        });

        // Initialize escrow record
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

        this.logger.log(
            `[ESCROW CREATED] Order: ${orderId} | ` +
            `Total: £${order.totalAmount} | ` +
            `Platform: £${platformFee} | ` +
            `Supplier: £${supplierAmount}`,
            'PaymentsService'
        );

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
