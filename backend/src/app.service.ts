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
     * Emergency credential reset for the founding Atlantis OWNER
     * account. Hit `GET /emergency-reset` (no auth) and this guarantees:
     *   - the user row exists (creates it if missing)
     *   - the password is reset to the known fallback
     *   - the account is ACTIVE, email-verified, and role = OWNER
     *
     * Previously this used `prisma.user.update` which silently FAILED
     * with "Record to update not found" the very first time after a
     * fresh DB / Railway redeploy — the operator then sees
     * "Invalid email or password" on the login form with no idea
     * the account simply never got seeded. Using `upsert` makes the
     * endpoint idempotent + self-healing.
     */
    async resetAdmin() {
        const email = 'Info@atlantisfmcg.com';
        const password = 'AliDawara@22';
        const hashedPassword = await bcrypt.hash(password, 10);

        try {
            const user = await this.prisma.user.upsert({
                where: { email },
                update: {
                    password: hashedPassword,
                    status: 'ACTIVE',
                    emailVerified: true,
                    role: 'OWNER',
                },
                create: {
                    email,
                    name: 'Atlantis Founder',
                    companyName: 'Atlantis FMCG',
                    password: hashedPassword,
                    role: 'OWNER',
                    status: 'ACTIVE',
                    emailVerified: true,
                    kycStatus: 'VERIFIED',
                },
                select: { id: true, email: true, role: true, status: true },
            });
            return {
                message: 'Owner credentials restored — try logging in again.',
                email: user.email,
                role: user.role,
                status: user.status,
                login: { email, password },
            };
        } catch (e: any) {
            return { message: 'Failed to reset owner password', error: e?.message };
        }
    }
}
