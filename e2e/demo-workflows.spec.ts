import { expect, test, type Page } from '@playwright/test';

async function mockImmutableDemo(
  page: Page,
  unsafeRequests: string[],
  reads: string[] = [],
) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    reads.push(path);
    unsafeRequests.push(`${request.method()} ${request.url()}`);
    await route.abort();
  });
}

test('demo accountant reviews records, previews evidence and reloads browser-only comments', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  await mockImmutableDemo(page, apiRequests);
  await page.goto('/demo');
  await page
    .getByRole('button', { name: 'Continue as Demo Accountant' })
    .click();
  await page.getByRole('link', { name: 'Open DoorDash' }).click();
  const base = '/demo/businesses/business-demo-activity-delivery';
  await page.goto(`${base}/transactions`);
  const row = page
    .locator('tr')
    .filter({ has: page.locator(`a[href="${base}/expenses/demo-fuel-1"]`) });
  await row.getByRole('button', { name: 'Review and comments' }).click();
  await row.getByLabel('Add comment').fill('Browser-only accountant review');
  await row.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(row.getByText('Browser-only accountant review')).toBeVisible();
  await row.getByRole('combobox').selectOption('MISSING_INFORMATION');
  await row.getByRole('button', { name: 'Update status' }).click();
  await expect(row.locator('.status-badge')).toHaveText(/missing information/i);
  await page.reload();
  await row.getByRole('button', { name: 'Review and comments' }).click();
  await expect(row.getByText('Browser-only accountant review')).toBeVisible();
  await page.goto(`${base}/mileage/demo-session-1`);
  await expect(
    page.getByRole('heading', { name: /KORU24.*88 km/ }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit session' })).toHaveCount(0);
  await page.goto(`${base}/documents`);
  await page
    .getByRole('button', { name: 'Preview fuel-fictional-demo.pdf' })
    .click();
  await expect(
    page.getByTitle('Preview of fuel-fictional-demo.pdf'),
  ).toHaveAttribute(
    'src',
    '/demo-evidence/2026-11-platforms-v1/fuel-fictional-demo.pdf',
  );
  expect(apiRequests).toEqual([]);
});

test('demo edits are browser-local, persistent, isolated, and resettable', async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const firstUnsafe: string[] = [];
  await mockImmutableDemo(firstPage, firstUnsafe);

  await firstPage.goto('/demo');
  await expect(
    firstPage.getByRole('button', { name: 'Continue as Demo Owner' }),
  ).toBeVisible();
  await firstPage.evaluate(`(async () => {
    await new Promise((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('business-records-static-demo-2026-11-platforms-v1');
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('business-records-static-demo-2026-11-platforms-v1', 1);
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
      const request = indexedDB.open('business-records-static-demo-2026-11-platforms-v1', 2);
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
  await secondPage.goto('/demo');
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
      const request = indexedDB.open('business-records-static-demo-2026-11-platforms-v1', 2);
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
    await page.goto('/demo');
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
    const base = '/demo/businesses/business-demo-activity-delivery';
    await page.goto(`${base}/expenses`);
    await page.locator(`a[href="${base}/expenses/demo-fuel-1"]`).click();
    await expect(
      page.getByRole('heading', { name: 'Kauri Fuel Point' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit expense' })).toHaveCount(
      0,
    );
    await expect(page.getByLabel('Choose existing photo or PDF')).toHaveCount(
      0,
    );

    await page.goto(`${base}/transactions`);
    await page.getByLabel('Search').fill('DoorDash');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page
      .locator('tr')
      .filter({ has: page.locator(`a[href="${base}/income/demo-platform-1"]`) })
      .getByRole('button', { name: 'View comments' })
      .click();
    await expect(
      page.getByText('Deposit agrees to the weekly statement.'),
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
    await page.goto('/demo/settings/account');
    await expect(page).toHaveURL(/\/demo\/businesses$/);
    await page.reload();
    await expect(page.getByLabel('Auditor access')).toContainText(
      'Demo Auditor',
    );
    await page.evaluate("window.dispatchEvent(new Event('focus'))");
    const rejected = await page.evaluate<string[]>(`(async () => {
      const { staticDemoRequest } = await import('/src/features/demo/staticDemoApi.ts');
      const results = [];
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        try { await staticDemoRequest('/api/comments', { method, body: '{}' }, 'AUDITOR'); results.push('allowed'); }
        catch (error) { results.push(error.status ? String(error.status) : String(error.message)); }
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
