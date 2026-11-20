import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { facultyIngestionSchema } from '../validations/faculty.validation';
import { attachExistingDocumentsToProfile, toPrismaJson } from '../utils/document.utils';
import { fixedReviewPeriodLabel } from '../constants/reviewCycle';
import { UserRole } from '@prisma/client';
import { isPromotionModelAvailable, getModelComparison, getFeatureImportance } from '../services/model.service';
import { evaluateProfilePromotion } from '../services/promotionEvaluation.service';

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

// The three endpoints below are backed by a model trained offline on a synthetic,
// policy-grounded dataset (scripts/ml/train_models.py -> models/promotion-model.json). If that
// artifact has not been generated yet (e.g. a fresh checkout before running the training
// script), they report 503 rather than fabricate a result. See docs/model-training-results.md.

export const featureSelection = async (_req: Request, res: Response) => {
  if (!isPromotionModelAvailable()) {
    return res.status(503).json({
      error: 'Feature selection is inactive',
      details: 'No trained model artifact is present. Run `python scripts/ml/train_models.py` to generate models/promotion-model.json.',
    });
  }
  return res.json({ features: getFeatureImportance() });
};

export const compareModels = async (_req: Request, res: Response) => {
  const comparison = getModelComparison();
  if (!comparison) {
    return res.status(503).json({
      error: 'Model comparison is inactive',
      details: 'No trained model artifact is present. Run `python scripts/ml/train_models.py` to generate data/ml/model_comparison.json.',
    });
  }
  return res.json(comparison);
};

export const generatePredictions = async (req: Request, res: Response) => {
  if (!isPromotionModelAvailable()) {
    return res.status(503).json({
      error: 'Prediction is inactive',
      details: 'No trained model artifact is present. Run `python scripts/ml/train_models.py` to generate models/promotion-model.json.',
    });
  }

  const profileId = typeof req.body?.profileId === 'string' ? req.body.profileId : undefined;
  if (!profileId) {
    return res.status(400).json({ error: 'profileId is required' });
  }

  const isElevated = req.user!.role === UserRole.ADMIN || req.user!.role === UserRole.EVALUATOR;
  const profile = await prisma.facultyProfile.findFirst({
    where: { id: profileId, ...(isElevated ? {} : { createdByUserId: req.user!.id }) },
    select: { id: true },
  });
  if (!profile) {
    return res.status(404).json({ error: 'Faculty profile not found' });
  }

  const evaluation = await evaluateProfilePromotion(profileId, { generatedByUserId: req.user!.id });

  return res.json({
    prediction: {
      probability: evaluation.prediction.probability,
      predictedClass: evaluation.prediction.predictedClass,
      modelUsed: evaluation.prediction.modelUsed,
      topFactors: evaluation.prediction.topFactors,
    },
    // The rule-based draft (NBC 461 / DBM-JC evidence scoring) is the authoritative,
    // evaluator-reviewed basis for any promotion decision. The model output above is a
    // separate, explainable advisory signal; it never substitutes for the draft below.
    ruleBasedDraft: evaluation.ruleBasedDraft,
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
