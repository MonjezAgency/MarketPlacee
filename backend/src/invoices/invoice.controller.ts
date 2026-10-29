import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { InvoiceService } from './invoice.service';
import { INVOICE_READ_ROLES, INVOICE_WRITE_ROLES } from './invoice-access';

/**
 * Ali FMCG invoices carry the buyer price, so suppliers never reach them
 * (their own document is the supplier invoice on the order).
 * - Staff (OWNER/ADMIN/SUPPORT) read every invoice; only OWNER/ADMIN
 *   generate or mark paid.
 * - A buyer reads only their own invoices (/my, or /:id they own).
 * The class-level @Roles(OWNER) is the deny-by-default for any route added
 * without its own @Roles.
 */
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class InvoiceController {
    constructor(private readonly invoiceService: InvoiceService) {}

    @Get()
    @Roles(...INVOICE_READ_ROLES)
    getAllInvoices() {
        return this.invoiceService.getAllInvoices();
    }

    @Get('my')
    @Roles(Role.CUSTOMER)
    getMyInvoices(@Request() req) {
        return this.invoiceService.getInvoicesByBuyer(req.user.sub);
    }

    @Get(':id')
    @Roles(...INVOICE_READ_ROLES, Role.CUSTOMER)
    getInvoice(@Param('id') id: string, @Request() req) {
        return this.invoiceService.getInvoiceFor(id, req.user);
    }

    @Post('generate/:orderId')
    @Roles(...INVOICE_WRITE_ROLES)
    generateInvoice(@Param('orderId') orderId: string) {
        return this.invoiceService.createInvoiceForOrder(orderId);
    }

    @Post(':id/pay')
    @Roles(...INVOICE_WRITE_ROLES)
    markAsPaid(@Param('id') id: string, @Request() req) {
        return this.invoiceService.markAsPaid(id, req.user?.sub);
    }
}
