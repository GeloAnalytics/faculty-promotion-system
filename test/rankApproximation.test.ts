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
// The authoritative per-panel score computation reads the score keyed by the
// exact panel key (summarizeDocumentMetadata.panelScore), and clamps it to
// that panel's own maxScore - unlike the old raw-number-times-fudge-factor
// approximate formula this replaced, so fixture scores must already be on
// each panel's real point scale, not an arbitrary small input number.
function buildOcrDocument(panelKey: string, score: number) {
  return {
    extractionMetadata: {
      uploadType: 'evidence',
      panelKey,
      panelTitle: panelKey,
      analysis: { extractedScores: { [panelKey]: score } },
    },
  };
}

// One covered panel per KRA - partial coverage is intentional (these tests
// exercise the rank-cap/doctoral-bonus logic under an incomplete evidence
// packet, matching real early-stage submissions). Each panel is scored 45,
// chosen from the panels in its KRA whose own maxScore can actually hold 45
// (kra3_service_to_institution tops out at 30, kra4_professional_organizations
// at 20, so those can't be used alone). Since all four KRA totals come out
// identical, the weighted score is 45 under every rank-group's weight
// profile (weights always sum to 1), landing in the 41-50 bracket
// (subrankIncrements = 1) regardless of which weight profile applies.
function buildOcrDocuments() {
  return [
    buildOcrDocument('kra1_teaching_effectiveness', 45),
    buildOcrDocument('kra2_research_outputs', 45),
    buildOcrDocument('kra3_service_to_community', 45),
    buildOcrDocument('kra4_continuing_development', 45),
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
    buildOcrDocuments(),
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
    buildOcrDocuments(),
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
    buildOcrDocuments(),
  );

  assert.equal(draftPoints.promotionDraft.status, 'pending');
  assert.equal(draftPoints.promotionDraft.suggestedRank, 'Professor II');
  assert.equal(draftPoints.promotionDraft.subrankIncrements, 1);
  assert.doesNotMatch(draftPoints.promotionDraft.note, /one-time \+1 rank adjustment/i);
  assert.match(draftPoints.promotionDraft.note, /Incomplete promotion packet/i);
});

test('doctoral graduates receive the one-time +1 rank bonus when no prior promotion is recorded', () => {
  const documents = buildOcrDocuments();

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

test('evidence-based score computation contributes 0 when evidence is uploaded with no detectable score, checklist match, or document-quality signal', () => {
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
  assert.equal(researchPanel?.scoreSource, 'evidence-relevance-estimate');
});

test('evidence-based score computation gives a conservative document-quality estimate when nothing else is detected', () => {
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
          // No detected score and no checklist keywords matched, but the
          // document itself looks substantive (decent completeness/quality
          // heuristics) - that should land at a conservative estimate, not 0
          // and nowhere near full marks.
          uploadType: 'evidence',
          panelKey: 'kra2_research_outputs',
          panelTitle: 'Research Outputs',
          analysis: {
            extractedScores: {},
            completenessScore: 0.8,
            qualityScore: 0.6,
          },
        },
      },
    ],
  );

  const researchPanel = draftPoints.scoreComputation?.panelScores.find((panel) => panel.key === 'kra2_research_outputs');
  assert.equal(researchPanel?.status, 'counted');
  assert.equal(researchPanel?.scoreSource, 'evidence-relevance-estimate');
  assert.equal(researchPanel?.usedScore, 31.5);
  assert.ok((researchPanel?.usedScore ?? 0) < 0.5 * (researchPanel?.maxScore ?? 0));
});

test('evidence-based score computation credits a short but topically relevant document, not just long ones', () => {
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
          // kra4_awards_recognition's strict checklist (OR: 'certificate of
          // recognition' / 'plaque') isn't matched, and completeness/quality
          // are both 0 (e.g. a short single-page scan) - but the document's
          // subject-matter vocabulary (uploadPanelKeywordMap: 'award',
          // 'recognition', 'distinction') hits 1 of 3 terms, so a short but
          // clearly on-topic document should still earn some credit instead
          // of being punished purely for being short.
          uploadType: 'evidence',
          panelKey: 'kra4_awards_recognition',
          panelTitle: 'Awards and Recognitions',
          analysis: {
            extractedScores: {},
            detectedCategories: ['recognition'],
          },
        },
      },
    ],
  );

  const awardsPanel = draftPoints.scoreComputation?.panelScores.find((panel) => panel.key === 'kra4_awards_recognition');
  assert.equal(awardsPanel?.status, 'counted');
  assert.equal(awardsPanel?.scoreSource, 'evidence-relevance-estimate');
  assert.equal(awardsPanel?.usedScore, 3);
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
