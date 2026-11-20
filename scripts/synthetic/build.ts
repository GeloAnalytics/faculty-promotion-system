import { uploadPanels } from '../../src/uploadPanels';
import { evidenceRules, type RequirementRule } from '../../src/utils/evidenceRules';
import { getEvidenceChecklistCompleteness } from '../../src/utils/evidenceValidation';
import { computeTeachingEffectivenessPoints, type TeachingEvaluationRating } from '../../src/utils/teachingEvaluation';
import type { UploadPanelKey } from '../../src/types';
import { createRng, type Rng } from './rng';
import { pickName } from './names';
import { degrade, type NoiseLevel } from './noise';
import {
  renderEvidenceDoc,
  renderTeachingForm,
  topicFor,
  type DocContext,
  type SemesterTerm,
  type TeachingLayout,
} from './templates';

export type Archetype = 'strong' | 'solid' | 'average' | 'weak';
export type DocFormat = 'ocr-text' | 'pdf-text' | 'pdf-scan';

export interface SyntheticDoc {
  panelKey: UploadPanelKey;
  fileName: string;
  /** Text exactly as the faculty member's document reads (the ground-truth content). */
  cleanText: string;
  /** Text as the pipeline will see it after scanning/OCR damage. */
  observedText: string;
  format: DocFormat;
  noise: NoiseLevel;
  intendedKeywords: string[];
}

export interface PanelTruth {
  intendedKeywords: string[];
  checklistFraction: number;
  units: number;
  unitsForMax: number;
  maxScore: number;
  truePoints: number;
}

export interface SyntheticFaculty {
  seq: number;
  fullName: string;
  email: string;
  employeeId: string;
  sex: 'F' | 'M';
  rank: string;
  department: string;
  attainment: "Master's" | 'Doctorate Graduate';
  yearsInService: number;
  archetype: Archetype;
  delivery: 'ocr-text' | 'pdf';
  docs: SyntheticDoc[];
  truth: {
    panels: Partial<Record<UploadPanelKey, PanelTruth>>;
    teachingRatings: TeachingEvaluationRating[];
    teachingPoints: number | null;
  };
}

const ARCHETYPES: Record<Archetype, { share: number; presence: number; fullEvidence: number; quantity: number; teachingMean: number; skipSupervisor: number }> = {
  strong: { share: 0.2, presence: 0.95, fullEvidence: 0.85, quantity: 1.1, teachingMean: 94, skipSupervisor: 0 },
  solid: { share: 0.35, presence: 0.85, fullEvidence: 0.65, quantity: 0.85, teachingMean: 90, skipSupervisor: 0.03 },
  average: { share: 0.25, presence: 0.7, fullEvidence: 0.45, quantity: 0.55, teachingMean: 87, skipSupervisor: 0.08 },
  weak: { share: 0.2, presence: 0.5, fullEvidence: 0.25, quantity: 0.35, teachingMean: 82, skipSupervisor: 0.2 },
};

const RANKS: ReadonlyArray<readonly [string, number]> = [
  ['Instructor I', 4], ['Instructor II', 5], ['Instructor III', 8],
  ['Assistant Professor I', 10], ['Assistant Professor II', 10], ['Assistant Professor III', 8], ['Assistant Professor IV', 6],
  ['Associate Professor I', 8], ['Associate Professor II', 6], ['Associate Professor III', 5], ['Associate Professor IV', 4], ['Associate Professor V', 3],
  ['Professor I', 5], ['Professor II', 3], ['Professor III', 2], ['Professor IV', 1],
];

const DEPARTMENTS = [
  'College of Agriculture', 'College of Business Administration and Accountancy', 'College of Computer Studies', 'College of Fisheries',
  'College of Teacher Education', 'College of Arts and Sciences', 'College of Criminal Justice Education',
  'College of Food, Nutrition and Dietetics', 'College of International Hospitality and Tourism Management',
  'College of Industrial Technology', 'College of Engineering', 'College of Nursing and Allied Health',
] as const;

const UNITS_FOR_MAX: Partial<Record<UploadPanelKey, number>> = {
  kra1_curriculum_instructional_materials: 2,
  kra1_thesis_dissertation_mentorship: 3,
  kra2_research_outputs: 3,
  kra2_inventions: 1,
  kra2_creative_works: 2,
  kra3_service_to_institution: 2,
  kra3_service_to_community: 3,
  kra3_extension_involvement: 2,
  kra3_administrative_designation: 1,
  kra4_professional_organizations: 1,
  kra4_continuing_development: 4,
  kra4_awards_recognition: 1,
  kra4_academic_experience: 1,
  kra4_industry_experience: 1,
};

const TERMS: SemesterTerm[] = [
  { semester: 1, startYear: 2023 }, { semester: 2, startYear: 2023 },
  { semester: 1, startYear: 2024 }, { semester: 2, startYear: 2024 },
  { semester: 1, startYear: 2025 }, { semester: 2, startYear: 2025 },
];

