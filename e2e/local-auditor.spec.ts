import { expect, test } from '@playwright/test';

test('local auditor entry opens its real scope immediately and retains server read-only enforcement', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as local auditor' }).click();
  const notice = page.getByLabel('Auditor access');
  await expect(notice).toContainText('IT Contracting');
  await expect(notice).toContainText('Access expires');
  await expect(notice).not.toContainText('Scope details are unavailable');
  await expect(
    page.getByRole('link', { name: 'Open IT Contracting' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: /Open (Delivery Platform|Ride-Hailing Platform|SaaS Business)/,
    }),
  ).toHaveCount(0);
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  const { user } = (await me.json()) as {
    user: { email: string; role: string; access: { scopes: unknown[] } };
  };
  expect(user.email).toBe('auditor@local.test');
  expect(user.role).toBe('AUDITOR');
  expect(user.access.scopes).toEqual([
    {
      scopeType: 'BUSINESS',
      label: 'IT Contracting',
      dateFrom: null,
      dateTo: null,
    },
  ]);
  await page.getByRole('link', { name: 'Open IT Contracting' }).click();
  await page.goto('/app/businesses/business-activity-contracting/expenses/new');
  await expect(page).toHaveURL(/\/business-activity-contracting\/expenses$/);
  await expect(page.getByRole('link', { name: /Add expense/ })).toHaveCount(0);
  expect(
    (
      await page.request.get(
        '/api/businesses/business-activity-delivery/expenses',
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post('/api/comments', {
        data: { recordType: 'EXPENSE', recordId: 'guessed', message: 'Denied' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.get('/api/reports/export?scope=FULL')).status(),
  ).toBe(403);
  await page.reload();
  await expect(page.getByLabel('Auditor access')).toContainText(
    'IT Contracting',
  );
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === 'br_session',
    ),
  ).toBe(true);
});
