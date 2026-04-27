import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Starting Email Normalization ---');
    const users = await prisma.user.findMany({
        select: { id: true, email: true }
    });

    console.log(`Found ${users.length} users.`);
    let updated = 0;

    for (const user of users) {
        const lowerEmail = user.email.toLowerCase();
        if (user.email !== lowerEmail) {
            console.log(`Updating ${user.email} -> ${lowerEmail}`);
            await prisma.user.update({
                where: { id: user.id },
                data: { email: lowerEmail }
            });
            updated++;
        }
    }

    console.log(`Finished. Updated ${updated} users.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
