import { z } from 'zod';
import { normalizeAcademicRankOption, normalizeEducationalAttainmentOption } from '../constants/faculty';

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

export const personalDataSchema = z.object({
  employeeId: z.string().trim().optional(),
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
