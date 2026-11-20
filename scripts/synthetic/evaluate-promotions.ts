/**
 * Fills in the one identity field the loader left out (yearsInService) and runs a full
 * promotion evaluation -- the real rule-based draft (NBC 461/DBM-JC) plus the trained ML
 * advisory prediction -- for every synthetic faculty member already loaded into the database
 * (scripts/synthetic/load.ts). Writes a real row to `predictions` and sets
 * FacultyProfile.promotion for each, using the exact same evaluateProfilePromotion() pipeline
 * the live /api/faculty/predictions/generate endpoint uses.
 *
 * Scoped like unload.ts: only touches profile ids listed in the local registry.json, which
 * this loader itself wrote.
 *
 *   npx tsx --env-file=.env scripts/synthetic/evaluate-promotions.ts [--dry] [--seq=1,2,3]
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../src/config/db';
import { readRegistry, SEED } from './load';
import { buildCohort } from './build';
import { evaluateProfilePromotion } from '../../src/services/promotionEvaluation.service';
import { isPromotionModelAvailable } from '../../src/services/model.service';

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const seqArg = args.find((a) => a.startsWith('--seq='));
  const wantedSeqs = seqArg ? new Set(seqArg.slice(6).split(',').filter(Boolean).map(Number)) : null;

  if (!isPromotionModelAvailable()) {
    throw new Error('No trained model artifact present. Run `python scripts/ml/train_models.py` first.');
  }

  const registry = readRegistry();
  const cohort = buildCohort(SEED, 100);
  const cohortBySeq = new Map(cohort.map((f) => [f.seq, f]));

  const entries = Object.values(registry).filter((e) => !wantedSeqs || wantedSeqs.has(e.seq));
  console.log(`Evaluating ${entries.length} synthetic faculty (dry=${dry})...`);

  const rows: Array<Record<string, unknown>> = [];

  for (const entry of entries) {
    const faculty = cohortBySeq.get(entry.seq);
    if (!faculty) {
      console.log(`seq ${entry.seq}: not found in the rebuilt cohort (seed/count mismatch?) -- skipped`);
      continue;
    }

    const profile = await prisma.facultyProfile.findUnique({
      where: { id: entry.profileId },
      select: { id: true, features: true },
    });
    if (!profile) {
      console.log(`seq ${entry.seq}: profile ${entry.profileId} no longer exists -- skipped`);
      continue;
    }

    const features = (profile.features ?? {}) as { baselineData?: { personalData?: Record<string, unknown> } };
    const personalData = features.baselineData?.personalData ?? {};
    const alreadyHasYears = typeof personalData.yearsInService === 'number';

    if (!dry) {
      if (!alreadyHasYears) {
        await prisma.facultyProfile.update({
          where: { id: profile.id },
          data: {
            features: {
              baselineData: {
                personalData: { ...personalData, yearsInService: faculty.yearsInService },
                promotionHistory: (features.baselineData as { promotionHistory?: unknown })?.promotionHistory ?? [],
              },
            },
          },
        });
      }
    }

    let evaluation;
    try {
      evaluation = await evaluateProfilePromotion(entry.profileId, { generatedByUserId: null, persist: !dry });
    } catch (error) {
      console.log(`seq ${entry.seq}: evaluation failed -- ${error instanceof Error ? error.message : error}`);
      continue;
    }

    const row = {
      seq: entry.seq,
      name: faculty.fullName,
      archetype: faculty.archetype,
      rank: faculty.rank,
      attainment: faculty.attainment,
      yearsInService: faculty.yearsInService,
      weightedScore: evaluation.ruleBasedDraft.weightedScore,
      scoreBracket: evaluation.ruleBasedDraft.scoreBracket,
      suggestedRank: evaluation.ruleBasedDraft.suggestedRank,
      ruleStatus: evaluation.ruleBasedDraft.status,
      rulePromoted: evaluation.promoted,
      mlProbability: Number(evaluation.prediction.probability.toFixed(4)),
      mlPredictedClass: evaluation.prediction.predictedClass,
    };
    rows.push(row);
    console.log(
      `seq ${String(entry.seq).padStart(3)} ${faculty.fullName.padEnd(24)} ${faculty.archetype.padEnd(8)} ` +
        `rule=${evaluation.promoted ? 'promoted' : 'not promoted'} (${evaluation.ruleBasedDraft.scoreBracket ?? 'n/a'}) ` +
        `ml=${evaluation.prediction.predictedClass ? 'promoted' : 'not promoted'} p=${row.mlProbability}`,
    );
  }

  const agreementCount = rows.filter((r) => r.rulePromoted === r.mlPredictedClass).length;
  console.log(`\nDone. ${rows.length} evaluated. Rule/ML agreement: ${agreementCount}/${rows.length}.`);

  const outPath = path.join(__dirname, '../../docs/synthetic-promotion-evaluations.csv');
  if (!dry && rows.length) {
    const header = Object.keys(rows[0]);
    const csv = [header.join(',')]
      .concat(rows.map((r) => header.map((k) => String(r[k]).replace(/,/g, ';')).join(',')))
      .join('\n');
    fs.writeFileSync(outPath, csv + '\n');
    console.log(`Wrote ${outPath}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
