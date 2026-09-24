import type {
  Business,
  BusinessOverview,
  CreateBusinessInput,
  LegalEntity,
} from '../domain/business';

interface BusinessRow {
  id: string;
  business_account_id: string;
  name: string;
  description: string | null;
  business_type: string | null;
  default_currency: string;
  status: Business['status'];
  legacy_business_activity_id: string | null;
  created_at: string;
  updated_at: string;
}

interface BusinessOverviewRow extends BusinessRow {
  current_entity_id: string | null;
  current_entity_type: LegalEntity['entityType'] | null;
  current_entity_legal_name: string | null;
  current_entity_trading_name: string | null;
  current_entity_active: number | null;
  current_entity_review_required: number | null;
  expense_record_count: number;
  income_record_count: number;
  work_session_record_count: number;
  expense_updated_at: string | null;
  income_updated_at: string | null;
  work_session_updated_at: string | null;
}

const businessColumns = `
  id, business_account_id, name, description, business_type,
  default_currency, status, legacy_business_activity_id, created_at, updated_at
`;

function toBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    name: row.name,
    description: row.description,
    businessType: row.business_type,
    defaultCurrency: row.default_currency,
    status: row.status,
    legacyBusinessActivityId: row.legacy_business_activity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBusinesses(
  db: D1Database,
  businessAccountId: string,
): Promise<Business[]> {
  const result = await db
    .prepare(
      `SELECT ${businessColumns}
       FROM businesses
       WHERE business_account_id = ?
       ORDER BY name COLLATE NOCASE, id
       LIMIT 100`,
    )
    .bind(businessAccountId)
    .all<BusinessRow>();
  return result.results.map(toBusiness);
}

export async function listBusinessOverviews(
  db: D1Database,
  businessAccountId: string,
): Promise<BusinessOverview[]> {
  const result = await db
    .prepare(
      `SELECT businesses.id, businesses.business_account_id, businesses.name,
              businesses.description, businesses.business_type,
              businesses.default_currency, businesses.status,
              businesses.legacy_business_activity_id,
              businesses.created_at, businesses.updated_at,
              business_entities.id AS current_entity_id,
              business_entities.entity_type AS current_entity_type,
              business_entities.legal_name AS current_entity_legal_name,
              business_entities.trading_name AS current_entity_trading_name,
              business_entities.active AS current_entity_active,
              business_entities.attribution_review_required AS current_entity_review_required,
              (SELECT COUNT(*) FROM expenses
                WHERE expenses.business_account_id = businesses.business_account_id
                  AND expenses.business_id = businesses.id
                  AND expenses.purged_at IS NULL) AS expense_record_count,
              (SELECT COUNT(*) FROM income_records
                WHERE income_records.business_account_id = businesses.business_account_id
                  AND income_records.business_id = businesses.id
                  AND income_records.purged_at IS NULL) AS income_record_count,
              (SELECT COUNT(*) FROM work_sessions
                WHERE work_sessions.business_account_id = businesses.business_account_id
                  AND work_sessions.business_id = businesses.id
                  AND work_sessions.purged_at IS NULL) AS work_session_record_count,
              (SELECT MAX(expenses.updated_at) FROM expenses
                WHERE expenses.business_account_id = businesses.business_account_id
                  AND expenses.business_id = businesses.id
                  AND expenses.purged_at IS NULL) AS expense_updated_at,
              (SELECT MAX(income_records.updated_at) FROM income_records
                WHERE income_records.business_account_id = businesses.business_account_id
                  AND income_records.business_id = businesses.id
                  AND income_records.purged_at IS NULL) AS income_updated_at,
              (SELECT MAX(work_sessions.updated_at) FROM work_sessions
                WHERE work_sessions.business_account_id = businesses.business_account_id
                  AND work_sessions.business_id = businesses.id
                  AND work_sessions.purged_at IS NULL) AS work_session_updated_at
         FROM businesses
         LEFT JOIN business_entity_periods
           ON business_entity_periods.business_account_id = businesses.business_account_id
          AND business_entity_periods.business_id = businesses.id
          AND business_entity_periods.effective_to IS NULL
         LEFT JOIN business_entities
           ON business_entities.business_account_id = businesses.business_account_id
          AND business_entities.id = business_entity_periods.legal_entity_id
        WHERE businesses.business_account_id = ?
        ORDER BY businesses.name COLLATE NOCASE, businesses.id
        LIMIT 100`,
    )
    .bind(businessAccountId)
    .all<BusinessOverviewRow>();
  return result.results.map((row) => {
    const updatedDates = [
      row.expense_updated_at,
      row.income_updated_at,
      row.work_session_updated_at,
    ].filter((value): value is string => value !== null);
    return {
      ...toBusiness(row),
      currentLegalEntity:
        row.current_entity_id && row.current_entity_type
          ? {
              id: row.current_entity_id,
              entityType: row.current_entity_type,
              legalName: row.current_entity_legal_name,
              tradingName: row.current_entity_trading_name,
              status: row.current_entity_active === 1 ? 'ACTIVE' : 'INACTIVE',
              attributionReviewRequired:
                row.current_entity_review_required === 1,
            }
          : null,
      recordCount:
        Number(row.expense_record_count) +
        Number(row.income_record_count) +
        Number(row.work_session_record_count),
      lastRecordUpdatedAt: updatedDates.sort().at(-1) ?? null,
    };
  });
}

export async function findBusinessById(
  db: D1Database,
  businessAccountId: string,
  businessId: string,
): Promise<Business | null> {
  const row = await db
    .prepare(
      `SELECT ${businessColumns}
       FROM businesses
       WHERE business_account_id = ? AND id = ?`,
    )
    .bind(businessAccountId, businessId)
    .first<BusinessRow>();
  return row ? toBusiness(row) : null;
}

export async function createBusiness(
  db: D1Database,
  input: CreateBusinessInput,
): Promise<Business> {
  await db
    .prepare(
      `INSERT INTO businesses (
         id, business_account_id, name, description, business_type,
         default_currency, status, legacy_business_activity_id, created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.businessAccountId,
      input.name,
      input.description,
      input.businessType,
      input.defaultCurrency,
      input.status,
      input.legacyBusinessActivityId,
      input.createdAt,
      input.updatedAt,
    )
    .run();
  return input;
}
