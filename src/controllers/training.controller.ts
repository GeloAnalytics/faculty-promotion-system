import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { trainingSubmissionSchema, trainingLabelSchema } from '../validations/training.validation';
import { TrainingExampleStatus } from '@prisma/client';
import { toPrismaJson } from '../utils/document.utils';
import { createEvaluatorAssessment, serializeEvaluatorAssessment } from '../utils/evaluator.utils';
import { buildDraftPointSummary } from '../utils/dashboard.utils';
import { TrainingExampleSubmission, UploadPanelKey } from '../types';

export const createTrainingExample = async (req: Request, res: Response) => {
  const payload = trainingSubmissionSchema.parse(req.body) as TrainingExampleSubmission;
  const trainingExample = await prisma.trainingExample.create({
    data: {
      createdByUserId: req.user!.id,
      profileId: payload.profileId,
      status: payload.labelPromoted === undefined ? TrainingExampleStatus.DRAFT : TrainingExampleStatus.LABELED,
      labelPromoted: payload.labelPromoted,
      labelSource: payload.labelSource,
      datasetSplit: payload.datasetSplit,
      notes: payload.notes,
      rawInput: toPrismaJson(payload.rawInput),
      featureSnapshot: toPrismaJson(payload.featureSnapshot),
      modelSnapshot: payload.modelSnapshot ? toPrismaJson(payload.modelSnapshot) : undefined,
    },
  });

  return res.status(201).json(trainingExample);
};

export const labelTrainingExample = async (req: Request, res: Response) => {
  const payload = trainingLabelSchema.parse(req.body);
  const evaluatorAssessment = createEvaluatorAssessment(payload.notes, payload.criterionScores);

  const trainingExample = await prisma.trainingExample.update({
    where: { id: req.params.id },
    data: {
      labelPromoted: payload.labelPromoted,
      labelSource: payload.labelSource,
      datasetSplit: payload.datasetSplit,
      notes: serializeEvaluatorAssessment(evaluatorAssessment),
      status: payload.validated ? TrainingExampleStatus.VALIDATED : TrainingExampleStatus.LABELED,
    },
  });

  return res.json(trainingExample);
};

export const getTrainingExamples = async (_req: Request, res: Response) => {
  const trainingExamples = await prisma.trainingExample.findMany({
    take: 50,
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, fullName: true, email: true, role: true } },
      profile: { select: { id: true, name: true, employeeId: true } },
    },
  });

  return res.json({ items: trainingExamples });
};

export const approveDraftScore = async (req: Request, res: Response) => {
  const profile = await prisma.facultyProfile.findUnique({
    where: { id: req.params.profileId },
    include: {
      documents: { select: { extractionMetadata: true } },
      trainingItems: { orderBy: { updatedAt: 'desc' }, take: 1 },
      criterionReviews: { select: { panelKey: true, decision: true } },
    },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Faculty profile not found' });
  }

  const criterionReviews = new Map<UploadPanelKey, 'PENDING' | 'APPROVED' | 'DISAPPROVED'>(
    profile.criterionReviews.map((review) => [review.panelKey as UploadPanelKey, review.decision]),
  );
  const draftPoints = buildDraftPointSummary(
    { features: profile.features, semester: profile.semester },
    profile.documents,
    undefined,
    undefined,
    criterionReviews,
  );
  const { scoreComputation, promotionDraft } = draftPoints;

  const criterionScores = Object.fromEntries(scoreComputation.panelScores.map((panel) => [panel.key, panel.usedScore]));

  const evaluatorAssessment = createEvaluatorAssessment(
    `Approved from the system's evidence-based draft score (weighted score ${scoreComputation.weightedScore ?? scoreComputation.rawTotal}).`,
    criterionScores,
  );

  const labelPromoted = (promotionDraft.subrankIncrements ?? 0) > 0;
  const existing = profile.trainingItems[0];

  const trainingExample = existing
    ? await prisma.trainingExample.update({
        where: { id: existing.id },
        data: {
          labelPromoted,
          labelSource: 'evaluator-approval',
          notes: serializeEvaluatorAssessment(evaluatorAssessment),
          status: TrainingExampleStatus.VALIDATED,
        },
      })
    : await prisma.trainingExample.create({
        data: {
          createdByUserId: req.user!.id,
          profileId: profile.id,
          status: TrainingExampleStatus.VALIDATED,
          labelPromoted,
          labelSource: 'evaluator-approval',
          notes: serializeEvaluatorAssessment(evaluatorAssessment),
          rawInput: toPrismaJson((profile.features as object) ?? {}),
          featureSnapshot: toPrismaJson(criterionScores),
        },
      });

  return res.json({ trainingExample, evaluatorAssessment });
};
