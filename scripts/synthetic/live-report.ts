import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../src/config/db';
import { buildCohort } from './build';
import { report } from './evaluate';
import { readRegistry, SEED } from './load';

(async () => {
  const registry = readRegistry();
  const cohort = buildCohort(SEED, 100);
  const rows = await prisma.uploadedDocument.findMany({
    where: { id: { in: Object.values(registry).flatMap((e) => e.docs.map((d) => d.id)) } },
    select: { id: true, extractedText: true },
  });
  const textById = new Map(rows.map((r) => [r.id, r.extractedText ?? '']));
  for (const faculty of cohort) {
    const entry = registry[String(faculty.seq)];
    faculty.docs.forEach((doc, index) => {
      // Registry docs are stored in generation order.
      doc.observedText = textById.get(entry.docs[index].id) ?? '';
    });
  }
  const result = report(cohort);
  console.log(result.text);
  const out = process.argv[2];
  if (out) fs.writeFileSync(path.resolve(out), result.text);
  await prisma.$disconnect();
})();
