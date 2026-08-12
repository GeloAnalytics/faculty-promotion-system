import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, loginSchema, changePasswordSchema } from '../src/validations/auth.validation';

test('registerSchema accepts a valid employee registration with employeeId', () => {
  const result = registerSchema.safeParse({
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'password123',
    role: 'EMPLOYEE',
    employeeId: '1234567890',
  });
  assert.equal(result.success, true);
});

test('registerSchema rejects an employee registration missing employeeId', () => {
  const result = registerSchema.safeParse({
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'password123',
    role: 'EMPLOYEE',
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path.includes('employeeId')));
  }
});

test('registerSchema accepts an evaluator registration without employeeId', () => {
  const result = registerSchema.safeParse({
    fullName: 'Grace Hopper',
    email: 'grace@example.com',
    password: 'password123',
    role: 'EVALUATOR',
  });
  assert.equal(result.success, true);
});

test('registerSchema rejects a role of ADMIN (no self-registration path)', () => {
  const result = registerSchema.safeParse({
    fullName: 'Someone',
    email: 'someone@example.com',
    password: 'password123',
    role: 'ADMIN',
  });
  assert.equal(result.success, false);
});

test('registerSchema rejects an employeeId that is not exactly 10 digits', () => {
  const result = registerSchema.safeParse({
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'password123',
    role: 'EMPLOYEE',
    employeeId: '12345',
  });
  assert.equal(result.success, false);
});

test('registerSchema rejects a password shorter than 8 characters', () => {
  const result = registerSchema.safeParse({
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'short',
    role: 'EVALUATOR',
  });
  assert.equal(result.success, false);
});

test('loginSchema accepts a valid email and password', () => {
  const result = loginSchema.safeParse({ email: 'ada@example.com', password: 'password123' });
  assert.equal(result.success, true);
});

test('loginSchema rejects a malformed email', () => {
  const result = loginSchema.safeParse({ email: 'not-an-email', password: 'password123' });
  assert.equal(result.success, false);
});

test('changePasswordSchema accepts a new password different from the current one', () => {
  const result = changePasswordSchema.safeParse({ currentPassword: 'oldpassword', newPassword: 'newpassword' });
  assert.equal(result.success, true);
});

test('changePasswordSchema rejects a new password identical to the current one', () => {
  const result = changePasswordSchema.safeParse({ currentPassword: 'samepassword', newPassword: 'samepassword' });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path.includes('newPassword')));
  }
});

test('changePasswordSchema rejects a current or new password shorter than 8 characters', () => {
  const result = changePasswordSchema.safeParse({ currentPassword: 'short', newPassword: 'alsolongenough' });
  assert.equal(result.success, false);
});
