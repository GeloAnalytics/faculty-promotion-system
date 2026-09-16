import { Router } from 'express';
import { getEmployeeUploadWorkflow, getFacultyOptions, getUploadPanels, getStorageConfig } from '../controllers/reference.controller';
import { catchAsync } from '../utils/catchAsync';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.get('/upload-panels', catchAsync(getUploadPanels));
router.get('/upload-workflow', catchAsync(getEmployeeUploadWorkflow));
router.get('/faculty-options', catchAsync(getFacultyOptions));
router.get('/storage', requireAuth, catchAsync(getStorageConfig));

export default router;
