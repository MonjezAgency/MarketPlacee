import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seeding...');

    // 1. Create/Update Admin & Founder (Ali Dawara)
    const founderEmail = 'Info@atlantisfmcg.com';
    const founderPassword = 'AliDawara@22';
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
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
