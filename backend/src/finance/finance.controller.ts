import {
    Controller, Get, Post, Delete, Put, Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FinanceService } from './finance.service';
import { ReportsService } from './reports.service';
import { FinancialAuditService } from '../common/financial-audit.service';

@Controller('finance')
@UseGuards(AuthGuard('jwt'))
export class FinanceController {
    constructor(
        private readonly financeService: FinanceService,
        private readonly reportsService: ReportsService,
        private readonly auditService: FinancialAuditService,
    ) {}

    /** Admin: generate on-demand report for any time window */
    @Get('report')
    async getReport(@Query('days') days: string) {
        return this.reportsService.generateReport(parseInt(days || '7', 10));
    }

    /** Admin: manually trigger sending weekly report email */
    @Post('report/send')
    async sendReport(@Query('days') days: string) {
        await this.reportsService.sendWeeklyReport();
        return { message: 'Report sent to all admins' };
    }

    // ─── Credit Terms ──────────────────────────────────────

    @Get('credit-terms')
    getAllCreditTerms() {
        return this.financeService.getAllCreditTerms();
    }

    @Get('credit-terms/:userId')
    getCreditTerm(@Param('userId') userId: string) {
        return this.financeService.getCreditTerm(userId);
    }

    @Post('credit-terms')
    setCreditTerm(@Body() body: {
        userId: string;
        creditLimit: number;
        paymentTermDays: number;
        notes?: string;
    }, @Request() req) {
        return this.financeService.setCreditTerm({ ...body, approvedBy: req.user.sub });
    }

    @Delete('credit-terms/:id')
    deleteCreditTerm(@Param('id') id: string) {
        return this.financeService.deleteCreditTerm(id);
    }

    @Get('credit-check/:userId')
    checkCredit(@Param('userId') userId: string, @Query('amount') amount: string) {
        return this.financeService.checkCreditAvailability(userId, parseFloat(amount) || 0);
    }

    // ─── Tax Exemptions ────────────────────────────────────

    @Get('tax-exemptions')
    getAllTaxExemptions(@Query('userId') userId?: string) {
        return this.financeService.getTaxExemptions(userId);
    }

    @Post('tax-exemptions')
    createTaxExemption(@Body() body: {
        userId: string;
        certificateUrl: string;
        certificateType?: string;
        validFrom?: string;
        validUntil?: string;
    }) {
        return this.financeService.createTaxExemption({
            ...body,
            validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
            validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
        });
    }

    @Post('tax-exemptions/:id/review')
    reviewTaxExemption(
        @Param('id') id: string,
        @Body() body: { status: string; notes?: string },
        @Request() req,
    ) {
        return this.financeService.reviewTaxExemption(id, body.status, req.user.sub, body.notes);
    }

    // ─── Warehouses ────────────────────────────────────────

    @Get('warehouses')
    getAllWarehouses(@Query('supplierId') supplierId?: string) {
        if (supplierId) return this.financeService.getWarehousesBySupplier(supplierId);
        return this.financeService.getAllWarehouses();
    }

    @Post('warehouses')
    createWarehouse(@Body() body: any) {
        return this.financeService.createWarehouse(body);
    }

    @Put('warehouses/:id')
    updateWarehouse(@Param('id') id: string, @Body() body: any) {
        return this.financeService.updateWarehouse(id, body);
    }

    @Delete('warehouses/:id')
    deleteWarehouse(@Param('id') id: string) {
        return this.financeService.deleteWarehouse(id);
    }

    // ─── Financial Audit Trail ────────────────────────────────

    @Get('audit/order/:orderId')
    getAuditByOrder(@Param('orderId') orderId: string) {
        return this.auditService.getByOrder(orderId);
    }

    @Get('audit/user/:userId')
    getAuditByUser(@Param('userId') userId: string, @Query('limit') limit?: string) {
        return this.auditService.getByUser(userId, parseInt(limit || '50', 10));
    }

    @Get('audit/recent')
    getRecentAudit(@Query('limit') limit?: string) {
        return this.auditService.getRecent(parseInt(limit || '100', 10));
    }

    // ─── Revenue Reports ────────────────────────────────────

    @Get('reports/revenue')
    getRevenueReport(@Query('period') period?: 'week' | 'month' | 'year') {
        return this.financeService.getRevenueReport(period || 'month');
    }

    @Get('reports/supplier-earnings')
    getSupplierEarnings(@Request() req) {
        return this.financeService.getSupplierEarnings(req.user.sub);
    }
}
