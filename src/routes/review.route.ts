import { Router } from 'express';
import { updateReviewStatus, getCriterionReviews, setCriterionReview } from '../controllers/review.controller';
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

router.get(
  '/:profileId/criteria',
  requireAuth,
  requireRole(UserRole.EVALUATOR, UserRole.ADMIN),
  catchAsync(getCriterionReviews),
);

router.patch(
  '/:profileId/criteria/:panelKey',
  requireAuth,
  requireRole(UserRole.EVALUATOR, UserRole.ADMIN),
  catchAsync(setCriterionReview),
);

export default router;
