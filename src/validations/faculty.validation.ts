import { z } from 'zod';
import {
  normalizeAcademicRankOption,
  normalizeEducationalAttainmentOption,
  normalizeCollegeDepartmentOption,
} from '../constants/faculty';

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

const collegeDepartmentSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? normalizeCollegeDepartmentOption(value) : undefined))
  .refine((value) => value === undefined || value !== null, 'Select a valid college department')
  .transform((value) => value ?? undefined);

const employeeIdSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Faculty ID must contain exactly 10 digits');

export const personalDataSchema = z.object({
  employeeId: employeeIdSchema,
  fullName: z.string().trim().min(1),
  age: z.number().nonnegative().optional(),
  sex: z.string().trim().optional(),
  civilStatus: z.string().trim().optional(),
  academicRank: academicRankSchema,
  yearsInService: z.number().nonnegative().optional(),
  highestEducationalAttainment: educationalAttainmentSchema,
  department: collegeDepartmentSchema,
});

export const promotionHistorySchema = z.object({
  cycle: z.string().trim().optional(),
  promoted: z.boolean(),
  previousRank: optionalAcademicRankSchema,
  newRank: optionalAcademicRankSchema,
});

// Identity only - no performance scores accepted here. Every KRA score comes
// exclusively from OCR of uploaded score sheets/evidence (see
// buildEvidenceBasedScoreComputation in dashboard.utils.ts). Identity fields
// like academic rank can't be reliably OCR-derived, so this is the one
// legitimately manual part of a faculty profile.
export const facultyIngestionSchema = z.object({
  personalData: personalDataSchema,
  promotionHistory: z.array(promotionHistorySchema).default([]),
  notes: z.string().trim().optional(),
});
