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
      'score-sheet': 1,
      evidence: 12,
    },
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
      'score-sheet': 1,
      evidence: 11,
    },
  });

  assert.equal(result.status, 'incomplete');
  assert.equal(result.missingPanelKeys.length, 1);
  assert.match(result.note, /Incomplete promotion packet/i);
});
