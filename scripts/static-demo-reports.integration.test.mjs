// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { viewReport } from '../worker/routes/reports';
import { dashboard } from '../worker/routes/dashboard';
import {
  readStaticDemoReport,
  readStaticDemoFinancialTotals,
} from '../src/features/demo/staticDemoReports';
import {
  recordDemoMutation,
  resetDemoData,
} from '../src/features/demo/demoStore';

let db;
const business = 'business-demo-activity-contracting';
function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}
function statement(sql, values = []) {
  return {
    bind(...bindings) {
      return statement(sql, bindings);
    },
    async first() {
      return db.prepare(sql).get(...values) ?? null;
    },
    async all() {
      return { success: true, results: db.prepare(sql).all(...values) };
    },
  };
}
const env = { APP_ENV: 'demo', DB: { prepare: statement } };
beforeAll(() => {
  db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = read(`../migrations/${name}`);
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(read('./seed-demo.sql'));
});
afterAll(() => db.close());
beforeEach(() => resetDemoData());

it.each([
  'scope=FULL',
  'scope=MONTH&month=2026-08',
  'scope=TAX_YEAR&taxYear=2027',
  `businessId=${business}`,
  'legalEntityId=demo-entity-taxi-limited',
  'scope=MONTH&month=2028-01',
])('matches authoritative report rows and period for %s', async (query) => {
  const response = await viewReport(
    new Request(`https://demo.invalid/api/reports/summary?${query}`),
    env,
  );
  expect(await readStaticDemoReport(new URLSearchParams(query))).toEqual(
    await response.json(),
  );
});

it('preserves recorded income versus cash received and full insurance premiums', async () => {
  for (const businessId of [undefined, business]) {
    const response = await dashboard(
      new Request('https://demo.invalid/api/dashboard?taxYear=2027'),
      env,
      businessId ? { businessId } : {},
    );
    const actual = await readStaticDemoFinancialTotals(
      new URLSearchParams({
        scope: 'TAX_YEAR',
        taxYear: '2027',
        ...(businessId ? { businessId } : {}),
      }),
    );
    expect(actual.financialTotals).toEqual(
      (await response.json()).financialTotals,
    );
  }
});

it('uses Auckland expense dates without shifting calendar income dates', async () => {
  const september = new URLSearchParams({
    scope: 'MONTH',
    month: '2026-09',
    businessId: business,
  });
  const before = await readStaticDemoReport(september);
  await recordDemoMutation(`/api/businesses/${business}/expenses`, {
    method: 'POST',
    body: JSON.stringify({
      expenseType: 'GENERAL',
      merchantName: 'Boundary',
      purchaseDatetime: '2026-09-30T12:30:00Z',
      totalAmount: '10.00',
    }),
  });
  expect(await readStaticDemoReport(september)).toEqual(before);
  const october = await readStaticDemoReport(
    new URLSearchParams({
      scope: 'MONTH',
      month: '2026-10',
      businessId: business,
    }),
  );
  expect(october.rows).toContainEqual({
    family: 'EXPENSE',
    subtype: 'GENERAL',
    currency: 'NZD',
    record_count: 1,
    recorded_total_minor: 1000,
  });
});

it('keeps currencies separate and ignores voided records', async () => {
  await recordDemoMutation(`/api/businesses/${business}/expenses`, {
    method: 'POST',
    body: JSON.stringify({
      expenseType: 'GENERAL',
      currency: 'USD',
      merchantName: 'USD example',
      purchaseDatetime: '2026-10-01T00:00:00Z',
      totalAmount: '12.34',
    }),
  });
  await recordDemoMutation(`/api/businesses/${business}/expenses`, {
    method: 'POST',
    body: JSON.stringify({
      expenseType: 'GENERAL',
      currency: 'USD',
      status: 'VOIDED',
      merchantName: 'Void example',
      purchaseDatetime: '2026-10-01T00:00:00Z',
      totalAmount: '99.00',
    }),
  });
  const query = new URLSearchParams({ businessId: business });
  expect(
    (await readStaticDemoFinancialTotals(query)).financialTotals.find(
      (row) => row.currency === 'USD',
    ),
  ).toMatchObject({ recordedExpensesMinor: 1234 });
  expect((await readStaticDemoReport(query)).rows).toContainEqual({
    family: 'EXPENSE',
    subtype: 'GENERAL',
    currency: 'USD',
    record_count: 1,
    recorded_total_minor: 1234,
  });
});

it.each([
  'scope=UNKNOWN',
  'scope=MONTH&month=invalid',
  'scope=TAX_YEAR&taxYear=1890',
])('rejects invalid periods %s', async (query) => {
  await expect(
    readStaticDemoReport(new URLSearchParams(query)),
  ).rejects.toThrow();
});

it('rejects overflowing totals rather than silently rounding', async () => {
  for (let index = 0; index < 2; index += 1) {
    await recordDemoMutation(`/api/businesses/${business}/expenses`, {
      method: 'POST',
      body: JSON.stringify({
        expenseType: 'GENERAL',
        merchantName: 'Large example',
        currency: 'USD',
        purchaseDatetime: '2026-10-01T00:00:00Z',
        totalAmount: '45035996273704.96',
      }),
    });
  }
  await expect(readStaticDemoReport()).rejects.toThrow('supported range');
  await expect(readStaticDemoFinancialTotals()).rejects.toThrow(
    'supported range',
  );
});
