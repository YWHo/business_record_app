import type { CreateLegalEntityInput, LegalEntity } from '../domain/business';

interface LegalEntityRow {
  id: string;
  business_account_id: string;
  entity_type: LegalEntity['entityType'];
  legal_name: string | null;
  trading_name: string | null;
  nzbn: string | null;
  company_number: string | null;
  country: string;
  active: number;
  attribution_review_required: number;
  created_at: string;
  updated_at: string;
}

const legalEntityColumns = `
  id, business_account_id, entity_type, legal_name, trading_name, nzbn,
  company_number, country, active, attribution_review_required, created_at,
  updated_at
`;

function toLegalEntity(row: LegalEntityRow): LegalEntity {
  return {
    id: row.id,
    businessAccountId: row.business_account_id,
    entityType: row.entity_type,
    legalName: row.legal_name,
    tradingName: row.trading_name,
    nzbn: row.nzbn,
    companyNumber: row.company_number,
    country: row.country,
    status: row.active === 1 ? 'ACTIVE' : 'INACTIVE',
    attributionReviewRequired: row.attribution_review_required === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLegalEntities(
  db: D1Database,
  businessAccountId: string,
): Promise<LegalEntity[]> {
  const result = await db
    .prepare(
      `SELECT ${legalEntityColumns}
       FROM business_entities
       WHERE business_account_id = ?
       ORDER BY COALESCE(legal_name, trading_name, id) COLLATE NOCASE, id
       LIMIT 100`,
    )
    .bind(businessAccountId)
    .all<LegalEntityRow>();
  return result.results.map(toLegalEntity);
}

export async function findLegalEntityById(
  db: D1Database,
  businessAccountId: string,
  legalEntityId: string,
): Promise<LegalEntity | null> {
  const row = await db
    .prepare(
      `SELECT ${legalEntityColumns}
       FROM business_entities
       WHERE business_account_id = ? AND id = ?`,
    )
    .bind(businessAccountId, legalEntityId)
    .first<LegalEntityRow>();
  return row ? toLegalEntity(row) : null;
}

export async function createLegalEntity(
  db: D1Database,
  input: CreateLegalEntityInput,
): Promise<LegalEntity> {
  await db
    .prepare(
      `INSERT INTO business_entities (
         id, business_account_id, entity_type, legal_name, trading_name, nzbn,
         company_number, country, active, attribution_review_required,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.businessAccountId,
      input.entityType,
      input.legalName,
      input.tradingName,
      input.nzbn,
      input.companyNumber,
      input.country,
      input.status === 'ACTIVE' ? 1 : 0,
      input.attributionReviewRequired ? 1 : 0,
      input.createdAt,
      input.updatedAt,
    )
    .run();
  return input;
}
