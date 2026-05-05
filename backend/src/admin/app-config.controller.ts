import { Controller, Get, Post, Put, Body, Param, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin/config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AppConfigController {
    constructor(private readonly appConfigService: AppConfigService) { }

    @Get('markup')
    async getMarkup() {
        const markupData = await this.appConfigService.getMarkupPercentage();
        return { markup: markupData }; // { markup: { piece, pallet, container } }
    }

    @Post('markup')
    async setMarkup(@Body() body: { piece: number; pallet: number; container: number; platformFee?: number; shippingMarkup?: number }) {
        await this.appConfigService.setMarkupPercentage(body);
        return { message: 'Markup percentages updated', data: body };
    }

    @Get('all-products')
    async getAllProducts() {
        return this.appConfigService.getAllProducts();
    }

    @Get('pending-products')
    async getPendingProducts() {
        return this.appConfigService.getPendingProducts();
    }

    @Put('products/:id/approve')
    async approveProduct(@Param('id') id: string) {
        return this.appConfigService.approveProduct(id);
    }

    @Put('products/:id/reject')
    async rejectProduct(@Param('id') id: string, @Body('reason') reason: string) {
        return this.appConfigService.rejectProduct(id, reason);
    }

    @Get('homepage-categories')
    async getHomepageCategories() {
        return this.appConfigService.getHomepageCategories?.() ?? [];
    }

    @Post('homepage-categories')
    @UsePipes(new ValidationPipe({ transform: false, whitelist: false, forbidNonWhitelisted: false }))
    async setHomepageCategories(@Body() data: any) {
        const categories = data.categories || data;
        await this.appConfigService.setHomepageCategories(categories);
        return { message: 'Homepage categories updated successfully' };
    }

    @Get('allowed-brands')
    async getAllowedBrands() {
        return this.appConfigService.getAllowedBrands();
    }

    @Post('allowed-brands')
    async setAllowedBrands(@Body('brands') brands: string[]) {
        if (!Array.isArray(brands)) {
            return { error: 'Brands must be an array of strings' };
        }
        await this.appConfigService.setAllowedBrands(brands);
        return { message: 'Allowed brands updated successfully', brands };
    }

    @Post('currency')
    async setPlatformCurrency(@Body('currency') currency: string | null) {
        await this.appConfigService.setPlatformCurrency(currency);
        return { message: 'Platform currency updated successfully', currency };
    }
    @Get('default-unit')
    async getDefaultUnit() {
        return { unit: await this.appConfigService.getDefaultDisplayUnit() };
    }

    @Post('default-unit')
    async setDefaultUnit(@Body('unit') unit: string) {
        await this.appConfigService.setDefaultDisplayUnit(unit);
        return { message: 'Default display unit updated', unit };
    }

    @Get('placements')
    async getAdPlacements() {
        return this.appConfigService.getAdPlacements();
    }

    @Post('placements')
    async setAdPlacements(@Body() data: any) {
        await this.appConfigService.setAdPlacements(data);
        return { message: 'Ad placements updated successfully' };
    }
}
