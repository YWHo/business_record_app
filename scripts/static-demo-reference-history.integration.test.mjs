// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { listActivities } from '../worker/routes/activities';
import { listVehicles } from '../worker/routes/vehicles';
import { listClients } from '../worker/routes/clients';
import { listExpenseCategories } from '../worker/routes/expenseCategories';
import {
  listLegalEntityRecords,
  businessDetails,
} from '../worker/routes/businesses';
import {
  listAuditLog,
  getRetentionSettings,
} from '../worker/routes/governance';
import { listComments, listSavedFilters } from '../worker/routes/review';
import {
  readStaticDemoReferences,
  readStaticDemoLegalEntities,
  readStaticDemoBusinessDetails,
  readStaticDemoRetentionSettings,
} from '../src/features/demo/staticDemoReferences';
import {
  readStaticDemoAudit,
  readStaticDemoComments,
  readStaticDemoSavedFilters,
} from '../src/features/demo/staticDemoHistory';
import {
  readStaticDemoTrash,
  readStaticDemoExportStatus,
} from '../src/features/demo/staticDemoGovernance';
import { listTrash } from '../worker/routes/governance';
import { exportStatus } from '../worker/routes/exports';
import { viewReport } from '../worker/routes/reports';
import { dashboard } from '../worker/routes/dashboard';
import { readStaticDemoReport } from '../src/features/demo/staticDemoReports';
import { readStaticDemoDashboard } from '../src/features/demo/staticDemoDashboard';
import { seedStaticDemoEvidence } from './static-demo-evidence-fixture.mjs';
import { staticDemoRequest } from '../src/features/demo/staticDemoApi';
import {
  listBusinessRecords,
  listBusinessExpenses,
} from '../worker/routes/businesses';
import { listWorkSessions } from '../worker/routes/workSessions';
import { listIncomeRecords } from '../worker/routes/incomeRecords';
import { listFuelRecords } from '../worker/routes/fuelRecords';
import {
  resetDemoData,
  recordDemoMutation,
  changeDemoBusinessLegalEntity,
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
  seedStaticDemoEvidence(db);
});

afterAll(() => db.close());

beforeEach(() => resetDemoData());

const request = new Request('https://demo.invalid/api/test');

it('matches all Worker business directory counts through the integrated adapter', async () => {
  const native = await (await listBusinessRecords(request, env)).json();
  const result = await staticDemoRequest('/api/businesses', undefined, 'OWNER');
  expect(result.businesses).toHaveLength(native.businesses.length);
  for (const business of native.businesses) {
    expect(
      result.businesses.find((row) => row.id === business.id),
    ).toMatchObject(business);
  }
});

it.each([
  'business-demo-activity-delivery',
  'business-demo-activity-rideshare',
  'business-demo-activity-contracting',
  'business-demo-activity-saas',
])(
  'matches Worker collection projections and mileage summary for %s',
  async (businessId) => {
    for (const [collection, property, handler] of [
      ['expenses', 'expenses', listBusinessExpenses],
      ['income', 'incomeRecords', listIncomeRecords],
      ['work-sessions', 'sessions', listWorkSessions],
    ]) {
      const native = await (await handler(request, env, { businessId })).json();
      const result = await staticDemoRequest(
        `/api/businesses/${businessId}/${collection}`,
        undefined,
        'OWNER',
      );
      expect(result[property]).toHaveLength(native[property].length);
      for (const row of native[property]) {
        expect(
          result[property].find((entry) => entry.id === row.id),
        ).toMatchObject(row);
      }
      if (collection === 'work-sessions') {
        expect(result.summary).toEqual(native.summary);
      }
    }
  },
);

it('matches Worker fuel-picker metadata through the static dispatcher', async () => {
  const native = await (await listFuelRecords(request, env)).json();
  const result = await staticDemoRequest(
    '/api/fuel-records',
    undefined,
    'OWNER',
  );
  expect(result.fuelRecords).toHaveLength(native.fuelRecords.length);
  for (const row of native.fuelRecords) {
    expect(
      result.fuelRecords.find((entry) => entry.id === row.id),
    ).toMatchObject(row);
  }
});

it.each([
  ['activities', listActivities],
  ['vehicles', listVehicles],
  ['clients', listClients],
  ['categories', listExpenseCategories],
])('matches the Worker %s reference projection', async (kind, handler) => {
  expect(await readStaticDemoReferences(kind)).toEqual(
    await (await handler(request, env)).json(),
  );
});

