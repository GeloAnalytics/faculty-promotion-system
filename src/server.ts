import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
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
});

const env = envSchema.parse(process.env);
const isProduction = env.NODE_ENV === 'production';
const app = express();
const prisma = new PrismaClient();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
const repoRoot = process.cwd();
const tqeCsvPath = path.join(repoRoot, 'TQE.csv');
const guidelinePdfPath = findGuidelinePdfPath(repoRoot);
const tqeReferenceRecords = loadTqeReferenceData(tqeCsvPath);
const tqeReferenceSummary = summarizeTqeReferenceData(tqeReferenceRecords);
const publicDir = path.join(repoRoot, 'public');
const ocrScriptPath = path.join(repoRoot, 'scripts', 'ocr-image.ps1');
const sessionCookieName = 'fps_session';
const execFileAsync = promisify(execFile);
const uploadPanels: UploadPanelDefinition[] = [
  {
    key: 'kra_instruction',
    title: 'Key Result Area 1: Instruction',
    description: 'Upload instructional evidence and related requirement documents.',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'],
  },
  {
    key: 'kra_research',
    title: 'Key Result Area 2: Research, Invention, and Creative Work',
    description: 'Upload research outputs, inventions, and creative-work evidence.',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'],
  },
  {
    key: 'kra_extension',
    title: 'Key Result Area 3: Extension Services',
    description: 'Upload extension-service records and supporting documents.',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'],
  },
  {
    key: 'kra_professional_development',
    title: 'Key Result Area 4: Professional Development',
    description: 'Upload training, seminar, and professional-development evidence.',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'],
  },
  {
    key: 'tallied_points',
    title: 'Tallied Points',
    description: 'Upload Excel or CSV files containing tallied or consolidated points.',
    acceptedFormats: ['xlsx', 'xls', 'csv'],
  },
];

const personalDataSchema = z.object({
  teacherId: z.string().trim().optional(),
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
      imageOcrReady: false,
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
        role: UserRole.STAFF,
      },
    });

    const sessionUser = toSessionUser(user);
    setSessionCookie(res, sessionUser);
    return res.status(201).json({ user: sessionUser });
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
    return res.json({ user: sessionUser });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.status(204).send();
});

app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
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

