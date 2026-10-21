import {
    Controller, Get, Post, Delete, Put, Body, Param, Query, UseGuards, Request, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FinanceService } from './finance.service';
import { ReportsService } from './reports.service';
import { FinancialAuditService } from '../common/financial-audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { ExcelService } from '../admin/excel.service';
import { InvoiceService } from '../invoices/invoice.service';
import {
    actorOf, parseCreditTermBody, parseReviewBody, parseTaxExemptionBody, parseWarehouseBody,
} from './finance-access';

/**
 * Finance & logistics API. Every route names its roles (RolesGuard lets OWNER through
 * everywhere). Staff management is OWNER/ADMIN. Buyers and suppliers only reach their
 * OWN records, and ownership always comes from the token (req.user.sub), never from a
 * body, param or query id. Rules: finance-access.ts. Tests: __tests__/finance-access.spec.ts.
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
    constructor(
        private readonly financeService: FinanceService,
        private readonly reportsService: ReportsService,
        private readonly auditService: FinancialAuditService,
        private readonly excelService: ExcelService,
        private readonly invoiceService: InvoiceService,
    ) {}

    /** Platform-wide statement (platform fee, supplier amounts): OWNER/ADMIN only. */
    @Get('export/statement')
    @Roles(Role.ADMIN)
    async exportStatement(@Query('days') days: string, @Res() res: Response) {
        const periodDays = parseInt(days || '30', 10);
        const summary = await this.financeService.getRevenueReport(periodDays > 7 ? (periodDays > 30 ? 'year' : 'month') : 'week');
        const transactions = await this.financeService.getFinancialTransactions(periodDays);

        const buffer = await this.excelService.generateFinancialStatementExcel(summary, transactions);

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename=financial-statement-${new Date().toISOString().split('T')[0]}.xlsx`,
            'Content-Length': buffer.length,
        });

        res.end(buffer);
    }

    /** Admin: generate on-demand report for any time window */
    @Get('report')
    @Roles(Role.ADMIN)
    async getReport(@Query('days') days: string) {
        return this.reportsService.generateReport(parseInt(days || '7', 10));
    }

    /** Admin: manually trigger sending weekly report email */
    @Post('report/send')
    @Roles(Role.ADMIN)
    async sendReport(@Query('days') days: string) {
        await this.reportsService.sendWeeklyReport();
        return { message: 'Report sent to all admins' };
    }

    // ─── Credit Terms ──────────────────────────────────────

    @Get('credit-terms')
    @Roles(Role.ADMIN)
    getAllCreditTerms() {
        return this.financeService.getAllCreditTerms();
    }

    /** A buyer's own credit term (declared before :userId so "me" isn't read as an id). */
    @Get('credit-terms/me')
    @Roles(Role.CUSTOMER)
    getMyCreditTerm(@Request() req) {
        return this.financeService.getOwnCreditTerm(actorOf(req).id);
    }

    @Get('credit-terms/:userId')
    @Roles(Role.ADMIN)
    getCreditTerm(@Param('userId') userId: string) {
        return this.financeService.getCreditTerm(userId);
    }

    @Post('credit-terms')
    @Roles(Role.ADMIN)
    setCreditTerm(@Body() body: unknown, @Request() req) {
        return this.financeService.setCreditTerm({ ...parseCreditTermBody(body), approvedBy: actorOf(req).id });
    }

    @Delete('credit-terms/:id')
    @Roles(Role.ADMIN)
    deleteCreditTerm(@Param('id') id: string) {
        return this.financeService.deleteCreditTerm(id);
    }

    @Get('credit-check/:userId')
    @Roles(Role.ADMIN)
    checkCredit(@Param('userId') userId: string, @Query('amount') amount: string) {
        return this.financeService.checkCreditAvailability(userId, parseFloat(amount) || 0);
    }

    // ─── Tax Exemptions ────────────────────────────────────

    @Get('tax-exemptions')
    @Roles(Role.ADMIN)
    getAllTaxExemptions(@Query('userId') userId?: string) {
        return this.financeService.getTaxExemptions(userId);
    }

    /** A buyer's own exemption requests. */
    @Get('tax-exemptions/me')
    @Roles(Role.CUSTOMER)
    getMyTaxExemptions(@Request() req) {
        return this.financeService.getOwnTaxExemptions(actorOf(req).id);
    }

    /**
     * Staff record an exemption for a named account; a buyer submits one for themselves
     * (any userId in the body is ignored). Always created PENDING — only review approves.
     */
    @Post('tax-exemptions')
    @Roles(Role.ADMIN, Role.CUSTOMER)
    createTaxExemption(@Body() body: unknown, @Request() req) {
        return this.financeService.createTaxExemption(parseTaxExemptionBody(body, actorOf(req)));
    }

    @Post('tax-exemptions/:id/review')
    @Roles(Role.ADMIN)
    reviewTaxExemption(@Param('id') id: string, @Body() body: unknown, @Request() req) {
        const { status, notes } = parseReviewBody(body);
        return this.financeService.reviewTaxExemption(id, status, actorOf(req).id, notes);
    }

    // ─── Supplier dispatch locations (Warehouse model) ─────

    /** Staff (incl. LOGISTICS, read-only) see all or one supplier's; a supplier sees only their own. */
    @Get('warehouses')
    @Roles(Role.ADMIN, Role.LOGISTICS, Role.SUPPLIER)
    getAllWarehouses(@Query('supplierId') supplierId: string | undefined, @Request() req) {
        return this.financeService.listWarehousesFor(actorOf(req), supplierId);
    }

    @Post('warehouses')
    @Roles(Role.ADMIN, Role.SUPPLIER)
    createWarehouse(@Body() body: unknown, @Request() req) {
        const actor = actorOf(req);
        return this.financeService.createWarehouseFor(actor, parseWarehouseBody(body, actor, 'create'));
    }

    @Put('warehouses/:id')
    @Roles(Role.ADMIN, Role.SUPPLIER)
    updateWarehouse(@Param('id') id: string, @Body() body: unknown, @Request() req) {
        const actor = actorOf(req);
        return this.financeService.updateWarehouseFor(actor, id, parseWarehouseBody(body, actor, 'update'));
    }

    @Delete('warehouses/:id')
    @Roles(Role.ADMIN, Role.SUPPLIER)
    deleteWarehouse(@Param('id') id: string, @Request() req) {
        return this.financeService.deleteWarehouseFor(actorOf(req), id);
    }

    // ─── Financial Audit Trail ────────────────────────────────

    @Get('audit/order/:orderId')
    @Roles(Role.ADMIN)
    getAuditByOrder(@Param('orderId') orderId: string) {
        return this.auditService.getByOrder(orderId);
    }

    @Get('audit/user/:userId')
    @Roles(Role.ADMIN)
    getAuditByUser(@Param('userId') userId: string, @Query('limit') limit?: string) {
        return this.auditService.getByUser(userId, parseInt(limit || '50', 10));
    }

    @Get('audit/recent')
    @Roles(Role.ADMIN)
    getRecentAudit(@Query('limit') limit?: string) {
        return this.auditService.getRecent(parseInt(limit || '100', 10));
    }

    // ─── Revenue Reports ────────────────────────────────────

    @Get('reports/revenue')
    @Roles(Role.ADMIN)
    getRevenueReport(@Query('period') period?: 'week' | 'month' | 'year') {
        return this.financeService.getRevenueReport(period || 'month');
    }

    /**
     * OWNER/ADMIN only. Its "gross" is OrderItem.price (the buyer price) and it derives the
     * platform fee, so a supplier must never call it (suppliers never see the buyer price or
     * the Atlantis margin). No page uses it; the supplier's own figures are in /supplier.
     */
    @Get('reports/supplier-earnings')
    @Roles(Role.ADMIN)
    getSupplierEarnings(@Request() req) {
        return this.financeService.getSupplierEarnings(actorOf(req).id);
    }

    @Post('manual-invoice')
    @Roles(Role.ADMIN)
    createManualInvoice(@Body() body: { customerId: string; amount: number; notes?: string }) {
        return this.invoiceService.createManualInvoice(body);
    }
}
