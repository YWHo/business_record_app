import { expect, test, type Page } from '@playwright/test';

const dashboard = {
  period: {
    taxYear: '2027',
    from: '2026-04-01',
    to: '2027-03-31',
    activityId: null,
  },
  financialTotals: [],
  spending: [],
  outstandingInvoices: [],
  review: {
    totalRecords: 0,
    unreviewedCount: 0,
    missingInformationCount: 0,
    readyForReviewCount: 0,
  },
  attention: {
    missingReceiptCount: 0,
    itemsToReviewCount: 0,
    outstandingInvoiceCount: 0,
  },
  recentTransactions: [],
  platformActivities: [],
};

const inspectionExpense = {
  id: 'demo-inspection-expense',
  businessId: 'business-demo-activity-delivery',
  legalEntityId: 'business-entity-primary',
  expenseType: 'GENERAL',
  expenseCategoryId: 'demo-office-category',
  categoryName: 'Office expenses',
  merchantName: 'Fictional office supplier',
  purchaseDatetime: '2026-09-08T00:00:00.000Z',
  totalAmountMinor: 13900,
  currency: 'NZD',
  description: 'Synthetic supporting record',
  status: 'READY_FOR_REVIEW',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};

function inspectionPayload(path: string) {
  if (path.endsWith('/expenses/demo-inspection-expense')) {
    return { expense: inspectionExpense };
  }
  if (path.endsWith('/expenses')) {
    return { expenses: [inspectionExpense] };
  }
  if (path.endsWith('/transactions')) {
    return {
      transactions: [
        {
          ...inspectionExpense,
          recordType: 'EXPENSE',
          subtype: 'GENERAL',
          transactionDate: inspectionExpense.purchaseDatetime,
          counterparty: inspectionExpense.merchantName,
          attachmentCount: 0,
        },
      ],
      summary: {
        resultCount: 1,
        missingAttachmentCount: 1,
        unreviewedCount: 1,
      },
      page: { number: 1, size: 50, hasNext: false },
    };
  }
  if (path.endsWith('/income')) {
    return { incomeRecords: [] };
  }
  if (path.endsWith('/documents')) {
    return { documents: [] };
  }
  if (path === '/api/attachments') {
    return { attachments: [] };
  }
  if (path === '/api/comments') {
    return {
      comments: [
        {
          id: 'existing-review',
          message: 'Evidence checked by the demo accountant.',
          authorEmail: 'accountant@demo.invalid',
          authorRole: 'ACCOUNTANT',
          createdAt: '2026-09-09T00:00:00Z',
        },
      ],
    };
  }
  if (path === '/api/reports/summary') {
    return {
      rows: [
        {
          family: 'EXPENSE',
          subtype: 'GENERAL',
          currency: 'NZD',
          record_count: 1,
          recorded_total_minor: 13900,
        },
      ],
      note: 'Source totals, not accounting profit.',
    };
  }
  if (path === '/api/audit-log') {
    return { auditEvents: [], page: { number: 1, hasNext: false } };
  }
  return {};
}

async function mockImmutableDemo(
  page: Page,
  unsafeRequests: string[],
  reads: string[] = [],
) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) {
      unsafeRequests.push(`${request.method()} ${request.url()}`);
    }
    const path = new URL(request.url()).pathname;
    reads.push(path);
    const payload =
      path === '/api/auth/config'
        ? {
            environment: 'demo',
            localHelper: false,
            demoHelper: true,
            turnstileRequired: false,
            turnstileSiteKey: null,
          }
        : path.endsWith('/dashboard')
          ? dashboard
          : path === '/api/businesses'
            ? {
                businesses: [
                  {
                    id: 'business-demo-activity-delivery',
                    name: 'DoorDash',
                    description: 'Food delivery',
                    businessType: 'PLATFORM_SERVICES',
                    defaultCurrency: 'NZD',
                    status: 'ACTIVE',
                    legacyBusinessActivityId: 'demo-activity-delivery',
                    currentLegalEntity: {
                      id: 'business-entity-primary',
                      entityType: 'SOLE_TRADER',
                      legalName: 'Brian Ho',
                      tradingName: null,
                      status: 'ACTIVE',
                      attributionReviewRequired: false,
                    },
                    recordCount: 128,
                    lastRecordUpdatedAt: '2026-09-08T00:00:00.000Z',
                  },
                  {
                    id: 'business-demo-activity-rideshare',
                    name: 'Uber',
                    description: 'Uber rides and Uber Eats deliveries',
                    businessType: 'PLATFORM_SERVICES',
                    defaultCurrency: 'NZD',
                    status: 'ACTIVE',
                    legacyBusinessActivityId: 'demo-activity-rideshare',
                    currentLegalEntity: {
                      id: 'demo-entity-taxi-limited',
                      entityType: 'LIMITED_COMPANY',
                      legalName: 'Taxi Limited',
                      tradingName: null,
                      status: 'ACTIVE',
                      attributionReviewRequired: false,
                    },
                    recordCount: 96,
                    lastRecordUpdatedAt: '2026-09-09T00:00:00.000Z',
                  },
                ],
              }
            : path === '/api/business-activities'
              ? { activities: [] }
              : path === '/api/vehicles'
                ? { vehicles: [] }
                : path === '/api/expense-categories'
                  ? { categories: [] }
                  : path === '/api/clients'
                    ? { clients: [] }
                    : inspectionPayload(path);
    await route.fulfill({ json: payload });
  });
}

