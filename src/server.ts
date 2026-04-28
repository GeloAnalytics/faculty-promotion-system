import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import pdf from 'pdf-parse';
import {
  DocumentKind,
  Prisma,
  PrismaClient,
  TrainingExampleStatus,
  UserRole,
} from '@prisma/client';
import { z } from 'zod';
import {
  analyzeDocumentContent,
  buildFeatureVector,
  extractGuidelineReference,
  findClosestTqeBenchmarks,
  findGuidelinePdfPath,
  inferPromotionOutcome,
  loadTqeReferenceData,
  runThesisWorkflow,
  summarizeTqeReferenceData,
} from './utils';
import { uploadPanels } from './uploadPanels';
import { extractImageTextWithOcr, isOcrReady, type OcrConfig, type OcrProvider } from './ocr';
import type {
  FacultyIngestionPayload,
  SessionUser,
  TrainingExampleSubmission,
  UploadPanelDefinition,
  UploadDocumentKind,
} from './types';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AUTH_SECRET: z.string().min(32).default('development-auth-secret-change-me-123456'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(1),
  OCR_PROVIDER: z.enum(['windows', 'http', 'ocrspace', 'disabled']).default('windows'),
  OCR_API_URL: z.string().trim().optional(),
  OCR_API_KEY: z.string().trim().optional(),
  OCR_API_KEY_HEADER: z.string().trim().default('Authorization'),
  OCR_FILE_FIELD_NAME: z.string().trim().default('file'),
  OCR_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const env = envSchema.parse(process.env);
const isProduction = env.NODE_ENV === 'production';
const MAX_UPLOAD_SIZE_MB = 50;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const app = express();
const prisma = new PrismaClient();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});
const repoRoot = process.cwd();
const tqeCsvPath = path.join(repoRoot, 'TQE.csv');
const guidelinePdfPath = findGuidelinePdfPath(repoRoot);
const tqeReferenceRecords = loadTqeReferenceData(tqeCsvPath);
const tqeReferenceSummary = summarizeTqeReferenceData(tqeReferenceRecords);
const publicDir = path.join(repoRoot, 'public');
const ocrScriptPath = path.join(repoRoot, 'scripts', 'ocr-image.ps1');
const sessionCookieName = 'fps_session';
const ocrConfig: OcrConfig = {
  provider: env.OCR_PROVIDER as OcrProvider,
  scriptPath: ocrScriptPath,
  apiUrl: env.OCR_API_URL,
  apiKey: env.OCR_API_KEY,
  apiKeyHeader: env.OCR_API_KEY_HEADER,
  fileFieldName: env.OCR_FILE_FIELD_NAME,
  timeoutMs: env.OCR_TIMEOUT_MS,
};

const personalDataSchema = z.object({
  employeeId: z.string().trim().optional(),
  fullName: z.string().trim().min(1),
  age: z.number().nonnegative().optional(),
  sex: z.string().trim().optional(),
  civilStatus: z.string().trim().optional(),
  academicRank: z.string().trim().optional(),
  yearsInService: z.number().nonnegative().optional(),
  highestEducationalAttainment: z.string().trim().optional(),
  department: z.string().trim().optional(),
});

const performanceReviewSchema = z.object({
  reviewPeriod: z.string().trim().optional(),
  ipcrAverage: z.number().nonnegative().optional(),
  teachingEffectiveness: z.number().nonnegative().optional(),
  researchOutputs: z.number().nonnegative().optional(),
  extensionServices: z.number().nonnegative().optional(),
  administrativeExperience: z.number().nonnegative().optional(),
  professionalDevelopmentHours: z.number().nonnegative().optional(),
});

const promotionHistorySchema = z.object({
  cycle: z.string().trim().optional(),
  promoted: z.boolean(),
  previousRank: z.string().trim().optional(),
  newRank: z.string().trim().optional(),
});

const documentExtractionSchema = z.object({
  source: z.enum(['pdf', 'manual']),
  textLength: z.number().nonnegative(),
  detectedFields: z.array(z.string()),
  completenessScore: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  extractedScores: z.record(z.number()).default({}),
});

