import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Database Update Script ---');

  // 1. Update Founder Email
  const oldEmail = '7bd02025@gmail.com';
  const newEmail = 'Info@atlantisfmcg.com';

  const founder = await prisma.user.findUnique({
    where: { email: oldEmail }
  });

  if (founder) {
    await prisma.user.update({
      where: { email: oldEmail },
      data: { 
        email: newEmail,
        role: 'OWNER' // Ensure they are OWNER
      }
    });
    console.log(`Updated founder email from ${oldEmail} to ${newEmail}`);
  } else {
    console.log(`Founder with email ${oldEmail} not found.`);
  }

  // 2. Create Monjez Agency Test User
  const monjezEmail = 'monjez@monjez-agency.com';
  const monjezPassword = await bcrypt.hash('Monjez@test-2026', 10);

  const existingMonjez = await prisma.user.findUnique({
    where: { email: monjezEmail }
  });

  if (!existingMonjez) {
    await prisma.user.create({
      data: {
        email: monjezEmail,
        password: monjezPassword,
        name: 'Monjez Agency Team',
        role: 'MODERATOR', // Special role to view/test
        status: 'ACTIVE'
      }
    });
    console.log(`Created Monjez Agency test user: ${monjezEmail}`);
  } else {
    await prisma.user.update({
      where: { email: monjezEmail },
      data: { 
        password: monjezPassword,
        role: 'MODERATOR',
        status: 'ACTIVE'
      }
    });
    console.log(`Updated Monjez Agency test user: ${monjezEmail}`);
  }

  console.log('--- Script Completed ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
