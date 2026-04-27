import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('coupons')
export class CouponsController {
    constructor(private readonly couponsService: CouponsService) { }

    @Get('validate/:code')
    @UseGuards(JwtAuthGuard)
    async validate(@Param('code') code: string) {
        return this.couponsService.validate(code);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async create(
        @Body() body: { code: string; discountPercent: number; expirationDate: string; placementId: string }
    ) {
        return this.couponsService.create({
            code: body.code,
            discountPercent: Number(body.discountPercent),
            expirationDate: new Date(body.expirationDate),
            placementId: body.placementId,
        });
    }

    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async findAll() {
        return this.couponsService.findAll();
    }

    @Post(':id/toggle')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async toggleStatus(@Param('id') id: string) {
        return this.couponsService.toggleStatus(id);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async remove(@Param('id') id: string) {
        return this.couponsService.remove(id);
    }
}
