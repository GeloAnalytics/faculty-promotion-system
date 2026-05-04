import { Request, Response } from 'express';
import { prisma } from '../config/db';

export const getDatabaseOverview = async (_req: Request, res: Response) => {
  const [userCount, profileCount, documentCount, trainingCount, predictionCount] = await Promise.all([
    prisma.user.count(),
    prisma.facultyProfile.count(),
    prisma.uploadedDocument.count(),
    prisma.trainingExample.count(),
    prisma.prediction.count(),
  ]);

  const [recentUsers, recentProfiles, recentDocuments, recentTrainingExamples] = await Promise.all([
    prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.facultyProfile.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        employeeId: true,
        name: true,
        semester: true,
        createdAt: true,
      },
    }),
    prisma.uploadedDocument.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        kind: true,
        createdAt: true,
        profileId: true,
      },
    }),
    prisma.trainingExample.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        labelPromoted: true,
        datasetSplit: true,
        createdAt: true,
        profileId: true,
      },
    }),
  ]);

  return res.json({
    counts: {
      users: userCount,
      facultyProfiles: profileCount,
      uploadedDocuments: documentCount,
      trainingExamples: trainingCount,
      predictions: predictionCount,
    },
    recent: {
      users: recentUsers,
      facultyProfiles: recentProfiles,
      uploadedDocuments: recentDocuments,
      trainingExamples: recentTrainingExamples,
    },
  });
};
