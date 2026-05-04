import { Router } from 'express';
import { getTqeSummary, getUploadPanels, getGuidelines } from '../controllers/reference.controller';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.get('/tqe-summary', catchAsync(getTqeSummary));
router.get('/guidelines', catchAsync(getGuidelines));

export default router;
