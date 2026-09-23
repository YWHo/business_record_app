import type {
  BusinessEntityPeriod,
  CreateBusinessEntityPeriodInput,
} from '../domain/business';

interface BusinessEntityPeriodRow {
  id: string;
  business_account_id: string;
  business_id: string;
  legal_entity_id: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  created_by: string;
  notes: string | null;
}

const periodColumns = `
  id, business_account_id, business_id, legal_entity_id, effective_from,
  effective_to, created_at, created_by, notes
`;

function toBusinessEntityPeriod(
  row: BusinessEntityPeriodRow,
): BusinessEntityPeriod {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    businessId: row.business_id,
    legalEntityId: row.legal_entity_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
    createdBy: row.created_by,
    notes: row.notes,
  };
}

export async function listBusinessEntityPeriods(
  db: D1Database,
  businessAccountId: string,
  businessId: string,
): Promise<BusinessEntityPeriod[]> {
  const result = await db
    .prepare(
      `SELECT ${periodColumns}
       FROM business_entity_periods
       WHERE business_account_id = ? AND business_id = ?
       ORDER BY effective_from DESC, id DESC`,
    )
    .bind(businessAccountId, businessId)
    .all<BusinessEntityPeriodRow>();
  return result.results.map(toBusinessEntityPeriod);
}

export async function findBusinessEntityPeriodForDate(
  db: D1Database,
  businessAccountId: string,
  businessId: string,
  effectiveDate: string,
): Promise<BusinessEntityPeriod | null> {
  const row = await db
    .prepare(
      `SELECT ${periodColumns}
       FROM business_entity_periods
       WHERE business_account_id = ?
         AND business_id = ?
         AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC
       LIMIT 1`,
    )
    .bind(businessAccountId, businessId, effectiveDate, effectiveDate)
    .first<BusinessEntityPeriodRow>();
  return row ? toBusinessEntityPeriod(row) : null;
}

export async function createBusinessEntityPeriod(
  db: D1Database,
  input: CreateBusinessEntityPeriodInput,
): Promise<BusinessEntityPeriod> {
  await db
    .prepare(
      `INSERT INTO business_entity_periods (
         id, business_account_id, business_id, legal_entity_id, effective_from,
         effective_to, created_at, created_by, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.businessAccountId,
      input.businessId,
      input.legalEntityId,
      input.effectiveFrom,
      input.effectiveTo,
      input.createdAt,
      input.createdBy,
      input.notes,
    )
    .run();
  return input;
}
