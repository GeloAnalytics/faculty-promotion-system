import { Router } from 'express';
import { ingestFaculty, updateFaculty, featureSelection, compareModels, generatePredictions } from '../controllers/faculty.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.post('/ingest', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), catchAsync(ingestFaculty));
router.patch('/:profileId', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), catchAsync(updateFaculty));

// Analysis routes inside faculty or separate, mapped here for simplicity
router.post('/analysis/feature-selection', requireAuth, catchAsync(featureSelection));
router.post('/models/compare', requireAuth, catchAsync(compareModels));
router.post('/predictions/generate', requireAuth, catchAsync(generatePredictions));

export default router;
