import fs from 'node:fs/promises';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { extractImageTextWithOcr, readOcrProgress, readPendingOcrPage, type OcrConfig } from '../ocr';
import type { UploadPanelKey } from '../types';
import { analyzeDocumentContent } from '../utils';
import { resolveStoredDocumentPath, toPrismaJson } from './document.utils';
import { checkPromotionWindow } from './promotionWindow';
import { downloadFileBuffer } from '../services/storage.service';

/**
 * Large scans cannot be OCR'd inside one serverless request. The first pass
 * saves the upload with `extractionMetadata.ocr.nextPage`; each call here reads
 * the next batch of pages, appends their text and re-scores the document,
 * until no pages are left.
 */

export type OcrContinuationResult = {
  documentId: string;
  status: 'continued' | 'complete' | 'busy' | 'failed';
  pagesRead: number | null;
  totalPages: number | null;
  nextPage: number | null;
  error?: string;
};

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

export async function loadStoredDocumentBuffer(extractionMetadata: unknown): Promise<Buffer | null> {
  const stored = resolveStoredDocumentPath(extractionMetadata);
  if (!stored) {
    return null;
  }
  return downloadFileBuffer(stored).catch(() => null);
}

export async function continueDocumentOcr(
  document: {
    id: string;
    originalName: string;
    mimeType: string;
    extractedText: string | null;
    extractionMetadata: Prisma.JsonValue | null;
  },
  ocrConfig: OcrConfig,
): Promise<OcrContinuationResult> {
  const metadata = readObject(document.extractionMetadata);
  const ocr = readObject(metadata.ocr);
  const startPage = readPendingOcrPage(metadata);
  const progress = readOcrProgress(metadata);
  const base = { documentId: document.id, pagesRead: progress.pagesRead, totalPages: progress.totalPages };

  if (!startPage) {
    return { ...base, status: 'complete', nextPage: null };
  }

  const buffer = await loadStoredDocumentBuffer(metadata);
  if (!buffer) {
    return { ...base, status: 'failed', nextPage: startPage, error: 'The stored file could not be downloaded' };
  }

  const isPdf = document.mimeType.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(document.originalName);
  let result;
  try {
    result = await extractImageTextWithOcr(buffer, document.originalName, ocrConfig, isPdf ? 'PDF' : undefined, {
      startPage,
    });
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      nextPage: startPage,
      error: error instanceof Error ? error.message : 'OCR failed',
    };
  }

  // No page got through (every engine timed out): stop here rather than
  // letting the client loop on the same page forever.
  if ((result.pagesRead ?? 0) < startPage) {
    return { ...base, status: 'failed', nextPage: startPage, error: 'No further pages could be read' };
  }

  const extractedText = [document.extractedText?.trim(), result.text.trim()].filter(Boolean).join('\n\n');
  const panelKey = (typeof metadata.panelKey === 'string' ? metadata.panelKey : 'kra1_teaching_effectiveness') as UploadPanelKey;
  const nextOcr: Record<string, unknown> = {
    ...ocr,
    lineCount: (typeof ocr.lineCount === 'number' ? ocr.lineCount : 0) + result.lineCount,
    pagesRead: result.pagesRead,
    totalPages: result.totalPages || ocr.totalPages,
  };
  delete nextOcr.nextPage;
  delete nextOcr.stoppedEarly;
  if (result.stoppedEarly) {
    nextOcr.stoppedEarly = result.stoppedEarly;
  }
  if (result.nextPage) {
    nextOcr.nextPage = result.nextPage;
  }

  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    ocr: nextOcr,
    analysis: analyzeDocumentContent(extractedText, panelKey, isPdf ? 'pdf' : 'image'),
    dateCheck: checkPromotionWindow(extractedText),
  };
  if (extractedText.length >= 100) {
    delete nextMetadata.ocrError;
  }

  // Only apply if no other request advanced this document in the meantime;
  // otherwise the same pages would be appended twice.
  const { count } = await prisma.uploadedDocument.updateMany({
    where: { id: document.id, extractionMetadata: { path: ['ocr', 'nextPage'], equals: startPage } },
    data: { extractedText, extractionMetadata: toPrismaJson(nextMetadata) },
  });
  if (count === 0) {
    return { ...base, status: 'busy', nextPage: startPage };
  }

  return {
    documentId: document.id,
    status: result.nextPage ? 'continued' : 'complete',
    pagesRead: result.pagesRead ?? null,
    totalPages: result.totalPages ?? null,
    nextPage: result.nextPage ?? null,
  };
}
