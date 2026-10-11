import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AppService implements OnModuleInit {
    private readonly logger = new Logger(AppService.name);
    constructor(private prisma: PrismaService) { }

    /**
     * Boot-time check for the founding Atlantis OWNER account.
     *
     * Keeps the account's role / status / verification flags intact but
     * NEVER changes its password. (It used to force-reset the password to
     * an env value or a hardcoded default on every start, which meant the
     * owner password was effectively public.) If the row is missing it is
     * only created when OWNER_PASSWORD is configured — never from a default.
     */
    async onModuleInit() {
        try {
            const result = await this.resetAdmin();
            this.logger.log(`OWNER account check on boot — ${result?.message || 'ok'}`);
        } catch (err: any) {
            this.logger.warn(`OWNER account check skipped: ${err?.message || err}`);
        }
    }

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

    async getPublicMarkup(): Promise<{ piece: number; pallet: number; container: number; mix: number }> {
        const pieceConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_PIECE' } });
        const legacyConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE' } });
        const palletConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_PALLET' } });
        const containerConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_CONTAINER' } });
        const mixConfig = await this.prisma.appConfig.findUnique({ where: { key: 'MARKUP_PERCENTAGE_MIX' } });

        const piece = pieceConfig ? parseFloat(pieceConfig.value) : (legacyConfig ? parseFloat(legacyConfig.value) : 1.10);
        const pallet = palletConfig ? parseFloat(palletConfig.value) : 1.05;
        const container = containerConfig ? parseFloat(containerConfig.value) : 1.02;
        const mix = mixConfig ? parseFloat(mixConfig.value) : 1.15;

        return {
            piece: isNaN(piece) ? 1.10 : piece,
            pallet: isNaN(pallet) ? 1.05 : pallet,
            container: isNaN(container) ? 1.02 : container,
            mix: isNaN(mix) ? 1.15 : mix,
        };
    }

    async getDefaultDisplayUnit(): Promise<string> {
        const config = await this.prisma.appConfig.findUnique({ where: { key: 'DEFAULT_DISPLAY_UNIT' } });
        return config?.value || 'truck';
    }

    /**
     * Ensure the founding OWNER account exists with its owner role and an
     * active, verified status. Passwords are never reset here; password
     * changes go through the normal authenticated / forgot-password flows.
     */
    async resetAdmin() {
        const email = 'Info@atlantisfmcg.com';
        try {
            const existingUser = await this.prisma.user.findFirst({
                where: { email: { equals: email, mode: 'insensitive' } },
            });

            if (existingUser) {
                const user = await this.prisma.user.update({
                    where: { id: existingUser.id },
                    data: { status: 'ACTIVE', emailVerified: true, role: 'OWNER', kycStatus: 'VERIFIED', onboardingCompleted: true },
                    select: { id: true, email: true, role: true, status: true },
                });
                return { message: 'Owner account verified (password unchanged).', email: user.email, role: user.role, status: user.status };
            }

            const initial = process.env.OWNER_PASSWORD;
            if (!initial || initial.length < 12) {
                this.logger.warn('OWNER account missing and OWNER_PASSWORD (12+ chars) is not set — not creating it.');
                return { message: 'Owner account missing; set OWNER_PASSWORD to provision it.' };
            }
            const user = await this.prisma.user.create({
                data: {
                    email, name: 'Ali Dawara', companyName: 'Atlantis FMCG',
                    password: await bcrypt.hash(initial, 10),
                    role: 'OWNER', status: 'ACTIVE', emailVerified: true, kycStatus: 'VERIFIED', onboardingCompleted: true,
                },
                select: { id: true, email: true, role: true, status: true },
            });
            return { message: 'Owner account provisioned from OWNER_PASSWORD.', email: user.email, role: user.role, status: user.status };
        } catch (e: any) {
            this.logger.error(`Owner account check failed: ${e?.message || e}`);
            return { message: 'Owner account check failed' };
        }
    }
}
