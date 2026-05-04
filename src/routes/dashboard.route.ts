import { Router } from 'express';
import { getEmployeeDashboard, getDashboardProfile, getEvaluatorQueue } from '../controllers/dashboard.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.get('/employee/dashboard', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), catchAsync(getEmployeeDashboard));
router.get('/evaluator/review-queue', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(getEvaluatorQueue));
router.get('/dashboard/:profileId', requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(getDashboardProfile));

export default router;
