import type { Business, CreateBusinessInput } from '../domain/business';

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
       ORDER BY name COLLATE NOCASE, id`,
    )
    .bind(businessAccountId)
    .all<BusinessRow>();
  return result.results.map(toBusiness);
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
