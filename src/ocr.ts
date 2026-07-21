import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createWorker } from 'tesseract.js';

const execFileAsync = promisify(execFile);

export type OcrProvider = 'windows' | 'http' | 'ocrspace' | 'tesseract' | 'disabled';

// Self-hosted, so there's no per-file size cap or monthly quota the way there
// is with OCR.space's free plan - a large scanned PDF just takes longer
// instead of getting rejected outright. Cap page count rather than file size
// so a pathologically large PDF can't tie up a request thread indefinitely.
const MAX_TESSERACT_PDF_PAGES = 30;

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

export function isOcrReady(config: OcrConfig) {
  if (config.provider === 'windows') {
    return process.platform === 'win32' && fs.existsSync(config.scriptPath);
  }

  if (config.provider === 'http') {
    return Boolean(config.apiUrl);
  }

  if (config.provider === 'ocrspace') {
    return Boolean(config.apiUrl && config.apiKey);
  }

  if (config.provider === 'tesseract') {
    return true;
  }

  return false;
}

export async function extractImageTextWithOcr(
  fileBuffer: Buffer,
  originalName: string,
  config: OcrConfig,
  fileTypeHint?: string,
): Promise<OcrResult> {
  if (config.provider === 'windows') {
    return runWindowsOcr(fileBuffer, originalName, config.scriptPath);
  }

  if (config.provider === 'http') {
    return runHttpOcr(fileBuffer, originalName, config);
  }

  if (config.provider === 'ocrspace') {
    return runOcrSpace(fileBuffer, originalName, config, fileTypeHint);
  }

  if (config.provider === 'tesseract') {
    return runTesseractOcr(fileBuffer, originalName, fileTypeHint);
  }

  throw new Error('OCR is not configured');
}

async function runWindowsOcr(fileBuffer: Buffer, originalName: string, scriptPath: string): Promise<OcrResult> {
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

    const payload = JSON.parse(stdout) as { text?: string; lineCount?: number };
    return {
      provider: 'windows',
      text: (payload.text ?? '').trim(),
      lineCount: payload.lineCount ?? 0,
    };
  } finally {
    if (fs.existsSync(tempImagePath)) {
      fs.unlinkSync(tempImagePath);
    }
  }
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

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)]);
  formData.append('file', blob, originalName);
  formData.append('isOverlayRequired', 'false');
  formData.append('OCREngine', '2');
  if (fileTypeHint) {
    // OCR.space normally infers the file type from the upload's file name
    // extension, but a scanned/image-only PDF forwarded from the PDF upload
    // path benefits from an explicit hint rather than relying on that
    // inference alone.
    formData.append('filetype', fileTypeHint);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        apikey: config.apiKey,
      },
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
      provider: 'http',
      text,
      lineCount: countLines(text),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runTesseractOcr(
  fileBuffer: Buffer,
  originalName: string,
  fileTypeHint?: string,
): Promise<OcrResult> {
  const isPdf = fileTypeHint === 'PDF' || /\.pdf$/i.test(originalName);
  const pageImages = isPdf ? await rasterizePdfPages(fileBuffer) : [fileBuffer];

  const worker = await createWorker('eng');
  try {
    const pageTexts: string[] = [];
    for (const pageImage of pageImages) {
      const { data } = await worker.recognize(pageImage);
      pageTexts.push(data.text);
    }

    const text = pageTexts.join('\n').trim();
    return {
      provider: 'tesseract',
      text,
      lineCount: countLines(text),
    };
  } finally {
    await worker.terminate();
  }
}

async function rasterizePdfPages(fileBuffer: Buffer): Promise<Buffer[]> {
  // pdf-to-img is ESM-only; this project compiles to CommonJS, so it has to
  // be loaded via a dynamic import rather than a static one.
  const { pdf } = await import('pdf-to-img');
  const dataUrl = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
  const document = await pdf(dataUrl, { scale: 2 });

  const pages: Buffer[] = [];
  for await (const page of document) {
    pages.push(page as Buffer);
    if (pages.length >= MAX_TESSERACT_PDF_PAGES) {
      break;
    }
  }
  return pages;
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
