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
import {
  consumeLoginLink,
  createSession,
  requestLoginLink,
} from '../services/authService';
import { enforceRateLimit, verifyTurnstile } from '../services/securityService';
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

  const token = await createSession(env, user.id);

  return json(
    { user: { id: user.id, email: user.email, role: user.role } },
    { headers: { 'set-cookie': sessionCookie(token, request) } },
  );
}

export function authConfiguration(request: Request, env: Env): Response {
  const localHelper =
    env.APP_ENV === 'local' &&
    env.LOCAL_AUTH_ENABLED === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);

  return json({
    environment: env.APP_ENV,
    localHelper,
    turnstileRequired: env.TURNSTILE_REQUIRED === 'true',
    turnstileSiteKey:
      env.TURNSTILE_REQUIRED === 'true' ? env.TURNSTILE_SITE_KEY : null,
  });
}

export async function requestLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJsonObject(request);
  const email = normalizeEmail(getRequiredString(body, 'email'));
  await enforceRateLimit(request, env.AUTH_RATE_LIMITER, 'login', email);
  await verifyTurnstile(
    request,
    env,
    typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined,
  );
  await requestLoginLink(env, email);

  return json({
    message: 'If the account is active, a sign-in link has been sent.',
  });
}

export async function verifyLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJsonObject(request);
  const token = getRequiredString(body, 'token');
  await enforceRateLimit(request, env.AUTH_RATE_LIMITER, 'verify');
  const session = await consumeLoginLink(env, token);

  return json(
    { success: true },
    { headers: { 'set-cookie': sessionCookie(session, request) } },
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
