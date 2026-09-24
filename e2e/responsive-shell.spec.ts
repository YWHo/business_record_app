import { expect, test } from '@playwright/test';

test('business context remains usable across phone, tablet, and desktop layouts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue as local owner' }).click();
  await page.getByRole('link', { name: 'IT Contracting' }).click();

  await expect(page.getByLabel('Current business')).toHaveValue(
    'business-activity-contracting',
  );
  await expect(page.locator('.shell-sidebar')).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation' }),
  ).toBeVisible();
  expect(
    await page.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator('.shell-sidebar')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation' }),
  ).toBeHidden();
  await expect(page.getByLabel('Current business')).toBeVisible();
  expect(
    await page.evaluate<boolean>(
      'document.documentElement.scrollWidth <= window.innerWidth',
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByLabel('Current business')
    .selectOption('business-activity-delivery');
  await expect(page).toHaveURL(
    /\/app\/businesses\/business-activity-delivery$/,
  );
  await expect(page.getByLabel('Current business')).toHaveValue(
    'business-activity-delivery',
  );
  await expect(
    page.getByRole('navigation', { name: 'Delivery Platform navigation' }),
  ).toBeVisible();
});
