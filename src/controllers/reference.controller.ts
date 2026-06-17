import { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import pdf from 'pdf-parse';
import { extractGuidelineReference } from '../utils';
import { academicRankOptions, educationalAttainmentOptions } from '../constants/faculty';
import { uploadPanels } from '../uploadPanels';
import { tqeReferenceSummary, guidelinePdfPath } from '../config/globals';
import { getEmployeeUploadWorkflowSummary } from '../uploadWorkflow';

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