test('demo edits are browser-local, persistent, isolated, and resettable', async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const firstUnsafe: string[] = [];
  await mockImmutableDemo(firstPage, firstUnsafe);

  await firstPage.goto('/login');
  await expect(
    firstPage.getByRole('button', { name: 'Continue as Demo Owner' }),
  ).toBeVisible();
  await firstPage.evaluate(`(async () => {
    await new Promise((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('business-records-public-demo');
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('business-records-public-demo', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('overlay');
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('overlay', 'readwrite');
        transaction.objectStore('overlay').put(
          [
            {
              id: 'legacy-client',
              method: 'POST',
              path: '/api/clients',
              body: { name: 'Migrated browser client', active: true },
              createdAt: '2026-09-01T00:00:00.000Z',
            },
          ],
          'operations',
        );
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  })()`);
  await firstPage
    .getByRole('button', { name: 'Continue as Demo Owner' })
    .click();
  await expect(
    firstPage.getByRole('link', { name: 'Open Uber', exact: true }),
  ).toBeVisible();
  await expect(
    firstPage.getByRole('article', { name: 'Uber', exact: true }),
  ).toContainText('Uber rides and Uber Eats deliveries');
  await expect(
    firstPage.getByRole('link', { name: 'Open Uber Eats', exact: true }),
  ).toHaveCount(0);
  await firstPage.getByRole('link', { name: 'Open DoorDash' }).click();
  await firstPage.setViewportSize({ width: 320, height: 720 });
  await expect(
    firstPage.getByRole('button', { name: 'Reset demo data' }),
  ).toBeVisible();
  expect(
    await firstPage.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);
  await firstPage.setViewportSize({ width: 1280, height: 720 });
  await firstPage.getByRole('link', { name: 'Business settings' }).click();
  await firstPage.getByRole('link', { name: 'Clients', exact: true }).click();
  const clients = firstPage.getByRole('region', {
    name: 'Clients',
    exact: true,
  });
  await expect(
    clients.getByRole('heading', { name: 'Migrated browser client' }),
  ).toBeVisible();
  await clients.getByLabel('Name').fill('Only in this browser');
  await clients.getByRole('button', { name: 'Add client' }).click();
  await expect(
    clients.getByRole('heading', { name: 'Only in this browser' }),
  ).toBeVisible();
  const stored = await firstPage.evaluate<{
    version: number;
    stores: string[];
    operations: unknown[];
    periods: unknown[];
  }>(`(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('business-records-public-demo', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (storeName) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const result = {
      version: database.version,
      stores: [...database.objectStoreNames],
      operations: await read('operations'),
      periods: await read('business-entity-periods'),
    };
    database.close();
    return result;
  })()`);
  expect(stored.version).toBe(2);
  expect(stored.stores).toEqual(
    expect.arrayContaining([
      'operations',
      'business-entity-periods',
      'metadata',
    ]),
  );
  expect(stored.operations).toHaveLength(2);
  expect(stored.periods).toHaveLength(5);
  expect(firstUnsafe).toEqual([]);

  await firstPage.reload();
  await expect(
    firstPage.getByRole('heading', { name: 'Only in this browser' }),
  ).toBeVisible();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  const secondUnsafe: string[] = [];
  await mockImmutableDemo(secondPage, secondUnsafe);
  await secondPage.goto('/login');
  await expect(
    secondPage.getByRole('button', { name: 'Continue as Demo Owner' }),
  ).toBeVisible();
  await secondPage
    .getByRole('button', { name: 'Continue as Demo Owner' })
    .click();
  await secondPage.getByRole('link', { name: 'Open DoorDash' }).click();
  await secondPage.getByRole('link', { name: 'Business settings' }).click();
  await secondPage.getByRole('link', { name: 'Clients', exact: true }).click();
  await expect(
    secondPage.getByRole('heading', { name: 'Only in this browser' }),
  ).toHaveCount(0);
  expect(secondUnsafe).toEqual([]);

  await firstPage.getByRole('button', { name: 'Reset demo data' }).click();
  await expect(
    firstPage.getByRole('heading', { name: 'Only in this browser' }),
  ).toHaveCount(0);
  await expect(
    firstPage.getByRole('heading', { name: 'Migrated browser client' }),
  ).toHaveCount(0);
  const resetState = await firstPage.evaluate<{
    operations: number;
    periods: number;
  }>(`(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('business-records-public-demo', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = (storeName) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const result = {
      operations: await count('operations'),
      periods: await count('business-entity-periods'),
    };
    database.close();
    return result;
  })()`);
  expect(resetState).toEqual({ operations: 0, periods: 5 });

  await secondContext.close();
  await firstContext.close();
});

