/**
 * One-time script: Set KYC as VERIFIED for specific emails.
 * Usage: npx ts-node prisma/verify-kyc-user.ts
 */
import { PrismaClient, KYCStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Add any emails that should be auto-verified
const TARGET_EMAILS = [
    '7bd02025@gmail.com',
    'abdelrhmanhany840@gmail.com',
    'Info@atlantisfmcg.com',
];

async function verifyEmail(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        console.warn(`⚠️  User not found: ${email}`);
        return;
    }

    const existing = await prisma.kYCDocument.findFirst({ where: { userId: user.id } });

    if (existing) {
        await prisma.kYCDocument.update({
            where: { id: existing.id },
            data: { status: KYCStatus.VERIFIED, livenessScore: 1.0 },
        });
    } else {
        await prisma.kYCDocument.create({
            data: {
                userId: user.id,
                documentType: 'PASSPORT',
                frontImageUrl: 'admin-auto-verified',
                livenessScore: 1.0,
                status: KYCStatus.VERIFIED,
            },
        });
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { kycStatus: KYCStatus.VERIFIED },
    });

    console.log(`✅ KYC verified for ${email} (userId: ${user.id})`);
}

async function main() {
    for (const email of TARGET_EMAILS) {
        await verifyEmail(email);
    }
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
