import { analyzeDocumentContent } from '../../src/utils';
import { extractTeachingEvaluationRatings } from '../../src/utils/teachingEvaluation';
import { getEvidenceChecklistCompleteness } from '../../src/utils/evidenceValidation';
import { evidenceRules, type RequirementRule } from '../../src/utils/evidenceRules';
import { uploadPanels } from '../../src/uploadPanels';
import { buildCohort } from './build';

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}% (${n}/${d})`;

function leaves(rule: RequirementRule | string): string[] {
  return typeof rule === 'string' ? [rule] : rule.conditions.flatMap(leaves);
}

const cohort = buildCohort(Number(process.argv[2] ?? 20261120), 100);

// 1. Teaching forms: clean text must be read perfectly, else the generator is at fault.
const layoutOf = (text: string) =>
  /acknowledgement form/i.test(text) ? 'fedaf' : /computed rating/i.test(text) ? 'cmo19' : /rating computation/i.test(text) ? 'weighted' : 'letter';
const stats: Record<string, { n: number; clean: number; observed: number; byNoise: Record<string, { n: number; ok: number }> }> = {};
const sameRatings = (a: ReturnType<typeof extractTeachingEvaluationRatings>, b: ReturnType<typeof extractTeachingEvaluationRatings>) =>
  a.length === b.length && a.every((x) => b.some((y) => y.evaluator === x.evaluator && Math.abs(y.rating - x.rating) < 0.011 && y.period === x.period));
const misses: string[] = [];
for (const faculty of cohort) {
  for (const doc of faculty.docs.filter((d) => d.panelKey === 'kra1_teaching_effectiveness')) {
    const layout = layoutOf(doc.cleanText);
    const clean = extractTeachingEvaluationRatings(doc.cleanText);
    const observed = extractTeachingEvaluationRatings(doc.observedText);
    const slot = (stats[layout] ??= { n: 0, clean: 0, observed: 0, byNoise: {} });
    slot.n += 1;
    if (clean.length) slot.clean += 1;
    const ok = clean.length > 0 && sameRatings(clean, observed);
    if (ok) slot.observed += 1;
    const noiseSlot = (slot.byNoise[doc.noise] ??= { n: 0, ok: 0 });
    noiseSlot.n += 1;
    if (ok) noiseSlot.ok += 1;
    if (!ok && doc.noise !== 'clean' && misses.length < 4) {
      misses.push(`[${layout}/${doc.noise}] clean=${JSON.stringify(clean.map((r) => r.rating))} observed=${JSON.stringify(observed.map((r) => r.rating))}\n   ${doc.observedText.replace(/\s+/g, ' ').slice(0, 260)}`);
    }
  }
}
console.log('== Teaching forms: per-document extraction (clean text read / observed text matches clean) ==');
for (const [layout, s] of Object.entries(stats)) {
  console.log(`${layout.padEnd(9)} clean readable ${pct(s.clean, s.n)} | observed==clean ${pct(s.observed, s.n)} | ${Object.entries(s.byNoise).map(([k, v]) => `${k}:${pct(v.ok, v.n)}`).join(' ')}`);
}
console.log('\nSample misses:');
for (const m of misses) console.log(m);

// 2. Panel error decomposition.
console.log('\n== Non-teaching panels: error = extraction/leaky-keyword part + quantity-blind part (points) ==');
const rows: Record<string, { ext: number[]; qty: number[]; leak: number; n: number; under: number }> = {};
for (const faculty of cohort) {
  for (const [key, truth] of Object.entries(faculty.truth.panels)) {
    const panel = uploadPanels.find((p) => p.key === key)!;
    const docs = faculty.docs.filter((d) => d.panelKey === key);
    const keywordHits = new Set<string>();
    for (const doc of docs) {
      for (const hit of analyzeDocumentContent(doc.observedText, key as never, 'pdf').keywordHits) keywordHits.add(hit);
    }
    const detectedFraction = getEvidenceChecklistCompleteness(key, [...keywordHits]);
    const quantity = Math.min(1, truth!.units / truth!.unitsForMax);
    const slot = (rows[key] ??= { ext: [], qty: [], leak: 0, n: 0, under: 0 });
    slot.n += 1;
    slot.ext.push((detectedFraction - truth!.checklistFraction) * panel.maxScore);
    slot.qty.push(truth!.checklistFraction * (1 - quantity) * panel.maxScore);
    // Keywords detected on a panel that were never part of the intended evidence.
    const ruleLeaves = new Set(leaves(evidenceRules[key]));
    const extra = [...keywordHits].filter((k) => ruleLeaves.has(k) && !truth!.intendedKeywords.includes(k));
    if (extra.length) slot.leak += 1;
    if (detectedFraction < truth!.checklistFraction - 1e-9) slot.under += 1;
  }
}
console.log('panel'.padEnd(44) + 'n'.padStart(4) + 'extractErr'.padStart(11) + 'quantityErr'.padStart(12) + '  leakyHits  underDetected');
for (const [key, s] of Object.entries(rows)) {
  const title = uploadPanels.find((p) => p.key === key)!.title;
  console.log(title.slice(0, 42).padEnd(44) + String(s.n).padStart(4) + mean(s.ext).toFixed(2).padStart(11) + mean(s.qty).toFixed(2).padStart(12) + `  ${pct(s.leak, s.n).padEnd(14)}${pct(s.under, s.n)}`);
}
