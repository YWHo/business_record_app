import { hashToken } from '../auth/authorization';
import { HttpError } from '../lib/http';
import type { AuthenticatedUser, Env } from '../types';
import { deliverEmail } from './emailService';
import { normalizeEmail } from './invitationService';

export async function createSession(
  env: Env,
  userId: string,
  businessAccountId?: string,
): Promise<string> {
  const membership = await env.DB.prepare(
    `SELECT business_account_members.business_account_id
       FROM business_account_members
       JOIN business_accounts
         ON business_accounts.id=business_account_members.business_account_id
      WHERE business_account_members.user_id=?
        AND business_account_members.status='ACTIVE'
        AND business_accounts.status='ACTIVE'
        ${businessAccountId ? 'AND business_account_members.business_account_id=?' : ''}
      ORDER BY business_account_members.created_at
      LIMIT 1`,
  )
    .bind(userId, ...(businessAccountId ? [businessAccountId] : []))
    .first<{ business_account_id: string }>();
  if (!membership)
    throw new HttpError(401, 'Unable to sign in with those details.');
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions
      (token_hash, user_id, business_account_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      await hashToken(token),
      userId,
      membership.business_account_id,
      expiresAt,
      now.toISOString(),
    )
    .run();

  return token;
}

export async function requestLoginLink(
  env: Env,
  rawEmail: string,
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const user = await env.DB.prepare(
    `SELECT users.id, users.email, users.status,
            business_account_members.role,
            business_account_members.business_account_id AS businessAccountId
       FROM users
       JOIN business_account_members ON business_account_members.user_id = users.id
       JOIN business_accounts ON business_accounts.id = business_account_members.business_account_id
      WHERE users.email = ?
        AND business_account_members.status = 'ACTIVE'
        AND business_accounts.status = 'ACTIVE'
      ORDER BY business_account_members.created_at
      LIMIT 1`,
  )
    .bind(email)
    .first<AuthenticatedUser>();

  if (!user || user.status !== 'ACTIVE') {
    return;
  }

  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = new Date();
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const actionUrl = `${env.APP_ORIGIN}/verify-login?token=${encodeURIComponent(token)}`;

  await env.DB.prepare(
    `INSERT INTO authentication_challenges
      (id, user_id, email, purpose, token_hash, expires_at, consumed_at, created_at)
     VALUES (?, ?, ?, 'LOGIN', ?, ?, NULL, ?)`,
  )
    .bind(
      challengeId,
      user.id,
      user.email,
      await hashToken(token),
      expiresAt,
      now.toISOString(),
    )
    .run();

  try {
    await deliverEmail(env, {
      to: user.email,
      subject: 'Sign in to Business Records',
      actionUrl,
      text: `Use this single-use link within 15 minutes to sign in:\n\n${actionUrl}`,
    });
  } catch (error) {
    await env.DB.prepare('DELETE FROM authentication_challenges WHERE id = ?')
      .bind(challengeId)
      .run();
    throw error;
  }
}

export async function consumeLoginLink(
  env: Env,
  token: string,
): Promise<string> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE authentication_challenges
        SET consumed_at = ?
      WHERE token_hash = ?
        AND consumed_at IS NULL
        AND expires_at > ?
      RETURNING user_id`,
  )
    .bind(now, await hashToken(token), now)
    .first<{ user_id: string }>();

  if (!result) {
    throw new HttpError(400, 'Login link is invalid or expired.');
  }

  const user = await env.DB.prepare(
    "SELECT id FROM users WHERE id = ? AND status = 'ACTIVE'",
  )
    .bind(result.user_id)
    .first<{ id: string }>();

  if (!user) {
    throw new HttpError(400, 'Login link is invalid or expired.');
  }

  return createSession(env, user.id);
}
