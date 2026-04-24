import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const config = await prisma.appConfig.findUnique({ where: { key: 'HOMEPAGE_CATEGORIES' } });
  console.log(config?.value);
}
main().finally(() => prisma.$disconnect());
