import { HttpError } from '../lib/http';
import type { AuthenticatedUser, Env } from '../types';

export const PRIMARY_BUSINESS_ACCOUNT_ID = 'business-account-primary';
export const PRIMARY_BUSINESS_ENTITY_ID = 'business-entity-primary';

export async function requireTenantRecord(
  env: Env,
  table: 'business_activities' | 'vehicles' | 'expense_categories' | 'clients',
  id: string,
  actor: Pick<AuthenticatedUser, 'businessAccountId'>,
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT id FROM ${table} WHERE id = ? AND business_account_id = ?`,
  )
    .bind(id, actor.businessAccountId)
    .first();
  if (!row) throw new HttpError(404, 'Record not found.');
}
