import { HttpError } from '../lib/http';
import type { AuthenticatedUser, Env, UserRole } from '../types';

const sessionCookieName = 'br_session';

function getCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];

  for (const cookie of cookies) {
    const [cookieName, ...valueParts] = cookie.trim().split('=');

    if (cookieName === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function requireUser(
  request: Request,
  env: Env,
): Promise<AuthenticatedUser> {
  const token = getCookie(request, sessionCookieName);

  if (!token) {
    throw new HttpError(401, 'Authentication required.');
  }

  const tokenHash = await hashToken(token);
  const user = await env.DB.prepare(
    `SELECT users.id, users.email, users.role, users.status
       FROM sessions
       JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ?
        AND sessions.expires_at > ?`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<AuthenticatedUser>();

  if (!user || user.status !== 'ACTIVE') {
    throw new HttpError(401, 'Authentication required.');
  }

  return user;
}

export function requireRole(
  user: AuthenticatedUser,
  allowedRoles: UserRole[],
): void {
  if (!allowedRoles.includes(user.role)) {
    throw new HttpError(
      403,
      'You do not have permission to perform this action.',
    );
  }
}

export function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`;
}

export function expiredSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}

export function sessionToken(request: Request): string | null {
  return getCookie(request, sessionCookieName);
}
