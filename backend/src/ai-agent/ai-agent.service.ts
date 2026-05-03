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
    'APPROVE_KYC',
    'REJECT_KYC',
    'CATEGORIZE_PRODUCT',
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

    async categorizeProduct(productName: string, description: string, categories: string[]): Promise<string | null> {
        if (!process.env.OPENROUTER_API_KEY) return null;

        try {
            const prompt = `You are a product categorization expert. Given a product name and description, select the most appropriate category from the provided list. Return ONLY the category name exactly as it appears in the list. If no category matches, return "General".
            
Product Name: ${productName}
Description: ${description}
Categories List: ${categories.join(', ')}`;

            const response = await axios.post(
                this.openRouterUrl,
                {
                    model: 'google/gemini-2.0-flash-001',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 50,
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 20000,
                },
            );

            const result = response.data.choices[0].message.content.trim();
            return categories.includes(result) ? result : null;
        } catch {
            return null;
        }
    }

    async verifyKYCDocument(frontUrl: string, backUrl?: string): Promise<{ approved: boolean; reason: string }> {
        if (!process.env.OPENROUTER_API_KEY) {
            return { approved: false, reason: 'AI Verification system offline' };
        }

        try {
            const prompt = `You are an Identity Document Verification Expert. Analyze the provided image(s) of an ID card or Passport. 
            Check for:
            1. Is it a real identity document (National ID, Passport, or License)?
            2. Is the image clear and legible?
            3. Are there any obvious signs of tampering or forgery?
            
            Respond only in JSON format: { "approved": boolean, "reason": "short explanation" }`;

            const images = [{ type: 'image_url', image_url: { url: frontUrl } }];
            if (backUrl) images.push({ type: 'image_url', image_url: { url: backUrl } });

            const response = await axios.post(
                this.openRouterUrl,
                {
                    model: 'google/gemini-2.0-flash-001',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                ...images
                            ]
                        }
                    ],
                    max_tokens: 300,
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                },
            );

            const content = response.data.choices[0].message.content.trim();
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);

            return { approved: false, reason: 'AI analysis failed to produce a clear result' };
        } catch (error) {
            this.logger.error(`KYC AI Verification ERROR: ${error.message}`);
            return { approved: false, reason: 'Error during AI processing' };
        }
    }

    getReports(): AgentReport[] {
        return this.reports;
    }

    getLatestReport(): AgentReport | null {
        return this.reports[0] ?? null;
    }

    /**
     * Use an LLM to figure out which Excel column maps to which product
     * field. Works regardless of column order, header position, language,
     * or extra/unexpected columns. Falls back gracefully if the LLM is
     * unavailable — caller should fall back to its own header heuristics.
     *
     * Inputs: a small sample of the sheet (first ~12 rows is enough).
     * Output: { 0: 'name', 1: 'price', 2: null, ... } where null = ignore.
     */
    async detectColumnMapping(sampleRows: any[][]): Promise<{
        mapping: Record<number, string | null>;
        headerRowIndex: number;
        confidence: 'high' | 'medium' | 'low';
        reasoning?: string;
    } | null> {
        if (!process.env.OPENROUTER_API_KEY) return null;
        if (!sampleRows || sampleRows.length === 0) return null;

        // Trim to at most 12 rows × 20 cols so we don't blow the prompt budget
        const trimmed = sampleRows.slice(0, 12).map(r => (r || []).slice(0, 20));
        const sheetText = trimmed
            .map((r, i) => `Row ${i}: ${JSON.stringify(r)}`)
            .join('\n');

        const allowedFields = [
            'name', 'description', 'brand', 'category', 'ean',
            'price', 'stock', 'unit',
            'unitsPerCase', 'casesPerPallet', 'unitsPerPallet', 'palletsPerShipment',
            'shelfLife', 'origin', 'weight', 'moq',
        ];

        const prompt = `You are a smart spreadsheet analyst for a B2B wholesale marketplace. Given a sample of an Excel sheet (first 12 rows), figure out:
1. Which row is the header (might not be row 0 — could be row 1, 2, etc., depending on title rows / merged cells / sub-headers).
2. Which product field each column corresponds to. Use BOTH the header text AND the actual data values to decide.
3. If a column has no clear meaning, set it to null.

Allowed field names (use ONLY these, anything else is invalid):
${allowedFields.join(', ')}

Important rules:
- "ean" is the SKU / Item number / barcode (long numeric or alphanumeric ID).
- "stock" is the available quantity (integer).
- "unitsPerCase" is pieces per case/carton (e.g. value "C24" = 24).
- "casesPerPallet" is how many cases stack on a pallet.
- "unitsPerPallet" should be left null if the column is "available physical in pallets" (that's the stock expressed in pallet units, not the conversion factor — we'll auto-compute it).
- "shelfLife" is for batch number / expiry date columns.
- "name" is the human-readable product name (text with letters).
- "price" is the per-unit selling price (decimal, usually small like 0.38, 1.99, 5.45).
- A long 8-13 digit number that's not a date is likely an EAN.
- A YYYYMMDD-style number (e.g. 20260731) is a date → shelfLife.

Respond ONLY with valid JSON of this exact shape:
{
  "headerRowIndex": <integer>,
  "mapping": { "0": "name" | null, "1": "price" | null, ... },
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence>"
}

Sheet sample:
${sheetText}`;

        try {
            const response = await axios.post(
                this.openRouterUrl,
                {
                    model: 'anthropic/claude-3.5-haiku',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 800,
                    temperature: 0.1,
                    response_format: { type: 'json_object' },
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 25000,
                },
            );

            const raw = response.data?.choices?.[0]?.message?.content;
            if (!raw) return null;

            // The model sometimes wraps JSON in ```json ... ``` — strip it
            const cleaned = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            const parsed = JSON.parse(cleaned);

            if (typeof parsed.headerRowIndex !== 'number') return null;
            if (!parsed.mapping || typeof parsed.mapping !== 'object') return null;

            // Convert string keys → number, validate field names against allowlist
            const mapping: Record<number, string | null> = {};
            for (const [k, v] of Object.entries(parsed.mapping)) {
                const colIdx = Number(k);
                if (Number.isNaN(colIdx)) continue;
                if (v === null || v === undefined || v === '') {
                    mapping[colIdx] = null;
                } else if (allowedFields.includes(String(v))) {
                    mapping[colIdx] = String(v);
                } else {
                    mapping[colIdx] = null;
                }
            }

            this.logger.log(`[AI ColumnMapper] header=${parsed.headerRowIndex} confidence=${parsed.confidence} mapping=${JSON.stringify(mapping)}`);

            return {
                mapping,
                headerRowIndex: parsed.headerRowIndex,
                confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
                reasoning: parsed.reasoning,
            };
        } catch (e: any) {
            this.logger.warn(`[AI ColumnMapper] failed: ${e?.message}`);
            return null;
        }
    }
}
