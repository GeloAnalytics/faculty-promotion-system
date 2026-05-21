import test from 'node:test';
import assert from 'node:assert/strict';
import { findBestMatchingProfile, normalizeForMatch, scoreProfileFilename } from '../src/utils/profileMatching';

test('scoreProfileFilename strongly rewards employee id matches', () => {
  const withEmployeeId = scoreProfileFilename('Maria Santos', 'E039', 'E039_Maria_Santos.pdf');
  const nameOnly = scoreProfileFilename('Maria Santos', undefined, 'Maria_Santos.pdf');

  assert.ok(withEmployeeId > nameOnly);
});

test('normalizeForMatch removes punctuation and casing differences', () => {
  assert.equal(normalizeForMatch('María A. Santos, PhD'), 'mari a a santos phd');
});

test('findBestMatchingProfile returns the best name match from candidates', () => {
  const match = findBestMatchingProfile(
    [
      { id: '1', name: 'Ana Reyes', employeeId: null },
      { id: '2', name: 'Maria Santos', employeeId: 'E039' },
    ],
    'promotion_E039_maria_santos_supporting_document.pdf',
  );

  assert.equal(match?.id, '2');
});
