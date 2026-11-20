import fs from 'node:fs';
import path from 'node:path';
import { buildCohort } from './build';
import { readRegistry, SEED } from './load';

const registry = readRegistry();
const cohort = buildCohort(SEED, 100);
const rows = cohort.map((f) => {
  const e = registry[String(f.seq)];
  return `| ${f.seq} | ${f.fullName} | ${f.employeeId} | ${f.email} | ${f.rank} | ${f.department} | ${f.archetype} | ${f.delivery === 'pdf' ? 'PDF files' : 'text only'} | ${e.docs.length} | \`${e.userId}\` | \`${e.profileId}\` |`;
});
const md = `# Synthetic faculty registry

The ${cohort.length} faculty below are **synthetic**. They were generated on ${new Date().toISOString().slice(0, 10)} to enlarge the dataset and test the scoring mechanism. They carry no marker inside the database, so this list is the only way to tell them apart from real faculty.

- Generator seed: \`${SEED}\` (the cohort is reproducible with \`scripts/synthetic/build.ts\`)
- Machine-readable copy with every document ID and storage key: \`scripts/synthetic/registry.json\`
- Totals: ${cohort.length} accounts and profiles, ${Object.values(registry).reduce((n, e) => n + e.docs.length, 0)} documents (${Object.values(registry).reduce((n, e) => n + e.docs.filter((d) => d.storagePath).length, 0)} stored as PDF files in the R2 \`documents\` bucket, the rest text-only)
- Accounts have random, unrecoverable passwords and cannot be signed in to.
- Ground truth for each faculty is regenerated from the seed; it is not stored in the database.

## Removing them

\`\`\`
npx tsx --env-file=.env scripts/synthetic/unload.ts --all --dry   # preview
npx tsx --env-file=.env scripts/synthetic/unload.ts --all         # delete accounts, profiles, documents, audit logs and R2 files
\`\`\`

Only records listed in the registry are touched. Use \`--seq=1,2,3\` to remove specific faculty.

## Using them in research

If these records are ever included in accuracy figures or ML training data, they must be disclosed as synthetic. Filter by the employee IDs and emails below.

## Faculty

| # | Name | Employee ID | Email | Rank | College | Evidence profile | Delivery | Docs | User ID | Profile ID |
|---|------|-------------|-------|------|---------|------------------|----------|------|---------|------------|
${rows.join('\n')}
`;
fs.writeFileSync(path.join(__dirname, '../../docs/synthetic-faculty-registry.md'), md);
console.log('written', md.length, 'chars,', rows.length, 'rows');
