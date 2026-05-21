const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
    const email = (process.env.EMAIL_USER || 'info@atlantisfmcg.com').trim();
    const password = process.env.OWNER_PASSWORD || process.env.EMAIL_PASS || 'AliDawara@22';
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            role: 'OWNER',
            status: 'ACTIVE',
            emailVerified: true
        },
        create: {
            name: 'Ali Dawara',
            email,
            password: hashedPassword,
            role: 'OWNER',
            status: 'ACTIVE',
            emailVerified: true
        }
    });

    console.log("Successfully set OWNER:", user.email);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
