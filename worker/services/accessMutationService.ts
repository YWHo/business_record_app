import { HttpError } from '../lib/http';
import type { AuthenticatedUser, Env } from '../types';

export function ownerCondition(
  owner: Pick<AuthenticatedUser, 'id' | 'businessAccountId'>,
): { sql: string; values: string[] } {
  return {
    sql: `EXISTS (SELECT 1 FROM business_account_members m JOIN users u ON u.id=m.user_id
    JOIN business_accounts a ON a.id=m.business_account_id WHERE m.user_id=? AND m.business_account_id=?
    AND m.role='OWNER' AND m.status='ACTIVE' AND u.status='ACTIVE' AND a.status='ACTIVE')`,
    values: [owner.id, owner.businessAccountId],
  };
}

export async function accessBatch(
  env: Env,
  accountId: string,
  condition: string,
  bindings: unknown[],
  statements: D1PreparedStatement[],
  failureStatus = 409,
): Promise<void> {
  const guard = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO access_control_guards (id,business_account_id,valid)
        SELECT ?,?,CASE WHEN (${condition}) THEN 1 ELSE 0 END`,
      ).bind(guard, accountId, ...bindings),
      ...statements,
      env.DB.prepare(
        'DELETE FROM access_control_guards WHERE id=? AND business_account_id=?',
      ).bind(guard, accountId),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('access_control_precondition')
    ) {
      throw new HttpError(
        failureStatus,
        failureStatus === 400
          ? 'Invitation is invalid or expired.'
          : 'Access changed or is unavailable. Reload before trying again.',
      );
    }
    throw error;
  }
}

export function accessAudit(
  env: Env,
  actor: Pick<AuthenticatedUser, 'id' | 'businessAccountId'>,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  evidence: unknown,
  now: string,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO audit_log
    (id,business_account_id,user_id,action,entity_type,entity_id,summary,changed_fields_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(
    crypto.randomUUID(),
    actor.businessAccountId,
    actor.id,
    action,
    entityType,
    entityId,
    summary,
    JSON.stringify(evidence),
    now,
  );
}
