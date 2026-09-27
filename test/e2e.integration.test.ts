import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/db';
import { hashPassword } from '../src/utils/crypto';

// ---------------------------------------------------------------------------
// E2E INTEGRATION TEST — ALL THREE TIERS
// ---------------------------------------------------------------------------
// Covers the entire API surface end-to-end using the real Express app and the
// shared Supabase/Postgres database.  Every object created is disposable and
// cleaned up in the `after` hook so repeated runs never collide.
//
// TIER COVERAGE
//   EMPLOYEE  - register -> dashboard -> ingest faculty profile -> signed-upload
//               URL -> document view/delete
//   EVALUATOR - login -> review queue -> criterion review -> review status ->
//               training example create/label/approve
//   ADMIN     - login -> accounts list -> deactivate/reactivate/reset-password
//               -> database overview -> delete test accounts
//
// RUN:  node --env-file=.env node_modules/tsx/dist/cli.mjs --test test/e2e.integration.test.ts
// ---------------------------------------------------------------------------

const runId = Date.now();

const EMPLOYEE_EMAIL = `qa-e2e-emp-${runId}@example.com`;
const EVALUATOR_EMAIL = `qa-e2e-eval-${runId}@example.com`;
const ADMIN_EMAIL = `qa-e2e-admin-${runId}@example.com`;
// A separate unique email used only for the duplicate-email rejection test.
const DUPLICATE_EMAIL = `qa-e2e-dup-${runId}@example.com`;

const EMPLOYEE_PASS = 'EmployeePass123!';
const EVALUATOR_PASS = 'EvaluatorPass456!';
const ADMIN_PASS = 'AdminPass789012!';

let employeeUserId: string;
let evaluatorUserId: string;
let adminUserId: string;
let profileId: string;
let trainingExampleId: string;

const employeeAgent = request.agent(app);
const evaluatorAgent = request.agent(app);
const adminAgent = request.agent(app);

// EmployeeId must be exactly 10 digits (unique per run)
const EMPLOYEE_ID = String(runId).slice(-10).padStart(10, '0');

// Valid faculty payload — values must match the normalised constant lists in
// src/constants/faculty.ts:
//   academicRank:                 must be one of academicRankOptions
//   highestEducationalAttainment: 'Doctorate Graduate' | "Master's" (or accepted aliases)
const FACULTY_PAYLOAD = {
  personalData: {
    employeeId: EMPLOYEE_ID,
    fullName: `QA E2E Faculty ${runId}`,
    academicRank: 'Instructor I',
    highestEducationalAttainment: "Master's",
  },
  promotionHistory: [],
};

