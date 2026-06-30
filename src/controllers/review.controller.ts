import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { UserRole, AuditLogAction, ReviewStatus } from '@prisma/client';

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
