import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createWorker, type Worker } from 'tesseract.js';
import { decodeImagePagesForOcr, fitImageUnderBytes } from './ocrImage';

const execFileAsync = promisify(execFile);

export type OcrProvider = 'windows' | 'google-vision' | 'http' | 'ocrspace' | 'tesseract' | 'disabled';

// The first 5 pages contain all key certificate, appointment, and scoring data;
// OCR also stops early once enough promotion-relevant text has been read.
const DEFAULT_MAX_OCR_PAGES = 5;
// pdf.js renders at 72 DPI per 1.0 scale. 2.0 (~144 DPI) is the lowest scale
// at which Tesseract reliably reads 10-11pt body text on scanned forms.
const OCR_RASTERIZE_SCALE = 2;
// Whole-request OCR budget. Must stay below the Vercel function maxDuration in
// vercel.json (300s) so the upload is still saved, with whatever text was read,
// instead of the platform killing the request.
const DEFAULT_OCR_BUDGET_MS = 200_000;
// OCR.space free plan rejects files over 1 MB. Paid plans can raise this via
// OCR_MAX_UPLOAD_BYTES.
export const DEFAULT_OCR_MAX_UPLOAD_BYTES = 1024 * 1024;
// Google Vision's inline JSON request limit is 10 MB; base64 inflates by 4/3.
const GOOGLE_VISION_MAX_IMAGE_BYTES = 7 * 1024 * 1024;
// A provider that fails this many pages in one document is skipped for the
// remaining pages, so a bad key or an outage costs one timeout, not five.
const MAX_RECOGNIZER_FAILURES_PER_DOCUMENT = 2;

export interface OcrConfig {
  provider: OcrProvider;
  scriptPath: string;
  apiUrl?: string;
  apiKey?: string;
  googleVisionApiKey?: string;
  apiKeyHeader: string;
  fileFieldName: string;
  timeoutMs: number;
  maxUploadBytes?: number;
  totalBudgetMs?: number;
}

export interface OcrResult {
  provider: Exclude<OcrProvider, 'disabled'>;
  text: string;
  lineCount: number;
}

/**
 * Resolves the effective OCR provider based on operating environment and available credentials.
 * Falls back to a configured cloud API (or local Tesseract) on Linux/cloud deployments
 * when the provider is unset or set to 'windows'.
 */
export function resolveEffectiveOcrProvider(config: OcrConfig): OcrProvider {
  if (config.provider === 'disabled') {
    return 'disabled';
  }

  if (config.provider === 'google-vision' && (config.googleVisionApiKey || config.apiKey)) {
    return 'google-vision';
  }

  if (config.provider === 'http' && config.apiUrl) {
    return 'http';
  }

  if (config.provider === 'ocrspace' && config.apiUrl && config.apiKey) {
    return 'ocrspace';
  }

  if (config.provider === 'windows' && process.platform === 'win32' && fs.existsSync(config.scriptPath)) {
    return 'windows';
  }

  // Cloud / Linux deployment fallback. Only treat a key as a Google key when it
  // was configured as one: OCR_API_KEY usually belongs to OCR.space.
  if (config.googleVisionApiKey) {
    return 'google-vision';
  }

  if (config.apiUrl && config.apiKey && /ocr\.space/i.test(config.apiUrl)) {
    return 'ocrspace';
  }

  return 'tesseract';
}

export function isOcrReady(config: OcrConfig) {
  const effective = resolveEffectiveOcrProvider(config);
  return effective !== 'disabled';
}

/**
 * Picks where Tesseract reads eng.traineddata from without touching the
 * network: a repo-root copy (local dev), then the bundled
 * @tesseract.js-data/eng package (Vercel), and only then the jsDelivr CDN.
 */
