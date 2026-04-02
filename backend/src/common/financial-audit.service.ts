import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export type FinancialEventType =
    | 'PAYMENT_CREATED'
    | 'PAYMENT_SUCCEEDED'
    | 'PAYMENT_FAILED'
    | 'ESCROW_HELD'
    | 'ESCROW_RELEASED'
    | 'ESCROW_REFUNDED'
    | 'PAYOUT_SENT'
    | 'REFUND_ISSUED'
    | 'INVOICE_GENERATED';

export interface FinancialAuditEntry {
    eventType:  FinancialEventType;
    orderId?:   string;
    userId?:    string;
    amount?:    number;
    currency?:  string;
    stripeId?:  string;
    status?:    'OK' | 'FAILED';
    metadata?:  Record<string, unknown>;
}

/**
 * FinancialAuditService — Append-only log of every financial operation.
 * NEVER update or delete rows from FinancialAuditLog.
 * This table is the single source of truth for compliance and dispute resolution.
 */
@Injectable()
export class FinancialAuditService {
    private readonly logger = new Logger('FinancialAudit');

    constructor(private readonly prisma: PrismaService) {}

    async log(entry: FinancialAuditEntry): Promise<void> {
        try {
            await this.prisma.financialAuditLog.create({
                data: {
                    eventType: entry.eventType,
                    orderId:   entry.orderId   ?? null,
                    userId:    entry.userId    ?? null,
                    amount:    entry.amount    ?? null,
                    currency:  entry.currency  ?? 'USD',
                    stripeId:  entry.stripeId  ?? null,
                    status:    entry.status    ?? 'OK',
                    metadata:  (entry.metadata  ?? {}) as any,
                },
            });
        } catch (err) {
            // Audit log failure must NEVER crash the payment flow — only log it
            this.logger.error(`AUDIT LOG FAILED for ${entry.eventType}: ${(err as any).message}`);
        }
    }

    /** Admin: fetch audit trail for a specific order */
    async getByOrder(orderId: string) {
        return this.prisma.financialAuditLog.findMany({
            where: { orderId },
            orderBy: { createdAt: 'asc' },
        });
    }

    /** Admin: fetch audit trail for a specific user */
    async getByUser(userId: string, limit = 50) {
        return this.prisma.financialAuditLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    /** Admin: recent financial events across the platform */
    async getRecent(limit = 100) {
        return this.prisma.financialAuditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }
}
