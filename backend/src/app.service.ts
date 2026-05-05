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

    async getPublicMarkup(): Promise<{ piece: number; pallet: number; container: number }> {
        const pieceConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_PIECE' } });
        const legacyConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE' } });
        const palletConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_PALLET' } });
        const containerConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_CONTAINER' } });

        const piece = pieceConfig ? parseFloat(pieceConfig.value) : (legacyConfig ? parseFloat(legacyConfig.value) : 1.10);
        const pallet = palletConfig ? parseFloat(palletConfig.value) : 1.05;
        const container = containerConfig ? parseFloat(containerConfig.value) : 1.02;

        return {
            piece: isNaN(piece) ? 1.10 : piece,
            pallet: isNaN(pallet) ? 1.05 : pallet,
            container: isNaN(container) ? 1.02 : container,
        };
    }

    async getDefaultDisplayUnit(): Promise<string> {
        const config = await this.prisma.appConfig.findUnique({ where: { key: 'DEFAULT_DISPLAY_UNIT' } });
        return config?.value || 'truck';
    }

    async resetAdmin() {
        const email = 'Info@atlantisfmcg.com';
        const password = 'AliDawara@22';
        const hashedPassword = await bcrypt.hash(password, 10);

        try {
            await this.prisma.user.update({
                where: { email },
                data: { password: hashedPassword, status: 'ACTIVE', emailVerified: true },
            });
            return { message: 'Admin credentials restored successfully' };
        } catch (e) {
            return { message: 'Failed to reset admin password', error: e.message };
        }
    }
}