test.before(async () => {
  const evalSalt = crypto.randomBytes(16).toString('hex');
  const evalHash = hashPassword(EVALUATOR_PASS, evalSalt);
  const evaluator = await prisma.user.create({
    data: {
      fullName: 'QA E2E Evaluator',
      email: EVALUATOR_EMAIL,
      passwordHash: evalHash,
      passwordSalt: evalSalt,
      role: 'EVALUATOR',
    },
  });
  evaluatorUserId = evaluator.id;

  const adminSalt = crypto.randomBytes(16).toString('hex');
  const adminHash = hashPassword(ADMIN_PASS, adminSalt);
  const admin = await prisma.user.create({
    data: {
      fullName: 'QA E2E Admin',
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      passwordSalt: adminSalt,
      role: 'ADMIN',
    },
  });
  adminUserId = admin.id;

  // Also create the DUPLICATE_EMAIL account so we can test that re-registering
  // the same email is rejected.  Created directly in the DB to avoid consuming
  // a rate-limit slot for /register.
  const dupSalt = crypto.randomBytes(16).toString('hex');
  const dupHash = hashPassword('DupPass12345', dupSalt);
  await prisma.user.create({
    data: {
      fullName: 'QA E2E Duplicate',
      email: DUPLICATE_EMAIL,
      passwordHash: dupHash,
      passwordSalt: dupSalt,
      role: 'EVALUATOR',
    },
  });
});
test.after(async () => {
  if (trainingExampleId) {
    await prisma.trainingExample.deleteMany({ where: { id: trainingExampleId } }).catch(() => null);
  }
  if (profileId) {
    await prisma.facultyProfile.deleteMany({ where: { id: profileId } }).catch(() => null);
  }
  if (employeeUserId) {
    await prisma.user.deleteMany({ where: { id: employeeUserId } }).catch(() => null);
  }
  await prisma.user
    .deleteMany({
      where: {
        email: { in: [EMPLOYEE_EMAIL, EVALUATOR_EMAIL, ADMIN_EMAIL, DUPLICATE_EMAIL] },
      },
    })
    .catch(() => null);
  await prisma.$disconnect();
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

test('GET /api/health returns ok with referenceData fields', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.ok('referenceData' in res.body, 'health response should have referenceData');
  assert.ok('tqeCsvLoaded' in res.body.referenceData);
  assert.ok('guidelinePdfLoaded' in res.body.referenceData);
  assert.ok('imageOcrReady' in res.body.referenceData);
});

// ============================================================================
// TIER 1: EMPLOYEE
// ============================================================================

test('EMPLOYEE: register creates account and returns homePath + JWT token', async () => {
  const res = await employeeAgent.post('/api/auth/register').send({
    fullName: `QA E2E Employee ${runId}`,
    email: EMPLOYEE_EMAIL,
    password: EMPLOYEE_PASS,
    role: 'EMPLOYEE',
    employeeId: EMPLOYEE_ID,
  });
  assert.equal(res.status, 201, `register failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.user.role, 'EMPLOYEE');
  assert.equal(res.body.homePath, '/employee');
  assert.ok(res.body.token, 'response must include a JWT token for stateless auth');
  employeeUserId = res.body.user.id;
});

test('EMPLOYEE: GET /api/auth/me succeeds with cookie session', async () => {
  const res = await employeeAgent.get('/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, EMPLOYEE_EMAIL);
  assert.ok(res.body.token, '/me must return a refreshed sliding-window token');
});

test('EMPLOYEE: GET /api/auth/me succeeds with Bearer token (Vercel stateless auth)', async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASS });
  assert.equal(loginRes.status, 200, `login for Bearer test failed: ${JSON.stringify(loginRes.body)}`);
  const token: string = loginRes.body.token;
  assert.ok(token, 'login must return a JWT token');

  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(meRes.status, 200, `Bearer token auth failed: ${JSON.stringify(meRes.body)}`);
  assert.equal(meRes.body.user.email, EMPLOYEE_EMAIL);
});

test('EMPLOYEE: register rejects duplicate email (409)', async () => {
  // Uses DUPLICATE_EMAIL which was pre-created in the DB (no rate-limit slot consumed).
  const res = await request(app).post('/api/auth/register').send({
    fullName: 'Duplicate Attempt',
    email: DUPLICATE_EMAIL,
    password: 'AnotherPass123!',
    role: 'EVALUATOR',
  });
  assert.equal(res.status, 409, `expected 409 but got ${res.status}: ${JSON.stringify(res.body)}`);
});

test('EMPLOYEE: login with wrong password returns 401', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: EMPLOYEE_EMAIL, password: 'WrongPassword!' });
  assert.equal(res.status, 401);
});

test('EMPLOYEE: GET /api/employee/dashboard returns summary', async () => {
  const res = await employeeAgent.get('/api/employee/dashboard');
  assert.equal(res.status, 200, `employee dashboard failed: ${JSON.stringify(res.body)}`);
  assert.ok('summary' in res.body);
  assert.ok(typeof res.body.summary.profileCount === 'number');
  assert.ok(Array.isArray(res.body.profiles));
  assert.ok(Array.isArray(res.body.uploads));
});

test('EMPLOYEE: cannot access evaluator review-queue (403)', async () => {
  const res = await employeeAgent.get('/api/evaluator/review-queue');
  assert.equal(res.status, 403);
});

test('EMPLOYEE: cannot access admin accounts list (403)', async () => {
  const res = await employeeAgent.get('/api/accounts');
  assert.equal(res.status, 403);
});

test('EMPLOYEE: POST /api/faculty/ingest creates a faculty profile (201)', async () => {
  const res = await employeeAgent.post('/api/faculty/ingest').send(FACULTY_PAYLOAD);
  assert.equal(res.status, 201, `faculty ingest failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.profileId, 'profileId must be returned');
  profileId = res.body.profileId;
});

test('EMPLOYEE: POST /api/faculty/ingest is idempotent (upsert returns 200)', async () => {
  const res = await employeeAgent.post('/api/faculty/ingest').send({
    ...FACULTY_PAYLOAD,
    personalData: { ...FACULTY_PAYLOAD.personalData, fullName: `QA E2E Faculty Updated ${runId}` },
  });
  assert.equal(res.status, 200, `faculty upsert failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.profileId, profileId);
});

test('EMPLOYEE: PATCH /api/faculty/:profileId updates own profile (200)', async () => {
  const res = await employeeAgent.patch(`/api/faculty/${profileId}`).send(FACULTY_PAYLOAD);
  assert.equal(res.status, 200, `faculty update failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.updated, true);
});

test('EMPLOYEE: POST /api/documents/signed-upload-url returns a Supabase signed URL', async () => {
  const res = await employeeAgent.post('/api/documents/signed-upload-url').send({
    fileName: `qa-test-${runId}.pdf`,
    mimeType: 'application/pdf',
    panelKey: 'kra1_teaching_effectiveness',
  });
  assert.equal(res.status, 200, `signed-upload-url failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.signedUrl, 'signedUrl must be returned');
  assert.ok(res.body.storagePath, 'storagePath must be returned');
  assert.ok(res.body.signedUrl.startsWith('https://'), 'signedUrl must be an https URL');
});

test('EMPLOYEE: POST /api/documents/signed-upload-url without fileName returns 400', async () => {
  const res = await employeeAgent.post('/api/documents/signed-upload-url').send({
    mimeType: 'application/pdf',
  });
  assert.equal(res.status, 400);
});

test('EMPLOYEE: GET /api/documents/:id/view returns 404 for unknown document', async () => {
  const res = await employeeAgent.get('/api/documents/nonexistent-doc-id/view');
  assert.equal(res.status, 404);
});

test('EMPLOYEE: change-password with wrong current password returns 401', async () => {
  const res = await employeeAgent.post('/api/auth/change-password').send({
    currentPassword: 'WrongPassword!',
    newPassword: 'NewPass999123!',
  });
  assert.equal(res.status, 401);
});

test('EMPLOYEE: POST /api/auth/logout returns 204 and clears session', async () => {
  const beforeLogout = await employeeAgent.get('/api/auth/me');
  assert.equal(beforeLogout.status, 200);

  const logoutRes = await employeeAgent.post('/api/auth/logout');
  assert.equal(logoutRes.status, 204);

  const afterLogout = await employeeAgent.get('/api/auth/me');
  assert.equal(afterLogout.status, 401);
});

test('EMPLOYEE: can re-login after logout', async () => {
  const res = await employeeAgent
    .post('/api/auth/login')
    .send({ email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASS });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'EMPLOYEE');
});

// ============================================================================
// TIER 2: EVALUATOR
// ============================================================================

test('EVALUATOR: login succeeds and returns evaluator homePath', async () => {
  const res = await evaluatorAgent
    .post('/api/auth/login')
    .send({ email: EVALUATOR_EMAIL, password: EVALUATOR_PASS });
  assert.equal(res.status, 200, `evaluator login failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.user.role, 'EVALUATOR');
  assert.equal(res.body.homePath, '/evaluator');
  assert.ok(res.body.token);
});

test('EVALUATOR: GET /api/evaluator/review-queue returns items array', async () => {
  const res = await evaluatorAgent.get('/api/evaluator/review-queue');
  assert.equal(res.status, 200, `review queue failed: ${JSON.stringify(res.body)}`);
  assert.ok(Array.isArray(res.body.items));
});

test('EVALUATOR: GET /api/employee/dashboard is forbidden (403)', async () => {
  const res = await evaluatorAgent.get('/api/employee/dashboard');
  assert.equal(res.status, 403);
});

test('EVALUATOR: GET /api/dashboard/:profileId returns profile detail', async () => {
  assert.ok(profileId, 'profileId must be set by employee ingest test');
  const res = await evaluatorAgent.get(`/api/dashboard/${profileId}`);
  assert.equal(res.status, 200, `dashboard profile failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.id, profileId);
});

test('EVALUATOR: GET /api/dashboard/nonexistent-profile-id returns 404', async () => {
  const res = await evaluatorAgent.get('/api/dashboard/nonexistent-profile-id');
  assert.equal(res.status, 404);
});

test('EVALUATOR: GET /api/review/:profileId/criteria returns items array', async () => {
  assert.ok(profileId, 'profileId must be set');
  const res = await evaluatorAgent.get(`/api/review/${profileId}/criteria`);
  assert.equal(res.status, 200, `get criteria failed: ${JSON.stringify(res.body)}`);
  assert.ok(Array.isArray(res.body.items));
});

test('EVALUATOR: PATCH /api/review/:profileId/criteria/:panelKey approves a criterion', async () => {
  assert.ok(profileId, 'profileId must be set');
  const res = await evaluatorAgent
    .patch(`/api/review/${profileId}/criteria/kra1_teaching_effectiveness`)
    .send({ decision: 'APPROVED', notes: 'E2E test approval' });
  assert.equal(res.status, 200, `set criterion failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.review.decision, 'APPROVED');
  assert.equal(res.body.review.panelKey, 'kra1_teaching_effectiveness');
});

test('EVALUATOR: PATCH criterion with invalid decision returns 400', async () => {
  assert.ok(profileId, 'profileId must be set');
  const res = await evaluatorAgent
    .patch(`/api/review/${profileId}/criteria/kra1_teaching_effectiveness`)
    .send({ decision: 'MAYBE' });
  assert.equal(res.status, 400);
});

test('EVALUATOR: PATCH criterion with unknown panelKey returns 400', async () => {
  assert.ok(profileId, 'profileId must be set');
  const res = await evaluatorAgent
    .patch(`/api/review/${profileId}/criteria/totally_fake_panel`)
    .send({ decision: 'APPROVED' });
  assert.equal(res.status, 400);
});

test('EVALUATOR: PATCH /api/review/:profileId/status updates to IN_REVIEW', async () => {
  assert.ok(profileId, 'profileId must be set');
  const res = await evaluatorAgent
    .patch(`/api/review/${profileId}/status`)
    .send({ status: 'IN_REVIEW' });
  assert.equal(res.status, 200, `update review status failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.success, true);
});

test('EVALUATOR: PATCH review status with invalid value returns 400', async () => {
  assert.ok(profileId, 'profileId must be set');
  const res = await evaluatorAgent
    .patch(`/api/review/${profileId}/status`)
    .send({ status: 'INVALID_STATUS' });
  assert.equal(res.status, 400);
});

test('EVALUATOR: GET /api/training/examples returns a list', async () => {
  const res = await evaluatorAgent.get('/api/training/examples');
  assert.equal(res.status, 200, `get training examples failed: ${JSON.stringify(res.body)}`);
  assert.ok(Array.isArray(res.body.items));
});

test('EVALUATOR: POST /api/training/examples creates a training example', async () => {
  assert.ok(profileId, 'profileId must be set');
  // rawInput must conform to facultyIngestionSchema (same shape as faculty ingest payload)
  const res = await evaluatorAgent.post('/api/training/examples').send({
    profileId,
    rawInput: FACULTY_PAYLOAD,
    featureSnapshot: { kra1: 0.8 },
    labelPromoted: true,
    labelSource: 'evaluator',
    datasetSplit: 'train',
  });
  assert.equal(res.status, 201, `create training example failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.id);
  trainingExampleId = res.body.id;
});

test('EVALUATOR: PATCH /api/training/examples/:id/label updates the training example', async () => {
  assert.ok(trainingExampleId, 'trainingExampleId must be set');
  const res = await evaluatorAgent
    .patch(`/api/training/examples/${trainingExampleId}/label`)
    .send({
      labelPromoted: false,
      labelSource: 'evaluator',
      datasetSplit: 'test',
      validated: false,
      notes: 'E2E label test',
      criterionScores: {},
    });
  assert.equal(res.status, 200, `label training example failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.id, trainingExampleId);
});

test('EVALUATOR: POST /api/training/profiles/:profileId/approve approves draft score', async () => {
  assert.ok(profileId, 'profileId must be set');
  const res = await evaluatorAgent.post(`/api/training/profiles/${profileId}/approve`);
  assert.equal(res.status, 200, `approve draft score failed: ${JSON.stringify(res.body)}`);
  assert.ok('trainingExample' in res.body, 'trainingExample must be in response');
});

test('EVALUATOR: GET /api/accounts is forbidden (403)', async () => {
  const res = await evaluatorAgent.get('/api/accounts');
  assert.equal(res.status, 403);
});

test('EVALUATOR: GET /api/admin/database-overview is forbidden (403)', async () => {
  const res = await evaluatorAgent.get('/api/admin/database-overview');
  assert.equal(res.status, 403);
});

// ============================================================================
// TIER 3: ADMIN
// ============================================================================

test('ADMIN: login succeeds and returns admin homePath', async () => {
  const res = await adminAgent
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
  assert.equal(res.status, 200, `admin login failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.user.role, 'ADMIN');
  assert.equal(res.body.homePath, '/admin');
  assert.ok(res.body.token);
});

test('ADMIN: GET /api/accounts lists all accounts', async () => {
  const res = await adminAgent.get('/api/accounts');
  assert.equal(res.status, 200, `list accounts failed: ${JSON.stringify(res.body)}`);
  assert.ok(Array.isArray(res.body.accounts));
  assert.ok(res.body.accounts.length > 0, 'should have at least the test accounts');
  const adminAccount = res.body.accounts.find((a: { id: string }) => a.id === adminUserId);
  assert.ok(adminAccount, 'admin account should be in the list');
});

test('ADMIN: GET /api/admin/database-overview returns overview data', async () => {
  const res = await adminAgent.get('/api/admin/database-overview');
  assert.equal(res.status, 200, `database overview failed: ${JSON.stringify(res.body)}`);
  assert.ok(typeof res.body === 'object' && res.body !== null);
});

test('ADMIN: GET /api/evaluator/review-queue accessible to admin', async () => {
  const res = await adminAgent.get('/api/evaluator/review-queue');
  assert.equal(res.status, 200, `admin review-queue failed: ${JSON.stringify(res.body)}`);
  assert.ok(Array.isArray(res.body.items));
});

test('ADMIN: GET /api/employee/dashboard accessible to admin', async () => {
  const res = await adminAgent.get('/api/employee/dashboard');
  assert.equal(res.status, 200, `admin employee dashboard failed: ${JSON.stringify(res.body)}`);
  assert.ok('summary' in res.body);
});

test('ADMIN: POST /api/accounts/:userId/reset-password returns a temporary password', async () => {
  assert.ok(employeeUserId, 'employeeUserId must be set');
  const res = await adminAgent.post(`/api/accounts/${employeeUserId}/reset-password`);
  assert.equal(res.status, 200, `reset password failed: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.temporaryPassword, 'temporaryPassword must be returned');
  assert.ok(res.body.temporaryPassword.length >= 8);
});

test('ADMIN: PATCH /api/accounts/:userId/deactivate deactivates employee account', async () => {
  assert.ok(employeeUserId, 'employeeUserId must be set');
  const res = await adminAgent.patch(`/api/accounts/${employeeUserId}/deactivate`);
  assert.equal(res.status, 200, `deactivate failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.deactivated, true);
});

test('ADMIN: login rejected for deactivated account (401)', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASS });
  assert.equal(res.status, 401, 'deactivated account login must be rejected');
});

