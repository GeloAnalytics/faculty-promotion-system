import { Router } from 'express';
import { listAccounts, deactivateAccount, reactivateAccount, deleteAccount } from '../controllers/accounts.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.use(requireAuth, requireRole(UserRole.EVALUATOR, UserRole.ADMIN));

router.get('/', catchAsync(listAccounts));
router.patch('/:userId/deactivate', catchAsync(deactivateAccount));
router.patch('/:userId/reactivate', catchAsync(reactivateAccount));
router.delete('/:userId', catchAsync(deleteAccount));

export default router;
