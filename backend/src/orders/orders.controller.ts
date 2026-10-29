import { StepUpService, stepUpCodesFrom } from '../auth/step-up.service';
import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    Res,
    StreamableFile,
    ForbiddenException,
    UploadedFile,
    UseInterceptors,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { OrdersService } from './orders.service';
import { ExcelService } from '../admin/excel.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PolicyGuard } from '../auth/policy.guard';
import { Roles } from '../auth/roles.decorator';
import { CheckOwnership } from '../auth/check-ownership.decorator';
import { Role, OrderStatus } from '@prisma/client';
import { OrderDto } from '../common/dtos/order.dto';

/** What a supplier gets back after answering: never the buyer total (it includes the Ali FMCG margin). */
const supplierResult = (o: any) => ({ id: o?.id, status: o?.status, reviewStatus: o?.reviewStatus, accepted: o?.accepted, rejected: o?.rejected });
import { plainToInstance } from 'class-transformer';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { PrismaService } from '../common/prisma.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
    constructor(
        private readonly ordersService: OrdersService,
        private readonly excelService: ExcelService,
        private readonly storageService: SupabaseStorageService,
        private readonly prisma: PrismaService,
        private readonly stepUp: StepUpService,
    ) { }

    /**
     * Supplier (or admin) attaches an invoice / receipt image to this
     * order. Stored on Order.supplierInvoiceUrl so the customer order
     * detail and the admin order detail can both surface it. Uses the
     * existing product-image storage path (Supabase) for simplicity —
     * no new bucket needed and it works for both image and PDF
     * uploads since the bucket accepts any mime type.
     */
    @Post(':id/supplier-invoice')
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER, Role.LOGISTICS) // support/moderation read orders; they don't attach invoices
    @UseGuards(PolicyGuard)
    @CheckOwnership('ORDER')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
    async uploadSupplierInvoice(
        @Param('id') id: string,
        @UploadedFile() file: any,
    ) {
        if (!file) throw new BadRequestException('No file uploaded');
        const okMime =
            file.mimetype?.startsWith('image/') ||
            file.mimetype === 'application/pdf';
        if (!okMime) {
            throw new BadRequestException('Invoice must be an image or PDF');
        }
        try {
            const url = await this.storageService.uploadProductImage(
                file.buffer,
                file.originalname || `invoice-${id}.${file.mimetype === 'application/pdf' ? 'pdf' : 'jpg'}`,
                file.mimetype,
            );
            await this.prisma.order.update({
                where: { id },
                data: { supplierInvoiceUrl: url },
            });
            return { url };
        } catch (e: any) {
            throw new BadRequestException(e?.message || 'Invoice upload failed');
        }
    }

    /** Remove the attached invoice from the order. */
    @Delete(':id/supplier-invoice')
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER, Role.LOGISTICS)
    @UseGuards(PolicyGuard)
    @CheckOwnership('ORDER')
    async removeSupplierInvoice(@Param('id') id: string) {
        await this.prisma.order.update({
            where: { id },
            data: { supplierInvoiceUrl: null },
        });
        return { ok: true };
    }

    @Post()
    @Roles(Role.CUSTOMER, Role.ADMIN, Role.OWNER, Role.SUPPLIER)
    async create(@Body() data: any, @Request() req) {
        await this.ordersService.assertProfileComplete(req.user.sub);
        // Money action: accounts with 2FA confirm with authenticator + email code.
        await this.stepUp.require(req.user.sub, stepUpCodesFrom(req), { email: true, action: 'this order' });
        const order = await this.ordersService.create(
            req.user.sub,
            data.totalAmount,
            data.items,
            data.shippingCompany,
            data.shippingCost,
            { idempotencyKey: data.idempotencyKey, couponCode: data.couponCode, shippingAddress: data.shippingAddress },
        );
        return plainToInstance(OrderDto, order);
    }

    /** Server-priced cart (same rules as order creation) — the cart/checkout show these figures. */
    @Post('quote')
    @Roles(Role.CUSTOMER, Role.ADMIN, Role.OWNER, Role.SUPPLIER)
    async quote(@Body() data: any, @Request() req) {
        const q = await this.ordersService.priceCart(req.user.sub, data?.items, data?.couponCode, undefined, { lenient: true, destination: typeof data?.destination === 'string' ? data.destination : null });
        return { subtotal: q.subtotal, discountPercent: q.discountPercent, discount: q.discount, coupon: q.coupon, total: q.total, lines: q.lines.map((l: any) => ({ productId: l.productId, mixedLoadId: l.mixedLoadId ?? null, tier: l.tier, quantity: l.quantity, price: l.price, lineTotal: l.lineTotal, perCase: l.perCase ?? null, casesTotal: l.casesTotal ?? null, unitsTotal: l.unitsTotal ?? null, minUnits: l.minUnits ?? null, minimum: l.minimum ?? null, offerPercent: l.offerPercent ?? null, promotion: l.promotion ?? null, listUnitPrice: l.listUnitPrice ?? null, promotionEnded: l.promotionEnded ?? null, info: l.info ?? null, error: l.error ?? null })), ready: q.lines.every((l: any) => !l.error), fulfillment: q.fulfillment ? FulfillmentService.forBuyer(q.fulfillment) : null };
    }

    @Get('stats')
    @Roles(Role.ADMIN, Role.OWNER, Role.SUPPORT, Role.MODERATOR, Role.DEVELOPER, Role.LOGISTICS)
    async getOrderStats() {
        return this.ordersService.getOrderStats();
    }

    /**
     * Logistics view: every order whose shippingCompany matches the
     * logged-in LOGISTICS user (by companyName or display name). Lets
     * a shipping company log in and see only the orders they should
     * be picking up / dropping off, with tracking + addresses pre-filled.
     */
    @Get('logistics/assigned')
    @Roles(Role.LOGISTICS, Role.ADMIN, Role.OWNER)
    async findLogisticsAssigned(@Request() req) {
        return this.ordersService.findOrdersForLogisticsUser(req.user.sub);
    }

    @Get('admin-analytics')
    @Roles(Role.ADMIN, Role.OWNER)
    async getAdminAnalytics(@Query('timeframe') timeframe?: string) {
        return this.ordersService.getAdminAnalytics(timeframe);
    }

    @Get('supplier/analytics')
    @Roles(Role.SUPPLIER)
    async getSupplierAnalytics(@Request() req, @Query('days') days?: string) {
        return this.ordersService.getSupplierAnalytics(
            req.user.sub,
            parseInt(days || '30', 10),
        );
    }

    @Get('my-orders')
    async findMyOrders(
        @Request() req,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        if (req.user.role === Role.CUSTOMER) {
            return this.ordersService.findByBuyer(
                req.user.sub,
                parseInt(page || '1', 10),
                parseInt(limit || '20', 10),
            );
        } else if (req.user.role === Role.SUPPLIER) {
            return this.ordersService.findBySupplier(req.user.sub);
        }
    }

    @Get('export/excel')
    @Roles(Role.ADMIN)
    async exportOrdersExcel(@Res({ passthrough: true }) res: Response) {
        const orders = await this.ordersService.findAll();
        const buffer = await this.excelService.generateOrdersExcel(orders);
        
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="orders-export-${new Date().toISOString().split('T')[0]}.xlsx"`,
            'Content-Length': buffer.length,
        });

        return new StreamableFile(buffer);
    }

    @Get()
    @Roles(Role.ADMIN)
    async findAll() {
        const orders = await this.ordersService.findAll();
        return plainToInstance(OrderDto, orders);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Request() req) {
        if (req.user.role === Role.CUSTOMER) {
            return this.ordersService.findByIdForBuyer(id, req.user.sub);
        }
        // Admin / Owner / Support / Logistics all get the full admin view
        if ([Role.ADMIN, Role.OWNER, Role.SUPPORT, Role.MODERATOR, Role.LOGISTICS].includes(req.user.role)) {
            return this.ordersService.findByIdForAdmin(id);
        }
        throw new ForbiddenException();
    }

    /** Supplier confirms an order awaiting them (PENDING/PAID → PROCESSING). */
    @Post(':id/supplier-accept')
    @Roles(Role.SUPPLIER)
    async supplierAccept(@Param('id') id: string, @Request() req) {
        return supplierResult(await this.ordersService.supplierAccept(id, req.user.sub));
    }

    /** Supplier declines an order awaiting them, with a reason for the buyer. */
    @Post(':id/supplier-decline')
    @Roles(Role.SUPPLIER)
    async supplierDecline(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
        return supplierResult(await this.ordersService.supplierReject(id, req.user.sub, reason));
    }

    @Patch(':id/status')
    @Roles(Role.SUPPLIER, Role.ADMIN, Role.OWNER, Role.LOGISTICS) // SUPPORT/MODERATOR may read orders, not change them
    @UseGuards(PolicyGuard)
    @CheckOwnership('ORDER')
    async updateStatus(
        @Param('id') id: string,
        @Body('status') status: OrderStatus,
        @Body('reason') reason: string,
        @Request() req,
    ) {
        // Suppliers can ONLY transition an order from PENDING →
        // PROCESSING (Confirm). SHIPPED / DELIVERED / CANCELLED are
        // admin/logistics responsibilities — keep the supplier from
        // bypassing the UI lock by hitting the API directly.
        const callerRole = String(req.user?.role || '').toUpperCase();
        if (callerRole === 'SUPPLIER') {
            if (status !== OrderStatus.PROCESSING) {
                throw new ForbiddenException(
                    'Suppliers can only confirm orders (PENDING → PROCESSING). Shipping and delivery transitions are handled by admin/logistics.',
                );
            }
            return supplierResult(await this.ordersService.supplierAccept(id, req.user.sub));
        }
        // reason is optional, service handles default
        const order = await this.ordersService.updateStatus(
            id,
            status,
            req.user.sub,
            reason,
        );
        return plainToInstance(OrderDto, order);
    }

    /**
     * Admin assigns a shipping company + cost to the order. Used from the
     * /admin/orders/[id] page after the buyer places the order — admin
     * picks a carrier (DB Schenker / LKW Walter / Raben / DHL / etc) and
     * enters the negotiated transport price. Stored on the Order row so
     * the customer's order summary, the invoice, and the supplier's
     * shipping confirmation email all see the same number.
     */
    @Patch(':id/shipping')
    @Roles(Role.ADMIN, Role.LOGISTICS, Role.OWNER)
    async setShipping(
        @Param('id') id: string,
        @Body() body: { shippingCompany?: string | null; shippingCost?: number | null; trackingNumber?: string | null },
        @Request() req,
    ) {
        return this.ordersService.setShipping(id, body.shippingCompany, body.shippingCost, body.trackingNumber, req.user.sub);
    }

    // ─── Confirmation workflow ───────────────────────────────────────

    /** Ali FMCG approval — only after every supplier accepted the current terms. */
    @Post(':id/approve')
    @Roles(Role.ADMIN, Role.OWNER)
    approve(@Param('id') id: string, @Body('note') note: string, @Request() req) {
        return this.ordersService.approveOrder(id, req.user.sub, note);
    }

    @Post(':id/reject')
    @Roles(Role.ADMIN, Role.OWNER)
    reject(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
        return this.ordersService.rejectOrder(id, req.user.sub, reason);
    }

    @Post(':id/request-confirmation')
    @Roles(Role.ADMIN, Role.OWNER)
    requestConfirmation(@Param('id') id: string, @Request() req) {
        return this.ordersService.requestReconfirmation(id, req.user.sub);
    }

    @Post(':id/amend')
    @Roles(Role.ADMIN, Role.OWNER)
    amend(@Param('id') id: string, @Body() body: any, @Request() req) {
        return this.ordersService.amendOrder(id, req.user.sub, body);
    }

    @Get(':id/workflow')
    @Roles(Role.ADMIN, Role.OWNER, Role.SUPPORT, Role.LOGISTICS)
    workflow(@Param('id') id: string) {
        return this.ordersService.workflowForAdmin(id);
    }

    /** The buyer accepts confirmed terms that differ from what they submitted. */
    @Post(':id/accept-terms')
    @Roles(Role.CUSTOMER)
    acceptTerms(@Param('id') id: string, @Body('version') version: number, @Request() req) {
        return this.ordersService.buyerAcceptTerms(id, req.user.sub, version);
    }

    @Post(':id/inspections')
    @Roles(Role.ADMIN, Role.OWNER, Role.LOGISTICS)
    createInspection(@Param('id') id: string, @Body() body: any, @Request() req) {
        return this.ordersService.saveInspection(id, req.user.sub, body);
    }

    @Patch(':id/inspections/:inspectionId')
    @Roles(Role.ADMIN, Role.OWNER, Role.LOGISTICS)
    updateInspection(@Param('id') id: string, @Param('inspectionId') inspectionId: string, @Body() body: any, @Request() req) {
        return this.ordersService.saveInspection(id, req.user.sub, body, inspectionId);
    }

    @Patch('bulk-status')
    @Roles(Role.ADMIN)
    async bulkUpdateStatus(
        @Body('ids') ids: string[],
        @Body('status') status: OrderStatus,
        @Request() req,
    ) {
        const results = await this.ordersService.bulkUpdateStatus(
            ids,
            status,
            req.user.sub,
        );
        return results;
    }

    @Post(':id/confirm-delivery')
    @Roles(Role.CUSTOMER)
    async confirmDelivery(@Param('id') id: string, @Request() req) {
        const order = await this.ordersService.confirmDelivery(id, req.user.sub);
        return plainToInstance(OrderDto, order);
    }

    @Post(':id/notify-delivery-day')
    @Roles(Role.ADMIN, Role.LOGISTICS)
    async notifyDeliveryDay(@Param('id') id: string) {
        return this.ordersService.notifyDeliveryDay(id);
    }

    @Delete(':id/customer-hide')
    @Roles(Role.CUSTOMER)
    async hideOrder(@Param('id') id: string, @Request() req) {
        return this.ordersService.hideOrder(id, req.user.sub);
    }

    @Delete('bulk')
    @Roles(Role.ADMIN)
    async bulkDelete(@Body('ids') ids: string[]) {
        return this.ordersService.bulkDelete(ids);
    }

    @Delete(':id')
    @Roles(Role.ADMIN)
    async delete(@Param('id') id: string) {
        return this.ordersService.delete(id);
    }
}
