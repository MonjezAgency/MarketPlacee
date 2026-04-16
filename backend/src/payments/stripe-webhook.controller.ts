import { Controller, Post, Headers, Req, BadRequestException, HttpCode, Logger } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { EscrowStatus, Role } from '@prisma/client';
import Stripe from 'stripe';

@Controller('api/payments/webhook')
export class StripeWebhookController {
    private readonly logger = new Logger(StripeWebhookController.name);
    private stripe: Stripe;

    constructor(
        private escrowService: EscrowService,
        private prisma: PrismaService,
        private notifications: NotificationsService,
        private emailService: EmailService,
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
            // Fires when customer confirms payment with manual capture —
            // this is the authorization step (money not moved yet, escrow HOLDING).
            case 'payment_intent.amount_capturable_updated':
                await this.onPaymentAuthorized(event.data.object as Stripe.PaymentIntent);
                break;
            // Fires after platform calls .capture() — money actually moved (escrow CAPTURED).
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

    /**
     * Called when customer authorizes payment (requires_capture state).
     * With escrow/manual capture, this is when funds are locked — move order to PROCESSING
     * so the supplier can see and act on it.
     */
    private async onPaymentAuthorized(intent: Stripe.PaymentIntent) {
        const orderId = intent.metadata.orderId;
        if (!orderId) return;

        const escrow = await this.prisma.escrowTransaction.findUnique({ where: { orderId } });
        if (!escrow || escrow.status !== EscrowStatus.HOLDING) return;

        // Mark escrow as CAPTURED (funds are authorized and locked)
        await this.prisma.escrowTransaction.update({
            where: { orderId },
            data: { status: EscrowStatus.CAPTURED, capturedAt: new Date() },
        });

        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                supplier: { select: { id: true, name: true, email: true } },
                customer: { select: { id: true, name: true, email: true } },
            },
        });

        if (order && order.status === 'PENDING') {
            await this.prisma.order.update({
                where: { id: orderId },
                data: { status: 'PROCESSING' },
            });
        }

        this.logger.log(`[PAYMENT AUTHORIZED] Order: ${orderId} — escrow CAPTURED, order PROCESSING`);

        // ─── Notify supplier (in-app + email) ────────────────────────────
        if (order?.supplierId) {
            const amount = `${(intent.amount / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })} ${intent.currency.toUpperCase()}`;

            this.notifications.create(
                order.supplierId,
                '🛒 New Order Received!',
                `Order #${orderId.slice(-8).toUpperCase()} — ${amount}. A customer has placed and paid for an order. Please prepare it for shipment.`,
                'SUCCESS',
                { orderId, amount },
            ).catch(err => this.logger.error(`[NOTIFY_SUPPLIER] ${err.message}`));

            if (order.supplier?.email) {
                this.emailService.sendMail(
                    order.supplier.email,
                    'Atlantis — New Paid Order Ready to Ship',
                    `
                    <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#F2F4F7;border-radius:16px;overflow:hidden;">
                      <div style="background:#0A1A2F;padding:32px 30px;text-align:center;">
                        <h1 style="color:#fff;font-size:26px;margin:0;">Atlan<span style="color:#1BC7C9;">tis</span></h1>
                      </div>
                      <div style="padding:36px 30px;background:#fff;">
                        <h2 style="color:#0A1A2F;font-size:20px;margin:0 0 12px;">New Paid Order — Ready to Ship 🚀</h2>
                        <p style="color:#2E2E2E;font-size:15px;line-height:1.7;margin:0 0 20px;">
                          Hi ${order.supplier?.name || 'Supplier'},<br/>
                          A customer has successfully paid for order <strong>#${orderId.slice(-8).toUpperCase()}</strong> (${amount}).
                          The funds are held securely in escrow.<br/><br/>
                          Please prepare the goods for shipment as soon as possible.
                        </p>
                        <div style="text-align:center;margin:24px 0;">
                          <a href="${process.env.FRONTEND_URL}/supplier/orders" style="display:inline-block;padding:14px 36px;background:#1BC7C9;color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:1px;">View Order →</a>
                        </div>
                      </div>
                      <div style="background:#0A1A2F;padding:16px;text-align:center;">
                        <p style="color:#667085;font-size:11px;margin:0;">© 2026 Atlantis Marketplace</p>
                      </div>
                    </div>`,
                ).catch(err => this.logger.error(`[EMAIL_SUPPLIER] ${err.message}`));
            }
        }

        // ─── Notify all admins (in-app only) ─────────────────────────────
        const admins = await this.prisma.user.findMany({
            where: { role: { in: [Role.ADMIN, 'OWNER' as any] }, status: 'ACTIVE' },
            select: { id: true },
        });

        for (const admin of admins) {
            this.notifications.create(
                admin.id,
                '💳 Payment Received',
                `Order #${orderId.slice(-8).toUpperCase()} has been paid. Escrow captured — supplier notified to ship.`,
                'INFO',
                { orderId },
            ).catch(err => this.logger.error(`[NOTIFY_ADMIN] ${err.message}`));
        }
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
