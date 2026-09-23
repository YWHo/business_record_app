import type {
  Business,
  BusinessEntityPeriod,
  LegalEntity,
} from '../domain/business';
import { HttpError } from '../lib/http';
import { findBusinessById } from '../repositories/businessRepository';
import {
  listBusinessEntityPeriods,
  listBusinessEntityPeriodsForDate,
} from '../repositories/businessEntityPeriodRepository';
import { findLegalEntityById } from '../repositories/legalEntityRepository';
import type { AuthenticatedUser } from '../types';

type BusinessActor = Pick<AuthenticatedUser, 'businessAccountId'>;

export type BusinessScopedRecordTable =
  'expenses' | 'income_records' | 'work_sessions' | 'attachments' | 'comments';

export type BusinessScopedReferenceTable =
  'vehicles' | 'expense_categories' | 'clients';

const businessScopedRecordTables: Record<BusinessScopedRecordTable, string> = {
  expenses: 'expenses',
  income_records: 'income_records',
  work_sessions: 'work_sessions',
  attachments: 'attachments',
  comments: 'comments',
};

const businessScopedReferenceTables: Record<
  BusinessScopedReferenceTable,
  string
> = {
  vehicles: 'vehicles',
  expense_categories: 'expense_categories',
  clients: 'clients',
};

export interface BusinessAccessOptions {
  forWrite?: boolean;
}

export interface ResolvedBusinessAttribution {
  business: Business;
  period: BusinessEntityPeriod;
  legalEntity: LegalEntity;
  effectiveDate: string;
}

export const legalEntityChangeWarningCode =
  'LEGAL_ENTITY_CHANGED_BY_EFFECTIVE_DATE' as const;

export interface LegalEntityChangeWarning {
  code: typeof legalEntityChangeWarningCode;
  message: string;
  previousLegalEntityId: string;
  resolvedLegalEntityId: string;
  effectiveDate: string;
}

export interface LegalEntityChangePlan {
  currentPeriod: BusinessEntityPeriod;
  closeCurrentOn: string;
  nextLegalEntityId: string;
  nextEffectiveFrom: string;
}

function calendarDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${label} must be a valid calendar date.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new HttpError(400, `${label} must be a valid calendar date.`);
  }
  return value;
}

