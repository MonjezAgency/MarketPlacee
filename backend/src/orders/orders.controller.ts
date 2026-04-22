import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    Res,
    StreamableFile,
    ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { OrdersService } from './orders.service';
import { ExcelService } from '../admin/excel.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PolicyGuard } from '../auth/policy.guard';
import { Roles } from '../auth/roles.decorator';
import { CheckOwnership } from '../auth/check-ownership.decorator';
import { Role, OrderStatus } from '@prisma/client';
import { OrderDto } from '../common/dtos/order.dto';
import { plainToInstance } from 'class-transformer';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
    constructor(
        private readonly ordersService: OrdersService,
        private readonly excelService: ExcelService,
    ) { }

    @Post()
    @Roles(Role.CUSTOMER, Role.ADMIN, Role.OWNER, Role.SUPPLIER)
    async create(@Body() data: any, @Request() req) {
        const order = await this.ordersService.create(
            req.user.sub,
            data.totalAmount,
            data.items,
            data.shippingCompany,
            data.shippingCost
        );
        return plainToInstance(OrderDto, order);
    }

    @Get('stats')
    @Roles(Role.ADMIN, Role.OWNER, Role.SUPPORT, Role.MODERATOR, Role.DEVELOPER, Role.LOGISTICS)
    async getOrderStats() {
        return this.ordersService.getOrderStats();
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
        if (req.user.role === Role.ADMIN) {
            const orders = await this.ordersService.findAll();
            return orders.find(o => o.id === id);
        }
        throw new ForbiddenException();
    }

    @Patch(':id/status')
    @Roles(Role.SUPPLIER, Role.ADMIN)
    @UseGuards(PolicyGuard)
    @CheckOwnership('ORDER')
    async updateStatus(
        @Param('id') id: string,
        @Body('status') status: OrderStatus,
        @Body('reason') reason: string,
        @Request() req,
    ) {
        const order = await this.ordersService.updateStatus(
            id,
            status,
            req.user.sub,
            reason,
        );
        return plainToInstance(OrderDto, order);
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
}
