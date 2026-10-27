import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * First-run bootstrap only. It no longer runs on every deploy (start:prod doesn't call it).
 *
 * Run it by hand, once, on an empty database:
 *   ALLOW_SEED=1 OWNER_PASSWORD=… [TECH_PASSWORD=…] npx prisma db seed
 *
 * It only CREATES accounts that don't exist yet. It never changes the role, status,
 * password or anything else of an existing account, and never deletes one: a block,
 * demotion or password change made in the app stays as it is. Passwords come only from
 * the environment; nothing is hard-coded.
 */
const prisma = new PrismaClient();

const FOUNDER_EMAIL = 'Info@atlantisfmcg.com';
const TECH_EMAIL = 'Monjez@monjez-agency.com';

async function createIfMissing(email: string, password: string | undefined, data: Record<string, unknown>) {
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (existing) {
        console.log(`• ${email} already exists, left unchanged`);
        return;
    }
    if (!password || password.length < 12) {
        console.log(`• ${email} not created: set a password of at least 12 characters in the environment`);
        return;
    }
    await prisma.user.create({
        data: {
            email,
            password: await bcrypt.hash(password, 10),
            status: 'ACTIVE',
            emailVerified: true,
            onboardingCompleted: true,
            ...data,
        } as any,
    });
    console.log(`✅ Created ${email}`);
}

async function main() {
    if (process.env.ALLOW_SEED !== '1') {
        console.log('Seed skipped (set ALLOW_SEED=1 to run the first-run bootstrap).');
        return;
    }
    await createIfMissing(FOUNDER_EMAIL, process.env.OWNER_PASSWORD, { name: 'Ali Dawara', role: 'OWNER', kycStatus: 'VERIFIED' });
    await createIfMissing(TECH_EMAIL, process.env.TECH_PASSWORD, { name: 'Monjez Agency', companyName: 'Monjez Agency', role: 'DEVELOPER', kycStatus: 'VERIFIED' });
}

main()
    .catch((e) => {
        console.error('Seed failed:', e?.message || e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