export function effectiveBusinessDate(
  value: unknown,
  label = 'Effective date',
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${label} must be a valid date.`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return calendarDate(value, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new HttpError(
      400,
      `${label} must be a valid date or timezone-qualified date and time.`,
    );
  }
  calendarDate(value.slice(0, 10), label);
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: 'year' | 'month' | 'day') =>
    parts.find((candidate) => candidate.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function requiredId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return normalized;
}

export async function requireBusinessAccess(
  db: D1Database,
  actor: BusinessActor,
  businessId: string,
  options: BusinessAccessOptions = {},
): Promise<Business> {
  const id = requiredId(businessId, 'Business');
  const business = await findBusinessById(db, actor.businessAccountId, id);
  if (!business) throw new HttpError(404, 'Business not found.');
  if (options.forWrite && business.status !== 'ACTIVE') {
    throw new HttpError(
      409,
      'This business is inactive and cannot be changed.',
    );
  }
  return business;
}

export async function requireBusinessScopedRecord(
  db: D1Database,
  actor: BusinessActor,
  table: BusinessScopedRecordTable,
  businessId: string,
  recordId: string,
): Promise<void> {
  const business = requiredId(businessId, 'Business');
  const record = requiredId(recordId, 'Record');
  const row = await db
    .prepare(
      `SELECT id FROM ${businessScopedRecordTables[table]}
       WHERE business_account_id = ? AND business_id = ? AND id = ?`,
    )
    .bind(actor.businessAccountId, business, record)
    .first();
  if (!row) throw new HttpError(404, 'Record not found.');
}

export async function requireBusinessScopedReference(
  db: D1Database,
  actor: BusinessActor,
  table: BusinessScopedReferenceTable,
  businessId: string,
  referenceId: string,
): Promise<void> {
  const business = requiredId(businessId, 'Business');
  const reference = requiredId(referenceId, 'Reference');
  const row = await db
    .prepare(
      `SELECT id FROM ${businessScopedReferenceTables[table]}
       WHERE business_account_id = ?
         AND id = ?
         AND (business_id = ? OR business_id IS NULL)`,
    )
    .bind(actor.businessAccountId, reference, business)
    .first();
  if (!row) throw new HttpError(404, 'Reference not found.');
}

export async function resolveLegalEntityForBusinessDate(
  db: D1Database,
  actor: BusinessActor,
  businessId: string,
  rawEffectiveDate: unknown,
  options: BusinessAccessOptions = {},
): Promise<ResolvedBusinessAttribution> {
  const effectiveDate = effectiveBusinessDate(rawEffectiveDate);
  const business = await requireBusinessAccess(db, actor, businessId, options);
  const periods = await listBusinessEntityPeriodsForDate(
    db,
    actor.businessAccountId,
    business.id,
    effectiveDate,
  );
  if (periods.length === 0) {
    throw new HttpError(
      409,
      'No legal entity is configured for this business on the effective date.',
    );
  }
  if (periods.length > 1) {
    throw new HttpError(
      409,
      'The legal-entity periods for this business overlap and must be corrected.',
    );
  }
  const period = periods[0];
  const legalEntity = await findLegalEntityById(
    db,
    actor.businessAccountId,
    period.legalEntityId,
  );
  if (!legalEntity) {
    throw new HttpError(
      409,
      'The legal entity for this business period is unavailable.',
    );
  }
  if (options.forWrite && legalEntity.status !== 'ACTIVE') {
    throw new HttpError(
      409,
      'The legal entity for this business period is inactive and cannot receive new records.',
    );
  }
  return { business, period, legalEntity, effectiveDate };
}

export function legalEntityChangeWarning(
  previousLegalEntityId: string | null,
  resolved: ResolvedBusinessAttribution,
): LegalEntityChangeWarning | null {
  if (
    previousLegalEntityId === null ||
    previousLegalEntityId === resolved.legalEntity.id
  ) {
    return null;
  }
  return {
    code: legalEntityChangeWarningCode,
    message:
      'Changing the effective date assigns this record to a different legal entity. Confirm the change before saving.',
    previousLegalEntityId,
    resolvedLegalEntityId: resolved.legalEntity.id,
    effectiveDate: resolved.effectiveDate,
  };
}

export function requiresLegalEntityChangeConfirmation(
  previousLegalEntityId: string | null,
  resolved: ResolvedBusinessAttribution,
  confirmedWarnings: ReadonlySet<string>,
): LegalEntityChangeWarning | null {
  const warning = legalEntityChangeWarning(previousLegalEntityId, resolved);
  return warning && !confirmedWarnings.has(warning.code) ? warning : null;
}

export function validateBusinessEntityPeriods(
  periods: BusinessEntityPeriod[],
  requireCurrent = true,
): BusinessEntityPeriod[] {
  if (periods.length === 0) {
    throw new HttpError(409, 'At least one legal-entity period is required.');
  }
  const accountId = periods[0].businessAccountId;
  const businessId = periods[0].businessId;
  const sorted = [...periods].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
  let openPeriods = 0;
  let previous: BusinessEntityPeriod | null = null;
  for (const period of sorted) {
    if (
      period.businessAccountId !== accountId ||
      period.businessId !== businessId
    ) {
      throw new HttpError(
        409,
        'Operating periods must belong to one business.',
      );
    }
    calendarDate(period.effectiveFrom, 'Period start');
    if (period.effectiveTo !== null) {
      calendarDate(period.effectiveTo, 'Period end');
      if (period.effectiveTo < period.effectiveFrom) {
        throw new HttpError(409, 'A period cannot end before it starts.');
      }
    } else {
      openPeriods += 1;
    }
    if (
      previous &&
      (previous.effectiveTo === null ||
        previous.effectiveTo >= period.effectiveFrom)
    ) {
      throw new HttpError(
        409,
        'Legal-entity operating periods cannot overlap.',
      );
    }
    previous = period;
  }
  if (openPeriods > 1 || (requireCurrent && openPeriods !== 1)) {
    throw new HttpError(
      409,
      'An active business must have exactly one current legal-entity period.',
    );
  }
  return sorted;
}

function previousCalendarDate(value: string): string {
  const [year, month, day] = calendarDate(value, 'Effective date')
    .split('-')
    .map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day));
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

export function planLegalEntityChange(
  periods: BusinessEntityPeriod[],
  nextLegalEntityId: string,
  rawEffectiveFrom: unknown,
): LegalEntityChangePlan {
  const sorted = validateBusinessEntityPeriods(periods);
  const currentPeriod = sorted.find((period) => period.effectiveTo === null)!;
  const effectiveFrom = effectiveBusinessDate(
    rawEffectiveFrom,
    'Effective from',
  );
  const legalEntityId = requiredId(nextLegalEntityId, 'Legal entity');
  if (legalEntityId === currentPeriod.legalEntityId) {
    throw new HttpError(
      400,
      'The new legal entity must differ from the current legal entity.',
    );
  }
  if (effectiveFrom <= currentPeriod.effectiveFrom) {
    throw new HttpError(
      400,
      'The new period must start after the current period begins.',
    );
  }
  return {
    currentPeriod,
    closeCurrentOn: previousCalendarDate(effectiveFrom),
    nextLegalEntityId: legalEntityId,
    nextEffectiveFrom: effectiveFrom,
  };
}

export async function loadAndValidateBusinessEntityPeriods(
  db: D1Database,
  actor: BusinessActor,
  businessId: string,
): Promise<BusinessEntityPeriod[]> {
  const business = await requireBusinessAccess(db, actor, businessId);
  const periods = await listBusinessEntityPeriods(
    db,
    actor.businessAccountId,
    business.id,
  );
  return validateBusinessEntityPeriods(periods, business.status === 'ACTIVE');
}
