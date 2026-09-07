import { hashToken } from '../auth/authorization';
import { HttpError } from '../lib/http';
import type { AuthenticatedUser, Env } from '../types';
import { deliverEmail } from './emailService';

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'A valid email address is required.');
  }

  return email;
}

export async function createAccountantInvitation(
  env: Env,
  owner: AuthenticatedUser,
  rawEmail: string,
): Promise<{
  id: string;
  email: string;
  expiresAt: string;
  invitationUrl: string;
}> {
  const email = normalizeEmail(rawEmail);
  const existing = await env.DB.prepare(
    'SELECT role FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ role: string }>();

  if (existing) {
    throw new HttpError(
      409,
      'An account already exists for this email address.',
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const invitationId = crypto.randomUUID();
  const invitationUrl = `${env.APP_ORIGIN}/accept-invitation?token=${encodeURIComponent(token)}`;

  await env.DB.prepare(
    `INSERT INTO invitations
      (id, email, role, token_hash, invited_by, expires_at, accepted_at, created_at)
     VALUES (?, ?, 'ACCOUNTANT', ?, ?, ?, NULL, ?)`,
  )
    .bind(
      invitationId,
      email,
      await hashToken(token),
      owner.id,
      expiresAt,
      now.toISOString(),
    )
    .run();

  try {
    if (env.APP_ENV === 'local') {
      await env.DB.prepare(
        `INSERT INTO development_outbox
          (id, invitation_id, recipient_email, invitation_url, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          invitationId,
          email,
          invitationUrl,
          now.toISOString(),
        )
        .run();
    } else {
      await deliverEmail(env, {
        to: email,
        subject: 'Invitation to Business Records',
        actionUrl: invitationUrl,
        text: `Use this single-use link within 72 hours to accept your accountant invitation:\n\n${invitationUrl}`,
      });
    }
  } catch (error) {
    await env.DB.prepare('DELETE FROM invitations WHERE id = ?')
      .bind(invitationId)
      .run();
    throw error;
  }

  return { id: invitationId, email, expiresAt, invitationUrl };
}

export async function acceptAccountantInvitation(
  env: Env,
  rawEmail: string,
  token: string,
): Promise<{ id: string; email: string; role: 'ACCOUNTANT' }> {
  const email = normalizeEmail(rawEmail);
  const now = new Date().toISOString();
  const existingUser = await env.DB.prepare(
    'SELECT id, role FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ id: string; role: string }>();

  if (existingUser?.role === 'OWNER') {
    throw new HttpError(409, 'Invitation cannot change the owner account.');
  }

  const invitation = await env.DB.prepare(
    `UPDATE invitations
        SET accepted_at = ?
      WHERE token_hash = ?
        AND email = ?
        AND accepted_at IS NULL
        AND expires_at > ?
      RETURNING id`,
  )
    .bind(now, await hashToken(token), email, now)
    .first<{ id: string }>();

  if (!invitation) {
    throw new HttpError(400, 'Invitation is invalid or expired.');
  }

  const userId = existingUser?.id ?? crypto.randomUUID();

  if (existingUser) {
    await env.DB.prepare(
      `UPDATE users
          SET role = 'ACCOUNTANT', status = 'ACTIVE', updated_at = ?
        WHERE id = ?`,
    )
      .bind(now, userId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO users (id, email, role, status, created_at, updated_at)
       VALUES (?, ?, 'ACCOUNTANT', 'ACTIVE', ?, ?)`,
    )
      .bind(userId, email, now, now)
      .run();
  }

  return { id: userId, email, role: 'ACCOUNTANT' };
}
