import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seeding...');

    // 1. Create/Update Admin & Founder (Ali Dawara)
    const founderEmail = 'Info@atlantisfmcg.com';
    const founderPassword = 'Admin@123';
    const existingFounder = await prisma.user.findUnique({ where: { email: founderEmail } });

    if (existingFounder) {
        const hashedFounderPassword = await bcrypt.hash(founderPassword, 10);
        await prisma.user.update({
            where: { email: founderEmail },
            data: {
                name: 'Ali Dawara',
                password: hashedFounderPassword,
                role: 'OWNER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Updated Founder: ${founderEmail}`);
    } else {
        const hashedFounderPassword = await bcrypt.hash(founderPassword, 10);
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