test('ADMIN: deactivating an already-deactivated account returns 409', async () => {
  assert.ok(employeeUserId, 'employeeUserId must be set');
  const res = await adminAgent.patch(`/api/accounts/${employeeUserId}/deactivate`);
  assert.equal(res.status, 409);
});

test('ADMIN: PATCH /api/accounts/:userId/reactivate reactivates account', async () => {
  assert.ok(employeeUserId, 'employeeUserId must be set');
  const res = await adminAgent.patch(`/api/accounts/${employeeUserId}/reactivate`);
  assert.equal(res.status, 200, `reactivate failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.reactivated, true);
});

test('ADMIN: reactivating an already-active account returns 409', async () => {
  assert.ok(employeeUserId, 'employeeUserId must be set');
  const res = await adminAgent.patch(`/api/accounts/${employeeUserId}/reactivate`);
  assert.equal(res.status, 409);
});

test('ADMIN: cannot deactivate own account (400)', async () => {
  assert.ok(adminUserId, 'adminUserId must be set');
  const res = await adminAgent.patch(`/api/accounts/${adminUserId}/deactivate`);
  assert.equal(res.status, 400);
});

test('ADMIN: cannot delete own account (400)', async () => {
  assert.ok(adminUserId, 'adminUserId must be set');
  const res = await adminAgent.delete(`/api/accounts/${adminUserId}`);
  assert.equal(res.status, 400);
});

test('ADMIN: DELETE /api/accounts/:userId deletes the employee account', async () => {
  assert.ok(employeeUserId, 'employeeUserId must be set');
  const res = await adminAgent.delete(`/api/accounts/${employeeUserId}`);
  assert.equal(res.status, 200, `delete account failed: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.deleted, true);
  employeeUserId = ''; // mark as cleaned up for after() hook
});

