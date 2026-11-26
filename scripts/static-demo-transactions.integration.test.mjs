import { staticDemoTestActor } from './static-demo-evidence-fixture.mjs';
// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { listTransactions } from '../worker/routes/review';
import { readStaticDemoTransactions } from '../src/features/demo/staticDemoTransactions';
import { seedStaticDemoEvidence } from './static-demo-evidence-fixture.mjs';
import {
  recordDemoMutation,
  resetDemoData,
} from '../src/features/demo/demoStore';

let db;
const businessId = 'business-demo-activity-delivery';
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

it('tracks browser evidence and trash without leaking records into another business', async () => {
  const result = await recordDemoMutation(
    `/api/businesses/${businessId}/expenses`,
    {
      method: 'POST',
      body: JSON.stringify({
        merchantName: 'Receipt test supplier',
        expenseType: 'GENERAL',
        purchaseDatetime: '2026-09-01T00:00:00Z',
        totalAmount: '10.00',
      }),
    },
  );
  const recordId = result.record.id;
  await recordDemoMutation('/api/attachments', {
    method: 'POST',
    body: JSON.stringify({
      businessId,
      recordId,
      recordType: 'EXPENSE',
      file: 'fictional.jpg',
    }),
  });
  const query = new URLSearchParams(
    'q=Receipt test supplier&attachment=PRESENT',
  );
  expect(
    (await readStaticDemoTransactions(businessId, query)).transactions,
  ).toHaveLength(1);
  expect(
    (
      await readStaticDemoTransactions(
        'business-demo-activity-rideshare',
        query,
      )
    ).transactions,
  ).toHaveLength(0);
  const body = JSON.stringify({ businessId, recordId, recordType: 'EXPENSE' });
  await recordDemoMutation('/api/trash', { method: 'POST', body });
  expect(
    (await readStaticDemoTransactions(businessId, query)).transactions,
  ).toHaveLength(0);
  await recordDemoMutation('/api/trash/restore', { method: 'POST', body });
  expect(
    (await readStaticDemoTransactions(businessId, query)).transactions,
  ).toHaveLength(1);
});

it.each([
  '',
  'pageSize=3&page=2',
  'direction=INCOME&taxYear=2027',
  'subtype=FUEL&amountMin=50.00&amountMax=110.00',
  'review=UNREVIEWED&attachment=MISSING',
  'q=kauri&dateFrom=2026-08-01&dateTo=2026-09-30',
  'vehicleId=demo-vehicle-koru',
  'legalEntityId=business-entity-primary&status=PROCESSED',
])('matches the authoritative transaction response for %s', async (query) => {
  const env = {
    APP_ENV: 'demo',
    REQUEST_USER: staticDemoTestActor,
    DB: { prepare: statement },
  };
  for (const scope of [undefined, businessId]) {
    const response = await listTransactions(
      new Request(`https://demo.invalid/api/transactions?${query}`),
      env,
      scope ? { businessId: scope } : {},
    );
    expect(
      await readStaticDemoTransactions(scope, new URLSearchParams(query)),
    ).toEqual(await response.json());
  }
});

it('filters browser creates before pagination and reflects missing receipt counts', async () => {
  await recordDemoMutation(`/api/businesses/${businessId}/expenses`, {
    method: 'POST',
    body: JSON.stringify({
      merchantName: 'Unique test supplier',
      expenseType: 'GENERAL',
      purchaseDatetime: '2026-09-01T00:00:00Z',
      totalAmount: '12.34',
    }),
  });
  const result = await readStaticDemoTransactions(
    businessId,
    new URLSearchParams('q=Unique test supplier&pageSize=1'),
  );
  expect(result.transactions[0]).toMatchObject({
    counterparty: 'Unique test supplier',
    totalAmountMinor: 1234,
  });
  expect(result.summary).toEqual({
    resultCount: 1,
    missingAttachmentCount: 1,
    unreviewedCount: 1,
  });
  await resetDemoData();
  expect(
    (
      await readStaticDemoTransactions(
        businessId,
        new URLSearchParams('q=Unique test supplier'),
      )
    ).transactions,
  ).toEqual([]);
});

it.each([
  'page=101',
  'pageSize=101',
  'amountMin=2.001',
  'dateFrom=2026-02-30',
  'review=INVALID',
  'direction=INVALID',
  'amountMin=20&amountMax=10',
])('rejects invalid filters %s', async (query) => {
  await expect(
    readStaticDemoTransactions(businessId, new URLSearchParams(query)),
  ).rejects.toThrow();
});
