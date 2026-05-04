import { uploadPanels } from '../uploadPanels';
import { UploadPanelDefinition } from '../types';

export type EvaluatorAssessment = {
  freeformNotes: string;
  criterionScores: Partial<Record<UploadPanelDefinition['key'], number>>;
  totalScore: number;
};

export function createEvaluatorAssessment(notes: string | undefined, criterionScores: Record<string, number> | undefined): EvaluatorAssessment {
  const sanitizedScores = sanitizeCriterionScores(criterionScores ?? {});
  return {
    freeformNotes: notes ?? '',
    criterionScores: sanitizedScores,
    totalScore: roundScore(
      Object.values(sanitizedScores).reduce((sum, value) => {
        return sum + value;
      }, 0),
    ),
  };
}

export function sanitizeCriterionScores(input: Record<string, number>) {
  const sanitized: Partial<Record<UploadPanelDefinition['key'], number>> = {};
  const sharedCapTotals = new Map<string, number>();

  for (const panel of uploadPanels) {
    const value = input[panel.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }

    const roundedValue = roundScore(Math.max(0, Math.min(value, panel.maxScore)));
    sanitized[panel.key] = roundedValue;

    if (panel.sharedCapKey) {
      sharedCapTotals.set(panel.sharedCapKey, (sharedCapTotals.get(panel.sharedCapKey) ?? 0) + roundedValue);
    }
  }

  for (const panel of uploadPanels) {
    if (!panel.sharedCapKey || !panel.sharedCapMaxScore) {
      continue;
    }

    const total = sharedCapTotals.get(panel.sharedCapKey) ?? 0;
    if (total > panel.sharedCapMaxScore) {
      throw new Error(`${panel.sharedCapLabel ?? 'Shared criterion'} cannot exceed ${panel.sharedCapMaxScore} points`);
    }
  }

  return sanitized;
}

export function parseEvaluatorAssessment(value: unknown): EvaluatorAssessment {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      freeformNotes: '',
      criterionScores: {},
      totalScore: 0,
    };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const scoreRecord = readNumberRecord(parsed.criterionScores);
    const sanitizedScores = sanitizeCriterionScores(scoreRecord);
    const totalScore =
      typeof parsed.totalScore === 'number' && Number.isFinite(parsed.totalScore)
        ? roundScore(parsed.totalScore)
        : roundScore(Object.values(sanitizedScores).reduce((sum, score) => sum + score, 0));

    return {
      freeformNotes: typeof parsed.freeformNotes === 'string' ? parsed.freeformNotes : '',
      criterionScores: sanitizedScores,
      totalScore,
    };
  } catch {
    return {
      freeformNotes: value as string,
      criterionScores: {},
      totalScore: 0,
    };
  }
}

export function serializeEvaluatorAssessment(assessment: EvaluatorAssessment) {
  return JSON.stringify({
    freeformNotes: assessment.freeformNotes,
    criterionScores: assessment.criterionScores,
    totalScore: assessment.totalScore,
  });
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readNumberRecord(value: unknown): Record<string, number> {
  const record = readJsonObject(value);
  return Object.entries(record).reduce<Record<string, number>>((numbers, [key, entry]) => {
    const parsed = readOptionalNumber(entry);
    if (parsed !== null) {
      numbers[key] = parsed;
    }
    return numbers;
  }, {});
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}
