import { z } from 'zod';
import { normalizeAcademicRankOption, normalizeEducationalAttainmentOption } from '../constants/faculty';
import {
  fixedReviewPeriodLabel,
  reviewCycleYearLabels,
} from '../constants/reviewCycle';

const academicRankSchema = z
  .string()
  .trim()
  .min(1, 'Academic rank is required')
  .refine((value) => normalizeAcademicRankOption(value) !== null, 'Select a valid academic rank')
  .transform((value) => normalizeAcademicRankOption(value) as string);

const educationalAttainmentSchema = z
  .string()
  .trim()
  .min(1, 'Highest educational attainment is required')
  .refine((value) => normalizeEducationalAttainmentOption(value) !== null, 'Select a valid highest educational attainment')
  .transform((value) => normalizeEducationalAttainmentOption(value) as string);

const optionalAcademicRankSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? normalizeAcademicRankOption(value) : undefined))
  .refine((value) => value === undefined || value !== null, 'Select a valid academic rank')
  .transform((value) => value ?? undefined);

const employeeIdSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Employee ID must contain exactly 10 digits');

function buildCycleMetricYearSchema(max?: number) {
  const scoreSchema = z.coerce.number().nonnegative();
  const constrainedScoreSchema = max === undefined ? scoreSchema : scoreSchema.max(max);

  return z.object({
    yearLabel: z.enum(reviewCycleYearLabels),
    firstSemester: constrainedScoreSchema,
    secondSemester: constrainedScoreSchema,
    yearlyAverage: z.number().nonnegative().optional(),
  });
}

function computeAverage(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function normalizeCycleMetricSummary(
  entries: Array<{ yearLabel: (typeof reviewCycleYearLabels)[number]; firstSemester: number; secondSemester: number }>,
) {
  const entryMap = new Map(entries.map((entry) => [entry.yearLabel, entry]));
  const yearlyEntries = reviewCycleYearLabels.map((yearLabel) => {
    const entry = entryMap.get(yearLabel);
    const firstSemester = entry?.firstSemester ?? 0;
    const secondSemester = entry?.secondSemester ?? 0;

    return {
      yearLabel,
      firstSemester,
      secondSemester,
      yearlyAverage: computeAverage([firstSemester, secondSemester]),
    };
  });

  return {
    average: computeAverage(
      yearlyEntries.flatMap((entry) => [entry.firstSemester, entry.secondSemester]),
    ),
    yearlyEntries,
  };
}

const cycleMetricsSchema = z
  .object({
    ipcrAverage: z.object({
      average: z.number().nonnegative().optional(),
      yearlyEntries: z.array(buildCycleMetricYearSchema(5)).length(reviewCycleYearLabels.length),
    }),
    teachingEffectiveness: z.object({
      average: z.number().nonnegative().optional(),
      yearlyEntries: z.array(buildCycleMetricYearSchema(100)).length(reviewCycleYearLabels.length),
    }),
    researchOutputs: z.object({
      average: z.number().nonnegative().optional(),
      yearlyEntries: z.array(buildCycleMetricYearSchema()).length(reviewCycleYearLabels.length),
    }),
    extensionServices: z.object({
      average: z.number().nonnegative().optional(),
      yearlyEntries: z.array(buildCycleMetricYearSchema()).length(reviewCycleYearLabels.length),
    }),
  })
  .transform((value) => ({
    ipcrAverage: normalizeCycleMetricSummary(value.ipcrAverage.yearlyEntries),
    teachingEffectiveness: normalizeCycleMetricSummary(value.teachingEffectiveness.yearlyEntries),
    researchOutputs: normalizeCycleMetricSummary(value.researchOutputs.yearlyEntries),
    extensionServices: normalizeCycleMetricSummary(value.extensionServices.yearlyEntries),
  }));

export const personalDataSchema = z.object({
  employeeId: employeeIdSchema,
  fullName: z.string().trim().min(1),
  age: z.number().nonnegative().optional(),
  sex: z.string().trim().optional(),
  civilStatus: z.string().trim().optional(),
  academicRank: academicRankSchema,
  yearsInService: z.number().nonnegative().optional(),
  highestEducationalAttainment: educationalAttainmentSchema,
  department: z.string().trim().optional(),
});

export const performanceReviewSchema = z.object({
  reviewPeriod: z.string().trim().optional(),
  ipcrAverage: z.number().nonnegative().optional(),
  teachingEffectiveness: z.number().nonnegative().optional(),
  researchOutputs: z.number().nonnegative().optional(),
  extensionServices: z.number().nonnegative().optional(),
  administrativeExperience: z.number().nonnegative().optional(),
  professionalDevelopmentHours: z.number().nonnegative().optional(),
  cycleMetrics: cycleMetricsSchema.optional(),
}).transform((value) => {
  const cycleMetrics = value.cycleMetrics;

  return {
    ...value,
    reviewPeriod: fixedReviewPeriodLabel,
    ipcrAverage: cycleMetrics?.ipcrAverage.average ?? value.ipcrAverage,
    teachingEffectiveness: cycleMetrics?.teachingEffectiveness.average ?? value.teachingEffectiveness,
    researchOutputs: cycleMetrics?.researchOutputs.average ?? value.researchOutputs,
    extensionServices: cycleMetrics?.extensionServices.average ?? value.extensionServices,
    cycleMetrics,
  };
});

export const promotionHistorySchema = z.object({
  cycle: z.string().trim().optional(),
  promoted: z.boolean(),
  previousRank: optionalAcademicRankSchema,
  newRank: optionalAcademicRankSchema,
});

export const documentExtractionSchema = z.object({
  source: z.enum(['pdf', 'manual']),
  textLength: z.number().nonnegative(),
  detectedFields: z.array(z.string()),
  completenessScore: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  extractedScores: z.record(z.number()).default({}),
});

export const facultyIngestionSchema = z.object({
  personalData: personalDataSchema,
  performanceReview: performanceReviewSchema,
  promotionHistory: z.array(promotionHistorySchema).default([]),
  documentExtraction: documentExtractionSchema.optional(),
  notes: z.string().trim().optional(),
});
