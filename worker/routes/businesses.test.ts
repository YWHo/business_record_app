import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { createGeneralExpense } from './expenseRecords';
import { listIncomeRecords } from './incomeRecords';
import { listBusinessExpenses, listBusinessRecords } from './businesses';
import { listWorkSessions } from './workSessions';

interface CapturedQuery {
  sql: string;
  values: unknown[];
  operation?: 'first' | 'all' | 'run';
}

type QueryResult = Record<string, unknown> | Record<string, unknown>[] | null;

function fakeEnv(
  resolve: (query: CapturedQuery) => QueryResult,
  appEnv: Env['APP_ENV'] = 'demo',
) {
  const queries: CapturedQuery[] = [];
  const db = {
    prepare(sql: string) {
      const query: CapturedQuery = { sql, values: [] };
      queries.push(query);
      const statement = {
        bind(...values: unknown[]) {
          query.values = values;
          return statement;
        },
        first<T>() {
          query.operation = 'first';
          return Promise.resolve(resolve(query) as T | null);
        },
        all<T>() {
          query.operation = 'all';
          const value = resolve(query);
          return Promise.resolve({
            success: true,
            results: (Array.isArray(value) ? value : []) as T[],
            meta: {},
          } as D1Result<T>);
        },
        run() {
          query.operation = 'run';
          resolve(query);
          return Promise.resolve({ success: true, meta: {} } as D1Result);
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { env: { APP_ENV: appEnv, DB: db } as Env, queries };
}

const businessRow = {
  id: 'business-1',
  business_account_id: 'business-account-primary',
  name: 'Uber Ride',
  description: 'Ride-hailing',
  business_type: 'PLATFORM_SERVICES',
  default_currency: 'NZD',
  status: 'ACTIVE',
  legacy_business_activity_id: 'activity-derived',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
};

describe('business-scoped read routes', () => {
  it('lists account businesses with their current entity and record summary', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses'))
        return [
          {
            ...businessRow,
            current_entity_id: 'entity-1',
            current_entity_type: 'SOLE_TRADER',
            current_entity_legal_name: 'Example Owner',
            current_entity_trading_name: null,
            current_entity_active: 1,
            current_entity_review_required: 0,
            expense_record_count: 2,
            income_record_count: 1,
            work_session_record_count: 3,
            expense_updated_at: '2026-09-08T00:00:00.000Z',
            income_updated_at: null,
            work_session_updated_at: '2026-09-09T00:00:00.000Z',
          },
        ];
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await listBusinessRecords(
      new Request('https://demo.invalid/api/businesses'),
      env,
    );

    expect(await response.json()).toMatchObject({
      businesses: [
        {
          id: 'business-1',
          recordCount: 6,
          currentLegalEntity: {
            legalName: 'Example Owner',
            entityType: 'SOLE_TRADER',
          },
        },
      ],
    });
    expect(queries[0].values).toEqual(['business-account-primary']);
  });

  it('binds both account and business IDs when listing expenses', async () => {
    const expenseRow = {
      id: 'expense-1',
      business_id: 'business-1',
      legal_entity_id: 'entity-1',
      expense_type: 'GENERAL',
      expense_category_id: 'category-1',
      category_name: 'General',
      merchant_name: 'Supplier',
      purchase_datetime: '2027-04-01T10:00:00.000+13:00',
      total_amount_minor: 1234,
      currency: 'NZD',
      status: 'NEW',
      description: null,
      created_at: '2027-04-01T00:00:00.000Z',
      updated_at: '2027-04-01T00:00:00.000Z',
    };
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.sql.includes('FROM expenses')) return [expenseRow];
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await listBusinessExpenses(
      new Request('https://demo.invalid/api/businesses/business-1/expenses'),
      env,
      { businessId: 'business-1' },
    );

    expect(await response.json()).toMatchObject({
      expenses: [
        {
          id: 'expense-1',
          businessId: 'business-1',
          legalEntityId: 'entity-1',
        },
      ],
    });
    const listQuery = queries.find((query) =>
      query.sql.includes('FROM expenses'),
    );
    expect(listQuery?.sql).toContain('expenses.business_id = ?');
    expect(listQuery?.values).toEqual([
      'business-account-primary',
      'business-1',
    ]);
  });

  it.each([
    ['income', listIncomeRecords, 'income_records.business_id = ?'],
    ['work sessions', listWorkSessions, 'work_sessions.business_id = ?'],
  ])('authorizes and scopes %s lists', async (_label, handler, predicate) => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.operation === 'all') return [];
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await handler(
      new Request('https://demo.invalid/api/businesses/business-1/records'),
      env,
      { businessId: 'business-1' },
    );

    expect(response.status).toBe(200);
    const listQuery = queries.find(
      (query) => query.operation === 'all' && !query.sql.includes('businesses'),
    );
    expect(listQuery?.sql).toContain(predicate);
    expect(listQuery?.values).toEqual([
      'business-account-primary',
      'business-1',
    ]);
  });
});

