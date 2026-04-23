import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { FinancialAuditService } from '../common/financial-audit.service';

@Injectable()
export class InvoiceService {
    constructor(
        private prisma: PrismaService,
        private audit: FinancialAuditService,
    ) {}

    /**
     * Generate invoice number: INV-YYYYMMDD-XXXX
     */
    private async generateInvoiceNumber(): Promise<string> {
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const count = await this.prisma.invoice.count() + 1;
        return `INV-${dateStr}-${count.toString().padStart(4, '0')}`;
    }

    /**
     * Auto-create invoice when order is confirmed
     */
    async createInvoiceForOrder(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true, items: { include: { product: true } } },
        });
        if (!order) throw new NotFoundException('Order not found');

        // Check if invoice already exists
        const existing = await this.prisma.invoice.findFirst({ where: { orderId } });
        if (existing) return existing;

        // Check for customer credit terms to set due date
        const creditTerm = await this.prisma.creditTerm.findUnique({
            where: { userId: order.customerId },
        });

        const dueDate = creditTerm
            ? new Date(Date.now() + creditTerm.paymentTermDays * 24 * 60 * 60 * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // default Net 30

        // Check for tax exemption
        const exemption = await this.prisma.taxExemption.findFirst({
            where: { userId: order.customerId, status: 'APPROVED' },
        });

        const subtotal = order.totalAmount;
        const taxRate = exemption ? 0 : 0.05; // 5% default tax, 0 if exempt
        const tax = subtotal * taxRate;
        const totalAmount = subtotal + tax;

        const invoiceNumber = await this.generateInvoiceNumber();

        const invoice = await this.prisma.invoice.create({
            data: {
                invoiceNumber,
                orderId,
                customerId: order.customerId,
                amount: subtotal,
                tax,
                totalAmount,
                dueDate,
                status: 'ISSUED',
            },
        });

        await this.audit.log({
            eventType: 'INVOICE_GENERATED',
            orderId,
            userId:   order.customerId,
            amount:   totalAmount,
            metadata: { invoiceNumber, invoiceId: invoice.id, tax, taxExempt: taxRate === 0 },
        });

        return invoice;
    }

    async createManualInvoice(data: { customerId: string; amount: number; notes?: string }) {
        const { customerId, amount, notes } = data;

        // Check for tax exemption
        const exemption = await this.prisma.taxExemption.findFirst({
            where: { userId: customerId, status: 'APPROVED' },
        });

        const taxRate = exemption ? 0 : 0.05;
        const tax = amount * taxRate;
        const totalAmount = amount + tax;
        const invoiceNumber = await this.generateInvoiceNumber();

        const invoice = await this.prisma.invoice.create({
            data: {
                invoiceNumber,
                customerId,
                amount,
                tax,
                totalAmount,
                notes,
                status: 'ISSUED',
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });

        await this.audit.log({
            eventType: 'INVOICE_GENERATED',
            userId: customerId,
            amount: totalAmount,
            metadata: { invoiceNumber, invoiceId: invoice.id, manual: true },
        });

        return invoice;
    }

    async getInvoicesByBuyer(customerId: string) {
        return this.prisma.invoice.findMany({
            where: { customerId },
            include: { order: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getAllInvoices() {
        return this.prisma.invoice.findMany({
            include: { 
                customer: { select: { id: true, name: true, email: true, companyName: true } },
                order: { include: { customer: { select: { id: true, name: true, email: true, companyName: true } } } } 
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async markAsPaid(id: string) {
        const invoice = await this.prisma.invoice.findUnique({ where: { id } });
        if (!invoice) throw new NotFoundException('Invoice not found');

        // Update credit term used amount if applicable
        const creditTerm = await this.prisma.creditTerm.findUnique({
            where: { userId: invoice.customerId },
        });
        if (creditTerm) {
            await this.prisma.creditTerm.update({
                where: { id: creditTerm.id },
                data: { usedCredit: Math.max(0, creditTerm.usedCredit - invoice.totalAmount) },
            });
        }

        return this.prisma.invoice.update({
            where: { id },
            data: { status: 'PAID', paidAt: new Date() },
        });
    }

    async getInvoice(id: string) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id },
            include: {
                order: {
                    include: {
                        customer: { select: { id: true, name: true, email: true, companyName: true, country: true } },
                        items: { include: { product: { select: { name: true, unit: true } } } },
                    },
                },
            },
        });
        if (!invoice) throw new NotFoundException('Invoice not found');
        return invoice;
    }
}
