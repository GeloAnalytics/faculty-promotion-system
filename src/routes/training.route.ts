import { Router } from 'express';
import { createTrainingExample, labelTrainingExample, getTrainingExamples, approveDraftScore } from '../controllers/training.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.post('/examples', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(createTrainingExample));
router.patch('/examples/:id/label', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(labelTrainingExample));
router.get('/examples', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(getTrainingExamples));
router.post('/profiles/:profileId/approve', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(approveDraftScore));

export default router;
