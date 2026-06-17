import { Router } from 'express';
import { extractDocuments, deleteDocument, viewDocument } from '../controllers/document.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync';
import multer from 'multer';
import { MAX_UPLOAD_SIZE_BYTES } from '../config/env';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});

const router = Router();

router.post('/extract', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), upload.array('document', 10), catchAsync(extractDocuments));
router.get('/:documentId/view', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(viewDocument));
router.delete('/:documentId', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(deleteDocument));

export default router;
