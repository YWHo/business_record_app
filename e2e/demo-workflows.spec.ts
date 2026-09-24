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
  platformActivities: [],
};

async function mockImmutableDemo(page: Page, unsafeRequests: string[]) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method()))
      unsafeRequests.push(`${request.method()} ${request.url()}`);
    const path = new URL(request.url()).pathname;
    const payload =
      path === '/api/auth/config'
        ? {
            environment: 'demo',
            localHelper: false,
            demoHelper: true,
            turnstileRequired: false,
            turnstileSiteKey: null,
          }
        : path === '/api/dashboard'
          ? dashboard
          : path === '/api/businesses'
            ? {
                businesses: [
                  {
                    id: 'business-demo-activity-delivery',
                    name: 'Uber Eats',
                    description: 'Food delivery',
                    businessType: 'PLATFORM_SERVICES',
                    defaultCurrency: 'NZD',
                    status: 'ACTIVE',
                    legacyBusinessActivityId: 'demo-activity-delivery',
                  },
                  {
                    id: 'business-demo-activity-rideshare',
                    name: 'Uber Ride',
                    description: 'Ride-hailing',
                    businessType: 'PLATFORM_SERVICES',
                    defaultCurrency: 'NZD',
                    status: 'ACTIVE',
                    legacyBusinessActivityId: 'demo-activity-rideshare',
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
                    : {};
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
  await firstPage.getByRole('link', { name: 'Uber Eats' }).click();
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
  await secondPage.getByRole('link', { name: 'Uber Eats' }).click();
  await secondPage.getByRole('link', { name: 'Business settings' }).click();
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
