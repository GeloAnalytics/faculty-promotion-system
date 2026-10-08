import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createWorker, type Worker } from 'tesseract.js';

const execFileAsync = promisify(execFile);

export type OcrProvider = 'windows' | 'google-vision' | 'http' | 'ocrspace' | 'tesseract' | 'disabled';

// For synchronous in-request OCR on cloud deployments, cap pages to a sensible
// limit (5 pages) to prevent reverse-proxy timeouts (e.g. Render/Heroku 30-100s)
// and Out-Of-Memory (OOM) kills on constrained containers (512MB RAM).
// The first 5 pages contain all key certificate, appointment, and scoring data.
const DEFAULT_MAX_OCR_PAGES = 5;
const OCR_RASTERIZE_SCALE = 1.5;

export interface OcrConfig {
  provider: OcrProvider;
  scriptPath: string;
  apiUrl?: string;
  apiKey?: string;
  apiKeyHeader: string;
  fileFieldName: string;
  timeoutMs: number;
}

export interface OcrResult {
  provider: Exclude<OcrProvider, 'disabled'>;
  text: string;
  lineCount: number;
}

/**
 * Resolves the effective OCR provider based on operating environment and available credentials.
 * Automatically resolves to 'tesseract' or 'google-vision' on Linux/cloud deployments
 * if the provider is unset or set to 'windows'.
 */
