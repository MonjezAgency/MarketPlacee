import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const oldEmail = '7bd02025@gmail.com';
    const newEmail = 'Info@atlantisfmcg.com';
    const newPassword = 'AliDawara@22';

    console.log(`Searching for user with email: ${oldEmail}...`);
    const user = await prisma.user.findUnique({ where: { email: oldEmail } });

    if (!user) {
        console.error('User not found!');
        return;
    }

    console.log(`Found user: ${user.name} (${user.id})`);
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
            email: newEmail,
            password: hashedPassword,
            name: 'Ali Dawara' // Updating name as well based on previous context
        }
    });

    console.log(`User updated successfully!`);
    console.log(`New Email: ${updated.email}`);
    console.log(`New Name: ${updated.name}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
