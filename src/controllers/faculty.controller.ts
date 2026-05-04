import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { facultyIngestionSchema } from '../validations/faculty.validation';
import { buildFeatureVector, findClosestTqeBenchmarks } from '../utils';
import { tqeReferenceRecords } from '../config/globals';
import { attachExistingDocumentsToProfile, toPrismaJson } from '../utils/document.utils';
import { TrainingExampleStatus } from '@prisma/client';

export const ingestFaculty = async (req: Request, res: Response) => {
  const payload = facultyIngestionSchema.parse(req.body);
  const features = buildFeatureVector(payload);
  const tqeBenchmarks = findClosestTqeBenchmarks(features, tqeReferenceRecords);

  const profile = await prisma.facultyProfile.create({
    data: {
      employeeId: payload.personalData.employeeId,
      name: payload.personalData.fullName,
      semester: payload.performanceReview.reviewPeriod,
      teachingQuality: payload.personalData.academicRank,
      promotion: null,
      createdByUserId: req.user!.id,
      features: toPrismaJson({
        rawInput: payload,
        engineeredFeatures: features,
        modelStatus: 'inactive',
        tqeBenchmarks,
      }),
    },
  });

  const trainingDraft = await prisma.trainingExample.create({
    data: {
      createdByUserId: req.user!.id,
      profileId: profile.id,
      status: TrainingExampleStatus.DRAFT,
      rawInput: toPrismaJson(payload),
      featureSnapshot: toPrismaJson(features),
    },
  });

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