export function resolveEffectiveOcrProvider(config: OcrConfig): OcrProvider {
  if (config.provider === 'disabled') {
    return 'disabled';
  }

  if (config.provider === 'google-vision' && config.apiKey) {
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

  // Cloud / Linux deployment fallback
  if (config.apiKey) {
    return 'google-vision';
  }

  return 'tesseract';
}

export function isOcrReady(config: OcrConfig) {
  const effective = resolveEffectiveOcrProvider(config);
  return effective !== 'disabled';
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
      const repoRoot = process.cwd();
      const options: Record<string, unknown> = {
        errorHandler: () => {},
      };
      const localTrainedData = path.join(repoRoot, 'eng.traineddata');

      if (fs.existsSync(localTrainedData)) {
        options.langPath = repoRoot;
        options.cachePath = repoRoot;
        options.gzip = false;
      } else {
        const cacheDir = path.join(os.tmpdir(), 'fps-tessdata');
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        options.cachePath = cacheDir;
      }

      this.worker = await createWorker('eng', 1, options);
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

export async function extractImageTextWithOcr(
  fileBuffer: Buffer,
  originalName: string,
  config: OcrConfig,
  fileTypeHint?: string,
): Promise<OcrResult> {
  const effectiveProvider = resolveEffectiveOcrProvider(config);
  let primaryError: Error | null = null;

  if (effectiveProvider !== 'disabled') {
    try {
      if (effectiveProvider === 'google-vision') {
        return await runGoogleVisionOcr(fileBuffer, originalName, config, fileTypeHint);
      }

      if (effectiveProvider === 'windows') {
        return await runWindowsOcr(fileBuffer, originalName, config.scriptPath, fileTypeHint);
      }

      if (effectiveProvider === 'http') {
        return await runHttpOcr(fileBuffer, originalName, config);
      }

      if (effectiveProvider === 'ocrspace') {
        return await runOcrSpace(fileBuffer, originalName, config, fileTypeHint);
      }

      if (effectiveProvider === 'tesseract') {
        return await runTesseractOcr(fileBuffer, originalName, fileTypeHint);
      }
    } catch (err) {
      primaryError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Fallback 1: Local Windows OCR (if on Win32 and script exists)
  if (process.platform === 'win32' && fs.existsSync(config.scriptPath)) {
    try {
      const result = await runWindowsOcr(fileBuffer, originalName, config.scriptPath, fileTypeHint);
      if (result.text.trim().length > 0) {
        return result;
      }
    } catch {
      // Continue to next fallback
    }
  }

  // Fallback 2: Local Tesseract OCR
  try {
    const result = await runTesseractOcr(fileBuffer, originalName, fileTypeHint);
    if (result.text.trim().length > 0) {
      return result;
    }
  } catch {
    // Continue
  }

  if (primaryError) {
    throw primaryError;
  }

  return {
    provider: 'tesseract',
    text: '',
    lineCount: 0,
  };
}

export async function runWindowsOcr(
  fileBuffer: Buffer,
  originalName: string,
  scriptPath: string,
  fileTypeHint?: string,
): Promise<OcrResult> {
  const isPdf = fileTypeHint === 'PDF' || /\.pdf$/i.test(originalName);

  if (!isPdf) {
    const tempImagePath = path.join(
      os.tmpdir(),
      `fps-ocr-${crypto.randomUUID()}${path.extname(originalName) || '.png'}`,
    );

    try {
      fs.writeFileSync(tempImagePath, fileBuffer);
      const { stdout } = await execFileAsync(
        'powershell',
        ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ImagePath', tempImagePath],
        { windowsHide: true, maxBuffer: 5 * 1024 * 1024 },
      );

      const payload = JSON.parse(stdout) as { text?: string; textBase64?: string; lineCount?: unknown };
      const text = payload.textBase64
        ? Buffer.from(payload.textBase64, 'base64').toString('utf8').trim()
        : (payload.text ?? '').trim();
      return {
        provider: 'windows',
        text,
        lineCount: countLines(text),
      };
    } finally {
      if (fs.existsSync(tempImagePath)) {
        fs.unlinkSync(tempImagePath);
      }
    }
  }

  // PDF streaming page-by-page
  const pageTexts: string[] = [];
  for await (const { pageIndex, buffer } of iteratePdfPages(fileBuffer, DEFAULT_MAX_OCR_PAGES, OCR_RASTERIZE_SCALE)) {
    const tempImagePath = path.join(os.tmpdir(), `fps-ocr-${crypto.randomUUID()}-p${pageIndex}.png`);
    try {
      fs.writeFileSync(tempImagePath, buffer);
      const { stdout } = await execFileAsync(
        'powershell',
        ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ImagePath', tempImagePath],
        { windowsHide: true, maxBuffer: 5 * 1024 * 1024 },
      );

      const payload = JSON.parse(stdout) as { text?: string; textBase64?: string; lineCount?: unknown };
      const text = payload.textBase64
        ? Buffer.from(payload.textBase64, 'base64').toString('utf8').trim()
        : (payload.text ?? '').trim();
      if (text) {
        pageTexts.push(text);
      }

      const combined = pageTexts.join('\n');
      if (combined.length > 1200 && containsKeyPromotionSignals(combined)) {
        break;
      }
    } catch {
      // Continue with subsequent pages
    } finally {
      if (fs.existsSync(tempImagePath)) {
        fs.unlinkSync(tempImagePath);
      }
    }
  }

  const combinedText = pageTexts.join('\n\n').trim();
  return {
    provider: 'windows',
    text: combinedText,
    lineCount: countLines(combinedText),
  };
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

async function runOcrSpace(
  fileBuffer: Buffer,
  originalName: string,
  config: OcrConfig,
  fileTypeHint?: string,
): Promise<OcrResult> {
  if (!config.apiUrl || !config.apiKey) {
    throw new Error('OCR.space is not fully configured');
  }

  const makeRequest = async (engine: '1' | '2') => {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)]);
    formData.append('file', blob, originalName);
    formData.append('isOverlayRequired', 'false');
    formData.append('OCREngine', engine);
    if (fileTypeHint) {
      formData.append('filetype', fileTypeHint);
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

export async function runGoogleVisionOcr(
  fileBuffer: Buffer,
  originalName: string,
  config: OcrConfig,
  fileTypeHint?: string,
): Promise<OcrResult> {
  const apiKey = config.apiKey;
  if (!apiKey) {
    throw new Error('Google Cloud Vision API key is not configured (set GOOGLE_VISION_API_KEY in .env)');
  }

  const isPdf = fileTypeHint === 'PDF' || /\.pdf$/i.test(originalName);

  const recognizeSingleImage = async (imageBuffer: Buffer): Promise<string> => {
    // Google Cloud Vision REST inline JSON payload max limit is 10MB (base64 is 4/3 of binary)
    if (imageBuffer.length > 7 * 1024 * 1024) {
      console.warn(`[Google Vision OCR] Skipping image larger than 7MB (${imageBuffer.length} bytes) to avoid 413 payload limit`);
      return '';
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

      return (
        resp?.fullTextAnnotation?.text ||
        resp?.textAnnotations?.[0]?.description ||
        ''
      ).trim();
    } finally {
      clearTimeout(timeout);
    }
  };

  if (!isPdf) {
    const text = await recognizeSingleImage(fileBuffer);
    return {
      provider: 'google-vision',
      text,
      lineCount: countLines(text),
    };
  }

  const pageTexts: string[] = [];
  for await (const { buffer } of iteratePdfPages(fileBuffer, DEFAULT_MAX_OCR_PAGES, OCR_RASTERIZE_SCALE)) {
    try {
      const pageText = await recognizeSingleImage(buffer);
      if (pageText) {
        pageTexts.push(pageText);
      }
      const combined = pageTexts.join('\n');
      if (combined.length > 1200 && containsKeyPromotionSignals(combined)) {
        break;
      }
    } catch (err) {
      console.warn('[Google Vision OCR] Error processing page:', err);
    }
  }

  const combinedText = pageTexts.join('\n\n').trim();
  return {
    provider: 'google-vision',
    text: combinedText,
    lineCount: countLines(combinedText),
  };
}

export async function runTesseractOcr(
  fileBuffer: Buffer,
  originalName: string,
  fileTypeHint?: string,
): Promise<OcrResult> {
  const isPdf = fileTypeHint === 'PDF' || /\.pdf$/i.test(originalName);

  if (!isPdf) {
    const text = await tesseractManager.recognize(fileBuffer);
    const trimmed = (text || '').trim();
    return {
      provider: 'tesseract',
      text: trimmed,
      lineCount: countLines(trimmed),
    };
  }

  // Stream PDF pages one-by-one to prevent OOM
  const pageTexts: string[] = [];
  for await (const { buffer } of iteratePdfPages(fileBuffer, DEFAULT_MAX_OCR_PAGES, OCR_RASTERIZE_SCALE)) {
    try {
      const pageText = await tesseractManager.recognize(buffer);
      if (pageText.trim()) {
        pageTexts.push(pageText.trim());
      }
      const combined = pageTexts.join('\n');
      if (combined.length > 1200 && containsKeyPromotionSignals(combined)) {
        break;
      }
    } catch (pageErr) {
      console.warn(`[Tesseract OCR] Error processing page in ${originalName}:`, pageErr);
    }
  }

  const text = pageTexts.join('\n\n').trim();
  return {
    provider: 'tesseract',
    text,
    lineCount: countLines(text),
  };
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
