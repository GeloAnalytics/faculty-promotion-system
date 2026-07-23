import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { UserRole, AuditLogAction, ReviewStatus, CriterionDecision } from '@prisma/client';
import { uploadPanels } from '../uploadPanels';

export const updateReviewStatus = async (req: Request, res: Response) => {
  const { profileId } = req.params;
  const { status, notes } = req.body;

  if (!Object.values(ReviewStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid review status' });
  }

  const profile = await prisma.facultyProfile.findUnique({
    where: { id: profileId }
  });

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const updatedProfile = await prisma.facultyProfile.update({
    where: { id: profileId },
    data: { reviewStatus: status as ReviewStatus }
  });

  await prisma.auditLog.create({
    data: {
      action: AuditLogAction.STATUS_CHANGE,
      userId: req.user!.id,
      targetId: profileId,
      details: { oldStatus: profile.reviewStatus, newStatus: status, notes }
    }
  });

  return res.json({ success: true, profile: updatedProfile });
};

export const getCriterionReviews = async (req: Request, res: Response) => {
  const reviews = await prisma.criterionReview.findMany({
    where: { profileId: req.params.profileId },
    include: { reviewedBy: { select: { id: true, fullName: true } } },
  });

  return res.json({ items: reviews });
};

export const setCriterionReview = async (req: Request, res: Response) => {
  const { profileId, panelKey } = req.params;
  const { decision, notes } = req.body;

  if (!Object.values(CriterionDecision).includes(decision)) {
    return res.status(400).json({ error: 'Invalid review decision' });
  }

  if (!uploadPanels.some((panel) => panel.key === panelKey)) {
    return res.status(400).json({ error: 'Unknown criterion' });
  }

  const profile = await prisma.facultyProfile.findUnique({
    where: { id: profileId },
    select: { id: true },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Faculty profile not found' });
  }

  const sanitizedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

  const review = await prisma.criterionReview.upsert({
    where: { profileId_panelKey: { profileId, panelKey } },
    create: {
      profileId,
      panelKey,
      decision: decision as CriterionDecision,
      notes: sanitizedNotes,
      reviewedByUserId: req.user!.id,
    },
    update: {
      decision: decision as CriterionDecision,
      notes: sanitizedNotes,
      reviewedByUserId: req.user!.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: AuditLogAction.STATUS_CHANGE,
      userId: req.user!.id,
      targetId: profileId,
      details: { panelKey, decision, notes: sanitizedNotes },
    },
  });

  return res.json({ review });
};
