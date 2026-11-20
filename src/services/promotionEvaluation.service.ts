import { prisma } from '../config/db';
import { CriterionDecision } from '@prisma/client';
import { buildDraftPointSummary, mergeFacultyRecordInput } from '../utils/dashboard.utils';
import { buildFeatureVectorFromDraftPoints, predictPromotion, type PromotionPrediction } from './model.service';
import type { UploadPanelKey } from '../types';

export interface PromotionEvaluation {
  profileId: string;
  prediction: PromotionPrediction;
  ruleBasedDraft: {
    weightedScore: number | null;
    scoreBracket: string | null;
    suggestedRank: string | null;
    status: string | null;
  };
  promoted: boolean;
}

/**
 * Computes the full promotion evaluation (ML advisory prediction + rule-based draft) for one
 * faculty profile from its real stored documents and criterion reviews, the same pipeline the
 * dashboard already uses. Shared by the live /predictions/generate endpoint
 * (src/controllers/faculty.controller.ts) and offline batch tooling
 * (scripts/synthetic/evaluate-promotions.ts) so both compute it identically.
 */
export async function evaluateProfilePromotion(
  profileId: string,
  options: { generatedByUserId?: string | null; persist?: boolean } = {},
): Promise<PromotionEvaluation> {
  const { generatedByUserId = null, persist = true } = options;

  const profile = await prisma.facultyProfile.findUnique({
    where: { id: profileId },
    include: {
      documents: { select: { extractionMetadata: true } },
      criterionReviews: { select: { panelKey: true, decision: true } },
    },
  });
  if (!profile) {
    throw new Error(`Faculty profile not found: ${profileId}`);
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
  // Same definition production already uses for evaluator-approved cases
  // (src/controllers/training.controller.ts: labelPromoted).
  const promoted = (draftPoints.promotionDraft.subrankIncrements ?? 0) > 0;

  if (persist) {
    await prisma.prediction.create({
      data: {
        profileId: profile.id,
        probability: prediction.probability,
        predictedClass: prediction.predictedClass,
        modelUsed: prediction.modelUsed,
        generatedByUserId,
      },
    });
    await prisma.facultyProfile.update({
      where: { id: profile.id },
      data: { promotion: promoted },
    });
  }

  return {
    profileId: profile.id,
    prediction,
    ruleBasedDraft: {
      weightedScore: draftPoints.scoreComputation.weightedScore,
      scoreBracket: draftPoints.scoreComputation.scoreBracket,
      suggestedRank: draftPoints.promotionDraft.suggestedRank,
      status: draftPoints.promotionDraft.status,
    },
    promoted,
  };
}
