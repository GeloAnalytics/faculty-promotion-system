import { z } from 'zod';

export const personalDataSchema = z.object({
  employeeId: z.string().trim().optional(),
  fullName: z.string().trim().min(1),
  age: z.number().nonnegative().optional(),
  sex: z.string().trim().optional(),
  civilStatus: z.string().trim().optional(),
  academicRank: z.string().trim().optional(),
  yearsInService: z.number().nonnegative().optional(),
  highestEducationalAttainment: z.string().trim().optional(),
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
  previousRank: z.string().trim().optional(),
  newRank: z.string().trim().optional(),
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
