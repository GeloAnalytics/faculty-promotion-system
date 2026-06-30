import { Router } from 'express';
import { updateReviewStatus } from '../controllers/review.controller';
import { requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

router.patch('/:profileId/status', requireRole([UserRole.EVALUATOR, UserRole.ADMIN]), updateReviewStatus);

export default router;
