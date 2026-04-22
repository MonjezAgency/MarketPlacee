import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AdsService, AdPlacement } from './ads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('ads')
export class AdsController {
    constructor(private readonly adsService: AdsService) { }

    // Public endpoint for fetching ads based on frontend placement
    @Get()
    async getAds(@Query('placement') placement: string) {
        if (!placement) return [];
        return this.adsService.getAdsByPlacement(placement);
    }

    // --- Supplier Endpoints ---

    @Get('supplier/my-ads')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER)
    async getMyAds(@Query() query: any, @Body() body: any, @Param() params: any, @Query('user') user: any, @Body('user') userBody: any, @Param('user') userParam: any, @Body('requestId') requestId: string, @Query('requestId') reqQueryId: string, @Req() req: any) {
        const supplierId = req.user.id;
        return this.adsService.getMyAds(supplierId);
    }

    @Post('supplier/request')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER)
    async requestPlacement(@Body() data: { productId: string; type: any; durationDays: number }, @Req() req: any) {
        const supplierId = req.user.id;
        return this.adsService.requestPlacement(supplierId, data);
    }

    @Delete('supplier/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SUPPLIER)
    async removeMyAd(@Param('id') id: string, @Req() req: any) {
        const supplierId = req.user.id;
        await this.adsService.removeAd(id, supplierId);
        return { message: 'Ad request removed' };
    }

    // --- Admin Endpoints ---

    @Get('admin/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async getAllAdsAdmin() {
        return this.adsService.getAllAdsAdmin();
    }

    @Post('admin/create')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async addAd(@Body() data: { productId: string; placement: any }) {
        return this.adsService.addAd(data.productId, data.placement);
    }

    @Put('admin/:id/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async updateStatus(@Param('id') id: string, @Body('status') status: any) {
        await this.adsService.updateAdStatus(id, status);
        return { message: 'Status updated' };
    }

    @Delete('admin/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    async removeAd(@Param('id') id: string) {
        await this.adsService.removeAd(id);
        return { message: 'Ad removed' };
    }
}
