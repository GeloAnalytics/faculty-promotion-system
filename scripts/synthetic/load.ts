/**
 * Loads the synthetic cohort into the configured database and R2 bucket through
 * the same code paths a real upload uses (pdf-parse -> OCR -> analyzeDocumentContent),
 * recording every created row/object in registry.json so it can be listed or removed.
 *
 *   OCR_PROVIDER=tesseract OCR_API_URL= OCR_API_KEY= GOOGLE_VISION_API_KEY= \
 *     npx tsx --env-file=.env scripts/synthetic/load.ts --pilot | --seq=1,2 | --all [--dry]
 *
 * The blank OCR_* values matter: the app silently prefers OCR.space whenever its
 * URL and key are set, which would spend the quota real users share.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pdf from 'pdf-parse';
import { AuditLogAction, DocumentKind, UserRole } from '@prisma/client';
import { prisma } from '../../src/config/db';
import { ocrConfig } from '../../src/config/globals';
import { fixedReviewPeriodLabel } from '../../src/constants/reviewCycle';
import { extractImageTextWithOcr, resolveEffectiveOcrProvider, summarizeOcrResult, terminateOcrWorkers } from '../../src/ocr';
import { uploadPanels } from '../../src/uploadPanels';
import { analyzeDocumentContent } from '../../src/utils';
import { getKraStoragePath, isPdfTextInsufficient, resolveUploadProfileLink, toPrismaJson } from '../../src/utils/document.utils';
import { hashPassword } from '../../src/utils/crypto';
import { checkPromotionWindow } from '../../src/utils/promotionWindow';
import { getActiveStorageProvider, uploadFileBuffer } from '../../src/services/storage.service';
import { buildCohort, type SyntheticDoc, type SyntheticFaculty } from './build';
import { createRng } from './rng';
import { renderScanJpeg, scanPdf, textPdf } from './pdf';

export const SEED = 20261120;
const REGISTRY_PATH = path.join(__dirname, 'registry.json');

export interface RegistryDoc { id: string; fileName: string; panelKey: string; format: string; storagePath: string | null; textLength: number }
export interface RegistryEntry { seq: number; userId: string; profileId: string; docs: RegistryDoc[]; loadedAt: string }
export type Registry = Record<string, RegistryEntry>;

export function readRegistry(): Registry {
  return fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) : {};
}
function saveRegistry(registry: Registry) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

const panelTitle = (key: string) => uploadPanels.find((panel) => panel.key === key)?.title ?? key;

// Spread creation times over the weeks since R2 went live so the cohort does
// not all carry one timestamp.
function createdAtFor(rng: ReturnType<typeof createRng>) {
  const start = Date.UTC(2026, 9, 20, 0, 0, 0);
  const end = Date.UTC(2026, 10, 19, 0, 0, 0);
  const day = start + Math.floor(rng.next() * (end - start));
  const date = new Date(day);
  date.setUTCHours(rng.int(0, 9), rng.int(0, 59), rng.int(0, 59)); // 08:00-18:00 Manila
  return date;
}

async function processDocument(faculty: SyntheticFaculty, doc: SyntheticDoc, ownerUserId: string, profileId: string, createdAt: Date, rng: ReturnType<typeof createRng>) {
  const mimeType = 'application/pdf';
  let extractedText = doc.observedText;
  let storage: { provider: string; bucket?: string; path?: string } | null = null;
  let ocrSummary: ReturnType<typeof summarizeOcrResult> | null = null;
  let ocrError: string | null = null;
  let parseError: string | null = null;

  if (faculty.delivery === 'pdf') {
    const buffer = doc.format === 'pdf-scan' ? await scanPdf(renderScanJpeg(doc.cleanText, rng)) : textPdf(doc.cleanText);

    const descriptor = await uploadFileBuffer(getKraStoragePath(doc.panelKey, doc.fileName, mimeType), buffer, mimeType);
    storage = { provider: descriptor.provider, bucket: descriptor.bucket, path: descriptor.path };

    // Same decision the register endpoint makes.
    let text = '';
    let pages = 1;
    try {
      const parsed = await pdf(buffer);
      text = parsed.text || '';
      pages = parsed.numpages || 1;
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'PDF text extraction failed';
    }
    if (isPdfTextInsufficient(text, pages)) {
      try {
        const result = await extractImageTextWithOcr(buffer, doc.fileName, { ...ocrConfig, totalBudgetMs: 15 * 60_000 }, 'PDF');
        if (result.text.trim().length > text.trim().length) {
          text = result.text.trim();
        }
        ocrSummary = summarizeOcrResult(result);
      } catch (error) {
        ocrError = error instanceof Error ? error.message : 'OCR failed';
      }
    }
    extractedText = text;
    // Only report a failure when nothing was recovered, as the real endpoint does.
    if (!text.trim() && parseError && !ocrError) ocrError = parseError;
  }

  const analysis = analyzeDocumentContent(extractedText, doc.panelKey, 'pdf');
  const dateCheck = checkPromotionWindow(extractedText);
  const linkage = await resolveUploadProfileLink(ownerUserId, doc.fileName, null, { fullName: faculty.fullName, employeeId: faculty.employeeId });

  const saved = await prisma.uploadedDocument.create({
    data: {
      ownerUserId,
      profileId,
      kind: DocumentKind.REQUIREMENT,
      originalName: doc.fileName,
      mimeType,
      extractedText,
      createdAt,
      extractionMetadata: toPrismaJson({
        uploadType: 'evidence',
        panelKey: doc.panelKey,
        panelTitle: panelTitle(doc.panelKey),
        documentType: null,
        storedForTraining: true,
        ...(ocrSummary ? { ocr: ocrSummary } : {}),
        ...(ocrError ? { ocrError } : {}),
        analysis,
        dateCheck,
        linkage,
        ...(storage ? { storage } : {}),
      }),
    },
  });
  await prisma.auditLog.create({
    data: {
      action: AuditLogAction.UPLOAD,
      userId: ownerUserId,
      targetId: saved.id,
      createdAt,
      details: { originalName: doc.fileName, panelKey: doc.panelKey, uploadType: 'evidence', method: `direct-${storage?.provider ?? 'r2'}` },
    },
  });
  return { id: saved.id, fileName: doc.fileName, panelKey: doc.panelKey, format: doc.format, storagePath: storage?.path ?? null, textLength: extractedText.length };
}

async function loadFaculty(faculty: SyntheticFaculty, registry: Registry) {
  const rng = createRng(SEED * 31 + faculty.seq);
  const createdAt = createdAtFor(rng);
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(crypto.randomBytes(24).toString('hex'), salt);

  const user = await prisma.user.create({
    data: {
      fullName: faculty.fullName,
      email: faculty.email,
      employeeId: faculty.employeeId,
      passwordHash,
      passwordSalt: salt,
      role: UserRole.EMPLOYEE,
      createdAt,
    },
  });
  const profile = await prisma.facultyProfile.create({
    data: {
      name: faculty.fullName,
      employeeId: faculty.employeeId,
      semester: fixedReviewPeriodLabel,
      createdByUserId: user.id,
      createdAt,
      features: {
        baselineData: {
          personalData: {
            fullName: faculty.fullName,
            employeeId: faculty.employeeId,
            academicRank: faculty.rank,
            highestEducationalAttainment: faculty.attainment,
            department: faculty.department,
          },
          promotionHistory: [],
        },
      },
    },
  });

  const entry: RegistryEntry = { seq: faculty.seq, userId: user.id, profileId: profile.id, docs: [], loadedAt: new Date().toISOString() };
  registry[String(faculty.seq)] = entry;
  saveRegistry(registry); // record the user immediately so a crash can still be cleaned up

  for (const doc of faculty.docs) {
    const docCreatedAt = new Date(createdAt.getTime() + rng.int(1, 600) * 60_000);
    entry.docs.push(await processDocument(faculty, doc, user.id, profile.id, docCreatedAt, rng));
    saveRegistry(registry);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const cohort = buildCohort(SEED, 100);
  const registry = readRegistry();

  let targets: SyntheticFaculty[] = [];
  if (args.includes('--all')) targets = cohort;
  else if (args.includes('--pilot')) targets = [cohort.find((f) => f.delivery === 'ocr-text')!, ...cohort.filter((f) => f.delivery === 'pdf').slice(0, 2)];
  else {
    const seqArg = args.find((a) => a.startsWith('--seq='));
    const wanted = new Set((seqArg?.slice(6) ?? '').split(',').filter(Boolean).map(Number));
    targets = cohort.filter((f) => wanted.has(f.seq));
  }
  targets = targets.filter((f) => !registry[String(f.seq)]);

  const provider = resolveEffectiveOcrProvider(ocrConfig);
  console.log(`OCR provider: ${provider} | storage: ${getActiveStorageProvider()} | targets: ${targets.map((t) => t.seq).join(',') || 'none'} | dry=${dry}`);
  if (provider !== 'tesseract') throw new Error(`Refusing to run: OCR resolved to "${provider}", which would use the shared production quota.`);
  if (getActiveStorageProvider() !== 'r2') throw new Error('Refusing to run: storage provider is not R2.');
  if (dry) {
    for (const f of targets) console.log(`seq ${f.seq} ${f.fullName} (${f.delivery}, ${f.archetype}) docs=${f.docs.length}`);
    return;
  }

  for (const faculty of targets) {
    const started = Date.now();
    try {
      await loadFaculty(faculty, registry);
      console.log(`loaded seq ${faculty.seq} ${faculty.fullName}: ${faculty.docs.length} docs in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    } catch (error) {
      console.log(`FAILED seq ${faculty.seq}: ${error instanceof Error ? error.message.split('\n').slice(-1)[0] : error}`);
      break; // stop so a partial faculty can be inspected rather than compounding errors
    }
  }
  await terminateOcrWorkers();
}

if (require.main === module) {
  main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
