import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRole } from '@prisma/client';
import { canViewUploadedDocument } from '../src/utils/document.utils';

test('employees can view documents they uploaded', () => {
  assert.equal(
    canViewUploadedDocument({
      requesterRole: UserRole.EMPLOYEE,
      requesterUserId: 'user-1',
      ownerUserId: 'user-1',
      profileCreatedByUserId: null,
    }),
    true,
  );
});

test('employees can view documents linked to their profile even if ownership metadata is missing', () => {
  assert.equal(
    canViewUploadedDocument({
      requesterRole: UserRole.EMPLOYEE,
      requesterUserId: 'user-1',
      ownerUserId: null,
      profileCreatedByUserId: 'user-1',
    }),
    true,
  );
});

test('employees cannot view documents from another account', () => {
  assert.equal(
    canViewUploadedDocument({
      requesterRole: UserRole.EMPLOYEE,
      requesterUserId: 'user-1',
      ownerUserId: 'user-2',
      profileCreatedByUserId: 'user-2',
    }),
    false,
  );
});

test('evaluators can view any uploaded document', () => {
  assert.equal(
    canViewUploadedDocument({
      requesterRole: UserRole.EVALUATOR,
      requesterUserId: 'evaluator-1',
      ownerUserId: 'user-2',
      profileCreatedByUserId: 'user-2',
    }),
    true,
  );
});
