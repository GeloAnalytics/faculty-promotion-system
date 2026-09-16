import { Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { env, isProduction } from '../config/env';
import { registerSchema, loginSchema, changePasswordSchema } from '../validations/auth.validation';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { UserRole } from '@prisma/client';
import { SessionUser } from '../types';

function toSessionUser(user: {
  id: string;
  email: string;
  fullName: string;
  employeeId: string | null;
  role: UserRole;
  mustChangePassword: boolean;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    employeeId: user.employeeId,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

function getHomePathForRole(role: UserRole | SessionUser['role']) {
  if (role === UserRole.ADMIN) {
    return '/admin';
  }
  return role === UserRole.EVALUATOR ? '/evaluator' : '/employee';
}

function generateToken(user: SessionUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      employeeId: user.employeeId,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    env.AUTH_SECRET,
    { expiresIn: '7d' }
  );
}

function shouldUseSecureCookie(req: Request): boolean {
  if (!isProduction) {
    return false;
  }

  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  return req.secure || forwardedProto === 'https';
}

function setCookieFallback(req: Request, res: Response, token: string) {
  const parts = [
    `fps_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];

  if (shouldUseSecureCookie(req)) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearCookieFallback(req: Request, res: Response) {
  const parts = ['fps_session=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (shouldUseSecureCookie(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export const register = async (req: Request, res: Response) => {
  const payload = registerSchema.parse(req.body);
  const existingUser = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });

  if (existingUser) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  if (payload.employeeId) {
    const existingEmployeeId = await prisma.user.findUnique({ where: { employeeId: payload.employeeId } });
    if (existingEmployeeId) {
      return res.status(409).json({ error: 'An account with that Faculty ID already exists' });
    }
  }

  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(payload.password, passwordSalt);

  const user = await prisma.user.create({
    data: {
      fullName: payload.fullName,
      email: payload.email.toLowerCase(),
      employeeId: payload.employeeId ?? null,
      passwordHash,
      passwordSalt,
      role: payload.role,
    },
  });

  const sessionUser = toSessionUser(user);
  const token = generateToken(sessionUser);
  setCookieFallback(req, res, token); // Fallback for transition

  return res.status(201).json({ user: sessionUser, token, homePath: getHomePathForRole(sessionUser.role) });
};

export const login = async (req: Request, res: Response) => {
  const payload = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });

  if (!user || !user.accountActive || !verifyPassword(payload.password, user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const sessionUser = toSessionUser(user);
  const token = generateToken(sessionUser);
  setCookieFallback(req, res, token);

  return res.json({ user: sessionUser, token, homePath: getHomePathForRole(sessionUser.role) });
};

export const logout = async (req: Request, res: Response) => {
  clearCookieFallback(req, res);
  res.status(204).send();
};

export const me = async (req: Request, res: Response) => {
  // Sliding-window: re-issue token/cookie
  const token = generateToken(req.user!);
  setCookieFallback(req, res, token);

  res.json({
    user: req.user,
    token, // Send new token for frontend to update
    homePath: getHomePathForRole(req.user!.role),
  });
};

export const changePassword = async (req: Request, res: Response) => {
  const payload = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

  if (!user || !verifyPassword(payload.currentPassword, user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const passwordSalt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(payload.newPassword, passwordSalt);

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordSalt, mustChangePassword: false },
  });

  await prisma.auditLog.create({
    data: {
      action: 'PASSWORD_CHANGED',
      userId: user.id,
      targetId: user.id,
      details: { email: user.email },
    },
  });

  const sessionUser = toSessionUser(updatedUser);
  const token = generateToken(sessionUser);
  setCookieFallback(req, res, token);

  return res.json({ user: sessionUser, token, homePath: getHomePathForRole(sessionUser.role) });
};
