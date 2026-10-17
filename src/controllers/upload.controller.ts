import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { AuditLogAction, DocumentKind, UserRole } from '@prisma/client';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  parseDocumentKind,
  parseEmployeeUploadType,
  parseUploadPanelKey,
  findUploadPanelDefinition,
  describeUploadProcessingError,
  toPrismaJson,
  getKraStoragePath,
  isPdfTextInsufficient,
} from '../utils/document.utils';
import { getSupabase, DOCUMENTS_BUCKET } from '../config/supabase';
import { ocrConfig } from '../config/globals';
import { analyzeDocumentContent, inferBestUploadPanelKey } from '../utils';
import { checkPromotionWindow, PROMOTION_WINDOW_LABEL } from '../utils/promotionWindow';
import { extractImageTextWithOcr, isOcrReady, ocrBudgetForRequest, readOcrProgress, summarizeOcrResult } from '../ocr';
import { ProcessedUploadResult } from '../types';
import { resolveUploadProfileLink } from '../utils/document.utils';
import { fixedReviewPeriodLabel } from '../constants/reviewCycle';
import pdf from 'pdf-parse';
import { env } from '../config/env';

import {
  createSignedUploadUrl,
  downloadFileBuffer,
  getActiveStorageProvider,
  getDefaultBucketName,
  type StorageDescriptor,
  type StorageProviderType,
} from '../services/storage.service';

/**
 * POST /api/documents/signed-upload-url
 * Returns a short-lived signed URL (Cloudflare R2, S3, or Supabase) so the browser
 * can upload directly to storage — bypassing the 4.5 MB Vercel serverless body limit.
 * Storage key is routed into KRA-specific folders (e.g. kra1/kra1_teaching_effectiveness/<uuid>.pdf).
 */
