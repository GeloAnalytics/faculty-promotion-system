import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingAssessmentContext, getPreferredTrainingItem } from '../src/utils/dashboardSelection';

test('getPreferredTrainingItem prioritizes evaluator-backed items over drafts', () => {
  const draftItem = {
    id: 'draft-1',
    status: 'DRAFT',
    notes: null,
    updatedAt: new Date('2026-05-20T00:00:00Z'),
    createdAt: new Date('2026-05-20T00:00:00Z'),
  };
  const labeledItem = {
    id: 'labeled-1',
    status: 'LABELED',
    notes: 'KRA I: 12',
    updatedAt: new Date('2026-05-21T00:00:00Z'),
    createdAt: new Date('2026-05-21T00:00:00Z'),
  };

  const selected = getPreferredTrainingItem([draftItem, labeledItem]);

  assert.equal(selected?.id, 'labeled-1');
});

test('buildTrainingAssessmentContext returns parsed assessment metadata for the selected item', () => {
  const context = buildTrainingAssessmentContext([
    {
      id: 'validated-1',
      status: 'VALIDATED',
      notes: 'Criterion scores: instruction=15, research=12, extension=8',
      updatedAt: new Date('2026-05-21T00:00:00Z'),
      createdAt: new Date('2026-05-21T00:00:00Z'),
    },
  ]);

  assert.equal(context?.selectedItem.id, 'validated-1');
  assert.equal(context?.assessmentContext.status, 'VALIDATED');
  assert.ok(context?.assessmentContext.assessment);
});
