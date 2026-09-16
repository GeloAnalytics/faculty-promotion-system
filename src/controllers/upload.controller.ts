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
  processUploadedDocument,
  describeUploadProcessingError,
  toPrismaJson,
  getKraStoragePath,
} from '../utils/document.utils';
import { getSupabase, DOCUMENTS_BUCKET } from '../config/supabase';
import { ocrConfig } from '../config/globals';
import { analyzeDocumentContent, inferBestUploadPanelKey } from '../utils';
import { checkPromotionWindow, PROMOTION_WINDOW_LABEL } from '../utils/promotionWindow';
import { extractImageTextWithOcr, isOcrReady, runTesseractOcr } from '../ocr';
import { ProcessedUploadResult } from '../types';
import { resolveUploadProfileLink } from '../utils/document.utils';
import { fixedReviewPeriodLabel } from '../constants/reviewCycle';
import pdf from 'pdf-parse';
import { env } from '../config/env';

/**
 * POST /api/documents/signed-upload-url
 * Returns a short-lived Supabase signed URL so the browser can upload
 * directly to storage — bypassing the 4.5 MB Vercel serverless body limit.
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

  const { data, error } = await getSupabase()
    .storage.from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storageKey);

  if (error || !data) {
    return res.status(500).json({ error: `Could not create signed URL: ${error?.message ?? 'unknown error'}` });
  }

  return res.json({
    signedUrl: data.signedUrl,
    storagePath: storageKey,
    token: data.token,
  });
};

/**
 * POST /api/documents/register
 * Called after a successful direct-to-Supabase browser upload.
 * Reads the file from storage, runs OCR, saves the database record.
 * No file body is sent to this endpoint — it is only JSON metadata.
 */
export const registerUploadedDocument = async (req: Request, res: Response) => {
  const {
    storagePath,
    originalName,
    mimeType: rawMimeType,
    kind: rawKind,
    panelKey: rawPanelKey,
    uploadType: rawUploadType,
    profileId: requestedProfileId,
    documentType: rawDocumentType,
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

  // Download the file from Supabase storage for OCR processing
  const { data: fileData, error: downloadError } = await getSupabase()
    .storage.from(DOCUMENTS_BUCKET)
    .download(storagePath);

  if (downloadError || !fileData) {
    return res.status(404).json({
      error: `Could not retrieve uploaded file from storage: ${downloadError?.message ?? 'file not found'}`,
    });
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  const fileName = String(originalName).trim();
  const lowerMime = mimeType.toLowerCase();

  const linkage = await resolveUploadProfileLink(
    req.user!.id,
    fileName,
    resolvedProfileId,
    { fullName: req.user!.fullName, employeeId: req.user!.employeeId },
  );
  const profileId = linkage.profileId;

  const storage = {
    provider: 'supabase',
    bucket: DOCUMENTS_BUCKET,
    path: storagePath,
  };

  const results: ProcessedUploadResult[] = [];
  const failures: Array<{ originalName: string; error: string }> = [];

  try {
    let extractedText = '';
    let fileType: 'pdf' | 'image' = 'image';
    let ocrFallback: { provider: string; lineCount: number } | null = null;
    let ocrError: string | null = null;

    const isPdf = lowerMime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const isImage = lowerMime.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tif|tiff)$/i.test(fileName);

    if (!isPdf && !isImage) {
      return res.status(400).json({ error: 'Unsupported document type. Only PDF and images are allowed.' });
    }

    if (isPdf) {
      fileType = 'pdf';
      const data = await pdf(fileBuffer);
      extractedText = data.text;

      const MIN_MEANINGFUL_PDF_TEXT_LENGTH = 20;
      const canAttemptPdfOcrFallback = ocrConfig.provider !== 'windows' && isOcrReady(ocrConfig);

      if (extractedText.trim().length < MIN_MEANINGFUL_PDF_TEXT_LENGTH && canAttemptPdfOcrFallback) {
        try {
          const ocrResult = await extractImageTextWithOcr(fileBuffer, fileName, ocrConfig, 'PDF');
          if (ocrResult.text.trim().length > extractedText.trim().length) {
            extractedText = ocrResult.text.trim();
            ocrFallback = { provider: ocrResult.provider, lineCount: ocrResult.lineCount };
          }
        } catch (error) {
          ocrError = error instanceof Error ? error.message : 'OCR fallback failed';
        }
      }

      if (extractedText.trim().length < MIN_MEANINGFUL_PDF_TEXT_LENGTH && ocrConfig.provider !== 'tesseract') {
        try {
          const tesseractResult = await runTesseractOcr(fileBuffer, fileName, 'PDF');
          if (tesseractResult.text.trim().length > extractedText.trim().length) {
            extractedText = tesseractResult.text.trim();
            ocrFallback = { provider: tesseractResult.provider, lineCount: tesseractResult.lineCount };
            ocrError = null;
          }
        } catch (error) {
          ocrError = ocrError ?? (error instanceof Error ? error.message : 'Tesseract OCR fallback failed');
        }
      }
    } else {
      fileType = 'image';
      let ocrResult;
      try {
        ocrResult = await extractImageTextWithOcr(fileBuffer, fileName, ocrConfig);
      } catch (error) {
        if (ocrConfig.provider === 'tesseract') throw error;
        ocrError = error instanceof Error ? error.message : 'OCR failed';
        ocrResult = await runTesseractOcr(fileBuffer, fileName);
      }
      extractedText = ocrResult.text.trim();
      ocrFallback = { provider: ocrResult.provider, lineCount: ocrResult.lineCount };
    }

    const targetPanelKey = panelKey || inferBestUploadPanelKey(extractedText, 'kra1_teaching_effectiveness');
    const targetPanelDefinition = findUploadPanelDefinition(targetPanelKey);
    const computedAnalysis = analyzeDocumentContent(extractedText, targetPanelKey, fileType);
    const dateCheck = checkPromotionWindow(extractedText);

    if (dateCheck.status === 'out_of_range') {
      // Remove the uploaded file from storage since it's rejected
      await getSupabase().storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
      return res.status(422).json({
        error: `This document is dated ${dateCheck.matchedDate}, outside the current promotion period (${PROMOTION_WINDOW_LABEL}). Only documents relevant to this promotion cycle can be uploaded.`,
      });
    }

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
        details: { originalName: fileName, panelKey: targetPanelKey, uploadType, method: 'direct-supabase' },
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
