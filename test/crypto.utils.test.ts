import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword, generateTemporaryPassword } from '../src/utils/crypto';

test('hashPassword is deterministic for the same password and salt', () => {
  const salt = crypto.randomBytes(16).toString('hex');
  assert.equal(hashPassword('correct horse battery staple', salt), hashPassword('correct horse battery staple', salt));
});

test('hashPassword produces a different hash for a different salt', () => {
  const saltA = crypto.randomBytes(16).toString('hex');
  const saltB = crypto.randomBytes(16).toString('hex');
  assert.notEqual(hashPassword('correct horse battery staple', saltA), hashPassword('correct horse battery staple', saltB));
});

test('verifyPassword accepts the correct password', () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword('correct horse battery staple', salt);
  assert.equal(verifyPassword('correct horse battery staple', salt, hash), true);
});

test('verifyPassword rejects an incorrect password', () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword('correct horse battery staple', salt);
  assert.equal(verifyPassword('wrong password', salt, hash), false);
});

test('verifyPassword rejects a hash of different length without throwing', () => {
  const salt = crypto.randomBytes(16).toString('hex');
  assert.equal(verifyPassword('anything', salt, 'not-a-real-hash'), false);
});

test('generateTemporaryPassword returns a sufficiently long, URL-safe value', () => {
  const password = generateTemporaryPassword();
  assert.ok(password.length >= 8, `expected length >= 8, got ${password.length}`);
  assert.match(password, /^[A-Za-z0-9_-]+$/);
});

test('generateTemporaryPassword does not repeat itself', () => {
  const passwords = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
  assert.equal(passwords.size, 50);
});