it('matches legal entities, historical business periods and retention settings', async () => {
  expect(readStaticDemoLegalEntities()).toEqual(
    await (await listLegalEntityRecords(request, env)).json(),
  );
  for (const businessId of [
    'business-demo-activity-rideshare',
    'business-demo-activity-delivery',
  ]) {
    expect(await readStaticDemoBusinessDetails(businessId)).toEqual(
      await (await businessDetails(request, env, { businessId })).json(),
    );
  }
  expect(await readStaticDemoRetentionSettings()).toEqual(
    await (await getRetentionSettings(request, env)).json(),
  );
});

it.each([
  '',
  'businessId=business-demo-activity-delivery',
  'action=INCOME_CREATED&pageSize=2',
  'dateFrom=%202026-08-01%20&dateTo=%202026-08-15%20',
  'userId=demo-accountant',
  'entityType=EXPENSE&activityId=demo-activity-rideshare',
])('matches audit history %s', async (query) => {
  expect(await readStaticDemoAudit(new URLSearchParams(query))).toEqual(
    await (
      await listAuditLog(
        new Request(`https://demo.invalid/api/audit-log?${query}`),
        env,
      )
    ).json(),
  );
});

it('matches scoped comments and role-owned saved filters', async () => {
  const path = '/api/comments?recordType=INCOME&recordId=demo-platform-1';
  expect(
    await readStaticDemoComments(
      'business-demo-activity-delivery',
      'INCOME',
      'demo-platform-1',
    ),
  ).toEqual(
    await (
      await listComments(new Request(`https://demo.invalid${path}`), env)
    ).json(),
  );
  const ownerEnv = {
    ...env,
    REQUEST_USER: {
      id: 'demo-owner',
      role: 'OWNER',
      status: 'ACTIVE',
      businessAccountId: 'business-account-primary',
    },
  };
  expect(await readStaticDemoSavedFilters()).toEqual(
    await (await listSavedFilters(request, ownerEnv)).json(),
  );
  await recordDemoMutation('/api/comments', {
    method: 'POST',
    body: JSON.stringify({
      businessId: 'business-demo-activity-delivery',
      recordType: 'INCOME',
      recordId: 'demo-platform-1',
      message: 'Browser-local review note',
    }),
  });
  const local = await readStaticDemoComments(
    'business-demo-activity-delivery',
    'INCOME',
    'demo-platform-1',
  );
  expect(
    local.comments.find((row) => row.message === 'Browser-local review note'),
  ).toMatchObject({ authorId: 'browser-local-demo', authorRole: 'DEMO' });
});

it('reflects browser reference edits and reset without changing baseline history', async () => {
  await recordDemoMutation('/api/clients', {
    method: 'POST',
    body: JSON.stringify({ name: 'Local fictional client' }),
  });
  expect(
    (await readStaticDemoReferences('clients')).clients.some(
      (row) => row.name === 'Local fictional client',
    ),
  ).toBe(true);
  expect(
    (await readStaticDemoReferences('clients')).clients.find(
      (row) => row.name === 'Local fictional client',
    ),
  ).toMatchObject({ active: true });
  const query = new URLSearchParams('action=BROWSER_LOCAL_CHANGE');
  expect((await readStaticDemoAudit(query)).auditEvents).toHaveLength(1);
  expect(
    (await readStaticDemoAudit(query, 'AUDITOR')).auditEvents,
  ).toHaveLength(0);
  await resetDemoData();
  expect((await readStaticDemoAudit(query)).auditEvents).toEqual([]);
});

it('does not expose another business comments and rejects invalid audit bounds', async () => {
  await expect(
    readStaticDemoComments(
      'business-demo-activity-contracting',
      'INCOME',
      'demo-platform-1',
    ),
  ).rejects.toThrow('not found');
  await expect(
    readStaticDemoAudit(new URLSearchParams('dateFrom=2026-02-30')),
  ).rejects.toThrow();
  await expect(
    readStaticDemoAudit(new URLSearchParams('pageSize=101')),
  ).rejects.toThrow();
});

it('retains historical period creation evidence after a browser entity transition', async () => {
  const id = 'business-demo-activity-rideshare';
  const before = await readStaticDemoBusinessDetails(id);
  await changeDemoBusinessLegalEntity({
    businessId: id,
    legalEntityId: 'demo-entity-saas-limited',
    effectiveFrom: '2026-10-01',
  });
  const after = await readStaticDemoBusinessDetails(id);
  expect(after.operatingPeriods).toHaveLength(3);
  expect(after.operatingPeriods[0]).toEqual(before.operatingPeriods[0]);
  expect(after.operatingPeriods[1]).toMatchObject({
    createdAt: before.operatingPeriods[1].createdAt,
    effectiveTo: '2026-09-30',
  });
  expect(after.currentLegalEntity).toMatchObject({ legalName: 'SaaS Limited' });
});

