import { Router } from 'express';
import { getDatabaseOverview } from '../controllers/admin.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.get('/database-overview', requireAuth, requireRole(UserRole.ADMIN), catchAsync(getDatabaseOverview));

export default router;
