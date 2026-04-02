import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ReportsService {
    private readonly logger = new Logger('ReportsService');

    constructor(
        private prisma: PrismaService,
        private email: EmailService,
    ) {}

    /**
     * Weekly report — every Monday at 08:00 AM
     */
    @Cron('0 8 * * 1')
    async sendWeeklyReport() {
        this.logger.log('Generating weekly financial report...');
        try {
            const report = await this.buildReport(7);
            await this.dispatchToAdmins(report, 'weekly');
        } catch (err) {
            this.logger.error('Weekly report failed', err);
        }
    }

    /**
     * Monthly report — 1st of every month at 08:00 AM
     */
    @Cron('0 8 1 * *')
    async sendMonthlyReport() {
        this.logger.log('Generating monthly financial report...');
        try {
            const report = await this.buildReport(30);
            await this.dispatchToAdmins(report, 'monthly');
        } catch (err) {
            this.logger.error('Monthly report failed', err);
        }
    }

    /** Called manually from controller for on-demand reports */
    async generateReport(days: number) {
        return this.buildReport(days);
    }

    // ─────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────

    private async buildReport(days: number) {
        const since = new Date(Date.now() - days * 86_400_000);

        const [orders, newUsers, newSuppliers, pendingKyc, disputes] = await Promise.all([
            this.prisma.order.findMany({
                where: { createdAt: { gte: since } },
                include: { items: { include: { product: { select: { basePrice: true, name: true } } } } },
            }),
            this.prisma.user.count({ where: { createdAt: { gte: since }, role: 'CUSTOMER' } }),
            this.prisma.user.count({ where: { createdAt: { gte: since }, role: 'SUPPLIER' } }),
            this.prisma.kYCDocument.count({ where: { status: 'PENDING' } }),
            this.prisma.dispute.count({ where: { createdAt: { gte: since } } }),
        ]);

        const delivered = orders.filter(o => o.status === 'DELIVERED');
        const cancelled = orders.filter(o => o.status === 'CANCELLED');
        const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);

        // Platform profit = sum of (price - basePrice) * qty for all delivered items
        let platformProfit = 0;
        for (const o of delivered) {
            for (const item of o.items) {
                const base = item.product?.basePrice ?? 0;
                platformProfit += (item.price - base) * item.quantity;
            }
        }

        return {
            period: `Last ${days} days`,
            generatedAt: new Date().toISOString(),
            totalOrders: orders.length,
            deliveredOrders: delivered.length,
            cancelledOrders: cancelled.length,
            grossRevenue: revenue,
            platformProfit,
            newCustomers: newUsers,
            newSuppliers,
            pendingKyc,
            newDisputes: disputes,
            conversionRate: orders.length > 0 ? ((delivered.length / orders.length) * 100).toFixed(1) : '0',
        };
    }

    private async dispatchToAdmins(report: any, type: 'weekly' | 'monthly') {
        const admins = await this.prisma.user.findMany({
            where: { role: { in: ['ADMIN', 'MODERATOR'] }, status: 'ACTIVE' },
            select: { email: true, name: true },
        });

        const subject = type === 'weekly'
            ? `📊 Atlantis Weekly Report — ${new Date().toLocaleDateString()}`
            : `📊 Atlantis Monthly Report — ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`;

        const html = this.buildReportEmail(report, subject);

        await Promise.allSettled(
            admins.map(admin =>
                this.email.sendRawEmail(admin.email, subject, html),
            ),
        );
        this.logger.log(`Report sent to ${admins.length} admin(s)`);
    }

    private buildReportEmail(r: any, subject: string): string {
        const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:'Segoe UI',sans-serif;background:#F2F4F7;padding:40px 20px;margin:0">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:#0A1A2F;padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:900">Atlan<span style="color:#1BC7C9">tis</span></h1>
    <p style="color:#B0BCCF;margin:8px 0 0;font-size:13px">${subject}</p>
    <p style="color:#667085;margin:4px 0 0;font-size:11px">Period: ${r.period} · Generated: ${new Date(r.generatedAt).toLocaleString()}</p>
  </div>
  <div style="padding:32px">
    <h2 style="color:#0A1A2F;font-size:16px;margin:0 0 20px;text-transform:uppercase;letter-spacing:2px">Financial Overview</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#F8FAFC"><td style="padding:12px 16px;font-size:14px;color:#667085">Gross Revenue</td><td style="padding:12px 16px;font-size:16px;font-weight:900;color:#1BC7C9;text-align:right">${fmt(r.grossRevenue)}</td></tr>
      <tr><td style="padding:12px 16px;font-size:14px;color:#667085">Platform Profit (Markup)</td><td style="padding:12px 16px;font-size:16px;font-weight:900;color:#10B981;text-align:right">${fmt(r.platformProfit)}</td></tr>
      <tr style="background:#F8FAFC"><td style="padding:12px 16px;font-size:14px;color:#667085">Total Orders</td><td style="padding:12px 16px;font-size:14px;font-weight:700;text-align:right">${r.totalOrders}</td></tr>
      <tr><td style="padding:12px 16px;font-size:14px;color:#667085">Delivered</td><td style="padding:12px 16px;font-size:14px;font-weight:700;color:#10B981;text-align:right">${r.deliveredOrders}</td></tr>
      <tr style="background:#F8FAFC"><td style="padding:12px 16px;font-size:14px;color:#667085">Cancelled</td><td style="padding:12px 16px;font-size:14px;font-weight:700;color:#EF4444;text-align:right">${r.cancelledOrders}</td></tr>
      <tr><td style="padding:12px 16px;font-size:14px;color:#667085">Conversion Rate</td><td style="padding:12px 16px;font-size:14px;font-weight:700;text-align:right">${r.conversionRate}%</td></tr>
    </table>
    <h2 style="color:#0A1A2F;font-size:16px;margin:28px 0 16px;text-transform:uppercase;letter-spacing:2px">Platform Activity</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#F8FAFC"><td style="padding:12px 16px;font-size:14px;color:#667085">New Customers</td><td style="padding:12px 16px;font-size:14px;font-weight:700;text-align:right">${r.newCustomers}</td></tr>
      <tr><td style="padding:12px 16px;font-size:14px;color:#667085">New Suppliers</td><td style="padding:12px 16px;font-size:14px;font-weight:700;text-align:right">${r.newSuppliers}</td></tr>
      <tr style="background:#F8FAFC"><td style="padding:12px 16px;font-size:14px;color:#667085">Pending KYC Reviews</td><td style="padding:12px 16px;font-size:14px;font-weight:700;color:#F59E0B;text-align:right">${r.pendingKyc}</td></tr>
      <tr><td style="padding:12px 16px;font-size:14px;color:#667085">New Disputes</td><td style="padding:12px 16px;font-size:14px;font-weight:700;color:#EF4444;text-align:right">${r.newDisputes}</td></tr>
    </table>
  </div>
  <div style="background:#0A1A2F;padding:20px;text-align:center">
    <p style="color:#667085;font-size:11px;margin:0">© 2026 Atlantis Marketplace — auto-generated, do not reply</p>
  </div>
</div>
</body></html>`;
    }
}
