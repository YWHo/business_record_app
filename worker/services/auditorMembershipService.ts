import type {
  AuditorGrant,
  AuditorMember,
  AuditorInvitation,
  AuditorScope,
} from '../../src/lib/auditorAccess';
import { HttpError } from '../lib/http';
import type { AuthenticatedUser, Env } from '../types';
import {
  accessAudit,
  accessBatch,
  ownerCondition,
} from './accessMutationService';

type MemberRow = Omit<AuditorMember, 'scopes' | 'accessState' | 'note'> & {
  scopeJson: string;
};
type InviteRow = Omit<AuditorInvitation, 'scopes' | 'note' | 'status'> & {
  scopeJson: string;
  note: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
};
const scopeJson = (
  table: string,
  key: string,
  column: string,
) => `(SELECT json_group_array(json_object('scopeType',s.scope_type,'businessId',s.business_id,'legalEntityId',s.legal_entity_id,'dateFrom',s.date_from,'dateTo',s.date_to))
  FROM (SELECT * FROM ${table} WHERE business_account_id=t.business_account_id AND ${key}=t.${column} ORDER BY id LIMIT 17) s)`;
const memberSelect = `SELECT t.user_id AS id,u.email,u.status AS userStatus,t.status,
  t.access_starts_at AS accessStartsAt,t.access_expires_at AS accessExpiresAt,t.access_revision AS revision,
  ${scopeJson('membership_access_scopes', 'user_id', 'user_id')} AS scopeJson
  FROM business_account_members t JOIN users u ON u.id=t.user_id WHERE t.role='AUDITOR' AND t.business_account_id=?`;

function member(row: MemberRow): AuditorMember {
  const now = new Date().toISOString();
  const accessState =
    row.userStatus !== 'ACTIVE' || row.status === 'DISABLED'
      ? 'DISABLED'
      : row.status === 'INVITED'
        ? 'INVITED'
        : row.status === 'EXPIRED' || row.accessExpiresAt <= now
          ? 'EXPIRED'
          : row.accessStartsAt !== null && row.accessStartsAt > now
            ? 'SCHEDULED'
            : 'ACTIVE';
  const { scopeJson: json, ...rest } = row;
  return {
    ...rest,
    accessState,
    note: null,
    scopes: JSON.parse(json) as AuditorScope[],
  };
}

export async function auditorMember(
  env: Env,
  accountId: string,
  userId: string,
): Promise<AuditorMember> {
  const row = await env.DB.prepare(`${memberSelect} AND t.user_id=?`)
    .bind(accountId, userId)
    .first<MemberRow>();
  if (!row) throw new HttpError(404, 'Auditor membership not found.');
  return member(row);
}

export async function auditorDirectory(env: Env, accountId: string) {
  const members = await env.DB.prepare(
    `${memberSelect} ORDER BY t.updated_at DESC,t.user_id LIMIT 201`,
  )
    .bind(accountId)
    .all<MemberRow>();
  const invitations = await env.DB.prepare(
    `SELECT t.id,t.email,t.expires_at AS expiresAt,t.accepted_at AS acceptedAt,t.revoked_at AS revokedAt,t.access_revision AS revision,
    t.access_starts_at AS accessStartsAt,t.access_expires_at AS accessExpiresAt,t.note,
    ${scopeJson('invitation_access_scopes', 'invitation_id', 'id')} AS scopeJson
    FROM invitations t WHERE t.business_account_id=? AND t.role='AUDITOR' ORDER BY t.created_at DESC,t.id LIMIT 201`,
  )
    .bind(accountId)
    .all<InviteRow>();
  const now = new Date().toISOString();
  return {
    members: members.results.slice(0, 200).map(member),
    invitations: invitations.results
      .slice(0, 200)
      .map((row): AuditorInvitation => {
        const { scopeJson: json, acceptedAt, revokedAt, ...rest } = row;
        return {
          ...rest,
          status:
            acceptedAt !== null
              ? 'ACCEPTED'
              : revokedAt !== null
                ? 'REVOKED'
                : row.expiresAt <= now
                  ? 'EXPIRED'
                  : 'PENDING',
          scopes: JSON.parse(json) as AuditorScope[],
        };
      }),
    hasMoreMembers: members.results.length > 200,
    hasMoreInvitations: invitations.results.length > 200,
  };
}

export function accessRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new HttpError(
      400,
      'Reload the current access revision before saving.',
    );
  return value;
}

