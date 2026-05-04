import path from 'node:path';
import { findGuidelinePdfPath, loadTqeReferenceData, summarizeTqeReferenceData } from '../utils';
import { isOcrReady, type OcrConfig, type OcrProvider } from '../ocr';
import { env } from './env';

export const repoRoot = process.cwd();
export const tqeCsvPath = path.join(repoRoot, 'TQE.csv');
export const guidelinePdfPath = findGuidelinePdfPath(repoRoot);
export const tqeReferenceRecords = loadTqeReferenceData(tqeCsvPath);
export const tqeReferenceSummary = summarizeTqeReferenceData(tqeReferenceRecords);
export const publicDir = path.join(repoRoot, 'public');
export const ocrScriptPath = path.join(repoRoot, 'scripts', 'ocr-image.ps1');

export const ocrConfig: OcrConfig = {
  provider: env.OCR_PROVIDER as OcrProvider,
  scriptPath: ocrScriptPath,
  apiUrl: env.OCR_API_URL,
  apiKey: env.OCR_API_KEY,
  apiKeyHeader: env.OCR_API_KEY_HEADER,
  fileFieldName: env.OCR_FILE_FIELD_NAME,
  timeoutMs: env.OCR_TIMEOUT_MS,
};

export const isOcrReadyFlag = isOcrReady(ocrConfig);
