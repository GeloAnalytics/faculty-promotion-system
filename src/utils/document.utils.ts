import { DocumentKind, Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import pdf from 'pdf-parse';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../config/db';
import { getSupabase, DOCUMENTS_BUCKET } from '../config/supabase';
import { repoRoot } from '../config/globals';
import { fixedReviewPeriodLabel } from '../constants/reviewCycle';
import { uploadPanels } from '../uploadPanels';
import { analyzeDocumentContent, inferBestUploadPanelKey } from '../utils';
import { extractImageTextWithOcr, isOcrReady, runTesseractOcr, type OcrConfig } from '../ocr';
import { EmployeeUploadType, UploadPanelDefinition, ProcessedUploadResult, ProfileLinkResult } from '../types';
import { findBestMatchingProfile, scoreProfileFilename } from './profileMatching';

const documentStorageRoot = path.join(repoRoot, 'uploads', 'documents');

export function parseDocumentKind(input: unknown): DocumentKind {
  const normalized = typeof input === 'string' ? input.toUpperCase() : 'REQUIREMENT';
  if (normalized === 'GUIDELINE') {
    return DocumentKind.GUIDELINE;
  }
  if (normalized === 'TRAINING_SUPPORT') {
    return DocumentKind.TRAINING_SUPPORT;
  }
  return DocumentKind.REQUIREMENT;
}

export function parseUploadPanelKey(input: unknown): UploadPanelDefinition['key'] {
  const value = typeof input === 'string' ? input : '';
  const matched = uploadPanels.find((panel) => panel.key === value);
  return matched ? matched.key : uploadPanels[0].key;
}

export function parseEmployeeUploadType(input: unknown): EmployeeUploadType {
  if (input === 'evidence') {
    return 'evidence';
  }

  if (input === 'score-sheet') {
    return 'score-sheet';
  }

  return 'legacy';
}

export function findUploadPanelDefinition(panelKey: UploadPanelDefinition['key']) {
  return uploadPanels.find((panel) => panel.key === panelKey) ?? uploadPanels[0];
}

export async function processUploadedDocument(args: {
  file: Express.Multer.File;
  ownerUserId: string;
  requestedProfileId: string | null;
  kind: DocumentKind;
  panelKey: UploadPanelDefinition['key'];
  panelTitle: string;
  uploadType: EmployeeUploadType;
  ocrConfig: OcrConfig;
  ownerIdentity?: { fullName: string; employeeId: string | null };
}): Promise<ProcessedUploadResult> {
  const { file, ownerUserId, requestedProfileId, kind, panelKey, panelTitle, uploadType, ocrConfig, ownerIdentity } = args;
  const mimeType = file.mimetype.toLowerCase();
  const fileName = file.originalname;
  const isCsv = /\.csv$/i.test(fileName);
  const isSpreadsheet = /\.(xlsx|xls)$/i.test(fileName);

  if (isSpreadsheet || isCsv) {
    throw new Error('Spreadsheet and CSV uploads are no longer supported in the criterion-based upload panels');
  }

  const linkage = await resolveUploadProfileLink(ownerUserId, fileName, requestedProfileId, ownerIdentity);
  const profileId = linkage.profileId;
  const storage = await persistUploadedDocumentFile(file);

  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    const data = await pdf(file.buffer);
    let extractedText = data.text;
    let ocrFallback: { provider: string; lineCount: number } | null = null;

    // pdf-parse only reads a PDF's embedded text layer - a scanned or
    // photographed document saved as PDF (common for certificates,
    // appointment letters, ID scans) has no text layer at all and always
    // comes back empty here, even though the same image content would OCR
    // just fine if it were uploaded as a plain image. When pdf-parse found
    // next to nothing, forward the original PDF buffer to the OCR provider
    // instead (OCR.space can OCR PDF files directly) rather than silently
    // accepting a blank document. Local Windows OCR only works from
    // decoded bitmaps, so it can't be used for this fallback.
    const MIN_MEANINGFUL_PDF_TEXT_LENGTH = 20;
    const canAttemptPdfOcrFallback = ocrConfig.provider !== 'windows' && isOcrReady(ocrConfig);
    let ocrError: string | null = null;
    if (extractedText.trim().length < MIN_MEANINGFUL_PDF_TEXT_LENGTH && canAttemptPdfOcrFallback) {
      try {
        const ocrResult = await extractImageTextWithOcr(file.buffer, fileName, ocrConfig, 'PDF');
        if (ocrResult.text.trim().length > extractedText.trim().length) {
          extractedText = ocrResult.text.trim();
          ocrFallback = { provider: ocrResult.provider, lineCount: ocrResult.lineCount };
        }
      } catch (error) {
        // Best-effort only - keep whatever pdf-parse already found (even if empty) if OCR also
        // fails, but record why so a stuck-at-zero score doesn't require digging through the
        // OCR provider's logs to diagnose (e.g. free-tier file-size caps, timeouts).
        ocrError = error instanceof Error ? error.message : 'OCR fallback failed';
      }
    }

    // The configured provider may reject the file outright (OCR.space's free
    // plan 413s anything over 1.5MB), time out, or simply come back short.
    // Self-hosted Tesseract has no size cap, so it gets a final attempt
    // whenever we still don't have real text - unless it's already the
    // configured provider, in which case the block above already tried it.
    if (extractedText.trim().length < MIN_MEANINGFUL_PDF_TEXT_LENGTH && ocrConfig.provider !== 'tesseract') {
      try {
        const tesseractResult = await runTesseractOcr(file.buffer, fileName, 'PDF');
        if (tesseractResult.text.trim().length > extractedText.trim().length) {
          extractedText = tesseractResult.text.trim();
          ocrFallback = { provider: tesseractResult.provider, lineCount: tesseractResult.lineCount };
          ocrError = null;
        }
      } catch (error) {
        ocrError = ocrError ?? (error instanceof Error ? error.message : 'Tesseract OCR fallback failed');
      }
    }

    const detectedPanelKey = inferBestUploadPanelKey(extractedText, panelKey);
    const detectedPanelDefinition = findUploadPanelDefinition(detectedPanelKey);
    const analysis = analyzeDocumentContent(extractedText, detectedPanelKey, 'pdf');

    try {
      const savedDocument = await prisma.uploadedDocument.create({
        data: {
          ownerUserId,
          profileId,
          kind,
          originalName: fileName,
          mimeType: file.mimetype,
          extractedText,
          extractionMetadata: toPrismaJson({
            uploadType,
            panelKey: detectedPanelKey,
            panelTitle: detectedPanelDefinition.title,
            storedForTraining: true,
            ...(ocrFallback ? { ocr: ocrFallback } : {}),
            ...(ocrError ? { ocrError } : {}),
            analysis,
            linkage,
            storage,
          }),
        },
      });

      return {
        originalName: fileName,
        fileType: 'pdf',
        documentId: savedDocument.id,
        uploadType,
        panelKey: detectedPanelKey,
        profileId,
        linkage,
        textPreview: extractedText.slice(0, 1000),
        analysis,
      };
    } catch (error) {
      await removePersistedDocumentFile(storage);
      throw error;
    }
  }

  if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tif|tiff)$/i.test(fileName)) {
    let ocrResult;
    let ocrError: string | null = null;
    try {
      ocrResult = await extractImageTextWithOcr(file.buffer, fileName, ocrConfig);
    } catch (error) {
      // Same rationale as the PDF path above: the configured provider can
      // reject the file (e.g. OCR.space's free-plan size cap) or time out,
      // so fall back to the uncapped self-hosted engine before giving up.
      if (ocrConfig.provider === 'tesseract') {
        throw error;
      }
      ocrError = error instanceof Error ? error.message : 'OCR failed';
      ocrResult = await runTesseractOcr(file.buffer, fileName);
    }
    const extractedText = ocrResult.text.trim();
    const detectedPanelKey = inferBestUploadPanelKey(extractedText, panelKey);
    const detectedPanelDefinition = findUploadPanelDefinition(detectedPanelKey);
    const analysis = analyzeDocumentContent(extractedText, detectedPanelKey, 'image');

    try {
      const savedDocument = await prisma.uploadedDocument.create({
        data: {
          ownerUserId,
          profileId,
          kind,
          originalName: fileName,
          mimeType: file.mimetype,
          extractedText,
          extractionMetadata: toPrismaJson({
            uploadType,
            panelKey: detectedPanelKey,
            panelTitle: detectedPanelDefinition.title,
            storedForTraining: true,
            ocr: {
              provider: ocrResult.provider,
              lineCount: ocrResult.lineCount,
            },
            ...(ocrError ? { ocrError } : {}),
            analysis,
            linkage,
            storage,
          }),
        },
      });

      return {
        originalName: fileName,
        fileType: 'image',
        documentId: savedDocument.id,
        uploadType,
        panelKey: detectedPanelKey,
        profileId,
        linkage,
        textPreview: extractedText.slice(0, 1000),
        analysis,
      };
    } catch (error) {
      await removePersistedDocumentFile(storage);
      throw error;
    }
  }

  await removePersistedDocumentFile(storage);
  throw new Error('Unsupported document type');
}

