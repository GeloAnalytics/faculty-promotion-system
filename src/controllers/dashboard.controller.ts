import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { buildDraftPointSummary, summarizeDocumentMetadata } from '../utils/dashboard.utils';
import { parseEvaluatorAssessment } from '../utils/evaluator.utils';

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
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            labelPromoted: true,
            datasetSplit: true,
            createdAt: true,
            updatedAt: true,
          },
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
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const latestProfile = profiles[0] ?? null;
  const draftPoints = buildDraftPointSummary(
    latestProfile
      ? {
          features: latestProfile.features,
          semester: latestProfile.semester,
        }
      : null,
    latestProfile?.documents ?? documents.filter((document) => document.profileId === latestProfile?.id),
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
          draftPoints,
        }
      : null,
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      employeeId: profile.employeeId,
      semester: profile.semester,
      createdAt: profile.createdAt,
      documentCount: profile.documents.length,
      trainingExampleCount: profile.trainingItems.length,
      draftPoints: buildDraftPointSummary(
        {
          features: profile.features,
          semester: profile.semester,
        },
        profile.documents,
      ),
    })),
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
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  return res.json({
    items: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      employeeId: profile.employeeId,
      semester: profile.semester,
      createdAt: profile.createdAt,
      createdBy: profile.createdBy,
      draftPoints: buildDraftPointSummary(
        {
          features: profile.features,
          semester: profile.semester,
        },
        profile.documents,
      ),
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
        evaluatorAssessment: parseEvaluatorAssessment(item.notes),
      })),
      latestTrainingExampleId: profile.trainingItems[0]?.id ?? null,
      latestTrainingItem: profile.trainingItems[0]
        ? {
            ...profile.trainingItems[0],
            evaluatorAssessment: parseEvaluatorAssessment(profile.trainingItems[0].notes),
          }
        : null,
    })),
  });
};
