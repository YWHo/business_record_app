import {
  hasPermission as roleHasPermission,
  type Permission,
  type PermissionRole,
} from '../../src/lib/permissions';
import { HttpError } from '../lib/http';
import type { AuthenticatedUser } from '../types';
import { effectiveBusinessDate } from './businessContextService';

// Bounded grants also keep generated record predicates within D1 bind limits.
export const maximumAccessScopes = 16;

export interface AccessWindow {
  readonly accessStartsAt: string | null;
  readonly accessExpiresAt: string | null;
}

export interface AccessScope {
  readonly businessAccountId: string;
  readonly userId: string;
  readonly scopeType: 'ACCOUNT' | 'BUSINESS' | 'LEGAL_ENTITY';
  readonly businessId: string | null;
  readonly legalEntityId: string | null;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
}

export interface AuthorizationContext extends AccessWindow {
  readonly userId: string;
  readonly businessAccountId: string;
  readonly role: PermissionRole;
  readonly membershipStatus: string;
  readonly userStatus: string;
  readonly accountStatus: string;
  readonly scopes: readonly AccessScope[];
}

export interface ScopedRecord {
  readonly businessAccountId: string;
  readonly businessId: string | null;
  readonly legalEntityId: string | null;
  /** Persisted effective calendar date or source instant, never the current entity. */
  readonly effectiveDate: string;
}

function validInstant(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function validDate(value: string): boolean {
  try {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      effectiveBusinessDate(value) === value
    );
  } catch {
    return false;
  }
}

export function isAccessWindowActive(
  window: AccessWindow,
  now: Date = new Date(),
): boolean {
  const time = now.getTime();
  const start = window.accessStartsAt;
  const end = window.accessExpiresAt;
  if (!Number.isFinite(time)) return false;
  if (start !== null && !validInstant(start)) return false;
  if (end !== null && !validInstant(end)) return false;
  if (start !== null && end !== null && start >= end) return false;
  return (
    (start === null || time >= Date.parse(start)) &&
    (end === null || time < Date.parse(end))
  );
}

function validScope(
  scope: AccessScope,
  context: Pick<AuthorizationContext, 'userId' | 'businessAccountId'>,
): boolean {
  if (
    scope.businessAccountId !== context.businessAccountId ||
    scope.userId !== context.userId
  )
    return false;
  const shape =
    (scope.scopeType === 'ACCOUNT' &&
      scope.businessId === null &&
      scope.legalEntityId === null) ||
    (scope.scopeType === 'BUSINESS' &&
      typeof scope.businessId === 'string' &&
      scope.businessId.length > 0 &&
      scope.legalEntityId === null) ||
    (scope.scopeType === 'LEGAL_ENTITY' &&
      scope.businessId === null &&
      typeof scope.legalEntityId === 'string' &&
      scope.legalEntityId.length > 0);
  return (
    shape &&
    (scope.dateFrom === null || validDate(scope.dateFrom)) &&
    (scope.dateTo === null || validDate(scope.dateTo)) &&
    (scope.dateFrom === null ||
      scope.dateTo === null ||
      scope.dateFrom <= scope.dateTo)
  );
}

export function hasPermission(
  context: AuthorizationContext | null | undefined,
  permission: Permission,
  now: Date = new Date(),
): boolean {
  return (
    !!context &&
    context.userId.length > 0 &&
    context.businessAccountId.length > 0 &&
    context.userStatus === 'ACTIVE' &&
    context.accountStatus === 'ACTIVE' &&
    context.membershipStatus === 'ACTIVE' &&
    isAccessWindowActive(context, now) &&
    (context.role !== 'AUDITOR' || context.accessExpiresAt !== null) &&
    context.scopes.length > 0 &&
    context.scopes.length <= maximumAccessScopes &&
    context.scopes.every((scope) => validScope(scope, context)) &&
    roleHasPermission(context, permission)
  );
}

export function assertPermission(
  context: AuthorizationContext | null | undefined,
  permission: Permission,
  now: Date = new Date(),
): asserts context is AuthorizationContext {
  if (!hasPermission(context, permission, now)) {
    throw new HttpError(
      403,
      'You do not have permission to perform this action.',
    );
  }
}

