import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftPointSummary } from '../src/utils/dashboard.utils';

function buildProfileFeatures({
  academicRank,
  highestEducationalAttainment,
  promotionHistory = [],
}: {
  academicRank: string;
  highestEducationalAttainment: string;
  promotionHistory?: Array<Record<string, unknown>>;
}) {
  return {
    rawInput: {
      personalData: {
        fullName: 'Test Faculty',
        academicRank,
        highestEducationalAttainment,
      },
      promotionHistory,
    },
  };
}

// Every KRA score must come from an OCR-tagged upload, never a typed field -
// these fixtures mirror what processUploadedDocument would have written to
// extractionMetadata.analysis.extractedScores for a real scanned document.
function buildOcrDocument(panelKey: string, extractedScores: Record<string, number>) {
  return {
    extractionMetadata: {
      uploadType: 'evidence',
      panelKey,
      panelTitle: panelKey,
      analysis: { extractedScores },
    },
  };
}

function buildOcrDocuments({
  teachingEffectiveness = 91.8,
  researchOutputs = 4.4,
  extensionServices = 3,
  professionalDevelopmentHours = 48,
  ipcrAverage = 4.5,
}: {
  teachingEffectiveness?: number;
  researchOutputs?: number;
  extensionServices?: number;
  professionalDevelopmentHours?: number;
  ipcrAverage?: number;
}) {
  return [
    buildOcrDocument('kra1_teaching_effectiveness', { teachingEffectiveness, ipcrAverage }),
    buildOcrDocument('kra2_research_outputs', { researchOutputs }),
    buildOcrDocument('kra3_service_to_institution', { extensionServices }),
    buildOcrDocument('kra4_professional_organizations', { professionalDevelopmentHours }),
  ];
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
    buildOcrDocuments({}),
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
    buildOcrDocuments({}),
  );

  assert.equal(draftPoints.promotionDraft.status, 'pending');
  assert.equal(draftPoints.promotionDraft.suggestedRank, 'Professor II');
  assert.equal(draftPoints.promotionDraft.subrankIncrements, 1);
  assert.match(draftPoints.promotionDraft.note, /Incomplete promotion packet/i);
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
    buildOcrDocuments({}),
  );

  assert.equal(draftPoints.promotionDraft.status, 'pending');
  assert.equal(draftPoints.promotionDraft.suggestedRank, 'Professor II');
  assert.equal(draftPoints.promotionDraft.subrankIncrements, 1);
  assert.doesNotMatch(draftPoints.promotionDraft.note, /one-time \+1 rank adjustment/i);
  assert.match(draftPoints.promotionDraft.note, /Incomplete promotion packet/i);
});

test('doctoral graduates receive the one-time +1 rank bonus when no prior promotion is recorded', () => {
  const documents = buildOcrDocuments({
    teachingEffectiveness: 91.8,
    researchOutputs: 2,
    extensionServices: 1,
    professionalDevelopmentHours: 0,
    ipcrAverage: 0,
  });

  const bonusDraft = buildDraftPointSummary(
    {
      features: buildProfileFeatures({
        academicRank: 'Assistant Professor IV',
        highestEducationalAttainment: 'Doctorate Graduate',
      }),
      semester: '2026-1',
    },
    documents,
  );

  const usedDraft = buildDraftPointSummary(
    {
      features: buildProfileFeatures({
        academicRank: 'Assistant Professor IV',
        highestEducationalAttainment: 'Doctorate Graduate',
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
    documents,
  );

  assert.equal(bonusDraft.promotionDraft.suggestedRank, 'Associate Professor II');
  assert.equal(usedDraft.promotionDraft.suggestedRank, 'Associate Professor I');
  assert.match(bonusDraft.promotionDraft.note, /one-time \+1 rank adjustment/i);
});

test('workbook mirror follows the reference workbook naming and parses request form names', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: {
        rawInput: {
          personalData: {
            fullName: 'Mia V. Villarica',
            academicRank: 'Assistant Professor IV',
            highestEducationalAttainment: 'Masteral Graduate',
          },
          promotionHistory: [],
        },
      },
      semester: '2026-1',
    },
    [],
  );

  assert.equal(draftPoints.workbookMirror.requestForm.nameParts.firstName, 'Mia');
  assert.equal(draftPoints.workbookMirror.requestForm.nameParts.lastName, 'Villarica');
  assert.equal(draftPoints.workbookMirror.kraSections[1].title, 'KRA 2: Research, Innovation and Creative Work');
  assert.equal(draftPoints.workbookMirror.summarySheet.scoreBracket, draftPoints.promotionDraft.scoreBracket);
});

