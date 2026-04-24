import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seeding...');

    // 1. Create/Update Admin User (7bd02025@gmail.com)
    const adminEmail = 'Info@atlantisfmcg.com';
    const adminPassword = 'Admin@123';
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (existingAdmin) {
        await prisma.user.update({
            where: { email: adminEmail },
            data: {
                role: 'ADMIN',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Updated Admin: ${adminEmail}`);
    } else {
        const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
        await prisma.user.create({
            data: {
                email: adminEmail,
                name: 'Ali Dawara',
                password: hashedAdminPassword,
                role: 'ADMIN',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Created Admin: ${adminEmail}`);
    }

    // 2. Create/Update Founder & CEO (Info@atlantisfmcg.com)
    const founderEmail = 'Info@atlantisfmcg.com';
    const founderPassword = process.env.FOUNDER_PASSWORD || 'Atlantis@2025!';
    const existingFounder = await prisma.user.findUnique({ where: { email: founderEmail } });

    if (existingFounder) {
        await prisma.user.update({
            where: { email: founderEmail },
            data: {
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
                name: 'Founder & CEO',
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
