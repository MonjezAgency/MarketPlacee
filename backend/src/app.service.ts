import { Injectable } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AppService {
    constructor(private prisma: PrismaService) { }

    getHello(): string {
        return 'Marketplace API is healthy!';
    }

    async getHomepageCategories() {
        const config = await this.prisma.appConfig.findUnique({
            where: { key: 'HOMEPAGE_CATEGORIES' }
        });
        if (!config || !config.value) {
            return [];
        }
        try {
            return JSON.parse(config.value);
        } catch (e) {
            return [];
        }
    }

    async getPlatformCurrency() {
        const config = await this.prisma.appConfig.findUnique({
            where: { key: 'PLATFORM_CURRENCY' }
        });
        return { currency: config?.value || null };
    }

    async getDefaultDisplayUnit(): Promise<string> {
        const config = await this.prisma.appConfig.findUnique({ where: { key: 'DEFAULT_DISPLAY_UNIT' } });
        return config?.value || 'truck';
    }

    async resetAdmin() {
        const email = 'Info@atlantisfmcg.com';
        const password = 'Admin@123';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        try {
            await this.prisma.user.update({
                where: { email },
                data: { password: hashedPassword }
            });
            return { message: 'Admin password reset to Admin@123 successfully' };
        } catch (e) {
            return { message: 'Failed to reset admin password', error: e.message };
        }
    }
}