/** Call once per protected request after session authentication. Never cache across requests. */
export async function loadAuthorizationContext(
  db: D1Database,
  actor: Pick<AuthenticatedUser, 'id' | 'businessAccountId'>,
  now: Date = new Date(),
): Promise<AuthorizationContext> {
  const member = await db
    .prepare(
      `SELECT m.user_id AS userId,
    m.business_account_id AS businessAccountId, m.role,
    m.status AS membershipStatus, u.status AS userStatus, a.status AS accountStatus,
    m.access_starts_at AS accessStartsAt, m.access_expires_at AS accessExpiresAt
    FROM business_account_members m JOIN users u ON u.id=m.user_id
    JOIN business_accounts a ON a.id=m.business_account_id
    WHERE m.user_id=? AND m.business_account_id=?`,
    )
    .bind(actor.id, actor.businessAccountId)
    .first<Omit<AuthorizationContext, 'scopes'>>();
  if (
    !member ||
    member.userId !== actor.id ||
    member.businessAccountId !== actor.businessAccountId
  ) {
    throw new HttpError(403, 'Access is unavailable.');
  }
  const result = await db
    .prepare(
      `SELECT business_account_id AS businessAccountId,
    user_id AS userId, scope_type AS scopeType, business_id AS businessId,
    legal_entity_id AS legalEntityId, date_from AS dateFrom, date_to AS dateTo
    FROM membership_access_scopes WHERE business_account_id=? AND user_id=?
    ORDER BY id LIMIT ?`,
    )
    .bind(actor.businessAccountId, actor.id, maximumAccessScopes + 1)
    .all<AccessScope>();
  const context = Object.freeze({
    ...member,
    scopes: Object.freeze(result.results.map((scope) => Object.freeze(scope))),
  });
  assertPermission(context, 'RECORD_VIEW', now);
  return context;
}

export function canAccessRecord(
  context: AuthorizationContext,
  record: ScopedRecord,
  now: Date = new Date(),
): boolean {
  if (
    !hasPermission(context, 'RECORD_VIEW', now) ||
    record.businessAccountId !== context.businessAccountId
  )
    return false;
  let date: string;
  try {
    date = effectiveBusinessDate(record.effectiveDate);
  } catch {
    return false;
  }
  return context.scopes.some(
    (scope) =>
      (scope.scopeType === 'ACCOUNT' ||
        (scope.scopeType === 'BUSINESS' &&
          scope.businessId === record.businessId) ||
        (scope.scopeType === 'LEGAL_ENTITY' &&
          scope.legalEntityId === record.legalEntityId)) &&
      (scope.dateFrom === null || date >= scope.dateFrom) &&
      (scope.dateTo === null || date <= scope.dateTo),
  );
}

export function assertRecordAccess(
  context: AuthorizationContext,
  record: ScopedRecord,
  now: Date = new Date(),
): void {
  if (!canAccessRecord(context, record, now))
    throw new HttpError(404, 'Record not found.');
}

// A directory match exposes only minimal identity. It does not authorize every
// record/period/aggregate belonging to that business or entity.
async function canAccessDirectoryEntry(
  db: D1Database,
  context: AuthorizationContext,
  kind: 'BUSINESS' | 'LEGAL_ENTITY',
  id: string,
  now: Date,
): Promise<boolean> {
  if (!id || !hasPermission(context, 'RECORD_VIEW', now)) return false;
  const table = kind === 'BUSINESS' ? 'businesses' : 'business_entities';
  const bindings: (string | null)[] = [id, context.businessAccountId];
  const grants = context.scopes.map((scope) => {
    if (scope.scopeType === 'ACCOUNT') return '1=1';
    if (scope.scopeType === kind) {
      bindings.push(
        kind === 'BUSINESS' ? scope.businessId : scope.legalEntityId,
      );
      return 'target.id=?';
    }
    const clauses = ['p.business_account_id=target.business_account_id'];
    clauses.push(
      kind === 'BUSINESS'
        ? 'p.business_id=target.id AND p.legal_entity_id=?'
        : 'p.legal_entity_id=target.id AND p.business_id=?',
    );
    bindings.push(kind === 'BUSINESS' ? scope.legalEntityId : scope.businessId);
    if (scope.dateFrom !== null) {
      clauses.push('(p.effective_to IS NULL OR p.effective_to>=?)');
      bindings.push(scope.dateFrom);
    }
    if (scope.dateTo !== null) {
      clauses.push('p.effective_from<=?');
      bindings.push(scope.dateTo);
    }
    return `EXISTS (SELECT 1 FROM business_entity_periods p WHERE ${clauses.join(' AND ')})`;
  });
  return !!(await db
    .prepare(
      `SELECT target.id FROM ${table} target
    WHERE target.id=? AND target.business_account_id=? AND (${grants.join(' OR ')})`,
    )
    .bind(...bindings)
    .first());
}

