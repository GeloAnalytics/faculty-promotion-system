/**
 * Re-reads already uploaded documents with the current OCR pipeline and
 * recomputes every document's analysis, so uploads processed by older code
 * (OCR.space 1 MB / 3-page limits, older score extraction) score like new ones.
 *
 * Two phases, so nothing is written until the plan has been reviewed:
 *
 *   npx tsx scripts/reprocess-documents.ts plan <plan.json>
 *     Read-only. Downloads documents whose text is missing, short, or came
 *     from a capped OCR pass, re-runs text extraction/OCR, recomputes the
 *     analysis of every document, and writes the proposed changes to plan.json.
 *
 *   npx tsx scripts/reprocess-documents.ts apply <plan.json> [more-plans.json...]
 *     Writes the re-read text and a freshly computed analysis. DRY_RUN=1
 *     reports without writing.
 *
 * Optional: DOCUMENT_IDS=id1,id2 limits either phase to those documents.
 */
import 'dotenv/config';
import fs from 'node:fs';
import pdf from 'pdf-parse';
import { prisma } from '../src/config/db';
import { ocrConfig } from '../src/config/globals';
import { DOCUMENTS_BUCKET, getSupabase } from '../src/config/supabase';
import { extractImageTextWithOcr, resolveEffectiveOcrProvider, summarizeOcrResult, terminateOcrWorkers } from '../src/ocr';
import type { UploadPanelKey } from '../src/types';
import { analyzeDocumentContent } from '../src/utils';
import { isPdfTextInsufficient, toPrismaJson } from '../src/utils/document.utils';
import { checkPromotionWindow } from '../src/utils/promotionWindow';

type PlannedDocument = {
  id: string;
  originalName: string;
  reread: boolean;
  /** Set when downloading or OCR failed (e.g. network); apply skips these. */
  rereadFailed?: string;
  oldTextLength: number;
  newTextLength: number;
  oldScores: Record<string, number>;
  newScores: Record<string, number>;
  teachingEvaluations: unknown;
  ocrError: string | null;
  extractedText: string;
  extractionMetadata: Record<string, unknown>;
};

// Production OCR runs OCR.space first; mirror that even when the local .env
// says "windows" (Windows OCR still runs as a fallback on this machine).
// There is no serverless time limit here, so read each document in one pass.
const reprocessOcrConfig = {
  ...ocrConfig,
  provider: ocrConfig.apiUrl && ocrConfig.apiKey ? ('ocrspace' as const) : ocrConfig.provider,
  totalBudgetMs: 30 * 60 * 1000,
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function needsReread(text: string, metadata: Record<string, unknown>) {
  const ocr = asObject(metadata.ocr);
  return (
    typeof metadata.ocrError === 'string' ||
    text.trim().length < 100 ||
    // The old whole-PDF OCR.space request silently stopped after 3 pages.
    ocr.provider === 'http' ||
    ocr.stoppedEarly !== undefined
  );
}

async function rereadDocument(storagePath: string, fileName: string, mimeType: string) {
  let download = await getSupabase().storage.from(DOCUMENTS_BUCKET).download(storagePath);
  for (let attempt = 2; download.error && attempt <= 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
    download = await getSupabase().storage.from(DOCUMENTS_BUCKET).download(storagePath);
  }
  const { data, error } = download;
  if (error || !data) {
    throw new Error(`download failed: ${error?.message ?? 'file not found'}`);
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  const isPdf = mimeType.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(fileName);

  let text = '';
  let pageCount = 1;
  if (isPdf) {
    try {
      const parsed = await pdf(buffer);
      text = parsed.text || '';
      pageCount = parsed.numpages || 1;
    } catch {
      text = '';
    }
    if (!isPdfTextInsufficient(text, pageCount)) {
      return { text: text.trim(), ocr: null, fileType: 'pdf' as const };
    }
  }

  const ocrResult = await extractImageTextWithOcr(buffer, fileName, reprocessOcrConfig, isPdf ? 'PDF' : undefined);
  const ocrText = ocrResult.text.trim();
  return ocrText.length > text.trim().length
    ? { text: ocrText, ocr: summarizeOcrResult(ocrResult), fileType: isPdf ? ('pdf' as const) : ('image' as const) }
    : { text: text.trim(), ocr: null, fileType: isPdf ? ('pdf' as const) : ('image' as const) };
}

function selectedIds() {
  const ids = process.env.DOCUMENT_IDS?.split(',').map((id) => id.trim()).filter(Boolean);
  return ids?.length ? ids : null;
}

async function plan(outputPath: string) {
  console.log(`OCR provider for re-reads: ${resolveEffectiveOcrProvider(reprocessOcrConfig)}`);
  const ids = selectedIds();
  const documents = await prisma.uploadedDocument.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { createdAt: 'asc' },
    select: { id: true, originalName: true, mimeType: true, extractedText: true, extractionMetadata: true },
  });

  const planned: PlannedDocument[] = [];
  for (const [index, document] of documents.entries()) {
    const metadata = asObject(document.extractionMetadata);
    const oldText = document.extractedText ?? '';
    const oldAnalysis = asObject(metadata.analysis);
    const storage = asObject(metadata.storage);
    const panelKey = (typeof metadata.panelKey === 'string' ? metadata.panelKey : 'kra1_teaching_effectiveness') as UploadPanelKey;
    const label = `[${index + 1}/${documents.length}] ${document.originalName}`;

    let text = oldText;
    let fileType = (oldAnalysis.source === 'image' ? 'image' : 'pdf') as 'pdf' | 'image';
    let ocrError = typeof metadata.ocrError === 'string' ? metadata.ocrError : null;
    let ocr = metadata.ocr;
    const reread = needsReread(oldText, metadata) && typeof storage.path === 'string';
    let rereadFailed: string | undefined;

    if (reread) {
      const startedAt = Date.now();
      try {
        const result = await rereadDocument(String(storage.path), document.originalName, document.mimeType);
        if (result.text.length > oldText.trim().length) {
          text = result.text;
          fileType = result.fileType;
          ocr = result.ocr ?? undefined;
        }
        ocrError = text.trim().length >= 100 ? null : ocrError ?? 'OCR did not find readable text in this document';
        console.log(`${label}: ${oldText.trim().length} -> ${text.trim().length} chars (${Math.round((Date.now() - startedAt) / 1000)}s)`);
      } catch (error) {
        // Keep the document's own ocrError; a transient download/network
        // failure here says nothing about the document.
        rereadFailed = error instanceof Error ? error.message : String(error);
        console.warn(`${label}: re-read failed: ${rereadFailed}`);
      }
    }

    const analysis = analyzeDocumentContent(text, panelKey, fileType);
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      analysis,
      dateCheck: checkPromotionWindow(text),
      ...(reread ? { reprocessedAt: new Date().toISOString() } : {}),
    };
    if (ocr) {
      nextMetadata.ocr = ocr;
    } else {
      delete nextMetadata.ocr;
    }
    if (ocrError) {
      nextMetadata.ocrError = ocrError;
    } else {
      delete nextMetadata.ocrError;
    }

    planned.push({
      id: document.id,
      originalName: document.originalName,
      reread,
      ...(rereadFailed ? { rereadFailed } : {}),
      oldTextLength: oldText.trim().length,
      newTextLength: text.trim().length,
      oldScores: asObject(oldAnalysis.extractedScores) as Record<string, number>,
      newScores: analysis.extractedScores,
      teachingEvaluations: analysis.teachingEvaluations ?? null,
      ocrError,
      extractedText: text,
      extractionMetadata: nextMetadata,
    });
    // Save progress so a long run can be inspected or resumed by hand.
    fs.writeFileSync(outputPath, JSON.stringify(planned, null, 2));
  }

  const reread = planned.filter((item) => item.reread);
  console.log({
    documents: planned.length,
    reread: reread.length,
    rereadFailed: reread.filter((item) => item.rereadFailed).length,
    recovered: reread.filter((item) => item.oldTextLength < 100 && item.newTextLength >= 100).length,
    stillUnreadable: planned.filter((item) => item.newTextLength < 100).length,
    withTeachingRatings: planned.filter((item) => item.teachingEvaluations).length,
  });
  console.log(`Plan written to ${outputPath}`);
}

