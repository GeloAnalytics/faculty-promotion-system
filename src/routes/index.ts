import { Router, Request, Response } from 'express';
import authRoutes from './auth.route';
import referenceRoutes from './reference.route';
import configRoutes from './config.route';
import documentRoutes from './document.route';
import facultyRoutes from './faculty.route';
import trainingRoutes from './training.route';
import dashboardRoutes from './dashboard.route';
import adminRoutes from './admin.route';
import reviewRoutes from './review.route';
import accountsRoutes from './accounts.route';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { tqeReferenceRecords, guidelinePdfPath, isOcrReadyFlag, ocrConfig } from '../config/globals';
import { resolveEffectiveOcrProvider } from '../ocr';
import path from 'node:path';

const router = Router();

const DATABASE_PROBE_TIMEOUT_MS = 4000;

// A paused or unreachable database (e.g. a paused Supabase project) makes login
// and every other data endpoint fail, so the health check must exercise it
// rather than only reporting that the process is up.
async function probeDatabase(): Promise<{ status: 'ok' | 'unreachable'; detail?: string }> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('database probe timed out')), DATABASE_PROBE_TIMEOUT_MS)),
    ]);
    return { status: 'ok' };
  } catch (error) {
    // Deliberately generic: the raw driver error names the database user and host.
    return { status: 'unreachable', detail: error instanceof Error && /timed out/.test(error.message) ? 'timed out' : 'connection failed' };
  }
}

// Health check mapped as in server.ts. Also used as the daily keep-alive request
// (see crons in vercel.json) that stops an inactive free-tier database pausing.
router.get('/health', async (_req: Request, res: Response) => {
  const database = await probeDatabase();
  res.status(database.status === 'ok' ? 200 : 503).json({
    status: database.status === 'ok' ? 'ok' : 'degraded',
    database,
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
      imageOcrEffectiveProvider: resolveEffectiveOcrProvider(ocrConfig),
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

router.use('/training', trainingRoutes);
router.use('/admin', adminRoutes);
router.use('/review', reviewRoutes);
router.use('/accounts', accountsRoutes);

// Fix for dashboard paths
router.use('/', dashboardRoutes); // mounts /employee/dashboard, /evaluator/review-queue, /dashboard/:profileId

export default router;
