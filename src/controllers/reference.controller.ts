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

export const getTqeSummary = (_req: Request, res: Response) => {
  res.json({
    source: 'TQE.csv',
    summary: tqeReferenceSummary,
    usage:
      'This dataset is currently used as a teaching-quality and score-distribution reference, not as the final promotion outcome dataset.',
  });
};

export const getUploadPanels = (_req: Request, res: Response) => {
  res.json({
    modelStatus: 'inactive',
    panels: uploadPanels,
  });
};

export const getEmployeeUploadWorkflow = (_req: Request, res: Response) => {
  res.json({
    modelStatus: 'inactive',
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
 * Returns the public Supabase credentials the browser needs for direct storage uploads.
 * Only the anon key is returned — never the service role key.
 */
export const getStorageConfig = (_req: Request, res: Response) => {
  res.json({
    supabaseUrl: env.SUPABASE_URL || null,
    supabaseAnonKey: env.SUPABASE_ANON_KEY || null,
    bucket: DOCUMENTS_BUCKET,
    directUploadEnabled: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
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
