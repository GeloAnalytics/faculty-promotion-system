/**
 * Builds a labeled promotion-prediction dataset entirely offline (no database writes).
 *
 * Feature values come from the deterministic synthetic-faculty generator already used for
 * scoring-accuracy testing (scripts/synthetic/build.ts), run through the app's own OCR-era
 * document analysis (the same analyzeDocumentContent/buildDraftPointSummary pipeline real
 * uploads go through). Labels come from applying the system's real NBC 461 / DBM-JC rank
 * rule engine (buildDraftPointSummary) to the *true* evidence, i.e. the same definition of
 * "promoted" used for real evaluator-approved cases in production
 * (src/controllers/training.controller.ts: labelPromoted = subrankIncrements > 0).
 *
 * This is a synthetic, policy-grounded dataset, not a record of real historical promotions.
 * Per the project's existing disclosure norm (docs/synthetic-dataset.md), anyone using it for
 * research or ML training must disclose it as synthetic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildCohort, type SyntheticFaculty } from '../synthetic/build';
import { profileFor, observedMetadata, truthMetadata } from '../synthetic/evaluate';
import { buildDraftPointSummary } from '../../src/utils/dashboard.utils';
import { academicRankOptions } from '../../src/constants/faculty';

// Canonical rank ordering shared with live inference (src/controllers/faculty.controller.ts),
// so a profile's rank is encoded identically whether it comes from the synthetic generator or
// a real faculty profile.
const RANK_ORDER: readonly string[] = academicRankOptions;

interface Row {
  seq: number;
  yearsInService: number;
  rankOrdinal: number;
  attainmentDoctorate: number;
  observedTeachingPoints: number;
  observedKraInstruction: number;
  observedKraResearch: number;
  observedKraExtension: number;
  observedKraProfessionalDevelopment: number;
  observedWeightedScore: number;
  observedCompletenessScore: number;
  documentCount: number;
  sex: 'M' | 'F';
  labelPromoted: 0 | 1;
  split: 'train' | 'validation' | 'test';
}

function assignSplits<T>(rows: T[], rng: () => number, ratios: [number, number, number] = [0.7, 0.15, 0.15]): Array<'train' | 'validation' | 'test'> {
  const n = rows.length;
  const indices = rows.map((_, i) => i);
  // Fisher-Yates using a seeded rng for a reproducible stratified-by-shuffle split.
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const nTrain = Math.round(n * ratios[0]);
  const nVal = Math.round(n * ratios[1]);
  const labels = new Array<'train' | 'validation' | 'test'>(n);
  indices.forEach((originalIndex, position) => {
    labels[originalIndex] = position < nTrain ? 'train' : position < nTrain + nVal ? 'validation' : 'test';
  });
  return labels;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRow(faculty: SyntheticFaculty): Row {
  const profile = profileFor(faculty);
  const observed = buildDraftPointSummary(profile, observedMetadata(faculty));
  const truth = buildDraftPointSummary(profile, truthMetadata(faculty));

  const panelFractions = observed.scoreComputation.panelScores
    .filter((panel) => panel.maxScore > 0)
    .map((panel) => Math.min(1, Math.max(0, panel.usedScore / panel.maxScore)));
  const observedCompletenessScore = panelFractions.length
    ? panelFractions.reduce((a, b) => a + b, 0) / panelFractions.length
    : 0;

  const labelPromoted = (truth.promotionDraft.subrankIncrements ?? 0) > 0 ? 1 : 0;
  const rankOrdinal = RANK_ORDER.indexOf(faculty.rank);

  return {
    seq: faculty.seq,
    yearsInService: faculty.yearsInService,
    rankOrdinal: rankOrdinal >= 0 ? rankOrdinal : 0,
    attainmentDoctorate: faculty.attainment === 'Doctorate Graduate' ? 1 : 0,
    observedTeachingPoints: observed.teachingEffectiveness ? observed.teachingEffectiveness.points : 0,
    observedKraInstruction: observed.scoreComputation.kraTotals.instruction,
    observedKraResearch: observed.scoreComputation.kraTotals.research,
    observedKraExtension: observed.scoreComputation.kraTotals.extension,
    observedKraProfessionalDevelopment: observed.scoreComputation.kraTotals.professionalDevelopment,
    observedWeightedScore: observed.scoreComputation.weightedScore ?? 0,
    observedCompletenessScore: Number(observedCompletenessScore.toFixed(4)),
    documentCount: faculty.docs.length,
    sex: faculty.sex,
    labelPromoted: labelPromoted as 0 | 1,
    split: 'train',
  };
}

function main() {
  const seed = Number(process.argv[2] ?? 1000000);
  const count = Number(process.argv[3] ?? 1000);
  const outPath = process.argv[4] ?? path.join(__dirname, '../../data/ml/promotion_training_dataset.csv');

  const cohort = buildCohort(seed, count);
  const rows = cohort.map(buildRow);

  const splitRng = mulberry32(seed + 1);
  const splits = assignSplits(rows, splitRng);
  rows.forEach((row, i) => {
    row.split = splits[i];
  });

  const promotedCount = rows.filter((r) => r.labelPromoted === 1).length;
  console.log(`Generated ${rows.length} synthetic faculty rows (seed=${seed}).`);
  console.log(`Label balance: ${promotedCount} promoted / ${rows.length - promotedCount} not promoted (${((promotedCount / rows.length) * 100).toFixed(1)}% positive).`);
  const counts = { train: 0, validation: 0, test: 0 };
  rows.forEach((r) => counts[r.split] += 1);
  console.log(`Split sizes: train=${counts.train} validation=${counts.validation} test=${counts.test}`);

  const header = [
    'seq', 'yearsInService', 'rankOrdinal', 'attainmentDoctorate',
    'observedTeachingPoints', 'observedKraInstruction', 'observedKraResearch',
    'observedKraExtension', 'observedKraProfessionalDevelopment', 'observedWeightedScore',
    'observedCompletenessScore', 'documentCount', 'sex', 'labelPromoted', 'split',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((key) => String((row as unknown as Record<string, unknown>)[key])).join(','));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${outPath}`);
}

main();
