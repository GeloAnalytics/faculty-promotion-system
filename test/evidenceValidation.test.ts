import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadPanels } from '../src/uploadPanels';
import { validateEvidencePacket } from '../src/utils/evidenceValidation';

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

test('validateEvidencePacket requires score sheet and documentary evidence for each required panel', () => {
  const requiredPanelKeys = uploadPanels.filter((panel) => panel.appliesTo === 'ALL_FACULTY').map((panel) => panel.key);
  const missingEvidencePanel = requiredPanelKeys[0];
  const missingScoreSheetPanel = requiredPanelKeys[1];

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
      'score-sheet': requiredPanelKeys.length - 1,
      evidence: requiredPanelKeys.length - 1,
    },
    panelUploadCounts: Object.fromEntries(
      requiredPanelKeys.map((panelKey) => [
        panelKey,
        {
          scoreSheet: panelKey === missingScoreSheetPanel ? 0 : 1,
          evidence: panelKey === missingEvidencePanel ? 0 : 1,
        },
      ]),
    ),
  });

  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missingScoreSheetPanelKeys, [missingScoreSheetPanel]);
  assert.deepEqual(result.missingEvidencePanelKeys, [missingEvidencePanel]);
  assert.match(result.note, /Missing score sheet panel/i);
  assert.match(result.note, /Missing documentary evidence panel/i);
});