export function describeUploadProcessingError(error: unknown) {
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

export async function resolveUploadProfileLink(
  ownerUserId: string,
  originalName: string,
  requestedProfileId: string | null,
  ownerIdentity?: { fullName: string; employeeId: string | null },
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
  if (matchedProfile) {
    return {
      profileId: matchedProfile.id,
      matchedBy: 'filename',
      matchedName: matchedProfile.name,
      matchedEmployeeId: matchedProfile.employeeId ?? null,
    };
  }

  // Filename matching exists to disambiguate multiple profiles under one
  // account - it was never meant to gate a single profile out. With the
  // auto-created-on-first-upload model there is normally exactly one profile
  // per employee, and the uploaded file's name (e.g. a real scanned document
  // bearing the faculty member's own name) has no reason to match "Demo
  // Employee" or similar account identity text. Default to the most recent
  // profile rather than stranding the upload with profileId: null.
  if (profiles.length === 1) {
    return {
      profileId: profiles[0].id,
      matchedBy: 'sole-profile',
      matchedName: profiles[0].name,
      matchedEmployeeId: profiles[0].employeeId ?? null,
    };
  }

  // A brand-new employee has no profile at all yet - the current upload-driven
  // workflow never runs a separate "create my profile" step, so the first
  // upload is what brings the profile into existence (OCR-only design: no
  // manually-typed intake form gates getting started).
  if (!profiles.length && ownerIdentity) {
    const autoCreatedProfile = await prisma.facultyProfile.create({
      data: {
        employeeId: ownerIdentity.employeeId,
        name: ownerIdentity.fullName,
        semester: fixedReviewPeriodLabel,
        features: {},
        createdByUserId: ownerUserId,
      },
      select: { id: true, name: true, employeeId: true },
    });

    return {
      profileId: autoCreatedProfile.id,
      matchedBy: 'auto-created',
      matchedName: autoCreatedProfile.name,
      matchedEmployeeId: autoCreatedProfile.employeeId ?? null,
    };
  }

  return {
    profileId: null,
    matchedBy: 'unmatched',
    matchedName: null,
    matchedEmployeeId: null,
  };
}

export async function attachExistingDocumentsToProfile(
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

export function resolveStoredDocumentPath(extractionMetadata: unknown) {
  const metadata = readJsonObject(extractionMetadata);
  const storage = readJsonObject(metadata.storage);
  
  if (storage.provider === 'supabase') {
    if (typeof storage.path !== 'string') return null;
    return {
      provider: 'supabase' as const,
      bucket: typeof storage.bucket === 'string' ? (storage.bucket as string) : DOCUMENTS_BUCKET,
      path: storage.path as string,
    };
  }

  const relativePath = typeof storage.relativePath === 'string' ? storage.relativePath : null;

  if (!relativePath) {
    return null;
  }

  const normalizedPath = path.resolve(repoRoot, relativePath);
  const normalizedRoot = path.resolve(repoRoot);
  if (!normalizedPath.startsWith(normalizedRoot)) {
    return null;
  }

  return {
    provider: 'local' as const,
    path: normalizedPath,
    relativePath,
  };
}

export { canViewUploadedDocument } from './documentAccess';

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

async function persistUploadedDocumentFile(file: Express.Multer.File) {
  const storageKey = crypto.randomUUID();
  const extension = deriveStorageExtension(file.originalname, file.mimetype);
  const filePath = `${storageKey}${extension}`;

  const { error } = await getSupabase().storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  return {
    provider: 'supabase',
    bucket: DOCUMENTS_BUCKET,
    path: filePath,
  };
}

export async function removePersistedDocumentFile(storageRef: any) {
  try {
    if (storageRef?.provider === 'supabase' && storageRef.path) {
      await getSupabase().storage.from(DOCUMENTS_BUCKET).remove([storageRef.path]);
    } else if (storageRef?.relativePath) {
      const absolutePath = path.resolve(repoRoot, storageRef.relativePath);
      await fs.unlink(absolutePath);
    }
  } catch {
    // Ignore cleanup failures
  }
}

function deriveStorageExtension(originalName: string, mimeType: string) {
  const extension = path.extname(originalName).trim();
  if (extension) {
    return extension.toLowerCase();
  }

  if (mimeType === 'application/pdf') {
    return '.pdf';
  }

  if (mimeType.startsWith('image/')) {
    const subtype = mimeType.split('/')[1];
    return subtype ? `.${subtype.replace(/[^a-z0-9]/gi, '')}` : '';
  }

  return '';
}
