import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { facultyIngestionSchema } from '../validations/faculty.validation';
import { attachExistingDocumentsToProfile, toPrismaJson } from '../utils/document.utils';
import { fixedReviewPeriodLabel } from '../constants/reviewCycle';
import { UserRole, CriterionDecision } from '@prisma/client';
import { buildDraftPointSummary, mergeFacultyRecordInput } from '../utils/dashboard.utils';
import {
  isPromotionModelAvailable,
  predictPromotion,
  buildFeatureVectorFromDraftPoints,
  getModelComparison,
  getFeatureImportance,
} from '../services/model.service';
import type { UploadPanelKey } from '../types';

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
    include: {
      documents: { select: { extractionMetadata: true } },
      criterionReviews: { select: { panelKey: true, decision: true } },
    },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Faculty profile not found' });
  }

  const criterionReviews = new Map<UploadPanelKey, CriterionDecision>(
    profile.criterionReviews.map((review) => [review.panelKey as UploadPanelKey, review.decision]),
  );
  const draftPoints = buildDraftPointSummary(
    { features: profile.features, semester: profile.semester },
    profile.documents,
    undefined,
    undefined,
    criterionReviews,
  );
  const { personalData } = mergeFacultyRecordInput(profile.features);

  const featureVector = buildFeatureVectorFromDraftPoints(
    draftPoints,
    {
      academicRank: typeof personalData.academicRank === 'string' ? personalData.academicRank : null,
      highestEducationalAttainment:
        typeof personalData.highestEducationalAttainment === 'string' ? personalData.highestEducationalAttainment : null,
      yearsInService: typeof personalData.yearsInService === 'number' ? personalData.yearsInService : null,
    },
    profile.documents.length,
  );

  const prediction = predictPromotion(featureVector);

  const saved = await prisma.prediction.create({
    data: {
      profileId: profile.id,
      probability: prediction.probability,
      predictedClass: prediction.predictedClass,
      modelUsed: prediction.modelUsed,
      generatedByUserId: req.user!.id,
    },
  });

  return res.json({
    prediction: {
      id: saved.id,
      probability: prediction.probability,
      predictedClass: prediction.predictedClass,
      modelUsed: prediction.modelUsed,
      topFactors: prediction.topFactors,
      createdAt: saved.createdAt,
    },
    // The rule-based draft (NBC 461 / DBM-JC evidence scoring) is the authoritative,
    // evaluator-reviewed basis for any promotion decision. The model output above is a
    // separate, explainable advisory signal; it never substitutes for the draft below.
    ruleBasedDraft: {
      weightedScore: draftPoints.scoreComputation.weightedScore,
      scoreBracket: draftPoints.scoreComputation.scoreBracket,
      suggestedRank: draftPoints.promotionDraft.suggestedRank,
      status: draftPoints.promotionDraft.status,
    },
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
