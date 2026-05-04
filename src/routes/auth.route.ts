import { Router } from 'express';
import { register, login, logout, me } from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.post('/register', catchAsync(register));
router.post('/login', catchAsync(login));
router.post('/logout', catchAsync(logout));
router.get('/me', requireAuth, catchAsync(me));

export default router;
