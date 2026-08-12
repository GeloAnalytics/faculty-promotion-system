import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/config/db';
import { hashPassword, verifyPassword } from '../src/utils/crypto';

// Exercises the real Express app + real shared database end to end (this
// project has no separate test database - see project memory). Every
// account created here is disposable, uses a run-unique email so repeated
// runs never collide, and is deleted in the `after` hook below. Requires
// `--env-file=.env` (DATABASE_URL, AUTH_SECRET) to run - see package.json.
//
// Rate-limit budget: /register, /login, and /change-password all share one
// `authRateLimiter` (10 requests / 15 min / IP, see rateLimit.middleware.ts).
// Tests below deliberately reuse a single logged-in agent across steps
// instead of re-authenticating every time, to stay well under that cap -
// this file makes 9 such calls total. Node's test runner runs tests in a
// file sequentially by declaration order (not in parallel), so the shared
// `employeeAgent` below is safe to depend on across tests.

const runId = Date.now();
const employeeEmail = `qa-auth-test-emp-${runId}@example.com`;
const adminEmail = `qa-auth-test-admin-${runId}@example.com`;
const employeeInitialPassword = 'InitialPass123';
const employeeChangedPassword = 'ChangedPass456';
const adminPassword = 'AdminPass789012';

let adminUserId: string;
let employeeUserId: string;
const employeeAgent = request.agent(app);

test.before(async () => {
  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(adminPassword, passwordSalt);
  const admin = await prisma.user.create({
    data: {
      fullName: 'QA Auth Test Admin',
      email: adminEmail,
      passwordHash,
      passwordSalt,
      role: 'ADMIN',
    },
  });
  adminUserId = admin.id;
});

test.after(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [employeeEmail, adminEmail] } } });
  await prisma.$disconnect();
});

test('register creates an employee account with a working session', async () => {
  const response = await employeeAgent.post('/api/auth/register').send({
    fullName: 'QA Auth Test Employee',
    email: employeeEmail,
    password: employeeInitialPassword,
    role: 'EMPLOYEE',
    employeeId: '9990009991',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, employeeEmail);
  assert.equal(response.body.user.role, 'EMPLOYEE');
  assert.equal(response.body.user.mustChangePassword, false);
  assert.equal(response.body.homePath, '/employee');
  employeeUserId = response.body.user.id;

  const me = await employeeAgent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, employeeEmail);
});

test('register rejects a duplicate email', async () => {
  const response = await request(app).post('/api/auth/register').send({
    fullName: 'Someone Else',
    email: employeeEmail,
    password: 'AnotherPass123',
    role: 'EVALUATOR',
  });

  assert.equal(response.status, 409);
});

test('login rejects an incorrect password', async () => {
  const response = await request(app).post('/api/auth/login').send({
    email: employeeEmail,
    password: 'TotallyWrongPassword',
  });

  assert.equal(response.status, 401);
});

test('change-password rejects an incorrect current password (reuses the session from registration)', async () => {
  const response = await employeeAgent.post('/api/auth/change-password').send({
    currentPassword: 'NotTheRealPassword',
    newPassword: employeeChangedPassword,
  });

  assert.equal(response.status, 401);
});

test('change-password updates the password and clears mustChangePassword', async () => {
  const response = await employeeAgent.post('/api/auth/change-password').send({
    currentPassword: employeeInitialPassword,
    newPassword: employeeChangedPassword,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.mustChangePassword, false);

  const stored = await prisma.user.findUniqueOrThrow({ where: { id: employeeUserId } });
  assert.equal(stored.mustChangePassword, false);
  assert.equal(verifyPassword(employeeChangedPassword, stored.passwordSalt, stored.passwordHash), true);
  assert.equal(verifyPassword(employeeInitialPassword, stored.passwordSalt, stored.passwordHash), false);
});

test('a non-admin cannot access the accounts list (still using the same session)', async () => {
  const response = await employeeAgent.get('/api/accounts');
  assert.equal(response.status, 403);
});

test('logout clears the session', async () => {
  const loggedInMe = await employeeAgent.get('/api/auth/me');
  assert.equal(loggedInMe.status, 200);

  const logoutResponse = await employeeAgent.post('/api/auth/logout');
  assert.equal(logoutResponse.status, 204);

  const loggedOutMe = await employeeAgent.get('/api/auth/me');
  assert.equal(loggedOutMe.status, 401);
});

test("admin can reset another account's password, forcing a password change on next sign-in", async () => {
  const adminAgent = request.agent(app);
  const adminLogin = await adminAgent.post('/api/auth/login').send({ email: adminEmail, password: adminPassword });
  assert.equal(adminLogin.status, 200);
  assert.equal(adminLogin.body.user.role, 'ADMIN');

  const beforeReset = await prisma.user.findUniqueOrThrow({ where: { id: employeeUserId } });

  const resetResponse = await adminAgent.post(`/api/accounts/${employeeUserId}/reset-password`);
  assert.equal(resetResponse.status, 200);
  const temporaryPassword: string = resetResponse.body.temporaryPassword;
  assert.ok(temporaryPassword && temporaryPassword.length >= 8);

  // The previous password no longer verifies against the newly stored hash -
  // checked directly against the DB rather than spending another rate-limited
  // HTTP login call.
  const afterReset = await prisma.user.findUniqueOrThrow({ where: { id: employeeUserId } });
  assert.notEqual(afterReset.passwordHash, beforeReset.passwordHash);
  assert.equal(verifyPassword(employeeChangedPassword, afterReset.passwordSalt, afterReset.passwordHash), false);
  assert.equal(afterReset.mustChangePassword, true);

  const forcedAgent = request.agent(app);
  const tempLogin = await forcedAgent.post('/api/auth/login').send({
    email: employeeEmail,
    password: temporaryPassword,
  });
  assert.equal(tempLogin.status, 200);
  assert.equal(tempLogin.body.user.mustChangePassword, true);

  const forcedChange = await forcedAgent.post('/api/auth/change-password').send({
    currentPassword: temporaryPassword,
    newPassword: 'FinalPass000111',
  });
  assert.equal(forcedChange.status, 200);
  assert.equal(forcedChange.body.user.mustChangePassword, false);
});