function resolveTesseractLanguageOptions(): Record<string, unknown> {
  const repoRoot = process.cwd();
  if (fs.existsSync(path.join(repoRoot, 'eng.traineddata'))) {
    return { langPath: repoRoot, cacheMethod: 'none', gzip: false };
  }

  try {
    const packageDir = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
    // createWorker(..., OEM 1) is LSTM-only, which reads the best_int model.
    const langPath = path.join(packageDir, '4.0.0_best_int');
    if (fs.existsSync(path.join(langPath, 'eng.traineddata.gz'))) {
      return { langPath, cacheMethod: 'none', gzip: true };
    }
  } catch {
    // Package not installed; fall through to the CDN download.
  }

  const cacheDir = path.join(os.tmpdir(), 'fps-tessdata');
  fs.mkdirSync(cacheDir, { recursive: true });
  return { cachePath: cacheDir };
}

/**
 * Singleton / pooled worker manager for Tesseract.
 * Keeps worker warm to avoid 2-4s cold starts per page and automatically
 * shuts down after 2 minutes of idle time to conserve RAM on cloud deployments.
 */
class TesseractWorkerManager {
  private worker: Worker | null = null;
  private isInitializing = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private queue: Array<() => void> = [];
  private isBusy = false;

  private async getWorker(): Promise<Worker> {
    if (this.worker) {
      this.resetIdleTimer();
      return this.worker;
    }

    if (this.isInitializing) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (this.worker || !this.isInitializing) {
            clearInterval(check);
            resolve();
          }
        }, 50);
      });
      if (this.worker) {
        return this.worker;
      }
    }

    this.isInitializing = true;
    try {
      this.worker = await createWorker('eng', 1, {
        errorHandler: () => {},
        ...resolveTesseractLanguageOptions(),
      });
      this.resetIdleTimer();
      return this.worker;
    } finally {
      this.isInitializing = false;
    }
  }

  private resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    // Auto-terminate worker after 2 minutes of inactivity to release memory
    this.idleTimer = setTimeout(async () => {
      await this.terminate();
    }, 120000);
    if (this.idleTimer.unref) {
      this.idleTimer.unref();
    }
  }

  public async recognize(imageBuffer: Buffer): Promise<string> {
    await this.acquireLock();
    try {
      const worker = await this.getWorker();
      const { data } = await worker.recognize(imageBuffer);
      return data?.text || '';
    } catch (err) {
      // On fatal worker failure, terminate so next call gets a clean worker
      await this.terminate();
      throw err;
    } finally {
      this.releaseLock();
      this.resetIdleTimer();
    }
  }

  private acquireLock(): Promise<void> {
    if (!this.isBusy) {
      this.isBusy = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private releaseLock(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    } else {
      this.isBusy = false;
    }
  }

  public async terminate(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.worker) {
      const activeWorker = this.worker;
      this.worker = null;
      try {
        await activeWorker.terminate();
      } catch {
        // Ignore termination errors during cleanup
      }
    }
  }
}

const tesseractManager = new TesseractWorkerManager();

export async function terminateOcrWorkers() {
  await tesseractManager.terminate();
}

interface OcrPage {
  index: number;
  buffer: Buffer;
  fileName: string;
}

interface PageRecognizer {
  provider: Exclude<OcrProvider, 'disabled'>;
  recognize(page: OcrPage): Promise<string>;
}