describe('business-scoped writes', () => {
  it('derives business, legacy activity, and legal entity on expense creation', async () => {
    const periodRow = {
      id: 'period-1',
      business_account_id: 'business-account-primary',
      business_id: 'business-1',
      legal_entity_id: 'entity-derived',
      effective_from: '2026-04-01',
      effective_to: null,
      created_at: '2026-04-01T00:00:00.000Z',
      created_by: 'owner-1',
      notes: null,
    };
    const legalEntityRow = {
      id: 'entity-derived',
      business_account_id: 'business-account-primary',
      entity_type: 'SOLE_TRADER',
      legal_name: 'Owner',
      trading_name: null,
      nzbn: null,
      company_number: null,
      country: 'NZ',
      active: 1,
      attribution_review_required: 0,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    };
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM sessions')) {
        return {
          id: 'owner-1',
          email: 'owner@example.invalid',
          role: 'OWNER',
          status: 'ACTIVE',
          businessAccountId: 'business-account-primary',
        };
      }
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.sql.includes('FROM business_entity_periods')) {
        return [periodRow];
      }
      if (query.sql.includes('FROM business_entities')) return legalEntityRow;
      if (query.sql.includes('SELECT active FROM business_activities')) {
        return { active: 1 };
      }
      if (query.sql.includes('SELECT active FROM expense_categories')) {
        return { active: 1 };
      }
      if (query.sql.includes('SELECT id FROM expense_categories')) {
        return { id: 'category-1' };
      }
      if (query.sql.includes('FROM retention_settings')) {
        return {
          retention_tax_years: 7,
          tax_year_end_month: 3,
          tax_year_end_day: 31,
        };
      }
      if (query.sql.includes('INSERT INTO expenses')) return null;
      if (query.sql.includes('INSERT INTO audit_log')) return null;
      if (query.sql.includes('FROM expenses')) {
        return {
          id: 'expense-created',
          business_id: 'business-1',
          legal_entity_id: 'entity-derived',
          business_activity_id: 'activity-derived',
          activity_name: 'Uber Ride',
          expense_category_id: 'category-1',
          category_name: 'General',
          merchant_name: 'Supplier',
          purchase_datetime: '2027-04-01T10:00:00.000+13:00',
          total_amount_minor: 1250,
          currency: 'NZD',
          gst_amount_minor: null,
          gst_status: 'UNKNOWN',
          description: null,
          recurrence_type: 'ONE_OFF',
          status: 'NEW',
          created_at: '2027-04-01T00:00:00.000Z',
          updated_at: '2027-04-01T00:00:00.000Z',
        };
      }
      throw new Error(`Unexpected query: ${query.sql}`);
    }, 'local');
    const request = new Request(
      'http://127.0.0.1/api/businesses/business-1/expenses',
      {
        method: 'POST',
        headers: {
          cookie: 'br_session=test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          expenseType: 'GENERAL',
          businessActivityId: 'activity-from-browser',
          legalEntityId: 'entity-from-browser',
          expenseCategoryId: 'category-1',
          merchantName: 'Supplier',
          purchaseDatetime: '2027-04-01T10:00:00.000+13:00',
          totalAmount: '12.50',
        }),
      },
    );

    const response = await createGeneralExpense(request, env, {
      businessId: 'business-1',
    });

    expect(response.status).toBe(201);
    const insert = queries.find((query) =>
      query.sql.includes('INSERT INTO expenses'),
    );
    expect(insert?.values.slice(1, 5)).toEqual([
      'business-account-primary',
      'business-1',
      'entity-derived',
      'activity-derived',
    ]);
    const audit = queries.find((query) =>
      query.sql.includes('INSERT INTO audit_log'),
    );
    expect(audit?.values.slice(7, 9)).toEqual(['business-1', 'entity-derived']);
  });
});