/**
 * Takes the re-read text and OCR details from the plan files (a later file
 * wins for the same document) and recomputes the analysis with the current
 * code against each document's current panel, so edits made since the plan
 * was written are kept. Pass DRY_RUN=1 to only report what would change.
 */
async function apply(planPaths: string[]) {
  const ids = selectedIds();
  const dryRun = process.env.DRY_RUN === '1';
  const byId = new Map<string, PlannedDocument>();
  for (const planPath of planPaths) {
    for (const item of JSON.parse(fs.readFileSync(planPath, 'utf8')) as PlannedDocument[]) {
      // Older plan files recorded a failed download as the document's ocrError.
      const failed = item.rereadFailed || /^download failed/.test(item.ocrError ?? '');
      if (!failed && (!ids || ids.includes(item.id))) {
        byId.set(item.id, item);
      }
    }
  }

  let updated = 0;
  let missing = 0;
  for (const item of byId.values()) {
    const current = await prisma.uploadedDocument.findUnique({
      where: { id: item.id },
      select: { extractedText: true, extractionMetadata: true },
    });
    if (!current) {
      missing += 1;
      continue;
    }
    const metadata = asObject(current.extractionMetadata);
    const planned = item.extractionMetadata;
    // Never replace text with less text than the document already has.
    const extractedText =
      item.extractedText.trim().length >= (current.extractedText ?? '').trim().length
        ? item.extractedText
        : current.extractedText ?? '';
    const panelKey = (typeof metadata.panelKey === 'string' ? metadata.panelKey : 'kra1_teaching_effectiveness') as UploadPanelKey;
    const source = (asObject(planned.analysis).source === 'image' ? 'image' : 'pdf') as 'pdf' | 'image';
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      analysis: analyzeDocumentContent(extractedText, panelKey, source),
      dateCheck: checkPromotionWindow(extractedText),
    };
    for (const key of ['ocr', 'ocrError', 'reprocessedAt']) {
      if (planned[key] !== undefined) {
        nextMetadata[key] = planned[key];
      } else if (key !== 'reprocessedAt' && item.reread) {
        delete nextMetadata[key];
      }
    }
    if (extractedText.trim().length >= 100) {
      delete nextMetadata.ocrError;
    }

    if (!dryRun) {
      await prisma.uploadedDocument.update({
        where: { id: item.id },
        data: { extractedText, extractionMetadata: toPrismaJson(nextMetadata) },
      });
    }
    updated += 1;
  }
  console.log(`${dryRun ? 'Would update' : 'Updated'} ${updated} documents (${missing} no longer exist) from ${planPaths.join(', ')}`);
}

async function main() {
  const [mode, ...files] = process.argv.slice(2);
  if ((mode !== 'plan' && mode !== 'apply') || !files.length) {
    console.error('Usage: npx tsx scripts/reprocess-documents.ts plan <plan.json> | apply <plan.json> [more-plans.json...]');
    process.exitCode = 1;
    return;
  }
  try {
    await (mode === 'plan' ? plan(files[0]) : apply(files));
  } finally {
    await terminateOcrWorkers();
    await prisma.$disconnect();
  }
}

void main();
