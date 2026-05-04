import { Router, Request, Response } from 'express';
import authRoutes from './auth.route';
import referenceRoutes from './reference.route';
import configRoutes from './config.route';
import documentRoutes from './document.route';
import facultyRoutes from './faculty.route';
import trainingRoutes from './training.route';
import dashboardRoutes from './dashboard.route';
import adminRoutes from './admin.route';
import { env } from '../config/env';
import { tqeReferenceRecords, guidelinePdfPath, isOcrReadyFlag, ocrConfig } from '../config/globals';
import path from 'node:path';

const router = Router();

// Health check mapped as in server.ts
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    environment: env.NODE_ENV,
    thesisObjectives: [
      'data collection and preprocessing',
      'feature selection',
      'boosting model comparison',
      'evaluation metrics',
      'insight and policy recommendation generation',
    ],
    referenceData: {
      tqeCsvLoaded: tqeReferenceRecords.length > 0,
      tqeRows: tqeReferenceRecords.length,
      guidelinePdfLoaded: guidelinePdfPath !== null,
      guidelinePdfFileName: guidelinePdfPath ? path.basename(guidelinePdfPath) : null,
      imageOcrReady: isOcrReadyFlag,
      imageOcrProvider: ocrConfig.provider,
    },
    model: {
      status: 'inactive',
      reason: 'The system is currently focused on collecting and storing training data.',
    },
  });
});

router.use('/auth', authRoutes);
router.use('/reference', referenceRoutes);
router.use('/config', configRoutes);
router.use('/documents', documentRoutes);
router.use('/faculty', facultyRoutes);
router.use('/analysis', facultyRoutes);
router.use('/models', facultyRoutes);
router.use('/predictions', facultyRoutes);
router.use('/training', trainingRoutes);
router.use('/admin', adminRoutes);

// Fix for dashboard paths
router.use('/dashboard', dashboardRoutes); // this handles /api/dashboard/:profileId
router.use('/employee/dashboard', dashboardRoutes); // wait, dashboard route exports /employee, so router.use('/', dashboardRoutes)
router.use('/', dashboardRoutes); // mounts /employee, /evaluator/review-queue, /:profileId

export default router;
