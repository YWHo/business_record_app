import {
  expiredSessionCookie,
  hashToken,
  requireUser,
  sessionCookie,
  sessionToken,
} from '../auth/authorization';
import { requireLocalAuth } from '../auth/localOnly';
import {
  getRequiredString,
  HttpError,
  json,
  readJsonObject,
} from '../lib/http';
import { normalizeEmail } from '../services/invitationService';
import type { Env } from '../types';

export async function loginLocally(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const body = await readJsonObject(request);
  const email = normalizeEmail(getRequiredString(body, 'email'));

  const user = await env.DB.prepare(
    'SELECT id, email, role, status FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ id: string; email: string; role: string; status: string }>();

  if (!user || user.status !== 'ACTIVE') {
    throw new HttpError(401, 'Unable to sign in with those details.');
  }

  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(await hashToken(token), user.id, expiresAt, now.toISOString())
    .run();

  return json(
    { user: { id: user.id, email: user.email, role: user.role } },
    { headers: { 'set-cookie': sessionCookie(token, request) } },
  );
}

export async function currentUser(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await requireUser(request, env);
  return json({ user });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = sessionToken(request);

  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await hashToken(token))
      .run();
  }

  return json(
    { success: true },
    { headers: { 'set-cookie': expiredSessionCookie(request) } },
  );
}
