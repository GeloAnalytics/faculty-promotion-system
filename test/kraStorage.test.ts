import test from 'node:test';
import assert from 'node:assert/strict';
import { getKraStoragePath, resolveStoredDocumentPath } from '../src/utils/document.utils';

test('getKraStoragePath routes KRA 1 panels to kra1 folder', () => {
  const path = getKraStoragePath('kra1_teaching_effectiveness', 'evaluation.pdf', 'application/pdf');
  assert.match(path, /^kra1\/kra1_teaching_effectiveness\/[a-f0-9-]+\.pdf$/);
});

test('getKraStoragePath routes KRA 2 panels to kra2 folder', () => {
  const path = getKraStoragePath('kra2_research_outputs', 'journal_paper.png', 'image/png');
  assert.match(path, /^kra2\/kra2_research_outputs\/[a-f0-9-]+\.png$/);
});

test('getKraStoragePath routes KRA 3 panels to kra3 folder', () => {
  const path = getKraStoragePath('kra3_service_to_community', 'community_cert.jpg', 'image/jpeg');
  assert.match(path, /^kra3\/kra3_service_to_community\/[a-f0-9-]+\.jpg$/);
});

test('getKraStoragePath routes KRA 4 panels to kra4 folder', () => {
  const path = getKraStoragePath('kra4_continuing_development', 'seminar_certificate.pdf', 'application/pdf');
  assert.match(path, /^kra4\/kra4_continuing_development\/[a-f0-9-]+\.pdf$/);
});

test('getKraStoragePath routes unknown or empty panelKey to general folder', () => {
  const path = getKraStoragePath(undefined, 'document.pdf', 'application/pdf');
  assert.match(path, /^general\/general\/[a-f0-9-]+\.pdf$/);
});

test('resolveStoredDocumentPath resolves R2 storage metadata', () => {
  const metadata = {
    storage: {
      provider: 'r2',
      bucket: 'faculty-documents',
      path: 'kra1/kra1_teaching_effectiveness/test-doc.pdf',
    },
  };
  const resolved = resolveStoredDocumentPath(metadata);
  assert.equal(resolved?.provider, 'r2');
  assert.equal(resolved?.bucket, 'faculty-documents');
  assert.equal(resolved?.path, 'kra1/kra1_teaching_effectiveness/test-doc.pdf');
});

test('resolveStoredDocumentPath resolves S3 storage metadata', () => {
  const metadata = {
    storage: {
      provider: 's3',
      bucket: 'my-s3-bucket',
      path: 'kra2/kra2_research_outputs/test-paper.pdf',
    },
  };
  const resolved = resolveStoredDocumentPath(metadata);
  assert.equal(resolved?.provider, 's3');
  assert.equal(resolved?.bucket, 'my-s3-bucket');
  assert.equal(resolved?.path, 'kra2/kra2_research_outputs/test-paper.pdf');
});

test('resolveStoredDocumentPath resolves Supabase storage metadata', () => {
  const metadata = {
    storage: {
      provider: 'supabase',
      bucket: 'documents',
      path: 'kra3/kra3_service_to_community/community.jpg',
    },
  };
  const resolved = resolveStoredDocumentPath(metadata);
  assert.equal(resolved?.provider, 'supabase');
  assert.equal(resolved?.bucket, 'documents');
  assert.equal(resolved?.path, 'kra3/kra3_service_to_community/community.jpg');
});

test('resolveStoredDocumentPath resolves local storage metadata', () => {
  const metadata = {
    storage: {
      provider: 'local',
      relativePath: 'uploads/documents/general/test.pdf',
    },
  };
  const resolved = resolveStoredDocumentPath(metadata);
  assert.equal(resolved?.provider, 'local');
  assert.equal(resolved?.relativePath, 'uploads/documents/general/test.pdf');
});
