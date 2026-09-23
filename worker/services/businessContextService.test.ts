import { describe, expect, it } from 'vitest';
import type { BusinessEntityPeriod, LegalEntity } from '../domain/business';
import {
  effectiveBusinessDate,
  legalEntityChangeWarningCode,
  planLegalEntityChange,
  requireBusinessAccess,
  requireBusinessScopedRecord,
  requireBusinessScopedReference,
  requiresLegalEntityChangeConfirmation,
  resolveLegalEntityForBusinessDate,
  validateBusinessEntityPeriods,
} from './businessContextService';

type ScriptedResult =
  | { kind: 'first'; value: Record<string, unknown> | null }
  | { kind: 'all'; value: Record<string, unknown>[] };

function scriptedDatabase(script: ScriptedResult[]) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  let index = 0;
  return {
    db: {
      prepare(sql: string) {
        const query = { sql, values: [] as unknown[] };
        queries.push(query);
        const statement = {
          bind(...values: unknown[]) {
            query.values = values;
            return statement;
          },
          first: <T>() => {
            const result = script[index++];
            if (!result || result.kind !== 'first') {
              throw new Error(`Expected scripted first result for ${sql}`);
            }
            return Promise.resolve(result.value as T | null);
          },
          all: <T>() => {
            const result = script[index++];
            if (!result || result.kind !== 'all') {
              throw new Error(`Expected scripted all result for ${sql}`);
            }
            return Promise.resolve({ results: result.value as T[] });
          },
        };
        return statement;
      },
    } as unknown as D1Database,
    queries,
  };
}

const actor = { businessAccountId: 'account-1' };

const businessRow = {
  id: 'business-1',
  business_account_id: 'account-1',
  name: 'Uber Ride',
  description: 'Ride-hailing',
  business_type: 'PLATFORM_SERVICES',
  default_currency: 'NZD',
  status: 'ACTIVE',
  legacy_business_activity_id: 'activity-1',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
};

const periodRow = {
  id: 'period-2',
  business_account_id: 'account-1',
  business_id: 'business-1',
  legal_entity_id: 'entity-company',
  effective_from: '2027-04-01',
  effective_to: null,
  created_at: '2027-04-01T00:00:00.000Z',
  created_by: 'owner-1',
  notes: null,
};

const legalEntityRow = {
  id: 'entity-company',
  business_account_id: 'account-1',
  entity_type: 'LIMITED_COMPANY',
  legal_name: 'Taxi Limited',
  trading_name: null,
  nzbn: null,
  company_number: null,
  country: 'NZ',
  active: 1,
  attribution_review_required: 0,
  created_at: '2027-04-01T00:00:00.000Z',
  updated_at: '2027-04-01T00:00:00.000Z',
};

function period(
  id: string,
  legalEntityId: string,
  effectiveFrom: string,
  effectiveTo: string | null,
): BusinessEntityPeriod {
  return {
    id,
    businessAccountId: 'account-1',
    businessId: 'business-1',
    legalEntityId,
    effectiveFrom,
    effectiveTo,
    createdAt: `${effectiveFrom}T00:00:00.000Z`,
    createdBy: 'owner-1',
    notes: null,
  };
}

describe('effectiveBusinessDate', () => {
  it('preserves calendar dates and converts instants to the New Zealand date', () => {
    expect(effectiveBusinessDate('2027-04-01')).toBe('2027-04-01');
    expect(effectiveBusinessDate('2027-03-31T11:30:00.000Z')).toBe(
      '2027-04-01',
    );
  });

  it('rejects impossible dates and timezone-free timestamps', () => {
    expect(() => effectiveBusinessDate('2027-02-29')).toThrow(
      'valid calendar date',
    );
    expect(() => effectiveBusinessDate('2027-04-01T10:00')).toThrow(
      'timezone-qualified',
    );
    expect(() =>
      effectiveBusinessDate('2027-02-30T10:00:00.000+13:00'),
    ).toThrow('valid calendar date');
  });
});

