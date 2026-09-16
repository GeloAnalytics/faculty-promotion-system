import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadPanels } from '../src/uploadPanels';
import { getEvidenceChecklistCompleteness, validateEvidencePacket } from '../src/utils/evidenceValidation';
import { evidenceRules } from '../src/utils/evidenceRules';

test('validateEvidencePacket marks a complete faculty packet as complete', () => {
  const requiredPanelKeys = uploadPanels.filter((panel) => panel.appliesTo === 'ALL_FACULTY').map((panel) => panel.key);

  const result = validateEvidencePacket({
    requestForm: {
      fullName: 'Maria Villarica',
      employeeId: 'E-001',
      academicRank: 'Assistant Professor IV',
      highestEducationalAttainment: 'Doctorate Graduate',
      reviewPeriod: '2026-1',
      department: 'College of Education',
    },
    uploadedPanelKeys: requiredPanelKeys,
    uploadTypeCounts: {
      'score-sheet': requiredPanelKeys.length,
      evidence: 12,
    },
    panelUploadCounts: Object.fromEntries(
      requiredPanelKeys.map((panelKey) => [panelKey, { scoreSheet: 1, evidence: 1 }]),
    ),
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.missingPanelKeys.length, 0);
  assert.equal(result.missingRequestFields.length, 0);
});

test('validateEvidencePacket blocks promotion when a required evidence panel is missing', () => {
  const requiredPanelKeys = uploadPanels.filter((panel) => panel.appliesTo === 'ALL_FACULTY').map((panel) => panel.key);
  const missingOnePanel = requiredPanelKeys.slice(0, -1);

  const result = validateEvidencePacket({
    requestForm: {
      fullName: 'Maria Villarica',
      employeeId: 'E-001',
      academicRank: 'Assistant Professor IV',
      highestEducationalAttainment: 'Doctorate Graduate',
      reviewPeriod: '2026-1',
      department: 'College of Education',
    },
    uploadedPanelKeys: missingOnePanel,
    uploadTypeCounts: {
      'score-sheet': missingOnePanel.length,
      evidence: 11,
    },
    panelUploadCounts: Object.fromEntries(
      missingOnePanel.map((panelKey) => [panelKey, { scoreSheet: 1, evidence: 1 }]),
    ),
  });

  assert.equal(result.status, 'incomplete');
  assert.equal(result.missingPanelKeys.length, 1);
  assert.match(result.note, /Incomplete promotion packet/i);
});

test('validateEvidencePacket only requires documentary evidence, not a score sheet, for each required panel', () => {
  const requiredPanelKeys = uploadPanels.filter((panel) => panel.appliesTo === 'ALL_FACULTY').map((panel) => panel.key);
  const missingEvidencePanel = requiredPanelKeys[0];
  const noScoreSheetPanel = requiredPanelKeys[1];

  const result = validateEvidencePacket({
    requestForm: {
      fullName: 'Maria Villarica',
      employeeId: 'E-001',
      academicRank: 'Assistant Professor IV',
      highestEducationalAttainment: 'Doctorate Graduate',
      reviewPeriod: '2026-1',
      department: 'College of Education',
    },
    uploadedPanelKeys: requiredPanelKeys,
    uploadTypeCounts: {
      'score-sheet': 0,
      evidence: requiredPanelKeys.length - 1,
    },
    panelUploadCounts: Object.fromEntries(
      requiredPanelKeys.map((panelKey) => [
        panelKey,
        {
          // No panel has a score sheet - score sheets are only issued after JC
          // evaluation, so a missing score sheet must never block completeness.
          scoreSheet: 0,
          evidence: panelKey === missingEvidencePanel ? 0 : 1,
        },
      ]),
    ),
  });

  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missingEvidencePanelKeys, [missingEvidencePanel]);
  assert.match(result.note, /Missing documentary evidence panel/i);
  // The panel with evidence but no score sheet must not be reported as missing.
  assert.equal(result.missingPanelKeys.includes(noScoreSheetPanel), false);
});

test('every upload panel has an Annex A documentary-evidence rule', () => {
  const missingRuleKeys = uploadPanels
    .map((panel) => panel.key)
    .filter((panelKey) => !evidenceRules[panelKey]);

  assert.deepEqual(missingRuleKeys, []);
});

test('Annex A checklist rules recognize representative KRA evidence packets', () => {
  assert.equal(
    getEvidenceChecklistCompleteness('kra1_teaching_effectiveness', [
      'student evaluation',
      'supervisor evaluation',
      'transmutation',
    ]),
    1,
  );

  assert.equal(
    getEvidenceChecklistCompleteness('kra2_research_outputs', [
      'journal article',
      'scopus',
    ]),
    1,
  );

  assert.equal(
    getEvidenceChecklistCompleteness('kra3_service_to_institution', [
      'approval document',
      'moa',
      'implementation report',
    ]),
    1,
  );

  assert.equal(
    getEvidenceChecklistCompleteness('kra4_continuing_development', [
      'program',
      'certificate of participation',
      'approval to attend',
    ]),
    1,
  );
});
