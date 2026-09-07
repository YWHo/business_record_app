import type { AuthenticatedUser, Env } from '../types';

export async function writeAudit(
  env: Env,
  actor: Pick<AuthenticatedUser, 'id'>,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_log
      (id, user_id, action, entity_type, entity_id, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      entityType,
      entityId,
      summary,
      new Date().toISOString(),
    )
    .run();
}