describe('business-scoped authorization', () => {
  it('loads a business only inside the actor account', async () => {
    const { db, queries } = scriptedDatabase([
      { kind: 'first', value: businessRow },
    ]);

    await expect(
      requireBusinessAccess(db, actor, 'business-1', { forWrite: true }),
    ).resolves.toMatchObject({ id: 'business-1', status: 'ACTIVE' });
    expect(queries[0].values).toEqual(['account-1', 'business-1']);
  });

  it('hides a business outside the actor account', async () => {
    const { db } = scriptedDatabase([{ kind: 'first', value: null }]);

    await expect(
      requireBusinessAccess(db, actor, 'business-from-account-2'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('blocks writes to an inactive business but permits historical reads', async () => {
    const inactive = { ...businessRow, status: 'INACTIVE' };
    const read = scriptedDatabase([{ kind: 'first', value: inactive }]);
    await expect(
      requireBusinessAccess(read.db, actor, 'business-1'),
    ).resolves.toMatchObject({ status: 'INACTIVE' });

    const write = scriptedDatabase([{ kind: 'first', value: inactive }]);
    await expect(
      requireBusinessAccess(write.db, actor, 'business-1', { forWrite: true }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('binds account, business, and record IDs for record access', async () => {
    const { db, queries } = scriptedDatabase([
      { kind: 'first', value: { id: 'expense-1' } },
    ]);

    await requireBusinessScopedRecord(
      db,
      actor,
      'expenses',
      'business-1',
      'expense-1',
    );

    expect(queries[0].sql).toContain('business_account_id = ?');
    expect(queries[0].sql).toContain('business_id = ?');
    expect(queries[0].values).toEqual(['account-1', 'business-1', 'expense-1']);
  });

  it('accepts a reference assigned to the business or shared by its account', async () => {
    const { db, queries } = scriptedDatabase([
      { kind: 'first', value: { id: 'vehicle-shared' } },
    ]);

    await requireBusinessScopedReference(
      db,
      actor,
      'vehicles',
      'business-1',
      'vehicle-shared',
    );

    expect(queries[0].sql).toContain(
      '(business_id = ? OR business_id IS NULL)',
    );
    expect(queries[0].values).toEqual([
      'account-1',
      'vehicle-shared',
      'business-1',
    ]);
  });
});

describe('legal-entity resolution', () => {
  it('resolves exactly one period and same-account legal entity', async () => {
    const { db, queries } = scriptedDatabase([
      { kind: 'first', value: businessRow },
      { kind: 'all', value: [periodRow] },
      { kind: 'first', value: legalEntityRow },
    ]);

    await expect(
      resolveLegalEntityForBusinessDate(db, actor, 'business-1', '2027-04-10', {
        forWrite: true,
      }),
    ).resolves.toMatchObject({
      effectiveDate: '2027-04-10',
      period: { id: 'period-2' },
      legalEntity: { id: 'entity-company', legalName: 'Taxi Limited' },
    });
    expect(queries[1].values).toEqual([
      'account-1',
      'business-1',
      '2027-04-10',
      '2027-04-10',
    ]);
    expect(queries[2].values).toEqual(['account-1', 'entity-company']);
  });

  it('fails closed for a gap or overlapping periods', async () => {
    const gap = scriptedDatabase([
      { kind: 'first', value: businessRow },
      { kind: 'all', value: [] },
    ]);
    await expect(
      resolveLegalEntityForBusinessDate(
        gap.db,
        actor,
        'business-1',
        '2026-03-31',
      ),
    ).rejects.toMatchObject({ status: 409 });

    const overlap = scriptedDatabase([
      { kind: 'first', value: businessRow },
      { kind: 'all', value: [periodRow, { ...periodRow, id: 'period-3' }] },
    ]);
    await expect(
      resolveLegalEntityForBusinessDate(
        overlap.db,
        actor,
        'business-1',
        '2027-04-10',
      ),
    ).rejects.toThrow('overlap');
  });

  it('blocks new records attributed to an inactive legal entity', async () => {
    const { db } = scriptedDatabase([
      { kind: 'first', value: businessRow },
      { kind: 'all', value: [periodRow] },
      { kind: 'first', value: { ...legalEntityRow, active: 0 } },
    ]);

    await expect(
      resolveLegalEntityForBusinessDate(db, actor, 'business-1', '2027-04-10', {
        forWrite: true,
      }),
    ).rejects.toThrow('inactive');
  });

  it('requires confirmation only when an edit changes legal entity', () => {
    const resolved = {
      business: {
        id: 'business-1',
        businessAccountId: 'account-1',
        name: 'Uber Ride',
        description: null,
        businessType: null,
        defaultCurrency: 'NZD',
        status: 'ACTIVE' as const,
        legacyBusinessActivityId: null,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      period: period('period-2', 'entity-company', '2027-04-01', null),
      legalEntity: {
        id: 'entity-company',
        businessAccountId: 'account-1',
        entityType: 'LIMITED_COMPANY' as const,
        legalName: 'Taxi Limited',
        tradingName: null,
        nzbn: null,
        companyNumber: null,
        country: 'NZ',
        status: 'ACTIVE' as const,
        attributionReviewRequired: false,
        createdAt: '2027-04-01T00:00:00.000Z',
        updatedAt: '2027-04-01T00:00:00.000Z',
      } satisfies LegalEntity,
      effectiveDate: '2027-04-10',
    };

    expect(
      requiresLegalEntityChangeConfirmation(
        'entity-person',
        resolved,
        new Set(),
      ),
    ).toMatchObject({
      code: legalEntityChangeWarningCode,
      previousLegalEntityId: 'entity-person',
      resolvedLegalEntityId: 'entity-company',
    });
    expect(
      requiresLegalEntityChangeConfirmation(
        'entity-person',
        resolved,
        new Set([legalEntityChangeWarningCode]),
      ),
    ).toBeNull();
    expect(
      requiresLegalEntityChangeConfirmation(
        'entity-company',
        resolved,
        new Set(),
      ),
    ).toBeNull();
  });
});

describe('operating-period validation', () => {
  const history = [
    period('period-1', 'entity-person', '2026-04-01', '2027-03-31'),
    period('period-2', 'entity-company', '2027-04-01', null),
  ];

  it('accepts ordered, adjacent periods with one current period', () => {
    expect(validateBusinessEntityPeriods([...history].reverse())).toEqual(
      history,
    );
  });

  it('rejects overlap, mixed businesses, and multiple current periods', () => {
    expect(() =>
      validateBusinessEntityPeriods([
        period('period-1', 'entity-person', '2026-04-01', '2027-04-01'),
        period('period-2', 'entity-company', '2027-04-01', null),
      ]),
    ).toThrow('cannot overlap');
    expect(() =>
      validateBusinessEntityPeriods([
        history[0],
        { ...history[1], businessId: 'business-2' },
      ]),
    ).toThrow('one business');
    expect(() =>
      validateBusinessEntityPeriods([
        period('period-1', 'entity-person', '2026-04-01', null),
        period('period-2', 'entity-company', '2027-04-01', null),
      ]),
    ).toThrow();
  });

  it('plans an inclusive prior boundary without mutating history', () => {
    const plan = planLegalEntityChange(
      [period('period-1', 'entity-person', '2026-04-01', null)],
      'entity-company',
      '2027-04-01',
    );

    expect(plan).toMatchObject({
      currentPeriod: { id: 'period-1' },
      closeCurrentOn: '2027-03-31',
      nextLegalEntityId: 'entity-company',
      nextEffectiveFrom: '2027-04-01',
    });
  });

  it('rejects a no-op entity change and a non-forward boundary', () => {
    const current = [period('period-1', 'entity-person', '2026-04-01', null)];
    expect(() =>
      planLegalEntityChange(current, 'entity-person', '2027-04-01'),
    ).toThrow('must differ');
    expect(() =>
      planLegalEntityChange(current, 'entity-company', '2026-04-01'),
    ).toThrow('must start after');
  });
});
