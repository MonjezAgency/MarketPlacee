import { Controller, Get, HttpCode, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import Stripe from 'stripe';

@Controller('health')
export class HealthController {
    private stripe: Stripe;
    private readonly logger = new Logger(HealthController.name);

    constructor(private readonly prisma: PrismaService) {
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {});
    }

    @Get()
    @HttpCode(200)
    async check() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
        };
    }

    @Get('database')
    async checkDatabase() {
        const start = Date.now();
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            return {
                status: 'ok',
                responseTimeMs: Date.now() - start,
                timestamp: new Date().toISOString(),
            };
        } catch (err: any) {
            // Public endpoint: log the provider/database error, never echo it (it can carry key fragments, hosts or SQL).
            this.logger.warn(`[HEALTH] check failed: ${err?.message}`);
            return {
                status: 'error',
                message: 'Check failed',
                responseTimeMs: Date.now() - start,
                timestamp: new Date().toISOString(),
            };
        }
    }

    @Get('payments')
    async checkPayments() {
        const start = Date.now();
        try {
            if (!process.env.STRIPE_SECRET_KEY) {
                return { status: 'error', message: 'STRIPE_SECRET_KEY not configured' };
            }
            // Lightweight check — list 1 payment intent just to verify connectivity
            await this.stripe.paymentIntents.list({ limit: 1 });
            return {
                status: 'ok',
                responseTimeMs: Date.now() - start,
                timestamp: new Date().toISOString(),
            };
        } catch (err: any) {
            // Public endpoint: log the provider/database error, never echo it (it can carry key fragments, hosts or SQL).
            this.logger.warn(`[HEALTH] check failed: ${err?.message}`);
            return {
                status: 'error',
                message: 'Check failed',
                responseTimeMs: Date.now() - start,
                timestamp: new Date().toISOString(),
            };
        }
    }
}
