import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'Info@atlantisfmcg.com';
    const password = 'Admin@123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await prisma.user.update({
        where: { email },
        data: { password: hashedPassword }
    });
    console.log('Password reset to Admin@123 successfully');
}
main().finally(() => prisma.$disconnect());
