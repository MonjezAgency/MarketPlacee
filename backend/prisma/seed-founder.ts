/**
 * Seed: Create/update Info@atlantisfmcg.com as Founder & CEO (OWNER role)
 *
 * Run: npx ts-node prisma/seed-founder.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Passwords come only from the environment; nothing is hard-coded. */
function requiredPassword(name: string): string {
    const v = process.env[name];
    if (!v || v.length < 12) throw new Error(`Set ${name} (at least 12 characters) to create this account.`);
    return v;
}

async function main() {
    const email = 'Info@atlantisfmcg.com';
    const adminEmail = 'Info@atlantisfmcg.com';

    // Ensure founder/CEO is OWNER with KYC bypassed
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        await prisma.user.update({
            where: { email },
            data: {
                role: 'OWNER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
                name: existing.name || 'Founder & CEO',
            },
        });
        console.log(`✅ Updated ${email} → OWNER + KYC VERIFIED`);
    } else {
        const hashedPassword = await bcrypt.hash(requiredPassword('FOUNDER_PASSWORD'), 10);
        await prisma.user.create({
            data: {
                email,
                name: 'Founder & CEO',
                password: hashedPassword,
                role: 'OWNER',
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Created ${email} as OWNER`);
    }

    // Ensure admin email (7bd02025@gmail.com) has KYC verified + ADMIN role
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (adminUser) {
        await prisma.user.update({
            where: { email: adminEmail },
            data: {
                status: 'ACTIVE',
                kycStatus: 'VERIFIED',
                emailVerified: true,
                onboardingCompleted: true,
            },
        });
        console.log(`✅ Updated ${adminEmail} → KYC VERIFIED`);
    } else {
        console.log(`⚠️  ${adminEmail} not found in DB — register first, then run this seed again.`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
