import { Router } from 'express';
import { register, login, logout, me, changePassword } from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { authRateLimiter } from '../middlewares/rateLimit.middleware';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.post('/register', authRateLimiter, catchAsync(register));
router.post('/login', authRateLimiter, catchAsync(login));
router.post('/logout', catchAsync(logout));
router.get('/me', requireAuth, catchAsync(me));
router.post('/change-password', requireAuth, authRateLimiter, catchAsync(changePassword));

export default router;