function isPdfInput(originalName: string, fileTypeHint?: string) {
  return fileTypeHint === 'PDF' || /\.pdf$/i.test(originalName);
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Asynchronously yields rasterized page Buffers one-by-one from a PDF buffer.
 * By streaming page-by-page rather than accumulating all pages into an array,
 * peak RAM usage remains strictly flat even on 50MB+ PDFs.
 */
async function* iteratePdfPages(
  fileBuffer: Buffer,
  maxPages: number = DEFAULT_MAX_OCR_PAGES,
  scale: number = OCR_RASTERIZE_SCALE,
): AsyncGenerator<{ pageIndex: number; buffer: Buffer }, void, unknown> {
  const { pdf } = await import('pdf-to-img');
  // Pass Uint8Array directly to pdf-to-img without creating base64 data-URL strings
  const doc = await pdf(fileBuffer, { scale });
  let count = 0;
  for await (const page of doc) {
    count++;
    yield { pageIndex: count, buffer: page as Buffer };
    if (count >= maxPages) {
      break;
    }
  }
}

/**
 * Turns any upload into OCR-ready page images: PDFs are rasterized, images are
 * decoded (TIFF/BMP/oversized photos included) into bounded JPEGs. Bytes that
 * cannot be decoded locally are yielded as-is so engines can still try them.
 */
async function* iterateOcrPages(
  fileBuffer: Buffer,
  originalName: string,
  isPdf: boolean,
): AsyncGenerator<OcrPage, void, unknown> {
  const baseName = path.parse(originalName).name || 'document';

  if (isPdf) {
    for await (const { pageIndex, buffer } of iteratePdfPages(fileBuffer)) {
      yield { index: pageIndex, buffer, fileName: `${baseName}-page${pageIndex}.png` };
    }
    return;
  }

  const decodedPages = await decodeImagePagesForOcr(fileBuffer, DEFAULT_MAX_OCR_PAGES);
  if (!decodedPages) {
    yield { index: 1, buffer: fileBuffer, fileName: originalName };
    return;
  }

  for (const [offset, buffer] of decodedPages.entries()) {
    yield { index: offset + 1, buffer, fileName: `${baseName}-page${offset + 1}.jpg` };
  }
}

/**
 * Runs each page through the recognizers in priority order (configured cloud
 * provider, then local Windows OCR, then Tesseract) and keeps the first
 * non-empty text per page. A provider that rejects a page (size cap, timeout,
 * outage) no longer zeroes the whole document.
 */
async function recognizeDocumentPages(
  fileBuffer: Buffer,
  originalName: string,
  isPdf: boolean,
  recognizers: PageRecognizer[],
  budgetMs: number,
): Promise<OcrResult & { firstError: Error | null }> {
  const deadline = Date.now() + budgetMs;
  const pageTexts: string[] = [];
  const providerHits = new Map<PageRecognizer['provider'], number>();
  const failureCounts = new Map<PageRecognizer, number>();
  let firstError: Error | null = null;

  try {
    for await (const page of iterateOcrPages(fileBuffer, originalName, isPdf)) {
      for (const recognizer of recognizers) {
        if ((failureCounts.get(recognizer) ?? 0) >= MAX_RECOGNIZER_FAILURES_PER_DOCUMENT) {
          continue;
        }
        if (Date.now() > deadline) {
          break;
        }

        try {
          const text = (await recognizer.recognize(page)).trim();
          if (text) {
            pageTexts.push(text);
            providerHits.set(recognizer.provider, (providerHits.get(recognizer.provider) ?? 0) + 1);
            break;
          }
        } catch (error) {
          firstError ??= toError(error);
          failureCounts.set(recognizer, (failureCounts.get(recognizer) ?? 0) + 1);
          console.warn(
            `[OCR] ${recognizer.provider} failed on page ${page.index} of ${originalName}: ${toError(error).message}`,
          );
        }
      }

      if (Date.now() > deadline) {
        console.warn(`[OCR] Time budget reached after page ${page.index} of ${originalName}; keeping text read so far`);
        break;
      }

      const combined = pageTexts.join('\n');
      if (combined.length > 1200 && containsKeyPromotionSignals(combined)) {
        break;
      }
    }
  } catch (error) {
    // Rasterization failed (corrupt or password-protected PDF, missing canvas
    // binary). Keep any pages that were already read.
    firstError ??= new Error(`Could not render document pages for OCR: ${toError(error).message}`);
  }

  const text = pageTexts.join('\n\n').trim();
  const [topProvider] = [...providerHits.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return {
    provider: topProvider ?? recognizers[0]?.provider ?? 'tesseract',
    text,
    lineCount: countLines(text),
    firstError,
  };
}

function isWindowsOcrAvailable(config: OcrConfig) {
  return process.platform === 'win32' && fs.existsSync(config.scriptPath);
}

function buildRecognizers(effectiveProvider: OcrProvider, config: OcrConfig): PageRecognizer[] {
  const recognizers: PageRecognizer[] = [];

  if (effectiveProvider === 'google-vision') {
    recognizers.push(googleVisionRecognizer(config));
  } else if (effectiveProvider === 'ocrspace') {
    recognizers.push(ocrSpaceRecognizer(config));
  }

  if (isWindowsOcrAvailable(config)) {
    recognizers.push(windowsRecognizer(config.scriptPath));
  }

  recognizers.push(tesseractRecognizer);
  return recognizers;
}

export async function extractImageTextWithOcr(
  fileBuffer: Buffer,
  originalName: string,
  config: OcrConfig,
  fileTypeHint?: string,
): Promise<OcrResult> {
  const effectiveProvider = resolveEffectiveOcrProvider(config);
  const isPdf = isPdfInput(originalName, fileTypeHint);
  const maxUploadBytes = config.maxUploadBytes ?? DEFAULT_OCR_MAX_UPLOAD_BYTES;
  const startedAt = Date.now();
  let primaryError: Error | null = null;

  // Whole-document fast paths: one request instead of one per page. Anything
  // they cannot read falls through to page-by-page OCR below.
  const useWholeDocumentRequest =
    effectiveProvider === 'http' || (effectiveProvider === 'ocrspace' && isPdf && fileBuffer.length <= maxUploadBytes);
  if (useWholeDocumentRequest) {
    try {
      const result =
        effectiveProvider === 'http'
          ? await runHttpOcr(fileBuffer, originalName, config)
          : await runOcrSpaceRequest(fileBuffer, originalName, config, 'PDF');
      // An empty response is not a successful OCR pass. Treat it like a
      // provider failure so page-level OCR gets a chance to read the scan.
      if (result.text.trim()) {
        return result;
      }
      primaryError = new Error(`${effectiveProvider} OCR did not return readable text`);
    } catch (err) {
      primaryError = toError(err);
    }
  }

  const budgetMs = (config.totalBudgetMs ?? DEFAULT_OCR_BUDGET_MS) - (Date.now() - startedAt);
  const result = await recognizeDocumentPages(
    fileBuffer,
    originalName,
    isPdf,
    buildRecognizers(effectiveProvider, config),
    budgetMs,
  );

  if (result.text) {
    return { provider: result.provider, text: result.text, lineCount: result.lineCount };
  }

  const error = primaryError ?? result.firstError;
  if (error) {
    throw error;
  }

  return { provider: result.provider, text: '', lineCount: 0 };
}

async function runSingleRecognizer(
  recognizer: PageRecognizer,
  fileBuffer: Buffer,
  originalName: string,
  fileTypeHint?: string,
): Promise<OcrResult> {
  const result = await recognizeDocumentPages(
    fileBuffer,
    originalName,
    isPdfInput(originalName, fileTypeHint),
    [recognizer],
    DEFAULT_OCR_BUDGET_MS,
  );
  if (!result.text && result.firstError) {
    throw result.firstError;
  }
  return { provider: recognizer.provider, text: result.text, lineCount: result.lineCount };
}

export async function runWindowsOcr(
  fileBuffer: Buffer,
  originalName: string,
  scriptPath: string,
  fileTypeHint?: string,
): Promise<OcrResult> {
  return runSingleRecognizer(windowsRecognizer(scriptPath), fileBuffer, originalName, fileTypeHint);
}

export async function runGoogleVisionOcr(
  fileBuffer: Buffer,
  originalName: string,
  config: OcrConfig,
  fileTypeHint?: string,
): Promise<OcrResult> {
  return runSingleRecognizer(googleVisionRecognizer(config), fileBuffer, originalName, fileTypeHint);
}

export async function runTesseractOcr(
  fileBuffer: Buffer,
  originalName: string,
  fileTypeHint?: string,
): Promise<OcrResult> {
  return runSingleRecognizer(tesseractRecognizer, fileBuffer, originalName, fileTypeHint);
}

const tesseractRecognizer: PageRecognizer = {
  provider: 'tesseract',
  recognize: (page) => tesseractManager.recognize(page.buffer),
};

function windowsRecognizer(scriptPath: string): PageRecognizer {
  return {
    provider: 'windows',
    async recognize(page) {
      const tempImagePath = path.join(
        os.tmpdir(),
        `fps-ocr-${crypto.randomUUID()}${path.extname(page.fileName) || '.png'}`,
      );

      try {
        fs.writeFileSync(tempImagePath, page.buffer);
        const { stdout } = await execFileAsync(
          'powershell',
          ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ImagePath', tempImagePath],
          { windowsHide: true, maxBuffer: 5 * 1024 * 1024 },
        );

        const payload = JSON.parse(stdout) as { text?: string; textBase64?: string };
        return payload.textBase64
          ? Buffer.from(payload.textBase64, 'base64').toString('utf8')
          : payload.text ?? '';
      } finally {
        if (fs.existsSync(tempImagePath)) {
          fs.unlinkSync(tempImagePath);
        }
      }
    },
  };
}

function ocrSpaceRecognizer(config: OcrConfig): PageRecognizer {
  const maxUploadBytes = config.maxUploadBytes ?? DEFAULT_OCR_MAX_UPLOAD_BYTES;
  return {
    provider: 'ocrspace',
    async recognize(page) {
      const upload = await fitImageUnderBytes(page.buffer, maxUploadBytes);
      const fileName = upload.converted ? `${path.parse(page.fileName).name}.jpg` : page.fileName;
      const result = await runOcrSpaceRequest(upload.buffer, fileName, config);
      return result.text;
    },
  };
}

function googleVisionRecognizer(config: OcrConfig): PageRecognizer {
  return {
    provider: 'google-vision',
    async recognize(page) {
      const upload = await fitImageUnderBytes(page.buffer, GOOGLE_VISION_MAX_IMAGE_BYTES);
      return runGoogleVisionImageRequest(upload.buffer, config);
    },
  };
}

function ocrSpaceFileType(fileName: string) {
  const extension = path.extname(fileName).slice(1).toUpperCase();
  if (extension === 'JPEG') {
    return 'JPG';
  }
  if (extension === 'TIFF') {
    return 'TIF';
  }
  return ['PDF', 'PNG', 'JPG', 'GIF', 'TIF', 'BMP', 'WEBP'].includes(extension) ? extension : undefined;
}

async function runHttpOcr(fileBuffer: Buffer, originalName: string, config: OcrConfig): Promise<OcrResult> {
  if (!config.apiUrl) {
    throw new Error('OCR_API_URL is not configured');
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)]);
  formData.append(config.fileFieldName, blob, originalName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers[config.apiKeyHeader] = config.apiKey;
    }

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OCR API request failed with status ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) {
      const text = (await response.text()).trim();
      return {
        provider: 'http',
        text,
        lineCount: countLines(text),
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const extractedText = extractTextFromApiPayload(payload).trim();

    return {
      provider: 'http',
      text: extractedText,
      lineCount: countLines(extractedText),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runOcrSpaceRequest(
  fileBuffer: Buffer,
  fileName: string,
  config: OcrConfig,
  fileTypeHint?: string,
): Promise<OcrResult> {
  if (!config.apiUrl || !config.apiKey) {
    throw new Error('OCR.space is not fully configured');
  }

  const fileType = fileTypeHint ?? ocrSpaceFileType(fileName);

  const makeRequest = async (engine: '1' | '2') => {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)]);
    formData.append('file', blob, fileName);
    formData.append('isOverlayRequired', 'false');
    formData.append('OCREngine', engine);
    // Phone photos are often sideways; scale helps low-resolution scans.
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    if (fileType) {
      formData.append('filetype', fileType);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(config.apiUrl!, {
        method: 'POST',
        headers: { apikey: config.apiKey! },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`OCR.space request failed with status ${response.status}${errorBody ? `: ${errorBody}` : ''}`);
      }

      const payload = (await response.json()) as {
        IsErroredOnProcessing?: boolean;
        ErrorMessage?: string[] | string;
        ParsedResults?: Array<{ ParsedText?: string }>;
      };

      if (payload.IsErroredOnProcessing) {
        const message = Array.isArray(payload.ErrorMessage)
          ? payload.ErrorMessage.join('; ')
          : payload.ErrorMessage || 'OCR.space processing failed';
        throw new Error(message);
      }

      const text = (payload.ParsedResults ?? [])
        .map((result) => result.ParsedText ?? '')
        .join('\n')
        .trim();

      return {
        provider: 'ocrspace' as const,
        text,
        lineCount: countLines(text),
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await makeRequest('2');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/Engine 1|Engine 2/i.test(msg) || /too small|format/i.test(msg)) {
      return await makeRequest('1');
    }
    throw error;
  }
}

async function runGoogleVisionImageRequest(imageBuffer: Buffer, config: OcrConfig): Promise<string> {
  const apiKey = config.googleVisionApiKey || config.apiKey;
  if (!apiKey) {
    throw new Error('Google Cloud Vision API key is not configured (set GOOGLE_VISION_API_KEY in .env)');
  }

  if (imageBuffer.length > GOOGLE_VISION_MAX_IMAGE_BYTES) {
    throw new Error(`Image is ${imageBuffer.length} bytes, over the Google Vision inline request limit`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 30000);

  try {
    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
    const requestBody = {
      requests: [
        {
          image: {
            content: imageBuffer.toString('base64'),
          },
          features: [
            {
              type: 'DOCUMENT_TEXT_DETECTION',
            },
          ],
        },
      ],
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Google Vision API failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        textAnnotations?: Array<{ description?: string }>;
        error?: { message?: string; code?: number };
      }>;
    };

    const resp = payload.responses?.[0];
    if (resp?.error) {
      throw new Error(`Google Vision API error: ${resp.error.message || 'Unknown error'}`);
    }

    return (resp?.fullTextAnnotation?.text || resp?.textAnnotations?.[0]?.description || '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

function containsKeyPromotionSignals(text: string): boolean {
  const lower = text.toLowerCase();
  const keywordHits = [
    'nbc', '461', 'kra', 'criterion', 'criteria', 'points', 'score',
    'evaluation', 'designation', 'appointment', 'certificate', 'training',
    'seminar', 'workshop', 'published', 'journal', 'research', 'degree',
    'master', 'doctor', 'phd', 'service record', 'special order', 'memorandum'
  ].filter((word) => lower.includes(word)).length;

  return keywordHits >= 2;
}

function extractTextFromApiPayload(payload: Record<string, unknown>) {
  const candidates: unknown[] = [
    payload.text,
    payload.extractedText,
    payload.fullText,
    payload.content,
    payload.result,
    payload.data,
  ];

  for (const candidate of candidates) {
    const text = flattenToText(candidate);
    if (text) {
      return text;
    }
  }

  return '';
}

function flattenToText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(flattenToText).filter(Boolean).join('\n');
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const directFields = [objectValue.text, objectValue.value, objectValue.content, objectValue.extractedText];
    const directText = directFields.map(flattenToText).filter(Boolean).join('\n');
    if (directText) {
      return directText;
    }

    return Object.values(objectValue).map(flattenToText).filter(Boolean).join('\n');
  }

  return '';
}

function countLines(text: string) {
  return text ? text.split(/\r?\n/).filter(Boolean).length : 0;
}