export function canAccessBusiness(
  db: D1Database,
  context: AuthorizationContext,
  businessId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return canAccessDirectoryEntry(db, context, 'BUSINESS', businessId, now);
}

export function canAccessLegalEntity(
  db: D1Database,
  context: AuthorizationContext,
  legalEntityId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return canAccessDirectoryEntry(
    db,
    context,
    'LEGAL_ENTITY',
    legalEntityId,
    now,
  );
}

/** Convert an accounting calendar boundary into an Auckland midnight instant. */
function businessMidnight(date: string): string {
  const desired = Date.parse(`${date}T00:00:00.000Z`);
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(candidate));
    const part = (type: string) =>
      parts.find((value) => value.type === type)?.value;
    const local = Date.parse(
      `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`,
    );
    if (local === desired) return new Date(candidate).toISOString();
    candidate += desired - local;
  }
  throw new HttpError(403, 'Access date is unavailable.');
}

export type RecordFamily = 'EXPENSE' | 'INCOME' | 'WORK_SESSION';

export function businessDateBounds(
  from: string | null,
  to: string | null,
): { fromInstant: string | null; toInstant: string | null } {
  if ((from !== null && !validDate(from)) || (to !== null && !validDate(to)))
    throw new HttpError(400, 'Report dates are invalid.');
  let toInstant: string | null = null;
  if (to !== null) {
    const next = new Date(`${to}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    toInstant = businessMidnight(next.toISOString().slice(0, 10));
  }
  return {
    fromInstant: from === null ? null : businessMidnight(from),
    toInstant,
  };
}

/** One JSON bind supports reuse across several scoped CTEs within D1's bind cap. */
export function authorizationScopeJson(context: AuthorizationContext): string {
  assertPermission(context, 'RECORD_VIEW');
  return JSON.stringify(
    context.scopes.map((scope) => {
      const bounds = businessDateBounds(scope.dateFrom, scope.dateTo);
      return {
        ...scope,
        instantFrom: bounds.fromInstant,
        instantTo: bounds.toInstant,
      };
    }),
  );
}

/** Bind this predicate before COUNT, aggregation, pagination, or returning rows.
 * The caller supplies a trusted SQL alias, and must retain existing tenant and
 * lifecycle conditions. Attachments/comments inherit their parent's predicate.
 */
export function recordAccessPredicate(
  context: AuthorizationContext,
  family: RecordFamily,
  alias: string,
  now: Date = new Date(),
): { sql: string; bindings: (string | number | null)[] } {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias))
    throw new Error('Invalid record alias.');
  if (!hasPermission(context, 'RECORD_VIEW', now))
    return { sql: '0=1', bindings: [] };
  const columns: Record<RecordFamily, string> = {
    EXPENSE: 'purchase_datetime',
    INCOME: 'transaction_date',
    WORK_SESSION: 'started_at',
  };
  if (!Object.hasOwn(columns, family))
    throw new Error('Invalid record family.');
  const bindings: (string | number | null)[] = [context.businessAccountId];
  const date = `${alias}.${columns[family]}`;
  const grants = context.scopes.map((scope) => {
    const clauses: string[] = [];
    if (scope.scopeType !== 'ACCOUNT') {
      clauses.push(
        `${alias}.${scope.scopeType === 'BUSINESS' ? 'business_id' : 'legal_entity_id'}=?`,
      );
      bindings.push(
        scope.scopeType === 'BUSINESS' ? scope.businessId : scope.legalEntityId,
      );
    }
    // Invalid/missing source dates must not match even an unbounded grant.
    clauses.push(
      family === 'INCOME'
        ? `date(${date},'+0 days')=${date}`
        : `(julianday(${date}) IS NOT NULL AND date(substr(${date},1,10),'+0 days')=substr(${date},1,10))`,
    );
    if (scope.dateFrom !== null) {
      clauses.push(
        family === 'INCOME' ? `${date}>=?` : `julianday(${date})>=julianday(?)`,
      );
      bindings.push(
        family === 'INCOME' ? scope.dateFrom : businessMidnight(scope.dateFrom),
      );
    }
    if (scope.dateTo !== null) {
      if (family === 'INCOME') {
        clauses.push(`${date}<=?`);
        bindings.push(scope.dateTo);
      } else {
        const next = new Date(`${scope.dateTo}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        clauses.push(`julianday(${date})<julianday(?)`);
        bindings.push(businessMidnight(next.toISOString().slice(0, 10)));
      }
    }
    return `(${clauses.join(' AND ')})`;
  });
  return {
    sql: `(${alias}.business_account_id=? AND (${grants.join(' OR ')}))`,
    bindings,
  };
}
