/**
 * Full database reset: truncates every table (users, faculty profiles, uploaded
 * documents, predictions, training examples, audit logs). Irreversible.
 *
 * Does NOT touch files already sitting in Supabase Storage - clear those
 * separately in the Supabase dashboard if you want a fully clean slate.
 *
 * Usage:
 *   CONFIRM_RESET=yes npx tsx scripts/reset-database.ts
 *
 * Point DATABASE_URL at whichever database you actually want to wipe
 * (check your .env / Render env vars first) before running this.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_RESET !== 'yes') {
    console.error('Refusing to run: set CONFIRM_RESET=yes to confirm you want to wipe this database.');
    process.exit(1);
  }

  console.log(`Wiping database at ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs,
      predictions,
      uploaded_documents,
      training_examples,
      faculty_profiles,
      users
    RESTART IDENTITY CASCADE;
  `);

  console.log('Done. All tables truncated.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
