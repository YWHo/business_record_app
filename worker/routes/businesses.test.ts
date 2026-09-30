import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { listBusinessDocuments } from './attachments';
import { createGeneralExpense } from './expenseRecords';
import { getIncomeRecord, listIncomeRecords } from './incomeRecords';
import { listTransactions } from './review';
import {
  businessDashboard,
  changeBusinessLegalEntity,
  getBusinessExpense,
  listBusinessExpenses,
  listBusinessRecords,
  updateBusinessDetails,
} from './businesses';
import { getWorkSession, listWorkSessions } from './workSessions';

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
    batch(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((statement) => statement.run()));
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

  it('loads an expense detail only through account and business scope', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.sql.includes('FROM expenses'))
        return {
          id: 'expense-1',
          business_id: 'business-1',
          legal_entity_id: 'entity-1',
          expense_type: 'GENERAL',
          expense_category_id: 'category-1',
          category_name: 'Equipment',
          merchant_name: 'Officeworks',
          purchase_datetime: '2026-09-20T10:00:00.000+12:00',
          total_amount_minor: 8990,
          currency: 'NZD',
          gst_amount_minor: 1173,
          gst_status: 'GST_INCLUDED',
          description: 'Office equipment',
          recurrence_type: 'ONE_OFF',
          status: 'NEW',
          created_at: '2026-09-20T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
        };
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await getBusinessExpense(
      new Request(
        'https://demo.invalid/api/businesses/business-1/expenses/expense-1',
      ),
      env,
      { businessId: 'business-1', expenseId: 'expense-1' },
    );

    expect(await response.json()).toMatchObject({
      expense: {
        id: 'expense-1',
        businessId: 'business-1',
        merchantName: 'Officeworks',
        totalAmountMinor: 8990,
      },
    });
    const detailQuery = queries.find((query) =>
      query.sql.includes('parking_expense_details'),
    );
    expect(detailQuery?.values).toEqual([
      'business-account-primary',
      'business-1',
      'expense-1',
    ]);
  });

  it('loads an income detail only through account and business scope', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.sql.startsWith('SELECT id FROM income_records')) {
        return { id: 'income-1' };
      }
      if (query.sql.includes('FROM income_records')) {
        return {
          id: 'income-1',
          business_id: 'business-1',
          legal_entity_id: 'entity-1',
          business_activity_id: 'activity-derived',
          activity_name: 'Uber Ride',
          income_type: 'GENERAL',
          received_from: 'Customer',
          transaction_date: '2026-09-20',
          total_amount_minor: 5000,
          currency: 'NZD',
          status: 'NEW',
          notes: null,
          created_at: '2026-09-20T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
          reconciliation_id: null,
        };
      }
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await getIncomeRecord(
      new Request(
        'https://demo.invalid/api/businesses/business-1/income/income-1',
      ),
      env,
      { businessId: 'business-1', incomeId: 'income-1' },
    );

    expect(await response.json()).toMatchObject({
      incomeRecord: {
        id: 'income-1',
        businessId: 'business-1',
        receivedFrom: 'Customer',
        totalAmountMinor: 5000,
      },
    });
    const detailQuery = queries.find((query) =>
      query.sql.includes('LEFT JOIN platform_income_details'),
    );
    expect(detailQuery?.values).toEqual([
      'business-account-primary',
      'business-1',
      'income-1',
    ]);
  });

  it('loads a work-session detail only through account and business scope', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.sql.startsWith('SELECT id FROM work_sessions')) {
        return { id: 'session-1' };
      }
      if (query.sql.includes('FROM work_sessions')) {
        return {
          id: 'session-1',
          business_id: 'business-1',
          legal_entity_id: 'entity-1',
          business_activity_id: 'activity-derived',
          activity_name: 'Uber Ride',
          vehicle_id: 'vehicle-1',
          vehicle_registration: 'ABC123',
          started_at: '2026-09-20T08:00:00.000Z',
          ended_at: '2026-09-20T10:00:00.000Z',
          odometer_start_km: 100,
          odometer_end_km: 150,
          distance_km: 50,
          gross_revenue_minor: 10_000,
          currency: 'NZD',
          notes: 'Morning work',
          status: 'NEW',
          created_at: '2026-09-20T08:00:00.000Z',
          updated_at: '2026-09-20T10:00:00.000Z',
          tank_full_at_start: null,
          no_personal_driving: null,
          tank_full_at_end: null,
          starting_fuel_expense_id: null,
          starting_fuel_merchant: null,
          ending_fuel_expense_id: null,
          ending_fuel_merchant: null,
          ending_fuel_total_minor: null,
          ending_fuel_currency: null,
          ending_fuel_litres: null,
          ending_fill_type: null,
        };
      }
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await getWorkSession(
      new Request(
        'https://demo.invalid/api/businesses/business-1/work-sessions/session-1',
      ),
      env,
      { businessId: 'business-1', sessionId: 'session-1' },
    );

    expect(await response.json()).toMatchObject({
      session: {
        id: 'session-1',
        businessId: 'business-1',
        vehicleRegistration: 'ABC123',
        distanceKm: 50,
      },
    });
    const detailQuery = queries.find((query) =>
      query.sql.includes('JOIN business_activities'),
    );
    expect(detailQuery?.values).toEqual([
      'business-account-primary',
      'business-1',
      'session-1',
    ]);
  });

  it('keeps dashboard attention and recent activity inside the authorized business', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.sql.includes('FROM retention_settings'))
        return { tax_year_end_month: 3, tax_year_end_day: 31 };
      if (query.sql.includes('SELECT record_type,status,attachment_count'))
        return [
          {
            record_type: 'EXPENSE',
            status: 'MISSING_INFORMATION',
            attachment_count: 0,
          },
        ];
      if (query.sql.includes('payment_status IN'))
        return [{ currency: 'NZD', invoice_count: 1, outstanding_minor: 5000 }];
      if (query.sql.includes('ORDER BY transaction_date DESC,id DESC'))
        return [
          {
            id: 'expense-recent',
            business_id: 'business-1',
            record_type: 'EXPENSE',
            subtype: 'GENERAL',
            transaction_date: '2026-09-20',
            counterparty: 'Example supplier',
            total_amount_minor: 2500,
            currency: 'NZD',
            status: 'MISSING_INFORMATION',
          },
        ];
      if (query.operation === 'all') return [];
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await businessDashboard(
      new Request(
        'https://demo.invalid/api/businesses/business-1/dashboard?taxYear=2027',
      ),
      env,
      { businessId: 'business-1' },
    );

    expect(await response.json()).toMatchObject({
      attention: {
        missingReceiptCount: 1,
        itemsToReviewCount: 1,
        outstandingInvoiceCount: 1,
      },
      recentTransactions: [
        {
          id: 'expense-recent',
          businessId: 'business-1',
          counterparty: 'Example supplier',
        },
      ],
    });
    const dashboardQueries = queries.filter(
      (query) => query.operation === 'all',
    );
    expect(dashboardQueries).not.toHaveLength(0);
    dashboardQueries.forEach((query) => {
      expect(query.sql).toContain('.business_id=?');
      expect(query.values).toContain('business-1');
    });
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

  it('binds account and business IDs for the transaction workspace', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.operation === 'all') return [];
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await listTransactions(
      new Request(
        'https://demo.invalid/api/businesses/business-1/transactions?page=1',
      ),
      env,
      { businessId: 'business-1' },
    );

    expect(response.status).toBe(200);
    const listQuery = queries.find((query) =>
      query.sql.includes('SELECT * FROM'),
    );
    expect(listQuery?.sql).toContain('business_id = ?');
    expect(listQuery?.values.slice(0, 2)).toEqual([
      'business-account-primary',
      'business-1',
    ]);
  });

  it('scopes account-level review to a legal entity', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.operation === 'all') return [];
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await listTransactions(
      new Request(
        'https://demo.invalid/api/transactions?legalEntityId=entity-1&review=UNREVIEWED',
      ),
      env,
    );

    expect(response.status).toBe(200);
    const listQuery = queries.find((query) =>
      query.sql.includes('SELECT * FROM'),
    );
    expect(listQuery?.sql).toContain('legal_entity_id = ?');
    expect(listQuery?.sql).toContain('reviewed_by IS NULL');
    expect(listQuery?.values.slice(0, 2)).toEqual([
      'business-account-primary',
      'entity-1',
    ]);
  });

  it('lists current documents only inside the selected business', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.operation === 'all')
        return [
          {
            id: 'attachment-1',
            record_type: 'EXPENSE',
            record_id: 'expense-1',
            version_group_id: 'version-1',
            object_key: 'private/key',
            original_filename: 'receipt.pdf',
            mime_type: 'application/pdf',
            file_size: 1024,
            sha256: 'abc',
            created_at: '2026-09-20T00:00:00.000Z',
            version_number: 1,
            is_current: 1,
            display_rotation_degrees: 0,
            creator_email: 'owner@example.invalid',
            business_id: 'business-1',
            legal_entity_id: 'entity-1',
            record_label: 'Supplier',
            record_date: '2026-09-20',
            record_status: 'NEW',
          },
        ];
      throw new Error(`Unexpected query: ${query.sql}`);
    });

    const response = await listBusinessDocuments(
      new Request('https://demo.invalid/api/businesses/business-1/documents'),
      env,
      { businessId: 'business-1' },
    );

    expect(await response.json()).toMatchObject({
      documents: [
        {
          id: 'attachment-1',
          businessId: 'business-1',
          recordLabel: 'Supplier',
        },
      ],
    });
    const listQuery = queries.find((query) =>
      query.sql.includes('FROM attachments JOIN users'),
    );
    expect(listQuery?.values).toEqual([
      'business-account-primary',
      'business-1',
    ]);
  });
});

