import { DocumentKind, Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import pdf from 'pdf-parse';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../config/db';
import { getSupabase } from '../config/supabase';
import { repoRoot } from '../config/globals';
import { uploadPanels } from '../uploadPanels';
import { analyzeDocumentContent, inferBestUploadPanelKey } from '../utils';
import { extractImageTextWithOcr, type OcrConfig } from '../ocr';
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
}): Promise<ProcessedUploadResult> {
  const { file, ownerUserId, requestedProfileId, kind, panelKey, panelTitle, uploadType, ocrConfig } = args;
  const mimeType = file.mimetype.toLowerCase();
  const fileName = file.originalname;
  const isCsv = /\.csv$/i.test(fileName);
  const isSpreadsheet = /\.(xlsx|xls)$/i.test(fileName);

  if (isSpreadsheet || isCsv) {
    throw new Error('Spreadsheet and CSV uploads are no longer supported in the criterion-based upload panels');
  }

  const linkage = await resolveUploadProfileLink(ownerUserId, fileName, requestedProfileId);
  const profileId = linkage.profileId;
  const storage = await persistUploadedDocumentFile(file);

  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    const data = await pdf(file.buffer);
    const detectedPanelKey = inferBestUploadPanelKey(data.text, panelKey);
    const detectedPanelDefinition = findUploadPanelDefinition(detectedPanelKey);
    const analysis = analyzeDocumentContent(data.text, detectedPanelKey, 'pdf');

    try {
      const savedDocument = await prisma.uploadedDocument.create({
        data: {
          ownerUserId,
          profileId,
          kind,
          originalName: fileName,
          mimeType: file.mimetype,
          extractedText: data.text,
          extractionMetadata: toPrismaJson({
            uploadType,
            panelKey: detectedPanelKey,
            panelTitle: detectedPanelDefinition.title,
            storedForTraining: true,
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
        textPreview: data.text.slice(0, 1000),
        analysis,
      };
    } catch (error) {
      await removePersistedDocumentFile(storage);
      throw error;
    }
  }

  if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tif|tiff)$/i.test(fileName)) {
    const ocrResult = await extractImageTextWithOcr(file.buffer, fileName, ocrConfig);
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
      bucket: typeof storage.bucket === 'string' ? (storage.bucket as string) : 'documents',
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
    .from('documents')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  return {
    provider: 'supabase',
    bucket: 'documents',
    path: filePath,
  };
}

export async function removePersistedDocumentFile(storageRef: any) {
  try {
    if (storageRef?.provider === 'supabase' && storageRef.path) {
      await getSupabase().storage.from('documents').remove([storageRef.path]);
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
