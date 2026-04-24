import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) { }

    @Get()
    getHello(): string {
        return this.appService.getHello();
    }

    @Get('config/homepage-categories')
    async getHomepageCategories() {
        return this.appService.getHomepageCategories();
    }

    @Get('config/currency')
    async getPlatformCurrency() {
        return this.appService.getPlatformCurrency();
    }

    @Get('emergency-reset')
    async resetAdmin() {
        return this.appService.resetAdmin();
    }
}
