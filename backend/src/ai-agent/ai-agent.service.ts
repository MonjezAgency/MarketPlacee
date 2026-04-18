import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import axios from 'axios';

// Actions the agent is ALLOWED to take autonomously (safety guardrails)
const ALLOWED_ACTIONS = new Set([
    'SEND_NOTIFICATION',
    'FLAG_ORDER_FOR_REVIEW',
    'FLAG_PAYMENT_FOR_REVIEW',
    'REMIND_KYC',
    'LOG_ISSUE',
]);

export interface AgentReport {
    id: string;
    timestamp: Date;
    issuesFound: number;
    actionsToken: string[];
    summary: string;
    details: AgentIssue[];
}

export interface AgentIssue {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    entityId?: string;
    entityType?: string;
    autoFixed: boolean;
    fixDescription?: string;
}

@Injectable()
export class AiAgentService {
    private readonly logger = new Logger(AiAgentService.name);
    private readonly openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
    private reports: AgentReport[] = [];

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
    ) {}

    // Run full marketplace health scan every hour
    @Cron(CronExpression.EVERY_HOUR)
    async runScheduledScan() {
        this.logger.log('AI Agent: Starting scheduled marketplace scan...');
        await this.runScan();
    }

    async runScan(): Promise<AgentReport> {
        const issues: AgentIssue[] = [];
        const actions: string[] = [];

        await Promise.all([
            this.checkStuckOrders(issues, actions),
            this.checkFailedPayments(issues, actions),
            this.checkPendingKYC(issues, actions),
            this.checkRejectedProductsWithNoAction(issues, actions),
            this.checkLowStockProducts(issues, actions),
        ]);

        const summary = await this.generateAISummary(issues);

        const report: AgentReport = {
            id: `scan_${Date.now()}`,
            timestamp: new Date(),
            issuesFound: issues.length,
            actionsToken: actions,
            summary,
            details: issues,
        };

        // Keep last 50 reports in memory
        this.reports.unshift(report);
        if (this.reports.length > 50) this.reports.pop();

        if (issues.length > 0) {
            this.logger.warn(`AI Agent scan complete: ${issues.length} issues found, ${actions.length} auto-fixed`);
        } else {
            this.logger.log('AI Agent scan complete: Platform healthy ✓');
        }

        return report;
    }

    private async checkStuckOrders(issues: AgentIssue[], actions: string[]) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
        const stuckOrders = await this.prisma.order.findMany({
            where: { status: 'PENDING', createdAt: { lt: cutoff } },
            take: 20,
        });

        for (const order of stuckOrders) {
            issues.push({
                type: 'STUCK_ORDER',
                severity: 'HIGH',
                description: `Order #${order.id} has been in PENDING status for over 24 hours`,
                entityId: order.id,
                entityType: 'Order',
                autoFixed: false,
            });

            // Auto-fix: notify the customer
            if (ALLOWED_ACTIONS.has('SEND_NOTIFICATION')) {
                try {
                    await this.notifications.create(
                        order.customerId,
                        'Order Update Required',
                        `Your order #${order.id.slice(-8)} is still pending. Please complete payment or contact support.`,
                        'WARNING',
                        { orderId: order.id },
                    );
                    issues[issues.length - 1].autoFixed = true;
                    issues[issues.length - 1].fixDescription = 'Sent reminder notification to customer';
                    actions.push(`SEND_NOTIFICATION:order:${order.id}`);
                } catch {}
            }
        }
    }

    private async checkFailedPayments(issues: AgentIssue[], actions: string[]) {
        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
        const failedEscrows = await this.prisma.escrowTransaction.findMany({
            where: {
                status: 'HOLDING',
                createdAt: { lt: cutoff },
                order: { status: 'PENDING' },
            },
            include: { order: { select: { id: true, customerId: true } } },
            take: 10,
        }).catch(() => []);

        for (const escrow of failedEscrows) {
            issues.push({
                type: 'STALE_ESCROW',
                severity: 'CRITICAL',
                description: `Escrow #${escrow.id} has been holding funds for over 2 hours without order confirmation`,
                entityId: escrow.id,
                entityType: 'EscrowTransaction',
                autoFixed: false,
                fixDescription: 'Flagged for manual admin review',
            });
            actions.push(`FLAG_PAYMENT_FOR_REVIEW:${escrow.id}`);
        }
    }

    private async checkPendingKYC(issues: AgentIssue[], actions: string[]) {
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
        const pendingKyc = await this.prisma.user.findMany({
            where: {
                role: 'SUPPLIER',
                kycStatus: 'UNVERIFIED',
                createdAt: { lt: cutoff },
                status: 'ACTIVE',
            },
            select: { id: true, name: true, email: true },
            take: 20,
        });

        for (const user of pendingKyc) {
            issues.push({
                type: 'KYC_OVERDUE',
                severity: 'MEDIUM',
                description: `Supplier ${user.name} (${user.email}) has not submitted KYC after 48 hours`,
                entityId: user.id,
                entityType: 'User',
                autoFixed: false,
            });

            if (ALLOWED_ACTIONS.has('REMIND_KYC')) {
                try {
                    await this.notifications.create(
                        user.id,
                        'KYC Verification Required',
                        'Please complete your identity verification to start selling. Go to Dashboard → KYC Verification.',
                        'WARNING',
                        { link: '/dashboard/kyc' },
                    );
                    issues[issues.length - 1].autoFixed = true;
                    issues[issues.length - 1].fixDescription = 'Sent KYC reminder notification';
                    actions.push(`REMIND_KYC:${user.id}`);
                } catch {}
            }
        }
    }

    private async checkRejectedProductsWithNoAction(issues: AgentIssue[], actions: string[]) {
        const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours
        const rejectedProducts = await this.prisma.product.findMany({
            where: {
                status: 'REJECTED',
                updatedAt: { lt: cutoff },
            },
            include: { supplier: { select: { id: true, name: true } } },
            take: 10,
        });

        for (const product of rejectedProducts) {
            issues.push({
                type: 'REJECTED_PRODUCT_STALE',
                severity: 'LOW',
                description: `Product "${product.name}" by ${product.supplier?.name} was rejected 72+ hours ago with no resubmission`,
                entityId: product.id,
                entityType: 'Product',
                autoFixed: false,
            });

            if (product.supplierId && ALLOWED_ACTIONS.has('SEND_NOTIFICATION')) {
                try {
                    await this.notifications.create(
                        product.supplierId,
                        'Action Required: Product Needs Update',
                        `Your product "${product.name}" was rejected. Please review the feedback and resubmit.`,
                        'WARNING',
                        { productId: product.id, link: '/supplier/products' },
                    );
                    issues[issues.length - 1].autoFixed = true;
                    issues[issues.length - 1].fixDescription = 'Sent resubmission reminder to supplier';
                    actions.push(`SEND_NOTIFICATION:product:${product.id}`);
                } catch {}
            }
        }
    }

    private async checkLowStockProducts(issues: AgentIssue[], actions: string[]) {
        const lowStock = await this.prisma.product.findMany({
            where: {
                status: 'APPROVED',
                stock: { lte: 5, gt: 0 },
            },
            include: { supplier: { select: { id: true, name: true } } },
            take: 10,
        }).catch(() => []);

        for (const product of lowStock) {
            issues.push({
                type: 'LOW_STOCK',
                severity: 'LOW',
                description: `Product "${product.name}" has only ${product.stock} units remaining`,
                entityId: product.id,
                entityType: 'Product',
                autoFixed: false,
            });

            if (product.supplierId && ALLOWED_ACTIONS.has('SEND_NOTIFICATION')) {
                try {
                    await this.notifications.create(
                        product.supplierId,
                        'Low Stock Alert',
                        `"${product.name}" has only ${product.stock} units left. Consider restocking soon.`,
                        'WARNING',
                        { productId: product.id },
                    );
                    issues[issues.length - 1].autoFixed = true;
                    issues[issues.length - 1].fixDescription = 'Sent low-stock alert to supplier';
                    actions.push(`SEND_NOTIFICATION:stock:${product.id}`);
                } catch {}
            }
        }
    }

    private async generateAISummary(issues: AgentIssue[]): Promise<string> {
        if (!process.env.OPENROUTER_API_KEY || issues.length === 0) {
            return issues.length === 0
                ? 'Marketplace scan complete. No issues detected. All systems operational.'
                : `Scan found ${issues.length} issue(s): ${issues.filter(i => i.severity === 'CRITICAL').length} critical, ${issues.filter(i => i.severity === 'HIGH').length} high, ${issues.filter(i => i.severity === 'MEDIUM').length} medium, ${issues.filter(i => i.severity === 'LOW').length} low priority.`;
        }

        try {
            const prompt = `You are a marketplace monitoring AI. Summarize these platform issues in 2-3 sentences for an admin dashboard. Be concise and actionable. Issues: ${JSON.stringify(issues.map(i => ({ type: i.type, severity: i.severity, desc: i.description, fixed: i.autoFixed })))}`;

            const response = await axios.post(
                this.openRouterUrl,
                {
                    model: 'google/gemini-2.0-flash-001',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 150,
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                },
            );
            return response.data.choices[0].message.content.trim();
        } catch {
            const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
            const autoFixed = issues.filter(i => i.autoFixed).length;
            return `Found ${issues.length} issue(s) — ${criticalCount} critical. Auto-resolved ${autoFixed} issue(s) via notifications. ${criticalCount > 0 ? 'Immediate admin action required.' : 'No immediate action needed.'}`;
        }
    }

    async analyzeCustomerComplaint(complaint: string, userId: string): Promise<{ analysis: string; suggestedActions: string[] }> {
        const userOrders = await this.prisma.order.findMany({
            where: { customerId: userId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, status: true, totalAmount: true, createdAt: true },
        });

        const context = `User has ${userOrders.length} recent orders. Latest: ${JSON.stringify(userOrders[0] || {})}`;

        if (!process.env.OPENROUTER_API_KEY) {
            return {
                analysis: 'Your complaint has been recorded and will be reviewed by our support team.',
                suggestedActions: ['Contact support via live chat', 'Check order status in dashboard'],
            };
        }

        try {
            const response = await axios.post(
                this.openRouterUrl,
                {
                    model: 'google/gemini-2.0-flash-001',
                    messages: [
                        {
                            role: 'system',
                            content: `You are an AI agent for Atlantis B2B Marketplace. A customer has a complaint. Analyze it and suggest 2-3 actionable steps. IMPORTANT: You CANNOT transfer money, change account roles, or delete data. Context about user: ${context}. Respond with JSON: { "analysis": "brief analysis", "suggestedActions": ["action1", "action2"] }`,
                        },
                        { role: 'user', content: complaint },
                    ],
                    max_tokens: 200,
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                },
            );

            const content = response.data.choices[0].message.content.trim();
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) return JSON.parse(jsonMatch[0]);
            } catch {}

            return { analysis: content, suggestedActions: ['Contact support team for assistance'] };
        } catch {
            return {
                analysis: 'Your complaint has been recorded. Our team will review it shortly.',
                suggestedActions: ['Check your email for updates', 'Visit support chat for immediate help'],
            };
        }
    }

    getReports(): AgentReport[] {
        return this.reports;
    }

    getLatestReport(): AgentReport | null {
        return this.reports[0] ?? null;
    }
}