// ============================================================================
// UNAUTHENTICATED / GLOBAL EDGE CASES
// ============================================================================

test('Unauthenticated GET /api/auth/me returns 401', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('Unauthenticated POST /api/faculty/ingest returns 401', async () => {
  const res = await request(app).post('/api/faculty/ingest').send(FACULTY_PAYLOAD);
  assert.equal(res.status, 401);
});

test('Unauthenticated POST /api/documents/signed-upload-url returns 401', async () => {
  const res = await request(app)
    .post('/api/documents/signed-upload-url')
    .send({ fileName: 'test.pdf', mimeType: 'application/pdf' });
  assert.equal(res.status, 401);
});

test('Invalid Bearer token returns 401', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer totally.invalid.token');
  assert.equal(res.status, 401);
});

test('Faculty analysis endpoints return 503 (inactive ML stubs)', async () => {
  // Use evaluator agent (still logged in from earlier tests)
  const featureRes = await evaluatorAgent.post('/api/faculty/analysis/feature-selection').send({});
  assert.equal(featureRes.status, 503);

  const compareRes = await evaluatorAgent.post('/api/faculty/models/compare').send({});
  assert.equal(compareRes.status, 503);

  const predictRes = await evaluatorAgent.post('/api/faculty/predictions/generate').send({});
  assert.equal(predictRes.status, 503);
});