test('demo auditor inspects records without sessions or browser-local mutations across screen sizes', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const unsafeRequests: string[] = [];
  const reads: string[] = [];
  await mockImmutableDemo(page, unsafeRequests, reads);
  try {
    await page.goto('/login');
    await page
      .getByRole('button', { name: 'Continue as Demo Auditor' })
      .click();
    await expect(page.getByLabel('Auditor access')).toContainText(
      'Demo Auditor',
    );
    await expect(page.getByLabel('Auditor access')).toContainText(
      'no access expiry',
    );
    await expect(
      page.getByRole('button', { name: 'Reset demo data' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Accountant view', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Open DoorDash' }).click();
    const base = '/app/businesses/business-demo-activity-delivery';
    await page.goto(`${base}/expenses`);
    await page.getByRole('link', { name: 'Fictional office supplier' }).click();
    await expect(
      page.getByRole('heading', { name: 'Fictional office supplier' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit expense' })).toHaveCount(
      0,
    );
    await expect(page.getByLabel('Choose existing photo or PDF')).toHaveCount(
      0,
    );

    await page.goto(`${base}/transactions`);
    await page.getByRole('button', { name: 'View comments' }).click();
    await expect(
      page.getByText('Evidence checked by the demo accountant.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Update status' }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Add comment')).toHaveCount(0);

    for (const [suffix, heading] of [
      ['income', 'Income'],
      ['documents', 'Documents'],
      ['reports', 'Reports'],
      ['audit-trail', 'Audit trail'],
    ]) {
      await page.goto(`${base}/${suffix}`);
      await expect(
        page.getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: /download|export/i }),
      ).toHaveCount(0);
    }

    await page.goto(`${base}/expenses/new`);
    await expect(page).toHaveURL(new RegExp(`${base}/expenses$`));
    await page.goto('/app/settings/account');
    await expect(page).toHaveURL(/\/app\/businesses$/);
    await page.reload();
    await expect(page.getByLabel('Auditor access')).toContainText(
      'Demo Auditor',
    );
    await page.evaluate("window.dispatchEvent(new Event('focus'))");
    const rejected = await page.evaluate<string[]>(`(async () => {
      const { apiRequest } = await import('/src/features/auth/AuthContext.tsx');
      const results = [];
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        try { await apiRequest('/api/comments', { method, body: '{}' }); results.push('allowed'); }
        catch (error) { results.push(String(error.status)); }
      }
      return results;
    })()`);
    expect(rejected).toEqual(['403', '403', '403', '403']);
    const operations = await page.evaluate<number>(`(async () => {
      const { demoStorageSnapshot } = await import('/src/features/demo/demoStore.ts');
      return (await demoStorageSnapshot()).operations.length;
    })()`);
    expect(operations).toBe(0);

    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByLabel('Auditor access')).toBeVisible();
      expect(
        await page.evaluate<boolean>(
          'document.documentElement.scrollWidth <= window.innerWidth',
        ),
      ).toBe(true);
    }
    await page.locator('summary[aria-label="Open account menu"]').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: 'Continue as Demo Owner' }).click();
    await expect(
      page.getByRole('button', { name: 'Reset demo data' }),
    ).toBeVisible();
    expect(unsafeRequests).toEqual([]);
    expect(reads).not.toContain('/api/auth/me');
    expect(reads).not.toContain('/api/exports/status');
    expect(await context.cookies()).toEqual([]);
  } finally {
    await context.close();
  }
});
