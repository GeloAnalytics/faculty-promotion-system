import { apiFetch } from './api';

export type AppUserRole = 'ADMIN' | 'EMPLOYEE' | 'EVALUATOR';

export type SessionPayload = {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: AppUserRole;
  };
  token?: string;
  homePath: string;
};

let cachedSession: SessionPayload | null | undefined;

export async function fetchSession(force = false) {
  if (!force && cachedSession !== undefined) {
    return cachedSession;
  }

  try {
    const session = await apiFetch<SessionPayload>('/api/auth/me', { method: 'GET' });
    cachedSession = session;
    return session;
  } catch {
    cachedSession = null;
    return null;
  }
}

export function rememberSession(session: SessionPayload) {
  cachedSession = session;
}

export function clearSession() {
  cachedSession = null;
}

export function getHomePathForRole(role: AppUserRole) {
  return role === 'EVALUATOR' ? '/evaluator' : '/employee';
}
