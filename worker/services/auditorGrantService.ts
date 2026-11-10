import type { AuditorGrant, AuditorScope } from '../../src/lib/auditorAccess';
import { HttpError } from '../lib/http';
import { maximumAccessScopes } from './accessControlService';
import { effectiveBusinessDate } from './businessContextService';
import { parseInstant } from './fuelService';

function optionalDate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new HttpError(400, 'Scope dates must use YYYY-MM-DD.');
  return effectiveBusinessDate(value, 'Scope date');
}
function targetId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > 100
  )
    throw new HttpError(400, 'Scope target is invalid.');
  return value.trim();
}
export async function auditorGrantValues(
  db: D1Database,
  accountId: string,
  input: Record<string, unknown>,
  now: Date = new Date(),
): Promise<AuditorGrant> {
  if (input.role !== undefined && input.role !== 'AUDITOR')
    throw new HttpError(400, 'This workflow grants auditor access only.');
  const accessStartsAt =
    input.accessStartsAt === null ||
    input.accessStartsAt === undefined ||
    input.accessStartsAt === ''
      ? null
      : parseInstant(input.accessStartsAt, 'Access starts');
  const accessExpiresAt = parseInstant(input.accessExpiresAt, 'Access expires');
  if (accessExpiresAt <= now.toISOString())
    throw new HttpError(
      400,
      'Access expiry must be in the future. Use Expire access to end access immediately.',
    );
  if (accessStartsAt !== null && accessStartsAt >= accessExpiresAt)
    throw new HttpError(400, 'Access expiry must follow its start.');
  const note =
    input.note === null || input.note === undefined || input.note === ''
      ? null
      : input.note;
  if (note !== null && (typeof note !== 'string' || note.trim().length > 2000))
    throw new HttpError(400, 'Notes must contain at most 2000 characters.');
  if (
    !Array.isArray(input.scopes) ||
    input.scopes.length < 1 ||
    input.scopes.length > maximumAccessScopes
  )
    throw new HttpError(
      400,
      `Choose between one and ${maximumAccessScopes} scopes.`,
    );
  const scopes: AuditorScope[] = [];
  const seen = new Set<string>();
  for (const raw of input.scopes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new HttpError(400, 'Scope is invalid.');
    const row = raw as Record<string, unknown>;
    const scopeType = row.scopeType;
    const businessId = targetId(row.businessId),
      legalEntityId = targetId(row.legalEntityId);
    if (!(
      (scopeType === 'ACCOUNT' &&
        businessId === null &&
        legalEntityId === null) ||
      (scopeType === 'BUSINESS' &&
        businessId !== null &&
        legalEntityId === null) ||
      (scopeType === 'LEGAL_ENTITY' &&
        businessId === null &&
        legalEntityId !== null)
    ))
      throw new HttpError(400, 'Choose a valid scope and its matching target.');
    const dateFrom = optionalDate(row.dateFrom),
      dateTo = optionalDate(row.dateTo);
    if (dateFrom !== null && dateTo !== null && dateFrom > dateTo)
      throw new HttpError(400, 'Scope end must not precede its start.');
    const scope: AuditorScope = {
      scopeType,
      businessId,
      legalEntityId,
      dateFrom,
      dateTo,
    };
    const key = JSON.stringify(scope);
    if (seen.has(key))
      throw new HttpError(400, 'Duplicate scopes are not allowed.');
    seen.add(key);
    if (scopeType !== 'ACCOUNT') {
      const found = await db
        .prepare(
          `SELECT id FROM ${scopeType === 'BUSINESS' ? 'businesses' : 'business_entities'} WHERE id=? AND business_account_id=?`,
        )
        .bind(businessId ?? legalEntityId, accountId)
        .first();
      if (!found)
        throw new HttpError(
          400,
          'The selected scope target is unavailable in this account.',
        );
    }
    scopes.push(scope);
  }
  return {
    accessStartsAt,
    accessExpiresAt,
    scopes,
    note: typeof note === 'string' && note.trim() ? note.trim() : null,
  };
}
