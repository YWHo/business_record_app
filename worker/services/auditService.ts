import type { AuthenticatedUser, Env } from '../types';

export interface AuditScope {
  businessId?: string | null;
  legalEntityId?: string | null;
}

export async function writeAudit(
  env: Env,
  actor: Pick<AuthenticatedUser, 'id' | 'businessAccountId'>,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  businessActivityId: string | null = null,
  changedFields: Record<string, unknown> | null = null,
  scope: AuditScope = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log
      (id, business_account_id, user_id, action, entity_type, entity_id,
       business_activity_id, business_id, legal_entity_id, summary,
       changed_fields_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      actor.businessAccountId,
      actor.id,
      action,
      entityType,
      entityId,
      businessActivityId,
      scope.businessId ?? null,
      scope.legalEntityId ?? null,
      summary,
      changedFields ? JSON.stringify(changedFields) : null,
      new Date().toISOString(),
    )
    .run();
}
