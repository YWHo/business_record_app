import type { AuthenticatedUser, Env } from '../types';

export async function writeAudit(
  env: Env,
  actor: Pick<AuthenticatedUser, 'id'>,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  businessActivityId: string | null = null,
  changedFields: Record<string, unknown> | null = null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log
      (id, user_id, action, entity_type, entity_id, business_activity_id, summary, changed_fields_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      entityType,
      entityId,
      businessActivityId,
      summary,
      changedFields ? JSON.stringify(changedFields) : null,
      new Date().toISOString(),
    )
    .run();
}
