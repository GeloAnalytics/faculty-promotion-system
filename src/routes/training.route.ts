import { Router } from 'express';
import { createTrainingExample, labelTrainingExample, getTrainingExamples } from '../controllers/training.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.post('/examples', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(createTrainingExample));
router.patch('/examples/:id/label', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(labelTrainingExample));
router.get('/examples', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(getTrainingExamples));

export default router;
