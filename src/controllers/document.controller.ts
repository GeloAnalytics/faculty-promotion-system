import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { UserRole } from '@prisma/client';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  parseDocumentKind,
  parseEmployeeUploadType,
  parseUploadPanelKey,
  findUploadPanelDefinition,
  processUploadedDocument,
  describeUploadProcessingError,
  resolveStoredDocumentPath,
} from '../utils/document.utils';
import { ocrConfig } from '../config/globals';
import { ProcessedUploadResult } from '../types';

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
    },
  });

  if (!document) {
    return res.status(404).json({ error: 'Uploaded document not found' });
  }

  if (req.user!.role === UserRole.EMPLOYEE && document.ownerUserId !== req.user!.id) {
    return res.status(403).json({ error: 'You can only view your own uploaded documents' });
  }

  const storedPath = resolveStoredDocumentPath(document.extractionMetadata);
  if (!storedPath) {
    return res.status(404).json({ error: 'Stored document file is unavailable for preview' });
  }

  try {
    await fs.access(storedPath);
  } catch {
    return res.status(404).json({ error: 'Stored document file is unavailable for preview' });
  }

  const contentType = document.mimeType || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${document.originalName.replace(/"/g, '\\"')}"`);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  await pipeline(createReadStream(storedPath), res);
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

  if (storedPath) {
    try {
      await fs.unlink(storedPath);
    } catch {
      // Ignore file cleanup failures so deletion still succeeds.
    }
  }

  return res.json({
    deleted: true,
    documentId: document.id,
    originalName: document.originalName,
    message: `${document.originalName} was deleted successfully`,
  });
};
