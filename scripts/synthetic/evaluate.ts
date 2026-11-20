import fs from 'node:fs';
import path from 'node:path';
import { analyzeDocumentContent } from '../../src/utils';
import { buildDraftPointSummary } from '../../src/utils/dashboard.utils';
import { uploadPanels } from '../../src/uploadPanels';
import { fixedReviewPeriodLabel } from '../../src/constants/reviewCycle';
import type { UploadPanelKey } from '../../src/types';
import { buildCohort, type SyntheticFaculty } from './build';

const panelTitle = (key: string) => uploadPanels.find((panel) => panel.key === key)?.title ?? key;

export function profileFor(faculty: SyntheticFaculty) {
  return {
    semester: fixedReviewPeriodLabel,
    features: {
      baselineData: {
        personalData: {
          fullName: faculty.fullName,
          employeeId: faculty.employeeId,
          academicRank: faculty.rank,
          highestEducationalAttainment: faculty.attainment,
          department: faculty.department,
        },
        promotionHistory: [],
      },
    },
  };
}

/** What the live pipeline produces from the observed (scanned/OCR'd) text. */
function observedMetadata(faculty: SyntheticFaculty) {
  return faculty.docs.map((doc) => ({
    extractionMetadata: {
      uploadType: 'evidence',
      panelKey: doc.panelKey,
      panelTitle: panelTitle(doc.panelKey),
      analysis: analyzeDocumentContent(doc.observedText, doc.panelKey, 'pdf'),
    },
  }));
}

