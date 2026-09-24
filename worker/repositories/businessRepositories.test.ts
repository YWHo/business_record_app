import { describe, expect, it, vi } from 'vitest';
import {
  findBusinessById,
  listBusinesses,
  listBusinessOverviews,
} from './businessRepository';
import {
  findBusinessEntityPeriodForDate,
  listBusinessEntityPeriodsForDate,
} from './businessEntityPeriodRepository';
import { findLegalEntityById } from './legalEntityRepository';

interface FakeStatement {
  bind: (...values: unknown[]) => FakeStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<D1Result<T>>;
}

function fakeDatabase(result: Record<string, unknown> | null) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const query = { sql, values: [] as unknown[] };
    queries.push(query);
    const statement: FakeStatement = {
      bind(...values: unknown[]) {
        query.values = values;
        return statement;
      },
      first: <T>() => Promise.resolve(result as T | null),
      all: <T>() =>
        Promise.resolve({
          success: true,
          results: result ? [result as T] : [],
          meta: {},
        } as D1Result<T>),
    };
    return statement;
  });
  return { db: { prepare } as unknown as D1Database, queries };
}

const businessRow = {
  id: 'business-1',
  business_account_id: 'account-1',
  name: 'IT Contracting',
  description: 'IT services',
  business_type: 'PROFESSIONAL_SERVICES',
  default_currency: 'NZD',
  status: 'ACTIVE',
  legacy_business_activity_id: 'activity-1',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
};

describe('business repositories', () => {
  it('maps business rows and scopes list reads to the account', async () => {
    const { db, queries } = fakeDatabase(businessRow);

    await expect(listBusinesses(db, 'account-1')).resolves.toEqual([
      {
        id: 'business-1',
        businessAccountId: 'account-1',
        name: 'IT Contracting',
        description: 'IT services',
        businessType: 'PROFESSIONAL_SERVICES',
        defaultCurrency: 'NZD',
        status: 'ACTIVE',
        legacyBusinessActivityId: 'activity-1',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ]);
    expect(queries[0].sql).toContain('WHERE business_account_id = ?');
    expect(queries[0].sql).toContain('LIMIT 100');
    expect(queries[0].values).toEqual(['account-1']);
  });

  it('requires account and business IDs for a single-business read', async () => {
    const { db, queries } = fakeDatabase(null);

    await expect(
      findBusinessById(db, 'account-1', 'business-from-account-2'),
    ).resolves.toBeNull();
    expect(queries[0].sql).toContain(
      'WHERE business_account_id = ? AND id = ?',
    );
    expect(queries[0].values).toEqual(['account-1', 'business-from-account-2']);
  });

  it('maps current entities and retained record summaries for account cards', async () => {
    const { db, queries } = fakeDatabase({
      ...businessRow,
      current_entity_id: 'entity-1',
      current_entity_type: 'LIMITED_COMPANY',
      current_entity_legal_name: 'Example Limited',
      current_entity_trading_name: null,
      current_entity_active: 1,
      current_entity_review_required: 0,
      expense_record_count: 4,
      income_record_count: 3,
      work_session_record_count: 2,
      expense_updated_at: '2026-09-08T00:00:00.000Z',
      income_updated_at: '2026-09-10T00:00:00.000Z',
      work_session_updated_at: '2026-09-09T00:00:00.000Z',
    });

    await expect(listBusinessOverviews(db, 'account-1')).resolves.toMatchObject(
      [
        {
          id: 'business-1',
          recordCount: 9,
          lastRecordUpdatedAt: '2026-09-10T00:00:00.000Z',
          currentLegalEntity: {
            id: 'entity-1',
            legalName: 'Example Limited',
            entityType: 'LIMITED_COMPANY',
            status: 'ACTIVE',
          },
        },
      ],
    );
    expect(queries[0].sql).toContain(
      'WHERE businesses.business_account_id = ?',
    );
    expect(queries[0].sql).toContain(
      'business_entity_periods.effective_to IS NULL',
    );
    expect(queries[0].sql).toContain('expenses.purged_at IS NULL');
    expect(queries[0].values).toEqual(['account-1']);
  });

  it('requires account scope when loading a legal entity', async () => {
    const { db, queries } = fakeDatabase(null);

    await findLegalEntityById(db, 'account-1', 'entity-from-account-2');

    expect(queries[0].sql).toContain(
      'WHERE business_account_id = ? AND id = ?',
    );
    expect(queries[0].values).toEqual(['account-1', 'entity-from-account-2']);
  });

  it('binds both date comparisons inside account and business scope', async () => {
    const { db, queries } = fakeDatabase(null);

    await findBusinessEntityPeriodForDate(
      db,
      'account-1',
      'business-1',
      '2027-04-01',
    );

    expect(queries[0].sql).toContain('business_account_id = ?');
    expect(queries[0].sql).toContain('business_id = ?');
    expect(queries[0].values).toEqual([
      'account-1',
      'business-1',
      '2027-04-01',
      '2027-04-01',
    ]);
  });

  it('caps matching period reads so domain services can detect overlap', async () => {
    const { db, queries } = fakeDatabase(null);

    await listBusinessEntityPeriodsForDate(
      db,
      'account-1',
      'business-1',
      '2027-04-01',
    );

    expect(queries[0].sql).toContain('LIMIT 2');
    expect(queries[0].values).toEqual([
      'account-1',
      'business-1',
      '2027-04-01',
      '2027-04-01',
    ]);
  });

  it('maps an explicit legal-entity attribution review state', async () => {
    const { db } = fakeDatabase({
      id: 'entity-1',
      business_account_id: 'account-1',
      entity_type: 'SOLE_TRADER',
      legal_name: null,
      trading_name: null,
      nzbn: null,
      company_number: null,
      country: 'NZ',
      active: 1,
      attribution_review_required: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    });

    await expect(
      findLegalEntityById(db, 'account-1', 'entity-1'),
    ).resolves.toMatchObject({
      legalName: null,
      status: 'ACTIVE',
      attributionReviewRequired: true,
    });
  });
});