const facultyIngestionSchema = z.object({
  personalData: personalDataSchema,
  performanceReview: performanceReviewSchema,
  promotionHistory: z.array(promotionHistorySchema).default([]),
  documentExtraction: documentExtractionSchema.optional(),
  notes: z.string().trim().optional(),
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole).refine((value) => value === UserRole.EMPLOYEE || value === UserRole.EVALUATOR, {
    message: 'Registration role must be Employee or Evaluator',
  }),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const trainingSubmissionSchema = z.object({
  profileId: z.string().trim().optional(),
  datasetSplit: z.string().trim().optional(),
  labelPromoted: z.boolean().optional(),
  labelSource: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  rawInput: facultyIngestionSchema,
  featureSnapshot: z.record(z.number()),
  modelSnapshot: z
    .object({
      selectedFeatures: z.array(z.object({ feature: z.string(), importance: z.number(), rationale: z.string() })),
      modelResults: z.array(
        z.object({
          model: z.string(),
          metrics: z.object({
            accuracy: z.number(),
            precision: z.number(),
            recall: z.number(),
            f1Score: z.number(),
          }),
          promotionProbability: z.number(),
          predictedPromotion: z.boolean(),
          keyFactors: z.array(z.string()),
        }),
      ),
      bestModel: z.object({
        model: z.string(),
        metrics: z.object({
          accuracy: z.number(),
          precision: z.number(),
          recall: z.number(),
          f1Score: z.number(),
        }),
        promotionProbability: z.number(),
        predictedPromotion: z.boolean(),
        keyFactors: z.array(z.string()),
      }),
      recommendations: z.array(
        z.object({
          area: z.string(),
          recommendation: z.string(),
          evidence: z.string(),
        }),
      ),
    })
    .optional(),
});

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(attachSessionUser);
app.get('/employee', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'employee.html'));
});
app.get('/evaluator', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'evaluator.html'));
});
app.use(express.static(publicDir, { extensions: ['html'], maxAge: isProduction ? '1h' : 0 }));

app.get('/api/health', (_req: Request, res: Response) => {
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
      imageOcrReady: isOcrReady(ocrConfig),
      imageOcrProvider: ocrConfig.provider,
    },
    model: {
      status: 'inactive',
      reason: 'The system is currently focused on collecting and storing training data.',
    },
  });
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const payload = registerSchema.parse(req.body);
    const existingUser = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });

    if (existingUser) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(payload.password, passwordSalt);

    const user = await prisma.user.create({
      data: {
        fullName: payload.fullName,
        email: payload.email.toLowerCase(),
        passwordHash,
        passwordSalt,
        role: payload.role,
      },
    });

    const sessionUser = toSessionUser(user);
    setSessionCookie(res, sessionUser);
    return res.status(201).json({ user: sessionUser, homePath: getHomePathForRole(sessionUser.role) });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });

    if (!user || !user.accountActive || !verifyPassword(payload.password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionUser = toSessionUser(user);
    setSessionCookie(res, sessionUser);
    return res.json({ user: sessionUser, homePath: getHomePathForRole(sessionUser.role) });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.status(204).send();
});

app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    user: req.user,
    homePath: getHomePathForRole(req.user!.role),
  });
});

app.get('/api/reference/tqe-summary', (_req: Request, res: Response) => {
  res.json({
    source: 'TQE.csv',
    summary: tqeReferenceSummary,
    usage:
      'This dataset is currently used as a teaching-quality and score-distribution reference, not as the final promotion outcome dataset.',
  });
});

app.get('/api/config/upload-panels', (_req: Request, res: Response) => {
  res.json({
    modelStatus: 'inactive',
    panels: uploadPanels,
  });
});

