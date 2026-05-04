import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { SessionUser } from '../types';
import { UserRole } from '@prisma/client';

export const attachSessionUser = (req: Request, res: Response, next: NextFunction) => {
  let token = req.headers.authorization?.split(' ')[1];

  if (!token && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['fps_session'];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, env.AUTH_SECRET) as SessionUser;
    req.user = decoded;
  } catch (error) {
    // Ignore invalid token, user remains unauthenticated
  }
  return next();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return next();
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return res.status(403).json({ error: 'You do not have access to this workspace' });
    }

    return next();
  };
};

function parseCookies(header: string): Record<string, string> {
  return header.split(';').reduce<Record<string, string>>((cookies, entry) => {
    const [rawKey, ...rawValue] = entry.trim().split('=');
    if (!rawKey) return cookies;
    cookies[rawKey] = rawValue.join('=');
    return cookies;
  }, {});
}
