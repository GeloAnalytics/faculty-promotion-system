import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { facultyIngestionSchema } from '../validations/faculty.validation';
import { attachExistingDocumentsToProfile, toPrismaJson } from '../utils/document.utils';
import { fixedReviewPeriodLabel } from '../constants/reviewCycle';
import { UserRole } from '@prisma/client';

// Identity only - academic rank, department, etc. Every KRA score comes from
// OCR of uploaded score sheets/evidence instead (see dashboard.utils.ts), never
// from a typed-in form. This endpoint is idempotent: it updates the profile
// that was auto-created on the employee's first upload, or creates one if
// they haven't uploaded anything yet.
export const ingestFaculty = async (req: Request, res: Response) => {
  const payload = facultyIngestionSchema.parse(req.body);
  const featureEnvelope = buildIdentityFeatureEnvelope(payload);

  const existingProfile = await prisma.facultyProfile.findFirst({
    where: { createdByUserId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  const profile = existingProfile
    ? await prisma.facultyProfile.update({
        where: { id: existingProfile.id },
        data: {
          employeeId: payload.personalData.employeeId,
          name: payload.personalData.fullName,
          semester: fixedReviewPeriodLabel,
          features: featureEnvelope,
        },
      })
    : await prisma.facultyProfile.create({
        data: {
          employeeId: payload.personalData.employeeId,
          name: payload.personalData.fullName,
          semester: fixedReviewPeriodLabel,
          createdByUserId: req.user!.id,
          features: featureEnvelope,
        },
      });

  const linkedDocuments = await attachExistingDocumentsToProfile(req.user!.id, profile.id, {
    fullName: payload.personalData.fullName,
    employeeId: payload.personalData.employeeId,
  });

  return res.status(existingProfile ? 200 : 201).json({
    profileId: profile.id,
    linkedDocuments,
  });
};

export const updateFaculty = async (req: Request, res: Response) => {
  const payload = facultyIngestionSchema.parse(req.body);
  const profile = await prisma.facultyProfile.findFirst({
    where: {
      id: req.params.profileId,
      ...(req.user!.role === UserRole.ADMIN ? {} : { createdByUserId: req.user!.id }),
    },
    select: { id: true },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Faculty profile not found' });
  }

  const updatedProfile = await prisma.facultyProfile.update({
    where: { id: profile.id },
    data: {
      employeeId: payload.personalData.employeeId,
      name: payload.personalData.fullName,
      semester: fixedReviewPeriodLabel,
      features: buildIdentityFeatureEnvelope(payload),
    },
  });

  const linkedDocuments = await attachExistingDocumentsToProfile(req.user!.id, updatedProfile.id, {
    fullName: payload.personalData.fullName,
    employeeId: payload.personalData.employeeId,
  });

  return res.json({
    profileId: updatedProfile.id,
    linkedDocuments,
    updated: true,
  });
};

export const featureSelection = async (_req: Request, res: Response) => {
  return res.status(503).json({
    error: 'Feature selection is inactive',
    details: 'The system is currently configured for data collection and storage for future model training.',
  });
};

export const compareModels = async (_req: Request, res: Response) => {
  return res.status(503).json({
    error: 'Model comparison is inactive',
    details: 'The system is currently configured for data collection and storage for future model training.',
  });
};

export const generatePredictions = async (_req: Request, res: Response) => {
  return res.status(503).json({
    error: 'Prediction is inactive',
    details: 'The system is currently configured for training-data collection rather than live prediction.',
  });
};

function buildIdentityFeatureEnvelope(payload: ReturnType<typeof facultyIngestionSchema.parse>) {
  return toPrismaJson({
    baselineData: {
      personalData: payload.personalData,
      promotionHistory: payload.promotionHistory,
    },
  });
}
