import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seeding...');

    // 1. Create/Update Admin & Founder (Ali Dawara)
    const founderEmail = 'Info@atlantisfmcg.com';
    const existingFounder = await prisma.user.findFirst({
        where: { email: { equals: founderEmail, mode: 'insensitive' } }
    });

    if (existingFounder) {
        // Guarantee status and roles, but NEVER overwrite their existing password hash!
        await prisma.user.update({
            where: { id: existingFounder.id },
            data: {
                name: 'Ali Dawara',
                role: 'OWNER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Updated Founder (Guaranteed roles & status, preserved existing password): ${founderEmail}`);
    } else {
        const fallbackPassword = process.env.OWNER_PASSWORD || process.env.EMAIL_PASS || 'AliDawara@22';
        const hashedFounderPassword = await bcrypt.hash(fallbackPassword, 10);
        await prisma.user.create({
            data: {
                email: founderEmail,
                name: 'Ali Dawara',
                password: hashedFounderPassword,
                role: 'OWNER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Created Founder: ${founderEmail}`);
    }

    // 2. Remove Legacy Admin if exists — soft-handled to survive FK constraints
    // (user might own Products with Restrict relation; deleting them would
    // wipe real data, so we just deactivate the legacy account instead).
    const oldAdminEmail = '7bd02025@gmail.com';
    const oldAdmin = await prisma.user.findUnique({ where: { email: oldAdminEmail } });
    if (oldAdmin) {
        try {
            await prisma.user.delete({ where: { email: oldAdminEmail } });
            console.log(`🗑️ Removed Legacy Admin: ${oldAdminEmail}`);
        } catch (err: any) {
            // FK constraint — fall back to soft-deactivation
            await prisma.user.update({
                where: { email: oldAdminEmail },
                data: { status: 'BLOCKED', emailVerified: false },
            });
            console.log(`⚠️ Legacy Admin has dependent records — soft-deactivated instead: ${oldAdminEmail}`);
        }
    }

    // 3. Create/Update Tech Team User (Monjez@monjez-agency.com)
    const techEmail = 'Monjez@monjez-agency.com';
    const techPassword = 'Monjez@2025!';
    const existingTech = await prisma.user.findUnique({ where: { email: techEmail } });

    if (existingTech) {
        await prisma.user.update({
            where: { email: techEmail },
            data: {
                role: 'DEVELOPER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Updated Tech Team: ${techEmail}`);
    } else {
        const hashedTechPassword = await bcrypt.hash(techPassword, 10);
        await prisma.user.create({
            data: {
                email: techEmail,
                name: 'Monjez Agency',
                companyName: 'Monjez Agency',
                password: hashedTechPassword,
                role: 'DEVELOPER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Created Tech Team: ${techEmail}`);
    }

    console.log('✅ Database seeding completed.');
}

main()
    .catch((e) => {
        // Don't fail the deploy on seed errors — log and continue so the
        // app can still boot. Seed is best-effort post-deploy housekeeping.
        console.error('⚠️ Seed encountered an error (non-fatal, continuing):', e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
