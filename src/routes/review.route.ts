import { Router } from 'express';
import { updateReviewStatus } from '../controllers/review.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.patch(
  '/:profileId/status',
  requireAuth,
  requireRole(UserRole.EVALUATOR, UserRole.ADMIN),
  catchAsync(updateReviewStatus),
);

export default router;
