/**
 * Seed script: Create/update Monjez tech team account
 *
 * Run: npx ts-node prisma/seed-tech-team.ts
 *
 * Creates the Monjez agency developer account with:
 * - Role: DEVELOPER
 * - KYC: VERIFIED (so the KYC gate in admin layout is bypassed)
 * - Status: ACTIVE
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'Monjez@monjez-agency.com';
    const tempPassword = 'Monjez@2025!'; // Change after first login

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
        // Update existing user to ensure correct role + KYC
        await prisma.user.update({
            where: { email },
            data: {
                role: 'DEVELOPER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Updated existing user: ${email} → DEVELOPER + KYC VERIFIED`);
    } else {
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        const user = await prisma.user.create({
            data: {
                email,
                name: 'Monjez Agency',
                companyName: 'Monjez Agency',
                password: hashedPassword,
                role: 'DEVELOPER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Created tech team user: ${user.email}`);
        console.log(`   Temp password: ${tempPassword}`);
        console.log(`   ⚠️  Change this password immediately after first login!`);
    }
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