app.get('/api/reference/guidelines', async (_req: Request, res: Response) => {
  if (!guidelinePdfPath) {
    return res.status(404).json({
      error: 'Guideline PDF not found in repository root',
    });
  }

  try {
    const data = await pdf(fs.readFileSync(guidelinePdfPath));
    return res.json({
      source: path.basename(guidelinePdfPath),
      guideline: extractGuidelineReference(data.text, path.basename(guidelinePdfPath)),
    });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.post(
  '/api/documents/extract',
  requireRole(UserRole.EMPLOYEE, UserRole.ADMIN),
  upload.array('document', 10),
  async (req: Request, res: Response) => {
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    if (!uploadedFiles.length) {
      return res.status(400).json({ error: 'No documents uploaded' });
    }

    try {
      const kind = parseDocumentKind(req.body.kind);
      const panelKey = parseUploadPanelKey(req.body.panelKey);
      const panelDefinition = findUploadPanelDefinition(panelKey);
      const requestedProfileId =
        typeof req.body.profileId === 'string' && req.body.profileId.trim() ? req.body.profileId : null;
      const results: ProcessedUploadResult[] = [];
      const failures: Array<{ originalName: string; error: string }> = [];

      for (const file of uploadedFiles) {
        try {
          const result = await processUploadedDocument({
            file,
            ownerUserId: req.user!.id,
            requestedProfileId,
            kind,
            panelKey,
            panelTitle: panelDefinition.title,
            ocrConfig,
          });
          results.push(result);
        } catch (error) {
          failures.push({
            originalName: file.originalname,
            error: describeUploadProcessingError(error),
          });
        }
      }

      if (!results.length) {
        return res.status(400).json({
          error: failures[0]?.error ?? 'No documents could be processed',
          failures,
        });
      }

      return res.json({
        fileType: results[0].fileType,
        documentId: results[0].documentId,
        panelKey,
        profileId: results[0].profileId,
        linkage: results[0].linkage,
        textPreview: results[0].textPreview,
        analysis: results[0].analysis,
        results,
        failures,
        summary: {
          requestedCount: uploadedFiles.length,
          successCount: results.length,
          failureCount: failures.length,
        },
      });
    } catch (error) {
      return handleRequestError(res, error);
    }
  },
);

app.delete(
  '/api/documents/:documentId',
  requireRole(UserRole.EMPLOYEE, UserRole.EVALUATOR, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const document = await prisma.uploadedDocument.findUnique({
        where: { id: req.params.documentId },
        select: {
          id: true,
          ownerUserId: true,
          originalName: true,
        },
      });

      if (!document) {
        return res.status(404).json({ error: 'Uploaded document not found' });
      }

      if (req.user!.role === UserRole.EMPLOYEE && document.ownerUserId !== req.user!.id) {
        return res.status(403).json({ error: 'You can only delete your own uploaded documents' });
      }

      await prisma.uploadedDocument.delete({
        where: { id: document.id },
      });

      return res.json({
        deleted: true,
        documentId: document.id,
        originalName: document.originalName,
        message: `${document.originalName} was deleted successfully`,
      });
    } catch (error) {
      return handleRequestError(res, error);
    }
  },
);

app.post('/api/faculty/ingest', requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const payload = facultyIngestionSchema.parse(req.body);
    const features = buildFeatureVector(payload);
    const tqeBenchmarks = findClosestTqeBenchmarks(features, tqeReferenceRecords);

    const profile = await prisma.facultyProfile.create({
      data: {
        employeeId: payload.personalData.employeeId,
        name: payload.personalData.fullName,
        semester: payload.performanceReview.reviewPeriod,
        teachingQuality: payload.personalData.academicRank,
        promotion: null,
        createdByUserId: req.user!.id,
        features: toPrismaJson({
          rawInput: payload,
          engineeredFeatures: features,
          modelStatus: 'inactive',
          tqeBenchmarks,
        }),
      },
    });

    const trainingDraft = await prisma.trainingExample.create({
      data: {
        createdByUserId: req.user!.id,
        profileId: profile.id,
        status: TrainingExampleStatus.DRAFT,
        rawInput: toPrismaJson(payload),
        featureSnapshot: toPrismaJson(features),
      },
    });

    const linkedDocuments = await attachExistingDocumentsToProfile(req.user!.id, profile.id, {
      fullName: payload.personalData.fullName,
      employeeId: payload.personalData.employeeId,
    });

    return res.status(201).json({
      profileId: profile.id,
      trainingExampleId: trainingDraft.id,
      linkedDocuments,
      features,
      model: {
        status: 'inactive',
        reason: 'Training data collection is active, but prediction is intentionally disabled.',
      },
      tqeBenchmarks,
    });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.post('/api/analysis/feature-selection', requireAuth, async (req: Request, res: Response) => {
  return res.status(503).json({
    error: 'Feature selection is inactive',
    details: 'The system is currently configured for data collection and storage for future model training.',
  });
});

app.post('/api/models/compare', requireAuth, async (req: Request, res: Response) => {
  return res.status(503).json({
    error: 'Model comparison is inactive',
    details: 'The system is currently configured for data collection and storage for future model training.',
  });
});

app.post('/api/predictions/generate', requireAuth, async (req: Request, res: Response) => {
  return res.status(503).json({
    error: 'Prediction is inactive',
    details: 'The system is currently configured for training-data collection rather than live prediction.',
  });
});

app.post('/api/training/examples', requireRole(UserRole.EVALUATOR, UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const payload = trainingSubmissionSchema.parse(req.body) as TrainingExampleSubmission;
    const trainingExample = await prisma.trainingExample.create({
      data: {
        createdByUserId: req.user!.id,
        profileId: payload.profileId,
        status: payload.labelPromoted === undefined ? TrainingExampleStatus.DRAFT : TrainingExampleStatus.LABELED,
        labelPromoted: payload.labelPromoted,
        labelSource: payload.labelSource,
        datasetSplit: payload.datasetSplit,
        notes: payload.notes,
        rawInput: toPrismaJson(payload.rawInput),
        featureSnapshot: toPrismaJson(payload.featureSnapshot),
        modelSnapshot: payload.modelSnapshot ? toPrismaJson(payload.modelSnapshot) : undefined,
      },
    });

    return res.status(201).json(trainingExample);
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.patch(
  '/api/training/examples/:id/label',
  requireRole(UserRole.EVALUATOR, UserRole.ADMIN),
  async (req: Request, res: Response) => {
    try {
      const payload = z
        .object({
          labelPromoted: z.boolean(),
          labelSource: z.string().trim().optional(),
          datasetSplit: z.string().trim().optional(),
          notes: z.string().trim().optional(),
          criterionScores: z.record(z.coerce.number().min(0)).optional(),
          validated: z.boolean().optional(),
        })
        .parse(req.body);
      const evaluatorAssessment = createEvaluatorAssessment(payload.notes, payload.criterionScores);

      const trainingExample = await prisma.trainingExample.update({
        where: { id: req.params.id },
        data: {
          labelPromoted: payload.labelPromoted,
          labelSource: payload.labelSource,
          datasetSplit: payload.datasetSplit,
          notes: serializeEvaluatorAssessment(evaluatorAssessment),
          status: payload.validated ? TrainingExampleStatus.VALIDATED : TrainingExampleStatus.LABELED,
        },
      });

      return res.json(trainingExample);
    } catch (error) {
      return handleRequestError(res, error);
    }
  },
);

app.get(
  '/api/training/examples',
  requireRole(UserRole.EVALUATOR, UserRole.ADMIN),
  async (_req: Request, res: Response) => {
    try {
      const trainingExamples = await prisma.trainingExample.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, fullName: true, email: true, role: true } },
          profile: { select: { id: true, name: true, employeeId: true } },
        },
      });

      return res.json({ items: trainingExamples });
    } catch (error) {
      return handleRequestError(res, error);
    }
  },
);

