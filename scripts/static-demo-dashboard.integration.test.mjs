import { staticDemoTestActor } from './static-demo-evidence-fixture.mjs';
// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { dashboard } from '../worker/routes/dashboard';
import { readStaticDemoDashboard } from '../src/features/demo/staticDemoDashboard';
import { seedStaticDemoEvidence } from './static-demo-evidence-fixture.mjs';
import {
  recordDemoMutation,
  resetDemoData,
} from '../src/features/demo/demoStore';

let db;
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
beforeAll(() => {
  db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = read(`../migrations/${name}`);
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(read('./seed-demo.sql'));
  seedStaticDemoEvidence(db);
});
afterAll(() => db.close());
beforeEach(() => resetDemoData());

it.each([
  [undefined, 'taxYear=2027'],
  ['business-demo-activity-delivery', 'taxYear=2027'],
  ['business-demo-activity-rideshare', 'taxYear=2027'],
  ['business-demo-activity-contracting', 'taxYear=2027'],
  ['business-demo-activity-saas', 'taxYear=2027'],
  [undefined, 'taxYear=2026'],
  [undefined, 'taxYear=2027&activityId=demo-activity-rideshare'],
  ['business-demo-activity-delivery', 'taxYear=2027&activityId=ignored'],
])(
  'matches the complete Worker dashboard for %s / %s',
  async (businessId, query) => {
    const response = await dashboard(
      new Request(`https://demo.invalid/api/dashboard?${query}`),
      {
        APP_ENV: 'demo',
        REQUEST_USER: staticDemoTestActor,
        DB: { prepare: statement },
      },
      businessId ? { businessId } : {},
    );
    expect(
      await readStaticDemoDashboard(businessId, new URLSearchParams(query)),
    ).toEqual(await response.json());
  },
);

it('recomputes totals, recent records and review/receipt counts after browser edits', async () => {
  const id = 'business-demo-activity-rideshare';
  const query = new URLSearchParams('taxYear=2027');
  const before = await readStaticDemoDashboard(id, query);
  const created = await recordDemoMutation(`/api/businesses/${id}/expenses`, {
    method: 'POST',
    body: JSON.stringify({
      expenseType: 'GENERAL',
      merchantName: 'Dashboard test supplier',
      purchaseDatetime: '2026-11-01T00:00:00Z',
      totalAmount: '12.34',
      currency: 'NZD',
    }),
  });
  const after = await readStaticDemoDashboard(id, query);
  expect(after.financialTotals[0].recordedExpensesMinor).toBe(
    before.financialTotals[0].recordedExpensesMinor + 1234,
  );
  expect(after.attention.missingReceiptCount).toBe(
    before.attention.missingReceiptCount + 1,
  );
  expect(after.review.totalRecords).toBe(before.review.totalRecords + 1);
  expect(after.recentTransactions[0]).toMatchObject({
    id: created.record.id,
    counterparty: 'Dashboard test supplier',
  });
  await recordDemoMutation('/api/attachments', {
    method: 'POST',
    body: JSON.stringify({
      businessId: id,
      recordType: 'EXPENSE',
      recordId: created.record.id,
      file: 'fictional.jpg',
    }),
  });
  expect(
    (await readStaticDemoDashboard(id, query)).attention.missingReceiptCount,
  ).toBe(before.attention.missingReceiptCount);
  await recordDemoMutation('/api/trash', {
    method: 'POST',
    body: JSON.stringify({
      businessId: id,
      recordType: 'EXPENSE',
      recordId: created.record.id,
    }),
  });
  expect((await readStaticDemoDashboard(id, query)).financialTotals).toEqual(
    before.financialTotals,
  );
});

it('keeps incomplete session revenue unavailable instead of reporting misleading rates', async () => {
  const result = await readStaticDemoDashboard(
    'business-demo-activity-rideshare',
    new URLSearchParams('taxYear=2027'),
  );
  expect(result.platformActivities[0]).toMatchObject({
    revenueComplete: false,
    sessionRevenueMinor: null,
    revenuePerHourMinor: null,
    directOperatingContributionMinor: null,
  });
});

it('recalculates partially paid browser invoices and resolves their client labels', async () => {
  const id = 'business-demo-activity-contracting';
  const query = new URLSearchParams('taxYear=2027');
  const before = await readStaticDemoDashboard(id, query);
  await recordDemoMutation(`/api/businesses/${id}/income`, {
    method: 'POST',
    body: JSON.stringify({
      incomeType: 'CONTRACT',
      clientId: 'demo-client-harbour',
      transactionDate: '2026-11-01',
      invoiceDate: '2026-11-01',
      total: '100.00',
      amountReceived: '20.00',
      paymentStatus: 'PARTIALLY_PAID',
      currency: 'NZD',
    }),
  });
  const after = await readStaticDemoDashboard(id, query);
  expect(after.outstandingInvoices[0].outstandingMinor).toBe(
    before.outstandingInvoices[0].outstandingMinor + 8000,
  );
  expect(after.attention.outstandingInvoiceCount).toBe(
    before.attention.outstandingInvoiceCount + 1,
  );
  expect(after.financialTotals[0].cashReceivedMinor).toBe(
    before.financialTotals[0].cashReceivedMinor + 2000,
  );
  expect(after.recentTransactions[0].counterparty).toBe(
    'Harbour Lantern Limited',
  );
});

it('keeps session currencies separate without concealing incomplete NZD revenue', async () => {
  const id = 'business-demo-activity-rideshare';
  await recordDemoMutation(`/api/businesses/${id}/work-sessions`, {
    method: 'POST',
    body: JSON.stringify({
      vehicleId: 'demo-vehicle-koru',
      startedAt: '2026-11-01T00:00:00Z',
      endedAt: '2026-11-01T01:00:00Z',
      odometerStartKm: 100,
      odometerEndKm: 110,
      grossRevenue: '20.00',
      currency: 'USD',
    }),
  });
  const result = await readStaticDemoDashboard(
    id,
    new URLSearchParams('taxYear=2027'),
  );
  expect(
    result.platformActivities.find((row) => row.currency === 'USD'),
  ).toMatchObject({
    sessionRevenueMinor: 2000,
    revenuePerKmMinor: 200,
    sessionCount: 1,
  });
  expect(
    result.platformActivities.find((row) => row.currency === 'NZD'),
  ).toMatchObject({ revenueComplete: false, sessionRevenueMinor: null });
});

it('rejects overflowing aggregate money values', async () => {
  const id = 'business-demo-activity-rideshare';
  for (let index = 0; index < 2; index += 1) {
    await recordDemoMutation(`/api/businesses/${id}/expenses`, {
      method: 'POST',
      body: JSON.stringify({
        expenseType: 'GENERAL',
        merchantName: 'Large example',
        purchaseDatetime: '2026-11-01T00:00:00Z',
        totalAmount: '45035996273704.96',
        currency: 'USD',
      }),
    });
  }
  await expect(
    readStaticDemoDashboard(id, new URLSearchParams('taxYear=2027')),
  ).rejects.toThrow('supported range');
});

it.each([
  [undefined, 'activityId=unknown'],
  ['unknown', 'taxYear=2027'],
  [undefined, 'taxYear=invalid'],
])('rejects invalid scope %s / %s', async (businessId, query) => {
  await expect(
    readStaticDemoDashboard(businessId, new URLSearchParams(query)),
  ).rejects.toThrow();
});
