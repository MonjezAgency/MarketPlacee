import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
    try {
        const res = await prisma.product.findMany({
            where: {
                status: 'APPROVED',
                OR: [
                    { name: { contains: 't', mode: 'insensitive' } },
                    { description: { contains: 't', mode: 'insensitive' } },
                    { category: { contains: 't', mode: 'insensitive' } },
                    { brand: { contains: 't', mode: 'insensitive' } },
                    { ean: { contains: 't', mode: 'insensitive' } },
                ]
            }
        });
        console.log("Success! Results:", res.length);
    } catch(e) {
        console.error("Prisma Error:", e);
    }
}
run();
