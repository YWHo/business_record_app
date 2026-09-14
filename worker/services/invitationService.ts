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
    `SELECT business_account_members.role
       FROM users
       JOIN business_account_members ON business_account_members.user_id = users.id
      WHERE users.email = ? AND business_account_members.business_account_id = ?`,
  )
    .bind(email, owner.businessAccountId)
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
      (id, business_account_id, email, role, token_hash, invited_by, expires_at,
       accepted_at, created_at)
     VALUES (?, ?, ?, 'ACCOUNTANT', ?, ?, ?, NULL, ?)`,
  )
    .bind(
      invitationId,
      owner.businessAccountId,
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
): Promise<{
  id: string;
  email: string;
  role: 'ACCOUNTANT';
  businessAccountId: string;
}> {
  const email = normalizeEmail(rawEmail);
  const now = new Date().toISOString();
  const tokenHash = await hashToken(token);
  const existingUser = await env.DB.prepare(
    'SELECT id, status FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ id: string; status: string }>();

  const invitation = await env.DB.prepare(
    `SELECT id, business_account_id
       FROM invitations
      WHERE token_hash = ?
        AND email = ?
        AND accepted_at IS NULL
        AND expires_at > ?`,
  )
    .bind(tokenHash, email, now)
    .first<{ id: string; business_account_id: string }>();

  if (!invitation || (existingUser && existingUser.status !== 'ACTIVE')) {
    throw new HttpError(400, 'Invitation is invalid or expired.');
  }

  const userId = existingUser?.id ?? crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  if (!existingUser) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO users (id, email, role, status, created_at, updated_at)
         SELECT ?, ?, 'ACCOUNTANT', 'ACTIVE', ?, ?
          WHERE EXISTS (
            SELECT 1 FROM invitations
             WHERE id = ? AND business_account_id = ? AND token_hash = ?
               AND email = ? AND accepted_at IS NULL AND expires_at > ?
          )`,
      ).bind(
        userId,
        email,
        now,
        now,
        invitation.id,
        invitation.business_account_id,
        tokenHash,
        email,
        now,
      ),
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO business_account_members
        (business_account_id, user_id, role, status, created_at, updated_at)
       SELECT invitations.business_account_id, ?, 'ACCOUNTANT', 'ACTIVE', ?, ?
         FROM invitations
         JOIN users ON users.id = ? AND users.status = 'ACTIVE'
        WHERE invitations.id = ? AND invitations.business_account_id = ?
          AND invitations.token_hash = ? AND invitations.email = ?
          AND invitations.accepted_at IS NULL AND invitations.expires_at > ?
       ON CONFLICT(business_account_id, user_id) DO UPDATE SET
         role = 'ACCOUNTANT', status = 'ACTIVE', updated_at = excluded.updated_at`,
    ).bind(
      userId,
      now,
      now,
      userId,
      invitation.id,
      invitation.business_account_id,
      tokenHash,
      email,
      now,
    ),
    env.DB.prepare(
      `UPDATE invitations
          SET accepted_at = ?
        WHERE id = ? AND business_account_id = ? AND token_hash = ?
          AND email = ? AND accepted_at IS NULL AND expires_at > ?
          AND EXISTS (
            SELECT 1
              FROM business_account_members
              JOIN users ON users.id = business_account_members.user_id
             WHERE business_account_members.business_account_id = invitations.business_account_id
               AND business_account_members.user_id = ?
               AND business_account_members.role = 'ACCOUNTANT'
               AND business_account_members.status = 'ACTIVE'
               AND users.status = 'ACTIVE'
          )`,
    ).bind(
      now,
      invitation.id,
      invitation.business_account_id,
      tokenHash,
      email,
      now,
      userId,
    ),
  );
  const results = await env.DB.batch(statements);
  const acceptance = results.at(-1);
  if (acceptance?.meta.changes !== 1) {
    throw new HttpError(400, 'Invitation is invalid or expired.');
  }

  return {
    id: userId,
    email,
    role: 'ACCOUNTANT',
    businessAccountId: invitation.business_account_id,
  };
}
