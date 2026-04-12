import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SecurityService } from './security.service';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ThreatDetectionService implements OnModuleInit {
    private readonly logger = new Logger('ThreatDetection');

    constructor(
        private securityService: SecurityService,
        private prisma: PrismaService,
    ) { }

    onModuleInit() {
        // Start a periodic analysis job - throttled to 5 minutes for performance
        setInterval(() => this.analyzeThreats(), 300000); // Every 5 minutes
    }

    private readonly WHITELISTED_IPS = ['::1', '127.0.0.1', '::ffff:127.0.0.1'];

    async analyzeThreats() {
        this.logger.log('Running automated threat analysis...');
        // Order-level fraud patterns
        await this.analyzeOrderFraud().catch(() => {});

        // 1. Detect Brute Force (e.g., > 10 UNAUTHORIZED_ACCESS from same IP in 5 mins)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60000);

        try {
            const logs = await this.prisma.securityLog.groupBy({
                by: ['ip'],
                where: {
                    eventType: 'UNAUTHORIZED_ACCESS',
                    createdAt: { gte: fiveMinutesAgo },
                },
                _count: {
                    id: true,
                },
            });

            for (const log of logs) {
                // Never block localhost / whitelisted IPs
                if (log.ip && this.WHITELISTED_IPS.includes(log.ip)) continue;

                if (log._count.id > 10 && log.ip) {
                    this.logger.warn(`Potential brute force detected from IP: ${log.ip}`);
                    await this.securityService.blockIp(log.ip, 'Brute force detected', 60); // Block for 1 hour
                    await this.securityService.logEvent({
                        level: 'CRITICAL',
                        eventType: 'THREAT_REACTION',
                        description: `IP ${log.ip} blocked for brute force.`,
                        ip: log.ip,
                    });
                }
            }
        } catch (error) {
            this.logger.error('Threat analysis failed', error);
        }

        // 2. Detect Endpoint Scanning (e.g., > 20 NOT_FOUND_SCAN from same IP in 5 mins)
        try {
            const scanLogs = await this.prisma.securityLog.groupBy({
                by: ['ip'],
                where: {
                    eventType: 'NOT_FOUND_SCAN',
                    createdAt: { gte: fiveMinutesAgo },
                },
                _count: {
                    id: true,
                },
            });

            for (const log of scanLogs) {
                if (log._count.id > 20 && log.ip) {
                    this.logger.warn(`Potential endpoint scanning detected from IP: ${log.ip}`);
                    await this.securityService.blockIp(log.ip, 'Endpoint scanning detected', 1440); // Block for 24 hours
                }
            }
        } catch (error) { }
    }

    async checkLockdownStatus(): Promise<boolean> {
        try {
            const config = await this.prisma.securityConfig.findUnique({
                where: { key: 'EMERGENCY_LOCKDOWN' },
            });
            return config?.value === 'true';
        } catch (error) {
            return false;
        }
    }

    async toggleLockdown(status: boolean) {
        try {
            await this.prisma.securityConfig.upsert({
                where: { key: 'EMERGENCY_LOCKDOWN' },
                update: { value: status.toString() },
                create: { key: 'EMERGENCY_LOCKDOWN', value: status.toString(), description: 'System-wide emergency lockdown' },
            });

            await this.securityService.logEvent({
                level: 'CRITICAL',
                eventType: 'SYSTEM_LOCKDOWN',
                description: `Emergency lockdown ${status ? 'ENABLED' : 'DISABLED'}`,
            });
        } catch (error) { }
    }

    // ─── Order-Level Fraud Detection ─────────────────────────────────────────
    // Runs as part of the 5-minute threat analysis cycle (called from analyzeThreats).
    // Also triggered manually from the security controller.

    async analyzeOrderFraud(): Promise<{ flagged: number; patterns: string[] }> {
        const oneHourAgo  = new Date(Date.now() - 3_600_000);
        const oneDayAgo   = new Date(Date.now() - 86_400_000);
        const patterns: string[] = [];
        let flagged = 0;

        try {
            // ── Pattern 1: Velocity — customer places >5 orders in 1 hour ──────
            const velocityGroups = await this.prisma.order.groupBy({
                by: ['customerId'],
                where: { createdAt: { gte: oneHourAgo } },
                _count: { id: true },
            });

            for (const g of velocityGroups) {
                if (g._count.id > 5) {
                    flagged++;
                    const msg = `Order velocity fraud: customer ${g.customerId} placed ${g._count.id} orders in 1 hour`;
                    patterns.push(msg);
                    await this.securityService.logEvent({
                        level: 'WARN',
                        eventType: 'FRAUD_ORDER_VELOCITY',
                        description: msg,
                        userId: g.customerId,
                    });
                }
            }

            // ── Pattern 2: Abnormally large single order (> $10 000) ─────────
            const largeOrders = await this.prisma.order.findMany({
                where: {
                    createdAt: { gte: oneDayAgo },
                    totalAmount: { gt: 10000 },
                    paymentStatus: { not: 'PAID' },
                },
                select: { id: true, customerId: true, totalAmount: true },
            });

            for (const o of largeOrders) {
                flagged++;
                const msg = `Large unpaid order: #${o.id.slice(-8)} — $${o.totalAmount.toFixed(2)} by customer ${o.customerId}`;
                patterns.push(msg);
                await this.securityService.logEvent({
                    level: 'WARN',
                    eventType: 'FRAUD_LARGE_ORDER',
                    description: msg,
                    userId: o.customerId,
                    metadata: { orderId: o.id, amount: o.totalAmount },
                });
            }

            // ── Pattern 3: High dispute rate for a single customer (>2 in 7 days) ─
            const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
            const disputeGroups = await this.prisma.dispute.groupBy({
                by: ['customerId'],
                where: { createdAt: { gte: sevenDaysAgo } },
                _count: { id: true },
            });

            for (const g of disputeGroups) {
                if (g._count.id > 2) {
                    flagged++;
                    const msg = `High dispute rate: customer ${g.customerId} opened ${g._count.id} disputes in 7 days`;
                    patterns.push(msg);
                    await this.securityService.logEvent({
                        level: 'WARN',
                        eventType: 'FRAUD_DISPUTE_ABUSE',
                        description: msg,
                        userId: g.customerId,
                    });
                }
            }

            // ── Pattern 4: Same customer cancels >3 orders in 24 hours ──────────
            const cancelGroups = await this.prisma.order.groupBy({
                by: ['customerId'],
                where: {
                    status: 'CANCELLED',
                    updatedAt: { gte: oneDayAgo },
                },
                _count: { id: true },
            });

            for (const g of cancelGroups) {
                if (g._count.id > 3) {
                    flagged++;
                    const msg = `Cancellation abuse: customer ${g.customerId} cancelled ${g._count.id} orders in 24 hours`;
                    patterns.push(msg);
                    await this.securityService.logEvent({
                        level: 'WARN',
                        eventType: 'FRAUD_CANCEL_ABUSE',
                        description: msg,
                        userId: g.customerId,
                    });
                }
            }

        } catch (err) {
            this.logger.error('Order fraud analysis failed', err);
        }

        if (flagged > 0) {
            this.logger.warn(`Fraud analysis: ${flagged} suspicious pattern(s) detected`);
        }

        return { flagged, patterns };
    }
}