type KeywordSet = string[];

function satisfyingSets(rule: RequirementRule | string): KeywordSet[] {
  if (typeof rule === 'string') {
    return [[rule]];
  }
  const children = rule.conditions.map(satisfyingSets);
  if (rule.type === 'OR') {
    return children.flat();
  }
  let combos: KeywordSet[] = [[]];
  for (const child of children) {
    const next: KeywordSet[] = [];
    for (const base of combos) {
      for (const option of child) {
        next.push([...new Set([...base, ...option])]);
      }
    }
    combos = next.slice(0, 60);
  }
  return combos;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clampRating(value: number) {
  return Math.min(99.5, Math.max(68, value));
}

function gaussian(rng: Rng, mean: number, sd: number) {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function planKeywords(rng: Rng, panelKey: UploadPanelKey, fullEvidence: boolean): { keywords: string[]; fraction: number } {
  const rule = evidenceRules[panelKey];
  const sets = satisfyingSets(rule);
  let chosen = [...rng.pick(sets)];
  if (!fullEvidence && chosen.length > 1) {
    // Drop evidence until the checklist is genuinely partial but not empty.
    const dropOrder = rng.shuffle(chosen);
    let kept = [...chosen];
    for (const keyword of dropOrder) {
      if (kept.length <= 1 || getEvidenceChecklistCompleteness(panelKey, kept) < 1) {
        break;
      }
      kept = kept.filter((item) => item !== keyword);
    }
    chosen = kept;
  }
  return { keywords: chosen, fraction: getEvidenceChecklistCompleteness(panelKey, chosen) };
}

function noiseFor(format: DocFormat, rng: Rng): NoiseLevel {
  if (format === 'pdf-text') {
    return 'clean';
  }
  return rng.chance(0.7) ? 'light' : 'heavy';
}

export function buildCohort(seed = 20261120, count = 100): SyntheticFaculty[] {
  const rng = createRng(seed);
  const takenNames = new Set<string>();
  const takenEmails = new Set<string>();
  const takenIds = new Set<string>();

  const archetypes: Archetype[] = [];
  for (const [name, spec] of Object.entries(ARCHETYPES) as Array<[Archetype, (typeof ARCHETYPES)[Archetype]]>) {
    for (let i = 0; i < Math.round(spec.share * count); i += 1) archetypes.push(name);
  }
  while (archetypes.length < count) archetypes.push('average');
  const shuffledArchetypes = rng.shuffle(archetypes).slice(0, count);

  // 25% of the cohort is delivered as OCR-style text rows only; the rest as real PDFs.
  const deliveryIndexes = new Set(rng.shuffle([...Array(count).keys()]).slice(0, Math.round(count * 0.25)));

  const cohort: SyntheticFaculty[] = [];
  for (let index = 0; index < count; index += 1) {
    const archetype = shuffledArchetypes[index];
    const profile = ARCHETYPES[archetype];
    const name = pickName(rng, takenNames);
    const rank = rng.weighted(RANKS);
    const isProfessor = rank.startsWith('Professor');
    const attainment: SyntheticFaculty['attainment'] =
      isProfessor || (rank.startsWith('Associate') && rng.chance(0.5)) ? 'Doctorate Graduate' : "Master's";
    const yearsInService = rank.startsWith('Instructor') ? rng.int(1, 8) : rank.startsWith('Assistant') ? rng.int(4, 14) : rank.startsWith('Associate') ? rng.int(9, 22) : rng.int(15, 32);
    const department = rng.pick(DEPARTMENTS);
    const delivery: 'ocr-text' | 'pdf' = deliveryIndexes.has(index) ? 'ocr-text' : 'pdf';

    let email = `${name.first}.${name.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@lspu.edu.ph';
    for (let n = 2; takenEmails.has(email); n += 1) {
      email = `${name.first}.${name.last}${n}`.toLowerCase().replace(/[^a-z0-9.]/g, '') + '@lspu.edu.ph';
    }
    takenEmails.add(email);
    let employeeId = String(rng.int(2012000000, 2025999999));
    while (takenIds.has(employeeId)) employeeId = String(rng.int(2012000000, 2025999999));
    takenIds.add(employeeId);

    const ctx: DocContext = {
      name: name.full,
      last: name.last,
      sexSalutation: name.sex === 'F' ? 'MS.' : 'MR.',
      rank,
      department,
      rng,
    };

    const docs: SyntheticDoc[] = [];
    const addDoc = (panelKey: UploadPanelKey, fileName: string, cleanText: string, intendedKeywords: string[], teaching = false) => {
      const format: DocFormat =
        delivery === 'ocr-text' ? 'ocr-text' : rng.chance(teaching ? 0.85 : 0.35) ? 'pdf-scan' : 'pdf-text';
      const noise = noiseFor(format, rng);
      docs.push({ panelKey, fileName, cleanText, observedText: degrade(cleanText, noise, rng), format, noise, intendedKeywords });
    };

    // ---- KRA 1 Criterion A: SET / SEF per semester (NBC 461) ----
    const semesterCount = rng.int(2, 6);
    const teachingRatings: TeachingEvaluationRating[] = [];
    const skipSupervisor = rng.chance(profile.skipSupervisor);
    for (const term of TERMS.slice(TERMS.length - semesterCount)) {
      const period = `${term.semester}-${term.startYear}`;
      const studentTrue = round2(clampRating(gaussian(rng, profile.teachingMean, 3)));
      const supervisorTrue = round2(clampRating(gaussian(rng, profile.teachingMean + 1, 3)));
      const isFedafTerm = term.semester === 2 && term.startYear === 2025;
      const label = `${term.semester === 1 ? '1st' : '2nd'}-Sem_${term.startYear}-${term.startYear + 1}`;

      if (isFedafTerm && !skipSupervisor) {
        teachingRatings.push({ evaluator: 'student', rating: studentTrue, period }, { evaluator: 'supervisor', rating: supervisorTrue, period });
        addDoc('kra1_teaching_effectiveness', `FEDAF_${label}.pdf`,
          renderTeachingForm({ evaluator: 'student', layout: 'fedaf', rating: studentTrue, otherRating: supervisorTrue, term, c: ctx }), ['fedaf', 'nbc 461'], true);
        continue;
      }
      const studentLayout: TeachingLayout = rng.pick(['letter', 'letter', 'weighted']);
      teachingRatings.push({ evaluator: 'student', rating: studentTrue, period });
      addDoc('kra1_teaching_effectiveness', `SET_${label}.pdf`,
        renderTeachingForm({ evaluator: 'student', layout: studentLayout, rating: studentTrue, term, c: ctx }), ['set', 'nbc 461'], true);
      if (!skipSupervisor) {
        const supervisorLayout: TeachingLayout = rng.pick(['letter', 'cmo19', 'weighted']);
        // CMO 19 forms print an integer "Computed Rating"; that printed value is the evidence.
        const printed = supervisorLayout === 'cmo19' ? Math.round(supervisorTrue) : supervisorTrue;
        teachingRatings.push({ evaluator: 'supervisor', rating: printed, period });
        addDoc('kra1_teaching_effectiveness', `SEF_${label}.pdf`,
          renderTeachingForm({ evaluator: 'supervisor', layout: supervisorLayout, rating: supervisorTrue, term, c: ctx }), ['sef', 'nbc 461'], true);
      }
    }
    const teaching = computeTeachingEffectivenessPoints(teachingRatings);

    // ---- Remaining panels: evidence plan with ground truth ----
    const panels: SyntheticFaculty['truth']['panels'] = {};
    const hasDesignation = rng.chance(0.2);
    const isNewEntrant = yearsInService <= 3 && rng.chance(0.5);
    const optionalChance: Partial<Record<UploadPanelKey, number>> = {
      kra2_inventions: 0.07,
      kra2_creative_works: 0.1,
      kra3_administrative_designation: hasDesignation ? 0.95 : 0,
      kra4_academic_experience: isNewEntrant ? 0.9 : 0,
      kra4_industry_experience: isNewEntrant ? 0.5 : 0,
    };

    for (const panel of uploadPanels) {
      if (panel.key === 'kra1_teaching_effectiveness') continue;
      const key = panel.key as UploadPanelKey;
      const presence = key in optionalChance ? optionalChance[key]! : profile.presence;
      if (!rng.chance(presence)) continue;

      const unitsForMax = UNITS_FOR_MAX[key] ?? 1;
      const units = Math.max(1, Math.min(unitsForMax + 1, Math.round(profile.quantity * unitsForMax + gaussian(rng, 0, 0.6))));
      const plan = planKeywords(rng, key, rng.chance(profile.fullEvidence));
      const truePoints = round2(panel.maxScore * plan.fraction * Math.min(1, units / unitsForMax));
      panels[key] = {
        intendedKeywords: plan.keywords,
        checklistFraction: plan.fraction,
        units,
        unitsForMax,
        maxScore: panel.maxScore,
        truePoints,
      };

      for (let unit = 0; unit < units; unit += 1) {
        // Later units repeat the first keyword plus a subset, so the union across the panel stays complete.
        const subset = unit === 0 ? plan.keywords : [plan.keywords[0], ...rng.shuffle(plan.keywords.slice(1)).slice(0, rng.int(1, 2))];
        const { title, text } = renderEvidenceDoc(key, [...new Set(subset)], ctx, topicFor(rng));
        addDoc(key, `${title.replace(/\s+/g, '_')}_${unit + 1}.pdf`, text, [...new Set(subset)]);
      }
    }

    cohort.push({
      seq: index + 1,
      fullName: name.full,
      email,
      employeeId,
      sex: name.sex,
      rank,
      department,
      attainment,
      yearsInService,
      archetype,
      delivery,
      docs,
      truth: { panels, teachingRatings, teachingPoints: teaching ? teaching.points : null },
    });
  }
  return cohort;
}
