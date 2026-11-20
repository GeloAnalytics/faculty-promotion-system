/**
 * Removes synthetic faculty recorded in registry.json: their R2 objects, audit
 * logs, documents, profile and account. Anything not listed in the registry is
 * never touched, and each account is checked against the generated cohort first.
 *
 *   npx tsx --env-file=.env scripts/synthetic/unload.ts --seq=1,2 | --all [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../src/config/db';
import { deleteStoredFile } from '../../src/services/storage.service';
import { buildCohort } from './build';
import { readRegistry, SEED } from './load';

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const registry = readRegistry();
  const seqArg = args.find((a) => a.startsWith('--seq='));
  const wanted = args.includes('--all') ? null : new Set((seqArg?.slice(6) ?? '').split(',').filter(Boolean).map(Number));
  const cohort = new Map(buildCohort(SEED, 100).map((f) => [f.seq, f]));

  for (const entry of Object.values(registry)) {
    if (wanted && !wanted.has(entry.seq)) continue;
    const faculty = cohort.get(entry.seq)!;
    const user = await prisma.user.findUnique({ where: { id: entry.userId } });
    if (user && user.email !== faculty.email) {
      console.log(`SKIP seq ${entry.seq}: account ${entry.userId} no longer matches the generated record`);
      continue;
    }
    const docIds = entry.docs.map((d) => d.id);
    const strangers = user
      ? await prisma.uploadedDocument.count({ where: { ownerUserId: user.id, id: { notIn: docIds } } })
      : 0;
    if (strangers) {
      console.log(`SKIP seq ${entry.seq}: account owns ${strangers} document(s) that are not in the registry`);
      continue;
    }
    console.log(`${dry ? 'would remove' : 'removing'} seq ${entry.seq} ${faculty.fullName}: ${docIds.length} docs, ${entry.docs.filter((d) => d.storagePath).length} stored files`);
    if (dry) continue;

    const stored = await prisma.uploadedDocument.findMany({ where: { id: { in: docIds } }, select: { extractionMetadata: true } });
    for (const row of stored) {
      const storage = (row.extractionMetadata as any)?.storage;
      if (storage?.path) await deleteStoredFile(storage).catch((e) => console.log('  storage delete failed:', storage.path, String(e.message).slice(0, 80)));
    }
    await prisma.auditLog.deleteMany({ where: { targetId: { in: [...docIds, entry.profileId, entry.userId] } } });
    await prisma.uploadedDocument.deleteMany({ where: { id: { in: docIds } } });
    await prisma.facultyProfile.deleteMany({ where: { id: entry.profileId } });
    await prisma.user.deleteMany({ where: { id: entry.userId } });
    delete registry[String(entry.seq)];
    fs.writeFileSync(path.join(__dirname, 'registry.json'), JSON.stringify(registry, null, 2));
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