export const getSignedUploadUrl = async (req: Request, res: Response) => {
  const { fileName, mimeType, panelKey } = req.body as {
    fileName?: unknown;
    mimeType?: unknown;
    panelKey?: unknown;
  };

  if (typeof fileName !== 'string' || !fileName.trim()) {
    return res.status(400).json({ error: 'fileName is required' });
  }

  const rawPanelKey = typeof panelKey === 'string' ? panelKey : undefined;
  const rawMimeType = typeof mimeType === 'string' ? mimeType : undefined;
  const storageKey = getKraStoragePath(rawPanelKey, String(fileName), rawMimeType);

  try {
    const result = await createSignedUploadUrl(
      storageKey,
      rawMimeType || 'application/octet-stream',
    );

    return res.json({
      signedUrl: result.signedUrl,
      storagePath: result.storagePath,
      token: result.token ?? undefined,
      provider: result.provider,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Could not create signed URL: ${err?.message ?? 'unknown error'}` });
  }
};

/**
 * POST /api/documents/register
 * Called after a successful direct-to-storage browser upload (Cloudflare R2 / S3 / Supabase).
 * Reads the file from storage, runs OCR, saves the database record.
 * No file body is sent to this endpoint — it is only JSON metadata.
 */
export const registerUploadedDocument = async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  const {
    storagePath,
    originalName,
    mimeType: rawMimeType,
    kind: rawKind,
    panelKey: rawPanelKey,
    uploadType: rawUploadType,
    profileId: requestedProfileId,
    documentType: rawDocumentType,
    provider: rawProvider,
    bucket: rawBucket,
  } = req.body as Record<string, unknown>;

  if (typeof storagePath !== 'string' || !storagePath.trim()) {
    return res.status(400).json({ error: 'storagePath is required' });
  }
  if (typeof originalName !== 'string' || !originalName.trim()) {
    return res.status(400).json({ error: 'originalName is required' });
  }

  const mimeType = typeof rawMimeType === 'string' ? rawMimeType : 'application/octet-stream';
  const kind = parseDocumentKind(rawKind);
  const panelKey = parseUploadPanelKey(rawPanelKey);
  const panelDefinition = findUploadPanelDefinition(panelKey);
  const uploadType = parseEmployeeUploadType(rawUploadType);
  const documentType = typeof rawDocumentType === 'string' && rawDocumentType.trim() ? rawDocumentType : null;
  const resolvedProfileId =
    typeof requestedProfileId === 'string' && requestedProfileId.trim() ? requestedProfileId : null;

  const storageProvider: StorageProviderType =
    typeof rawProvider === 'string' && (rawProvider === 'r2' || rawProvider === 's3' || rawProvider === 'supabase')
      ? (rawProvider as StorageProviderType)
      : getActiveStorageProvider();

  const bucket = typeof rawBucket === 'string' && rawBucket.trim()
    ? rawBucket
    : getDefaultBucketName();

  const storage: StorageDescriptor = {
    provider: storageProvider,
    bucket,
    path: storagePath,
  };

  // Download the file from storage for OCR / text processing
  let fileBuffer: Buffer;
  try {
    fileBuffer = await downloadFileBuffer(storage);
  } catch (downloadError: any) {
    return res.status(404).json({
      error: `Could not retrieve uploaded file from storage: ${downloadError?.message ?? 'file not found'}`,
    });
  }

  const fileName = String(originalName).trim();
  const lowerMime = mimeType.toLowerCase();

  const linkage = await resolveUploadProfileLink(
    req.user!.id,
    fileName,
    resolvedProfileId,
    { fullName: req.user!.fullName, employeeId: req.user!.employeeId },
  );
  const profileId = linkage.profileId;

  const results: ProcessedUploadResult[] = [];
  const failures: Array<{ originalName: string; error: string }> = [];

  try {
    let extractedText = '';
    let fileType: 'pdf' | 'image' = 'image';
    let ocrFallback: ReturnType<typeof summarizeOcrResult> | null = null;
    let ocrError: string | null = null;

    const isPdf = lowerMime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const isImage = lowerMime.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tif|tiff)$/i.test(fileName);

    if (!isPdf && !isImage) {
      return res.status(400).json({ error: 'Unsupported document type. Only PDF and images are allowed.' });
    }

    if (isPdf) {
      fileType = 'pdf';
      let pageCount = 1;
      try {
        const data = await pdf(fileBuffer);
        extractedText = data.text || '';
        pageCount = data.numpages || 1;
      } catch (err) {
        ocrError = err instanceof Error ? err.message : 'PDF text extraction failed';
        extractedText = '';
      }

      // Use the same threshold as the regular multipart route. A PDF with a
      // short scanner watermark technically has a text layer, but still needs
      // OCR. Do not bypass Windows OCR here: direct Supabase uploads are the
      // normal production path.
      if (isPdfTextInsufficient(extractedText, pageCount) && isOcrReady(ocrConfig)) {
        try {
          const ocrResult = await extractImageTextWithOcr(fileBuffer, fileName, ocrBudgetForRequest(requestStartedAt, ocrConfig), 'PDF');
          if (ocrResult.text.trim().length > extractedText.trim().length) {
            extractedText = ocrResult.text.trim();
          }
          // Keep the OCR progress whenever pages are left, so the rest of a
          // long scan can be read by /continue-ocr.
          if (ocrResult.text.trim() === extractedText || ocrResult.nextPage) {
            ocrFallback = summarizeOcrResult(ocrResult);
          }
        } catch (error) {
          ocrError = error instanceof Error ? error.message : 'OCR fallback failed';
        }
      }
    } else {
      fileType = 'image';
      // OCR already falls back from the cloud provider to local OCR per page.
      // If every engine fails, still save the upload (the file is already in
      // storage) and record why, rather than rejecting it.
      try {
        const ocrResult = await extractImageTextWithOcr(fileBuffer, fileName, ocrBudgetForRequest(requestStartedAt, ocrConfig));
        extractedText = ocrResult.text.trim();
        ocrFallback = summarizeOcrResult(ocrResult);
      } catch (error) {
        ocrError = error instanceof Error ? error.message : 'OCR failed';
      }
    }

    const targetPanelKey = panelKey || inferBestUploadPanelKey(extractedText, 'kra1_teaching_effectiveness');
    const targetPanelDefinition = findUploadPanelDefinition(targetPanelKey);
    const computedAnalysis = analyzeDocumentContent(extractedText, targetPanelKey, fileType);
    const dateCheck = checkPromotionWindow(extractedText);


    const savedDocument = await prisma.uploadedDocument.create({
      data: {
        ownerUserId: req.user!.id,
        profileId,
        kind,
        originalName: fileName,
        mimeType,
        extractedText,
        extractionMetadata: toPrismaJson({
          uploadType,
          panelKey: targetPanelKey,
          panelTitle: targetPanelDefinition.title,
          documentType,
          storedForTraining: true,
          ...(ocrFallback ? { ocr: ocrFallback } : {}),
          ...(ocrError ? { ocrError } : {}),
          analysis: computedAnalysis,
          dateCheck,
          linkage,
          storage,
        }),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditLogAction.UPLOAD,
        userId: req.user!.id,
        targetId: savedDocument.id,
        details: { originalName: fileName, panelKey: targetPanelKey, uploadType, method: `direct-${storageProvider}` },
      },
    });

    results.push({
      originalName: fileName,
      fileType,
      documentId: savedDocument.id,
      uploadType,
      panelKey: targetPanelKey,
      profileId,
      linkage,
      textPreview: extractedText.slice(0, 1000),
      analysis: computedAnalysis,
      dateCheck,
      ...(ocrFallback?.nextPage ? { ocrProgress: readOcrProgress({ ocr: ocrFallback }) } : {}),
    });
  } catch (error) {
    failures.push({
      originalName: String(originalName),
      error: describeUploadProcessingError(error),
    });
  }

  if (!results.length) {
    return res.status(400).json({
      error: failures[0]?.error ?? 'Document could not be processed',
      failures,
    });
  }

  return res.json({
    fileType: results[0].fileType,
    documentId: results[0].documentId,
    panelKey: results[0].panelKey,
    uploadType,
    profileId: results[0].profileId,
    linkage: results[0].linkage,
    textPreview: results[0].textPreview,
    analysis: results[0].analysis,
    results,
    failures,
    summary: {
      requestedCount: 1,
      successCount: results.length,
      failureCount: failures.length,
    },
  });
};
