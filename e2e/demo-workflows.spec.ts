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
  await firstPage
    .getByRole('button', { name: 'Continue as Demo Owner' })
    .click();
  await expect(
    firstPage.getByRole('button', { name: 'Reset demo data' }),
  ).toBeVisible();
  await firstPage.getByRole('link', { name: 'Setup' }).click();
  const clients = firstPage.getByRole('region', {
    name: 'Clients',
    exact: true,
  });
  await clients.getByLabel('Name').fill('Only in this browser');
  await clients.getByRole('button', { name: 'Add client' }).click();
  await expect(
    clients.getByRole('heading', { name: 'Only in this browser' }),
  ).toBeVisible();
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
  await secondPage.getByRole('link', { name: 'Setup' }).click();
  await expect(
    secondPage.getByRole('heading', { name: 'Only in this browser' }),
  ).toHaveCount(0);
  expect(secondUnsafe).toEqual([]);

  await firstPage.getByRole('button', { name: 'Reset demo data' }).click();
  await expect(
    firstPage.getByRole('heading', { name: 'Only in this browser' }),
  ).toHaveCount(0);

  await secondContext.close();
  await firstContext.close();
});
