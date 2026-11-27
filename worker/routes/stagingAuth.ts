import { sessionCookie } from '../auth/authorization';
import { stagingCredentials } from '../auth/stagingCredentials';
import {
  stagingCredentialFingerprint,
  stagingEmail,
  validStagingPassword,
  verifyStagingPassword,
} from '../../shared/staging-credentials.mjs';
import { HttpError, json } from '../lib/http';
import { createSession } from '../services/authService';
import { loadAuthorizationContext } from '../services/accessControlService';
import {
  enforceRateLimit,
  requireSameOrigin,
  verifyTurnstile,
} from '../services/securityService';
import type { Env } from '../types';

const failure = 'Unable to sign in with those details.';
let verificationRunning = false;
async function credentialsBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > 4096)) {
    throw new HttpError(413, 'Request body is too large.');
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new HttpError(400, failure);
  }
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    size += next.value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new HttpError(413, 'Request body is too large.');
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !['email', 'password', 'turnstileToken'].includes(key),
      )
    ) {
      throw new Error();
    }
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, failure);
  }
}

export async function loginToStaging(
  request: Request,
  env: Env,
): Promise<Response> {
  // Environment checks precede input, challenge, hashing, storage and cookies.
  if (env.APP_ENV !== 'staging') {
    throw new HttpError(404, 'Not found.');
  }
  requireSameOrigin(request, env);
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  ) {
    throw new HttpError(415, 'A JSON request is required.');
  }
  await enforceRateLimit(
    request,
    env.AUTH_RATE_LIMITER,
    'staging-password-entry',
  );
  const body = await credentialsBody(request);
  let email: string;
  try {
    email = stagingEmail(body.email);
  } catch {
    throw new HttpError(401, failure);
  }
  if (!validStagingPassword(body.password)) {
    throw new HttpError(401, failure);
  }
  if (!env.STAGING_PASSWORD_RATE_LIMITER) {
    throw new HttpError(503, 'Staging sign-in is temporarily unavailable.');
  }
  await enforceRateLimit(
    request,
    env.STAGING_PASSWORD_RATE_LIMITER,
    'staging-password-attempt',
    email,
  );
  await verifyTurnstile(
    request,
    env,
    typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined,
  );
  const identities = stagingCredentials(env);
  const identity = identities.find((entry) => entry.email === email);
  // Unknown identities perform the same bounded KDF as incorrect passwords.
  if (verificationRunning) {
    throw new HttpError(503, 'Staging sign-in is temporarily unavailable.', {
      'retry-after': '1',
    });
  }
  verificationRunning = true;
  let valid: boolean;
  try {
    valid = await verifyStagingPassword(
      body.password,
      (identity ?? identities[0]).verifier,
    );
  } catch {
    throw new HttpError(503, 'Staging sign-in is temporarily unavailable.');
  } finally {
    verificationRunning = false;
  }
  if (!identity || !valid) {
    throw new HttpError(401, failure);
  }
  const fingerprint = await stagingCredentialFingerprint(identity);
  const user = await env.DB.prepare(
    `SELECT users.id FROM users
    JOIN business_account_members m ON m.user_id=users.id AND m.business_account_id='business-account-primary'
    JOIN staging_auth_identities c ON c.user_id=users.id
    WHERE users.id=? AND users.email=? AND users.role=? AND users.status='ACTIVE'
      AND m.role=? AND c.credential_fingerprint=?`,
  )
    .bind(identity.id, email, identity.role, identity.role, fingerprint)
    .first<{ id: string }>();
  if (!user) {
    throw new HttpError(401, failure);
  }
  try {
    await loadAuthorizationContext(env.DB, {
      id: user.id,
      businessAccountId: 'business-account-primary',
    });
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status)) {
      throw new HttpError(401, failure);
    }
    throw error;
  }
  const token = await createSession(
    env,
    user.id,
    'business-account-primary',
    fingerprint,
  );
  return json(
    { success: true },
    { headers: { 'set-cookie': sessionCookie(token, request) } },
  );
}