export async function updateAuditorMembership(
  env: Env,
  owner: AuthenticatedUser,
  userId: string,
  revision: number,
  grant: AuditorGrant,
  restoreAccess: boolean,
) {
  const before = await auditorMember(env, owner.businessAccountId, userId);
  if (restoreAccess && before.userStatus !== 'ACTIVE')
    throw new HttpError(
      400,
      'A disabled identity cannot be restored by changing membership access.',
    );
  const now = new Date().toISOString(),
    gate = ownerCondition(owner);
  const status = restoreAccess ? 'ACTIVE' : before.status;
  const statements = [
    env.DB.prepare(
      `UPDATE business_account_members SET access_starts_at=?,access_expires_at=?,status=?,access_revision=access_revision+1,updated_at=?
    WHERE business_account_id=? AND user_id=? AND role='AUDITOR'`,
    ).bind(
      grant.accessStartsAt,
      grant.accessExpiresAt,
      status,
      now,
      owner.businessAccountId,
      userId,
    ),
    env.DB.prepare(
      'DELETE FROM membership_access_scopes WHERE business_account_id=? AND user_id=?',
    ).bind(owner.businessAccountId, userId),
  ];
  for (const scope of grant.scopes)
    statements.push(
      env.DB.prepare(
        `INSERT INTO membership_access_scopes
    (business_account_id,user_id,scope_type,business_id,legal_entity_id,date_from,date_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      ).bind(
        owner.businessAccountId,
        userId,
        scope.scopeType,
        scope.businessId,
        scope.legalEntityId,
        scope.dateFrom,
        scope.dateTo,
        now,
        now,
      ),
    );
  statements.push(
    env.DB.prepare(
      'DELETE FROM sessions WHERE business_account_id=? AND user_id=?',
    ).bind(owner.businessAccountId, userId),
  );
  const after = { ...grant, status };
  const oldScopes = before.scopes
    .map((scope) => JSON.stringify(scope))
    .sort()
    .join('|');
  const newScopes = grant.scopes
    .map((scope) => JSON.stringify(scope))
    .sort()
    .join('|');
  const actions: string[] = [];
  if (oldScopes !== newScopes) actions.push('AUDITOR_SCOPE_CHANGED');
  if (
    before.accessStartsAt !== grant.accessStartsAt ||
    before.accessExpiresAt !== grant.accessExpiresAt
  )
    actions.push('AUDITOR_EXPIRY_CHANGED');
  if (restoreAccess && before.status !== 'ACTIVE')
    actions.push('AUDITOR_REACTIVATED');
  if (!actions.length) actions.push('AUDITOR_ACCESS_CONFIRMED');
  for (const action of actions)
    statements.push(
      accessAudit(
        env,
        owner,
        action,
        'USER',
        userId,
        'Auditor access updated; existing sessions revoked.',
        { before, after },
        now,
      ),
    );
  await accessBatch(
    env,
    owner.businessAccountId,
    `${gate.sql} AND EXISTS (SELECT 1 FROM business_account_members m JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.business_account_id=? AND m.role='AUDITOR' AND m.access_revision=? AND (?=0 OR u.status='ACTIVE'))`,
    [
      ...gate.values,
      userId,
      owner.businessAccountId,
      revision,
      restoreAccess ? 1 : 0,
    ],
    statements,
  );
  return auditorMember(env, owner.businessAccountId, userId);
}

export async function endAuditorAccess(
  env: Env,
  owner: AuthenticatedUser,
  userId: string,
  revision: number,
  action: 'REVOKE' | 'EXPIRE',
) {
  const before = await auditorMember(env, owner.businessAccountId, userId);
  const status = action === 'REVOKE' ? 'DISABLED' : 'EXPIRED';
  if (
    before.status === status ||
    (action === 'EXPIRE' && before.status === 'DISABLED')
  )
    return before;
  const now = new Date().toISOString(),
    gate = ownerCondition(owner);
  await accessBatch(
    env,
    owner.businessAccountId,
    `${gate.sql} AND EXISTS (SELECT 1 FROM business_account_members WHERE user_id=? AND business_account_id=? AND role='AUDITOR' AND access_revision=?)`,
    [...gate.values, userId, owner.businessAccountId, revision],
    [
      env.DB.prepare(
        "UPDATE business_account_members SET status=?,access_revision=access_revision+1,updated_at=? WHERE business_account_id=? AND user_id=? AND role='AUDITOR'",
      ).bind(status, now, owner.businessAccountId, userId),
      env.DB.prepare(
        'DELETE FROM sessions WHERE business_account_id=? AND user_id=?',
      ).bind(owner.businessAccountId, userId),
      accessAudit(
        env,
        owner,
        action === 'REVOKE' ? 'AUDITOR_REVOKED' : 'AUDITOR_EXPIRED',
        'USER',
        userId,
        `Auditor access ${action === 'REVOKE' ? 'revoked' : 'expired'} immediately; sessions revoked.`,
        { before, after: { status } },
        now,
      ),
    ],
  );
  return auditorMember(env, owner.businessAccountId, userId);
}

export async function revokeAuditorInvitation(
  env: Env,
  owner: AuthenticatedUser,
  id: string,
  revision: number,
) {
  const row = await env.DB.prepare(
    "SELECT accepted_at,revoked_at FROM invitations WHERE id=? AND business_account_id=? AND role='AUDITOR'",
  )
    .bind(id, owner.businessAccountId)
    .first<{ accepted_at: string | null; revoked_at: string | null }>();
  if (!row) throw new HttpError(404, 'Auditor invitation not found.');
  if (row.accepted_at !== null)
    throw new HttpError(
      409,
      'The invitation was accepted. Manage the auditor membership instead.',
    );
  if (row.revoked_at !== null) return;
  const now = new Date().toISOString(),
    gate = ownerCondition(owner);
  await accessBatch(
    env,
    owner.businessAccountId,
    `${gate.sql} AND EXISTS (SELECT 1 FROM invitations WHERE id=? AND business_account_id=? AND role='AUDITOR' AND access_revision=? AND accepted_at IS NULL AND revoked_at IS NULL)`,
    [...gate.values, id, owner.businessAccountId, revision],
    [
      env.DB.prepare(
        "UPDATE invitations SET revoked_at=?,access_revision=access_revision+1 WHERE id=? AND business_account_id=? AND role='AUDITOR'",
      ).bind(now, id, owner.businessAccountId),
      accessAudit(
        env,
        owner,
        'AUDITOR_INVITATION_REVOKED',
        'INVITATION',
        id,
        'Pending auditor invitation revoked.',
        { revokedAt: now },
        now,
      ),
    ],
  );
}
