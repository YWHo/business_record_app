import { hashToken } from '../auth/authorization';
import { HttpError } from '../lib/http';
import type { AuthenticatedUser, Env } from '../types';

interface InvitationRow {
  id: string;
  expires_at: string;
  accepted_at: string | null;
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'A valid email address is required.');
  }

  return email;
}

export async function createDevelopmentInvitation(
  env: Env,
  owner: AuthenticatedUser,
  rawEmail: string,
): Promise<{ email: string; expiresAt: string; invitationUrl: string }> {
  const email = normalizeEmail(rawEmail);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  const token = crypto.randomUUID() + crypto.randomUUID();
  const invitationId = crypto.randomUUID();
  const invitationUrl = `/accept-invitation?token=${encodeURIComponent(token)}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO invitations
        (id, email, role, token_hash, invited_by, expires_at, accepted_at, created_at)
       VALUES (?, ?, 'ACCOUNTANT', ?, ?, ?, NULL, ?)`,
    ).bind(
      invitationId,
      email,
      await hashToken(token),
      owner.id,
      expiresAt,
      now.toISOString(),
    ),
    env.DB.prepare(
      `INSERT INTO development_outbox
        (id, invitation_id, recipient_email, invitation_url, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      invitationId,
      email,
      invitationUrl,
      now.toISOString(),
    ),
  ]);

  return { email, expiresAt, invitationUrl };
}

export async function acceptDevelopmentInvitation(
  env: Env,
  rawEmail: string,
  token: string,
): Promise<{ email: string; role: 'ACCOUNTANT' }> {
  const email = normalizeEmail(rawEmail);
  const invitation = await env.DB.prepare(
    `SELECT id, expires_at, accepted_at
       FROM invitations
      WHERE token_hash = ? AND email = ?`,
  )
    .bind(await hashToken(token), email)
    .first<InvitationRow>();

  if (
    !invitation ||
    invitation.accepted_at ||
    Date.parse(invitation.expires_at) <= Date.now()
  ) {
    throw new HttpError(400, 'Invitation is invalid or expired.');
  }

  const now = new Date().toISOString();
  const existingUser = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ id: string }>();

  await env.DB.batch([
    existingUser
      ? env.DB.prepare(
          `UPDATE users
              SET role = 'ACCOUNTANT', status = 'ACTIVE', updated_at = ?
            WHERE id = ?`,
        ).bind(now, existingUser.id)
      : env.DB.prepare(
          `INSERT INTO users (id, email, role, status, created_at, updated_at)
           VALUES (?, ?, 'ACCOUNTANT', 'ACTIVE', ?, ?)`,
        ).bind(crypto.randomUUID(), email, now, now),
    env.DB.prepare(
      'UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL',
    ).bind(now, invitation.id),
  ]);

  return { email, role: 'ACCOUNTANT' };
}