it('keeps local saved filters and retention changes in browser state only', async () => {
  await recordDemoMutation('/api/saved-filters', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Local audit view',
      filterType: 'AUDIT',
      criteria: { action: 'INCOME_CREATED' },
    }),
  });
  expect(
    (await readStaticDemoSavedFilters('AUDIT')).savedFilters.some(
      (row) => row.name === 'Local audit view',
    ),
  ).toBe(true);
  expect(
    (await readStaticDemoSavedFilters('TRANSACTIONS')).savedFilters.some(
      (row) => row.name === 'Local audit view',
    ),
  ).toBe(false);
  await recordDemoMutation('/api/retention-settings', {
    method: 'PATCH',
    body: JSON.stringify({ backupReminderDays: 14 }),
  });
  expect(
    (await readStaticDemoRetentionSettings()).retentionSettings
      .backupReminderDays,
  ).toBe(14);
  await resetDemoData();
  expect(
    (await readStaticDemoRetentionSettings()).retentionSettings
      .backupReminderDays,
  ).toBe(30);
});

it('matches empty seeded trash and export history without creating an archive', async () => {
  expect(await readStaticDemoTrash()).toEqual(
    await (await listTrash(request, env)).json(),
  );
  expect(await readStaticDemoExportStatus()).toEqual(
    await (await exportStatus(request, env)).json(),
  );
});

it('retains financial metadata in browser trash and removes restored records', async () => {
  const body = JSON.stringify({
    businessId: 'business-demo-activity-delivery',
    recordType: 'EXPENSE',
    recordId: 'demo-fuel-1',
  });
  await recordDemoMutation('/api/trash', { method: 'POST', body });
  expect((await readStaticDemoTrash()).trash).toContainEqual(
    expect.objectContaining({
      id: 'demo-fuel-1',
      label: 'Kauri Fuel Point',
      retentionUntil: '2037-03-31',
      purgeEligibleAt: '2037-04-01',
    }),
  );
  await recordDemoMutation('/api/trash/restore', { method: 'POST', body });
  expect((await readStaticDemoTrash()).trash).toEqual([]);
});

it('uses browser fiscal settings consistently in reports and dashboards', async () => {
  await recordDemoMutation('/api/retention-settings', {
    method: 'PATCH',
    body: JSON.stringify({ taxYearEndMonth: 6, taxYearEndDay: 30 }),
  });
  db.exec(
    'SAVEPOINT fiscal_check; UPDATE retention_settings SET tax_year_end_month=6,tax_year_end_day=30;',
  );
  try {
    expect(
      await readStaticDemoReport(
        new URLSearchParams('scope=TAX_YEAR&taxYear=2027'),
      ),
    ).toEqual(
      await (
        await viewReport(
          new Request(
            'https://demo.invalid/api/reports/summary?scope=TAX_YEAR&taxYear=2027',
          ),
          env,
        )
      ).json(),
    );
    expect(
      await readStaticDemoDashboard(
        undefined,
        new URLSearchParams('taxYear=2027'),
      ),
    ).toEqual(
      await (
        await dashboard(
          new Request('https://demo.invalid/api/dashboard?taxYear=2027'),
          env,
        )
      ).json(),
    );
  } finally {
    db.exec('ROLLBACK TO fiscal_check; RELEASE fiscal_check;');
  }
});

it('rejects invalid browser fiscal settings and recovers on reset', async () => {
  await recordDemoMutation('/api/retention-settings', {
    method: 'PATCH',
    body: JSON.stringify({ taxYearEndMonth: 13 }),
  });
  await expect(readStaticDemoReport()).rejects.toThrow('invalid');
  await expect(readStaticDemoDashboard()).rejects.toThrow('invalid');
  await resetDemoData();
  expect(
    (await readStaticDemoRetentionSettings()).retentionSettings.taxYearEndMonth,
  ).toBe(3);
});

it('includes simulated financial reviews in Auditor history while excluding configuration changes', async () => {
  await readStaticDemoComments(
    'business-demo-activity-delivery',
    'INCOME',
    'demo-platform-1',
  );
  await recordDemoMutation('/api/income-reconciliations', {
    method: 'POST',
    body: JSON.stringify({
      businessId: 'business-demo-activity-delivery',
      incomeId: 'demo-platform-1',
      expectedAmount: '582.40',
      actualAmount: '582.40',
    }),
  });
  await recordDemoMutation('/api/retention-settings', {
    method: 'PATCH',
    body: JSON.stringify({ backupReminderDays: 14 }),
  });
  const history = await readStaticDemoAudit(
    new URLSearchParams('action=BROWSER_LOCAL_CHANGE'),
    'AUDITOR',
  );
  expect(history.auditEvents).toHaveLength(1);
  expect(history.auditEvents[0]).toMatchObject({
    entityType: 'INCOME',
    entityId: 'demo-platform-1',
  });
});
