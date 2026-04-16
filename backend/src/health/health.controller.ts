import { Controller, Get, HttpCode } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import Stripe from 'stripe';

@Controller('health')
export class HealthController {
    private stripe: Stripe;

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
            return {
                status: 'error',
                message: err.message,
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
            return {
                status: 'error',
                message: err.message,
                responseTimeMs: Date.now() - start,
                timestamp: new Date().toISOString(),
            };
        }
    }
}
