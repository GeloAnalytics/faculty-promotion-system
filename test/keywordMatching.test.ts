import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDocumentContent, normalizeForKeywordMatching } from '../src/utils';

test('normalizeForKeywordMatching lower-cases and flattens underscores and whitespace', () => {
  assert.equal(normalizeForKeywordMatching('Form_IM\n  Contribution'), 'form im contribution');
});

test('an evidence keyword written with an underscore matches OCR text that dropped it', () => {
  const analysis = analyzeDocumentContent(
    'Certificate of Contribution Form Translated Research on file.',
    'kra2_research_outputs',
    'pdf',
  );
  assert.ok(analysis.keywordHits.includes('certificate of contribution form_translated research'));
});

test('a multi-word keyword split across a wrapped line is still found', () => {
  const analysis = analyzeDocumentContent(
    'Journal\narticle published in a journal indexed in\nScopus.',
    'kra2_research_outputs',
    'pdf',
  );
  assert.ok(analysis.keywordHits.includes('journal article'));
  assert.ok(analysis.keywordHits.includes('scopus'));
});

test('text that does not contain the phrase still earns no hit', () => {
  const analysis = analyzeDocumentContent('A journal of articles about nothing relevant.', 'kra2_research_outputs', 'pdf');
  assert.ok(!analysis.keywordHits.includes('journal article'));
});
