import { Request, Response } from 'express';
import { prisma } from '../config/db';
import {
  buildDraftPointSummary,
  extractBaselineDataFromProfileFeatures,
  extractCycleSubmissionData,
  summarizeDocumentMetadata,
} from '../utils/dashboard.utils';
import {
  buildTrainingAssessmentContext,
  getLatestEvaluatorBackedTrainingItem,
} from '../utils/dashboardSelection';
import { UploadPanelKey } from '../types';

function toCriterionReviewMap(criterionReviews: Array<{ panelKey: string; decision: string }>) {
  return new Map<UploadPanelKey, 'PENDING' | 'APPROVED' | 'DISAPPROVED'>(
    criterionReviews.map((review) => [review.panelKey as UploadPanelKey, review.decision as 'PENDING' | 'APPROVED' | 'DISAPPROVED']),
  );
}

export const getEmployeeDashboard = async (req: Request, res: Response) => {
  const [profiles, documents, trainingExamples] = await Promise.all([
    prisma.facultyProfile.findMany({
      where: { createdByUserId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            kind: true,
            createdAt: true,
            extractionMetadata: true,
          },
        },
        trainingItems: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            status: true,
            labelPromoted: true,
            datasetSplit: true,
            notes: true,
            rawInput: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        criterionReviews: {
          select: { panelKey: true, decision: true },
        },
      },
    }),
    prisma.uploadedDocument.findMany({
      where: { ownerUserId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        kind: true,
        createdAt: true,
        profileId: true,
        extractionMetadata: true,
      },
    }),
    prisma.trainingExample.findMany({
      where: { createdByUserId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        profileId: true,
        status: true,
        labelPromoted: true,
        datasetSplit: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const latestProfileWithAssessment = profiles.find((profile) => getLatestEvaluatorBackedTrainingItem(profile.trainingItems));
  const latestProfile = latestProfileWithAssessment ?? profiles[0] ?? null;
  const latestTrainingContext = latestProfile ? buildTrainingAssessmentContext(latestProfile.trainingItems)?.assessmentContext : undefined;
  const latestSubmissionRawInput = latestProfile?.trainingItems[0]?.rawInput;
  const draftPoints = buildDraftPointSummary(
    latestProfile
      ? {
          features: latestProfile.features,
          semester: latestProfile.semester,
        }
      : null,
    latestProfile?.documents ?? documents.filter((document) => document.profileId === latestProfile?.id),
    latestTrainingContext,
    latestSubmissionRawInput,
    latestProfile ? toCriterionReviewMap(latestProfile.criterionReviews) : undefined,
  );

  return res.json({
    summary: {
      profileCount: profiles.length,
      uploadCount: documents.length,
      trainingDraftCount: trainingExamples.length,
    },
    latestProfile: latestProfile
      ? {
          id: latestProfile.id,
        name: latestProfile.name,
        employeeId: latestProfile.employeeId,
        semester: latestProfile.semester,
        createdAt: latestProfile.createdAt,
        baselineData: extractBaselineDataFromProfileFeatures(latestProfile.features, latestProfile.name, latestProfile.employeeId),
        cycleData: extractCycleSubmissionData(latestProfile.features, latestSubmissionRawInput, latestProfile.semester),
        draftPoints,
      }
      : null,
    profiles: profiles.map((profile) => {
      const trainingContext = buildTrainingAssessmentContext(profile.trainingItems);
      const latestProfileSubmissionRawInput = profile.trainingItems[0]?.rawInput;

      return {
        id: profile.id,
        name: profile.name,
        employeeId: profile.employeeId,
        semester: profile.semester,
        createdAt: profile.createdAt,
        baselineData: extractBaselineDataFromProfileFeatures(profile.features, profile.name, profile.employeeId),
        cycleData: extractCycleSubmissionData(profile.features, latestProfileSubmissionRawInput, profile.semester),
        documentCount: profile.documents.length,
        trainingExampleCount: profile.trainingItems.length,
        draftPoints: buildDraftPointSummary(
          {
            features: profile.features,
            semester: profile.semester,
          },
          profile.documents,
          trainingContext?.assessmentContext,
          latestProfileSubmissionRawInput,
          toCriterionReviewMap(profile.criterionReviews),
        ),
      };
    }),
    uploads: documents.map((document) => ({
      id: document.id,
      profileId: document.profileId,
      originalName: document.originalName,
      mimeType: document.mimeType,
      kind: document.kind,
      createdAt: document.createdAt,
      metadata: summarizeDocumentMetadata(document.extractionMetadata),
    })),
    trainingExamples,
  });
};

export const getDashboardProfile = async (req: Request, res: Response) => {
  const profile = await prisma.facultyProfile.findUnique({
    where: { id: req.params.profileId },
    include: {
      predictions: true,
      documents: true,
      trainingItems: true,
      createdBy: { select: { id: true, fullName: true, email: true, role: true } },
    },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Faculty profile not found' });
  }

  return res.json(profile);
};

export const getEvaluatorQueue = async (_req: Request, res: Response) => {
  const profiles = await prisma.facultyProfile.findMany({
    take: 30,
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
      documents: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          kind: true,
          createdAt: true,
          extractionMetadata: true,
        },
      },
      trainingItems: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          status: true,
          labelPromoted: true,
          datasetSplit: true,
          notes: true,
          rawInput: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      criterionReviews: {
        select: {
          panelKey: true,
          decision: true,
          notes: true,
          updatedAt: true,
          reviewedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  return res.json({
    items: profiles.map((profile) => {
      const trainingContext = buildTrainingAssessmentContext(profile.trainingItems);
      const preferredTrainingItem = trainingContext?.selectedItem ?? null;
      const latestSubmissionRawInput = profile.trainingItems[0]?.rawInput;

      return {
        latestEvaluatorTrainingItem: preferredTrainingItem,
        id: profile.id,
        name: profile.name,
        employeeId: profile.employeeId,
        semester: profile.semester,
        createdAt: profile.createdAt,
        createdBy: profile.createdBy,
        cycleData: extractCycleSubmissionData(profile.features, latestSubmissionRawInput, profile.semester),
        draftPoints: buildDraftPointSummary(
          {
            features: profile.features,
            semester: profile.semester,
          },
          profile.documents,
          trainingContext?.assessmentContext,
          latestSubmissionRawInput,
          toCriterionReviewMap(profile.criterionReviews),
        ),
        criterionReviews: profile.criterionReviews,
        uploadLogs: profile.documents.map((document) => ({
          id: document.id,
          originalName: document.originalName,
          mimeType: document.mimeType,
          kind: document.kind,
          createdAt: document.createdAt,
          metadata: summarizeDocumentMetadata(document.extractionMetadata),
        })),
        trainingItems: profile.trainingItems.map((item) => ({
          ...item,
          evaluatorAssessment: buildTrainingAssessmentContext([item])?.assessmentContext.assessment ?? null,
        })),
        latestTrainingExampleId: preferredTrainingItem?.id ?? null,
        latestTrainingItem: preferredTrainingItem
          ? {
              ...preferredTrainingItem,
              evaluatorAssessment: trainingContext?.assessmentContext.assessment ?? null,
            }
          : null,
      };
    }),
  });
};
