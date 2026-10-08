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
import { extractImageTextWithOcr, isOcrReady, runTesseractOcr, type OcrConfig, type OcrResult } from '../ocr';
import { EmployeeUploadType, UploadPanelDefinition, ProcessedUploadResult, ProfileLinkResult } from '../types';
import { findBestMatchingProfile, scoreProfileFilename } from './profileMatching';
import { checkPromotionWindow, PROMOTION_WINDOW_LABEL } from './promotionWindow';

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

  if (!file.buffer || file.buffer.length === 0) {
    throw new Error('The uploaded file is empty');
  }

  const isCsv = /\.csv$/i.test(fileName);
  const isSpreadsheet = /\.(xlsx|xls)$/i.test(fileName);

  if (isSpreadsheet || isCsv) {
    throw new Error('Spreadsheet and CSV uploads are no longer supported in the criterion-based upload panels');
  }

  const linkage = await resolveUploadProfileLink(ownerUserId, fileName, requestedProfileId, ownerIdentity);
  const profileId = linkage.profileId;
  const targetPanelKey = panelKey || 'kra1_teaching_effectiveness';
  const targetPanelDefinition = findUploadPanelDefinition(targetPanelKey);
  const storage = await persistUploadedDocumentFile(file, targetPanelKey);

  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    let extractedText = '';
    try {
      const data = await pdf(file.buffer);
      extractedText = (data.text || '').trim();
    } catch {
      extractedText = '';
    }

    let ocrFallback: { provider: string; lineCount: number } | null = null;
    let ocrError: string | null = null;

    if (isPdfTextInsufficient(extractedText)) {
      try {
        const ocrResult = await extractImageTextWithOcr(file.buffer, fileName, ocrConfig, 'PDF');
        if (ocrResult.text.trim().length > extractedText.length) {
          extractedText = ocrResult.text.trim();
          ocrFallback = { provider: ocrResult.provider, lineCount: ocrResult.lineCount };
          ocrError = null;
        }
      } catch (error) {
        ocrError = error instanceof Error ? error.message : 'OCR fallback failed';
      }
    }

    const detectedPanelKey = inferBestUploadPanelKey(extractedText, targetPanelKey);
    const analysis = analyzeDocumentContent(extractedText, targetPanelKey, 'pdf');
    const dateCheck = checkPromotionWindow(extractedText);

    const isEducationalOrBackgroundPanel =
      targetPanelKey.startsWith('kra4_') ||
      targetPanelKey === 'kra3_administrative_designation' ||
      detectedPanelKey.startsWith('kra4_');

    if (dateCheck.status === 'out_of_range' && !isEducationalOrBackgroundPanel) {
      await removePersistedDocumentFile(storage);
      throw new Error(
        `This document is dated ${dateCheck.matchedDate}, outside the current promotion period (${PROMOTION_WINDOW_LABEL}). Only documents relevant to this promotion cycle can be uploaded.`,
      );
    }

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
            panelKey: targetPanelKey,
            panelTitle: targetPanelDefinition.title,
            detectedPanelKey,
            storedForTraining: true,
            ...(ocrFallback ? { ocr: ocrFallback } : {}),
            ...(ocrError ? { ocrError } : {}),
            analysis,
            dateCheck,
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
        panelKey: targetPanelKey,
        profileId,
        linkage,
        textPreview: extractedText.slice(0, 1000),
        analysis,
        dateCheck,
      };
    } catch (error) {
      await removePersistedDocumentFile(storage);
      throw error;
    }
  }

  if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tif|tiff)$/i.test(fileName)) {
    let ocrResult: OcrResult;
    let ocrError: string | null = null;
    try {
      ocrResult = await extractImageTextWithOcr(file.buffer, fileName, ocrConfig);
    } catch (error) {
      ocrError = error instanceof Error ? error.message : 'OCR failed';
      try {
        ocrResult = await runTesseractOcr(file.buffer, fileName);
      } catch {
        ocrResult = {
          provider: 'tesseract',
          text: '',
          lineCount: 0,
        };
      }
    }
    const extractedText = ocrResult.text.trim();
    const detectedPanelKey = inferBestUploadPanelKey(extractedText, targetPanelKey);
    const analysis = analyzeDocumentContent(extractedText, targetPanelKey, 'image');
    const dateCheck = checkPromotionWindow(extractedText);

    const isEducationalOrBackgroundPanel =
      targetPanelKey.startsWith('kra4_') ||
      targetPanelKey === 'kra3_administrative_designation' ||
      detectedPanelKey.startsWith('kra4_');

    if (dateCheck.status === 'out_of_range' && !isEducationalOrBackgroundPanel) {
      await removePersistedDocumentFile(storage);
      throw new Error(
        `This document is dated ${dateCheck.matchedDate}, outside the current promotion period (${PROMOTION_WINDOW_LABEL}). Only documents relevant to this promotion cycle can be uploaded.`,
      );
    }

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
            panelKey: targetPanelKey,
            panelTitle: targetPanelDefinition.title,
            detectedPanelKey,
            storedForTraining: true,
            ocr: {
              provider: ocrResult.provider,
              lineCount: ocrResult.lineCount,
            },
            ...(ocrError ? { ocrError } : {}),
            analysis,
            dateCheck,
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
        panelKey: targetPanelKey,
        profileId,
        linkage,
        textPreview: extractedText.slice(0, 1000),
        analysis,
        dateCheck,
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

  if (profiles.length === 1) {
    return {
      profileId: profiles[0].id,
      matchedBy: 'sole-profile',
      matchedName: profiles[0].name,
      matchedEmployeeId: profiles[0].employeeId ?? null,
    };
  }

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

  if (profiles.length > 1) {
    return {
      profileId: profiles[0].id,
      matchedBy: 'most-recent-profile',
      matchedName: profiles[0].name,
      matchedEmployeeId: profiles[0].employeeId ?? null,
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

export function getKraStoragePath(panelKey?: string, originalName?: string, mimeType?: string): string {
  const extension = deriveStorageExtension(originalName || '', mimeType || '');
  const uniqueId = crypto.randomUUID();
  const cleanPanelKey = typeof panelKey === 'string' && panelKey.trim() ? parseUploadPanelKey(panelKey) : 'general';

  let kraFolder = 'general';
  if (cleanPanelKey.startsWith('kra1_')) {
    kraFolder = 'kra1';
  } else if (cleanPanelKey.startsWith('kra2_')) {
    kraFolder = 'kra2';
  } else if (cleanPanelKey.startsWith('kra3_')) {
    kraFolder = 'kra3';
  } else if (cleanPanelKey.startsWith('kra4_')) {
    kraFolder = 'kra4';
  }

  return `${kraFolder}/${cleanPanelKey}/${uniqueId}${extension}`;
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

async function persistUploadedDocumentFile(file: Express.Multer.File, panelKey?: string) {
  const filePath = getKraStoragePath(panelKey, file.originalname, file.mimetype);

  try {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (!error) {
        return {
          provider: 'supabase',
          bucket: DOCUMENTS_BUCKET,
          path: filePath,
        };
      }
    }
  } catch {
    // Proceed to local file storage fallback
  }

  // Fallback to local storage
  await fs.mkdir(documentStorageRoot, { recursive: true });
  const localFilePath = path.join(documentStorageRoot, filePath);
  await fs.writeFile(localFilePath, file.buffer);
  const relativePath = path.relative(repoRoot, localFilePath);

  return {
    provider: 'local',
    relativePath,
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

function isPdfTextInsufficient(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 100) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  const watermarks = ['camscanner', 'scanned with', 'scanned by', 'adobe scan', 'photoperfect', 'page 1 of', 'page 1'];
  const hasWatermark = watermarks.some((term) => lower.includes(term));
  const alphaCharCount = lower.replace(/[^a-z0-9]/g, '').length;
  if (hasWatermark && alphaCharCount < 100) {
    return true;
  }
  return false;
}