test('evidence-based score computation counts 0 for a required panel with no evidence uploaded at all', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: {
        rawInput: {
          personalData: {
            fullName: 'Mia V. Villarica',
            academicRank: 'Assistant Professor IV',
            highestEducationalAttainment: 'Masteral Graduate',
          },
          promotionHistory: [],
        },
      },
      semester: '2026-1',
    },
    [
      {
        extractionMetadata: {
          // A score sheet alone - with no matching evidence upload - must not
          // count, since score sheets are only issued after JC evaluation and
          // play no part in this pre-JC draft.
          uploadType: 'score-sheet',
          panelKey: 'kra1_teaching_effectiveness',
          panelTitle: 'Teaching Effectiveness',
          analysis: {
            extractedScores: {
              kra1_teaching_effectiveness: 59,
            },
          },
        },
      },
    ],
  );

  const teachingPanel = draftPoints.scoreComputation?.panelScores.find((panel) => panel.key === 'kra1_teaching_effectiveness');
  assert.equal(teachingPanel?.status, 'missing-evidence');
  assert.equal(teachingPanel?.usedScore, 0);
  assert.equal(draftPoints.scoreComputation?.zeroedPanelCount > 0, true);
});

test('evidence-based score computation uses the OCR-detected score from the evidence itself, without any score sheet', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: {
        rawInput: {
          personalData: {
            fullName: 'Mia V. Villarica',
            academicRank: 'Assistant Professor IV',
            highestEducationalAttainment: 'Masteral Graduate',
          },
          promotionHistory: [],
        },
      },
      semester: '2026-1',
    },
    [
      {
        extractionMetadata: {
          // The evidence document's own OCR text contains a detectable score
          // for this panel - that real number should be used, not a flat
          // full-marks award just because a file was attached.
          uploadType: 'evidence',
          panelKey: 'kra2_research_outputs',
          panelTitle: 'Research Outputs',
          analysis: {
            extractedScores: {
              kra2_research_outputs: 72,
            },
          },
        },
      },
    ],
  );

  const researchPanel = draftPoints.scoreComputation?.panelScores.find((panel) => panel.key === 'kra2_research_outputs');
  assert.equal(researchPanel?.status, 'counted');
  assert.equal(researchPanel?.usedScore, 72);
  assert.notEqual(researchPanel?.usedScore, researchPanel?.maxScore);
});

test('evidence-based score computation counts the panel as present but contributes 0 when evidence is uploaded with no detectable score yet', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: {
        rawInput: {
          personalData: {
            fullName: 'Mia V. Villarica',
            academicRank: 'Assistant Professor IV',
            highestEducationalAttainment: 'Masteral Graduate',
          },
          promotionHistory: [],
        },
      },
      semester: '2026-1',
    },
    [
      {
        extractionMetadata: {
          uploadType: 'evidence',
          panelKey: 'kra2_research_outputs',
          panelTitle: 'Research Outputs',
          analysis: {
            extractedScores: {},
          },
        },
      },
    ],
  );

  const researchPanel = draftPoints.scoreComputation?.panelScores.find((panel) => panel.key === 'kra2_research_outputs');
  assert.equal(researchPanel?.status, 'counted');
  assert.equal(researchPanel?.usedScore, 0);
  assert.equal(researchPanel?.scoreSource, 'evidence-checklist');
});

test('evidence-based score computation gives partial credit from the evidence checklist when no OCR score is detected', () => {
  const draftPoints = buildDraftPointSummary(
    {
      features: {
        rawInput: {
          personalData: {
            fullName: 'Mia V. Villarica',
            academicRank: 'Assistant Professor IV',
            highestEducationalAttainment: 'Masteral Graduate',
          },
          promotionHistory: [],
        },
      },
      semester: '2026-1',
    },
    [
      {
        extractionMetadata: {
          // kra2_research_outputs requires an AND of 'research output' and
          // 'peer review' - only one of the two is detected here, so this
          // panel should land at half its max, not 0 and not full marks.
          uploadType: 'evidence',
          panelKey: 'kra2_research_outputs',
          panelTitle: 'Research Outputs',
          analysis: {
            extractedScores: {},
            keywordHits: ['research output'],
          },
        },
      },
    ],
  );

  const researchPanel = draftPoints.scoreComputation?.panelScores.find((panel) => panel.key === 'kra2_research_outputs');
  assert.equal(researchPanel?.status, 'counted');
  assert.equal(researchPanel?.scoreSource, 'evidence-checklist');
  assert.equal(researchPanel?.usedScore, 50);
});
