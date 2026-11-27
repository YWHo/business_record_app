import {
  parseStagingCredentials,
  stagingCredentialFingerprint,
} from '../../shared/staging-credentials.mjs';
import type { AuthenticatedUser, Env } from '../types';
import { HttpError } from '../lib/http';

export function stagingCredentials(env: Env) {
  try {
    return parseStagingCredentials(env.STAGING_AUTH_CREDENTIALS);
  } catch {
    throw new HttpError(503, 'Staging sign-in is temporarily unavailable.');
  }
}
export async function assertStagingSession(
  env: Env,
  user: AuthenticatedUser,
  fingerprint: string | null | undefined,
) {
  if (user.businessAccountId !== 'business-account-primary') {
    throw new HttpError(401, 'Authentication required.');
  }
  const identity = stagingCredentials(env).find(
    (entry) =>
      entry.id === user.id &&
      entry.email === user.email.toLowerCase() &&
      entry.role === user.role,
  );
  if (
    !identity ||
    !fingerprint ||
    fingerprint !== (await stagingCredentialFingerprint(identity))
  ) {
    throw new HttpError(401, 'Authentication required.');
  }
  const binding = await env.DB.prepare(
    'SELECT credential_fingerprint FROM staging_auth_identities WHERE user_id=?',
  )
    .bind(user.id)
    .first<{ credential_fingerprint: string }>();
  if (binding?.credential_fingerprint !== fingerprint) {
    throw new HttpError(401, 'Authentication required.');
  }
}
