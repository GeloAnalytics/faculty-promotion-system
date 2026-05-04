import { Router } from 'express';
import { getUploadPanels } from '../controllers/reference.controller';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.get('/upload-panels', catchAsync(getUploadPanels));

export default router;
