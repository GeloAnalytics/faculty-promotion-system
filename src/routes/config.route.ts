import { Router } from 'express';
import { getFacultyOptions, getUploadPanels } from '../controllers/reference.controller';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.get('/upload-panels', catchAsync(getUploadPanels));
router.get('/faculty-options', catchAsync(getFacultyOptions));

export default router;