app.get('/api/admin/database-overview', requireRole(UserRole.EVALUATOR, UserRole.ADMIN), async (_req: Request, res: Response) => {
  try {
    const [userCount, profileCount, documentCount, trainingCount, predictionCount] = await Promise.all([
      prisma.user.count(),
      prisma.facultyProfile.count(),
      prisma.uploadedDocument.count(),
      prisma.trainingExample.count(),
      prisma.prediction.count(),
    ]);

    const [recentUsers, recentProfiles, recentDocuments, recentTrainingExamples] = await Promise.all([
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.facultyProfile.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          employeeId: true,
          name: true,
          semester: true,
          createdAt: true,
        },
      }),
      prisma.uploadedDocument.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          kind: true,
          createdAt: true,
          profileId: true,
        },
      }),
      prisma.trainingExample.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          labelPromoted: true,
          datasetSplit: true,
          createdAt: true,
          profileId: true,
        },
      }),
    ]);

    return res.json({
      counts: {
        users: userCount,
        facultyProfiles: profileCount,
        uploadedDocuments: documentCount,
        trainingExamples: trainingCount,
        predictions: predictionCount,
      },
      recent: {
        users: recentUsers,
        facultyProfiles: recentProfiles,
        uploadedDocuments: recentDocuments,
        trainingExamples: recentTrainingExamples,
      },
    });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.get('/api/employee/dashboard', requireRole(UserRole.EMPLOYEE, UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const [profiles, documents, trainingExamples] = await Promise.all([
      prisma.facultyProfile.findMany({
        where: { createdByUserId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        include: {
          documents: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              kind: true,
              createdAt: true,
              extractionMetadata: true,
            },
          },
          trainingItems: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              labelPromoted: true,
              datasetSplit: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      prisma.uploadedDocument.findMany({
        where: { ownerUserId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          kind: true,
          createdAt: true,
          profileId: true,
          extractionMetadata: true,
        },
      }),
      prisma.trainingExample.findMany({
        where: { createdByUserId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          profileId: true,
          status: true,
          labelPromoted: true,
          datasetSplit: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const latestProfile = profiles[0] ?? null;
    const draftPoints = buildDraftPointSummary(
      latestProfile
        ? {
            features: latestProfile.features,
            semester: latestProfile.semester,
          }
        : null,
      latestProfile?.documents ?? documents.filter((document) => document.profileId === latestProfile?.id),
    );

    return res.json({
      summary: {
        profileCount: profiles.length,
        uploadCount: documents.length,
        trainingDraftCount: trainingExamples.length,
      },
      latestProfile: latestProfile
        ? {
            id: latestProfile.id,
            name: latestProfile.name,
            employeeId: latestProfile.employeeId,
            semester: latestProfile.semester,
            createdAt: latestProfile.createdAt,
            draftPoints,
          }
        : null,
      profiles: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        employeeId: profile.employeeId,
        semester: profile.semester,
        createdAt: profile.createdAt,
        documentCount: profile.documents.length,
        trainingExampleCount: profile.trainingItems.length,
        draftPoints: buildDraftPointSummary(
          {
            features: profile.features,
            semester: profile.semester,
          },
          profile.documents,
        ),
      })),
      uploads: documents.map((document) => ({
        id: document.id,
        profileId: document.profileId,
        originalName: document.originalName,
        mimeType: document.mimeType,
        kind: document.kind,
        createdAt: document.createdAt,
        metadata: summarizeDocumentMetadata(document.extractionMetadata),
      })),
      trainingExamples,
    });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.get('/api/dashboard/:profileId', requireRole(UserRole.EVALUATOR, UserRole.ADMIN), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.facultyProfile.findUnique({
      where: { id: req.params.profileId },
      include: {
        predictions: true,
        documents: true,
        trainingItems: true,
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Faculty profile not found' });
    }

    return res.json(profile);
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.get('/api/evaluator/review-queue', requireRole(UserRole.EVALUATOR, UserRole.ADMIN), async (_req: Request, res: Response) => {
  try {
    const profiles = await prisma.facultyProfile.findMany({
      take: 30,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            kind: true,
            createdAt: true,
            extractionMetadata: true,
          },
        },
        trainingItems: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            status: true,
            labelPromoted: true,
            datasetSplit: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return res.json({
      items: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        employeeId: profile.employeeId,
        semester: profile.semester,
        createdAt: profile.createdAt,
        createdBy: profile.createdBy,
        draftPoints: buildDraftPointSummary(
          {
            features: profile.features,
            semester: profile.semester,
          },
          profile.documents,
        ),
        uploadLogs: profile.documents.map((document) => ({
          id: document.id,
          originalName: document.originalName,
          mimeType: document.mimeType,
          kind: document.kind,
          createdAt: document.createdAt,
          metadata: summarizeDocumentMetadata(document.extractionMetadata),
        })),
        trainingItems: profile.trainingItems.map((item) => ({
          ...item,
          evaluatorAssessment: parseEvaluatorAssessment(item.notes),
        })),
        latestTrainingExampleId: profile.trainingItems[0]?.id ?? null,
        latestTrainingItem: profile.trainingItems[0]
          ? {
              ...profile.trainingItems[0],
              evaluatorAssessment: parseEvaluatorAssessment(profile.trainingItems[0].notes),
            }
          : null,
      })),
    });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

const server = app.listen(env.PORT, () => {
  console.log(`Faculty promotion system listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

async function attachSessionUser(req: Request, _res: Response, next: NextFunction) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return next();
  }

  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[sessionCookieName];

  if (!sessionToken) {
    return next();
  }

  const sessionUser = verifySessionToken(sessionToken);
  if (sessionUser) {
    req.user = sessionUser;
  }

  return next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return next();
}

function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return res.status(403).json({ error: 'You do not have access to this workspace' });
    }

    return next();
  };
}

type ProfileLinkCandidate = {
  id: string;
  name: string;
  employeeId: string | null;
};

type ProfileLinkResult = {
  profileId: string | null;
  matchedBy: 'explicit' | 'filename' | 'unmatched';
  matchedName: string | null;
  matchedEmployeeId: string | null;
};

async function resolveUploadProfileLink(
  ownerUserId: string,
  originalName: string,
  requestedProfileId: string | null,
): Promise<ProfileLinkResult> {
  if (requestedProfileId) {
    const explicitProfile = await prisma.facultyProfile.findFirst({
      where: {
        id: requestedProfileId,
        createdByUserId: ownerUserId,
      },
      select: {
        id: true,
        name: true,
        employeeId: true,
      },
    });

    if (explicitProfile) {
      return {
        profileId: explicitProfile.id,
        matchedBy: 'explicit',
        matchedName: explicitProfile.name,
        matchedEmployeeId: explicitProfile.employeeId ?? null,
      };
    }
  }

  const profiles = await prisma.facultyProfile.findMany({
    where: {
      createdByUserId: ownerUserId,
    },
    select: {
      id: true,
      name: true,
      employeeId: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const matchedProfile = findBestMatchingProfile(profiles, originalName);
  if (!matchedProfile) {
    return {
      profileId: null,
      matchedBy: 'unmatched',
      matchedName: null,
      matchedEmployeeId: null,
    };
  }

  return {
    profileId: matchedProfile.id,
    matchedBy: 'filename',
    matchedName: matchedProfile.name,
    matchedEmployeeId: matchedProfile.employeeId ?? null,
  };
}

async function attachExistingDocumentsToProfile(
  ownerUserId: string,
  profileId: string,
  profileData: { fullName: string; employeeId?: string },
) {
  const pendingDocuments = await prisma.uploadedDocument.findMany({
    where: {
      ownerUserId,
      profileId: null,
    },
    select: {
      id: true,
      originalName: true,
    },
  });

  const matchedDocuments = pendingDocuments.filter(
    (document) => scoreProfileFilename(profileData.fullName, profileData.employeeId, document.originalName) > 0,
  );

  if (!matchedDocuments.length) {
    return {
      count: 0,
      documentIds: [],
      matchedFileNames: [],
    };
  }

  await prisma.uploadedDocument.updateMany({
    where: {
      id: {
        in: matchedDocuments.map((document) => document.id),
      },
    },
    data: {
      profileId,
    },
  });

  return {
    count: matchedDocuments.length,
    documentIds: matchedDocuments.map((document) => document.id),
    matchedFileNames: matchedDocuments.map((document) => document.originalName),
  };
}

function findBestMatchingProfile(profiles: ProfileLinkCandidate[], originalName: string) {
  let bestMatch: ProfileLinkCandidate | null = null;
  let bestScore = 0;

  for (const profile of profiles) {
    const score = scoreProfileFilename(profile.name, profile.employeeId ?? undefined, originalName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = profile;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

function scoreProfileFilename(fullName: string, employeeId: string | undefined, originalName: string) {
  const normalizedFileName = normalizeForMatch(path.parse(originalName).name);
  const fileTokens = new Set(tokenizeForMatch(originalName));
  const nameTokens = tokenizeForMatch(fullName);

  let score = 0;

  if (employeeId) {
    const normalizedEmployeeId = normalizeForMatch(employeeId);
    if (normalizedEmployeeId && normalizedFileName.includes(normalizedEmployeeId)) {
      score += 100;
    }
  }

  if (!nameTokens.length) {
    return score;
  }

  const matchedNameTokenCount = nameTokens.filter((token) => fileTokens.has(token)).length;
  if (matchedNameTokenCount === nameTokens.length) {
    score += 50 + matchedNameTokenCount;
  } else if (matchedNameTokenCount >= Math.max(2, nameTokens.length - 1)) {
    score += 15 + matchedNameTokenCount;
  }

  return score;
}

function tokenizeForMatch(value: string) {
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token.length >= 2);
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDocumentKind(input: unknown): DocumentKind {
  const normalized = typeof input === 'string' ? input.toUpperCase() : 'REQUIREMENT';
  if (normalized === 'GUIDELINE') {
    return DocumentKind.GUIDELINE;
  }
  if (normalized === 'TRAINING_SUPPORT') {
    return DocumentKind.TRAINING_SUPPORT;
  }
  return DocumentKind.REQUIREMENT;
}

function parseUploadPanelKey(input: unknown): UploadPanelDefinition['key'] {
  const value = typeof input === 'string' ? input : '';
  const matched = uploadPanels.find((panel) => panel.key === value);
  return matched ? matched.key : uploadPanels[0].key;
}

function findUploadPanelDefinition(panelKey: UploadPanelDefinition['key']) {
  return uploadPanels.find((panel) => panel.key === panelKey) ?? uploadPanels[0];
}

async function processUploadedDocument(args: {
  file: Express.Multer.File;
  ownerUserId: string;
  requestedProfileId: string | null;
  kind: DocumentKind;
  panelKey: UploadPanelDefinition['key'];
  panelTitle: string;
  ocrConfig: OcrConfig;
}): Promise<ProcessedUploadResult> {
  const { file, ownerUserId, requestedProfileId, kind, panelKey, panelTitle, ocrConfig } = args;
  const mimeType = file.mimetype.toLowerCase();
  const fileName = file.originalname;
  const isCsv = /\.csv$/i.test(fileName);
  const isSpreadsheet = /\.(xlsx|xls)$/i.test(fileName);

  if (isSpreadsheet || isCsv) {
    throw new Error('Spreadsheet and CSV uploads are no longer supported in the criterion-based upload panels');
  }

  const linkage = await resolveUploadProfileLink(ownerUserId, fileName, requestedProfileId);
  const profileId = linkage.profileId;

  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    const data = await pdf(file.buffer);
    const analysis = analyzeDocumentContent(data.text, panelKey, 'pdf');

    const savedDocument = await prisma.uploadedDocument.create({
      data: {
        ownerUserId,
        profileId,
        kind,
        originalName: fileName,
        mimeType: file.mimetype,
        extractedText: data.text,
        extractionMetadata: toPrismaJson({
          panelKey,
          panelTitle,
          storedForTraining: true,
          analysis,
          linkage,
        }),
      },
    });

    return {
      originalName: fileName,
      fileType: 'pdf',
      documentId: savedDocument.id,
      panelKey,
      profileId,
      linkage,
      textPreview: data.text.slice(0, 1000),
      analysis,
    };
  }

  if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tif|tiff)$/i.test(fileName)) {
    const ocrResult = await extractImageTextWithOcr(file.buffer, fileName, ocrConfig);
    const extractedText = ocrResult.text.trim();
    const analysis = analyzeDocumentContent(extractedText, panelKey, 'image');

    const savedDocument = await prisma.uploadedDocument.create({
      data: {
        ownerUserId,
        profileId,
        kind,
        originalName: fileName,
        mimeType: file.mimetype,
        extractedText,
        extractionMetadata: toPrismaJson({
          panelKey,
          panelTitle,
          storedForTraining: true,
          ocr: {
            provider: ocrResult.provider,
            lineCount: ocrResult.lineCount,
          },
          analysis,
          linkage,
        }),
      },
    });

    return {
      originalName: fileName,
      fileType: 'image',
      documentId: savedDocument.id,
      panelKey,
      profileId,
      linkage,
      textPreview: extractedText.slice(0, 1000),
      analysis,
    };
  }

  throw new Error('Unsupported document type');
}

function describeUploadProcessingError(error: unknown) {
  if (error instanceof z.ZodError) {
    return 'Invalid request payload';
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return 'Database request failed';
  }

  if (error instanceof Error) {
    if (/powershell|ocr/i.test(error.message)) {
      return 'OCR processing failed';
    }
    return error.message;
  }

  return 'Unexpected server error';
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function toSessionUser(user: { id: string; email: string; fullName: string; role: UserRole }): SessionUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

function getHomePathForRole(role: UserRole | SessionUser['role']) {
  return role === UserRole.EVALUATOR ? '/evaluator' : '/employee';
}

type ParsedDocumentMetadata = {
  panelKey: string | null;
  panelTitle: string | null;
  analysisSummary: string | null;
  extractedScores: Record<string, number>;
  completenessScore: number | null;
  qualityScore: number | null;
  linkage: string | null;
};

type ProcessedUploadResult = {
  originalName: string;
  fileType: 'pdf' | 'image';
  documentId: string;
  panelKey: UploadPanelDefinition['key'];
  profileId: string | null;
  linkage: Awaited<ReturnType<typeof resolveUploadProfileLink>>;
  textPreview: string;
  analysis: ReturnType<typeof analyzeDocumentContent>;
};

type EvaluatorAssessment = {
  freeformNotes: string;
  criterionScores: Partial<Record<UploadPanelDefinition['key'], number>>;
  totalScore: number;
};

function summarizeDocumentMetadata(value: unknown): ParsedDocumentMetadata {
  const metadata = readJsonObject(value);
  const analysis = readJsonObject(metadata.analysis);
  const extractedScores = readNumberRecord(analysis.extractedScores);
  const linkage = readJsonObject(metadata.linkage);

  return {
    panelKey: typeof metadata.panelKey === 'string' ? metadata.panelKey : null,
    panelTitle: typeof metadata.panelTitle === 'string' ? metadata.panelTitle : null,
    analysisSummary: typeof analysis.summary === 'string' ? analysis.summary : null,
    extractedScores,
    completenessScore: readOptionalNumber(analysis.completenessScore),
    qualityScore: readOptionalNumber(analysis.qualityScore),
    linkage:
      typeof linkage.matchedBy === 'string'
        ? `${linkage.matchedBy}${typeof linkage.matchedName === 'string' ? `: ${linkage.matchedName}` : ''}`
        : null,
  };
}

function createEvaluatorAssessment(notes: string | undefined, criterionScores: Record<string, number> | undefined): EvaluatorAssessment {
  const sanitizedScores = sanitizeCriterionScores(criterionScores ?? {});
  return {
    freeformNotes: notes ?? '',
    criterionScores: sanitizedScores,
    totalScore: roundScore(
      Object.values(sanitizedScores).reduce((sum, value) => {
        return sum + value;
      }, 0),
    ),
  };
}

function sanitizeCriterionScores(input: Record<string, number>) {
  const sanitized: Partial<Record<UploadPanelDefinition['key'], number>> = {};
  const sharedCapTotals = new Map<string, number>();

  for (const panel of uploadPanels) {
    const value = input[panel.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }

    const roundedValue = roundScore(Math.max(0, Math.min(value, panel.maxScore)));
    sanitized[panel.key] = roundedValue;

    if (panel.sharedCapKey) {
      sharedCapTotals.set(panel.sharedCapKey, (sharedCapTotals.get(panel.sharedCapKey) ?? 0) + roundedValue);
    }
  }

  for (const panel of uploadPanels) {
    if (!panel.sharedCapKey || !panel.sharedCapMaxScore) {
      continue;
    }

    const total = sharedCapTotals.get(panel.sharedCapKey) ?? 0;
    if (total > panel.sharedCapMaxScore) {
      throw new Error(`${panel.sharedCapLabel ?? 'Shared criterion'} cannot exceed ${panel.sharedCapMaxScore} points`);
    }
  }

  return sanitized;
}

function parseEvaluatorAssessment(value: unknown): EvaluatorAssessment {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      freeformNotes: '',
      criterionScores: {},
      totalScore: 0,
    };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const scoreRecord = readNumberRecord(parsed.criterionScores);
    const sanitizedScores = sanitizeCriterionScores(scoreRecord);
    const totalScore =
      typeof parsed.totalScore === 'number' && Number.isFinite(parsed.totalScore)
        ? roundScore(parsed.totalScore)
        : roundScore(Object.values(sanitizedScores).reduce((sum, score) => sum + score, 0));

    return {
      freeformNotes: typeof parsed.freeformNotes === 'string' ? parsed.freeformNotes : '',
      criterionScores: sanitizedScores,
      totalScore,
    };
  } catch {
    return {
      freeformNotes: value,
      criterionScores: {},
      totalScore: 0,
    };
  }
}

function serializeEvaluatorAssessment(assessment: EvaluatorAssessment) {
  return JSON.stringify({
    freeformNotes: assessment.freeformNotes,
    criterionScores: assessment.criterionScores,
    totalScore: assessment.totalScore,
  });
}

function buildDraftPointSummary(
  profile: { features: unknown; semester: string | null } | null,
  documents: Array<{ extractionMetadata: unknown }>,
) {
  const featureEnvelope = readJsonObject(profile?.features);
  const rawInput = readJsonObject(featureEnvelope.rawInput);
  const personalData = readJsonObject(rawInput.personalData);
  const performanceReview = readJsonObject(rawInput.performanceReview);
  const uploadedPanels = new Set<string>();

  let instruction = readOptionalNumber(performanceReview.teachingEffectiveness) ?? 0;
  let research = readOptionalNumber(performanceReview.researchOutputs) ?? 0;
  let extension = readOptionalNumber(performanceReview.extensionServices) ?? 0;
  let professionalDevelopment = readOptionalNumber(performanceReview.professionalDevelopmentHours) ?? 0;
  let ipcrAverage = readOptionalNumber(performanceReview.ipcrAverage) ?? 0;
  let completenessTotal = 0;
  let completenessSamples = 0;

  for (const document of documents) {
    const metadata = summarizeDocumentMetadata(document.extractionMetadata);
    if (metadata.panelKey) {
      uploadedPanels.add(metadata.panelKey);
    }
    if (metadata.completenessScore !== null) {
      completenessTotal += metadata.completenessScore;
      completenessSamples += 1;
    }
    instruction = Math.max(instruction, metadata.extractedScores.teachingEffectiveness ?? 0);
    research = Math.max(research, metadata.extractedScores.researchOutputs ?? 0);
    extension = Math.max(extension, metadata.extractedScores.extensionServices ?? 0);
    professionalDevelopment = Math.max(
      professionalDevelopment,
      metadata.extractedScores.professionalDevelopmentHours ?? 0,
    );
    ipcrAverage = Math.max(ipcrAverage, metadata.extractedScores.ipcrAverage ?? 0);
  }

  const coverage = uploadPanels.length ? uploadedPanels.size / uploadPanels.length : 0;
  const averagedCompleteness = completenessSamples ? completenessTotal / completenessSamples : 0;
  const overallEstimate = instruction + research + extension + professionalDevelopment + ipcrAverage;

  return {
    note: 'Approximate estimate only. Evaluator review is still required for the official score.',
    facultyName: typeof personalData.fullName === 'string' ? personalData.fullName : null,
    semester: profile?.semester ?? null,
    categories: {
      instruction: roundScore(instruction),
      research: roundScore(research),
      extension: roundScore(extension),
      professionalDevelopment: roundScore(professionalDevelopment),
      ipcrAverage: roundScore(ipcrAverage),
    },
    overallEstimate: roundScore(overallEstimate),
    evidenceCoverage: {
      uploadedPanels: Array.from(uploadedPanels),
      uploadedPanelCount: uploadedPanels.size,
      expectedPanelCount: uploadPanels.length,
      documentCompletenessAverage: roundScore(averagedCompleteness * 100),
      workflowCoveragePercent: roundScore(coverage * 100),
    },
  };
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readNumberRecord(value: unknown): Record<string, number> {
  const record = readJsonObject(value);
  return Object.entries(record).reduce<Record<string, number>>((numbers, [key, entry]) => {
    const parsed = readOptionalNumber(entry);
    if (parsed !== null) {
      numbers[key] = parsed;
    }
    return numbers;
  }, {});
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function setSessionCookie(res: Response, user: SessionUser) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }),
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
  const token = `${payload}.${signature}`;
  const parts = [
    `${sessionCookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: Response) {
  const parts = [`${sessionCookieName}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProduction) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function verifySessionToken(token: string): SessionUser | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return null;
  }

  const expected = crypto.createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: string;
      email: string;
      fullName: string;
      role: SessionUser['role'];
      exp: number;
    };

    if (parsed.exp < Date.now()) {
      return null;
    }

    return {
      id: parsed.sub,
      email: parsed.email,
      fullName: parsed.fullName,
      role: parsed.role,
    };
  } catch {
    return null;
  }
}

function parseCookies(header: string): Record<string, string> {
  return header.split(';').reduce<Record<string, string>>((cookies, entry) => {
    const [rawKey, ...rawValue] = entry.trim().split('=');
    if (!rawKey) {
      return cookies;
    }
    cookies[rawKey] = rawValue.join('=');
    return cookies;
  }, {});
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function handleRequestError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Invalid request payload',
      issues: error.issues,
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return res.status(400).json({
      error: 'Database request failed',
      code: error.code,
      details: error.message,
    });
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `Uploaded file exceeds the ${MAX_UPLOAD_SIZE_MB} MB limit`,
        code: error.code,
      });
    }

    return res.status(400).json({
      error: 'Upload request failed',
      code: error.code,
      details: error.message,
    });
  }

  if (error instanceof Error && /powershell|ocr/i.test(error.message)) {
    return res.status(500).json({
      error: 'OCR processing failed',
      details: error.message,
    });
  }

  return res.status(500).json({
    error: 'Unexpected server error',
    details: error instanceof Error ? error.message : 'Unknown error',
  });
}

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Closing server...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