app.post('/api/documents/extract', requireAuth, upload.single('document'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No document uploaded' });
  }

  try {
    const kind = parseDocumentKind(req.body.kind);
    const panelKey = parseUploadPanelKey(req.body.panelKey);
    const profileId = typeof req.body.profileId === 'string' && req.body.profileId.trim() ? req.body.profileId : null;
    const mimeType = req.file.mimetype.toLowerCase();
    const fileName = req.file.originalname;
    const isCsv = /\.csv$/i.test(fileName);
    const isSpreadsheet = /\.(xlsx|xls)$/i.test(fileName);

    if (panelKey === 'tallied_points' && !isSpreadsheet && !isCsv) {
      return res.status(400).json({
        error: 'Tallied Points panel only accepts Excel or CSV files',
      });
    }

    if (panelKey !== 'tallied_points' && (isSpreadsheet || isCsv)) {
      return res.status(400).json({
        error: 'Spreadsheet files are only accepted in the Tallied Points panel',
      });
    }

    if (isSpreadsheet) {
      const savedDocument = await prisma.uploadedDocument.create({
        data: {
          ownerUserId: req.user!.id,
          profileId,
          kind,
          originalName: fileName,
          mimeType: req.file.mimetype,
          extractionMetadata: toPrismaJson({
            panelKey,
            storedForTraining: true,
            extractionMode: 'spreadsheet-reference',
            sizeBytes: req.file.size,
          }),
        },
      });

      return res.json({
        fileType: 'spreadsheet',
        documentId: savedDocument.id,
        panelKey,
        message: 'Spreadsheet stored for training-data preparation.',
      });
    }

    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      const data = await pdf(req.file.buffer);
      const analysis = analyzeDocumentContent(data.text, panelKey, 'pdf');

      const savedDocument = await prisma.uploadedDocument.create({
        data: {
          ownerUserId: req.user!.id,
          profileId,
          kind,
          originalName: fileName,
          mimeType: req.file.mimetype,
          extractedText: data.text,
          extractionMetadata: toPrismaJson({
            panelKey,
            storedForTraining: true,
            analysis,
          }),
        },
      });

      return res.json({
        fileType: 'pdf',
        documentId: savedDocument.id,
        panelKey,
        textPreview: data.text.slice(0, 1000),
        analysis,
      });
    }

    if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tif|tiff)$/i.test(fileName)) {
      const tempImagePath = path.join(
        os.tmpdir(),
        `fps-ocr-${crypto.randomUUID()}${path.extname(fileName) || '.png'}`,
      );

      try {
        fs.writeFileSync(tempImagePath, req.file.buffer);
        const { stdout } = await execFileAsync(
          'powershell',
          ['-ExecutionPolicy', 'Bypass', '-File', ocrScriptPath, '-ImagePath', tempImagePath],
          { windowsHide: true, maxBuffer: 5 * 1024 * 1024 },
        );

        const ocrPayload = JSON.parse(stdout) as { text?: string; lineCount?: number };
        const extractedText = (ocrPayload.text ?? '').trim();
        const analysis = analyzeDocumentContent(extractedText, panelKey, 'image');

        const savedDocument = await prisma.uploadedDocument.create({
          data: {
            ownerUserId: req.user!.id,
            profileId,
            kind,
            originalName: fileName,
            mimeType: req.file.mimetype,
            extractedText,
            extractionMetadata: toPrismaJson({
              panelKey,
              storedForTraining: true,
              ocr: {
                lineCount: ocrPayload.lineCount ?? 0,
              },
              analysis,
            }),
          },
        });

        return res.json({
          fileType: 'image',
          documentId: savedDocument.id,
          panelKey,
          textPreview: extractedText.slice(0, 1000),
          analysis,
        });
      } finally {
        if (fs.existsSync(tempImagePath)) {
          fs.unlinkSync(tempImagePath);
        }
      }
    }

    if (isCsv) {
      const csvText = req.file.buffer.toString('utf8');
      const analysis = analyzeDocumentContent(csvText, panelKey, 'csv');

      const savedDocument = await prisma.uploadedDocument.create({
        data: {
          ownerUserId: req.user!.id,
          profileId,
          kind,
          originalName: fileName,
          mimeType: req.file.mimetype,
          extractedText: csvText,
          extractionMetadata: toPrismaJson({
            panelKey,
            storedForTraining: true,
            analysis,
            csv: {
              rowCount: csvText.split(/\r?\n/).filter(Boolean).length,
            },
          }),
        },
      });

      return res.json({
        fileType: 'csv',
        documentId: savedDocument.id,
        panelKey,
        textPreview: csvText.slice(0, 1000),
        analysis,
      });
    }

    return res.status(400).json({ error: 'Unsupported document type' });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.post('/api/faculty/ingest', requireAuth, async (req: Request, res: Response) => {
  try {
    const payload = facultyIngestionSchema.parse(req.body);
    const features = buildFeatureVector(payload);
    const tqeBenchmarks = findClosestTqeBenchmarks(features, tqeReferenceRecords);

    const profile = await prisma.facultyProfile.create({
      data: {
        teacherId: payload.personalData.teacherId,
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

    return res.status(201).json({
      profileId: profile.id,
      trainingExampleId: trainingDraft.id,
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

app.post('/api/training/examples', requireAuth, async (req: Request, res: Response) => {
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

app.patch('/api/training/examples/:id/label', requireAuth, async (req: Request, res: Response) => {
  try {
    const payload = z
      .object({
        labelPromoted: z.boolean(),
        labelSource: z.string().trim().optional(),
        datasetSplit: z.string().trim().optional(),
        notes: z.string().trim().optional(),
        validated: z.boolean().optional(),
      })
      .parse(req.body);

    const trainingExample = await prisma.trainingExample.update({
      where: { id: req.params.id },
      data: {
        labelPromoted: payload.labelPromoted,
        labelSource: payload.labelSource,
        datasetSplit: payload.datasetSplit,
        notes: payload.notes,
        status: payload.validated ? TrainingExampleStatus.VALIDATED : TrainingExampleStatus.LABELED,
      },
    });

    return res.json(trainingExample);
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.get('/api/training/examples', requireAuth, async (_req: Request, res: Response) => {
  try {
    const trainingExamples = await prisma.trainingExample.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        profile: { select: { id: true, name: true, teacherId: true } },
      },
    });

    return res.json({ items: trainingExamples });
  } catch (error) {
    return handleRequestError(res, error);
  }
});

app.get('/api/dashboard/:profileId', requireAuth, async (req: Request, res: Response) => {
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
  return matched ? matched.key : 'kra_instruction';
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
