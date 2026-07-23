import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPromotionWindow, extractCandidateDates } from '../src/utils/promotionWindow';

test('checkPromotionWindow accepts a document dated inside the promotion window', () => {
  const result = checkPromotionWindow('Certificate of Training issued on August 15, 2024 to the awardee.');
  assert.equal(result.status, 'in_range');
  assert.equal(result.matchedDate, '2024-08-15');
});

test('checkPromotionWindow accepts a numeric date inside the promotion window', () => {
  const result = checkPromotionWindow('Date Issued: 03/10/2025');
  assert.equal(result.status, 'in_range');
});

test('checkPromotionWindow accepts an ISO date inside the promotion window', () => {
  const result = checkPromotionWindow('Effectivity Date: 2025-12-01');
  assert.equal(result.status, 'in_range');
});

test('checkPromotionWindow rejects a document only dated before the promotion window', () => {
  const result = checkPromotionWindow('This certificate was awarded on March 3, 2019.');
  assert.equal(result.status, 'out_of_range');
  assert.equal(result.matchedDate, '2019-03-03');
});

test('checkPromotionWindow rejects a document only dated after the promotion window', () => {
  const result = checkPromotionWindow('Issued: December 1, 2027');
  assert.equal(result.status, 'out_of_range');
});

test('checkPromotionWindow treats a document with mixed dates as in range when any date falls inside the window', () => {
  const result = checkPromotionWindow(
    'Pursuant to CSC Memorandum dated 2015-01-01, this certificate is issued on September 5, 2024.',
  );
  assert.equal(result.status, 'in_range');
});

test('checkPromotionWindow returns undetected when no date is found, rather than blocking', () => {
  const result = checkPromotionWindow('Certificate of Appreciation awarded to Juan Dela Cruz for outstanding service.');
  assert.equal(result.status, 'undetected');
  assert.equal(result.matchedDate, null);
});

test('checkPromotionWindow recognizes an academic-year mention that starts inside the window', () => {
  const result = checkPromotionWindow('Conducted during A.Y. 2024-2025 as part of the extension program.');
  assert.equal(result.status, 'in_range');
});

test('extractCandidateDates parses day-month-year format', () => {
  const dates = extractCandidateDates('Given this 15th day of August 2024 at Laguna.');
  assert.equal(dates.length, 1);
  assert.equal(dates[0].toISOString().slice(0, 10), '2024-08-15');
});

test('extractCandidateDates ignores an impossible calendar date', () => {
  const dates = extractCandidateDates('Reference code 02/30/2024 was voided.');
  assert.equal(dates.length, 0);
});
