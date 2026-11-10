import { hashToken } from '../auth/authorization';
import { normalizeEmail } from '../lib/identity';
import { HttpError } from '../lib/http';
import type { AuthenticatedUser, Env } from '../types';
import type { AuditorGrant } from '../../src/lib/auditorAccess';
import {
  accessAudit,
  accessBatch,
  ownerCondition,
} from './accessMutationService';
import { deliverEmail } from './emailService';
import { maximumAccessScopes } from './accessControlService';

type InviteRole = 'ACCOUNTANT' | 'AUDITOR';
interface StoredInvitation {
  id: string;
  business_account_id: string;
  role: InviteRole;
  access_starts_at: string | null;
  access_expires_at: string | null;
  access_revision: number;
}

export async function createManagedInvitation(
  env: Env,
  owner: AuthenticatedUser,
  rawEmail: string,
  role: InviteRole,
  grant?: AuditorGrant,
) {
  if (env.APP_ENV === 'demo')
    throw new HttpError(
      403,
      'Member administration is unavailable in the public demo.',
    );
  const email = normalizeEmail(rawEmail);
  if (role === 'AUDITOR' && !grant)
    throw new HttpError(400, 'Auditor grants are required.');
  const instant = new Date(),
    now = instant.toISOString();
  const id = crypto.randomUUID(),
    token = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = new Date(
    Math.min(
      instant.getTime() + 72 * 60 * 60 * 1000,
      grant ? Date.parse(grant.accessExpiresAt) : Infinity,
    ),
  ).toISOString();
  const invitationUrl = `${env.APP_ORIGIN}/accept-invitation?token=${encodeURIComponent(token)}`;
  const ownerGate = ownerCondition(owner);
  const scopes = role === 'AUDITOR' ? grant!.scopes : [];
  const statements = [
    env.DB.prepare(
      `INSERT INTO invitations
    (id,business_account_id,email,role,token_hash,invited_by,expires_at,created_at,access_starts_at,access_expires_at,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      owner.businessAccountId,
      email,
      role,
      await hashToken(token),
      owner.id,
      expiresAt,
      now,
      grant?.accessStartsAt ?? null,
      grant?.accessExpiresAt ?? null,
      grant?.note ?? null,
    ),
  ];
  for (const scope of scopes)
    statements.push(
      env.DB.prepare(
        `INSERT INTO invitation_access_scopes
    (business_account_id,invitation_id,scope_type,business_id,legal_entity_id,date_from,date_to,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`,
      ).bind(
        owner.businessAccountId,
        id,
        scope.scopeType,
        scope.businessId,
        scope.legalEntityId,
        scope.dateFrom,
        scope.dateTo,
        now,
        now,
      ),
    );
  if (env.APP_ENV === 'local')
    statements.push(
      env.DB.prepare(
        `INSERT INTO development_outbox
    (id,invitation_id,recipient_email,invitation_url,created_at) VALUES (?,?,?,?,?)`,
      ).bind(crypto.randomUUID(), id, email, invitationUrl, now),
    );
  statements.push(
    accessAudit(
      env,
      owner,
      role === 'AUDITOR' ? 'AUDITOR_INVITED' : 'INVITATION_CREATED',
      'INVITATION',
      id,
      `${role === 'AUDITOR' ? 'Auditor' : 'Accountant'} invitation created.`,
      { role, email, grant: grant ?? null },
      now,
    ),
  );
  await accessBatch(
    env,
    owner.businessAccountId,
    `${ownerGate.sql}
    AND NOT EXISTS (SELECT 1 FROM users u JOIN business_account_members m ON m.user_id=u.id WHERE u.email=? AND m.business_account_id=?)
    AND NOT EXISTS (SELECT 1 FROM invitations WHERE email=? AND business_account_id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND (?='AUDITOR' OR role='AUDITOR'))`,
    [
      ...ownerGate.values,
      email,
      owner.businessAccountId,
      email,
      owner.businessAccountId,
      now,
      role,
    ],
    statements,
  );
  if (env.APP_ENV !== 'local') {
    try {
      await deliverEmail(env, {
        to: email,
        subject: 'Invitation to Business Records',
        actionUrl: invitationUrl,
        text: `Use this single-use link to accept your ${role.toLowerCase()} invitation before ${expiresAt}:\n\n${invitationUrl}`,
      });
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE invitations SET revoked_at=?,access_revision=access_revision+1 WHERE id=? AND business_account_id=? AND accepted_at IS NULL',
        ).bind(new Date().toISOString(), id, owner.businessAccountId),
        accessAudit(
          env,
          owner,
          'INVITATION_DELIVERY_FAILED',
          'INVITATION',
          id,
          'Invitation delivery failed; unaccepted token revoked.',
          { role },
          new Date().toISOString(),
        ),
      ]);
      throw error;
    }
  }
  return { id, email, expiresAt, invitationUrl };
}

export async function acceptManagedInvitation(
  env: Env,
  rawEmail: string,
  token: string,
  expectedRole?: InviteRole,
): Promise<{
  id: string;
  email: string;
  role: InviteRole;
  businessAccountId: string;
}> {
  if (env.APP_ENV === 'demo')
    throw new HttpError(
      403,
      'Invitation acceptance is unavailable in the public demo.',
    );
  const email = normalizeEmail(rawEmail),
    now = new Date().toISOString(),
    tokenHash = await hashToken(token);
  const invitation = await env.DB.prepare(
    `SELECT id,business_account_id,role,access_starts_at,access_expires_at,access_revision
    FROM invitations WHERE token_hash=? AND email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?
    AND role IN ('ACCOUNTANT','AUDITOR') AND (? IS NULL OR role=?)`,
  )
    .bind(tokenHash, email, now, expectedRole ?? null, expectedRole ?? null)
    .first<StoredInvitation>();
  if (!invitation)
    throw new HttpError(400, 'Invitation is invalid or expired.');
  const existing = await env.DB.prepare(
    'SELECT id,status FROM users WHERE email=?',
  )
    .bind(email)
    .first<{ id: string; status: string }>();
  if (existing && existing.status !== 'ACTIVE')
    throw new HttpError(400, 'Invitation is invalid or expired.');
  const userId = existing?.id ?? crypto.randomUUID(),
    accountId = invitation.business_account_id;
  const condition = `EXISTS (SELECT 1 FROM invitations i JOIN business_accounts a ON a.id=i.business_account_id
    WHERE i.id=? AND i.business_account_id=? AND i.token_hash=? AND i.email=? AND i.role=? AND i.access_revision=?
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND a.status='ACTIVE'
    AND (i.role<>'AUDITOR' OR i.access_expires_at>?)
    AND (SELECT COUNT(*) FROM invitation_access_scopes s WHERE s.invitation_id=i.id AND s.business_account_id=i.business_account_id) BETWEEN 1 AND ?)
    AND NOT EXISTS (SELECT 1 FROM business_account_members WHERE user_id=? AND business_account_id=?)
    AND NOT EXISTS (SELECT 1 FROM users WHERE email=? AND status<>'ACTIVE')`;
  const statements: D1PreparedStatement[] = [];
  if (!existing)
    statements.push(
      env.DB.prepare(
        `INSERT INTO users (id,email,role,status,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,?)`,
      ).bind(userId, email, invitation.role, now, now),
    );
  statements.push(
    env.DB.prepare(
      `INSERT INTO business_account_members
    (business_account_id,user_id,role,status,created_at,updated_at,access_starts_at,access_expires_at)
    SELECT business_account_id,?,role,'ACTIVE',?,?,access_starts_at,access_expires_at FROM invitations WHERE id=? AND business_account_id=?`,
    ).bind(userId, now, now, invitation.id, accountId),
  );
  // Legacy accountant insert triggers already create the single ACCOUNT grant.
  if (invitation.role === 'AUDITOR')
    statements.push(
      env.DB.prepare(
        `INSERT INTO membership_access_scopes
    (business_account_id,user_id,scope_type,business_id,legal_entity_id,date_from,date_to,created_at,updated_at)
    SELECT business_account_id,?,scope_type,business_id,legal_entity_id,date_from,date_to,?,? FROM invitation_access_scopes
    WHERE invitation_id=? AND business_account_id=?`,
      ).bind(userId, now, now, invitation.id, accountId),
    );
  statements.push(
    env.DB.prepare(
      'UPDATE invitations SET accepted_at=?,access_revision=access_revision+1 WHERE id=? AND business_account_id=?',
    ).bind(now, invitation.id, accountId),
    accessAudit(
      env,
      { id: userId, businessAccountId: accountId },
      invitation.role === 'AUDITOR'
        ? 'AUDITOR_ACTIVATED'
        : 'INVITATION_ACCEPTED',
      'USER',
      userId,
      `${invitation.role === 'AUDITOR' ? 'Auditor' : 'Accountant'} invitation accepted.`,
      { invitationId: invitation.id, role: invitation.role },
      now,
    ),
  );
  await accessBatch(
    env,
    accountId,
    condition,
    [
      invitation.id,
      accountId,
      tokenHash,
      email,
      invitation.role,
      invitation.access_revision,
      now,
      now,
      maximumAccessScopes,
      userId,
      accountId,
      email,
    ],
    statements,
    400,
  );
  return {
    id: userId,
    email,
    role: invitation.role,
    businessAccountId: accountId,
  };
}
