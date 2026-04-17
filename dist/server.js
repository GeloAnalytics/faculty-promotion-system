"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const utils_1 = require("./utils");
const ocr_1 = require("./ocr");
const envSchema = zod_1.z.object({
    DATABASE_URL: zod_1.z.string().min(1),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    AUTH_SECRET: zod_1.z.string().min(32).default('development-auth-secret-change-me-123456'),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:3000'),
    TRUST_PROXY: zod_1.z.coerce.number().int().nonnegative().default(1),
    OCR_PROVIDER: zod_1.z.enum(['windows', 'http', 'ocrspace', 'disabled']).default('windows'),
    OCR_API_URL: zod_1.z.string().trim().optional(),
    OCR_API_KEY: zod_1.z.string().trim().optional(),
    OCR_API_KEY_HEADER: zod_1.z.string().trim().default('Authorization'),
    OCR_FILE_FIELD_NAME: zod_1.z.string().trim().default('file'),
    OCR_TIMEOUT_MS: zod_1.z.coerce.number().int().positive().default(30000),
});
const env = envSchema.parse(process.env);
const isProduction = env.NODE_ENV === 'production';
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
});
const repoRoot = process.cwd();
const tqeCsvPath = node_path_1.default.join(repoRoot, 'TQE.csv');
const guidelinePdfPath = (0, utils_1.findGuidelinePdfPath)(repoRoot);
const tqeReferenceRecords = (0, utils_1.loadTqeReferenceData)(tqeCsvPath);
const tqeReferenceSummary = (0, utils_1.summarizeTqeReferenceData)(tqeReferenceRecords);
const publicDir = node_path_1.default.join(repoRoot, 'public');
const ocrScriptPath = node_path_1.default.join(repoRoot, 'scripts', 'ocr-image.ps1');
const sessionCookieName = 'fps_session';
const ocrConfig = {
    provider: env.OCR_PROVIDER,
    scriptPath: ocrScriptPath,
    apiUrl: env.OCR_API_URL,
    apiKey: env.OCR_API_KEY,
    apiKeyHeader: env.OCR_API_KEY_HEADER,
    fileFieldName: env.OCR_FILE_FIELD_NAME,
    timeoutMs: env.OCR_TIMEOUT_MS,
};
const uploadPanels = [
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
const personalDataSchema = zod_1.z.object({
    employeeId: zod_1.z.string().trim().optional(),
    fullName: zod_1.z.string().trim().min(1),
    age: zod_1.z.number().nonnegative().optional(),
    sex: zod_1.z.string().trim().optional(),
    civilStatus: zod_1.z.string().trim().optional(),
    academicRank: zod_1.z.string().trim().optional(),
    yearsInService: zod_1.z.number().nonnegative().optional(),
    highestEducationalAttainment: zod_1.z.string().trim().optional(),
    department: zod_1.z.string().trim().optional(),
});
const performanceReviewSchema = zod_1.z.object({
    reviewPeriod: zod_1.z.string().trim().optional(),
    ipcrAverage: zod_1.z.number().nonnegative().optional(),
    teachingEffectiveness: zod_1.z.number().nonnegative().optional(),
    researchOutputs: zod_1.z.number().nonnegative().optional(),
    extensionServices: zod_1.z.number().nonnegative().optional(),
    administrativeExperience: zod_1.z.number().nonnegative().optional(),
    professionalDevelopmentHours: zod_1.z.number().nonnegative().optional(),
});
const promotionHistorySchema = zod_1.z.object({
    cycle: zod_1.z.string().trim().optional(),
    promoted: zod_1.z.boolean(),
    previousRank: zod_1.z.string().trim().optional(),
    newRank: zod_1.z.string().trim().optional(),
});
const documentExtractionSchema = zod_1.z.object({
    source: zod_1.z.enum(['pdf', 'manual']),
    textLength: zod_1.z.number().nonnegative(),
    detectedFields: zod_1.z.array(zod_1.z.string()),
    completenessScore: zod_1.z.number().min(0).max(1),
    qualityScore: zod_1.z.number().min(0).max(1),
    extractedScores: zod_1.z.record(zod_1.z.number()).default({}),
});
const facultyIngestionSchema = zod_1.z.object({
    personalData: personalDataSchema,
    performanceReview: performanceReviewSchema,
    promotionHistory: zod_1.z.array(promotionHistorySchema).default([]),
    documentExtraction: documentExtractionSchema.optional(),
    notes: zod_1.z.string().trim().optional(),
});
const registerSchema = zod_1.z.object({
    fullName: zod_1.z.string().trim().min(2),
    email: zod_1.z.string().trim().email(),
    password: zod_1.z.string().min(8),
    role: zod_1.z.nativeEnum(client_1.UserRole).refine((value) => value === client_1.UserRole.EMPLOYEE || value === client_1.UserRole.EVALUATOR, {
        message: 'Registration role must be Employee or Evaluator',
    }),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
    password: zod_1.z.string().min(8),
});
const trainingSubmissionSchema = zod_1.z.object({
    profileId: zod_1.z.string().trim().optional(),
    datasetSplit: zod_1.z.string().trim().optional(),
    labelPromoted: zod_1.z.boolean().optional(),
    labelSource: zod_1.z.string().trim().optional(),
    notes: zod_1.z.string().trim().optional(),
    rawInput: facultyIngestionSchema,
    featureSnapshot: zod_1.z.record(zod_1.z.number()),
    modelSnapshot: zod_1.z
        .object({
        selectedFeatures: zod_1.z.array(zod_1.z.object({ feature: zod_1.z.string(), importance: zod_1.z.number(), rationale: zod_1.z.string() })),
        modelResults: zod_1.z.array(zod_1.z.object({
            model: zod_1.z.string(),
            metrics: zod_1.z.object({
                accuracy: zod_1.z.number(),
                precision: zod_1.z.number(),
                recall: zod_1.z.number(),
                f1Score: zod_1.z.number(),
            }),
            promotionProbability: zod_1.z.number(),
            predictedPromotion: zod_1.z.boolean(),
            keyFactors: zod_1.z.array(zod_1.z.string()),
        })),
        bestModel: zod_1.z.object({
            model: zod_1.z.string(),
            metrics: zod_1.z.object({
                accuracy: zod_1.z.number(),
                precision: zod_1.z.number(),
                recall: zod_1.z.number(),
                f1Score: zod_1.z.number(),
            }),
            promotionProbability: zod_1.z.number(),
            predictedPromotion: zod_1.z.boolean(),
            keyFactors: zod_1.z.array(zod_1.z.string()),
        }),
        recommendations: zod_1.z.array(zod_1.z.object({
            area: zod_1.z.string(),
            recommendation: zod_1.z.string(),
            evidence: zod_1.z.string(),
        })),
    })
        .optional(),
});
app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});
app.use((0, cors_1.default)({
    origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()),
    credentials: true,
}));
app.use(express_1.default.json({ limit: '2mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '2mb' }));
app.use(attachSessionUser);
app.get('/evaluator', (_req, res) => {
    res.sendFile(node_path_1.default.join(publicDir, 'evaluator.html'));
});
app.use(express_1.default.static(publicDir, { extensions: ['html'], maxAge: isProduction ? '1h' : 0 }));
app.get('/api/health', (_req, res) => {
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
            guidelinePdfFileName: guidelinePdfPath ? node_path_1.default.basename(guidelinePdfPath) : null,
            imageOcrReady: (0, ocr_1.isOcrReady)(ocrConfig),
            imageOcrProvider: ocrConfig.provider,
        },
        model: {
            status: 'inactive',
            reason: 'The system is currently focused on collecting and storing training data.',
        },
    });
});
app.post('/api/auth/register', async (req, res) => {
    try {
        const payload = registerSchema.parse(req.body);
        const existingUser = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
        if (existingUser) {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }
        const passwordSalt = node_crypto_1.default.randomBytes(16).toString('hex');
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
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.post('/api/auth/login', async (req, res) => {
    try {
        const payload = loginSchema.parse(req.body);
        const user = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
        if (!user || !user.accountActive || !verifyPassword(payload.password, user.passwordSalt, user.passwordHash)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const sessionUser = toSessionUser(user);
        setSessionCookie(res, sessionUser);
        return res.json({ user: sessionUser, homePath: getHomePathForRole(sessionUser.role) });
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).send();
});
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
        user: req.user,
        homePath: getHomePathForRole(req.user.role),
    });
});
app.get('/api/reference/tqe-summary', (_req, res) => {
    res.json({
        source: 'TQE.csv',
        summary: tqeReferenceSummary,
        usage: 'This dataset is currently used as a teaching-quality and score-distribution reference, not as the final promotion outcome dataset.',
    });
});
app.get('/api/config/upload-panels', (_req, res) => {
    res.json({
        modelStatus: 'inactive',
        panels: uploadPanels,
    });
});
app.get('/api/reference/guidelines', async (_req, res) => {
    if (!guidelinePdfPath) {
        return res.status(404).json({
            error: 'Guideline PDF not found in repository root',
        });
    }
    try {
        const data = await (0, pdf_parse_1.default)(node_fs_1.default.readFileSync(guidelinePdfPath));
        return res.json({
            source: node_path_1.default.basename(guidelinePdfPath),
            guideline: (0, utils_1.extractGuidelineReference)(data.text, node_path_1.default.basename(guidelinePdfPath)),
        });
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.post('/api/documents/extract', requireRole(client_1.UserRole.EMPLOYEE, client_1.UserRole.ADMIN), upload.single('document'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No document uploaded' });
    }
    try {
        const kind = parseDocumentKind(req.body.kind);
        const panelKey = parseUploadPanelKey(req.body.panelKey);
        const requestedProfileId = typeof req.body.profileId === 'string' && req.body.profileId.trim() ? req.body.profileId : null;
        const mimeType = req.file.mimetype.toLowerCase();
        const fileName = req.file.originalname;
        const isCsv = /\.csv$/i.test(fileName);
        const isSpreadsheet = /\.(xlsx|xls)$/i.test(fileName);
        const linkage = await resolveUploadProfileLink(req.user.id, fileName, requestedProfileId);
        const profileId = linkage.profileId;
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
                    ownerUserId: req.user.id,
                    profileId,
                    kind,
                    originalName: fileName,
                    mimeType: req.file.mimetype,
                    extractionMetadata: toPrismaJson({
                        panelKey,
                        storedForTraining: true,
                        extractionMode: 'spreadsheet-reference',
                        sizeBytes: req.file.size,
                        linkage,
                    }),
                },
            });
            return res.json({
                fileType: 'spreadsheet',
                documentId: savedDocument.id,
                panelKey,
                profileId,
                linkage,
                message: 'Spreadsheet stored for training-data preparation.',
            });
        }
        if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
            const data = await (0, pdf_parse_1.default)(req.file.buffer);
            const analysis = (0, utils_1.analyzeDocumentContent)(data.text, panelKey, 'pdf');
            const savedDocument = await prisma.uploadedDocument.create({
                data: {
                    ownerUserId: req.user.id,
                    profileId,
                    kind,
                    originalName: fileName,
                    mimeType: req.file.mimetype,
                    extractedText: data.text,
                    extractionMetadata: toPrismaJson({
                        panelKey,
                        storedForTraining: true,
                        analysis,
                        linkage,
                    }),
                },
            });
            return res.json({
                fileType: 'pdf',
                documentId: savedDocument.id,
                panelKey,
                profileId,
                linkage,
                textPreview: data.text.slice(0, 1000),
                analysis,
            });
        }
        if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tif|tiff)$/i.test(fileName)) {
            const ocrResult = await (0, ocr_1.extractImageTextWithOcr)(req.file.buffer, fileName, ocrConfig);
            const extractedText = ocrResult.text.trim();
            const analysis = (0, utils_1.analyzeDocumentContent)(extractedText, panelKey, 'image');
            const savedDocument = await prisma.uploadedDocument.create({
                data: {
                    ownerUserId: req.user.id,
                    profileId,
                    kind,
                    originalName: fileName,
                    mimeType: req.file.mimetype,
                    extractedText,
                    extractionMetadata: toPrismaJson({
                        panelKey,
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
            return res.json({
                fileType: 'image',
                documentId: savedDocument.id,
                panelKey,
                profileId,
                linkage,
                textPreview: extractedText.slice(0, 1000),
                analysis,
            });
        }
        if (isCsv) {
            const csvText = req.file.buffer.toString('utf8');
            const analysis = (0, utils_1.analyzeDocumentContent)(csvText, panelKey, 'csv');
            const savedDocument = await prisma.uploadedDocument.create({
                data: {
                    ownerUserId: req.user.id,
                    profileId,
                    kind,
                    originalName: fileName,
                    mimeType: req.file.mimetype,
                    extractedText: csvText,
                    extractionMetadata: toPrismaJson({
                        panelKey,
                        storedForTraining: true,
                        analysis,
                        linkage,
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
                profileId,
                linkage,
                textPreview: csvText.slice(0, 1000),
                analysis,
            });
        }
        return res.status(400).json({ error: 'Unsupported document type' });
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.post('/api/faculty/ingest', requireRole(client_1.UserRole.EMPLOYEE, client_1.UserRole.ADMIN), async (req, res) => {
    try {
        const payload = facultyIngestionSchema.parse(req.body);
        const features = (0, utils_1.buildFeatureVector)(payload);
        const tqeBenchmarks = (0, utils_1.findClosestTqeBenchmarks)(features, tqeReferenceRecords);
        const profile = await prisma.facultyProfile.create({
            data: {
                employeeId: payload.personalData.employeeId,
                name: payload.personalData.fullName,
                semester: payload.performanceReview.reviewPeriod,
                teachingQuality: payload.personalData.academicRank,
                promotion: null,
                createdByUserId: req.user.id,
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
                createdByUserId: req.user.id,
                profileId: profile.id,
                status: client_1.TrainingExampleStatus.DRAFT,
                rawInput: toPrismaJson(payload),
                featureSnapshot: toPrismaJson(features),
            },
        });
        const linkedDocuments = await attachExistingDocumentsToProfile(req.user.id, profile.id, {
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
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.post('/api/analysis/feature-selection', requireAuth, async (req, res) => {
    return res.status(503).json({
        error: 'Feature selection is inactive',
        details: 'The system is currently configured for data collection and storage for future model training.',
    });
});
app.post('/api/models/compare', requireAuth, async (req, res) => {
    return res.status(503).json({
        error: 'Model comparison is inactive',
        details: 'The system is currently configured for data collection and storage for future model training.',
    });
});
app.post('/api/predictions/generate', requireAuth, async (req, res) => {
    return res.status(503).json({
        error: 'Prediction is inactive',
        details: 'The system is currently configured for training-data collection rather than live prediction.',
    });
});
app.post('/api/training/examples', requireRole(client_1.UserRole.EVALUATOR, client_1.UserRole.ADMIN), async (req, res) => {
    try {
        const payload = trainingSubmissionSchema.parse(req.body);
        const trainingExample = await prisma.trainingExample.create({
            data: {
                createdByUserId: req.user.id,
                profileId: payload.profileId,
                status: payload.labelPromoted === undefined ? client_1.TrainingExampleStatus.DRAFT : client_1.TrainingExampleStatus.LABELED,
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
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.patch('/api/training/examples/:id/label', requireRole(client_1.UserRole.EVALUATOR, client_1.UserRole.ADMIN), async (req, res) => {
    try {
        const payload = zod_1.z
            .object({
            labelPromoted: zod_1.z.boolean(),
            labelSource: zod_1.z.string().trim().optional(),
            datasetSplit: zod_1.z.string().trim().optional(),
            notes: zod_1.z.string().trim().optional(),
            validated: zod_1.z.boolean().optional(),
        })
            .parse(req.body);
        const trainingExample = await prisma.trainingExample.update({
            where: { id: req.params.id },
            data: {
                labelPromoted: payload.labelPromoted,
                labelSource: payload.labelSource,
                datasetSplit: payload.datasetSplit,
                notes: payload.notes,
                status: payload.validated ? client_1.TrainingExampleStatus.VALIDATED : client_1.TrainingExampleStatus.LABELED,
            },
        });
        return res.json(trainingExample);
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.get('/api/training/examples', requireRole(client_1.UserRole.EVALUATOR, client_1.UserRole.ADMIN), async (_req, res) => {
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
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.get('/api/admin/database-overview', requireRole(client_1.UserRole.EVALUATOR, client_1.UserRole.ADMIN), async (_req, res) => {
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
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
app.get('/api/dashboard/:profileId', requireRole(client_1.UserRole.EVALUATOR, client_1.UserRole.ADMIN), async (req, res) => {
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
    }
    catch (error) {
        return handleRequestError(res, error);
    }
});
const server = app.listen(env.PORT, () => {
    console.log(`Faculty promotion system listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
});
async function attachSessionUser(req, _res, next) {
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
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    return next();
}
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'You do not have access to this workspace' });
        }
        return next();
    };
}
async function resolveUploadProfileLink(ownerUserId, originalName, requestedProfileId) {
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
async function attachExistingDocumentsToProfile(ownerUserId, profileId, profileData) {
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
    const matchedDocuments = pendingDocuments.filter((document) => scoreProfileFilename(profileData.fullName, profileData.employeeId, document.originalName) > 0);
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
function findBestMatchingProfile(profiles, originalName) {
    let bestMatch = null;
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
function scoreProfileFilename(fullName, employeeId, originalName) {
    const normalizedFileName = normalizeForMatch(node_path_1.default.parse(originalName).name);
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
    }
    else if (matchedNameTokenCount >= Math.max(2, nameTokens.length - 1)) {
        score += 15 + matchedNameTokenCount;
    }
    return score;
}
function tokenizeForMatch(value) {
    return normalizeForMatch(value)
        .split(' ')
        .filter((token) => token.length >= 2);
}
function normalizeForMatch(value) {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function parseDocumentKind(input) {
    const normalized = typeof input === 'string' ? input.toUpperCase() : 'REQUIREMENT';
    if (normalized === 'GUIDELINE') {
        return client_1.DocumentKind.GUIDELINE;
    }
    if (normalized === 'TRAINING_SUPPORT') {
        return client_1.DocumentKind.TRAINING_SUPPORT;
    }
    return client_1.DocumentKind.REQUIREMENT;
}
function parseUploadPanelKey(input) {
    const value = typeof input === 'string' ? input : '';
    const matched = uploadPanels.find((panel) => panel.key === value);
    return matched ? matched.key : 'kra_instruction';
}
function hashPassword(password, salt) {
    return node_crypto_1.default.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
}
function verifyPassword(password, salt, expectedHash) {
    const actualHash = hashPassword(password, salt);
    return node_crypto_1.default.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}
function toSessionUser(user) {
    return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
    };
}
function getHomePathForRole(role) {
    return role === client_1.UserRole.EVALUATOR ? '/evaluator' : '/';
}
function setSessionCookie(res, user) {
    const payload = Buffer.from(JSON.stringify({
        sub: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })).toString('base64url');
    const signature = node_crypto_1.default.createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
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
function clearSessionCookie(res) {
    const parts = [`${sessionCookieName}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (isProduction) {
        parts.push('Secure');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
}
function verifySessionToken(token) {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) {
        return null;
    }
    const expected = node_crypto_1.default.createHmac('sha256', env.AUTH_SECRET).update(payload).digest('base64url');
    if (!node_crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return null;
    }
    try {
        const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (parsed.exp < Date.now()) {
            return null;
        }
        return {
            id: parsed.sub,
            email: parsed.email,
            fullName: parsed.fullName,
            role: parsed.role,
        };
    }
    catch {
        return null;
    }
}
function parseCookies(header) {
    return header.split(';').reduce((cookies, entry) => {
        const [rawKey, ...rawValue] = entry.trim().split('=');
        if (!rawKey) {
            return cookies;
        }
        cookies[rawKey] = rawValue.join('=');
        return cookies;
    }, {});
}
function toPrismaJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function handleRequestError(res, error) {
    if (error instanceof zod_1.z.ZodError) {
        return res.status(400).json({
            error: 'Invalid request payload',
            issues: error.issues,
        });
    }
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
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
async function shutdown(signal) {
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
//# sourceMappingURL=server.js.map