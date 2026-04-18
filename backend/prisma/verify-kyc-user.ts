/**
 * One-time script: Set KYC as VERIFIED for a specific email.
 * Usage: npx ts-node prisma/verify-kyc-user.ts
 */
import { PrismaClient, KYCStatus } from '@prisma/client';

const prisma = new PrismaClient();
const TARGET_EMAIL = '7bd02025@gmail.com';

async function main() {
    const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
    if (!user) {
        console.error(`User not found: ${TARGET_EMAIL}`);
        process.exit(1);
    }

    // Find existing KYC document
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
                frontImageUrl: 'admin-verified',
                livenessScore: 1.0,
                status: KYCStatus.VERIFIED,
            },
        });
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { kycStatus: KYCStatus.VERIFIED },
    });

    console.log(`✅ KYC verified for ${TARGET_EMAIL} (userId: ${user.id})`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
