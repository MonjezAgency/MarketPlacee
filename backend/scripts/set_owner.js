const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
    const email = 'info@atlantisfmcg.com';
    const password = 'AliDawara@22';
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
            name: 'Atlantis Founder',
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
