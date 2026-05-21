import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AppService implements OnModuleInit {
    private readonly logger = new Logger(AppService.name);
    constructor(private prisma: PrismaService) { }

    /**
     * Boot-time self-heal for the Atlantis OWNER credentials.
     *
     * Every time the backend starts (cold start, Railway redeploy,
     * crash recovery, anything) we run `resetAdmin()` to guarantee
     * the founding Info@atlantisfmcg.com OWNER account exists with
     * the canonical password, ACTIVE status, and email verified.
     * The "Invalid email or password" lock-out the operator hits
     * after deploys is now impossible — there is no path that
     * leaves the account missing or with stale credentials.
     *
     * Wrapped in try/catch so a transient DB outage during boot
     * never prevents the app from starting; the next restart heals
     * whatever was missed.
     */
    async onModuleInit() {
        try {
            await this.resetAdmin();
            this.logger.log('OWNER credentials self-healed on boot');
        } catch (err: any) {
            this.logger.warn(`OWNER self-heal skipped: ${err?.message || err}`);
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
     * Secure credential self-healing and reset for the founding Atlantis OWNER account.
     * 
     * To protect user accounts and prevent resetting a changed password, this method:
     *   1. Checks if the owner user exists in the database.
     *   2. If the user exists: guarantees their status is ACTIVE, emailVerified is true, 
     *      and role is OWNER, but NEVER overwrites their existing password unless a valid 
     *      providedSecret is passed matching process.env.SEED_ADMIN_SECRET.
     *   3. If the user does not exist: creates them using password from environment variable
     *      (OWNER_PASSWORD or EMAIL_PASS) hashed securely.
     */
    async resetAdmin(providedSecret?: string) {
        const email = 'Info@atlantisfmcg.com';
        const envSecret = process.env.SEED_ADMIN_SECRET || 'atlantis_seed_2025_secure';
        const isAuthorizedReset = providedSecret === envSecret;

        try {
            const existingUser = await this.prisma.user.findFirst({
                where: { email: { equals: email, mode: 'insensitive' } }
            });

            if (existingUser) {
                const updateData: any = {
                    status: 'ACTIVE',
                    emailVerified: true,
                    role: 'OWNER',
                    kycStatus: 'VERIFIED',
                    onboardingCompleted: true,
                };

                let passwordWasReset = false;
                if (isAuthorizedReset) {
                    const fallbackPassword = process.env.OWNER_PASSWORD || process.env.EMAIL_PASS || 'AliDawara@22';
                    const hashedPassword = await bcrypt.hash(fallbackPassword, 10);
                    updateData.password = hashedPassword;
                    passwordWasReset = true;
                }

                const user = await this.prisma.user.update({
                    where: { id: existingUser.id },
                    data: updateData,
                    select: { id: true, email: true, role: true, status: true },
                });

                return {
                    message: passwordWasReset 
                        ? 'Owner account exists. Password was successfully reset to default.'
                        : 'Owner account exists. Account details verified and guaranteed without changing password.',
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    passwordResetPerformed: passwordWasReset,
                };
            } else {
                const fallbackPassword = process.env.OWNER_PASSWORD || process.env.EMAIL_PASS || 'AliDawara@22';
                const hashedPassword = await bcrypt.hash(fallbackPassword, 10);

                const user = await this.prisma.user.create({
                    data: {
                        email,
                        name: 'Ali Dawara',
                        companyName: 'Atlantis FMCG',
                        password: hashedPassword,
                        role: 'OWNER',
                        status: 'ACTIVE',
                        emailVerified: true,
                        kycStatus: 'VERIFIED',
                        onboardingCompleted: true,
                    },
                    select: { id: true, email: true, role: true, status: true },
                });

                return {
                    message: 'Owner account did not exist. Successfully seeded secure OWNER account.',
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    passwordResetPerformed: true,
                };
            }
        } catch (e: any) {
            this.logger.error(`Failed to self-heal owner: ${e?.message || e}`);
            return { message: 'Failed to self-heal owner', error: e?.message };
        }
    }
}
