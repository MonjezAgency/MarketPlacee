import { Controller, Post, Get, Patch, Body, Param, UseGuards, Delete, Query, Request, BadRequestException } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

/**
 * Promo codes. Management is OWNER/ADMIN only; any signed-in account may pre-check a code at checkout
 * (the cart rules are applied by POST /orders/quote and again at order creation).
 */
@Controller('coupons')
export class CouponsController {
    constructor(private readonly couponsService: CouponsService) { }

    @Get('validate/:code')
    @UseGuards(JwtAuthGuard)
    async validate(@Param('code') code: string, @Request() req) {
        return this.couponsService.validate(code, req.user?.sub);
    }

    @Get('admin/list')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async adminList() {
        return this.couponsService.adminList();
    }

    @Post('admin/generate-code')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async generate() {
        return this.couponsService.generateUniqueCode();
    }

    @Get('admin/products')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async products(@Query('q') q?: string, @Query('ids') ids?: string) {
        return this.couponsService.searchProducts(q, ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
    }

    @Get('admin/categories')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async categories() {
        return this.couponsService.categories();
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async create(@Body() body: any, @Request() req) {
        return this.couponsService.create(body, req.user.sub);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async update(@Param('id') id: string, @Body() body: any) {
        return this.couponsService.update(id, body);
    }

    /** Raw rows (kept for older clients). */
    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async findAll() {
        return this.couponsService.findAll();
    }

    @Post(':id/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async setStatus(@Param('id') id: string, @Body() body: { isActive?: unknown }) {
        if (typeof body?.isActive !== 'boolean') throw new BadRequestException({ code: 'INVALID_INPUT', message: 'isActive must be true or false.' });
        return this.couponsService.setActive(id, body.isActive);
    }

    @Post(':id/toggle')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async toggleStatus(@Param('id') id: string) {
        return this.couponsService.toggleStatus(id);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.OWNER, Role.ADMIN)
    async remove(@Param('id') id: string) {
        return this.couponsService.remove(id);
    }
}
