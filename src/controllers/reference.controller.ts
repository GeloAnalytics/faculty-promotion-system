import { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import pdf from 'pdf-parse';
import { extractGuidelineReference } from '../utils';
import { academicRankOptions, educationalAttainmentOptions, collegeDepartmentOptions } from '../constants/faculty';
import { uploadPanels } from '../uploadPanels';
import { tqeReferenceSummary, guidelinePdfPath } from '../config/globals';
import { getEmployeeUploadWorkflowSummary } from '../uploadWorkflow';
import { env } from '../config/env';
import { DOCUMENTS_BUCKET } from '../config/supabase';
import {
  getActiveStorageProvider,
  getDefaultBucketName,
  isCloudStorageConfigured,
} from '../services/storage.service';
import { isPromotionModelAvailable } from '../services/model.service';

export const getTqeSummary = (_req: Request, res: Response) => {
  res.json({
    source: 'TQE.csv',
    summary: tqeReferenceSummary,
    usage:
      'This dataset is a teaching-quality and score-distribution reference only. The promotion-prediction model is trained on a separate, disclosed-synthetic dataset (see docs/model-training-results.md), not on this file.',
  });
};

export const getUploadPanels = (_req: Request, res: Response) => {
  res.json({
    modelStatus: isPromotionModelAvailable() ? 'active' : 'inactive',
    panels: uploadPanels,
  });
};

export const getEmployeeUploadWorkflow = (_req: Request, res: Response) => {
  res.json({
    modelStatus: isPromotionModelAvailable() ? 'active' : 'inactive',
    workflow: getEmployeeUploadWorkflowSummary(),
  });
};

export const getFacultyOptions = (_req: Request, res: Response) => {
  res.json({
    academicRanks: academicRankOptions,
    educationalAttainments: educationalAttainmentOptions,
    collegeDepartments: collegeDepartmentOptions,
  });
};

/**
 * GET /api/config/storage
 * Returns the storage configuration the browser needs for direct storage uploads.
 * directUploadEnabled is true if Cloudflare R2, S3, or Supabase storage is configured.
 */
export const getStorageConfig = (_req: Request, res: Response) => {
  const provider = getActiveStorageProvider();
  res.json({
    provider,
    supabaseUrl: env.SUPABASE_URL || null,
    supabaseAnonKey: env.SUPABASE_ANON_KEY || null,
    bucket: getDefaultBucketName(),
    directUploadEnabled: isCloudStorageConfigured(),
  });
};

export const getGuidelines = async (_req: Request, res: Response) => {
  if (!guidelinePdfPath) {
    return res.status(404).json({
      error: 'Guideline PDF not found in repository root',
    });
  }

  const data = await pdf(fs.readFileSync(guidelinePdfPath));
  return res.json({
    source: path.basename(guidelinePdfPath),
    guideline: extractGuidelineReference(data.text, path.basename(guidelinePdfPath)),
  });
};
