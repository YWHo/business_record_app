import { expect, test } from '@playwright/test';

test('leaving a demo accountant clears its role and allows real local owner sign-in', async ({
  page,
}) => {
  await page.goto('/demo');
  await page
    .getByRole('button', { name: 'Continue as Demo Accountant' })
    .click();
  await expect(page).toHaveURL(/\/demo\/businesses$/);
  await page.getByRole('link', { name: 'Leave demo' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('business-records-demo-role'),
    ),
  ).toBeNull();
  await page.getByRole('button', { name: 'Continue as local owner' }).click();
  await expect(page).toHaveURL(/\/app\/businesses$/);
  const response = await page.request.get('/api/auth/me');
  expect(response.status()).toBe(200);
  const { user } = (await response.json()) as { user: { role: string } };
  expect(user.role).toBe('OWNER');
  await page.getByRole('link', { name: 'Explore the public demo' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(
    page.getByRole('button', { name: 'Continue as Demo Accountant' }),
  ).toBeVisible();
  // Visiting demo must retain the real private cookie; remove it explicitly.
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
});
