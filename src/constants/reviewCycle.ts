export const fixedReviewPeriodLabel = 'July 2022-June 2026';

export const reviewCycleYearLabels = ['2022-2023', '2023-2024', '2024-2025', '2025-2026'] as const;

export const reviewCycleMetricDefinitions = {
  ipcrAverage: {
    label: 'IPCR Average',
    max: 5,
  },
  teachingEffectiveness: {
    label: 'Teaching Effectiveness',
    max: 100,
  },
  researchOutputs: {
    label: 'Research Outputs',
  },
  extensionServices: {
    label: 'Extension Services',
  },
} as const;

export const reviewCycleMetricKeys = Object.keys(reviewCycleMetricDefinitions) as Array<
  keyof typeof reviewCycleMetricDefinitions
>;
