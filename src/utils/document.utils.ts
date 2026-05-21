import { DocumentKind, Prisma } from '@prisma/client';
import { z } from 'zod';
import pdf from 'pdf-parse';
import { prisma } from '../config/db';
import { uploadPanels } from '../uploadPanels';
import { analyzeDocumentContent } from '../utils';
import { extractImageTextWithOcr, type OcrConfig } from '../ocr';
import { UploadPanelDefinition, ProcessedUploadResult, ProfileLinkResult } from '../types';
import { findBestMatchingProfile, scoreProfileFilename } from './profileMatching';

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
export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
