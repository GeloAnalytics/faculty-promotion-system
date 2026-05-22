import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { facultyIngestionSchema } from '../validations/faculty.validation';
import { buildFeatureVector, findClosestTqeBenchmarks } from '../utils';
import { tqeReferenceRecords } from '../config/globals';
import { attachExistingDocumentsToProfile, toPrismaJson } from '../utils/document.utils';
import { TrainingExampleStatus, UserRole } from '@prisma/client';

export const ingestFaculty = async (req: Request, res: Response) => {
  const payload = facultyIngestionSchema.parse(req.body);
  const { features, tqeBenchmarks } = buildProfileArtifacts(payload);

  const profile = await prisma.facultyProfile.create({
    data: {
      employeeId: payload.personalData.employeeId,
      name: payload.personalData.fullName,
      semester: payload.performanceReview.reviewPeriod,
      teachingQuality: null,
      promotion: null,
      createdByUserId: req.user!.id,
      features: buildStoredFeatureEnvelope(payload, features, tqeBenchmarks),
    },
  });

  const trainingDraft = await upsertDraftTrainingItem(profile.id, req.user!.id, payload, features);

  const linkedDocuments = await attachExistingDocumentsToProfile(req.user!.id, profile.id, {
    fullName: payload.personalData.fullName,
    employeeId: payload.personalData.employeeId,
  });

  return res.status(201).json({
    profileId: profile.id,
    trainingExampleId: trainingDraft.id,
    linkedDocuments,
    features,
    model: {
      status: 'inactive',
      reason: 'Training data collection is active, but prediction is intentionally disabled.',
    },
    tqeBenchmarks,
  });
};

export const updateFaculty = async (req: Request, res: Response) => {
  const payload = facultyIngestionSchema.parse(req.body);
  const { features, tqeBenchmarks } = buildProfileArtifacts(payload);
  const profile = await prisma.facultyProfile.findFirst({
    where: {
      id: req.params.profileId,
      ...(req.user!.role === UserRole.ADMIN ? {} : { createdByUserId: req.user!.id }),
    },
    select: {
      id: true,
      createdByUserId: true,
    },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Faculty profile not found' });
  }

  const updatedProfile = await prisma.facultyProfile.update({
    where: { id: profile.id },
    data: {
      employeeId: payload.personalData.employeeId,
      name: payload.personalData.fullName,
      semester: payload.performanceReview.reviewPeriod,
      features: buildStoredFeatureEnvelope(payload, features, tqeBenchmarks),
    },
  });

  const trainingDraft = await upsertDraftTrainingItem(
    updatedProfile.id,
    profile.createdByUserId ?? req.user!.id,
    payload,
    features,
  );

  const linkedDocuments = await attachExistingDocumentsToProfile(req.user!.id, updatedProfile.id, {
    fullName: payload.personalData.fullName,
    employeeId: payload.personalData.employeeId,
  });

  return res.json({
    profileId: updatedProfile.id,
    trainingExampleId: trainingDraft.id,
    linkedDocuments,
    features,
    model: {
      status: 'inactive',
      reason: 'Training data collection is active, but prediction is intentionally disabled.',
    },
    tqeBenchmarks,
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

function buildProfileArtifacts(payload: ReturnType<typeof facultyIngestionSchema.parse>) {
  const features = buildFeatureVector(payload);
  const tqeBenchmarks = findClosestTqeBenchmarks(features, tqeReferenceRecords);

  return {
    features,
    tqeBenchmarks,
  };
}

function buildStoredFeatureEnvelope(
  payload: ReturnType<typeof facultyIngestionSchema.parse>,
  features: ReturnType<typeof buildFeatureVector>,
  tqeBenchmarks: ReturnType<typeof findClosestTqeBenchmarks>,
) {
  const baselineData = {
    personalData: payload.personalData,
    promotionHistory: payload.promotionHistory,
  };

  return toPrismaJson({
    baselineData,
    engineeredFeatures: features,
    modelStatus: 'inactive',
    tqeBenchmarks,
  });
}

async function upsertDraftTrainingItem(
  profileId: string,
  createdByUserId: string,
  payload: ReturnType<typeof facultyIngestionSchema.parse>,
  features: ReturnType<typeof buildFeatureVector>,
) {
  const existingDraft = await prisma.trainingExample.findFirst({
    where: {
      profileId,
      createdByUserId,
      status: TrainingExampleStatus.DRAFT,
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (existingDraft) {
    return prisma.trainingExample.update({
      where: { id: existingDraft.id },
      data: {
        rawInput: toPrismaJson(payload),
        featureSnapshot: toPrismaJson(features),
      },
    });
  }

  return prisma.trainingExample.create({
    data: {
      createdByUserId,
      profileId,
      status: TrainingExampleStatus.DRAFT,
      rawInput: toPrismaJson(payload),
      featureSnapshot: toPrismaJson(features),
    },
  });
}
