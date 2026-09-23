import { describe, expect, it, vi } from 'vitest';
import { findBusinessById, listBusinesses } from './businessRepository';
import { findBusinessEntityPeriodForDate } from './businessEntityPeriodRepository';
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
});