/** The same aggregation fed the true values, giving the expected answer. */
export function truthMetadata(faculty: SyntheticFaculty) {
  const docs: Array<{ extractionMetadata: unknown }> = Object.entries(faculty.truth.panels).map(([key, truth]) => ({
    extractionMetadata: {
      uploadType: 'evidence',
      panelKey: key,
      panelTitle: panelTitle(key),
      analysis: { extractedScores: { [key]: truth!.truePoints }, keywordHits: [], detectedCategories: [] },
    },
  }));
  docs.push({
    extractionMetadata: {
      uploadType: 'evidence',
      panelKey: 'kra1_teaching_effectiveness',
      panelTitle: panelTitle('kra1_teaching_effectiveness'),
      analysis: { extractedScores: {}, keywordHits: [], detectedCategories: [], teachingEvaluations: faculty.truth.teachingRatings },
    },
  });
  return docs;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const f2 = (value: number) => value.toFixed(2);

export function evaluateCohort(cohort: SyntheticFaculty[]) {
  const panelRows: Array<{ seq: number; panel: string; truth: number; used: number; source: string; max: number; archetype: string; format: string; hasTruth: boolean }> = [];
  const facultyRows: Array<{ seq: number; archetype: string; delivery: string; rank: string; truthScore: number | null; usedScore: number | null; truthBracket: string | null; usedBracket: string | null; truthRank: string | null; usedRank: string | null; truthStatus: string | null; usedStatus: string | null; teachTruth: number | null; teachUsed: number | null; ratingsTruth: number; ratingsMatched: number; ratingsDetected: number; kraErr: number[] }> = [];

  for (const faculty of cohort) {
    const profile = profileFor(faculty);
    const observed = buildDraftPointSummary(profile, observedMetadata(faculty));
    const expected = buildDraftPointSummary(profile, truthMetadata(faculty));

    const expectedByKey = new Map(expected.scoreComputation.panelScores.map((panel) => [panel.key, panel]));
    const dominantFormat = faculty.docs.some((doc) => doc.format === 'pdf-scan') ? 'scan' : faculty.delivery === 'ocr-text' ? 'ocr-text' : 'pdf-text';
    for (const panel of observed.scoreComputation.panelScores) {
      const truthPanel = expectedByKey.get(panel.key as UploadPanelKey);
      const hasTruth = Boolean(faculty.truth.panels[panel.key as UploadPanelKey]) || (panel.key === 'kra1_teaching_effectiveness' && faculty.truth.teachingPoints !== null);
      panelRows.push({
        seq: faculty.seq,
        panel: panel.key,
        truth: truthPanel?.usedScore ?? 0,
        used: panel.usedScore,
        source: panel.scoreSource,
        max: panel.maxScore,
        archetype: faculty.archetype,
        format: dominantFormat,
        hasTruth,
      });
    }

    const detected = faculty.docs.flatMap((doc) =>
      (analyzeDocumentContent(doc.observedText, doc.panelKey, 'pdf').teachingEvaluations ?? []),
    );
    const matched = faculty.truth.teachingRatings.filter((truth) =>
      detected.some((d) => d.evaluator === truth.evaluator && Math.abs(d.rating - truth.rating) < 0.011 && d.period === truth.period),
    ).length;

    facultyRows.push({
      seq: faculty.seq,
      archetype: faculty.archetype,
      delivery: faculty.delivery,
      rank: faculty.rank,
      truthScore: expected.scoreComputation.weightedScore,
      usedScore: observed.scoreComputation.weightedScore,
      truthBracket: expected.scoreComputation.scoreBracket,
      usedBracket: observed.scoreComputation.scoreBracket,
      truthRank: expected.promotionDraft.suggestedRank,
      usedRank: observed.promotionDraft.suggestedRank,
      truthStatus: expected.promotionDraft.status,
      usedStatus: observed.promotionDraft.status,
      teachTruth: faculty.truth.teachingPoints,
      teachUsed: observed.teachingEffectiveness ? observed.teachingEffectiveness.points : null,
      ratingsTruth: faculty.truth.teachingRatings.length,
      ratingsMatched: matched,
      ratingsDetected: detected.length,
      kraErr: [
        observed.scoreComputation.kraTotals.instruction - expected.scoreComputation.kraTotals.instruction,
        observed.scoreComputation.kraTotals.research - expected.scoreComputation.kraTotals.research,
        observed.scoreComputation.kraTotals.extension - expected.scoreComputation.kraTotals.extension,
        observed.scoreComputation.kraTotals.professionalDevelopment - expected.scoreComputation.kraTotals.professionalDevelopment,
      ],
    });
  }
  return { panelRows, facultyRows };
}

export function report(cohort: SyntheticFaculty[]) {
  const { panelRows, facultyRows } = evaluateCohort(cohort);
  const lines: string[] = [];
  const out = (line = '') => lines.push(line);

  out(`Cohort: ${cohort.length} faculty | docs: ${cohort.reduce((n, f) => n + f.docs.length, 0)} (avg ${f2(mean(cohort.map((f) => f.docs.length)))}/faculty)`);
  const fmt = cohort.flatMap((f) => f.docs).reduce<Record<string, number>>((a, d) => ({ ...a, [d.format]: (a[d.format] ?? 0) + 1 }), {});
  out(`Doc formats: ${JSON.stringify(fmt)}`);

  out('\n== Teaching effectiveness (NBC 461: SET/100x36 + SEF/100x24) ==');
  const tRows = facultyRows.filter((r) => r.teachTruth !== null);
  const tErr = tRows.map((r) => Math.abs((r.teachUsed ?? 0) - (r.teachTruth ?? 0)));
  const ratingsTruth = tRows.reduce((n, r) => n + r.ratingsTruth, 0);
  const ratingsMatched = tRows.reduce((n, r) => n + r.ratingsMatched, 0);
  const ratingsDetected = tRows.reduce((n, r) => n + r.ratingsDetected, 0);
  out(`Ratings read correctly: ${ratingsMatched}/${ratingsTruth} (recall ${pct(ratingsMatched / ratingsTruth)}); precision ${pct(ratingsMatched / Math.max(1, ratingsDetected))}`);
  out(`Points (max 60) MAE ${f2(mean(tErr))} | within 1pt ${pct(tErr.filter((e) => e <= 1).length / tErr.length)} | exact ${pct(tErr.filter((e) => e < 0.01).length / tErr.length)} | no rating detected ${tRows.filter((r) => r.teachUsed === null).length}`);

  out('\n== Panel scores vs ground truth (points) ==');
  out('panel'.padEnd(46) + 'n'.padStart(4) + 'MAE'.padStart(7) + 'bias'.padStart(7) + '  <=10%max  falseCredit');
  const byPanel = new Map<string, typeof panelRows>();
  for (const row of panelRows) byPanel.set(row.panel, [...(byPanel.get(row.panel) ?? []), row]);
  for (const [panel, rows] of byPanel) {
    const withTruth = rows.filter((r) => r.hasTruth);
    const errs = withTruth.map((r) => r.used - r.truth);
    const falseCredit = rows.filter((r) => !r.hasTruth && r.used > 0).length;
    out(
      panelTitle(panel).slice(0, 44).padEnd(46) +
        String(withTruth.length).padStart(4) +
        f2(mean(errs.map(Math.abs))).padStart(7) +
        f2(mean(errs)).padStart(7) +
        `  ${pct(withTruth.length ? errs.filter((e, i) => Math.abs(e) <= 0.1 * withTruth[i].max).length / withTruth.length : 0)}`.padEnd(11) +
        String(falseCredit),
    );
  }
  const all = panelRows.filter((r) => r.hasTruth && r.panel !== 'kra1_teaching_effectiveness');
  out(`Non-teaching panels overall: MAE ${f2(mean(all.map((r) => Math.abs(r.used - r.truth))))} pts, bias ${f2(mean(all.map((r) => r.used - r.truth)))} pts`);
  const sources = all.reduce<Record<string, number>>((a, r) => ({ ...a, [r.source]: (a[r.source] ?? 0) + 1 }), {});
  out(`Score source on those panels: ${JSON.stringify(sources)}`);

  out('\n== Faculty-level outcome ==');
  out(`KRA total MAE (instruction/research/extension/prof-dev): ${[0, 1, 2, 3].map((i) => f2(mean(facultyRows.map((r) => Math.abs(r.kraErr[i]))))).join(' / ')}`);
  const scored = facultyRows.filter((r) => r.truthScore !== null && r.usedScore !== null);
  out(`Weighted score MAE ${f2(mean(scored.map((r) => Math.abs((r.usedScore ?? 0) - (r.truthScore ?? 0)))))} (n=${scored.length})`);
  out(`Score bracket agreement ${pct(facultyRows.filter((r) => r.truthBracket === r.usedBracket).length / facultyRows.length)} | suggested-rank agreement ${pct(facultyRows.filter((r) => r.truthRank === r.usedRank).length / facultyRows.length)} | status agreement ${pct(facultyRows.filter((r) => r.truthStatus === r.usedStatus).length / facultyRows.length)}`);

  out('\n== By archetype / delivery (suggested-rank agreement, teaching MAE) ==');
  for (const group of ['archetype', 'delivery'] as const) {
    for (const value of [...new Set(facultyRows.map((r) => r[group]))]) {
      const rows = facultyRows.filter((r) => r[group] === value);
      const tr = rows.filter((r) => r.teachTruth !== null);
      out(`${group}=${value}`.padEnd(22) + `n=${String(rows.length).padStart(3)}  rank-agree ${pct(rows.filter((r) => r.truthRank === r.usedRank).length / rows.length).padStart(6)}  teachMAE ${f2(mean(tr.map((r) => Math.abs((r.teachUsed ?? 0) - (r.teachTruth ?? 0)))))}`);
    }
  }
  return { text: lines.join('\n'), panelRows, facultyRows };
}

if (require.main === module) {
  const seed = Number(process.argv[2] ?? 20261120);
  const cohort = buildCohort(seed, 100);
  const result = report(cohort);
  console.log(result.text);
  const outDir = process.argv[3];
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'accuracy-report.txt'), result.text);
    fs.writeFileSync(path.join(outDir, 'panel-rows.json'), JSON.stringify(result.panelRows));
    fs.writeFileSync(path.join(outDir, 'faculty-rows.json'), JSON.stringify(result.facultyRows));
  }
}
