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
import {
  enforceRateLimit,
  isTurnstileRequired,
  verifyTurnstile,
} from '../services/securityService';
import type { Env } from '../types';

export async function loginLocally(
  request: Request,
  env: Env,
): Promise<Response> {
  requireLocalAuth(request, env);
  const body = await readJsonObject(request);
  const email = normalizeEmail(getRequiredString(body, 'email'));

  const user = await env.DB.prepare(
    `SELECT users.id, users.email, users.status,
            business_account_members.role,
            business_account_members.business_account_id AS businessAccountId
       FROM users
       JOIN business_account_members ON business_account_members.user_id = users.id
      WHERE users.email = ?
        AND business_account_members.status = 'ACTIVE'
      ORDER BY business_account_members.created_at
      LIMIT 1`,
  )
    .bind(email)
    .first<{
      id: string;
      email: string;
      role: string;
      status: string;
      businessAccountId: string;
    }>();

  if (!user || user.status !== 'ACTIVE') {
    throw new HttpError(401, 'Unable to sign in with those details.');
  }

  const token = await createSession(env, user.id, user.businessAccountId);

  return json(
    {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        businessAccountId: user.businessAccountId,
      },
    },
    { headers: { 'set-cookie': sessionCookie(token, request) } },
  );
}

export function authConfiguration(request: Request, env: Env): Response {
  const localHelper =
    env.APP_ENV === 'local' &&
    env.LOCAL_AUTH_ENABLED === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);

  const turnstileRequired = isTurnstileRequired(env);
  return json({
    environment: env.APP_ENV,
    localHelper,
    demoHelper: env.APP_ENV === 'demo',
    turnstileRequired,
    turnstileSiteKey: turnstileRequired ? env.TURNSTILE_SITE_KEY : null,
  });
}

export async function requestLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  if (env.APP_ENV === 'demo') throw new HttpError(404, 'Not found.');
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
  if (env.APP_ENV === 'demo') throw new HttpError(404, 'Not found.');
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