describe('business settings routes', () => {
  it('updates details inside the authenticated account and writes scoped audit history', async () => {
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM sessions'))
        return {
          id: 'owner-1',
          email: 'owner@example.invalid',
          role: 'OWNER',
          status: 'ACTIVE',
          businessAccountId: 'business-account-primary',
        };
      if (query.sql.startsWith('SELECT id FROM businesses')) return null;
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.sql.includes('UPDATE businesses')) return null;
      if (query.sql.includes('INSERT INTO audit_log')) return null;
      throw new Error(`Unexpected query: ${query.sql}`);
    }, 'production');
    const response = await updateBusinessDetails(
      new Request('https://records.example.invalid/api/businesses/business-1', {
        method: 'PATCH',
        headers: {
          cookie: 'br_session=test-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Uber Ride NZ',
          description: 'Corrected business name',
          defaultCurrency: 'nzd',
        }),
      }),
      env,
      { businessId: 'business-1' },
    );

    expect(response.status).toBe(200);
    const update = queries.find((query) =>
      query.sql.includes('UPDATE businesses'),
    );
    expect(update?.values.slice(0, 3)).toEqual([
      'Uber Ride NZ',
      'Corrected business name',
      'NZD',
    ]);
    expect(update?.values.slice(-2)).toEqual([
      'business-account-primary',
      'business-1',
    ]);
    const audit = queries.find((query) =>
      query.sql.includes('INSERT INTO audit_log'),
    );
    expect(audit?.values.slice(3, 9)).toEqual([
      'BUSINESS_UPDATED',
      'BUSINESS',
      'business-1',
      'activity-derived',
      'business-1',
      null,
    ]);
  });

  it('atomically closes the current period, creates the next one, and audits it', async () => {
    const currentPeriod = {
      id: 'period-current',
      business_account_id: 'business-account-primary',
      business_id: 'business-1',
      legal_entity_id: 'entity-owner',
      effective_from: '2026-04-01',
      effective_to: null,
      created_at: '2026-04-01T00:00:00.000Z',
      created_by: 'owner-1',
      notes: null,
    };
    const { env, queries } = fakeEnv((query) => {
      if (query.sql.includes('FROM sessions'))
        return {
          id: 'owner-1',
          email: 'owner@example.invalid',
          role: 'OWNER',
          status: 'ACTIVE',
          businessAccountId: 'business-account-primary',
        };
      if (query.sql.includes('FROM businesses')) return businessRow;
      if (query.sql.includes('FROM business_entity_periods'))
        return [currentPeriod];
      if (query.sql.includes('FROM business_entities'))
        return {
          id: 'entity-company',
          business_account_id: 'business-account-primary',
          entity_type: 'LIMITED_COMPANY',
          legal_name: 'Taxi Limited',
          trading_name: null,
          nzbn: null,
          company_number: null,
          country: 'NZ',
          active: 1,
          attribution_review_required: 0,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        };
      if (
        query.sql.includes('UPDATE business_entity_periods') ||
        query.sql.includes('INSERT INTO business_entity_periods') ||
        query.sql.includes('INSERT INTO audit_log')
      )
        return null;
      throw new Error(`Unexpected query: ${query.sql}`);
    }, 'production');

    const response = await changeBusinessLegalEntity(
      new Request(
        'https://records.example.invalid/api/businesses/business-1/legal-entity-periods',
        {
          method: 'POST',
          headers: {
            cookie: 'br_session=test-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            legalEntityId: 'entity-company',
            effectiveFrom: '2027-04-01',
            notes: 'Company takes over operations.',
          }),
        },
      ),
      env,
      { businessId: 'business-1' },
    );

    expect(response.status).toBe(201);
    const close = queries.find((query) =>
      query.sql.includes('UPDATE business_entity_periods'),
    );
    expect(close?.values).toEqual([
      '2027-03-31',
      'period-current',
      'business-account-primary',
      'business-1',
    ]);
    const insert = queries.find((query) =>
      query.sql.includes('INSERT INTO business_entity_periods'),
    );
    expect(insert?.values.slice(1, 5)).toEqual([
      'business-account-primary',
      'business-1',
      'entity-company',
      '2027-04-01',
    ]);
    const audit = queries.find((query) =>
      query.sql.includes('INSERT INTO audit_log'),
    );
    expect(audit?.values.slice(3, 9)).toEqual([
      'BUSINESS_LEGAL_ENTITY_CHANGED',
      'BUSINESS_ENTITY_PERIOD',
      expect.any(String),
      'activity-derived',
      'business-1',
      'entity-company',
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
