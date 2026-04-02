import {
    Controller, Post, Get, Body, Param,
    UseGuards, Request, Headers, RawBodyRequest,
    Req, HttpCode, Query,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}

    /**
     * Create a payment intent for an order.
     * Frontend gets clientSecret → passes to Stripe.js → card charged → webhook fires.
     */
    @Post('create-intent')
    @UseGuards(JwtAuthGuard)
    createIntent(@Body('orderId') orderId: string, @Request() req) {
        return this.paymentsService.createPaymentIntent(orderId, req.user.sub);
    }

    /**
     * Stripe webhook endpoint — must be public (Stripe calls it, not the browser).
     * Raw body required for signature verification — do NOT parse as JSON.
     */
    @Post('webhook')
    @HttpCode(200)
    async webhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('stripe-signature') sig: string,
    ) {
        return this.paymentsService.handleWebhook(req.rawBody as Buffer, sig);
    }

    /**
     * Issue refund (CUSTOMER can request, ADMIN executes).
     */
    @Post('refund/:orderId')
    @UseGuards(JwtAuthGuard)
    refund(
        @Param('orderId') orderId: string,
        @Body('amountCents') amountCents: number,
        @Request() req,
    ) {
        return this.paymentsService.refund(orderId, req.user.sub, amountCents);
    }

    /**
     * Get payment status for an order.
     */
    @Get('status/:orderId')
    @UseGuards(JwtAuthGuard)
    getStatus(@Param('orderId') orderId: string, @Request() req) {
        return this.paymentsService.getPaymentStatus(orderId, req.user.sub);
    }

    /**
     * Supplier: start Stripe Connect onboarding.
     */
    @Post('connect/onboard')
    @UseGuards(JwtAuthGuard)
    connectOnboard(
        @Request() req,
        @Query('returnUrl') returnUrl: string,
        @Query('refreshUrl') refreshUrl: string,
    ) {
        const base = process.env.FRONTEND_URL || 'http://localhost:3000';
        return this.paymentsService.createConnectOnboardingLink(
            req.user.sub,
            returnUrl || `${base}/supplier/payment-methods?connected=true`,
            refreshUrl || `${base}/supplier/payment-methods?refresh=true`,
        );
    }

    /**
     * Supplier: get Stripe Connect account status.
     */
    @Get('connect/status')
    @UseGuards(JwtAuthGuard)
    connectStatus(@Request() req) {
        return this.paymentsService.getConnectStatus(req.user.sub);
    }

    /**
     * Admin: manually trigger supplier payout for a delivered order.
     */
    @Post('payout/:orderId')
    @UseGuards(JwtAuthGuard)
    payout(@Param('orderId') orderId: string) {
        return this.paymentsService.payoutSupplier(orderId);
    }
}
