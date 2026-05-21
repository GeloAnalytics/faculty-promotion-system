import { parseEvaluatorAssessment } from './evaluator.utils';

export type TrainingSelectionCandidate = {
  status: string;
  notes: string | null;
  updatedAt: Date;
  createdAt: Date;
};

export function getLatestEvaluatorBackedTrainingItem<T extends TrainingSelectionCandidate>(trainingItems: T[]) {
  return trainingItems.find((item) => item.status === 'LABELED' || item.status === 'VALIDATED') ?? null;
}

export function getPreferredTrainingItem<T extends TrainingSelectionCandidate>(trainingItems: T[]) {
  return getLatestEvaluatorBackedTrainingItem(trainingItems) ?? trainingItems[0] ?? null;
}

export function buildTrainingAssessmentContext<T extends TrainingSelectionCandidate>(trainingItems: T[]) {
  const selectedItem = getPreferredTrainingItem(trainingItems);
  if (!selectedItem) {
    return undefined;
  }

  return {
    selectedItem,
    assessmentContext: {
      assessment: parseEvaluatorAssessment(selectedItem.notes),
      status: selectedItem.status,
    },
  };
}
