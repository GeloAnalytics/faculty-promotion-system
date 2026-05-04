import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { trainingSubmissionSchema, trainingLabelSchema } from '../validations/training.validation';
import { TrainingExampleStatus } from '@prisma/client';
import { toPrismaJson } from '../utils/document.utils';
import { createEvaluatorAssessment, serializeEvaluatorAssessment } from '../utils/evaluator.utils';
import { TrainingExampleSubmission } from '../types';

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
