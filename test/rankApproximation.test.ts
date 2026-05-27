import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftPointSummary } from '../src/utils/dashboard.utils';

function buildProfileFeatures({
  academicRank,
  highestEducationalAttainment,
  promotionHistory = [],
  teachingEffectiveness = 91.8,
  researchOutputs = 4.4,
  extensionServices = 3,
  professionalDevelopmentHours = 48,
  ipcrAverage = 4.5,
}: {
  academicRank: string;
  highestEducationalAttainment: string;
  promotionHistory?: Array<Record<string, unknown>>;
  teachingEffectiveness?: number;
  researchOutputs?: number;
  extensionServices?: number;
  professionalDevelopmentHours?: number;
  ipcrAverage?: number;
}) {
  return {
    rawInput: {
      personalData: {
        fullName: 'Test Faculty',
        academicRank,
        highestEducationalAttainment,
      },
      performanceReview: {
        teachingEffectiveness,
        researchOutputs,
        extensionServices,
        professionalDevelopmentHours,
        ipcrAverage,
      },
      promotionHistory,
    },
  };
}

function buildCycleMetricSummary(valuesByYear: Array<[number, number]>) {
  const yearLabels = ['2022-2023', '2023-2024', '2024-2025', '2025-2026'];
  const flattenedValues = valuesByYear.flat();
  const average = Math.round((flattenedValues.reduce((sum, value) => sum + value, 0) / flattenedValues.length) * 100) / 100;

  return {
    average,
    yearlyEntries: yearLabels.map((yearLabel, index) => {
      const [firstSemester, secondSemester] = valuesByYear[index];
      return {
        yearLabel,
        firstSemester,
        secondSemester,
        yearlyAverage: Math.round(((firstSemester + secondSemester) / 2) * 100) / 100,
      };
    }),
  };
}

test('associate professor projection is capped without doctoral units or graduation', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: buildProfileFeatures({
        academicRank: 'Assistant Professor IV',
        highestEducationalAttainment: 'Masteral Graduate',
      }),
      semester: '2026-1',
    },
    [],
  );

  assert.equal(draftPoints.promotionDraft.status, 'pending-doctoral-attainment');
  assert.equal(draftPoints.promotionDraft.suggestedRank, 'Assistant Professor IV');
  assert.match(draftPoints.promotionDraft.projectedRank ?? '', /^Associate Professor /);
});

test('professor ranks are capped to one rank increase from KRA scoring', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: buildProfileFeatures({
        academicRank: 'Professor I',
        highestEducationalAttainment: 'Doctorate Units',
      }),
      semester: '2026-1',
    },
    [],
  );

  assert.equal(draftPoints.promotionDraft.status, 'preliminary');
  assert.equal(draftPoints.promotionDraft.suggestedRank, 'Professor II');
  assert.equal(draftPoints.promotionDraft.subrankIncrements, 1);
});

test('doctoral graduate bonus does not push professor projections beyond one rank', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: buildProfileFeatures({
        academicRank: 'Professor I',
        highestEducationalAttainment: 'Doctorate Graduate',
      }),
      semester: '2026-1',
    },
    [],
  );

  assert.equal(draftPoints.promotionDraft.status, 'preliminary');
  assert.equal(draftPoints.promotionDraft.suggestedRank, 'Professor II');
  assert.equal(draftPoints.promotionDraft.subrankIncrements, 1);
  assert.doesNotMatch(draftPoints.promotionDraft.note, /one-time \+1 rank adjustment/i);
});

test('doctoral graduates receive the one-time +1 rank bonus when no prior promotion is recorded', () => {
  const bonusDraft = buildDraftPointSummary(
    {
      features: buildProfileFeatures({
        academicRank: 'Assistant Professor IV',
        highestEducationalAttainment: 'Doctorate Graduate',
        teachingEffectiveness: 91.8,
        researchOutputs: 2,
        extensionServices: 1,
        professionalDevelopmentHours: 0,
        ipcrAverage: 0,
      }),
      semester: '2026-1',
    },
    [],
  );

  const usedDraft = buildDraftPointSummary(
    {
      features: buildProfileFeatures({
        academicRank: 'Assistant Professor IV',
        highestEducationalAttainment: 'Doctorate Graduate',
        teachingEffectiveness: 91.8,
        researchOutputs: 2,
        extensionServices: 1,
        professionalDevelopmentHours: 0,
        ipcrAverage: 0,
        promotionHistory: [
          {
            promoted: true,
            previousRank: 'Assistant Professor III',
            newRank: 'Assistant Professor IV',
          },
        ],
      }),
      semester: '2026-1',
    },
    [],
  );

  assert.equal(bonusDraft.promotionDraft.suggestedRank, 'Associate Professor II');
  assert.equal(usedDraft.promotionDraft.suggestedRank, 'Associate Professor I');
  assert.match(bonusDraft.promotionDraft.note, /one-time \+1 rank adjustment/i);
});

test('draft rank still resolves when baseline and cycle data are stored separately', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: {
        baselineData: {
          personalData: {
            fullName: 'Test Faculty',
            academicRank: 'Assistant Professor IV',
            highestEducationalAttainment: 'Doctorate Graduate',
            yearsInService: 11,
          },
          promotionHistory: [],
        },
      },
      semester: '2026-1',
    },
    [],
    undefined,
    {
      performanceReview: {
        teachingEffectiveness: 91.8,
        researchOutputs: 2,
        extensionServices: 1,
        professionalDevelopmentHours: 0,
        ipcrAverage: 0,
      },
      notes: 'Cycle data test',
    },
  );

  assert.equal(draftPoints.promotionDraft.suggestedRank, 'Associate Professor II');
  assert.equal(draftPoints.promotionDraft.currentRank, 'Assistant Professor IV');
});

test('draft rank can resolve from semester-by-semester cycle metrics when flat averages are absent', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: {
        baselineData: {
          personalData: {
            fullName: 'Test Faculty',
            academicRank: 'Assistant Professor IV',
            highestEducationalAttainment: 'Doctorate Graduate',
          },
          promotionHistory: [],
        },
      },
      semester: 'July 2022-June 2026',
    },
    [],
    undefined,
    {
      performanceReview: {
        cycleMetrics: {
          teachingEffectiveness: buildCycleMetricSummary([
            [90, 92],
            [92, 93],
            [94, 95],
            [95, 96],
          ]),
          researchOutputs: buildCycleMetricSummary([
            [2, 2],
            [2, 2],
            [2, 3],
            [3, 3],
          ]),
          extensionServices: buildCycleMetricSummary([
            [1, 1],
            [1, 1],
            [1, 1],
            [1, 2],
          ]),
          ipcrAverage: buildCycleMetricSummary([
            [4.5, 4.5],
            [4.6, 4.6],
            [4.7, 4.7],
            [4.8, 4.8],
          ]),
        },
      },
    },
  );

  assert.equal(draftPoints.promotionDraft.suggestedRank, 'Associate Professor II');
  assert.equal(draftPoints.semester, 'July 2022-June 2026');
});
