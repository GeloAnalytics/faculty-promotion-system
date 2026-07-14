/**
 * Promotes one account to ADMIN. There is no public/self-service way to become
 * an admin - this script is the only path, run by whoever controls the
 * database directly.
 *
 * Usage:
 *   CONFIRM=yes npx tsx scripts/promote-to-admin.ts someone@example.com
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: CONFIRM=yes npx tsx scripts/promote-to-admin.ts <email>');
    process.exit(1);
  }

  if (process.env.CONFIRM !== 'yes') {
    console.error('Refusing to run: set CONFIRM=yes to confirm you want to grant ADMIN access.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account found for ${email}`);
    process.exit(1);
  }

  if (user.role === 'ADMIN') {
    console.log(`${email} is already an ADMIN.`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  console.log(`${email} (${user.fullName}) is now an ADMIN.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
