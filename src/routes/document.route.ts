import { Router } from 'express';
import { deleteDocument, extractDocuments, replaceDocument, viewDocument } from '../controllers/document.controller';
import { getSignedUploadUrl, registerUploadedDocument } from '../controllers/upload.controller';
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

// Direct-to-Supabase upload flow (bypasses Vercel body size limit)
router.post('/signed-upload-url', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), catchAsync(getSignedUploadUrl));
router.post('/register', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), catchAsync(registerUploadedDocument));

// Legacy server-side upload (still available, limited by Vercel 4.5 MB body cap)
router.post('/extract', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), upload.array('document', 10), catchAsync(extractDocuments));
router.post('/:documentId/replace', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), upload.single('document'), catchAsync(replaceDocument));
router.get('/:documentId/view', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.EVALUATOR, UserRole.ADMIN), catchAsync(viewDocument));
router.delete('/:documentId', requireAuth, requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), catchAsync(deleteDocument));

export default router;
