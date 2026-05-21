import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = (process.env.EMAIL_USER || 'Info@atlantisfmcg.com').trim();
    const password = process.env.OWNER_PASSWORD || process.env.EMAIL_PASS || 'AliDawara@22';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await prisma.user.update({
        where: { email },
        data: { password: hashedPassword }
    });
    console.log(`Password for ${email} reset securely using environment parameters.`);
}
main().finally(() => prisma.$disconnect());
