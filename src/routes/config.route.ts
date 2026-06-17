import { Router } from 'express';
import { getEmployeeUploadWorkflow, getFacultyOptions, getUploadPanels } from '../controllers/reference.controller';
import { catchAsync } from '../utils/catchAsync';

const router = Router();

router.get('/upload-panels', catchAsync(getUploadPanels));
router.get('/upload-workflow', catchAsync(getEmployeeUploadWorkflow));
router.get('/faculty-options', catchAsync(getFacultyOptions));

export default router;
