import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { staticDemoRequest } from './staticDemoApi';
import { demoStorageSnapshot, resetDemoData } from './demoStore';

const base = '/api/businesses/business-demo-activity-delivery';
beforeEach(async () => {
  await resetDemoData();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network unavailable');
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it.each([
  ['/api/businesses', 'businesses'],
  [base, 'business'],
  [`${base}/dashboard?taxYear=2027`, 'financialTotals'],
  [`${base}/expenses`, 'expenses'],
  [`${base}/expenses/demo-fuel-1`, 'expense'],
  [`${base}/income`, 'incomeRecords'],
  [`${base}/income/demo-platform-1`, 'incomeRecord'],
  [`${base}/work-sessions`, 'summary'],
  [`${base}/work-sessions/demo-session-1`, 'session'],
  [`${base}/documents`, 'documents'],
  [`${base}/transactions`, 'transactions'],
  [`${base}/receipts`, 'transactions'],
  ['/api/transactions', 'transactions'],
  ['/api/receipts', 'transactions'],
  ['/api/fuel-records', 'fuelRecords'],
  ['/api/reports/summary?scope=FULL', 'rows'],
  ['/api/audit-log', 'auditEvents'],
  ['/api/comments?recordType=INCOME&recordId=demo-platform-1', 'comments'],
  ['/api/attachments?recordType=EXPENSE&recordId=demo-fuel-1', 'attachments'],
  ['/api/business-activities', 'activities'],
  ['/api/vehicles', 'vehicles'],
  ['/api/clients', 'clients'],
  ['/api/expense-categories', 'categories'],
  ['/api/legal-entities', 'legalEntities'],
  ['/api/exports/status', 'exports'],
  ['/api/retention-settings', 'retentionSettings'],
  ['/api/trash', 'trash'],
  ['/api/saved-filters?filterType=AUDIT', 'savedFilters'],
])('dispatches %s without backend access', async (path, property) => {
  expect(await staticDemoRequest(path, undefined, 'OWNER')).toHaveProperty(
    property,
  );
});

it.each([
  '/api/auth/me',
  '/api/auth/login',
  '/api/users',
  '/api/invitations',
  '/api/auditor-access',
  '/api/exports/archive',
  '/api/attachments/file?id=private',
  '/api/unknown',
  'https://private.invalid/api/businesses',
  '//private.invalid/api/businesses',
])('fails closed for %s', async (path) => {
  await expect(
    staticDemoRequest(path, undefined, 'OWNER'),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    staticDemoRequest(path, { method: 'POST', body: '{}' }, 'OWNER'),
  ).rejects.toMatchObject({ status: 403 });
  expect((await demoStorageSnapshot()).operations).toEqual([]);
});

it('returns created and edited records in the same envelopes as the application forms', async () => {
  const created = (await staticDemoRequest(
    `${base}/expenses`,
    {
      method: 'POST',
      body: JSON.stringify({
        expenseType: 'GENERAL',
        merchantName: 'Browser-only merchant',
        purchaseDatetime: '2026-11-01T00:00:00Z',
        totalAmount: '12.34',
        currency: 'NZD',
      }),
    },
    'OWNER',
  )) as { expense: { id: string; totalAmountMinor: number } };
  expect(created.expense.totalAmountMinor).toBe(1234);
  const edited = await staticDemoRequest(
    `${base}/expenses/${created.expense.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ merchantName: 'Edited locally' }),
    },
    'OWNER',
  );
  expect(edited).toMatchObject({
    expense: {
      id: created.expense.id,
      merchantName: 'Edited locally',
      totalAmountMinor: 1234,
    },
  });
  expect(
    await staticDemoRequest(
      `${base}/expenses/${created.expense.id}`,
      undefined,
      'AUDITOR',
    ),
  ).toMatchObject({ expense: { merchantName: 'Edited locally' } });
});

it('allows accounting comments but rejects accountant source edits before writing storage', async () => {
  await staticDemoRequest(
    '/api/comments',
    {
      method: 'POST',
      body: JSON.stringify({
        businessId: 'business-demo-activity-delivery',
        recordId: 'demo-platform-1',
        recordType: 'INCOME',
        message: 'Browser review',
      }),
    },
    'ACCOUNTANT',
  );
  const comments = (await staticDemoRequest(
    '/api/comments?recordId=demo-platform-1&recordType=INCOME',
    undefined,
    'ACCOUNTANT',
  )) as { comments: { message: string }[] };
  expect(
    comments.comments.some((row) => row.message === 'Browser review'),
  ).toBe(true);
  const before = await demoStorageSnapshot();
  await expect(
    staticDemoRequest(
      `${base}/expenses/demo-fuel-1`,
      { method: 'PATCH', body: '{}' },
      'ACCOUNTANT',
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect((await demoStorageSnapshot()).operations).toEqual(before.operations);
});

it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
  'rejects auditor %s before changing storage',
  async (method) => {
    await expect(
      staticDemoRequest('/api/comments', { method, body: '{}' }, 'AUDITOR'),
    ).rejects.toMatchObject({ status: 403 });
    expect((await demoStorageSnapshot()).operations).toEqual([]);
  },
);

it('requires a selected role and denies unsupported auditor settings reads', async () => {
  await expect(
    staticDemoRequest('/api/businesses', undefined, null),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    staticDemoRequest('/api/retention-settings', undefined, 'AUDITOR'),
  ).rejects.toMatchObject({ status: 403 });
});

it.each(['/api/income-reconciliations', '/api/insurance-allocations'])(
  'keeps %s accountant-only',
  async (path) => {
    await expect(
      staticDemoRequest(path, { method: 'POST', body: '{}' }, 'OWNER'),
    ).rejects.toMatchObject({ status: 403 });
    expect((await demoStorageSnapshot()).operations).toEqual([]);
  },
);
