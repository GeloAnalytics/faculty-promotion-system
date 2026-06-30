import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { UserRole, AuditLogAction } from '@prisma/client';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  canViewUploadedDocument,
  parseDocumentKind,
  parseEmployeeUploadType,
  parseUploadPanelKey,
  findUploadPanelDefinition,
  processUploadedDocument,
  describeUploadProcessingError,
  resolveStoredDocumentPath,
  removePersistedDocumentFile,
} from '../utils/document.utils';
import { getSupabase } from '../config/supabase';
import { ocrConfig } from '../config/globals';
import { ProcessedUploadResult } from '../types';

function readJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export const extractDocuments = async (req: Request, res: Response) => {
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  if (!uploadedFiles.length) {
    return res.status(400).json({ error: 'No documents uploaded' });
  }

  const kind = parseDocumentKind(req.body.kind);
  const uploadType = parseEmployeeUploadType(req.body.uploadType);
  const panelKey = parseUploadPanelKey(req.body.panelKey);
  const panelDefinition = findUploadPanelDefinition(panelKey);
  const requestedProfileId =
    typeof req.body.profileId === 'string' && req.body.profileId.trim() ? req.body.profileId : null;
  const results: ProcessedUploadResult[] = [];
  const failures: Array<{ originalName: string; error: string }> = [];

  if (uploadType === 'score-sheet' && uploadedFiles.length > 1) {
    return res.status(400).json({
      error: 'Score sheet uploads accept one file only',
    });
  }

  for (const file of uploadedFiles) {
    try {
      const result = await processUploadedDocument({
        file,
        ownerUserId: req.user!.id,
        requestedProfileId,
        kind,
        panelKey,
        panelTitle: panelDefinition.title,
        uploadType,
        ocrConfig,
      });

      await prisma.auditLog.create({
        data: {
          action: AuditLogAction.UPLOAD,
          userId: req.user!.id,
          targetId: result.documentId,
          details: { originalName: file.originalname, panelKey, uploadType },
        },
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
    uploadType,
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
};

export const viewDocument = async (req: Request, res: Response) => {
  const document = await prisma.uploadedDocument.findUnique({
    where: { id: req.params.documentId },
    select: {
      id: true,
      ownerUserId: true,
      originalName: true,
      mimeType: true,
      extractionMetadata: true,
      profile: {
        select: {
          createdByUserId: true,
        },
      },
    },
  });

  if (!document) {
    return res.status(404).json({ error: 'Uploaded document not found' });
  }

  if (
    !canViewUploadedDocument({
      requesterRole: req.user!.role,
      requesterUserId: req.user!.id,
      ownerUserId: document.ownerUserId,
      profileCreatedByUserId: document.profile?.createdByUserId ?? null,
    })
  ) {
    return res.status(403).json({ error: 'You can only view documents tied to your account' });
  }

  const stored = resolveStoredDocumentPath(document.extractionMetadata);
  if (!stored) {
    return res.status(404).json({ error: 'Stored document file is unavailable for preview' });
  }

  const contentType = document.mimeType || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${document.originalName.replace(/"/g, '\\"')}"`);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");

  if (stored.provider === 'supabase') {
    const { data, error } = await getSupabase().storage.from(stored.bucket).download(stored.path);
    if (error || !data) {
      return res.status(404).json({ error: 'Stored document file is unavailable for preview' });
    }
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.end(buffer);
  } else {
    try {
      await fs.access(stored.path);
    } catch {
      return res.status(404).json({ error: 'Stored document file is unavailable for preview' });
    }
    await pipeline(createReadStream(stored.path), res);
  }
};

export const replaceDocument = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No replacement document uploaded' });
  }

  const document = await prisma.uploadedDocument.findUnique({
    where: { id: req.params.documentId },
    select: {
      id: true,
      ownerUserId: true,
      profileId: true,
      kind: true,
      originalName: true,
      extractionMetadata: true,
      profile: {
        select: {
          createdByUserId: true,
        },
      },
    },
  });

  if (!document) {
    return res.status(404).json({ error: 'Uploaded document not found' });
  }

  if (req.user!.role === UserRole.EMPLOYEE && document.ownerUserId !== req.user!.id) {
    return res.status(403).json({ error: 'You can only replace your own uploaded documents' });
  }

  const metadata = readJsonObject(document.extractionMetadata);
  const kind = parseDocumentKind(readOptionalString(req.body.kind) ?? document.kind);
  const uploadType = parseEmployeeUploadType(readOptionalString(req.body.uploadType) ?? metadata.uploadType);
  const panelKey = parseUploadPanelKey(readOptionalString(req.body.panelKey) ?? metadata.panelKey);
  const panelDefinition = findUploadPanelDefinition(panelKey);
  const ownerUserId = document.ownerUserId ?? document.profile?.createdByUserId ?? req.user!.id;

  const result = await processUploadedDocument({
    file,
    ownerUserId,
    requestedProfileId: document.profileId,
    kind,
    panelKey,
    panelTitle: panelDefinition.title,
    uploadType,
    ocrConfig,
  });

  const storedPath = resolveStoredDocumentPath(document.extractionMetadata);
  await prisma.uploadedDocument.delete({
    where: { id: document.id },
  });

  await prisma.auditLog.create({
    data: {
      action: AuditLogAction.REPLACE,
      userId: req.user!.id,
      targetId: result.documentId,
      details: {
        oldDocumentId: document.id,
        oldOriginalName: document.originalName,
        newOriginalName: result.originalName,
      },
    },
  });

  const storage = readJsonObject(metadata.storage);
  await removePersistedDocumentFile(storage);

  return res.json({
    replaced: true,
    oldDocumentId: document.id,
    oldOriginalName: document.originalName,
    documentId: result.documentId,
    originalName: result.originalName,
    fileType: result.fileType,
    panelKey: result.panelKey,
    uploadType: result.uploadType,
    profileId: result.profileId,
    linkage: result.linkage,
    textPreview: result.textPreview,
    analysis: result.analysis,
    message: `${document.originalName} was replaced with ${result.originalName}`,
  });
};

export const deleteDocument = async (req: Request, res: Response) => {
  const document = await prisma.uploadedDocument.findUnique({
    where: { id: req.params.documentId },
    select: {
      id: true,
      ownerUserId: true,
      originalName: true,
      extractionMetadata: true,
    },
  });

  if (!document) {
    return res.status(404).json({ error: 'Uploaded document not found' });
  }

  if (req.user!.role === UserRole.EMPLOYEE && document.ownerUserId !== req.user!.id) {
    return res.status(403).json({ error: 'You can only delete your own uploaded documents' });
  }

  const storedPath = resolveStoredDocumentPath(document.extractionMetadata);
  await prisma.uploadedDocument.delete({
    where: { id: document.id },
  });

  await prisma.auditLog.create({
    data: {
      action: AuditLogAction.DELETE,
      userId: req.user!.id,
      targetId: document.id,
      details: {
        originalName: document.originalName,
      },
    },
  });

  const metadata = readJsonObject(document.extractionMetadata);
  const storage = readJsonObject(metadata.storage);
  await removePersistedDocumentFile(storage);

  return res.json({
    deleted: true,
    documentId: document.id,
    originalName: document.originalName,
    message: `${document.originalName} was deleted successfully`,
  });
};
